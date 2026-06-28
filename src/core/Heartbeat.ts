import * as vscode from 'vscode';
import { WindowRegistry } from './WindowRegistry';

// How often the current window's heartbeat is updated (ms).
const HEARTBEAT_MS = 2500;

// Current window's heartbeat: periodically refreshes the timestamp and focus
// so other windows see it as "alive" and know whether it's active.
export class Heartbeat implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly registry: WindowRegistry,
    private readonly intervalMs = HEARTBEAT_MS
  ) {}

  // Starts the periodic heartbeat (and ticks once immediately).
  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  // One tick: writes a fresh timestamp and the window's current focus.
  private async tick(): Promise<void> {
    await this.registry.updateSelf({
      lastHeartbeat: Date.now(),
      focused: vscode.window.state.focused
    });
  }

  // Stops the timer.
  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
