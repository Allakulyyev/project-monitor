import { SharedStateFile } from './SharedStateFile';
import { WindowInfo } from './types';

// A window is considered "dead" if its heartbeat is older than this threshold (ms).
const STALE_MS = 10_000;

// High-level layer over the storage: manages the CURRENT window's record
// and returns the list of live windows. The UI works only through this class.
export class WindowRegistry {
  // The current window's state kept in memory: only we write our own file,
  // so changes can be merged locally without reading from disk.
  private current: WindowInfo | undefined;

  constructor(
    private readonly store: SharedStateFile,
    private readonly selfId: string
  ) {}

  // Creates the current window's record and writes its file immediately.
  async registerSelf(info: Omit<WindowInfo, 'id' | 'lastHeartbeat'>): Promise<void> {
    this.current = { id: this.selfId, lastHeartbeat: Date.now(), ...info };
    await this.store.writeWindow(this.current);
  }

  // Updates individual fields of our record (heartbeat, focus, AI status) and rewrites the file.
  async updateSelf(
    patch: Partial<Pick<WindowInfo, 'focused' | 'lastHeartbeat' | 'ai' | 'projectName' | 'folderPath'>>
  ): Promise<void> {
    if (!this.current) {
      return;
    }
    this.current = { ...this.current, ...patch };
    await this.store.writeWindow(this.current);
  }

  // Deletes the current window's file (when the window closes).
  async unregisterSelf(): Promise<void> {
    await this.store.deleteWindow(this.selfId);
  }

  // Returns the list of live windows; dead ones (stale heartbeat) are dropped.
  async getWindows(): Promise<WindowInfo[]> {
    const all = await this.store.readAll();
    const now = Date.now();
    return all.filter((w) => now - w.lastHeartbeat < STALE_MS);
  }

  // The current window id (used by the UI to mark the "this window" record).
  get id(): string {
    return this.selfId;
  }
}
