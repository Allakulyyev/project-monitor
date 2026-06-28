import * as vscode from 'vscode';

// Folder where each window stores its own state file (<id>.json).
// Shared across all windows of a single extension installation (globalStorage).
export function getStateDirUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, 'windows');
}
