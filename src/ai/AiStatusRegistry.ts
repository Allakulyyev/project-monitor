import * as vscode from 'vscode';
import { AiState, AiStatus } from '../core/types';
import { AiStatusProvider } from './AiStatusProvider';

// Status priority: the earlier in the list, the more "important" to show.
const PRIORITY: AiStatus[] = ['thinking', 'responding', 'done', 'idle', 'unknown'];

// Registry of AI adapters: starts them and reports the window's overall (most important) status.
export class AiStatusRegistry implements vscode.Disposable {
  private readonly _onChange = new vscode.EventEmitter<AiState>();
  // Fires when the window's overall status changes.
  readonly onChange = this._onChange.event;
  private readonly subs: vscode.Disposable[] = [];

  constructor(private readonly providers: AiStatusProvider[]) {
    // Any adapter change recomputes the overall status and notifies subscribers.
    for (const p of providers) {
      this.subs.push(p.onStatusChange(() => this._onChange.fire(this.getActive())));
    }
  }

  // Starts all adapters.
  start(): void {
    for (const p of this.providers) {
      p.start();
    }
  }

  // Returns the most important status among the window's tools.
  getActive(): AiState {
    let best: AiStatusProvider | undefined;
    let bestRank = PRIORITY.length;
    for (const p of this.providers) {
      const rank = PRIORITY.indexOf(p.getStatus());
      if (rank < bestRank) {
        bestRank = rank;
        best = p;
      }
    }
    if (!best) {
      return { tool: 'none', status: 'idle' };
    }
    return { tool: best.tool, status: best.getStatus() };
  }

  // Stops the adapters and disposes subscriptions.
  dispose(): void {
    for (const s of this.subs) {
      s.dispose();
    }
    for (const p of this.providers) {
      p.dispose();
    }
    this._onChange.dispose();
  }
}
