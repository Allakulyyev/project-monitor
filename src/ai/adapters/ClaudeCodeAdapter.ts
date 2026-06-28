import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AiStatus, AiTool } from '../../core/types';
import { AiStatusProvider } from '../AiStatusProvider';

// How often we check activity (ms).
const POLL_MS = 1000;
// If the session file hasn't changed for longer than this, Claude is considered idle.
const IDLE_MS = 5 * 60 * 1000;
// How many bytes from the end of the file we read to find the last message.
const TAIL_BYTES = 256 * 1024;
// If the content can't be parsed but the file changed within this window, treat as working.
const RECENT_MS = 8000;
// How often to re-scan for the sessions folder while it hasn't been found yet (ms).
const RESCAN_MS = 10000;

// A single Claude Code transcript line (we only care about type, cwd and stop reason).
interface TranscriptLine {
  type?: string;
  cwd?: string;
  message?: { stop_reason?: string | null };
}

// Normalizes a path for comparison (case and slash direction don't matter).
function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

// Claude Code adapter: the status is derived from the last record of the project's session file.
// The sessions folder is found by the cwd field inside the records (exact match with the
// window's folder), so encoding/drive-case differences don't get in the way.
//   - last assistant message with stop_reason 'end_turn' => Claude finished;
//   - 'tool_use' / streaming / user input => Claude is working;
//   - no recent session activity, or none at all => idle.
export class ClaudeCodeAdapter implements AiStatusProvider {
  readonly tool: AiTool = 'claude-code';
  private status: AiStatus = 'idle';
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly base: string;
  // Normalized project path of this window (or null if no folder is open).
  private readonly target: string | null;
  // Encoded folder name — a fast path before the full scan.
  private readonly encoded: string | null;
  // Cached sessions folder and the time of the last full scan.
  private cachedDir: string | null = null;
  private lastScan = 0;
  // Cache of the last parsed file/mtime so we only re-read when the file actually changes.
  private lastFile: string | undefined;
  private lastMtime = 0;
  private lastContentStatus: AiStatus | null = null;
  private readonly _onStatusChange = new vscode.EventEmitter<AiStatus>();
  readonly onStatusChange = this._onStatusChange.event;

  constructor(folderPath: string | null) {
    this.base = path.join(os.homedir(), '.claude', 'projects');
    this.target = folderPath ? normalizePath(folderPath) : null;
    this.encoded = folderPath ? folderPath.replace(/[^A-Za-z0-9]/g, '-') : null;
  }

  // Starts the periodic status check.
  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  // Returns the current status.
  getStatus(): AiStatus {
    return this.status;
  }

  // Computes the fresh status and reports it if it changed.
  private poll(): void {
    const next = this.computeStatus();
    if (next !== this.status) {
      this.status = next;
      this._onStatusChange.fire(next);
    }
  }

  // Determines the status: finds the project folder, takes its freshest session and inspects its end.
  private computeStatus(): AiStatus {
    const dir = this.resolveDir();
    if (!dir) {
      return 'idle';
    }
    const newest = this.newestJsonl(dir);
    if (!newest) {
      return 'idle';
    }
    const age = Date.now() - newest.mtime;
    // The session has been quiet for a long time — idle.
    if (age > IDLE_MS) {
      return 'idle';
    }

    // Re-read the content only when the file actually changed (faster and more stable).
    if (newest.file !== this.lastFile || newest.mtime !== this.lastMtime) {
      this.lastFile = newest.file;
      this.lastMtime = newest.mtime;
      this.lastContentStatus = this.statusFromObjs(this.readTail(newest.file));
    }

    const status = this.lastContentStatus;
    // If the tail had no readable message (e.g. very large records), fall back to recency.
    if (status === null) {
      return age < RECENT_MS ? 'thinking' : 'done';
    }
    return status;
  }

  // Returns the project's sessions folder (cached; rare full scan when not found).
  private resolveDir(): string | null {
    if (this.cachedDir && fs.existsSync(this.cachedDir)) {
      return this.cachedDir;
    }
    const now = Date.now();
    // If the folder hasn't been found yet — don't scan the disk more often than RESCAN_MS.
    if (this.cachedDir === null && now - this.lastScan < RESCAN_MS) {
      return null;
    }
    this.lastScan = now;
    this.cachedDir = this.findDir();
    return this.cachedDir;
  }

  // Finds the folder whose freshest session has a cwd matching this window's folder.
  private findDir(): string | null {
    if (!this.target) {
      return null;
    }
    // Fast path: the encoded folder name.
    if (this.encoded) {
      const direct = path.join(this.base, this.encoded);
      if (this.dirMatches(direct)) {
        return direct;
      }
    }
    // Reliable path: scan all folders and check the cwd of the freshest session.
    try {
      for (const name of fs.readdirSync(this.base)) {
        const dir = path.join(this.base, name);
        if (this.dirMatches(dir)) {
          return dir;
        }
      }
    } catch {
      // ~/.claude/projects doesn't exist yet — that's fine.
    }
    return null;
  }

  // Checks that the cwd of the folder's freshest session matches this window's folder.
  private dirMatches(dir: string): boolean {
    const newest = this.newestJsonl(dir);
    if (!newest) {
      return false;
    }
    const cwd = this.cwdFromObjs(this.readTail(newest.file));
    return cwd !== null && normalizePath(cwd) === this.target;
  }

  // Finds the freshest .jsonl file in a folder and its modification time.
  private newestJsonl(dir: string): { file: string; mtime: number } | null {
    let file: string | undefined;
    let mtime = 0;
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.jsonl')) {
          continue;
        }
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.mtimeMs > mtime) {
          mtime = st.mtimeMs;
          file = full;
        }
      }
    } catch {
      return null;
    }
    return file ? { file, mtime } : null;
  }

  // Reads the end of the session file and parses lines into objects (in order).
  private readTail(file: string): TranscriptLine[] {
    try {
      const fd = fs.openSync(file, 'r');
      const size = fs.fstatSync(fd).size;
      const readSize = Math.min(TAIL_BYTES, size);
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, size - readSize);
      fs.closeSync(fd);
      const out: TranscriptLine[] = [];
      for (const line of buf.toString('utf8').split('\n')) {
        const t = line.trim();
        if (!t) {
          continue;
        }
        try {
          out.push(JSON.parse(t) as TranscriptLine);
        } catch {
          // incomplete/broken line — skip
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  // Takes the cwd from the most recent record that has one.
  private cwdFromObjs(objs: TranscriptLine[]): string | null {
    for (let i = objs.length - 1; i >= 0; i--) {
      const cwd = objs[i].cwd;
      if (cwd) {
        return cwd;
      }
    }
    return null;
  }

  // Decides from the last message whether Claude is working or finished (null = couldn't tell).
  private statusFromObjs(objs: TranscriptLine[]): AiStatus | null {
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type === 'assistant') {
        const stop = o.message?.stop_reason;
        // 'tool_use' or still streaming => working; otherwise (end_turn etc.) => finished.
        return stop === 'tool_use' || !stop ? 'thinking' : 'done';
      }
      if (o.type === 'user') {
        return 'thinking'; // input/result just arrived — Claude is about to reply, working
      }
    }
    return null; // no message found in the tail
  }

  // Stops the timer and disposes the event.
  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this._onStatusChange.dispose();
  }
}
