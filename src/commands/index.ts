import * as vscode from 'vscode';
import { WindowsViewProvider } from '../views/WindowsViewProvider';

// Registers all extension commands.
export function registerCommands(
  context: vscode.ExtensionContext,
  provider: WindowsViewProvider
): void {
  context.subscriptions.push(
    // Manually refresh the window list.
    vscode.commands.registerCommand('projectMonitor.refresh', () => void provider.refresh()),
    // Open the chosen window's project (an already-open folder is brought to front by VS Code).
    vscode.commands.registerCommand('projectMonitor.openWindow', (folderPath?: string) =>
      openWindow(folderPath)
    ),
    // Show/focus the monitor panel.
    vscode.commands.registerCommand(
      'projectMonitor.toggle',
      () => void vscode.commands.executeCommand('projectMonitor.windows.focus')
    )
  );
}

// Opens a project folder. If it's already open in a window, VS Code switches to that window.
async function openWindow(folderPath?: string): Promise<void> {
  if (!folderPath) {
    return;
  }
  const uri = vscode.Uri.file(folderPath);
  await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
}
