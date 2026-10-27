/**
 * src/public/js/cubicle-grid.js
 *
 * 4x4 Cubicle Spatial Matrix Grid Controller with OpenRig-Style Live Worker Activity Stream.
 *
 * End-to-End Activity Pipeline Trace (task-mvpsrhsg-2hj5):
 * 1. Dispatch Startup: ConsularEngine.dispatchIsolatedTask provisions worktrees/cubicle-XX
 *    and transitions the cubicle to 'working'. On Google Drive (H:\), NTFS junction creation
 *    for .swarm throws EISDIR and falls back to a worktree-local .swarm directory while the
 *    live server writes to root .swarm/status/cubicle-XX.json. In addition, stale worktree
 *    index.lock files can leave git status --short reporting hundreds of 'D .agents/...' lines.
 * 2. Provider Output Buffering/Parsing: Non-interactive CLI runs (agy.exe -p / codex.exe exec)
 *    buffer stdout chunks, causing ConsularEngine's 3-second workerTelemetryTimer fallback to
 *    cycle 3 synthetic strings ('Inspecting ... in cubicle-XX...', 'Executing worker changes...',
 *    'Checking worktree diff & verification status...') plus 'Active worktree edits (551): D .agents/...',
 *    which previously flooded the 25-entry thought_stream and overwrote real thoughts.
 * 3. WebSocket & Telemetry Delivery: Server broadcasts CUBICLE_UPDATED, TASK_CLAIMED, TASK_UPDATED,
 *    TASK_COMPLETED, CUBICLE_MESSAGE, and SWARM_ACTIVITY_HEARTBEAT over /events, and exposes
 *    /api/cubicles, .swarm/status/cubicle-XX.json, /api/tasks, /api/messages, and /api/swarm/activity.
 * 4. Cubicle Card Rendering: CubicleGridController filters out synthetic timer filler and git-index
 *    noise, preserves real CLI snippets + Kanban task progress notes/diffs + peer tool messages in a
 *    durable per-cubicle ledger, explicitly classifies and renders working, waiting, stalled, idle,
 *    error, and disconnected states without fabricated thoughts, and patches DOM nodes in-place with
 *    calm scroll preservation.
 */

const SYNTHETIC_THOUGHT_PATTERNS = [
  /^(?:\[task-[a-z0-9-]+\]\s*)?Inspecting\s+.+\s+in\s+cubicle-\d{2}\.\.\.$/i,
  /^(?:\[task-[a-z0-9-]+\]\s*)?Executing worker changes for\s+"[\s\S]+"\.\.\.$/i,
  /^(?:\[task-[a-z0-9-]+\]\s*)?Checking worktree diff\s*&\s*verification status\s*\([\s\S]*\)\.\.\.$/i,
  /^(?:\[task-[a-z0-9-]+\]\s*)?Active worktree edits\s*\(\d+\):\s*D\s+\.(?:agents|swarm)[\\/]/i,
  /^(?:\[task-[a-z0-9-]+\]\s*)?Active worktree edits\s*\((?:[1-9]\d{2,})\):/i,
  /^Analyzing\s*&\s*executing task:\s*"/i,
  /^Inspecting\s*&\s*executing\s*\[task-[a-z0-9-]+\]:/i,
  /^Working on:\s+/i,
];

const BOILERPLATE_THOUGHTS = new Set([
  '',
  'configured and ready.',
  'initialized. standing by for instructions.',
  'standing by.',
  'standing by...',
  'slot unassigned.',
  'slot vacant.',
  'slot cleared.',
  'idle — awaiting next task.',
  'idle — awaiting task claim.',
  'idle — monitoring kanban queue for next dispatch.',
  'idle — standing by for task dispatch.',
  'idle telemetry normal.',
]);

const CLI_NOISE_PATTERNS = [
  /^[\d,\s.:%+-]+$/,
  /^(?:(?:input|output|total|cached|reasoning)[ _-]+)?tokens?(?:[ _-]+(?:used|count))?\s*(?::|=|$|\d)/i,
  /^[\d,]+\s+tokens?\b/i,
  /^(?:OpenAI Codex\b|workdir:|model:|provider:|approval:|sandbox:|session id:|reasoning (?:effort|summaries):|Reading additional input\b|mcp(?:\s|:)|(?:exec|user|codex|assistant|system|thinking)\s*$)/i,
  /^(?:[{}\[\],]+\s*$|\{|\[\s*(?:\{|"|\d|\]|true\b|false\b|null\b)|"[^"\n]+"\s*:)/,
  /^(?:```(?:json|jsonl)?\s*$|(?:succeeded|exited) in\s+\d|Process exited with code\b|Wall time:|Total output lines:)/i,
];

export function isSyntheticOrBoilerplateThought(rawText) {
  const cleaned = String(rawText ?? '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return true;
  if (BOILERPLATE_THOUGHTS.has(cleaned.toLowerCase())) return true;
  for (const pattern of SYNTHETIC_THOUGHT_PATTERNS) {
    if (pattern.test(cleaned)) return true;
  }
  for (const pattern of CLI_NOISE_PATTERNS) {
    if (pattern.test(cleaned)) return true;
  }
  return false;
}

export function sanitizeWorktreeEditsThought(rawText) {
  const cleaned = String(rawText ?? '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(\[task-[a-z0-9-]+\]\s*)?Active worktree edits\s*\((\d+)\):\s*(.+)$/i.exec(cleaned);
  if (!m) return cleaned;
  const prefix = m[1] || '';
  const items = m[3]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^D\s+\.(?:agents|swarm)[\\/]/i.test(part) && !/^\?\?\s+\.(?:agents|swarm)[\\/]?/i.test(part));
  if (items.length === 0) return '';
  return `${prefix}Active worktree edits (${items.length}): ${items.join(', ')}`;
}

export class CubicleGridController {
  constructor(app = null) {
    this.gridContainer = typeof document !== 'undefined' ? document.getElementById('cubicle-grid') : null;
    this.svgContainer = typeof document !== 'undefined' ? document.getElementById('contracts-dependency-svg') : null;
    this.sandboxDrawer = typeof document !== 'undefined' ? document.getElementById('port-sandbox-drawer') : null;
    this.sandboxIframe = typeof document !== 'undefined' ? document.getElementById('sandbox-iframe') : null;
    this.sandboxTitle = typeof document !== 'undefined' ? document.getElementById('sandbox-drawer-title') : null;
    this.btnCloseSandbox = typeof document !== 'undefined' ? document.getElementById('btn-close-sandbox') : null;

    this.cubicles = new Map(); // id -> cubicle state
    this.tasksByCubicle = new Map(); // cubicleId -> { task, col }
    this.orphanedByCubicle = new Map(); // cubicleId -> { id, title, reason }
    this.activityLedger = new Map(); // cubicleId -> Array<{ id, text, kind, timestamp, seq }>
    this.seenMessageIds = new Set();
    this.seenTaskNoteSignatures = new Map(); // taskId -> last notes signature
    this.seenTaskDiffSignatures = new Map(); // taskId -> last diff signature
    this.userScrollLockByCubicle = new Map(); // cubicleId -> boolean
    this.seqCounter = 0;

    this.contracts = [];
    this.inspectedCubicleId = null;
    this.mindDrawer = null;

    this.connectionState = 'connected'; // 'connected' | 'reconnecting' | 'disconnected'
    this.consecutiveFetchFailures = 0;
    this.stallThresholdMs = 120000; // 2 minutes without heartbeat/activity marks active run as stalled
    this.app = null;

    this.ensureStreamStyles();
    this.bindEvents();
    if (app) {
      this.attachApp(app);
    }

    // Poll live telemetry every 1.8s so incremental CLI/task/message updates advance smoothly
    if (typeof window !== 'undefined' && !window.__PANOPTICON_DISABLE_CUBICLE_POLL__) {
      this.telemetryTimer = setInterval(() => {
        this.syncLiveTelemetry();
      }, 1800);
    }
  }

  ensureStreamStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('cubicle-grid-stream-styles')) return;
    const style = document.createElement('style');
    style.id = 'cubicle-grid-stream-styles';
    style.textContent = `
      .cubicle-state-badge {
        font-family: var(--font-mono, monospace);
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 1px 4px;
        border: 1px solid rgba(163, 169, 159, 0.35);
        color: #c7cdc3;
        background: rgba(23, 25, 23, 0.9);
        text-transform: uppercase;
        white-space: nowrap;
      }
      .cubicle-state-badge.state-badge-working {
        color: #43c684;
        border-color: rgba(67, 198, 132, 0.55);
        background: rgba(16, 185, 129, 0.12);
      }
      .cubicle-state-badge.state-badge-waiting {
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.55);
        background: rgba(56, 189, 248, 0.12);
      }
      .cubicle-state-badge.state-badge-stalled {
        color: #f6b13a;
        border-color: rgba(246, 177, 58, 0.65);
        background: rgba(246, 177, 58, 0.15);
      }
      .cubicle-state-badge.state-badge-error {
        color: #e26562;
        border-color: rgba(226, 101, 98, 0.75);
        background: rgba(220, 38, 38, 0.18);
      }
      .cubicle-state-badge.state-badge-disconnected {
        color: #fb7185;
        border-color: rgba(251, 113, 133, 0.65);
        background: rgba(159, 18, 57, 0.22);
      }
      .cubicle-state-badge.state-badge-idle {
        color: #9ca3af;
        border-color: rgba(156, 163, 175, 0.3);
        background: rgba(31, 41, 55, 0.35);
      }
      .cubicle-state-badge.state-badge-vacant {
        color: #6b7280;
        border-color: rgba(107, 114, 128, 0.25);
        background: transparent;
      }
      .cubicle-card.openrig-seat-card.op-stalled {
        border-color: rgba(246, 177, 58, 0.72) !important;
        box-shadow: 2px 2px 0px #000000, inset 0 0 0 1px rgba(246, 177, 58, 0.22) !important;
      }
      .cubicle-card.openrig-seat-card.op-waiting {
        border-color: rgba(56, 189, 248, 0.52) !important;
      }
      .cubicle-card.openrig-seat-card.op-disconnected {
        border-color: rgba(251, 113, 133, 0.65) !important;
        border-style: dashed !important;
      }
      .openrig-activity-dot.dot-op-waiting {
        background: #38bdf8 !important;
      }
      .openrig-activity-dot.dot-op-stalled {
        background: #f6b13a !important;
      }
      .openrig-activity-dot.dot-op-disconnected {
        background: #fb7185 !important;
      }
      .openrig-smoked-plate .thought-time {
        color: #78716c;
        font-size: 9.5px;
        margin-right: 3px;
        flex-shrink: 0;
        user-select: none;
      }
      .openrig-smoked-plate .thought-bubble-line.state-notice {
        color: #d6d3d1;
      }
      .openrig-smoked-plate .thought-bubble-line.state-notice-stalled .thought-text {
        color: #f6b13a;
      }
      .openrig-smoked-plate .thought-bubble-line.state-notice-error .thought-text {
        color: #fca5a5;
      }
      .openrig-smoked-plate .thought-bubble-line.state-notice-disconnected .thought-text {
        color: #fda4af;
      }
      .openrig-smoked-plate .thought-bubble-line.state-notice-waiting .thought-text {
        color: #bae6fd;
      }
    `;
    document.head.appendChild(style);
  }

  bindEvents() {
    if (this.btnCloseSandbox && this.sandboxDrawer) {
      this.btnCloseSandbox.addEventListener('click', () => {
        this.closeSandboxPreview();
      });
    }
  }

  attachApp(app) {
    if (!app || this.app === app) return;
    this.app = app;

    // Non-destructively wrap app.dispatchServerEvent so cubicle streams react immediately to all live WS events
    if (typeof app.dispatchServerEvent === 'function' && !app.__cubicleGridWrappedDispatch) {
      const origDispatch = app.dispatchServerEvent.bind(app);
      app.dispatchServerEvent = (type, payload) => {
        origDispatch(type, payload);
        this.handleServerEvent(type, payload);
      };
      app.__cubicleGridWrappedDispatch = true;
    }

    // Non-destructively wrap app.connectWebSocket to monitor live WS connection/reconnect state
    if (typeof app.connectWebSocket === 'function' && !app.__cubicleGridWrappedWs) {
      const origConnect = app.connectWebSocket.bind(app);
      app.connectWebSocket = () => {
        origConnect();
        this.bindWebSocketLifecycle(app.ws);
      };
      app.__cubicleGridWrappedWs = true;
    }

    if (app.ws) {
      this.bindWebSocketLifecycle(app.ws);
    }
  }

  bindWebSocketLifecycle(ws) {
    if (!ws || ws.__cubicleGridBound) return;
    ws.__cubicleGridBound = true;

    ws.addEventListener('open', () => {
      this.setConnectionState('connected');
      void this.syncLiveTelemetry(null, { force: true });
    });
    ws.addEventListener('close', () => {
      this.setConnectionState('disconnected');
    });
    ws.addEventListener('error', () => {
      this.setConnectionState('disconnected');
    });
  }

  setConnectionState(nextState) {
    const normalized =
      nextState === 'disconnected' || nextState === 'reconnecting' ? nextState : 'connected';
    if (this.connectionState === normalized) return;
    this.connectionState = normalized;
    if (normalized === 'connected') {
      this.consecutiveFetchFailures = 0;
    }
    for (const cub of this.cubicles.values()) {
      this.renderOrPatchCard(cub);
    }
  }

  handleServerEvent(type, payload) {
    if (!type) return;
    if (this.connectionState !== 'connected') {
      this.setConnectionState('connected');
    }

    if (type === 'CUBICLE_UPDATED' && payload?.cubicle) {
      this.updateCubicle(payload.cubicle);
      return;
    }

    if (type === 'CUBICLE_MESSAGE' && payload?.message) {
      this.ingestPeerMessage(payload.message, true);
      return;
    }

    if (type === 'SWARM_ACTIVITY_HEARTBEAT' && payload) {
      this.ingestActivitySnapshot(payload);
      return;
    }

    if ((type === 'TASK_CLAIMED' || type === 'TASK_UPDATED' || type === 'TASK_COMPLETED') && payload?.task) {
      this.ingestTaskUpdate(payload.task, type);
      return;
    }

    if ((type === 'INCIDENT_ALERT' || type === 'CONSULAR_VETO') && payload) {
      const targetId = payload.cubicle_id || payload.cubicleId;
      const errText = payload.error || payload.reason || payload.rationale;
      if (targetId && errText && this.cubicles.has(targetId)) {
        this.appendLedgerEntry(targetId, {
          text: `[${type === 'CONSULAR_VETO' ? 'Gate 2 Veto' : 'Incident'}] ${errText}`,
          kind: 'error',
          timestamp: payload.timestamp || new Date().toISOString(),
        });
        const cub = this.cubicles.get(targetId);
        if (cub) this.renderOrPatchCard(cub);
      }
    }
  }

  ensureMindInspectorDrawer() {
    if (typeof document === 'undefined') return;
    let existing = document.getElementById('cubicle-mind-drawer');
    if (existing) {
      this.mindDrawer = existing;
      return;
    }

    const drawer = document.createElement('div');
    drawer.id = 'cubicle-mind-drawer';
    drawer.className = 'cubicle-mind-drawer hidden';
    drawer.innerHTML = `
      <div class="cubicle-mind-header">
        <div class="cubicle-mind-title-wrap">
          <span class="cubicle-mind-icon">🧠</span>
          <span id="cubicle-mind-title">CUBICLE-01 // WORKER MIND STREAM</span>
        </div>
        <button type="button" id="btn-close-mind-drawer" class="cubicle-mind-close-btn">✕ CLOSE</button>
      </div>
      <div id="cubicle-mind-body" class="cubicle-mind-body"></div>
    `;

    const parent = this.gridContainer?.parentElement || document.body;
    parent.appendChild(drawer);
    this.mindDrawer = drawer;

    const closeBtn = drawer.querySelector('#btn-close-mind-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeMindInspector());
    }
  }

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  formatTimeLabel(isoStr) {
    if (!isoStr) return '';
    try {
      const ms = Date.parse(String(isoStr));
      if (Number.isNaN(ms)) return '';
      return new Date(ms).toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  }

  normalizeThoughtText(rawText) {
    const sanitizedWorktree = sanitizeWorktreeEditsThought(rawText);
    if (!sanitizedWorktree) return '';
    const cleaned = String(sanitizedWorktree)
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (isSyntheticOrBoilerplateThought(cleaned)) return '';
    return cleaned;
  }

  appendLedgerEntry(cubicleId, entry) {
    if (!cubicleId || !entry || !entry.text) return false;
    const cleanText =
      entry.kind === 'message' || entry.kind === 'progress' || entry.kind === 'diff' || entry.kind === 'error'
        ? String(entry.text).replace(/\s+/g, ' ').trim()
        : this.normalizeThoughtText(entry.text);
    if (!cleanText) return false;

    if (!this.activityLedger.has(cubicleId)) {
      this.activityLedger.set(cubicleId, []);
    }
    const ledger = this.activityLedger.get(cubicleId);
    const last = ledger[ledger.length - 1];
    if (last && last.text === cleanText) {
      return false;
    }
    // Avoid re-adding an identical line if it already appeared in the last 4 entries
    if (ledger.slice(-4).some((item) => item.text === cleanText)) {
      return false;
    }

    this.seqCounter += 1;
    ledger.push({
      id: entry.id || `act-${this.seqCounter}`,
      text: cleanText,
      kind: entry.kind || 'thought',
      timestamp: entry.timestamp || new Date().toISOString(),
      seq: this.seqCounter,
    });

    if (ledger.length > 40) {
      ledger.splice(0, ledger.length - 40);
    }
    return true;
  }

  ingestCubicleStream(cubicle) {
    if (!cubicle || !cubicle.id) return false;
    let changed = false;
    const stream = Array.isArray(cubicle.thought_stream) ? cubicle.thought_stream : [];
    for (const rawItem of stream) {
      const text = typeof rawItem === 'string' ? rawItem : rawItem?.text;
      const timestamp =
        (typeof rawItem === 'object' && rawItem?.timestamp) ||
        cubicle.last_heartbeat ||
        new Date().toISOString();
      if (this.appendLedgerEntry(cubicle.id, { text, kind: 'thought', timestamp })) {
        changed = true;
      }
    }
    if (cubicle.surface_thoughts) {
      if (
        this.appendLedgerEntry(cubicle.id, {
          text: cubicle.surface_thoughts,
          kind: cubicle.status === 'error' ? 'error' : 'thought',
          timestamp: cubicle.last_heartbeat || new Date().toISOString(),
        })
      ) {
        changed = true;
      }
    }
    if (cubicle.error_details?.message) {
      if (
        this.appendLedgerEntry(cubicle.id, {
          text: `[Error] ${cubicle.error_details.message}`,
          kind: 'error',
          timestamp: cubicle.error_details.timestamp || cubicle.last_heartbeat || new Date().toISOString(),
        })
      ) {
        changed = true;
      }
    }
    return changed;
  }

  ingestPeerMessage(msg, renderImmediately = false) {
    if (!msg || typeof msg !== 'object') return;
    const msgId = msg.id || `${msg.from}->${msg.to}:${msg.created_at || ''}:${(msg.text || '').slice(0, 40)}`;
    if (this.seenMessageIds.has(msgId)) return;
    this.seenMessageIds.add(msgId);

    const body = String(msg.text || msg.body || msg.message || '').replace(/\s+/g, ' ').trim();
    if (!body) return;
    const topicPrefix = msg.topic ? `${msg.topic} — ` : '';
    const snippet = `${topicPrefix}${body}`.slice(0, 220);
    const ts = msg.created_at || new Date().toISOString();

    if (msg.from && this.cubicles.has(msg.from)) {
      const added = this.appendLedgerEntry(msg.from, {
        id: `msg-out-${msgId}`,
        text: `[Peer Sync → ${msg.to || 'swarm'}] ${snippet}`,
        kind: 'message',
        timestamp: ts,
      });
      const cub = this.cubicles.get(msg.from);
      if (cub) {
        cub.last_heartbeat = ts;
        if (added && renderImmediately) this.renderOrPatchCard(cub);
      }
    }

    if (msg.to && this.cubicles.has(msg.to)) {
      const added = this.appendLedgerEntry(msg.to, {
        id: `msg-in-${msgId}`,
        text: `[Peer Sync ← ${msg.from || 'peer'}] ${snippet}`,
        kind: 'message',
        timestamp: ts,
      });
      const cub = this.cubicles.get(msg.to);
      if (cub && added && renderImmediately) {
        this.renderOrPatchCard(cub);
      }
    }
  }

  ingestTaskUpdate(task, eventType = 'TASK_UPDATED') {
    if (!task || !task.id) return;
    const cubicleId = task.assigned_cubicle;
    if (!cubicleId || !this.cubicles.has(cubicleId)) return;

    const col = task.column || (eventType === 'TASK_COMPLETED' ? 'done' : 'in_progress');
    if (col === 'done') {
      if (this.tasksByCubicle.get(cubicleId)?.task?.id === task.id) {
        this.tasksByCubicle.delete(cubicleId);
      }
    } else {
      this.tasksByCubicle.set(cubicleId, { task, col });
    }

    const ts = task.completed_at || task.claimed_at || new Date().toISOString();
    let changed = false;

    if (typeof task.notes === 'string' && task.notes.trim()) {
      const noteText = task.notes.trim();
      const prevSig = this.seenTaskNoteSignatures.get(task.id);
      if (prevSig !== noteText) {
        this.seenTaskNoteSignatures.set(task.id, noteText);
        const pctPrefix = Number.isFinite(task.progress_percent) && task.progress_percent > 0
          ? `[Progress ${Math.round(task.progress_percent)}%] `
          : '[Task Progress] ';
        if (
          this.appendLedgerEntry(cubicleId, {
            text: `${pctPrefix}${noteText.slice(0, 240)}`,
            kind: 'progress',
            timestamp: new Date().toISOString(),
          })
        ) {
          changed = true;
        }
      }
    }

    if (task.git_diff_summary && typeof task.git_diff_summary === 'object') {
      const { filesChanged = 0, insertions = 0, deletions = 0 } = task.git_diff_summary;
      const diffSig = `${filesChanged}:${insertions}:${deletions}`;
      if (filesChanged > 0 && this.seenTaskDiffSignatures.get(task.id) !== diffSig) {
        this.seenTaskDiffSignatures.set(task.id, diffSig);
        if (
          this.appendLedgerEntry(cubicleId, {
            text: `[Worktree Diff] ${filesChanged} file(s) modified (+${insertions} / -${deletions})`,
            kind: 'diff',
            timestamp: new Date().toISOString(),
          })
        ) {
          changed = true;
        }
      }
    }

    if (task.error_log && String(task.error_log).trim()) {
      if (
        this.appendLedgerEntry(cubicleId, {
          text: `[Task Error] ${String(task.error_log).trim().slice(0, 220)}`,
          kind: 'error',
          timestamp: ts,
        })
      ) {
        changed = true;
      }
    }

    const cub = this.cubicles.get(cubicleId);
    if (cub) {
      cub.current_task_id = col === 'done' ? null : task.id;
      cub.assigned_task_title = col === 'done' ? null : task.title;
      cub.assigned_task_desc = col === 'done' ? null : task.description;
      cub.assigned_task_col = col === 'done' ? null : col;
      if (changed) {
        cub.last_heartbeat = new Date().toISOString();
      }
      this.renderOrPatchCard(cub);
    }
  }

  ingestActivitySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    this.orphanedByCubicle.clear();
    if (Array.isArray(snapshot.orphanedTasks)) {
      for (const orphan of snapshot.orphanedTasks) {
        if (orphan?.assignedCubicle) {
          this.orphanedByCubicle.set(orphan.assignedCubicle, orphan);
        }
      }
    }
    if (Array.isArray(snapshot.workingCubicles)) {
      for (const wc of snapshot.workingCubicles) {
        if (!wc?.id || !this.cubicles.has(wc.id)) continue;
        if (wc.latestThought) {
          this.appendLedgerEntry(wc.id, {
            text: wc.latestThought,
            kind: 'thought',
            timestamp: wc.lastHeartbeat || snapshot.timestamp || new Date().toISOString(),
          });
        }
      }
    }
    for (const cub of this.cubicles.values()) {
      this.renderOrPatchCard(cub);
    }
  }

  resolveOperationalState(c) {
    const isEnabled = Boolean(c.config?.enabled);
    const rawStatus = String(c.status || (isEnabled ? 'idle' : 'vacant')).toLowerCase();
    const taskEntry = this.tasksByCubicle.get(c.id);
    const orphanEntry = this.orphanedByCubicle.get(c.id);
    const ledger = this.activityLedger.get(c.id) || [];

    const beaconOffline =
      typeof document !== 'undefined' &&
      Boolean(document.getElementById('ws-status-beacon')?.classList?.contains('offline'));
    const isDisconnected =
      rawStatus === 'disconnected' ||
      c.connection_state === 'disconnected' ||
      this.connectionState === 'disconnected' ||
      (beaconOffline && this.consecutiveFetchFailures > 0);

    if (isDisconnected) {
      return {
        state: 'disconnected',
        label: 'DISCONNECTED',
        notice: 'Telemetry disconnected — awaiting server reconnect (last known state preserved).',
      };
    }

    if (!isEnabled || rawStatus === 'vacant') {
      return {
        state: 'vacant',
        label: 'VACANT',
        notice: 'Slot unassigned.',
      };
    }

    if (rawStatus === 'error' || rawStatus === 'exhausted') {
      const errReason =
        c.error_details?.message ||
        taskEntry?.task?.error_log ||
        this.normalizeThoughtText(c.surface_thoughts) ||
        (rawStatus === 'exhausted' ? 'Token quota exhausted.' : 'Worker execution error recorded.');
      return {
        state: 'error',
        label: rawStatus === 'exhausted' ? 'EXHAUSTED' : 'ERROR',
        notice: errReason,
      };
    }

    // Explicit stalled detection: server orphan signal, explicit stalled status,
    // in_progress task on an idle cubicle, or stale heartbeat beyond threshold while working.
    const heartbeatMs = c.last_heartbeat ? Date.parse(String(c.last_heartbeat)) : NaN;
    const latestLedgerMs =
      ledger.length > 0 && ledger[ledger.length - 1]?.timestamp
        ? Date.parse(String(ledger[ledger.length - 1].timestamp))
        : NaN;
    const freshestMs = Math.max(
      Number.isFinite(heartbeatMs) ? heartbeatMs : 0,
      Number.isFinite(latestLedgerMs) ? latestLedgerMs : 0
    );
    const silentElapsedMs = freshestMs > 0 ? Date.now() - freshestMs : 0;

    if (
      rawStatus === 'stalled' ||
      c.operational_state === 'stalled' ||
      Boolean(orphanEntry) ||
      (taskEntry?.col === 'in_progress' && rawStatus === 'idle') ||
      (rawStatus === 'working' && this.stallThresholdMs > 0 && freshestMs > 0 && silentElapsedMs > this.stallThresholdMs)
    ) {
      const stallReason = orphanEntry?.reason
        ? `Stalled — ${orphanEntry.reason}.`
        : taskEntry?.col === 'in_progress' && rawStatus === 'idle'
        ? `Stalled — task [${taskEntry.task.id}] is in_progress without an active worker process.`
        : silentElapsedMs > this.stallThresholdMs
        ? `Stalled — no worker activity or heartbeat for ${Math.round(silentElapsedMs / 1000)}s.`
        : 'Stalled — worker activity halted; awaiting recovery or redispatch.';
      return {
        state: 'stalled',
        label: 'STALLED',
        notice: stallReason,
      };
    }

    // Explicit waiting states: Gate 2 review, queued todo task, or waiting on initial CLI stream output
    if (rawStatus === 'under_inspection' || taskEntry?.col === 'review' || c.assigned_task_col === 'review') {
      return {
        state: 'waiting',
        label: 'WAITING · REVIEW',
        notice: c.current_task_id
          ? `Waiting for Gate 2 Consular inspection on [${c.current_task_id}].`
          : 'Waiting for Gate 2 Consular inspection.',
      };
    }

    if (rawStatus === 'waiting' || (rawStatus === 'idle' && taskEntry?.col === 'todo')) {
      return {
        state: 'waiting',
        label: 'WAITING · QUEUED',
        notice: taskEntry?.task?.title
          ? `Waiting in queue for Gate 1 dispatch: "${taskEntry.task.title}".`
          : 'Waiting for task dispatch.',
      };
    }

    if (rawStatus === 'working') {
      if (ledger.length === 0) {
        return {
          state: 'waiting',
          label: 'WAITING · STREAM',
          notice: 'Worker process running — waiting for live CLI / tool output...',
        };
      }
      return {
        state: 'working',
        label: 'WORKING',
        notice: null,
      };
    }

    return {
      state: 'idle',
      label: 'IDLE',
      notice: 'Idle — standing by for task dispatch.',
    };
  }

  resolveThoughtFeed(c) {
    if (c && c.id) {
      this.ingestCubicleStream(c);
    }
    const ledger = (c?.id && this.activityLedger.get(c.id)) ? [...this.activityLedger.get(c.id)] : [];
    const op = this.resolveOperationalState(c || {});

    // Prepend/append explicit state notice when disconnected, stalled, error, waiting, or when ledger is empty
    if (op.notice) {
      const shouldSurfaceNotice =
        op.state === 'disconnected' ||
        op.state === 'stalled' ||
        op.state === 'error' ||
        op.state === 'waiting' ||
        ledger.length === 0;
      if (shouldSurfaceNotice) {
        const last = ledger[ledger.length - 1];
        if (!last || last.text !== op.notice) {
          ledger.push({
            id: `notice-${op.state}`,
            text: op.notice,
            kind: `notice-${op.state}`,
            timestamp: c?.last_heartbeat || new Date().toISOString(),
            isNotice: true,
          });
        }
      }
    }

    return ledger;
  }

  initializeGrid(cubiclesList = []) {
    if (!this.gridContainer) return;
    this.gridContainer.innerHTML = '';

    for (let i = 1; i <= 16; i++) {
      const id = `cubicle-${String(i).padStart(2, '0')}`;
      const incoming = cubiclesList.find((c) => c.id === id) || {
        id,
        status: 'vacant',
        config: { enabled: false },
        port: 4100 + i,
        surface_thoughts: 'Slot unassigned.',
        thought_stream: [],
        fatigue_percentage: 0,
      };

      this.cubicles.set(id, incoming);
      this.ingestCubicleStream(incoming);
      const card = this.createCubicleCard(incoming);
      this.gridContainer.appendChild(card);
    }

    this.updateDependencyLines();
  }

  getProviderIcon(brand) {
    const b = String(brand || '').toLowerCase();
    if (b.includes('gpt') || b.includes('openai') || b.includes('codex')) {
      return `<svg viewBox="0 0 16 16" class="openrig-runtime-svg" aria-hidden="true"><circle cx="8" cy="8" r="5.7" fill="#fafaf9" stroke="#0c0a09" stroke-width="1.25"/><path d="M5.8 6.35 7.25 8 5.8 9.65" fill="none" stroke="#0c0a09" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.65 9.65h2.25" fill="none" stroke="#0c0a09" stroke-width="1.25" stroke-linecap="round"/></svg>`;
    }
    if (b.includes('gemini')) {
      return `<svg viewBox="0 0 16 16" class="openrig-runtime-svg" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.4" fill="#1e3a8a" stroke="#38bdf8" stroke-width="0.9"/><path d="M8 3.5 C8 6.3 9.7 8 12.5 8 C9.7 8 8 9.7 8 12.5 C8 9.7 6.3 8 3.5 8 C6.3 8 8 6.3 8 3.5 Z" fill="#e0f2fe"/></svg>`;
    }
    if (b.includes('claude')) {
      return `<svg viewBox="0 0 16 16" class="openrig-runtime-svg" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="2" width="10" height="8" fill="#ad6755"/><rect x="1" y="5" width="2" height="3" fill="#ad6755"/><rect x="13" y="5" width="2" height="3" fill="#ad6755"/><rect x="4" y="10" width="2" height="3" fill="#ad6755"/><rect x="7" y="10" width="2" height="3" fill="#ad6755"/><rect x="10" y="10" width="2" height="3" fill="#ad6755"/><rect x="5" y="4" width="1" height="2" fill="#181818"/><rect x="10" y="4" width="1" height="2" fill="#181818"/></svg>`;
    }
    return `<svg viewBox="0 0 16 16" class="openrig-runtime-svg" aria-hidden="true"><rect x="2" y="3" width="12" height="10" fill="#1c1917" stroke="#57534e" stroke-width="0.8"/><path d="M4 6 6 8 4 10" fill="none" stroke="#fafaf9" stroke-width="1.2" stroke-linecap="square"/><path d="M7.5 10h4" fill="none" stroke="#fafaf9" stroke-width="1.2" stroke-linecap="square"/></svg>`;
  }

  formatCompactTokens(tokens) {
    const n = Number(tokens || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  shortModelLabel(rawModel) {
    const s = String(rawModel || '').trim();
    if (!s || s === 'VACANT SLOT' || /^unassigned\s+slot/i.test(s)) return 'VACANT';
    return s
      .replace(/^Gemini\s+4\s+Argon\s*\(([^)]+)\)/i, 'Argon·$1')
      .replace(/^GPT\s+Astra\s*\(([^)]+)\)/i, 'Astra·$1')
      .replace(/Very High/i, 'VH');
  }

  buildEntriesMarkup(entries) {
    return entries
      .slice(-25)
      .reverse()
      .map((entry, index) => {
        const timeLabel = this.formatTimeLabel(entry.timestamp);
        const noticeClass = entry.isNotice ? `state-notice state-${this.escapeHtml(entry.kind || '')}` : '';
        return `
          <div class="thought-bubble-line ${index === 0 ? 'latest' : 'prev'} ${noticeClass}" data-entry-seq="${this.escapeHtml(entry.seq || index)}">
            <span class="thought-prompt-char">${index === 0 ? '›' : '·'}</span>${timeLabel ? `<span class="thought-time">${this.escapeHtml(timeLabel)}</span>` : ''}<span class="thought-text">${this.escapeHtml(entry.text)}</span>
          </div>
        `;
      })
      .join('');
  }

  computeCardViewModel(c) {
    const isEnabled = Boolean(c.config?.enabled);
    const status = c.status || (isEnabled ? 'idle' : 'vacant');
    const op = this.resolveOperationalState(c);
    const brand = isEnabled ? (c.config?.brand || 'custom') : 'vacant';
    const iconSvg = this.getProviderIcon(brand);
    const fullModel = isEnabled
      ? (c.config?.display_name || c.config?.model || 'AI Agent')
      : 'VACANT SLOT';
    const shortModel = this.shortModelLabel(fullModel);
    const port = c.port || 4101;
    const isWorking = op.state === 'working';

    const tokensUsed = Number(c.tokens_used ?? c.config?.quota?.tokens_used ?? 0);
    const rawFatigue = Number(c.fatigue_percentage ?? c.fatigue_percent ?? 0);
    const hasVerifiedQuota = Boolean(c.quota_verified) || tokensUsed > 0 || rawFatigue > 0;
    const fatigue = hasVerifiedQuota ? Math.min(100, Math.max(0, Math.round(rawFatigue))) : 0;
    const compactTokens = this.formatCompactTokens(tokensUsed);
    const contextClass = fatigue >= 80 ? 'ctx-high' : fatigue >= 55 ? 'ctx-warn' : 'ctx-ok';
    // Respect [numeric_fatigue_percentage_only]: clean numeric percentage only
    const metricText = !isEnabled ? '--' : `${fatigue}%`;
    const metricTitle = !isEnabled
      ? 'Slot Vacant'
      : `Quota Fatigue: ${fatigue}%${compactTokens ? ` (${compactTokens} tokens)` : ''}`;

    const entries = this.resolveThoughtFeed(c);
    const shortSeatId = c.id.replace(/^cubicle-/i, 'SEAT-');
    const taskTitle = c.assigned_task_title || this.tasksByCubicle.get(c.id)?.task?.title || null;
    const entriesKey = entries
      .slice(-25)
      .map((e) => `${e.seq || 0}:${e.text}`)
      .join('|');
    const signature = [
      status,
      op.state,
      op.label,
      shortModel,
      metricText,
      contextClass,
      taskTitle || '',
      entriesKey,
    ].join('::');

    return {
      isEnabled,
      status,
      op,
      iconSvg,
      fullModel,
      shortModel,
      port,
      isWorking,
      contextClass,
      metricText,
      metricTitle,
      entries,
      shortSeatId,
      taskTitle,
      signature,
    };
  }

  createCubicleCard(c) {
    const vm = this.computeCardViewModel(c);
    const card = document.createElement('div');
    card.id = c.id;
    card.className = `cubicle-card openrig-seat-card state-${vm.status} op-${vm.op.state}`;
    card.dataset.active = vm.isWorking ? 'true' : 'false';
    card.dataset.operationalState = vm.op.state;
    card.dataset.renderSignature = vm.signature;

    const taskBanner = vm.taskTitle
      ? `<div class="cubicle-task-pill" title="${this.escapeHtml(vm.taskTitle)}">${this.escapeHtml(vm.taskTitle)}</div>`
      : `<div class="cubicle-task-pill" style="display:none;"></div>`;

    // Respect [openrig_front_end_worker_thoughts]: stream live thoughts directly on card without a hidden MIND button
    card.innerHTML = `
      <header class="openrig-seat-header" title="${this.escapeHtml(c.id.toUpperCase())} · ${this.escapeHtml(vm.fullModel)} · State: ${this.escapeHtml(vm.op.label)}">
        <div class="openrig-seat-left">
          <span class="openrig-activity-dot dot-${this.escapeHtml(vm.status)} dot-op-${this.escapeHtml(vm.op.state)}" aria-label="status: ${this.escapeHtml(vm.op.state)}"></span>
          <span class="cubicle-id-badge">${this.escapeHtml(vm.shortSeatId)}</span>
          <span class="cubicle-state-badge state-badge-${this.escapeHtml(vm.op.state)}" data-state-badge="${this.escapeHtml(vm.op.state)}">${this.escapeHtml(vm.op.label)}</span>
        </div>
        <div class="openrig-seat-right">
          <span class="openrig-runtime-badge" title="${this.escapeHtml(vm.fullModel)}">
            ${vm.iconSvg}
            <span class="cubicle-model-name">${this.escapeHtml(vm.shortModel)}</span>
          </span>
          <span class="openrig-context-metric ${vm.contextClass}" title="${this.escapeHtml(vm.metricTitle)}">${this.escapeHtml(vm.metricText)}</span>
          <div class="openrig-hover-actions">
            <button type="button" class="openrig-hover-btn cubicle-port-badge" data-port="${vm.port}" title="Open Port ${vm.port} Sandbox">:${vm.port}</button>
          </div>
        </div>
      </header>

      ${taskBanner}

      <div class="surface-thoughts-ticker openrig-smoked-plate ${vm.isWorking ? 'thinking-active' : ''}" role="log" aria-live="polite" aria-label="${this.escapeHtml(c.id)} worker activity" title="Live worker activity stream (double-click for full inspector)" tabindex="0">
        ${this.buildEntriesMarkup(vm.entries)}
      </div>
    `;

    this.bindCardInteractions(card, c.id, vm.port);
    return card;
  }

  bindCardInteractions(card, cubicleId, port) {
    const portBtn = card.querySelector('.cubicle-port-badge');
    if (portBtn) {
      portBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSandboxPreview(cubicleId, port);
      });
    }

    const plate = card.querySelector('.surface-thoughts-ticker');
    if (plate) {
      plate.addEventListener('scroll', () => {
        this.userScrollLockByCubicle.set(cubicleId, plate.scrollTop > 16);
      });
      plate.addEventListener('dblclick', () => {
        this.openMindInspector(cubicleId);
      });
    }
  }

  renderOrPatchCard(c) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(c.id);
    if (!existing) return;

    const vm = this.computeCardViewModel(c);
    if (existing.dataset.renderSignature === vm.signature) {
      return; // Zero DOM churn when nothing changed
    }

    const ticker = existing.querySelector('.surface-thoughts-ticker');
    if (!ticker) {
      const replacement = this.createCubicleCard(c);
      existing.replaceWith(replacement);
      return;
    }

    // Patch card attributes & classes in place for calm scrolling
    existing.className = `cubicle-card openrig-seat-card state-${vm.status} op-${vm.op.state}`;
    existing.dataset.active = vm.isWorking ? 'true' : 'false';
    existing.dataset.operationalState = vm.op.state;
    existing.dataset.renderSignature = vm.signature;

    const header = existing.querySelector('.openrig-seat-header');
    if (header) {
      header.title = `${c.id.toUpperCase()} · ${vm.fullModel} · State: ${vm.op.label}`;
    }

    const dot = existing.querySelector('.openrig-activity-dot');
    if (dot) {
      dot.className = `openrig-activity-dot dot-${vm.status} dot-op-${vm.op.state}`;
      dot.setAttribute('aria-label', `status: ${vm.op.state}`);
    }

    const stateBadge = existing.querySelector('.cubicle-state-badge');
    if (stateBadge) {
      stateBadge.className = `cubicle-state-badge state-badge-${vm.op.state}`;
      stateBadge.dataset.stateBadge = vm.op.state;
      stateBadge.textContent = vm.op.label;
    }

    const runtimeBadge = existing.querySelector('.openrig-runtime-badge');
    if (runtimeBadge) {
      runtimeBadge.title = vm.fullModel;
      runtimeBadge.innerHTML = `${vm.iconSvg}<span class="cubicle-model-name">${this.escapeHtml(vm.shortModel)}</span>`;
    }

    const metricEl = existing.querySelector('.openrig-context-metric');
    if (metricEl) {
      metricEl.className = `openrig-context-metric ${vm.contextClass}`;
      metricEl.title = vm.metricTitle;
      metricEl.textContent = vm.metricText;
    }

    let taskPill = existing.querySelector('.cubicle-task-pill');
    if (taskPill) {
      if (vm.taskTitle) {
        taskPill.style.display = '';
        taskPill.title = vm.taskTitle;
        taskPill.textContent = vm.taskTitle;
      } else {
        taskPill.style.display = 'none';
        taskPill.textContent = '';
      }
    }

    // Calm scroll preservation: keep pinned at top (0) unless user scrolled down
    const prevScrollTop = ticker.scrollTop || 0;
    const prevScrollHeight = ticker.scrollHeight || 0;
    const wasPinnedToLatest = prevScrollTop <= 16 && !this.userScrollLockByCubicle.get(c.id);

    ticker.className = `surface-thoughts-ticker openrig-smoked-plate ${vm.isWorking ? 'thinking-active' : ''}`;
    ticker.innerHTML = this.buildEntriesMarkup(vm.entries);

    if (wasPinnedToLatest) {
      ticker.scrollTop = 0;
    } else {
      const heightDelta = Math.max(0, (ticker.scrollHeight || 0) - prevScrollHeight);
      ticker.scrollTop = prevScrollTop + heightDelta;
    }
  }

  updateCubicle(cubicle) {
    if (!cubicle || !cubicle.id) return;
    const prev = this.cubicles.get(cubicle.id) || {};
    this.ingestCubicleStream(cubicle);

    const merged = {
      ...prev,
      ...cubicle,
      thought_stream: (this.activityLedger.get(cubicle.id) || []).slice(-25),
      fatigue_percentage: Math.max(
        Number(prev.fatigue_percentage || 0),
        Number(cubicle.fatigue_percentage || 0)
      ),
      assigned_task_title:
        cubicle.status === 'idle' || cubicle.status === 'vacant'
          ? null
          : cubicle.assigned_task_title || prev.assigned_task_title || null,
      assigned_task_desc:
        cubicle.status === 'idle' || cubicle.status === 'vacant'
          ? null
          : cubicle.assigned_task_desc || prev.assigned_task_desc || null,
    };

    this.cubicles.set(cubicle.id, merged);
    this.renderOrPatchCard(merged);

    if (this.inspectedCubicleId === cubicle.id) {
      void this.renderMindInspectorContent(merged);
    }
  }

  async syncLiveTelemetry(tasksData = null, options = {}) {
    let anyFetchSucceeded = false;
    let anyFetchAttempted = false;

    // 1. Fetch live cubicles snapshot from /api/cubicles (authoritative in-memory server state)
    try {
      anyFetchAttempted = true;
      const cubRes = await fetch(`/api/cubicles?t=${Date.now()}`, { cache: 'no-store' });
      if (cubRes.ok) {
        anyFetchSucceeded = true;
        const cubJson = await cubRes.json();
        if (Array.isArray(cubJson.cubicles)) {
          for (const srvCub of cubJson.cubicles) {
            if (!srvCub?.id) continue;
            const existing = this.cubicles.get(srvCub.id) || {};
            const merged = { ...existing, ...srvCub };
            this.cubicles.set(srvCub.id, merged);
            this.ingestCubicleStream(merged);
          }
        }
      }
    } catch {}

    // 2. Fetch or ingest Kanban tasks (/api/tasks) for real progress notes, diffs, and column state
    if (!tasksData) {
      try {
        anyFetchAttempted = true;
        const tRes = await fetch(`/api/tasks?t=${Date.now()}`, { cache: 'no-store' });
        if (tRes.ok) {
          anyFetchSucceeded = true;
          const tJson = await tRes.json();
          tasksData = tJson.tasks || null;
        }
      } catch {}
    } else {
      anyFetchSucceeded = true;
    }

    if (tasksData) {
      this.tasksByCubicle.clear();
      for (const col of ['in_progress', 'review', 'todo']) {
        for (const t of tasksData[col] || []) {
          if (t.assigned_cubicle && !this.tasksByCubicle.has(t.assigned_cubicle)) {
            this.tasksByCubicle.set(t.assigned_cubicle, { task: t, col });
          }
          if (t.assigned_cubicle && this.cubicles.has(t.assigned_cubicle)) {
            this.ingestTaskUpdate(t, 'TASK_POLL');
          }
        }
      }
    }

    // 3. Fetch server activity reconciler (/api/swarm/activity) for orphan/stall detection
    try {
      anyFetchAttempted = true;
      const actRes = await fetch(`/api/swarm/activity?t=${Date.now()}`, { cache: 'no-store' });
      if (actRes.ok) {
        anyFetchSucceeded = true;
        const actJson = await actRes.json();
        if (actJson?.activity) {
          this.ingestActivitySnapshot(actJson.activity);
        }
      }
    } catch {}

    // 4. Fetch recent peer messages (/api/messages) so peer tool activity streams live
    try {
      anyFetchAttempted = true;
      const msgRes = await fetch(`/api/messages?limit=30&t=${Date.now()}`, { cache: 'no-store' });
      if (msgRes.ok) {
        anyFetchSucceeded = true;
        const msgJson = await msgRes.json();
        if (Array.isArray(msgJson?.messages)) {
          for (const m of msgJson.messages) {
            this.ingestPeerMessage(m, false);
          }
        }
      }
    } catch {}

    // 5. Poll disk status files for enabled cubicles and reconcile
    for (const [id, cub] of this.cubicles.entries()) {
      if (!cub.config?.enabled) {
        this.renderOrPatchCard(cub);
        continue;
      }

      let diskState = null;
      try {
        anyFetchAttempted = true;
        const res = await fetch(
          `/api/media/serve?path=${encodeURIComponent(`.swarm/status/${id}.json`)}&t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          anyFetchSucceeded = true;
          diskState = await res.json();
        }
      } catch {}

      if (diskState) {
        this.ingestCubicleStream(diskState);
      }

      const taskEntry = this.tasksByCubicle.get(id);
      const effectiveStatus = diskState?.status || cub.status;
      const updated = {
        ...cub,
        ...(diskState || {}),
        status: effectiveStatus,
        current_task_id:
          taskEntry?.task?.id ||
          (effectiveStatus === 'idle' ? null : diskState?.current_task_id || cub.current_task_id),
        assigned_task_title:
          taskEntry?.task?.title ||
          (effectiveStatus === 'idle' ? null : cub.assigned_task_title || null),
        assigned_task_desc:
          taskEntry?.task?.description ||
          (effectiveStatus === 'idle' ? null : cub.assigned_task_desc || null),
        assigned_task_col: taskEntry?.col || (effectiveStatus === 'idle' ? null : cub.assigned_task_col || null),
        thought_stream: (this.activityLedger.get(id) || []).slice(-25),
        fatigue_percentage: Math.max(
          Number(cub.fatigue_percentage || 0),
          Number(diskState?.fatigue_percentage || 0)
        ),
      };

      this.cubicles.set(id, updated);
      this.renderOrPatchCard(updated);

      if (this.inspectedCubicleId === id) {
        await this.renderMindInspectorContent(updated);
      }
    }

    if (anyFetchAttempted) {
      if (anyFetchSucceeded) {
        this.consecutiveFetchFailures = 0;
        const beaconOffline =
          typeof document !== 'undefined' &&
          Boolean(document.getElementById('ws-status-beacon')?.classList?.contains('offline'));
        if (!beaconOffline && this.connectionState !== 'connected') {
          this.setConnectionState('connected');
        }
      } else {
        this.consecutiveFetchFailures += 1;
        if (this.consecutiveFetchFailures >= 2) {
          this.setConnectionState('disconnected');
        }
      }
    }
  }

  async openMindInspector(cubicleId) {
    this.ensureMindInspectorDrawer();
    this.inspectedCubicleId = cubicleId;
    const cub = this.cubicles.get(cubicleId);
    if (!cub || !this.mindDrawer) return;

    this.mindDrawer.classList.remove('hidden');
    const titleEl = this.mindDrawer.querySelector('#cubicle-mind-title');
    if (titleEl) {
      titleEl.textContent = `${cubicleId.toUpperCase()} // OPENRIG WORKER MIND STREAM`;
    }

    await this.renderMindInspectorContent(cub);
  }

  closeMindInspector() {
    this.inspectedCubicleId = null;
    if (this.mindDrawer) {
      this.mindDrawer.classList.add('hidden');
    }
  }

  async renderMindInspectorContent(cub) {
    if (!this.mindDrawer) return;
    const body = this.mindDrawer.querySelector('#cubicle-mind-body');
    if (!body) return;

    const modelName = cub.config?.display_name || cub.config?.model || 'Unassigned';
    const thinkingLevel = cub.config?.thinking_level || 'Standard';
    const thinkingBudget = Number(cub.config?.thinking_budget_tokens || 0).toLocaleString();
    const op = this.resolveOperationalState(cub);
    const entries = this.resolveThoughtFeed(cub);

    let peerMessages = [];
    try {
      const res = await fetch(`/api/messages?cubicle=${encodeURIComponent(cub.id)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        peerMessages = data.messages || [];
      }
    } catch {}

    const thoughtsHtml = entries
      .slice()
      .reverse()
      .map((item, idx) => {
        const timeStr = this.formatTimeLabel(item.timestamp) || '--:--:--';
        return `
          <div class="mind-stream-entry ${idx === 0 ? 'latest' : ''}">
            <div class="mind-stream-meta">
              <span class="mind-stream-badge">${idx === 0 ? '💭 LATEST ACTIVITY' : '↳ STEP'}</span>
              <span class="mind-stream-time">${this.escapeHtml(timeStr)}</span>
            </div>
            <div class="mind-stream-text">${this.escapeHtml(item.text)}</div>
          </div>
        `;
      })
      .join('');

    const peerHtml = peerMessages.length
      ? peerMessages
          .slice(-6)
          .reverse()
          .map(
            (m) => `
            <div class="mind-peer-entry">
              <span class="mind-peer-route">${this.escapeHtml(m.from)} → ${this.escapeHtml(m.to)} [${this.escapeHtml(m.topic || 'sync')}]</span>
              <div class="mind-peer-text">${this.escapeHtml(m.text || m.body || m.message || '')}</div>
            </div>
          `
          )
          .join('')
      : `<div class="mind-empty-note">No inter-cubicle messages recorded for ${this.escapeHtml(cub.id)} yet.</div>`;

    body.innerHTML = `
      <div class="mind-worker-summary">
        <div class="mind-summary-row">
          <span class="mind-label">MODEL</span>
          <span class="mind-value">${this.escapeHtml(modelName)}</span>
        </div>
        <div class="mind-summary-row">
          <span class="mind-label">REASONING TIER</span>
          <span class="mind-value">${this.escapeHtml(thinkingLevel)} (${thinkingBudget} tok budget)</span>
        </div>
        <div class="mind-summary-row">
          <span class="mind-label">OPERATIONAL STATE</span>
          <span class="mind-value status-${this.escapeHtml(op.state)}">${this.escapeHtml(op.label)}</span>
        </div>
        <div class="mind-summary-row">
          <span class="mind-label">WORKTREE</span>
          <span class="mind-value mono">${this.escapeHtml(cub.branch_name || `swarm/${cub.id}`)}</span>
        </div>
      </div>

      <div class="mind-section-block">
        <div class="mind-section-header">📌 CURRENT ASSIGNED DIRECTIVE</div>
        ${
          cub.assigned_task_title
            ? `
              <div class="mind-task-box">
                <div class="mind-task-title">${this.escapeHtml(cub.assigned_task_title)} <span class="mind-task-id">[${this.escapeHtml(cub.current_task_id || 'active')}]</span></div>
                ${cub.assigned_task_desc ? `<div class="mind-task-desc">${this.escapeHtml(cub.assigned_task_desc)}</div>` : ''}
              </div>
            `
            : `<div class="mind-empty-note">No active Kanban task assigned to this cubicle.</div>`
        }
      </div>

      <div class="mind-section-block">
        <div class="mind-section-header">💭 LIVE WORKER THOUGHT &amp; ACTION STREAM</div>
        <div class="mind-stream-list">
          ${thoughtsHtml}
        </div>
      </div>

      <div class="mind-section-block">
        <div class="mind-section-header">📡 PEER CUBICLE SYNAPSES</div>
        <div class="mind-peer-list">
          ${peerHtml}
        </div>
      </div>
    `;
  }

  openSandboxPreview(cubicleId, port) {
    if (!this.sandboxDrawer || !this.sandboxIframe) return;
    this.sandboxDrawer.classList.remove('hidden');
    if (this.sandboxTitle) {
      this.sandboxTitle.textContent = `${cubicleId.toUpperCase()} // SANDBOX PREVIEW (PORT ${port})`;
    }
    this.sandboxIframe.src = `http://localhost:${port}/`;
  }

  closeSandboxPreview() {
    if (this.sandboxDrawer) {
      this.sandboxDrawer.classList.add('hidden');
      if (this.sandboxIframe) this.sandboxIframe.src = 'about:blank';
    }
  }

  setContracts(contracts) {
    this.contracts = contracts || [];
    this.updateDependencyLines();
  }

  updateDependencyLines() {
    if (!this.svgContainer || !this.gridContainer) return;
    this.svgContainer.innerHTML = '';
    if (this.contracts.length === 0) return;

    const gridRect = this.gridContainer.getBoundingClientRect();
    this.svgContainer.setAttribute('viewBox', `0 0 ${gridRect.width} ${gridRect.height}`);

    this.contracts.forEach((c) => {
      const providerId = c.providerCubicle || 'cubicle-01';
      const consumerId = c.consumerCubicle || (providerId === 'cubicle-01' ? 'cubicle-02' : 'cubicle-01');

      const el1 = document.getElementById(providerId);
      const el2 = document.getElementById(consumerId);
      if (!el1 || !el2) return;

      const r1 = el1.getBoundingClientRect();
      const r2 = el2.getBoundingClientRect();

      const x1 = r1.left - gridRect.left + r1.width / 2;
      const y1 = r1.top - gridRect.top + r1.height / 2;
      const x2 = r2.left - gridRect.left + r2.width / 2;
      const y2 = r2.top - gridRect.top + r2.height / 2;

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - 30;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`);
      path.setAttribute('stroke', 'var(--color-cyan)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-dasharray', '5 3');
      path.setAttribute('opacity', '0.75');

      this.svgContainer.appendChild(path);
    });
  }
}

let cubicleGridInstance = null;
export async function initCubicleGrid(app) {
  if (!cubicleGridInstance) {
    cubicleGridInstance = new CubicleGridController(app);
  } else if (app) {
    cubicleGridInstance.attachApp(app);
  }
  return cubicleGridInstance;
}
export function updateCubicleState(cubicle) {
  if (cubicleGridInstance) {
    cubicleGridInstance.updateCubicle(cubicle);
  }
}
export function handleSauronTarget(mode, targetCubicleId) {
  // Handled by twin sauron canvas
}
