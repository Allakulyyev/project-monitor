import * as vscode from 'vscode';
import { WindowInfo } from './types';
import { Logger } from '../utils/logger';

// Per-window state storage: every window owns its own <id>.json file in a shared folder.
// This way windows can't physically overwrite each other (no single-file write races).
// Knows nothing about the UI. Emits onChange when files are created/changed/deleted.
export class SharedStateFile implements vscode.Disposable {
  private readonly dirUri: vscode.Uri;
  private readonly logger: Logger;
  private watcher: vscode.FileSystemWatcher | undefined;
  private readonly _onChange = new vscode.EventEmitter<void>();
  // Fires when any window file changes (including from another window).
  readonly onChange = this._onChange.event;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(dirUri: vscode.Uri, logger: Logger) {
    this.dirUri = dirUri;
    this.logger = logger;
  }

  // Returns the Uri of a given window's state file.
  private fileFor(windowId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.dirUri, `${windowId}.json`);
  }

  // Starts watching the folder and emits onChange (with a small debounce).
  watch(): void {
    const pattern = new vscode.RelativePattern(this.dirUri, '*.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const fire = (): void => this.fireDebounced();
    this.watcher.onDidCreate(fire);
    this.watcher.onDidChange(fire);
    this.watcher.onDidDelete(fire);
  }

  // Debounces the onChange event by 100 ms so the UI isn't hit on every write.
  private fireDebounced(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this._onChange.fire(), 100);
  }

  // Writes a single window's file. Writes to a temp file then renames it,
  // so other windows never read a half-written file.
  async writeWindow(info: WindowInfo): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.dirUri);
      const text = JSON.stringify(info, null, 2);
      const finalUri = this.fileFor(info.id);
      const tmpUri = vscode.Uri.joinPath(this.dirUri, `${info.id}.json.tmp`);
      await vscode.workspace.fs.writeFile(tmpUri, new TextEncoder().encode(text));
      await vscode.workspace.fs.rename(tmpUri, finalUri, { overwrite: true });
    } catch (err) {
      this.logger.error('Failed to write window file', err);
    }
  }

  // Deletes a window's state file (when the window closes).
  async deleteWindow(windowId: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.fileFor(windowId));
    } catch {
      // File is already gone — that's fine.
    }
  }

  // Reads every window's state from the folder. Broken/half-written files are skipped.
  async readAll(): Promise<WindowInfo[]> {
    const result: WindowInfo[] = [];
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(this.dirUri);
    } catch {
      // The folder doesn't exist yet — so there are no windows.
      return result;
    }
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith('.json')) {
        continue;
      }
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.dirUri, name));
        const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes)) as Partial<WindowInfo>;
        if (parsed && typeof parsed.id === 'string' && typeof parsed.lastHeartbeat === 'number') {
          result.push(parsed as WindowInfo);
        }
      } catch {
        // File is broken or being written right now — skip until the next update.
      }
    }
    return result;
  }

  // Disposes the watcher, timer and emitter.
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watcher?.dispose();
    this._onChange.dispose();
  }
}
