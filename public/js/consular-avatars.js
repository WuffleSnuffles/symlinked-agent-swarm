/**
 * src/public/js/consular-avatars.js
 *
 * Corner Consular Avatars, Scenario State Machine, Real Solo-Work Telemetry & Wrestling Clash Engine.
 * Features:
 * - Nia Nova (Mid-20s, Idealist Light-Mage Cyberpunk).
 * - Ferric Lunaux (Lucian-Inspired, Late-30s, Grumpy with Crossed Arms).
 * - Independent Working State ('independent_working'): shows each Consul's independent live activity
 *   (checking workers, working, verifying, debating, or idle) driven by real swarm & Consul signals.
 * - Deterministic Stale-State Clearing: expires finished/orphaned cubicle, thought, vote, and debate states.
 * - Signature Wrestling Clash Stage on prolonged debate (>= 4 turns) or deadlock.
 * - Canvas 2D Physics Spark Emitter and Atmospheric Particle Engine.
 * - Manual Scenario Selector Drawer for live demo/testing.
 */

const SIGNAL_TTL_MS = 20000;
const VOTE_SIGNAL_TTL_MS = 35000;
const CUBICLE_SIGNAL_TTL_MS = 45000;
const HEARTBEAT_TTL_MS = 45000;
const DEBATE_STALE_TTL_MS = 45000;

export function isConsularAvatarNoise(rawText) {
  const text = String(rawText || '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .trim()
    .replace(/^(?:Nia|Ferric)(?:\s*(?:\u2192|->)\s*(?:Nia|Ferric))?:\s*/i, '')
    .replace(/^\[DELIBERATE:\s*([\s\S]*?)\s*\]$/i, '$1')
    .replace(/^["']([\s\S]*)["']$/, '$1')
    .trim();
  return (
    !text ||
    text === '[PASS]' ||
    /^[\d,\s.:%+-]+$/.test(text) ||
    /^(?:(?:input|output|total|cached|reasoning)[ _-]+)?tokens?(?:[ _-]+(?:used|count))?\s*(?::|=|$|\d)/i.test(text) ||
    /^[\d,]+\s+tokens?\b/i.test(text) ||
    /^(?:OpenAI Codex\b|workdir:|model:|provider:|approval:|sandbox:|session id:|reasoning (?:effort|summaries):|Reading additional input\b|mcp(?:\s|:)|(?:exec|user|codex|assistant|system|thinking)\s*$)/i.test(text) ||
    /^(?:Respond directly to the Overseer\b|You are Consul (?:Nia Nova|Ferric Lunaux)\b|Your underlying CLI\/model\b|Personality(?:\s*&\s*Readability Skill)?:\s|WORKSPACE, GITHUB & KANBAN\b|Live Swarm Status:\s|Recent Console Transcript:\s*|Overseer just said:\s)/i.test(text) ||
    /^(?:[{}\[\],]+\s*$|\{|\[\s*(?:\{|"|\d|\]|true\b|false\b|null\b)|"[^"\n]+"\s*:)/.test(text) ||
    /^(?:\x60\x60\x60(?:json|jsonl)?\s*$|(?:succeeded|exited) in\s+\d|Process exited with code\b|Wall time:|Total output lines:)/i.test(text)
  );
}

export function classifyConsulActivityMode(rawText, fallbackMode = 'working') {
  const text = String(rawText || '').trim();
  if (!text || /^idle\b/i.test(text)) return 'idle';
  if (/\b(debat(?:e|ing)|deliberat(?:e|ing)|challenging veto)\b/i.test(text)) return 'debating';
  if (
    /\b(gate\s*2|review(?:ing)?|verif(?:y|ying)|audit(?:ing)?|inspect(?:ing)?|boundary|test(?:s|ing)?|diff(?:s)?|voted|approv(?:e|ed|ing)|veto)\b/i.test(
      text
    )
  ) {
    return 'verifying';
  }
  if (/\b(cubicle-\d+|checking\b.*worker|worker(?:s)?|dispatch(?:ing)?|accelerating)\b/i.test(text)) {
    return 'checking_workers';
  }
  return fallbackMode;
}

function summarizeThoughtForPill(rawText, maxLen = 32) {
  const cleaned = String(rawText || '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/^\[DELIBERATE:\s*/i, '')
    .replace(/\]$/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/^(?:Consul\s+(?:Nia\s+Nova|Ferric\s+Lunaux)|Nia|Ferric)(?:\s*(?:\u2192|->)\s*(?:Nia|Ferric))?:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || isConsularAvatarNoise(cleaned)) return '';
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).trim()}…` : cleaned;
}

export class ConsularAvatarsController {
  constructor(options = {}) {
    this.signalTtlMs = options.signalTtlMs ?? SIGNAL_TTL_MS;
    this.voteSignalTtlMs = options.voteSignalTtlMs ?? VOTE_SIGNAL_TTL_MS;
    this.cubicleTtlMs = options.cubicleTtlMs ?? CUBICLE_SIGNAL_TTL_MS;
    this.heartbeatTtlMs = options.heartbeatTtlMs ?? HEARTBEAT_TTL_MS;
    this.debateStaleMs = options.debateStaleMs ?? DEBATE_STALE_TTL_MS;

    this.widget = typeof document !== 'undefined' ? document.getElementById('consular-prompt-avatar-widget') : null;
    this.stageDual = typeof document !== 'undefined' ? document.getElementById('stage-dual-consuls') : null;
    this.stageWrestling = typeof document !== 'undefined' ? document.getElementById('stage-wrestling-clash') : null;
    this.stateLabel = typeof document !== 'undefined' ? document.getElementById('avatar-state-label') : null;
    this.drawer = typeof document !== 'undefined' ? document.getElementById('consular-scenario-drawer') : null;
    this.drawerToggleBtn = typeof document !== 'undefined' ? document.getElementById('avatar-drawer-toggle') : null;
    this.liveSyncBtn = typeof document !== 'undefined' ? document.getElementById('drawer-live-sync-btn') : null;
    this.fxCanvas = typeof document !== 'undefined' ? document.getElementById('avatar-fx-canvas') : null;
    this.ctx = this.fxCanvas && typeof this.fxCanvas.getContext === 'function' ? this.fxCanvas.getContext('2d') : null;

    this.speechTicker = typeof document !== 'undefined' ? document.getElementById('avatar-speech-ticker') : null;
    this.speechBadge = typeof document !== 'undefined' ? document.getElementById('speech-consul-badge') : null;
    this.speechText = typeof document !== 'undefined' ? document.getElementById('speech-content-text') : null;

    this.ensureSoloActivityPills();

    this.currentState = 'idle_observing';
    this.manualScenario = null;
    this.debateTurns = 0;
    this.liveSync = true;
    this.resetTimer = null;
    this.soloCycleIndex = 0;

    this.activeCubiclesById = new Map();
    this.consulSignals = {
      nia: null,
      ferric: null,
    };
    this.activeDebate = {
      active: false,
      startedAt: 0,
      lastTurnAt: 0,
      niaReplied: false,
      ferricReplied: false,
    };

    this.latestSwarmContext = {
      state: 'idle',
      workingCubicles: [],
      inProgressCount: 0,
      reviewCount: 0,
      todoCount: 0,
      orphanedCount: 0,
      niaThought: '',
      ferricThought: '',
      niaThoughtAt: 0,
      ferricThoughtAt: 0,
      heartbeatAt: 0,
    };

    this.lastComputedActivities = {
      nia: { mode: 'idle', text: 'Idle · standing by' },
      ferric: { mode: 'idle', text: 'Idle · standing by' },
      headerLabel: 'IDLE OBSERVING',
    };

    // Sparks and particles for wrestling clash and FX
    this.sparks = [];
    this.fxTime = 0;

    this.initDrawer();
    this.initCanvas();
    this.seedFromDomTelemetry();
    this.setScenario(this.resolveBaselineScenario(), 0, 'Initialized avatar state');
    this.startSoloActivityTicker();
    this.startFxLoop();

    if (options.autoSync !== false) {
      void this.syncLiveActivitySnapshot();
    }
  }

  ensureSoloActivityPills() {
    if (typeof document === 'undefined') return;

    const niaStage = document.getElementById('consul-stage-nia');
    if (niaStage && !document.getElementById('nia-solo-activity-pill')) {
      const pill = document.createElement('div');
      pill.id = 'nia-solo-activity-pill';
      pill.className = 'avatar-solo-activity-pill nia-activity-pill';
      pill.setAttribute('title', 'Nia Nova current independent activity');
      pill.innerHTML =
        '<span class="solo-activity-dot"></span><span id="nia-solo-activity-text" class="solo-activity-text">Idle · standing by</span>';
      niaStage.appendChild(pill);
    }

    const ferricStage = document.getElementById('consul-stage-ferric');
    if (ferricStage && !document.getElementById('ferric-solo-activity-pill')) {
      const pill = document.createElement('div');
      pill.id = 'ferric-solo-activity-pill';
      pill.className = 'avatar-solo-activity-pill ferric-activity-pill';
      pill.setAttribute('title', 'Ferric Lunaux current independent activity');
      pill.innerHTML =
        '<span class="solo-activity-dot"></span><span id="ferric-solo-activity-text" class="solo-activity-text">Idle · standing by</span>';
      ferricStage.appendChild(pill);
    }

    if (this.drawer) {
      const grid = this.drawer.querySelector('.drawer-grid');
      if (grid && !grid.querySelector('[data-scenario="independent_working"]')) {
        const soloBtn = document.createElement('button');
        soloBtn.className = 'scenario-btn highlight-cyan';
        soloBtn.setAttribute('data-scenario', 'independent_working');
        soloBtn.innerHTML = '<span class="idx">01B</span> SOLO WORK';
        const idleBtn = grid.querySelector('[data-scenario="idle_observing"]');
        if (idleBtn && idleBtn.nextSibling) {
          grid.insertBefore(soloBtn, idleBtn.nextSibling);
        } else {
          grid.appendChild(soloBtn);
        }
      }
    }

    this.niaStage = niaStage;
    this.ferricStage = ferricStage;
    this.niaSoloPill = document.getElementById('nia-solo-activity-pill');
    this.niaSoloText = document.getElementById('nia-solo-activity-text');
    this.ferricSoloPill = document.getElementById('ferric-solo-activity-pill');
    this.ferricSoloText = document.getElementById('ferric-solo-activity-text');
  }

  seedFromDomTelemetry(now = Date.now()) {
    if (typeof document === 'undefined') return;
    const progEl = document.getElementById('counter-prog');
    const revEl = document.getElementById('counter-review');
    const todoEl = document.getElementById('counter-todo');

    const inProg = Number(progEl?.textContent || 0);
    const rev = Number(revEl?.textContent || 0);
    const todo = Number(todoEl?.textContent || 0);

    if (inProg > 0 || rev > 0 || todo > 0) {
      this.latestSwarmContext.inProgressCount = inProg;
      this.latestSwarmContext.reviewCount = rev;
      this.latestSwarmContext.todoCount = todo;
      this.latestSwarmContext.heartbeatAt = now;
    }

    const cards = document.querySelectorAll('.cubicle-card[data-cubicle-id], .cubicle-card[id^="cubicle-"]');
    cards.forEach((card) => {
      const id = card.getAttribute('data-cubicle-id') || card.id;
      const status =
        card.getAttribute('data-status') ||
        (card.classList.contains('status-working')
          ? 'working'
          : card.classList.contains('status-under_inspection')
            ? 'under_inspection'
            : '');
      if (id && (status === 'working' || status === 'under_inspection')) {
        this.activeCubiclesById.set(id, {
          id,
          status,
          taskId: null,
          taskTitle: null,
          latestThought: '',
          updatedAt: now,
        });
      }
    });
    if (this.activeCubiclesById.size > 0) {
      this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
    }
  }

  initDrawer() {
    if (this.drawerToggleBtn && this.drawer) {
      this.drawerToggleBtn.addEventListener('click', () => {
        const isCollapsed = this.drawer.classList.contains('collapsed');
        if (isCollapsed) {
          this.drawer.classList.remove('collapsed');
          if (this.widget) this.widget.classList.add('drawer-open');
          this.drawerToggleBtn.textContent = '[DEMO ▲]';
        } else {
          this.drawer.classList.add('collapsed');
          if (this.widget) this.widget.classList.remove('drawer-open');
          this.drawerToggleBtn.textContent = '[DEMO ▼]';
        }
      });
    }

    if (this.liveSyncBtn) {
      this.liveSyncBtn.addEventListener('click', () => {
        this.liveSync = !this.liveSync;
        if (this.liveSync) {
          this.manualScenario = null;
        }
        this.liveSyncBtn.textContent = this.liveSync ? 'LIVE SYNC: ON' : 'LIVE SYNC: MANUAL';
        this.liveSyncBtn.style.color = this.liveSync ? 'var(--color-phosphor)' : 'var(--color-amber)';
        if (this.liveSync) {
          this.reconcileBaselineScenario();
        }
      });
    }

    if (typeof document !== 'undefined') {
      const buttons = document.querySelectorAll('.scenario-btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const scenario = btn.getAttribute('data-scenario');
          if (scenario) {
            buttons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            this.setScenario(scenario, 0, 'Manual Test Selection', true);
          }
        });
      });
    }
  }

  initCanvas() {
    if (!this.fxCanvas) return;
    this.fxCanvas.width = 270;
    this.fxCanvas.height = 110;
  }

  startSoloActivityTicker() {
    this.stopSoloActivityTicker();
    this.soloActivityTimer = setInterval(() => {
      const now = Date.now();
      this.soloCycleIndex = (this.soloCycleIndex + 1) % 12;
      this.pruneStaleStates(now);
      if (this.liveSync && !this.manualScenario) {
        this.reconcileBaselineScenario(now);
        if (now - (this.latestSwarmContext.heartbeatAt || 0) > 15000) {
          void this.syncLiveActivitySnapshot();
        }
      }
      this.refreshSoloActivityLabels(now);
    }, 5000);
    if (typeof this.soloActivityTimer?.unref === 'function') {
      this.soloActivityTimer.unref();
    }
  }

  stopSoloActivityTicker() {
    if (this.soloActivityTimer) {
      clearInterval(this.soloActivityTimer);
      this.soloActivityTimer = null;
    }
  }

  setConsulSignal(consulKey, signal) {
    if (consulKey !== 'nia' && consulKey !== 'ferric') return;
    const now = signal?.updatedAt ?? Date.now();
    const expiresAt = signal?.expiresAt ?? now + this.signalTtlMs;
    const text = String(signal?.text || '').trim();
    if (!text) return;

    const mode = signal?.mode || classifyConsulActivityMode(text, consulKey === 'nia' ? 'working' : 'verifying');
    this.consulSignals[consulKey] = {
      mode,
      text,
      targetId: signal?.targetId || null,
      updatedAt: now,
      expiresAt,
    };

    if (consulKey === 'nia') {
      this.latestSwarmContext.niaThought = text;
      this.latestSwarmContext.niaThoughtAt = now;
    } else {
      this.latestSwarmContext.ferricThought = text;
      this.latestSwarmContext.ferricThoughtAt = now;
    }
  }

  clearConsulSignal(consulKey, onlyMode = null) {
    if (consulKey !== 'nia' && consulKey !== 'ferric') return;
    const current = this.consulSignals[consulKey];
    if (onlyMode && current && current.mode !== onlyMode) {
      return;
    }
    this.consulSignals[consulKey] = null;
    if (consulKey === 'nia') {
      this.latestSwarmContext.niaThought = '';
      this.latestSwarmContext.niaThoughtAt = 0;
    } else {
      this.latestSwarmContext.ferricThought = '';
      this.latestSwarmContext.ferricThoughtAt = 0;
    }
  }

  clearConsulSignalsForTarget(targetId) {
    if (!targetId) return;
    const targetStr = String(targetId);
    for (const key of ['nia', 'ferric']) {
      const sig = this.consulSignals[key];
      if (sig && (sig.targetId === targetStr || sig.text.includes(targetStr))) {
        this.clearConsulSignal(key);
      }
    }
  }

  clearAllStaleStates() {
    this.activeCubiclesById.clear();
    this.clearConsulSignal('nia');
    this.clearConsulSignal('ferric');
    this.activeDebate = {
      active: false,
      startedAt: 0,
      lastTurnAt: 0,
      niaReplied: false,
      ferricReplied: false,
    };
    this.debateTurns = 0;
    this.latestSwarmContext.state = 'idle';
    this.latestSwarmContext.workingCubicles = [];
    this.latestSwarmContext.inProgressCount = 0;
    this.latestSwarmContext.reviewCount = 0;
    this.latestSwarmContext.orphanedCount = 0;
    this.latestSwarmContext.heartbeatAt = 0;
    this.reconcileBaselineScenario();
    this.refreshSoloActivityLabels();
  }

  pruneStaleStates(now = Date.now()) {
    // 1. Prune expired structured Consul signals
    for (const key of ['nia', 'ferric']) {
      const sig = this.consulSignals[key];
      if (sig && now >= sig.expiresAt) {
        this.clearConsulSignal(key);
      }
    }

    // 2. Prune legacy direct thought fields on latestSwarmContext
    if (
      this.latestSwarmContext.niaThought &&
      this.latestSwarmContext.niaThoughtAt > 0 &&
      now - this.latestSwarmContext.niaThoughtAt >= this.signalTtlMs
    ) {
      this.latestSwarmContext.niaThought = '';
      this.latestSwarmContext.niaThoughtAt = 0;
      if (this.consulSignals.nia && now >= this.consulSignals.nia.expiresAt) {
        this.consulSignals.nia = null;
      }
    }
    if (
      this.latestSwarmContext.ferricThought &&
      this.latestSwarmContext.ferricThoughtAt > 0 &&
      now - this.latestSwarmContext.ferricThoughtAt >= this.signalTtlMs
    ) {
      this.latestSwarmContext.ferricThought = '';
      this.latestSwarmContext.ferricThoughtAt = 0;
      if (this.consulSignals.ferric && now >= this.consulSignals.ferric.expiresAt) {
        this.consulSignals.ferric = null;
      }
    }

    // 3. Prune expired cubicle entries
    let cubiclesPruned = false;
    for (const [cubId, entry] of this.activeCubiclesById.entries()) {
      if (now - (entry.updatedAt || 0) >= this.cubicleTtlMs) {
        this.activeCubiclesById.delete(cubId);
        this.clearConsulSignalsForTarget(cubId);
        cubiclesPruned = true;
      }
    }
    if (cubiclesPruned) {
      this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
    } else if (Array.isArray(this.latestSwarmContext.workingCubicles)) {
      this.latestSwarmContext.workingCubicles = this.latestSwarmContext.workingCubicles.filter((w) => {
        if (!w) return false;
        if (w.updatedAt && now - w.updatedAt >= this.cubicleTtlMs) return false;
        return true;
      });
    }

    // 4. Prune stale heartbeat counts when no heartbeat has arrived within TTL
    if (
      this.latestSwarmContext.heartbeatAt > 0 &&
      now - this.latestSwarmContext.heartbeatAt >= this.heartbeatTtlMs &&
      this.activeCubiclesById.size === 0
    ) {
      this.latestSwarmContext.state = 'idle';
      this.latestSwarmContext.workingCubicles = [];
      this.latestSwarmContext.inProgressCount = 0;
      this.latestSwarmContext.reviewCount = 0;
      this.latestSwarmContext.orphanedCount = 0;
      this.latestSwarmContext.heartbeatAt = 0;
    }

    // 5. Prune stuck debate state if no turn activity occurred within debateStaleMs
    if (this.activeDebate.active) {
      const lastRef = this.activeDebate.lastTurnAt || this.activeDebate.startedAt || 0;
      if (lastRef > 0 && now - lastRef >= this.debateStaleMs) {
        this.activeDebate = {
          active: false,
          startedAt: 0,
          lastTurnAt: 0,
          niaReplied: false,
          ferricReplied: false,
        };
        this.debateTurns = 0;
        this.clearConsulSignal('nia', 'debating');
        this.clearConsulSignal('ferric', 'debating');
      }
    }
  }

  getActiveCubiclesList(now = Date.now()) {
    this.pruneStaleStates(now);
    const merged = new Map();
    for (const [id, entry] of this.activeCubiclesById.entries()) {
      merged.set(id, entry);
    }
    if (Array.isArray(this.latestSwarmContext.workingCubicles)) {
      for (const raw of this.latestSwarmContext.workingCubicles) {
        if (!raw || !raw.id) continue;
        if (!merged.has(raw.id)) {
          merged.set(raw.id, {
            id: String(raw.id),
            status: raw.status || 'working',
            taskId: raw.taskId || null,
            taskTitle: raw.taskTitle || null,
            latestThought: String(raw.latestThought || '').trim(),
            updatedAt: raw.updatedAt || this.latestSwarmContext.heartbeatAt || now,
          });
        }
      }
    }
    return Array.from(merged.values());
  }

  hasRealIndependentActivity(now = Date.now()) {
    this.pruneStaleStates(now);
    const activeCubicles = this.getActiveCubiclesList(now);
    if (activeCubicles.length > 0) return true;

    const reviewCount = Number(this.latestSwarmContext.reviewCount || 0);
    if (reviewCount > 0) return true;

    const inProgressCount = Number(this.latestSwarmContext.inProgressCount || 0);
    const orphanedCount = Number(this.latestSwarmContext.orphanedCount || 0);
    const activeInProgress =
      this.latestSwarmContext.state === 'stalled' ? 0 : Math.max(0, inProgressCount - orphanedCount);
    if (activeInProgress > 0) return true;

    if (this.consulSignals.nia || this.consulSignals.ferric) return true;

    if (
      this.latestSwarmContext.niaThought &&
      (this.latestSwarmContext.niaThoughtAt === 0 ||
        now - this.latestSwarmContext.niaThoughtAt < this.signalTtlMs)
    ) {
      return true;
    }
    if (
      this.latestSwarmContext.ferricThought &&
      (this.latestSwarmContext.ferricThoughtAt === 0 ||
        now - this.latestSwarmContext.ferricThoughtAt < this.signalTtlMs)
    ) {
      return true;
    }

    return false;
  }

  resolveBaselineScenario(now = Date.now()) {
    return this.hasRealIndependentActivity(now) ? 'independent_working' : 'idle_observing';
  }

  reconcileBaselineScenario(now = Date.now()) {
    if (!this.liveSync || this.manualScenario) return;
    if (this.currentState === 'idle_observing' || this.currentState === 'independent_working') {
      const target = this.resolveBaselineScenario(now);
      if (this.currentState !== target) {
        this.setScenario(target, 0, 'Reconciled with live activity signals');
      } else {
        this.refreshSoloActivityLabels(now);
      }
    }
  }

  applyActivitySnapshot(snapshot, now = Date.now()) {
    if (!snapshot || typeof snapshot !== 'object') return;

    const incomingWorking = Array.isArray(snapshot.workingCubicles) ? snapshot.workingCubicles : [];
    const incomingIds = new Set();

    for (const w of incomingWorking) {
      if (!w || !w.id) continue;
      const cubId = String(w.id);
      incomingIds.add(cubId);
      const prev = this.activeCubiclesById.get(cubId);
      const inferredStatus =
        w.status ||
        prev?.status ||
        (snapshot.state === 'review' && Number(snapshot.inProgressCount || 0) === 0
          ? 'under_inspection'
          : 'working');
      this.activeCubiclesById.set(cubId, {
        id: cubId,
        status: inferredStatus,
        taskId: w.taskId ?? prev?.taskId ?? null,
        taskTitle: w.taskTitle ?? prev?.taskTitle ?? null,
        latestThought: String(w.latestThought ?? prev?.latestThought ?? '').trim(),
        updatedAt: now,
      });
    }

    // Clear stale cubicles that are no longer working in the authoritative snapshot
    for (const existingId of Array.from(this.activeCubiclesById.keys())) {
      if (!incomingIds.has(existingId)) {
        this.activeCubiclesById.delete(existingId);
        this.clearConsulSignalsForTarget(existingId);
      }
    }

    const orphanedList = Array.isArray(snapshot.orphanedTasks) ? snapshot.orphanedTasks : [];
    this.latestSwarmContext.state = snapshot.state || 'idle';
    this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
    this.latestSwarmContext.inProgressCount = Math.max(0, Number(snapshot.inProgressCount || 0));
    this.latestSwarmContext.reviewCount = Math.max(0, Number(snapshot.reviewCount || 0));
    this.latestSwarmContext.todoCount = Math.max(0, Number(snapshot.todoCount || 0));
    this.latestSwarmContext.orphanedCount = orphanedList.length;
    this.latestSwarmContext.heartbeatAt = now;

    // If the swarm is idle or stalled with no active workers or reviews, clear stale worker/review Consul signals
    if (
      (snapshot.state === 'idle' || snapshot.state === 'stalled') &&
      incomingWorking.length === 0 &&
      this.latestSwarmContext.reviewCount === 0
    ) {
      this.clearConsulSignal('nia', 'checking_workers');
      this.clearConsulSignal('ferric', 'checking_workers');
      this.clearConsulSignal('nia', 'verifying');
      this.clearConsulSignal('ferric', 'verifying');
    }

    if (this.currentState === 'idle_observing' || this.currentState === 'independent_working') {
      const target = this.resolveBaselineScenario(now);
      this.setScenario(target, 0, snapshot.summary || '');
    } else {
      this.refreshSoloActivityLabels(now);
    }
  }

  async syncLiveActivitySnapshot() {
    if (typeof fetch !== 'function') return;
    try {
      const res = await fetch('/api/swarm/activity', { cache: 'no-store' });
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.activity) {
          this.applyActivitySnapshot(data.activity, Date.now());
        }
      }
    } catch {}

    // If avatar is in debating or wrestling_fistfight without a locally tracked activeDebate,
    // verify against recent dialogue so stale server debate states are cleared immediately.
    if (
      this.liveSync &&
      !this.manualScenario &&
      !this.activeDebate.active &&
      (this.currentState === 'debating' || this.currentState === 'wrestling_fistfight')
    ) {
      try {
        const dialRes = await fetch('/api/governance/dialogue?limit=5', { cache: 'no-store' });
        if (dialRes && dialRes.ok) {
          const dialData = await dialRes.json();
          const list = Array.isArray(dialData?.dialogue) ? dialData.dialogue : [];
          const lastMsg = list.length > 0 ? list[list.length - 1] : null;
          const lastTs = lastMsg?.timestamp ? Date.parse(lastMsg.timestamp) : 0;
          const isStaleByTime = lastTs > 0 && Date.now() - lastTs >= this.debateStaleMs;
          const isFinishedReply =
            lastMsg &&
            lastMsg.sender !== 'Overseer' &&
            lastMsg.sender !== 'User' &&
            lastMsg.phase !== 'PLANNING_GATE' &&
            lastMsg.phase !== 'DELIBERATION';
          if (!lastMsg || isFinishedReply || isStaleByTime) {
            this.debateTurns = 0;
            this.setScenario(this.resolveBaselineScenario(), 0, 'Cleared stale debate state');
          }
        }
      } catch {}
    }
  }

  computeSoloActivities(now = Date.now()) {
    this.pruneStaleStates(now);
    const ctx = this.latestSwarmContext;
    const allActiveCubicles = this.getActiveCubiclesList(now);
    const workingCubs = allActiveCubicles.filter((c) => c.status !== 'under_inspection');
    const inspectingCubs = allActiveCubicles.filter((c) => c.status === 'under_inspection');

    const orphanedCount = Math.max(0, Number(ctx.orphanedCount || 0));
    const activeInProgressCount =
      ctx.state === 'stalled' ? 0 : Math.max(0, Number(ctx.inProgressCount || 0) - orphanedCount);
    const reviewCount = Math.max(Number(ctx.reviewCount || 0), inspectingCubs.length);
    const todoCount = Math.max(0, Number(ctx.todoCount || 0));

    const niaLiveText =
      this.consulSignals.nia?.text ||
      (ctx.niaThought && (ctx.niaThoughtAt === 0 || now - ctx.niaThoughtAt < this.signalTtlMs)
        ? ctx.niaThought
        : '');
    const ferricLiveText =
      this.consulSignals.ferric?.text ||
      (ctx.ferricThought && (ctx.ferricThoughtAt === 0 || now - ctx.ferricThoughtAt < this.signalTtlMs)
        ? ctx.ferricThought
        : '');

    let niaMode = 'idle';
    let niaText = 'Idle · standing by';

    if (niaLiveText) {
      niaText = niaLiveText;
      niaMode = this.consulSignals.nia?.mode || classifyConsulActivityMode(niaLiveText, 'working');
    } else if (workingCubs.length > 0) {
      const worker = workingCubs[this.soloCycleIndex % workingCubs.length];
      niaMode = 'checking_workers';
      niaText = worker?.id ? `Checking ${worker.id} worker` : 'Checking cubicle workers';
    } else if (reviewCount > 0) {
      const target =
        inspectingCubs.length > 0 ? inspectingCubs[this.soloCycleIndex % inspectingCubs.length] : null;
      niaMode = 'verifying';
      niaText = target?.id
        ? `Reviewing ${target.id} (Gate 2)`
        : `Reviewing ${reviewCount} Gate 2 task${reviewCount === 1 ? '' : 's'}`;
    } else if (activeInProgressCount > 0) {
      niaMode = 'working';
      niaText =
        activeInProgressCount === 1
          ? 'Working on active task'
          : `Working on ${activeInProgressCount} active tasks`;
    } else if (this.manualScenario === 'independent_working') {
      niaMode = 'checking_workers';
      niaText = 'Checking cubicle workers';
    } else {
      niaMode = 'idle';
      niaText =
        orphanedCount > 0
          ? `Idle · ${orphanedCount} stalled`
          : todoCount > 0
            ? `Idle · ${todoCount} in Todo`
            : 'Idle · standing by';
    }

    let ferricMode = 'idle';
    let ferricText = 'Idle · standing by';

    if (ferricLiveText) {
      ferricText = ferricLiveText;
      ferricMode = this.consulSignals.ferric?.mode || classifyConsulActivityMode(ferricLiveText, 'verifying');
    } else if (reviewCount > 0) {
      const target =
        inspectingCubs.length > 0 ? inspectingCubs[this.soloCycleIndex % inspectingCubs.length] : null;
      ferricMode = 'verifying';
      ferricText = target?.id
        ? `Verifying ${target.id} (Gate 2)`
        : `Verifying Gate 2 results (${reviewCount})`;
    } else if (workingCubs.length > 1) {
      const secondWorker = workingCubs[(this.soloCycleIndex + 1) % workingCubs.length];
      ferricMode = 'checking_workers';
      ferricText = secondWorker?.id ? `Checking ${secondWorker.id} worker` : 'Checking cubicle workers';
    } else if (workingCubs.length === 1) {
      const onlyWorker = workingCubs[0];
      ferricMode = 'verifying';
      ferricText = onlyWorker?.id ? `Auditing ${onlyWorker.id} output` : 'Auditing worker output';
    } else if (activeInProgressCount > 0) {
      ferricMode = 'verifying';
      ferricText =
        activeInProgressCount === 1
          ? 'Verifying in-progress work'
          : `Verifying ${activeInProgressCount} in-progress tasks`;
    } else if (this.manualScenario === 'independent_working') {
      ferricMode = 'verifying';
      ferricText = 'Verifying Gate 2 results';
    } else {
      ferricMode = 'idle';
      ferricText =
        orphanedCount > 0
          ? `Idle · ${orphanedCount} stalled`
          : todoCount > 0
            ? `Idle · ${todoCount} in Todo`
            : 'Idle · standing by';
    }

    let headerLabel = 'IDLE OBSERVING';
    if (niaMode !== 'idle' || ferricMode !== 'idle') {
      if (niaMode !== 'idle' && ferricMode === 'idle') {
        headerLabel = `SOLO WORK // NIA ${niaMode.toUpperCase().replace(/_/g, ' ')}`;
      } else if (ferricMode !== 'idle' && niaMode === 'idle') {
        headerLabel = `SOLO WORK // FERRIC ${ferricMode.toUpperCase().replace(/_/g, ' ')}`;
      } else if (workingCubs.length > 0 && reviewCount > 0) {
        headerLabel = 'SOLO WORK // WORKERS & GATE 2';
      } else if (workingCubs.length > 0) {
        headerLabel = 'SOLO WORK // CHECKING CUBICLES';
      } else if (reviewCount > 0) {
        headerLabel = 'SOLO WORK // VERIFYING GATE 2';
      } else {
        headerLabel = 'SOLO WORK // WORKING ON TASKS';
      }
    }

    this.lastComputedActivities = {
      nia: { mode: niaMode, text: niaText },
      ferric: { mode: ferricMode, text: ferricText },
      headerLabel,
    };

    return { niaMode, niaText, ferricMode, ferricText, headerLabel };
  }

  applyPillState(pillEl, textEl, stageEl, consulName, mode, text) {
    if (textEl) {
      textEl.textContent = text;
    }
    if (pillEl) {
      pillEl.dataset.activityState = mode;
      pillEl.setAttribute('title', `${consulName} (${mode.replace(/_/g, ' ')}): ${text}`);
      pillEl.style.opacity = mode === 'idle' ? '0.68' : '1';
      const dot = pillEl.querySelector('.solo-activity-dot');
      if (dot) {
        dot.style.animationPlayState = mode === 'idle' ? 'paused' : 'running';
        dot.style.opacity = mode === 'idle' ? '0.45' : '1';
      }
    }
    if (stageEl) {
      stageEl.dataset.consulActivity = mode;
    }
  }

  refreshSoloActivityLabels(now = Date.now()) {
    this.ensureSoloActivityPills();
    const state = this.currentState;
    const solo = this.computeSoloActivities(now);

    if (state === 'debating' || state === 'wrestling_fistfight') {
      const niaDebateText =
        this.activeDebate.niaReplied && solo.niaMode !== 'debating'
          ? solo.niaText
          : this.consulSignals.nia?.mode === 'debating' && this.consulSignals.nia?.text
            ? this.consulSignals.nia.text
            : 'Debating with Ferric';
      const niaDebateMode =
        this.activeDebate.niaReplied && solo.niaMode !== 'debating' ? solo.niaMode : 'debating';

      const ferricDebateText =
        this.activeDebate.ferricReplied && solo.ferricMode !== 'debating'
          ? solo.ferricText
          : this.consulSignals.ferric?.mode === 'debating' && this.consulSignals.ferric?.text
            ? this.consulSignals.ferric.text
            : 'Debating with Nia';
      const ferricDebateMode =
        this.activeDebate.ferricReplied && solo.ferricMode !== 'debating' ? solo.ferricMode : 'debating';

      this.applyPillState(
        this.niaSoloPill,
        this.niaSoloText,
        this.niaStage,
        'Nia Nova',
        niaDebateMode,
        niaDebateText
      );
      this.applyPillState(
        this.ferricSoloPill,
        this.ferricSoloText,
        this.ferricStage,
        'Ferric Lunaux',
        ferricDebateMode,
        ferricDebateText
      );
      return;
    }

    if (state === 'consensus_celebration') {
      this.applyPillState(
        this.niaSoloPill,
        this.niaSoloText,
        this.niaStage,
        'Nia Nova',
        'verifying',
        '2/2 Consensus ratified'
      );
      this.applyPillState(
        this.ferricSoloPill,
        this.ferricSoloText,
        this.ferricStage,
        'Ferric Lunaux',
        'verifying',
        '2/2 Consensus ratified'
      );
      return;
    }

    if (state === 'veto_clash') {
      this.applyPillState(
        this.niaSoloPill,
        this.niaSoloText,
        this.niaStage,
        'Nia Nova',
        'debating',
        'Challenging veto'
      );
      this.applyPillState(
        this.ferricSoloPill,
        this.ferricSoloText,
        this.ferricStage,
        'Ferric Lunaux',
        'verifying',
        'Enforcing Gate 2 veto'
      );
      return;
    }

    if (state === 'nia_impatient') {
      this.applyPillState(
        this.niaSoloPill,
        this.niaSoloText,
        this.niaStage,
        'Nia Nova',
        'checking_workers',
        'Accelerating stalled worker'
      );
      this.applyPillState(
        this.ferricSoloPill,
        this.ferricSoloText,
        this.ferricStage,
        'Ferric Lunaux',
        'verifying',
        'Checking worker telemetry'
      );
      return;
    }

    this.applyPillState(
      this.niaSoloPill,
      this.niaSoloText,
      this.niaStage,
      'Nia Nova',
      solo.niaMode,
      solo.niaText
    );
    this.applyPillState(
      this.ferricSoloPill,
      this.ferricSoloText,
      this.ferricStage,
      'Ferric Lunaux',
      solo.ferricMode,
      solo.ferricText
    );

    if (this.stateLabel) {
      if (state === 'independent_working') {
        this.stateLabel.textContent = solo.headerLabel;
      } else if (state === 'idle_observing') {
        this.stateLabel.textContent = 'IDLE OBSERVING';
      }
    }
  }

  setScenario(scenario, debateTurns = 0, _details = '', isManualSelection = false) {
    const now = Date.now();
    if (isManualSelection) {
      this.manualScenario = scenario;
    } else if (this.liveSync) {
      this.manualScenario = null;
    }

    const effectiveScenario =
      scenario === 'idle_observing' && this.liveSync && !isManualSelection && this.hasRealIndependentActivity(now)
        ? 'independent_working'
        : scenario;

    this.currentState = effectiveScenario;
    this.debateTurns = debateTurns;

    if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute('data-avatar-state', effectiveScenario);
    }

    const solo = this.computeSoloActivities(now);
    if (this.stateLabel) {
      if (effectiveScenario === 'independent_working') {
        this.stateLabel.textContent = solo.headerLabel;
      } else {
        this.stateLabel.textContent = effectiveScenario.toUpperCase().replace(/_/g, ' ');
      }
    }

    this.refreshSoloActivityLabels(now);

    if (typeof document !== 'undefined') {
      const buttons = document.querySelectorAll('.scenario-btn');
      buttons.forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-scenario') === effectiveScenario);
      });
    }

    // Toggle Wrestling Stage vs Split Stage
    if (effectiveScenario === 'wrestling_fistfight') {
      if (this.stageDual) this.stageDual.classList.add('hidden');
      if (this.stageWrestling) this.stageWrestling.classList.remove('hidden');
      this.spawnSparksBatch(25);
    } else {
      if (this.stageDual) this.stageDual.classList.remove('hidden');
      if (this.stageWrestling) this.stageWrestling.classList.add('hidden');
    }

    // Clear previous hold timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    // Transient scenarios automatically return to the live baseline scenario after hold duration
    const transientScenarios = {
      debating: this.debateStaleMs,
      wrestling_fistfight: this.debateStaleMs,
      nia_impatient: 5000,
      consensus_celebration: 4000,
      veto_clash: 4000,
      disciplinary_execution: 3500,
      error_alarm: 5000,
      courier_arrival: 4000,
    };

    if (this.liveSync && !isManualSelection && transientScenarios[effectiveScenario]) {
      this.resetTimer = setTimeout(() => {
        if (this.currentState === effectiveScenario) {
          this.debateTurns = 0;
          this.activeDebate.active = false;
          this.clearConsulSignal('nia', 'debating');
          this.clearConsulSignal('ferric', 'debating');
          this.setScenario(this.resolveBaselineScenario(), 0, 'Transient scenario expired');
        }
      }, transientScenarios[effectiveScenario]);
      if (typeof this.resetTimer?.unref === 'function') {
        this.resetTimer.unref();
      }
    }
  }

  displaySpeech(_consul, _text) {
    // Disabled per Overseer directive: dialogue & inner thoughts stay in the console chat area, not underneath the avatars.
    if (this.speechTicker) {
      this.speechTicker.classList.add('hidden');
    }
  }

  handleWebSocketEvent(type, payload) {
    if (!this.liveSync) return;
    const now = Date.now();

    switch (type) {
      case 'CONSULAR_AVATAR_STATE':
        if (payload?.state) {
          this.setScenario(payload.state, payload.debate_turns || 0, payload.details);
        }
        break;

      case 'SWARM_ACTIVITY_HEARTBEAT':
        if (payload) {
          this.applyActivitySnapshot(payload, now);
        }
        break;

      case 'CUBICLE_UPDATED':
        if (payload?.cubicle) {
          const cub = payload.cubicle;
          const cubId = String(cub.id || '').trim();
          if (!cubId) break;

          if (cub.status === 'working') {
            this.activeCubiclesById.set(cubId, {
              id: cubId,
              status: 'working',
              taskId: cub.current_task_id || null,
              taskTitle: cub.assigned_task_title || null,
              latestThought: String(cub.surface_thoughts || '').trim(),
              updatedAt: now,
            });
            this.setConsulSignal('nia', {
              mode: 'checking_workers',
              text: `Checking ${cubId}`,
              targetId: cubId,
              updatedAt: now,
              expiresAt: now + this.signalTtlMs,
            });
          } else if (cub.status === 'under_inspection') {
            this.activeCubiclesById.set(cubId, {
              id: cubId,
              status: 'under_inspection',
              taskId: cub.current_task_id || null,
              taskTitle: cub.assigned_task_title || null,
              latestThought: String(cub.surface_thoughts || '').trim(),
              updatedAt: now,
            });
            this.setConsulSignal('ferric', {
              mode: 'verifying',
              text: `Inspecting ${cubId} at Gate 2`,
              targetId: cubId,
              updatedAt: now,
              expiresAt: now + this.signalTtlMs,
            });
          } else {
            // Clear stale state when cubicle transitions to idle, vacant, completed, or error
            this.activeCubiclesById.delete(cubId);
            this.clearConsulSignalsForTarget(cubId);
          }

          this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
          this.reconcileBaselineScenario(now);
          this.refreshSoloActivityLabels(now);
        }
        break;

      case 'CONSULAR_THINKING':
        if (payload?.text) {
          const senderStr = String(payload.sender || '');
          if (senderStr === 'Swarm Monitor' || payload.severity === 'warning') {
            if (Array.isArray(payload.task_ids)) {
              this.latestSwarmContext.orphanedCount = payload.task_ids.length;
              this.latestSwarmContext.state = 'stalled';
            }
            this.reconcileBaselineScenario(now);
            this.refreshSoloActivityLabels(now);
            break;
          }

          const shortSnippet = summarizeThoughtForPill(payload.text, 32);
          if (shortSnippet) {
            const rawConsul = String(payload.consul || payload.sender || '').toLowerCase();
            const isNia = rawConsul.includes('nia') || rawConsul === 'consul i' || rawConsul === 'consul-1';
            const consulKey = isNia ? 'nia' : 'ferric';
            const mode =
              this.currentState === 'debating' || this.currentState === 'wrestling_fistfight'
                ? 'debating'
                : classifyConsulActivityMode(shortSnippet, isNia ? 'working' : 'verifying');

            if (this.activeDebate.active) {
              this.activeDebate.lastTurnAt = now;
            }

            this.setConsulSignal(consulKey, {
              mode,
              text: shortSnippet,
              updatedAt: now,
              expiresAt: now + this.signalTtlMs,
            });
            this.reconcileBaselineScenario(now);
            this.refreshSoloActivityLabels(now);
          }
        }
        break;

      case 'CONSULAR_VOTE':
        if (payload?.vote) {
          const voterStr = String(payload.vote.consul || '').toLowerCase();
          const isNia = voterStr.includes('nia') || voterStr === 'consul i' || voterStr === 'consul-1';
          const voterKey = isNia ? 'nia' : 'ferric';
          const partnerKey = isNia ? 'ferric' : 'nia';
          const taskId = payload.taskId ? String(payload.taskId) : 'Gate 2';
          const decision = String(payload.vote.decision || 'APPROVE').toUpperCase();

          this.setConsulSignal(voterKey, {
            mode: 'verifying',
            text: `Voted ${decision} on ${taskId}`,
            targetId: payload.taskId || null,
            updatedAt: now,
            expiresAt: now + this.voteSignalTtlMs,
          });
          if (!this.consulSignals[partnerKey] || this.consulSignals[partnerKey].targetId !== payload.taskId) {
            this.setConsulSignal(partnerKey, {
              mode: 'verifying',
              text: `Verifying ${taskId} (Gate 2)`,
              targetId: payload.taskId || null,
              updatedAt: now,
              expiresAt: now + this.voteSignalTtlMs,
            });
          }
          this.reconcileBaselineScenario(now);
          this.refreshSoloActivityLabels(now);
        }
        break;

      case 'CONSULAR_PLAN_DELIBERATING':
        this.activeDebate = {
          active: true,
          startedAt: now,
          lastTurnAt: now,
          niaReplied: false,
          ferricReplied: false,
        };
        this.debateTurns = Math.max(1, this.debateTurns);
        this.setScenario('debating', this.debateTurns, 'Gate 1 plan deliberation');
        break;

      case 'PLAN_AUTHORIZED':
        this.activeDebate.active = false;
        this.debateTurns = 0;
        this.clearConsulSignal('nia', 'debating');
        this.clearConsulSignal('ferric', 'debating');
        this.setScenario('consensus_celebration', 0, 'Gate 1 plan authorized');
        break;

      case 'PLAN_VETOED':
        this.activeDebate.active = false;
        this.clearConsulSignal('nia', 'debating');
        this.clearConsulSignal('ferric', 'debating');
        this.setScenario('veto_clash', this.debateTurns, 'Gate 1 plan vetoed');
        break;

      case 'CONSULAR_DIALOGUE':
        if (!payload) break;
        if (payload.sender === 'Overseer' || payload.sender === 'User') {
          this.activeDebate = {
            active: true,
            startedAt: now,
            lastTurnAt: now,
            niaReplied: false,
            ferricReplied: false,
          };
          this.debateTurns = 1;
          this.setScenario('debating', 1, 'Overseer directive received');
          break;
        }

        if (payload.phase === 'PLANNING_GATE' || payload.phase === 'DELIBERATION') {
          const contentStr = String(payload.content || '').trim();
          // Gate 2 1/2 vote announcements are verification activity, not deadlock turns
          if (/^\[Gate 2 Vote \(1\/2\)\]/i.test(contentStr)) {
            const isNiaVoter = String(payload.sender || '').includes('Nia') || payload.sender === 'Consul I';
            this.setConsulSignal(isNiaVoter ? 'nia' : 'ferric', {
              mode: 'verifying',
              text: 'Voted 1/2 · awaiting Gate 2',
              updatedAt: now,
              expiresAt: now + this.voteSignalTtlMs,
            });
            this.setConsulSignal(isNiaVoter ? 'ferric' : 'nia', {
              mode: 'verifying',
              text: 'Verifying Gate 2 (2/2)',
              updatedAt: now,
              expiresAt: now + this.voteSignalTtlMs,
            });
            this.reconcileBaselineScenario(now);
            this.refreshSoloActivityLabels(now);
            break;
          }

          this.activeDebate.active = true;
          this.activeDebate.lastTurnAt = now;
          this.debateTurns = (this.debateTurns || 0) + 1;
          if (this.debateTurns >= 4) {
            this.setScenario('wrestling_fistfight', this.debateTurns, 'Prolonged debate deadlock');
          } else {
            this.setScenario('debating', this.debateTurns, 'Consuls deliberating');
          }
        } else if (payload.phase === 'REVIEW_GATE') {
          const isNiaReviewer = String(payload.sender || '').includes('Nia') || payload.sender === 'Consul I';
          this.setConsulSignal(isNiaReviewer ? 'nia' : 'ferric', {
            mode: 'verifying',
            text: 'Verifying Gate 2 review',
            updatedAt: now,
            expiresAt: now + this.signalTtlMs,
          });
          this.reconcileBaselineScenario(now);
          this.refreshSoloActivityLabels(now);
        } else {
          // Final Consul reply or periodic status update in USER_CHAT / GENERAL
          const contentStr = String(payload.content || '').trim();
          const isPeriodicReport = /^Progress report:/i.test(contentStr);
          const isNiaSender = String(payload.sender || '').includes('Nia') || payload.sender === 'Consul I';
          const senderKey = isNiaSender ? 'nia' : 'ferric';

          if (!isPeriodicReport) {
            this.clearConsulSignal(senderKey, 'debating');
            if (this.activeDebate.active) {
              if (isNiaSender) {
                this.activeDebate.niaReplied = true;
              } else {
                this.activeDebate.ferricReplied = true;
              }
            }
          }

          this.debateTurns = 0;
          this.activeDebate.active = false;
          this.setScenario(this.resolveBaselineScenario(now), 0, 'Consul reply delivered');
        }

        if (payload.sender && payload.content) {
          const consulName = payload.sender.includes('Nia') ? 'Nia' : 'Ferric';
          this.displaySpeech(consulName, payload.content);
        }
        break;

      case 'CONSULAR_CONSENSUS':
        this.debateTurns = 0;
        this.activeDebate.active = false;
        this.clearConsulSignal('nia', 'debating');
        this.clearConsulSignal('ferric', 'debating');
        if (payload?.taskId) {
          this.clearConsulSignalsForTarget(payload.taskId);
        } else {
          this.clearConsulSignal('nia', 'verifying');
          this.clearConsulSignal('ferric', 'verifying');
        }
        this.setScenario('consensus_celebration', 0, 'Consensus ratified');
        void this.syncLiveActivitySnapshot();
        break;

      case 'CONSULAR_VETO':
        this.activeDebate.active = false;
        if (payload?.taskId) {
          this.clearConsulSignalsForTarget(payload.taskId);
        }
        this.setScenario('veto_clash', this.debateTurns, payload?.reason || 'Consular veto');
        void this.syncLiveActivitySnapshot();
        break;

      case 'TASK_CLAIMED':
        if (payload?.cubicleId) {
          const cubId = String(payload.cubicleId);
          this.activeCubiclesById.set(cubId, {
            id: cubId,
            status: 'working',
            taskId: payload.task?.id || null,
            taskTitle: payload.task?.title || null,
            latestThought: '',
            updatedAt: now,
          });
          this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
          this.latestSwarmContext.inProgressCount = Math.max(1, this.latestSwarmContext.inProgressCount);
          this.latestSwarmContext.heartbeatAt = now;
        }
        this.reconcileBaselineScenario(now);
        void this.syncLiveActivitySnapshot();
        break;

      case 'TASK_SUBMITTED_REVIEW':
        if (payload?.cubicleId) {
          const cubId = String(payload.cubicleId);
          this.activeCubiclesById.set(cubId, {
            id: cubId,
            status: 'under_inspection',
            taskId: payload.task?.id || null,
            taskTitle: payload.task?.title || null,
            latestThought: '',
            updatedAt: now,
          });
          this.setConsulSignal('ferric', {
            mode: 'verifying',
            text: `Verifying ${cubId} (Gate 2)`,
            targetId: cubId,
            updatedAt: now,
            expiresAt: now + this.signalTtlMs,
          });
        }
        this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
        this.latestSwarmContext.reviewCount = Math.max(1, this.latestSwarmContext.reviewCount);
        this.latestSwarmContext.heartbeatAt = now;
        this.reconcileBaselineScenario(now);
        void this.syncLiveActivitySnapshot();
        break;

      case 'TASK_COMPLETED':
        if (payload?.taskId) {
          const doneTaskId = String(payload.taskId);
          for (const [cubId, entry] of this.activeCubiclesById.entries()) {
            if (entry.taskId === doneTaskId) {
              this.activeCubiclesById.delete(cubId);
              this.clearConsulSignalsForTarget(cubId);
            }
          }
          this.clearConsulSignalsForTarget(doneTaskId);
        }
        this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
        if (this.latestSwarmContext.reviewCount > 0) {
          this.latestSwarmContext.reviewCount = Math.max(0, this.latestSwarmContext.reviewCount - 1);
        }
        this.reconcileBaselineScenario(now);
        void this.syncLiveActivitySnapshot();
        break;

      case 'TASK_UPDATED':
      case 'TASK_SPLIT':
      case 'TASKBOARD_REBALANCED':
        void this.syncLiveActivitySnapshot();
        break;

      case 'WORKER_EVICTED':
        if (payload?.details?.fromCubicleId || payload?.fromCubicleId) {
          const evictedId = String(payload.details?.fromCubicleId || payload.fromCubicleId);
          this.activeCubiclesById.delete(evictedId);
          this.clearConsulSignalsForTarget(evictedId);
          this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
        }
        this.reconcileBaselineScenario(now);
        break;

      case 'DISCIPLINARY_ACTION':
        if (payload?.cubicleId && payload?.action === 'kill_agent') {
          const killedId = String(payload.cubicleId);
          this.activeCubiclesById.delete(killedId);
          this.clearConsulSignalsForTarget(killedId);
          this.latestSwarmContext.workingCubicles = Array.from(this.activeCubiclesById.values());
        }
        this.setScenario('disciplinary_execution', 0, payload?.type || payload?.action);
        break;

      case 'INCIDENT_ALERT':
        this.setScenario('error_alarm', 0, payload?.error || 'Worker incident');
        break;

      case 'GLADIATOR_CONTEST_RESOLVED':
        this.setScenario('gladiator_spectators', 0, 'Tournament contest');
        break;

      case 'COURIER_PETITION_RECEIVED':
        this.setScenario('courier_arrival', 0, payload?.agent);
        break;

      case 'SELF_UPDATE_INITIATED':
      case 'SELF_UPDATE_READY':
        this.setScenario('self_evolution_upgrade', 0, 'Self-update in progress');
        break;

      case 'AFK_MODE_CHANGED':
        if (payload?.afk_mode) {
          this.setScenario('night_shift_afk', 0, 'Night-shift active');
        } else {
          this.setScenario(this.resolveBaselineScenario(now), 0);
        }
        break;

      case 'NIA_IMPATIENCE_TRIGGERED':
        this.setScenario('nia_impatient', this.debateTurns, payload?.reason);
        if (payload?.dialogue) {
          this.displaySpeech('Nia', payload.dialogue.content);
        }
        break;

      default:
        break;
    }
  }

  spawnSparksBatch(count) {
    const originX = 135; // Center knuckles
    const originY = 55;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3.5 + 1.2;
      this.sparks.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.04 + 0.02,
        color: Math.random() > 0.4 ? '#f59e0b' : Math.random() > 0.5 ? '#ef4444' : '#06b6d4',
        size: Math.random() * 2 + 1,
      });
    }
  }

  startFxLoop() {
    if (typeof requestAnimationFrame !== 'function') return;
    const loop = () => {
      this.updateAndRenderFx();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  updateAndRenderFx() {
    if (!this.ctx || !this.fxCanvas) return;
    this.fxTime += 0.02;
    this.ctx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);

    // If wrestling, continuously spawn friction sparks
    if (this.currentState === 'wrestling_fistfight' && Math.random() > 0.4) {
      this.spawnSparksBatch(3);
    }

    // Render & update sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.08; // gravity
      s.life -= s.decay;

      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }

      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
      this.ctx.fillStyle = s.color;
      this.ctx.shadowColor = s.color;
      this.ctx.shadowBlur = 4;
      this.ctx.fill();
    }

    // Scenario-specific overlay effects
    if (this.currentState === 'independent_working') {
      // Independent per-Consul HUD scan sweeps: only render scan line on the stage of a Consul with real active work
      const niaActive = this.lastComputedActivities?.nia?.mode && this.lastComputedActivities.nia.mode !== 'idle';
      const ferricActive =
        this.lastComputedActivities?.ferric?.mode && this.lastComputedActivities.ferric.mode !== 'idle';

      if (niaActive) {
        const niaScanY = 26 + ((Math.sin(this.fxTime * 1.8) + 1) * 0.5) * 68;
        this.ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
        this.ctx.fillRect(4, niaScanY, 120, 1.5);
      }

      if (ferricActive) {
        const ferricScanY = 26 + ((Math.cos(this.fxTime * 1.4) + 1) * 0.5) * 68;
        this.ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
        this.ctx.fillRect(144, ferricScanY, 120, 1.5);
      }
    } else if (this.currentState === 'error_alarm') {
      // Red strobe flash across avatar stage
      const strobe = Math.sin(this.fxTime * 12) > 0 ? 0.25 : 0.05;
      this.ctx.fillStyle = `rgba(239, 68, 68, ${strobe})`;
      this.ctx.fillRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    } else if (this.currentState === 'self_evolution_upgrade') {
      // Cyan digital wireframe rain
      this.ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
      this.ctx.font = '8px monospace';
      for (let x = 10; x < this.fxCanvas.width; x += 30) {
        const y = (this.fxTime * 80 + x * 3) % this.fxCanvas.height;
        this.ctx.fillText(Math.random() > 0.5 ? '1' : '0', x, y);
      }
    } else if (this.currentState === 'night_shift_afk') {
      // Warm rising coffee steam wisps from Ferric's side
      this.ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      const steamY = 70 - ((this.fxTime * 15) % 35);
      const steamX = 200 + Math.sin(this.fxTime * 2) * 4;
      this.ctx.beginPath();
      this.ctx.arc(steamX, steamY, 6, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

let avatarsControllerInstance = null;
export function initConsularAvatars(options) {
  if (!avatarsControllerInstance) {
    avatarsControllerInstance = new ConsularAvatarsController(options);
  }
  return avatarsControllerInstance;
}
export function getConsularAvatars() {
  return avatarsControllerInstance;
}
