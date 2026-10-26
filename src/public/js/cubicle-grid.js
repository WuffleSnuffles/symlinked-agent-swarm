/**
 * src/public/js/cubicle-grid.js
 *
 * 4x4 Cubicle Spatial Matrix Grid Controller.
 * Features:
 * - 16-cubicle cards (cubicle-01 .. cubicle-16) with provider iconography.
 * - Worker states: working (orbiting drones), idle, under inspection, error, vacant.
 * - Fatigue meters (0%-100%) with tier indicators.
 * - Surface thoughts stream ticker.
 * - Port sandbox preview drawer (PORT 4101..4116).
 * - Inter-cubicle dependency lines SVG curve renderer.
 */

export class CubicleGridController {
  constructor() {
    this.gridContainer = document.getElementById('cubicle-grid');
    this.svgContainer = document.getElementById('contracts-dependency-svg');
    this.sandboxDrawer = document.getElementById('port-sandbox-drawer');
    this.sandboxIframe = document.getElementById('sandbox-iframe');
    this.sandboxTitle = document.getElementById('sandbox-drawer-title');
    this.btnCloseSandbox = document.getElementById('btn-close-sandbox');

    this.cubicles = new Map(); // id -> cubicle state
    this.contracts = [];

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnCloseSandbox && this.sandboxDrawer) {
      this.btnCloseSandbox.addEventListener('click', () => {
        this.closeSandboxPreview();
      });
    }
  }

  initializeGrid(cubiclesList = []) {
    if (!this.gridContainer) return;
    this.gridContainer.innerHTML = '';

    // Initialize 16 slots
    for (let i = 1; i <= 16; i++) {
      const id = `cubicle-${String(i).padStart(2, '0')}`;
      const cubicle = cubiclesList.find((c) => c.id === id) || {
        id,
        status: 'vacant',
        config: { enabled: false },
        port: 4100 + i,
        surface_thoughts: 'Standing by...',
        fatigue_percentage: 0,
      };

      this.cubicles.set(id, cubicle);
      const card = this.createCubicleCard(cubicle);
      this.gridContainer.appendChild(card);
    }

    this.updateDependencyLines();
  }

  getProviderIcon(brand) {
    switch (brand) {
      case 'gemini': return '♊';
      case 'gpt': return '⚡';
      case 'claude': return '🧠';
      case 'deepseek': return '🐬';
      case 'custom': return '⚙️';
      default: return '░';
    }
  }

  createCubicleCard(c) {
    const card = document.createElement('div');
    card.id = c.id;
    card.className = `cubicle-card state-${c.status || 'vacant'}`;

    const brand = c.config?.brand || 'custom';
    const icon = this.getProviderIcon(brand);
    const model = c.config?.model || (c.config?.enabled ? 'AI Agent' : 'VACANT SLOT');
    const port = c.port || 4101;
    const canSpawn = c.config?.can_spawn_subswarm;
    const isWorking = c.status === 'working';
    const subswarmActive = isWorking && (c.subswarm_active || c.active_subswarm_id || canSpawn);

    const tokensUsed = Number(c.config?.quota?.tokens_used || 0);
    const hasVerifiedQuota = Boolean(c.quota_verified) || tokensUsed > 0;
    const fatigue = hasVerifiedQuota ? Number(c.fatigue_percentage ?? c.fatigue_percent ?? 0) : 0;
    let fatigueTier = 'fatigue-tier-energized';
    if (fatigue > 80) fatigueTier = 'fatigue-tier-exhausted';
    else if (fatigue > 55) fatigueTier = 'fatigue-tier-critical';
    else if (fatigue > 25) fatigueTier = 'fatigue-tier-moderate';

    const quotaReadout = !c.config?.enabled
      ? 'VACANT'
      : hasVerifiedQuota
      ? `${fatigue}% (${tokensUsed.toLocaleString()} TOK)`
      : 'UNKNOWN';

    const rawThoughts = c.surface_thoughts || '';
    const displayThoughts =
      c.assigned_task_title
        ? `Working on: ${c.assigned_task_title}`
        : rawThoughts === 'Initialized. Standing by for instructions.'
          ? (c.config?.enabled ? 'Idle — awaiting task claim.' : 'Slot unassigned.')
          : (rawThoughts || 'Idle telemetry normal.');

    card.innerHTML = `
      <div class="cubicle-card-header">
        <span class="cubicle-id-badge">${c.id.toUpperCase()}</span>
        <button type="button" class="cubicle-port-badge" data-port="${port}">PORT ${port}</button>
      </div>

      <div class="cubicle-provider-row">
        <span class="cubicle-provider-icon">${icon}</span>
        <span class="cubicle-model-name" title="${model}">${model}</span>
        ${c.config?.enabled ? `
          <span class="cubicle-subswarm-tag ${canSpawn ? '' : 'restricted'}" title="${canSpawn ? 'Can spawn multi-swarms' : 'Sub-swarm restricted solo worker'}">
            ${canSpawn ? 'MULTI-SWARM' : 'SOLO'}
          </span>
        ` : ''}
      </div>

      <!-- Orbiting Sub-Swarm Drones (Visible when active) -->
      <div class="orbit-drone-container" style="display: ${subswarmActive ? 'block' : 'none'};">
        <div class="orbiting-drone"></div>
        <div class="orbiting-drone"></div>
      </div>

      <div class="fatigue-section">
        <div class="fatigue-meter-label-row">
          <span>QUOTA FATIGUE</span>
          <span class="fatigue-val">${quotaReadout}</span>
        </div>
        <div class="fatigue-meter-track">
          <div class="fatigue-meter-fill ${fatigueTier}" style="width: ${fatigue}%;"></div>
        </div>
      </div>

      <div class="surface-thoughts-ticker" title="${displayThoughts}">
        ${displayThoughts}
      </div>
    `;

    // Port sandbox preview trigger
    const portBtn = card.querySelector('.cubicle-port-badge');
    if (portBtn) {
      portBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSandboxPreview(c.id, port);
      });
    }

    return card;
  }

  updateCubicle(cubicle) {
    const prev = this.cubicles.get(cubicle.id) || {};
    const merged = {
      ...prev,
      ...cubicle,
      fatigue_percentage: Math.max(Number(prev.fatigue_percentage || 0), Number(cubicle.fatigue_percentage || 0)),
      assigned_task_title: cubicle.assigned_task_title || prev.assigned_task_title || null,
    };
    this.cubicles.set(cubicle.id, merged);
    const existing = document.getElementById(cubicle.id);
    if (existing) {
      const newCard = this.createCubicleCard(merged);
      existing.replaceWith(newCard);
    }
  }

  async syncLiveTelemetry(tasksData = {}) {
    const activeTasksByCubicle = new Map();
    for (const col of ['in_progress', 'review', 'todo']) {
      for (const t of tasksData[col] || []) {
        if (t.assigned_cubicle && !activeTasksByCubicle.has(t.assigned_cubicle)) {
          activeTasksByCubicle.set(t.assigned_cubicle, { task: t, col });
        }
      }
    }

    for (const [id, cub] of this.cubicles.entries()) {
      if (!cub.config?.enabled) continue;
      let diskState = null;
      try {
        const res = await fetch(`/api/media/serve?path=${encodeURIComponent(`.swarm/status/${id}.json`)}&t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          diskState = await res.json();
        }
      } catch {}

      const taskEntry = activeTasksByCubicle.get(id);
      const updated = {
        ...cub,
        ...(diskState || {}),
        status: taskEntry?.col === 'in_progress' ? 'working' : (diskState?.status || cub.status),
        current_task_id: taskEntry?.task?.id || diskState?.current_task_id || cub.current_task_id,
        assigned_task_title: taskEntry?.task?.title || null,
        surface_thoughts:
          taskEntry?.task
            ? `[${taskEntry.col.toUpperCase()}] ${taskEntry.task.title}`
            : (diskState?.surface_thoughts || cub.surface_thoughts),
        fatigue_percentage: Math.max(
          Number(cub.fatigue_percentage || 0),
          Number(diskState?.fatigue_percentage || 0)
        ),
      };
      this.cubicles.set(id, updated);
      const existing = document.getElementById(id);
      if (existing) {
        existing.replaceWith(this.createCubicleCard(updated));
      }
    }
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
      // Pick consumer cubicle
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

      // Draw glowing bezier curve
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
    cubicleGridInstance = new CubicleGridController();
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
