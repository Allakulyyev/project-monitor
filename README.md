<h1 align="center">🖥️ Project Monitor</h1>

<p align="center">
  A VS Code extension that shows <b>all your open windows in one panel</b> —
  which project each one has, which window is active, and the
  <b>live AI status</b> in every window (is Claude Code working or idle?).
</p>

> [!NOTE]
> Screenshots will be added here. Drop images into `media/screenshots/` and they
> will appear in the sections below.

<p align="center">
  <img src="media/screenshots/panel.png" width="320" alt="Project Monitor panel" />
</p>

---

## ✨ Features

- **All windows at a glance** — every open VS Code window appears as a card with its project name and path.
- **Active window highlight** — the window you're currently in is outlined in green.
- **Live AI status** — see where Claude Code is **working**, where it **finished**, and where it's **idle**, updated in real time.
- **Counters** — a header shows how many projects are **open** and how many are **working**, plus a badge on the activity-bar icon with the number currently working.
- **Click to switch** — click another window's card to jump to it (VS Code focuses the already-open window).
- **Extensible by design** — each AI tool is a separate adapter; new tools (Codex, Copilot, Amazon Q) plug in without touching the rest of the code.

## 🧠 How AI status is detected

Claude Code records every session as a `*.jsonl` transcript under
`~/.claude/projects/<project>/`. Project Monitor reads the **last record** of the
freshest session for the window's folder (matched precisely by the `cwd` field):

| Status | Meaning | When |
| --- | --- | --- |
| 🟡 **working** | Claude is busy | last message is a tool call / streaming / user input |
| 🟢 **finished** | Claude finished its turn | last assistant message has `stop_reason: end_turn` |
| ⚪ **idle** | nothing is happening | no session activity for a while, or no session at all |

This is content-based (not a timer), so the status doesn't flip to "finished"
during pauses between steps — it only flips when Claude actually ends its turn.

## 📸 Screenshots

<!-- Replace these with real screenshots placed in media/screenshots/ -->

| Panel | Active window | Working badge |
| --- | --- | --- |
| ![Panel](media/screenshots/panel.png) | ![Active](media/screenshots/active.png) | ![Badge](media/screenshots/badge.png) |

## 🚀 Install

The easiest way — double-click **`build.cmd`** in the project root. It installs
dependencies (first time only), builds the extension, packs it into a `.vsix`,
and installs it into your VS Code. Then run `Ctrl+Shift+P` → **Reload Window**.

Or manually:

```powershell
npm install
npm run package
code --install-extension project-monitor-0.0.1.vsix --force
```

> TypeScript and esbuild are only needed at build time — they are **not** shipped
> inside the `.vsix`. The package contains only the compiled JavaScript.

## 🕹️ Usage

1. Open the **Project Monitor** container from the Activity Bar (drag it to the
   Secondary Side Bar if you want it on the right).
2. Open more windows (`Ctrl+Shift+N`, or folders) — each registers itself and
   shows up in **every** window's panel.
3. The active window is outlined in green; click any other card to switch to it.

> For windows to see each other, the same extension must be installed and active
> in all of them. After updating, reload every window (or restart VS Code).

## 🛠️ Development

```powershell
npm install        # install build tools
npm run build      # one-off build into dist/extension.js
npm run watch      # rebuild on change
npm run typecheck  # type-check without emitting
```

Press **F5** to launch an Extension Development Host with the extension loaded.

## 📁 Project structure

```
src/
├── extension.ts            # entry point: wires everything together, no logic
├── core/                   # shared state & window lifecycle
│   ├── types.ts            # all shared interfaces
│   ├── SharedStateFile.ts  # per-window JSON files + FileSystemWatcher
│   ├── WindowRegistry.ts   # add/update/remove self, list live windows
│   └── Heartbeat.ts        # periodic pulse for the current window
├── ai/                     # AI status tracking
│   ├── AiStatusProvider.ts # adapter interface
│   ├── AiStatusRegistry.ts # combines adapters into one status
│   └── adapters/
│       └── ClaudeCodeAdapter.ts
├── views/                  # the side panel (webview cards)
│   ├── WindowsViewProvider.ts
│   └── webviewHtml.ts
├── commands/index.ts       # commands: refresh, open project, toggle
└── utils/                  # paths & logger
```

## ⚠️ Limitations (honest VS Code constraints)

- VS Code can't force-raise another window via the API. "Switch to window" works
  by opening the already-open folder, which VS Code focuses instead of duplicating.
- VS Code only distinguishes `focused` / `not focused` — "minimized" vs "behind
  another window" can't be told apart.
- An activity-bar icon supports only **one** numeric badge, so the icon shows the
  "working" count and the panel header shows both counters.

## 🗺️ Roadmap

- [x] Live window list with active-window highlight
- [x] Click a card to switch windows
- [x] Claude Code AI status (working / finished / idle)
- [ ] Codex adapter
- [ ] Copilot adapter
- [ ] Amazon Q adapter

## 📄 License

MIT
