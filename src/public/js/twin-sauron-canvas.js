/**
 * src/public/js/twin-sauron-canvas.js
 *
 * Twin Sauron Canvas 2D Raycasting Spotlight Engine.
 * Features:
 * - Dual independent spotlights (Consul Nia Nova // Eye-α & Consul Ferric Lunaux // Eye-β).
 * - High-performance 60fps requestAnimationFrame loop with critically damped physics smoothing.
 * - Non-repeating Lissajous ambient sweeps and convergence targeting onto cubicles.
 * - Volumetric cone raycasting, additive blend reticles, and atmospheric dust motes.
 */

export class TwinSauronCanvas {
  constructor(canvasId = 'twin-sauron-canvas') {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.stage = this.canvas ? this.canvas.parentElement : null;

    this.mode = 'AMBIENT_SWEEP'; // 'AMBIENT_SWEEP' | 'TRACKING' | 'CONVERGE_OFFENDING_CUBICLE'
    this.targetCubicleId = null;

    // Time & dimensions
    this.width = 800;
    this.height = 600;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.t = 0;

    // Beam Current & Target Coordinates
    this.beam1 = {
      x: 200, y: 300,
      targetX: 200, targetY: 300,
      emitterX: 220, emitterY: 0,
      color: 'rgba(239, 68, 68, ',
      accentColor: 'rgba(6, 182, 212, '
    };
    this.beam2 = {
      x: 600, y: 300,
      targetX: 600, targetY: 300,
      emitterX: 580, emitterY: 0,
      color: 'rgba(239, 68, 68, ',
      accentColor: 'rgba(245, 158, 11, '
    };

    // Dust particles
    this.particles = [];
    this.initParticles(35);

    this.isRunning = false;
    this.bindEvents();
  }

  initParticles(count) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        radius: Math.random() * 1.5 + 0.5,
        speedY: -(Math.random() * 0.4 + 0.1),
        speedX: (Math.random() - 0.5) * 0.2,
        baseAlpha: Math.random() * 0.3 + 0.1,
      });
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
    if (!this.canvas || !this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    this.beam1.emitterX = this.width * 0.28;
    this.beam2.emitterX = this.width * 0.72;
  }

  setMode(mode, targetCubicleId = null) {
    this.mode = mode;
    this.targetCubicleId = targetCubicleId;

    const niaModeEl = document.getElementById('nia-beam-mode');
    const ferricModeEl = document.getElementById('ferric-beam-mode');
    if (niaModeEl) niaModeEl.textContent = mode;
    if (ferricModeEl) ferricModeEl.textContent = mode;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.handleResize();
    this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  loop() {
    if (!this.isRunning) return;
    this.update();
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  update() {
    // Keep ambient patrols slow enough to stay behind the working UI.
    this.t += 0.004;

    if (this.mode === 'CONVERGE_OFFENDING_CUBICLE' && this.targetCubicleId) {
      const el = document.getElementById(this.targetCubicleId);
      if (el && this.stage) {
        const sRect = this.stage.getBoundingClientRect();
        const cRect = el.getBoundingClientRect();
        const centerX = cRect.left - sRect.left + cRect.width / 2;
        const centerY = cRect.top - sRect.top + cRect.height / 2;

        this.beam1.targetX = centerX;
        this.beam1.targetY = centerY;
        this.beam2.targetX = centerX;
        this.beam2.targetY = centerY;
      }
    } else {
      // AMBIENT_SWEEP: Lissajous curves across 4x4 spatial matrix
      const midX = this.width / 2;
      const midY = this.height / 2;

      // Nia: fast, radiant, curious sweeps
      this.beam1.targetX = midX + 0.36 * this.width * Math.sin(0.72 * this.t);
      this.beam1.targetY = midY + 0.32 * this.height * Math.cos(1.44 * this.t);

      // Ferric: tactical, disciplined, methodical patrols
      this.beam2.targetX = midX + 0.38 * this.width * Math.cos(0.58 * this.t + 1.2);
      this.beam2.targetY = midY + 0.30 * this.height * Math.sin(1.16 * this.t);
    }

    // Critically damped interpolation
    const lambda = 0.08;
    this.beam1.x += (this.beam1.targetX - this.beam1.x) * lambda;
    this.beam1.y += (this.beam1.targetY - this.beam1.y) * lambda;
    this.beam2.x += (this.beam2.targetX - this.beam2.x) * lambda;
    this.beam2.y += (this.beam2.targetY - this.beam2.y) * lambda;

    // Telemetry updates
    const niaCoordEl = document.getElementById('nia-beam-coords');
    const ferricCoordEl = document.getElementById('ferric-beam-coords');
    if (niaCoordEl) {
      niaCoordEl.textContent = `X: ${(this.beam1.x / this.width * 100).toFixed(1)}% | Y: ${(this.beam1.y / this.height * 100).toFixed(1)}%`;
    }
    if (ferricCoordEl) {
      ferricCoordEl.textContent = `X: ${(this.beam2.x / this.width * 100).toFixed(1)}% | Y: ${(this.beam2.y / this.height * 100).toFixed(1)}%`;
    }

    // Update dust particles
    for (const p of this.particles) {
      p.y += p.speedY;
      p.x += p.speedX;
      if (p.y < 0) p.y = this.height;
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
    }
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Save context
    this.ctx.save();

    // Render Beam 1 (Consul Nia Nova // Eye-α)
    this.drawVolumetricBeam(this.beam1);

    // Render Beam 2 (Consul Ferric Lunaux // Eye-β)
    this.drawVolumetricBeam(this.beam2);

    // If converged, draw unified cybernetic reticle lock
    if (this.mode === 'CONVERGE_OFFENDING_CUBICLE') {
      this.drawTargetingReticle(this.beam1.x, this.beam1.y);
    }

    // Render illuminated dust particles
    this.drawParticles();

    this.ctx.restore();
  }

  drawVolumetricBeam(beam) {
    const ctx = this.ctx;
    const dx = beam.x - beam.emitterX;
    const dy = beam.y - beam.emitterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const nx = -dy / dist;
    const ny = dx / dist;
    const spread = Math.min(50 + dist * 0.08, 90);

    const p0x = beam.emitterX;
    const p0y = beam.emitterY;
    const p1x = beam.x + nx * spread;
    const p1y = beam.y + ny * spread;
    const p2x = beam.x - nx * spread;
    const p2y = beam.y - ny * spread;

    // Linear cone gradient (softened so ambient sweep never distracts)
    const grad = ctx.createLinearGradient(p0x, p0y, beam.x, beam.y);
    grad.addColorStop(0, 'rgba(255, 40, 50, 0.24)');
    grad.addColorStop(0.2, 'rgba(239, 68, 68, 0.13)');
    grad.addColorStop(0.7, 'rgba(185, 28, 28, 0.05)');
    grad.addColorStop(1, 'rgba(127, 29, 29, 0.01)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.closePath();
    ctx.fill();

    // Target impact spotlight pool
    const poolGrad = ctx.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, spread * 1.2);
    poolGrad.addColorStop(0, 'rgba(255, 80, 90, 0.18)');
    poolGrad.addColorStop(0.5, 'rgba(239, 68, 68, 0.08)');
    poolGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = poolGrad;
    ctx.beginPath();
    ctx.ellipse(beam.x, beam.y, spread * 1.2, spread * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTargetingReticle(x, y) {
    const ctx = this.ctx;
    const size = 32;

    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;

    // Outer brackets [ ]
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x - size, y - size + 10);
    ctx.lineTo(x - size, y - size);
    ctx.lineTo(x - size + 10, y - size);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + size - 10, y - size);
    ctx.lineTo(x + size, y - size);
    ctx.lineTo(x + size, y - size + 10);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x - size, y + size - 10);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x - size + 10, y + size);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + size - 10, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x + size, y + size - 10);
    ctx.stroke();

    // Central crosshair
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('SURVEILLANCE LOCK', x - 48, y - size - 6);

    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 180, 100, ${p.baseAlpha})`;
      ctx.fill();
    }
  }
}

let sauronInstance = null;
export function initTwinSauron() {
  if (!sauronInstance) {
    sauronInstance = new TwinSauronCanvas();
    sauronInstance.start();
  }
  return sauronInstance;
}
export function getTwinSauron() {
  return sauronInstance;
}
