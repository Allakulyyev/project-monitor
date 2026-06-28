import * as vscode from 'vscode';

// Simple OutputChannel-based logger for debugging the extension.
export class Logger implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;

  constructor(name = 'Project Monitor') {
    this.channel = vscode.window.createOutputChannel(name);
  }

  // Writes an informational message to the output channel.
  info(message: string): void {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  // Writes an error message (with exception details when available).
  error(message: string, err?: unknown): void {
    const detail =
      err instanceof Error ? `: ${err.message}` : err !== undefined ? `: ${String(err)}` : '';
    this.channel.appendLine(`[ERROR] ${message}${detail}`);
  }

  // Disposes the output channel.
  dispose(): void {
    this.channel.dispose();
  }
}
