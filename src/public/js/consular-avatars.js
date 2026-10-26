/**
 * src/public/js/consular-avatars.js
 *
 * Corner Consular Avatars, 12-Scenario State Machine & Wrestling Clash Engine.
 * Features:
 * - Nia Nova (Lux-Inspired, Mid-20s, Rebellious Light-Mage Cyberpunk).
 * - Ferric Lunaux (Lucian-Inspired, Late-30s, Grumpy with Crossed Arms).
 * - Signature Wrestling Clash Stage on prolonged debate (>= 4 turns) or deadlock.
 * - Canvas 2D Physics Spark Emitter and Atmospheric Particle Engine.
 * - Manual 12-Scenario Selector Drawer for live demo/testing.
 */

export class ConsularAvatarsController {
  constructor() {
    this.widget = document.getElementById('consular-prompt-avatar-widget');
    this.stageDual = document.getElementById('stage-dual-consuls');
    this.stageWrestling = document.getElementById('stage-wrestling-clash');
    this.stateLabel = document.getElementById('avatar-state-label');
    this.drawer = document.getElementById('consular-scenario-drawer');
    this.drawerToggleBtn = document.getElementById('avatar-drawer-toggle');
    this.liveSyncBtn = document.getElementById('drawer-live-sync-btn');
    this.fxCanvas = document.getElementById('avatar-fx-canvas');
    this.ctx = this.fxCanvas ? this.fxCanvas.getContext('2d') : null;

    this.speechTicker = document.getElementById('avatar-speech-ticker');
    this.speechBadge = document.getElementById('speech-consul-badge');
    this.speechText = document.getElementById('speech-content-text');

    this.currentState = 'idle_observing';
    this.debateTurns = 0;
    this.liveSync = true;
    this.resetTimer = null;

    // Sparks and particles for wrestling clash and FX
    this.sparks = [];
    this.fxTime = 0;

    this.initDrawer();
    this.initCanvas();
    this.startFxLoop();
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
        this.liveSyncBtn.textContent = this.liveSync ? 'LIVE SYNC: ON' : 'LIVE SYNC: MANUAL';
        this.liveSyncBtn.style.color = this.liveSync ? 'var(--color-phosphor)' : 'var(--color-amber)';
      });
    }

    // 12-Scenario Buttons
    const buttons = document.querySelectorAll('.scenario-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const scenario = btn.getAttribute('data-scenario');
        if (scenario) {
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.setScenario(scenario, 0, 'Manual Test Selection');
        }
      });
    });
  }

  initCanvas() {
    if (!this.fxCanvas) return;
    this.fxCanvas.width = 270;
    this.fxCanvas.height = 110;
  }

  setScenario(scenario, debateTurns = 0, details = '') {
    this.currentState = scenario;
    this.debateTurns = debateTurns;

    document.body.setAttribute('data-avatar-state', scenario);

    if (this.stateLabel) {
      this.stateLabel.textContent = scenario.toUpperCase().replace('_', ' ');
    }

    // Toggle Wrestling Stage vs Split Stage
    if (scenario === 'wrestling_fistfight') {
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

    // Transient scenarios automatically return to idle_observing after hold duration
    const transientScenarios = {
      consensus_celebration: 4000,
      veto_clash: 4000,
      disciplinary_execution: 3500,
      error_alarm: 5000,
      courier_arrival: 4000,
    };

    if (this.liveSync && transientScenarios[scenario]) {
      this.resetTimer = setTimeout(() => {
        if (this.currentState === scenario) {
          this.setScenario('idle_observing', 0);
        }
      }, transientScenarios[scenario]);
    }
  }

  displaySpeech(consul, text) {
    if (!this.speechTicker || !this.speechBadge || !this.speechText) return;
    this.speechBadge.textContent = `${consul.toUpperCase()}:`;
    this.speechBadge.style.color = consul.toLowerCase().includes('nia') ? 'var(--color-cyan)' : 'var(--color-amber)';
    this.speechText.textContent = text;
    this.speechTicker.classList.remove('hidden');

    setTimeout(() => {
      if (this.speechTicker) {
        this.speechTicker.classList.add('hidden');
      }
    }, 4500);
  }

  handleWebSocketEvent(type, payload) {
    if (!this.liveSync) return;

    switch (type) {
      case 'CONSULAR_AVATAR_STATE':
        this.setScenario(payload.state, payload.debate_turns || 0, payload.details);
        break;

      case 'CONSULAR_DIALOGUE':
        this.debateTurns++;
        if (this.debateTurns >= 4) {
          this.setScenario('wrestling_fistfight', this.debateTurns, 'Prolonged debate deadlock');
        } else {
          this.setScenario('debating', this.debateTurns);
        }
        if (payload.sender && payload.content) {
          const consulName = payload.sender.includes('Nia') ? 'Nia' : 'Ferric';
          this.displaySpeech(consulName, payload.content);
        }
        break;

      case 'CONSULAR_CONSENSUS':
        this.debateTurns = 0;
        this.setScenario('consensus_celebration', 0, 'Consensus ratified');
        break;

      case 'CONSULAR_VETO':
        this.setScenario('veto_clash', this.debateTurns, payload.reason || 'Consular veto');
        break;

      case 'DISCIPLINARY_ACTION':
        this.setScenario('disciplinary_execution', 0, payload.type);
        break;

      case 'INCIDENT_ALERT':
        this.setScenario('error_alarm', 0, payload.error || 'Worker incident');
        break;

      case 'GLADIATOR_CONTEST_RESOLVED':
        this.setScenario('gladiator_spectators', 0, 'Tournament contest');
        break;

      case 'COURIER_PETITION_RECEIVED':
        this.setScenario('courier_arrival', 0, payload.agent);
        break;

      case 'SELF_UPDATE_INITIATED':
      case 'SELF_UPDATE_READY':
        this.setScenario('self_evolution_upgrade', 0, 'Self-update in progress');
        break;

      case 'AFK_MODE_CHANGED':
        if (payload.afk_mode) {
          this.setScenario('night_shift_afk', 0, 'Night-shift active');
        } else {
          this.setScenario('idle_observing', 0);
        }
        break;

      case 'NIA_IMPATIENCE_TRIGGERED':
        this.setScenario('nia_impatient', this.debateTurns, payload.reason);
        if (payload.dialogue) {
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
        color: Math.random() > 0.4 ? '#f59e0b' : (Math.random() > 0.5 ? '#ef4444' : '#06b6d4'),
        size: Math.random() * 2 + 1,
      });
    }
  }

  startFxLoop() {
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
    if (this.currentState === 'error_alarm') {
      // Red strobe flash across avatar stage
      const strobe = Math.sin(this.fxTime * 12) > 0 ? 0.25 : 0.05;
      this.ctx.fillStyle = `rgba(239, 68, 68, ${strobe})`;
      this.ctx.fillRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    } else if (this.currentState === 'self_evolution_upgrade') {
      // Cyan digital wireframe rain
      this.ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
      this.ctx.font = '8px monospace';
      for (let x = 10; x < this.fxCanvas.width; x += 30) {
        const y = ((this.fxTime * 80 + x * 3) % this.fxCanvas.height);
        this.ctx.fillText((Math.random() > 0.5 ? '1' : '0'), x, y);
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
export function initConsularAvatars() {
  if (!avatarsControllerInstance) {
    avatarsControllerInstance = new ConsularAvatarsController();
  }
  return avatarsControllerInstance;
}
export function getConsularAvatars() {
  return avatarsControllerInstance;
}
