import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { WindowRegistry } from '../core/WindowRegistry';
import { AiTool } from '../core/types';
import { getWebviewHtml } from './webviewHtml';

// Human-readable AI tool name (null — if there's no AI in the window).
function aiToolLabel(tool: AiTool): string | null {
  switch (tool) {
    case 'claude-code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'copilot':
      return 'Copilot';
    case 'amazon-q':
      return 'Amazon Q';
    default:
      return null;
  }
}

// Webview panel provider: renders the window list as cards and updates them in real time.
export class WindowsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  // Random nonce for the Content-Security-Policy (allows only our script).
  private readonly nonce = randomUUID().replace(/-/g, '');

  constructor(private readonly registry: WindowRegistry) {}

  // Called by VS Code when the panel is opened: sets up the webview and its HTML.
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getWebviewHtml(this.nonce);

    // Messages from the webview: 'ready' — send data; 'open' — open the chosen window.
    view.webview.onDidReceiveMessage(
      (msg: { type?: string; folderPath?: string; self?: boolean }) => {
        if (msg?.type === 'ready') {
          void this.refresh();
        } else if (msg?.type === 'open' && !msg.self && msg.folderPath) {
          void vscode.commands.executeCommand('projectMonitor.openWindow', msg.folderPath);
        }
      }
    );

    // When the panel becomes visible again — refresh the data right away.
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.refresh();
      }
    });

    void this.refresh();
  }

  // Re-reads the list of live windows and sends it to the webview to re-render.
  async refresh(): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }
    const windows = await this.registry.getWindows();
    // For our own window, take the live focus straight from VS Code — the file may lag.
    for (const w of windows) {
      if (w.id === this.registry.id) {
        w.focused = vscode.window.state.focused;
      }
    }
    const payload = windows
      .sort((a, b) => {
        if (a.focused !== b.focused) {
          return a.focused ? -1 : 1;
        }
        return a.projectName.localeCompare(b.projectName);
      })
      .map((w) => ({
        id: w.id,
        projectName: w.projectName,
        folderPath: w.folderPath,
        focused: w.focused,
        self: w.id === this.registry.id,
        aiTool: aiToolLabel(w.ai.tool),
        aiStatus: w.ai.status
      }));
    void view.webview.postMessage({ type: 'update', windows: payload });

    // Badge on the container icon — number of windows where the AI is working now (hidden at 0).
    const working = windows.filter((w) => w.ai.status === 'thinking').length;
    view.badge = working > 0 ? { value: working, tooltip: `${working} working` } : undefined;
  }
}
