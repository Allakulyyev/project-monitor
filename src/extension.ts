import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { Logger } from './utils/logger';
import { getStateDirUri } from './utils/paths';
import { SharedStateFile } from './core/SharedStateFile';
import { WindowRegistry } from './core/WindowRegistry';
import { Heartbeat } from './core/Heartbeat';
import { WindowsViewProvider } from './views/WindowsViewProvider';
import { AiStatusRegistry } from './ai/AiStatusRegistry';
import { ClaudeCodeAdapter } from './ai/adapters/ClaudeCodeAdapter';
import { registerCommands } from './commands';
import { WindowInfo } from './core/types';

let logger: Logger | undefined;
let registry: WindowRegistry | undefined;

// Entry point: only wires dependencies and subscriptions. No business logic here.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger();
  context.subscriptions.push(logger);
  logger.info('Project Monitor extension activated.');

  // Layer 1: window storage (one file per window) + watching changes from other windows.
  const sharedFile = new SharedStateFile(getStateDirUri(context), logger);
  context.subscriptions.push(sharedFile);

  // Unique id for the current window and its registration in the shared folder.
  const selfId = randomUUID();
  registry = new WindowRegistry(sharedFile, selfId);
  const self = describeThisWindow();
  await registry.registerSelf(self);
  logger.info(`Window registered: "${self.projectName}" (${selfId}).`);

  // Heartbeat: periodically updates the window's timestamp and focus.
  const heartbeat = new Heartbeat(registry);
  heartbeat.start();
  context.subscriptions.push(heartbeat);

  // Webview panel that shows the window list as cards.
  // retainContextWhenHidden: don't unload the panel when hidden — otherwise switching
  // windows reloads it and it "glitches".
  const windowsProvider = new WindowsViewProvider(registry);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('projectMonitor.windows', windowsProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Instant reaction to focus changes: immediately write our record and refresh the list,
  // without waiting for the file watcher (which can be delayed).
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((s) => {
      void registry?.updateSelf({ focused: s.focused, lastHeartbeat: Date.now() });
      void windowsProvider.refresh();
    })
  );

  // Any change to the window files refreshes the list right away.
  sharedFile.watch();
  context.subscriptions.push(sharedFile.onChange(() => void windowsProvider.refresh()));

  // Real-time safety net: refresh the list often, even if the watcher didn't fire,
  // and so that "dead" windows disappear in time.
  const autoRefresh = setInterval(() => void windowsProvider.refresh(), 1000);
  context.subscriptions.push({ dispose: () => clearInterval(autoRefresh) });

  // Layer 2: AI status. Only one adapter for now — Claude Code.
  const aiRegistry = new AiStatusRegistry([new ClaudeCodeAdapter(self.folderPath)]);
  context.subscriptions.push(aiRegistry);
  aiRegistry.start();
  await registry.updateSelf({ ai: aiRegistry.getActive() });
  // A status change is immediately written to our record and refreshes the list.
  context.subscriptions.push(
    aiRegistry.onChange((ai) => {
      void registry?.updateSelf({ ai });
      void windowsProvider.refresh();
    })
  );

  // Commands: refresh, open project, show panel.
  registerCommands(context, windowsProvider);
}

// Shutdown: remove our record so the window disappears from others immediately.
export async function deactivate(): Promise<void> {
  await registry?.unregisterSelf();
  logger?.info('Project Monitor extension stopped.');
}

// Builds the current window's description: project name, path, focus and AI status (stub for now).
function describeThisWindow(): Omit<WindowInfo, 'id' | 'lastHeartbeat'> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const folderPath = folder ? folder.uri.fsPath : null;
  const projectName =
    vscode.workspace.name ?? (folder ? path.basename(folder.uri.fsPath) : '(no folder)');
  return {
    projectName,
    folderPath,
    focused: vscode.window.state.focused,
    // Stub for now: assume the tool is Claude Code, idle.
    // Real status is computed by the adapter (layer 2).
    ai: { tool: 'claude-code', status: 'idle' }
  };
}
