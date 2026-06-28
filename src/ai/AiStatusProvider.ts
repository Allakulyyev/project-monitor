import * as vscode from 'vscode';
import { AiStatus, AiTool } from '../core/types';

// Common interface for an AI status adapter. Each tool (Claude Code, Codex, …)
// implements it in its own file. Adding a new tool = a new adapter file,
// with no changes to the rest of the code.
export interface AiStatusProvider extends vscode.Disposable {
  // Which tool this adapter tracks.
  readonly tool: AiTool;
  // Starts watching the tool's activity.
  start(): void;
  // Current status of the tool.
  getStatus(): AiStatus;
  // Status-change event.
  readonly onStatusChange: vscode.Event<AiStatus>;
}
