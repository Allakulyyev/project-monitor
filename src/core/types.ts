// Single source of types for the whole extension. Do not duplicate these interfaces.

// Which AI tool is tracked in a window ('none' — none yet).
export type AiTool = 'claude-code' | 'codex' | 'copilot' | 'amazon-q' | 'none';

// AI status in a window.
export type AiStatus = 'idle' | 'thinking' | 'responding' | 'done' | 'unknown';

// AI state in a window: which tool and its current status.
export interface AiState {
  tool: AiTool;
  status: AiStatus;
}

// Record of a single VS Code window in the shared window storage.
export interface WindowInfo {
  // Unique window id (generated on activation).
  id: string;
  // Project name (workspace or folder name).
  projectName: string;
  // Absolute path to the open folder (null if no folder is open).
  folderPath: string | null;
  // Whether the window is in the foreground right now.
  focused: boolean;
  // Timestamp of the last heartbeat, in milliseconds (used to drop dead windows).
  lastHeartbeat: number;
  // Current AI state in this window.
  ai: AiState;
}

// Full shape of the shared state: a map of windows keyed by id.
export interface SharedState {
  windows: Record<string, WindowInfo>;
}
