/**
 * src/public/js/app.js
 *
 * Master Panopticon Client Bootstrap & Dual-Bus Synchronization Engine.
 * Dual-Bus:
 * 1. Server WebSocket (ws://<host>:<port>/events) for backend mutations.
 * 2. Client BroadcastChannel('panopticon_swarm_sync') for sub-millisecond
 *    inter-window pop-out panel synchronization.
 */

import { initTwinSauron } from './twin-sauron-canvas.js?v=20261026c';
import { initConsoleResize } from './console-resize.js?v=20261026c';
import { initConsularAvatars } from './consular-avatars.js?v=20261026k';
import { initPromptAttachments } from './prompt-attachment.js?v=20261026g';
import { initMediaRenderer } from './media-renderer.js?v=20261026c';
import { initQuestionWidget } from './question-widget.js?v=20261026i';
import { initCubicleGrid, updateCubicleState } from './cubicle-grid.js?v=20261026f';
import { initOverseerConsole, appendDialogue, updateConsularThinking } from './overseer-console.js?v=20261026j';
import { initTaskboard, updateTasks, updateMissionProgress } from './taskboard-view.js?v=20261026c';

export class PanopticonApp {
  constructor() {
    this.windowId = 'win_' + Math.random().toString(36).substring(2, 8);
    this.urlParams = new URLSearchParams(window.location.search);
    this.panelMode = this.urlParams.get('panel') || 'all';

    this.ws = null;
    this.broadcastChannel = null;
    this.isMasterWindow = this.panelMode === 'all';

    // Subsystems
    this.sauron = null;
    this.avatars = null;
    this.attachments = null;
    this.mediaRenderer = null;
    this.questionWidget = null;
    this.cubicleGrid = null;
    this.consoleController = null;
    this.taskboardController = null;
  }

  async initialize() {
    this.applyPanelRoute();
    this.initHUDControls();
    initConsoleResize();

    // Initialize subsystems
    this.sauron = initTwinSauron();
    this.avatars = initConsularAvatars();
    this.attachments = initPromptAttachments();
    this.mediaRenderer = initMediaRenderer();
    this.questionWidget = initQuestionWidget();

    this.cubicleGrid = await initCubicleGrid(this);
    this.consoleController = await initOverseerConsole(this);
    this.taskboardController = await initTaskboard(this);

    this.setupBroadcastChannel();
    this.connectWebSocket();

    // Initial state fetch
    await this.fetchInitialState();

    if (!this.isMasterWindow && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'REQUEST_STATE_SNAPSHOT',
        senderWindowId: this.windowId,
        timestamp: Date.now(),
      });
    }
  }

  applyPanelRoute() {
    if (this.panelMode !== 'all') {
      document.body.className = `panel-${this.panelMode}`;
      document.title = `PANOPTICON [${this.panelMode.toUpperCase()}]`;
    }
  }

  initHUDControls() {
    const monitorSelect = document.getElementById('monitor-layout-select');
    if (monitorSelect) {
      monitorSelect.addEventListener('change', (e) => {
        document.body.setAttribute('data-monitors', e.target.value);
        this.broadcastSync('MONITOR_LAYOUT_CHANGED', { monitors: e.target.value });
      });
    }

    const scanlinesBtn = document.getElementById('toggle-scanlines-btn');
    if (scanlinesBtn) {
      scanlinesBtn.addEventListener('click', () => {
        const overlay = document.getElementById('scanlines-overlay');
        if (overlay) {
          const isHidden = overlay.classList.toggle('hidden');
          scanlinesBtn.textContent = isHidden ? 'SCANLINES: OFF' : 'SCANLINES: ON';
        }
      });
    }

    // Detach window buttons
    document.querySelectorAll('[data-detach-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const panel = (e.currentTarget || e.target).getAttribute('data-detach-panel');
        if (panel) {
          window.open(
            `/?panel=${panel}`,
            `PanopticonPanel_${panel}`,
            'width=1280,height=900,menubar=no,toolbar=no'
          );
        }
      });
    });
  }

  setupBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;

    this.broadcastChannel = new BroadcastChannel('panopticon_swarm_sync');
    this.broadcastChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.senderWindowId === this.windowId) return;

      if (msg.type === 'MONITOR_LAYOUT_CHANGED') {
        document.body.setAttribute('data-monitors', msg.payload.monitors);
      } else if (msg.type === 'REQUEST_STATE_SNAPSHOT' && this.isMasterWindow) {
        this.broadcastChannel.postMessage({
          type: 'STATE_SNAPSHOT_REPLY',
          targetWindowId: msg.senderWindowId,
          payload: {
            cubicles: Array.from(this.cubicleGrid.cubicles.values()),
            avatarState: this.avatars.currentState,
          },
        });
      } else if (msg.type === 'STATE_SNAPSHOT_REPLY' && msg.targetWindowId === this.windowId) {
        if (msg.payload.cubicles) {
          this.cubicleGrid.initializeGrid(msg.payload.cubicles);
        }
        if (msg.payload.avatarState) {
          this.avatars.setScenario(msg.payload.avatarState);
        }
      }
    };
  }

  broadcastSync(type, payload) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type,
        payload,
        senderWindowId: this.windowId,
        timestamp: Date.now(),
      });
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/events`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const beacon = document.getElementById('ws-status-beacon');
        if (beacon) beacon.classList.remove('offline');
        // Recover persisted messages missed during disconnection.
        void this.refreshDialogue();
      };

      this.ws.onclose = () => {
        const beacon = document.getElementById('ws-status-beacon');
        if (beacon) beacon.classList.add('offline');
        // Exponential reconnect
        setTimeout(() => this.connectWebSocket(), 3000);
      };

      this.ws.onerror = () => {
        const beacon = document.getElementById('ws-status-beacon');
        if (beacon) beacon.classList.add('offline');
      };

      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this.dispatchServerEvent(data.type, data.payload);
        } catch {}
      };
    } catch {
      // Fallback polling if WebSockets blocked
    }
  }

  dispatchServerEvent(type, payload) {
    if (type === 'CUBICLE_MESSAGE') this.taskboardController?.refreshMessages();
    // 1. Sauron Beam Targeting
    if (type === 'SAURON_FOCUS_TARGET') {
      this.sauron?.setMode(payload.twin_sauron_mode, payload.target_cubicle);
    } else if (type === 'INCIDENT_ALERT' || type === 'CONSULAR_VETO') {
      this.sauron?.setMode('CONVERGE_OFFENDING_CUBICLE', payload.cubicle_id);
    }

    // 2. Corner Consular Avatars
    this.avatars?.handleWebSocketEvent(type, payload);

    // 3. Cubicle Grid
    if (type === 'CUBICLE_UPDATED' && payload.cubicle) {
      updateCubicleState(payload.cubicle);
      if (payload.cubicle.status === 'under_inspection') {
        this.sauron?.setMode('CONVERGE_OFFENDING_CUBICLE', payload.cubicle.id);
      }
    }

    // 4. Dialogue Stream & Live Consular Thinking
    if (type === 'CONSULAR_DIALOGUE') {
      appendDialogue(payload);
    } else if (type === 'CONSULAR_THINKING') {
      updateConsularThinking(payload);
    }

    // 5. Questions Widget
    if (type === 'CONSULAR_QUESTION_ASKED' || type === 'CONSULAR_QUESTION_ANSWERED') {
      this.questionWidget?.addQuestion(payload.question || payload);
    }

    // 6. Incident Ticker
    if (type === 'INCIDENT_ALERT') {
      this.consoleController?.showIncidentAlert(payload.error || payload.reason);
    }

    // 7. Tasks & Mission Progress
    if (type.startsWith('TASK_')) {
      this.refreshTasks();
    }
    if (type === 'SWARM_ACTIVITY_HEARTBEAT' || type === 'CUBICLE_UPDATED' || type.startsWith('TASK_')) {
      this.consoleController?.handleActivityEvent?.(type, payload);
    }
  }

  async fetchInitialState() {
    try {
      // 1. Cubicles
      const cubiclesRes = await fetch('/api/cubicles');
      if (cubiclesRes.ok) {
        const data = await cubiclesRes.json();
        this.cubicleGrid.initializeGrid(data.cubicles || []);
      }

      // 2. Tasks
      await this.refreshTasks();

      // 3. Dialogue, including older debate entries
      await this.refreshDialogue();

      // 4. Questions
      const questRes = await fetch('/api/governance/questions');
      if (questRes.ok) {
        const data = await questRes.json();
        if (data.questions && Array.isArray(data.questions)) {
          this.questionWidget.loadQuestions(data.questions);
        }
      }

      // 5. Avatar State
      const avatarRes = await fetch('/api/governance/avatar-state');
      if (avatarRes.ok) {
        const data = await avatarRes.json();
        const state = data.avatarState?.state || data.state;
        if (state) {
          this.avatars.setScenario(state, data.debate_turns || 0);
        }
      }

      // 6. Contracts for dependency lines
      const contractsRes = await fetch('/api/swarm/contracts');
      if (contractsRes.ok) {
        const data = await contractsRes.json();
        this.cubicleGrid.setContracts(data.contracts || []);
      }
    } catch {}
  }

  async refreshDialogue() {
    try {
      const res = await fetch('/api/governance/dialogue?limit=500', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.dialogue)) {
        data.dialogue.forEach((message) => appendDialogue(message));
      }
    } catch (error) {
      console.warn('Unable to restore consular dialogue', error);
    }
  }

  async refreshTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        updateTasks(data.tasks);
        updateMissionProgress(data.progress);
        await this.cubicleGrid?.syncLiveTelemetry?.(data.tasks);
      }
    } catch {}
  }
}

// Bootstrap on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new PanopticonApp();
  app.initialize();
  window.__panopticonApp = app;
});
