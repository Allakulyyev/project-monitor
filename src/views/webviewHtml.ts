// Returns the panel's HTML skeleton: card styles + a client script that renders
// window cards from data sent by the extension via postMessage.
export function getWebviewHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    margin: 0;
    padding: 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  #cards { display: flex; flex-direction: column; gap: 8px; }
  .card {
    background: var(--vscode-editorWidget-background, rgba(127,127,127,0.06));
    border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.25));
    border-radius: 8px;
    padding: 10px 12px;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  /* Clickable cards (other windows) — pointer cursor and hover highlight. */
  .card.clickable { cursor: pointer; }
  .card.clickable:hover { background: var(--vscode-list-hoverBackground); }
  /* Active window (where the user is now) — the whole card gets a green border. */
  .card.active {
    border-color: var(--vscode-charts-green, #3fb950);
  }
  .name {
    font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .path {
    margin-top: 4px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* Container for info rows (AI now, more sources later). */
  .info { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .info-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .info-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto;
              background: var(--vscode-descriptionForeground); }
  .info-name { color: var(--vscode-foreground); }
  .info-sep { color: var(--vscode-descriptionForeground); }
  .info-status { color: var(--vscode-descriptionForeground); }
  .s-thinking { background: var(--vscode-charts-yellow, #d6b300);
                animation: pulse 1.2s ease-in-out infinite; }
  .s-responding { background: var(--vscode-charts-blue, #2f7fe0); }
  .s-done { background: var(--vscode-charts-green, #3fb950); }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  #empty { color: var(--vscode-descriptionForeground); padding: 8px 4px; }
  /* Header counters: total open projects and how many are working right now. */
  #summary { display: flex; gap: 6px; margin-bottom: 8px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
          padding: 2px 8px; border-radius: 10px;
          background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .pill .dot { width: 7px; height: 7px; border-radius: 50%; }
  .pill.total .dot { background: var(--vscode-descriptionForeground); }
  .pill.working .dot { background: var(--vscode-charts-green, #3fb950); }
  .pill.working.off { opacity: 0.5; }
</style>
</head>
<body>
  <div id="empty">No open windows yet.</div>
  <div id="summary">
    <span class="pill total"><span class="dot"></span><span id="totalN">0</span> open</span>
    <span class="pill working off"><span class="dot"></span><span id="workingN">0</span> working</span>
  </div>
  <div id="cards"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('cards');
  const empty = document.getElementById('empty');
  const summary = document.getElementById('summary');
  const totalN = document.getElementById('totalN');
  const workingN = document.getElementById('workingN');
  const workingPill = document.querySelector('.pill.working');
  // Already-created cards keyed by window id — so we update them instead of recreating.
  const cards = new Map();

  // Human-readable AI status label.
  function statusText(s) {
    switch (s) {
      case 'thinking': return 'working';
      case 'responding': return 'responding';
      case 'done': return 'finished';
      case 'idle': return 'idle';
      default: return 'unknown';
    }
  }

  // Builds the card skeleton once; we keep references to its parts for later updates.
  function createCard() {
    const el = document.createElement('div');
    el.className = 'card';

    const name = document.createElement('div');
    name.className = 'name';
    el.appendChild(name);

    const path = document.createElement('div');
    path.className = 'path';
    el.appendChild(path);

    const info = document.createElement('div');
    info.className = 'info';
    const row = document.createElement('div');
    row.className = 'info-row';
    const dot = document.createElement('span');
    dot.className = 'info-dot';
    const infoName = document.createElement('span');
    infoName.className = 'info-name';
    const sep = document.createElement('span');
    sep.className = 'info-sep';
    sep.textContent = '·';
    const status = document.createElement('span');
    status.className = 'info-status';
    row.appendChild(dot);
    row.appendChild(infoName);
    row.appendChild(sep);
    row.appendChild(status);
    info.appendChild(row);
    el.appendChild(info);

    const entry = { el, name, path, info, dot, infoName, status, data: null };

    // The click handler is added once; it reads the card's current data.
    el.addEventListener('click', () => {
      const w = entry.data;
      if (w && !w.self && w.folderPath) {
        vscode.postMessage({ type: 'open', folderPath: w.folderPath, self: w.self });
      }
    });

    return entry;
  }

  // Updates the card's fields in place — only what actually changed.
  function updateCard(entry, w) {
    entry.data = w;

    const cls = 'card' + (w.focused ? ' active' : '') + (!w.self && w.folderPath ? ' clickable' : '');
    if (entry.el.className !== cls) {
      entry.el.className = cls;
    }
    const title = !w.self && w.folderPath ? 'Open this window' : '';
    if (entry.el.title !== title) {
      entry.el.title = title;
    }
    if (entry.name.textContent !== w.projectName) {
      entry.name.textContent = w.projectName;
    }
    const pathText = w.folderPath || 'No folder open';
    if (entry.path.textContent !== pathText) {
      entry.path.textContent = pathText;
    }

    if (w.aiTool) {
      entry.info.style.display = '';
      if (entry.infoName.textContent !== w.aiTool) {
        entry.infoName.textContent = w.aiTool;
      }
      const dotCls = 'info-dot s-' + w.aiStatus;
      if (entry.dot.className !== dotCls) {
        entry.dot.className = dotCls;
      }
      const st = statusText(w.aiStatus);
      if (entry.status.textContent !== st) {
        entry.status.textContent = st;
      }
    } else {
      entry.info.style.display = 'none';
    }
  }

  // Reconciles the card list with the data: updates existing cards, adds new ones,
  // removes vanished ones and puts them in order — without a full re-render.
  function render(windows) {
    const list = windows || [];
    empty.style.display = list.length ? 'none' : 'block';

    // Update the header counters: total open and how many OTHER windows are working
    // (the current window is excluded — you already see its status on its card).
    summary.style.display = list.length ? 'flex' : 'none';
    const working = list.filter((w) => !w.self && w.aiStatus === 'thinking').length;
    if (totalN.textContent !== String(list.length)) {
      totalN.textContent = list.length;
    }
    if (workingN.textContent !== String(working)) {
      workingN.textContent = working;
    }
    workingPill.classList.toggle('off', working === 0);

    const seen = new Set();
    list.forEach((w, index) => {
      seen.add(w.id);
      let entry = cards.get(w.id);
      if (!entry) {
        entry = createCard();
        cards.set(w.id, entry);
      }
      updateCard(entry, w);
      // Move the card into the right position (moving doesn't recreate the element).
      if (root.children[index] !== entry.el) {
        root.insertBefore(entry.el, root.children[index] || null);
      }
    });

    // Remove cards for windows that no longer exist.
    for (const [id, entry] of cards) {
      if (!seen.has(id)) {
        entry.el.remove();
        cards.delete(id);
      }
    }
  }

  // Receive list updates from the extension.
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg && msg.type === 'update') {
      render(msg.windows);
    }
  });

  // Tell the extension the page is ready and data can be sent.
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
