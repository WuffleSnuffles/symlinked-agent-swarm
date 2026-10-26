# Consular Avatars & 12-Scenario Animation Suite Blueprint (Milestone 3)
## Technical Architecture, Animation Engine & Concrete Implementation Specification

---

### 1. Observation

Direct observations from repository files, project specifications, and asset manifests:

1. **Master Project Specification (`PROJECT.md`)**:
   - Line 56: *"`Animated Anthropomorphized Consular Avatars & 12-Scenario Animation Suite` — Dedicated corner widget in Center Chat Prompt showing simplified brutalist cyberpunk anthropomorphized avatars: Nia (mid-20s, physical appearance inspired by LoL Lux with styled blonde hair and radiant energy, expressive, upbeat/defiant smirk, foot-tapping/glaring) and Ferric (late-30s, physical appearance inspired by LoL Lucian with tied-back locs/dreadlocks, weathered realist, arms crossed, grumpy scowl), both dressed in dark brutalist cyberpunk consul techwear. Complete 12-scenario animation state machine: `idle_observing`, `debating`, `wrestling_fistfight` (interlocked fingers, gritted teeth, sparks), `nia_impatient`, `disciplinary_execution` (Pollice Verso & eject switch), `consensus_celebration` (reluctant fist-bump), `veto_clash` (red shield slam), `error_alarm` (siren strobe), `gladiator_spectators` (balcony cheering & binoculars), `courier_arrival` (hologram greeting & seal inspect), `self_evolution_upgrade` (wireframe energy surge), and `night_shift_afk` (dimmed lighting, coffee, headphones)."*
   - Line 112: Designates `src/public/css/consular-avatars.css` for *"Corner Consular avatars & wrestling animations"*.
   - Line 118: Designates `src/public/js/consular-avatars.js` for *"Corner prompt animated avatars & wrestling engine"*.
   - Line 350–353: Defines interface contract for `CONSULAR_AVATAR_STATE` event:
     ```typescript
     type ConsularAvatarScenario =
       | 'idle_observing'
       | 'debating'
       | 'wrestling_fistfight'
       | 'nia_impatient'
       | 'disciplinary_execution'
       | 'consensus_celebration'
       | 'veto_clash'
       | 'error_alarm'
       | 'gladiator_spectators'
       | 'courier_arrival'
       | 'self_evolution_upgrade'
       | 'night_shift_afk';
     ```

2. **Original User Request (`ORIGINAL_REQUEST.md`)**:
   - Lines 278–294: *"in the corner of the chat prompt there should be two icons of nia and ferric debating or whatever. with the models appropriately displaying expressions and such. appropriately animated. their simplified anthropormothised should embody their personality. and fit the ashethetic of the ui. i imagine ferric is crossing his arms and looking grumpy. hes in his late 30s and nia is in her mid 20s. maybe if their debate is taking a really long time their avatars could be locked in a fightfight with their fingers interlocked and wrestling each other with teeth gritted."*
   - Lines 320–332: *"Nia's physical features/blonde hair are inspired by Lux (mid-20s), and Ferric's physical features/locs/skin tone are inspired by Lucian (late-30s, grumpy with crossed arms)... Their clothing (industrial dystopian cyberpunk consul attire/techwear) and artistic style (brutalist obsidian/crimson/amber HUD aesthetic) MUST strictly match the dark Brutalist Dystopian Cyberpunk Panopticon UI tone (not fantasy outfits)."*

3. **Server WebSocket Broadcast & Static Serving (`src/server/index.ts`)**:
   - Lines 98–106: Broadcast function transmits typed messages `{ type, payload, timestamp }` over WebSocket to all connected clients at `/events`.
   - Lines 117–119: Consular engine events are wired to broadcast: `consularEngine.onEvent((type, payload) => { broadcast(type, payload); });`.
   - Current server file does not yet mount static file middleware for `src/public` or `/assets/avatars`.

4. **Consular Engine Live Events (`src/server/consular-engine.ts`)**:
   - Emits key events during governance lifecycle:
     - `CONSULAR_DIALOGUE` (line 368)
     - `CONSULAR_PLAN_DELIBERATING` (line 496)
     - `PLAN_AUTHORIZED` (line 540)
     - `PLAN_VETOED` (line 549)
     - `CONSULAR_CONSENSUS` (line 633)
     - `CONSULAR_VETO` (line 685)
     - `DISCIPLINARY_ACTION` (lines 775, 830, 852, 899, 938, 963)
     - `SELF_UPDATE_INITIATED` (line 1079)
     - `SELF_UPDATE_VETOED` (line 1116)
     - `SELF_UPDATE_READY` (line 1167)
     - `GLADIATOR_CONTEST_RESOLVED` (line 1404)
     - `AFK_MODE_CHANGED` (line 1722)
     - `INCIDENT_ALERT` from `subswarm-manager.ts` (line 152)
     - `COURIER_PETITION_RECEIVED` from `courier-gateway.ts` (line 220)

5. **Texture Sheet Assets Verified on Disk (`H:\My Drive\Gemini Antigravity\brain\625b0c0a-b332-4982-8f90-d51ac8c9d850\`)**:
   - `consul_nia_nova_lux_cyberpunk_sheet_1792982091396.jpg` (787,477 bytes, 2x2 expression sheet: Idle Observing, Debating Pitch, Impatient Watch-Tap, Consensus Celebration).
   - `consul_ferric_lunaux_lucian_cyberpunk_sheet_1792982043540.jpg` (678,626 bytes, 2x2 expression sheet: Crossed-Arms Grumpy Idle, Blueprint Audit Debate, Veto Stamp, Night-Shift Coffee).
   - `consuls_wrestling_clash_v2_1792982145487.jpg` (845,188 bytes, high-res dramatic battle scene: interlocked fingers, gritted teeth, straining muscles, cyberpunk tension sparks).
   - Orchestrator directive specifies copying these to `public/assets/avatars/consul_nia_nova_sheet.jpg`, `public/assets/avatars/consul_ferric_lunaux_sheet.jpg`, and `public/assets/avatars/consuls_wrestling_clash.jpg`.

---

### 2. Logic Chain

From these direct observations, we derive the technical architecture and implementation strategy through six logical steps:

1. **Step 1: Hybrid Rendering Architecture (CSS Texture Matrix + Vector SVG + Canvas 2D Particle Engine)**
   - *Observation Reference*: §1.1, §1.5. High-resolution texture sheets provide photorealistic dystopian character artwork, while animated dialogue, eye movements, particle sparks, and laser shields require dynamic 60 FPS real-time rendering.
   - *Deduction*: A pure image-only approach cannot animate lips or generate dynamic sparks; a pure vector approach lacks the photorealistic depth of the generated texture sheets. Therefore, a three-tier hybrid pipeline is optimal:
     - **Tier 1 (Base Texture Sheet Matrix)**: A CSS `background-position` sprite layer mapping the 2x2 quadrants of Nia and Ferric's sheets (or swapping to `consuls_wrestling_clash.jpg` during deadlock).
     - **Tier 2 (Vector SVG Micro-Animation Layer)**: Overlaid SVG layer providing lip-sync mouth morphing, glowing eye flares, animated Pollice Verso thumb rotation, glowing red VETO shield, and binary HUD telemetry.
     - **Tier 3 (Canvas 2D FX & Particle Generator)**: Overlay canvas rendering physics-based sparks (`wrestling_fistfight`), siren strobe sweeps (`error_alarm`), cybernetic wireframe matrix rain (`self_evolution_upgrade`), and rising coffee steam (`night_shift_afk`).

2. **Step 2: Center Chat Prompt DOM Positioning & Layout Integration**
   - *Observation Reference*: §1.1, §1.2. The widget is explicitly specified as sitting in the corner of the Center Chat Prompt area.
   - *Deduction*: Placing the widget inside `#consular-prompt-avatar-widget` docked at the top-right corner of the prompt bar (`.console-prompt-container`) ensures it remains permanently visible while the user is typing or reviewing messages, without obscuring the prompt text area. It has fixed dimensions `260px` width by `130px` height (expanding to `260px` by `220px` when the scenario drawer is opened), with sharp `0px` borders, brutalist `#0a0a0c` background, and scanline overlays.

3. **Step 3: 12-Scenario State Machine & Event-Driven Transition Matrix**
   - *Observation Reference*: §1.1, §1.4. The system emits 13+ distinct WebSocket events representing swarm lifecycle changes.
   - *Deduction*: The frontend state machine must map each WebSocket event to its corresponding scenario, maintain a debounce/hold timer (e.g., 3–5 seconds for momentary events like `consensus_celebration` or `veto_clash` before returning to `idle_observing`), and track a debate turn counter that triggers `wrestling_fistfight` when consecutive debate turns exceed 3 without unanimous consensus.

4. **Step 4: Signature Wrestling Deadlock Mechanics (`wrestling_fistfight`)**
   - *Observation Reference*: §1.1, §1.2, §1.5. Interlocked fingers, gritted teeth, straining postures, and flying cyberpunk sparks.
   - *Deduction*: When `wrestling_fistfight` activates, the split dual-avatar display smoothly cross-fades into the unified clash stage using `consuls_wrestling_clash.jpg`. The Canvas particle engine spawns high-velocity sparks (`#ffb000`, `#ff3300`, `#00ffff`) originating at the interlocked knuckles, while CSS micro-jitter (`matrix3d` translate -1px to +1px at 30Hz) simulates raw physical exertion.

5. **Step 5: Interactive Manual Scenario Selector Drawer (`#consular-scenario-drawer`)**
   - *Observation Reference*: §1.1, Dispatch requirement 3. The UI must provide a manual scenario selector for testing and demoing all 12 scenarios.
   - *Deduction*: A brutalist collapsible drawer triggered by a header badge (`[DEMO/SCENARIOS ▼]`) allows instant one-click activation of any scenario. It also features a `[LIVE SYNC: AUTO]` toggle to resume listening to live WebSocket events.

6. **Step 6: Express Static Asset Pipeline & Fallback Resilience**
   - *Observation Reference*: §1.3, §1.5. Static assets must be served with correct MIME types, and the widget must remain functional even if network latency delays texture image loading.
   - *Deduction*: Express must serve `src/public` and `/assets/avatars/`. If images are loading or fail, procedural inline SVG avatars render immediately with zero visual breakdown.

---

### 3. Caveats

1. **Hardware Acceleration & GPU Rasterization**: CSS matrix transforms and Canvas 2D particle loops rely on `requestAnimationFrame`. On systems with disabled hardware acceleration, the particle count should be capped at 40 active sparks to guarantee < 2% CPU usage.
2. **Audio Telemetry / Sound Effects**: While visual animations are fully specified, optional audio cues (chimes, siren buzzers, wrestling clatter) must respect user mute preferences stored in `localStorage.getItem('panopticon_audio_muted')`.
3. **Responsive Scaling on Detached Multi-Monitor Panels**: When the Center Console is popped out into an independent window (`?panel=console`), the avatar widget scales proportionally via `clamp(220px, 20vw, 320px)`.
4. **Backend Auto-Trigger Thresholds**: The transition from `debating` to `wrestling_fistfight` is configured at $\ge 4$ turns of unresolved debate. If Consuls resolve before 4 turns, they transition directly to `consensus_celebration` without wrestling.

---

### 4. Conclusion & Technical Blueprint

The Corner Consular Avatar and 12-Scenario Animation Suite is architected as an autonomous, high-performance visual widget delivered via two core files:
- **`src/public/js/consular-avatars.js`**: State machine controller, WebSocket event listener, Canvas particle system, SVG renderer, and manual selector drawer.
- **`src/public/css/consular-avatars.css`**: Brutalist aesthetic styles, 2x2 sprite offsets, keyframe animations, and responsive positioning.

#### 4.1. DOM Hierarchy & HTML Blueprint

Situated at the top-right of the prompt bar in `src/public/index.html`:

```html
<!-- Corner Consular Avatar Widget (Mounted inside Center Console Prompt Bar) -->
<div id="consular-prompt-avatar-widget" class="consular-avatar-box brutalist-panel">
  <!-- Scanline & CRT Glitch Overlay -->
  <div class="avatar-crt-scanlines"></div>

  <!-- Telemetry HUD Header Strip -->
  <header class="avatar-hud-strip">
    <div class="hud-left">
      <span class="hud-indicator active-pulse"></span>
      <span id="avatar-state-label" class="hud-state-text">STATE: IDLE_OBSERVING</span>
    </div>
    <div class="hud-right">
      <span class="hud-consuls-tag">NIA // FERRIC</span>
      <button id="avatar-drawer-toggle" class="brutalist-mini-btn" title="Open 12-Scenario Demo Drawer">[DEMO ▼]</button>
    </div>
  </header>

  <!-- Main Avatar Stage Viewport -->
  <div id="avatar-stage-viewport" class="avatar-stage-viewport">
    <!-- Split Consular Sub-Stages (Active in Scenarios 1-2, 4-12) -->
    <div id="stage-dual-consuls" class="stage-dual-consuls">
      <!-- Nia Nova (Lux-Inspired Cyberpunk Consul) -->
      <div id="consul-stage-nia" class="consul-substage nia-substage" data-posture="idle">
        <div class="avatar-texture-layer nia-texture-sheet"></div>
        <svg class="avatar-vector-overlay" viewBox="0 0 120 120">
          <defs>
            <filter id="prism-glow"><feGaussianBlur stdDeviation="1.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <!-- Prismatic Hair Strands & Cybernetic Visor -->
          <path class="nia-hair-prism" d="M35 15 Q60 5 85 20 Q95 45 80 55" />
          <path id="nia-mouth" class="avatar-mouth" d="M52 68 Q60 72 68 68" />
          <circle id="nia-eye-glow" class="avatar-eye-glow cyan-flare" cx="50" cy="48" r="3" />
          <circle id="nia-eye-glow-r" class="avatar-eye-glow cyan-flare" cx="70" cy="48" r="3" />
          <!-- Animated Foot Tapping & Arms -->
          <g id="nia-props-layer"></g>
        </svg>
        <span class="avatar-nametag">NIA // 24</span>
      </div>

      <!-- Center Divider & Clash Sparks Anchor -->
      <div class="consul-divider">
        <span class="divider-line"></span>
        <span id="consul-clash-symbol" class="clash-symbol">⚖</span>
        <span class="divider-line"></span>
      </div>

      <!-- Ferric Lunaux (Lucian-Inspired Cyberpunk Consul) -->
      <div id="consul-stage-ferric" class="consul-substage ferric-substage" data-posture="idle">
        <div class="avatar-texture-layer ferric-texture-sheet"></div>
        <svg class="avatar-vector-overlay" viewBox="0 0 120 120">
          <!-- Tied-Back Locs & High Armor Collar -->
          <path class="ferric-locs" d="M30 18 Q20 35 15 65 M90 18 Q100 35 105 65" />
          <path id="ferric-mouth" class="avatar-mouth" d="M50 70 Q60 67 70 70" />
          <circle id="ferric-eye-glow" class="avatar-eye-glow amber-flare" cx="50" cy="48" r="3" />
          <path class="ferric-brow-furrow" d="M45 42 L55 45 M75 42 L65 45" />
          <!-- Crossed Arms & Props Layer -->
          <g id="ferric-props-layer"></g>
        </svg>
        <span class="avatar-nametag">FERRIC // 38</span>
      </div>
    </div>

    <!-- Unified Wrestling Clash Stage (Active in Scenario 3: wrestling_fistfight) -->
    <div id="stage-wrestling-clash" class="stage-wrestling-clash hidden">
      <div class="avatar-texture-layer wrestling-texture-sheet"></div>
      <div class="wrestling-energy-grid"></div>
    </div>

    <!-- Canvas 2D Particle System & FX Overlay (Sparks, Siren, Steam, Matrix Rain) -->
    <canvas id="avatar-fx-canvas" class="avatar-fx-canvas" width="260" height="100"></canvas>

    <!-- Context Dialogue Ticker Bubble -->
    <div id="avatar-speech-ticker" class="avatar-speech-ticker hidden">
      <span id="speech-consul-badge" class="speech-badge">NIA:</span>
      <span id="speech-content-text" class="speech-text">Analyzing worker velocity...</span>
    </div>
  </div>

  <!-- Manual 12-Scenario Selector Drawer (Brutalist Dropdown) -->
  <div id="consular-scenario-drawer" class="consular-scenario-drawer collapsed">
    <div class="drawer-header">
      <span>12-SCENARIO MANUAL TEST RIG</span>
      <button id="drawer-live-sync-btn" class="brutalist-btn-tag active">LIVE SYNC: ON</button>
    </div>
    <div class="drawer-grid">
      <button class="scenario-btn" data-scenario="idle_observing"><span class="idx">01</span> IDLE</button>
      <button class="scenario-btn" data-scenario="debating"><span class="idx">02</span> DEBATE</button>
      <button class="scenario-btn highlight-red" data-scenario="wrestling_fistfight"><span class="idx">03</span> WRESTLE</button>
      <button class="scenario-btn" data-scenario="nia_impatient"><span class="idx">04</span> IMPATIENT</button>
      <button class="scenario-btn highlight-crimson" data-scenario="disciplinary_execution"><span class="idx">05</span> EXECUTE</button>
      <button class="scenario-btn highlight-cyan" data-scenario="consensus_celebration"><span class="idx">06</span> CONSENSUS</button>
      <button class="scenario-btn highlight-red" data-scenario="veto_clash"><span class="idx">07</span> VETO</button>
      <button class="scenario-btn highlight-amber" data-scenario="error_alarm"><span class="idx">08</span> ALARM</button>
      <button class="scenario-btn" data-scenario="gladiator_spectators"><span class="idx">09</span> GLADIATOR</button>
      <button class="scenario-btn" data-scenario="courier_arrival"><span class="idx">10</span> COURIER</button>
      <button class="scenario-btn highlight-cyan" data-scenario="self_evolution_upgrade"><span class="idx">11</span> EVOLVE</button>
      <button class="scenario-btn" data-scenario="night_shift_afk"><span class="idx">12</span> NIGHT AFK</button>
    </div>
  </div>
</div>
```

---

#### 4.2. Complete 12-Scenario Detailed Specification

Below is the exhaustive specification for each scenario, including postures, sprite mappings, vector overlays, particle dynamics, and transition triggers:

| # | Scenario State ID | Texture Sprite Quadrant | Vector Layer Modifications | Canvas FX Particle Behaviors | Swarm / Event Triggers |
|---|---|---|---|---|---|
| **01** | `idle_observing` | Nia: Top-Left `(0, 0)`<br>Ferric: Top-Left `(0, 0)` | Nia: Defiant smirk `<path d="M52 68 Q60 74 68 68"/>`, subtle cyan prismatic hair pulse.<br>Ferric: Stern scowl `<path d="M50 70 Q60 66 70 70"/>`, crossed arms, chest rhythmic breathing. | Subtle ambient scanline flicker; 2-3 drifting gold embers. | Default state; after event duration expiry; swarm normal operations. |
| **02** | `debating` | Nia: Top-Right `(100%, 0)`<br>Ferric: Top-Right `(100%, 0)` | Syllable-synced mouth oscillation (`Q60 76` <-> `Q60 64` at 4Hz).<br>Eyebrows raising/lowering; gesture hands pointing to virtual blueprints. | Floating monospace binary telemetry bits (`0101`, `HEX`) rising between them. | `CONSULAR_DIALOGUE`, `CONSULAR_PLAN_DELIBERATING`, `CONSULAR_REVIEW`. |
| **03** | `wrestling_fistfight` | Unified Stage: `consuls_wrestling_clash.jpg`<br>`(50%, 50%)` center fit | Interlocked knuckles in foreground; both Consuls gritting teeth (`M48 68 L72 68` with teeth hash lines); glowing eye trails. | High-intensity particle emitter at $(130, 50)$ generating 30-50 sparks/sec in amber/crimson/cyan with gravity and bounce. Screen shake at 30Hz (`±1px`). | Debate turns $\ge 4$ without consensus; consecutive VETO deadlock; manual trigger. |
| **04** | `nia_impatient` | Nia: Bottom-Left `(0, 100%)`<br>Ferric: Top-Left `(0, 0)` | Nia: Arm pointing toward Left Cubicle Grid, rapid foot-tapping animation (`rotate(-10deg) <-> rotate(10deg)` at 6Hz), glowing annoyed irises.<br>Ferric: Sighing posture, hand pinching nose bridge. | Pulsing amber targeting reticle and velocity telemetry: `"STALL: >60s"`. | In-progress task elapsed velocity exceeded; cubicle stall detected; mid-work intervention proposal. |
| **05** | `disciplinary_execution` | Nia: Top-Right `(100%, 0)`<br>Ferric: Bottom-Left `(0, 100%)` | Ferric: Arm raises and rotates 180° into Roman thumb-down (`Pollice Verso`).<br>Nia: Slams glowing red physical eject switch.<br>Both: Eyes turn intense crimson (`#ff0033`). | Vertical crimson laser guillotine blade drops across stage; electrical arc discharge. | `DISCIPLINARY_ACTION` (`kill_agent`, `wipe_memory`, `swap_role`). |
| **06** | `consensus_celebration` | Nia: Bottom-Right `(100%, 100%)`<br>Ferric: Top-Left `(0, 0)` | Nia: Radiant smile, extends fist for fist-bump.<br>Ferric: Reluctantly extends right fist with small curt nod while keeping left arm crossed. | Golden and cyan shockwave burst upon fist collision at $(130, 60)$; 2/2 CONSULAR RATIFIED stamp. | `CONSULAR_CONSENSUS` (2/2 APPROVE); `PLAN_AUTHORIZED`. Hold 3.5s then return to idle. |
| **07** | `veto_clash` | Nia: Top-Right `(100%, 0)`<br>Ferric: Bottom-Left `(0, 100%)` | Vetoing Consul slams down heavy holographic red `VETO` shield.<br>Dissenting Consul throws hands up in frustration or glares. | Expanding hexagonal red energy barrier with impact ripples and jagged lightning cracks. | `CONSULAR_VETO`; `PLAN_VETOED`; `SELF_UPDATE_VETOED`. Hold 4s then return. |
| **08** | `error_alarm` | Nia: Bottom-Left `(0, 100%)`<br>Ferric: Top-Right `(100%, 0)` | Nia: Full ocular combat visor drops, hair flares with warning red highlights.<br>Ferric: Rapidly deploys tactical error telemetry overlay. | Red siren strobe sweeps across entire widget (radial gradient rotating at 2Hz); yellow hazard stripes flash. | `INCIDENT_ALERT`; `CIRCUIT_BREAKER_TRIPPED`; cubicle flatline. Hold 5s. |
| **09** | `gladiator_spectators` | Nia: Bottom-Right `(100%, 100%)`<br>Ferric: Top-Right `(100%, 0)` | Nia: Leaning over balcony railing, cheering and pumping fist.<br>Ferric: Holding tactical cyber-binoculars up to ocular visor, analyzing cubicles. | Split dual spotlights sweeping down toward Left Grid; tournament score counters (`CUBICLE_A vs CUBICLE_B`). | Tournament/Gladiator task active; `GLADIATOR_CONTEST_RESOLVED`. |
| **10** | `courier_arrival` | Nia: Bottom-Right `(100%, 100%)`<br>Ferric: Top-Right `(100%, 0)` | Nia: Welcoming wave to incoming courier envoy.<br>Ferric: Squinting and inspecting incoming cryptographic seal with scanning laser. | Floating holographic wireframe envoy avatar (`OpenClaw` mechanical claw, `Hermes` winged helm, or `GPT Dot` orb) hovering between them. | `COURIER_PETITION_RECEIVED`; `COURIER_WISDOM_DELIBERATING`. Hold 4s. |
| **11** | `self_evolution_upgrade` | Nia: Top-Right `(100%, 0)`<br>Ferric: Top-Left `(0, 0)` | Both avatars surrounded by glowing cyan wireframe bounding boxes; digital disintegration/recompilation effect. | Vertical green/cyan matrix code cascades (`01` stream); surging energy grid; build progress bar (`0% -> 100%`). | `SELF_UPDATE_INITIATED`; `APPROVED_REBUILDING`; `SELF_UPDATE_READY`. |
| **12** | `night_shift_afk` | Nia: Bottom-Right `(100%, 100%)`<br>Ferric: Bottom-Right `(100%, 100%)` | Ferric: Under single warm amber desk lamp, sipping steaming black synth-coffee from brutalist mug.<br>Nia: Relaxed posture, wearing illuminated cyber-headphones, auto-replying. | Dimmed ambient light filter (`brightness: 0.6`); rising wisps of steam particles from coffee mug; rhythmic audio visualizer waves on Nia's headset. | `AFK_MODE_CHANGED` (`enabled: true`). Persists until AFK mode disabled. |

---

#### 4.3. Concrete JavaScript Controller (`src/public/js/consular-avatars.js`)

Below is the concrete, drop-in architecture and implementation for `consular-avatars.js`:

```javascript
/**
 * src/public/js/consular-avatars.js
 *
 * Corner Consular Avatars & 12-Scenario Animation Suite Controller.
 * Features:
 * - Lux-inspired Consul Nia Nova & Lucian-inspired Consul Ferric Lunaux
 * - Hybrid rendering: CSS Texture Sheets + Vector SVG + Canvas 2D Particle Engine
 * - Signature interlocked-fingers & gritted-teeth wrestling deadlock engine
 * - Real-time WebSocket event synchronization & auto-revert timers
 * - Interactive 12-scenario manual test/demo selector drawer
 */

export class ConsularAvatarWidget {
  constructor(options = {}) {
    this.containerId = options.containerId || 'consular-prompt-avatar-widget';
    this.container = document.getElementById(this.containerId);
    this.wsUrl = options.wsUrl || `ws://${window.location.host}/events`;

    // State Machine
    this.currentState = 'idle_observing';
    this.isLiveSync = true;
    this.debateTurns = 0;
    this.revertTimer = null;
    this.mouthInterval = null;

    // Canvas & Particles
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animFrameId = null;

    // DOM Elements
    this.elements = {};

    this.init();
  }

  init() {
    if (!this.container) {
      console.warn(`[ConsularAvatarWidget] Container #${this.containerId} not found.`);
      return;
    }

    this.cacheElements();
    this.initCanvas();
    this.bindEvents();
    this.connectWebSocket();
    this.setScenario('idle_observing');
  }

  cacheElements() {
    this.elements.stateLabel = document.getElementById('avatar-state-label');
    this.elements.drawerToggle = document.getElementById('avatar-drawer-toggle');
    this.elements.drawer = document.getElementById('consular-scenario-drawer');
    this.elements.liveSyncBtn = document.getElementById('drawer-live-sync-btn');
    this.elements.stageDual = document.getElementById('stage-dual-consuls');
    this.elements.stageWrestling = document.getElementById('stage-wrestling-clash');
    this.elements.stageNia = document.getElementById('consul-stage-nia');
    this.elements.stageFerric = document.getElementById('consul-stage-ferric');
    this.elements.niaMouth = document.getElementById('nia-mouth');
    this.elements.ferricMouth = document.getElementById('ferric-mouth');
    this.elements.speechTicker = document.getElementById('avatar-speech-ticker');
    this.elements.speechBadge = document.getElementById('speech-consul-badge');
    this.elements.speechText = document.getElementById('speech-content-text');
    this.elements.canvas = document.getElementById('avatar-fx-canvas');
  }

  initCanvas() {
    this.canvas = this.elements.canvas;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
      this.startParticleLoop();
    }
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width || 260;
    this.canvas.height = rect.height || 100;
  }

  bindEvents() {
    // Drawer Toggle
    if (this.elements.drawerToggle && this.elements.drawer) {
      this.elements.drawerToggle.addEventListener('click', () => {
        this.elements.drawer.classList.toggle('collapsed');
      });
    }

    // Live Sync Toggle
    if (this.elements.liveSyncBtn) {
      this.elements.liveSyncBtn.addEventListener('click', () => {
        this.isLiveSync = !this.isLiveSync;
        this.elements.liveSyncBtn.classList.toggle('active', this.isLiveSync);
        this.elements.liveSyncBtn.textContent = this.isLiveSync ? 'LIVE SYNC: ON' : 'LIVE SYNC: OFF';
      });
    }

    // Manual Scenario Buttons
    const buttons = this.container.querySelectorAll('.scenario-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const scenario = btn.getAttribute('data-scenario');
        if (scenario) {
          this.setScenario(scenario, { manual: true });
        }
      });
    });
  }

  connectWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onmessage = (evt) => {
        if (!this.isLiveSync) return;
        try {
          const data = JSON.parse(evt.data);
          this.handleServerEvent(data.type, data.payload);
        } catch (err) {
          console.error('[ConsularAvatarWidget] Message parse error:', err);
        }
      };
      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (e) {
      console.warn('[ConsularAvatarWidget] WebSocket init failed, running standalone demo mode.');
    }
  }

  handleServerEvent(type, payload) {
    switch (type) {
      case 'CONSULAR_AVATAR_STATE':
        this.setScenario(payload.state, payload);
        break;

      case 'CONSULAR_DIALOGUE':
        this.debateTurns++;
        if (this.debateTurns >= 4) {
          this.setScenario('wrestling_fistfight', { details: 'Deadlock on debate consensus' });
        } else {
          this.setScenario('debating', {
            speaker: payload.sender || payload.consul,
            content: payload.content,
            holdMs: 4000
          });
        }
        break;

      case 'CONSULAR_PLAN_DELIBERATING':
        this.setScenario('debating', { holdMs: 3500 });
        break;

      case 'PLAN_AUTHORIZED':
      case 'CONSULAR_CONSENSUS':
        this.debateTurns = 0;
        this.setScenario('consensus_celebration', { holdMs: 3500 });
        break;

      case 'PLAN_VETOED':
      case 'CONSULAR_VETO':
      case 'SELF_UPDATE_VETOED':
        this.debateTurns++;
        if (this.debateTurns >= 4) {
          this.setScenario('wrestling_fistfight', { holdMs: 6000 });
        } else {
          this.setScenario('veto_clash', { holdMs: 4000 });
        }
        break;

      case 'DISCIPLINARY_ACTION':
        this.setScenario('disciplinary_execution', { holdMs: 4500 });
        break;

      case 'INCIDENT_ALERT':
      case 'CIRCUIT_BREAKER_TRIPPED':
        this.setScenario('error_alarm', { holdMs: 5000 });
        break;

      case 'GLADIATOR_CONTEST_RESOLVED':
        this.setScenario('gladiator_spectators', { holdMs: 4000 });
        break;

      case 'COURIER_PETITION_RECEIVED':
      case 'COURIER_WISDOM_DELIBERATING':
        this.setScenario('courier_arrival', { holdMs: 4000 });
        break;

      case 'SELF_UPDATE_INITIATED':
      case 'APPROVED_REBUILDING':
      case 'SELF_UPDATE_READY':
        this.setScenario('self_evolution_upgrade', { holdMs: 6000 });
        break;

      case 'AFK_MODE_CHANGED':
        if (payload.afk_mode || payload.enabled) {
          this.setScenario('night_shift_afk');
        } else {
          this.setScenario('idle_observing');
        }
        break;

      default:
        break;
    }
  }

  setScenario(scenario, options = {}) {
    clearTimeout(this.revertTimer);
    clearInterval(this.mouthInterval);
    this.currentState = scenario;

    // Update HUD State Label
    if (this.elements.stateLabel) {
      this.elements.stateLabel.textContent = `STATE: ${scenario.toUpperCase()}`;
    }

    // Toggle Stage Views
    if (scenario === 'wrestling_fistfight') {
      this.elements.stageDual?.classList.add('hidden');
      this.elements.stageWrestling?.classList.remove('hidden');
      this.container.classList.add('shake-active');
    } else {
      this.elements.stageDual?.classList.remove('hidden');
      this.elements.stageWrestling?.classList.add('hidden');
      this.container.classList.remove('shake-active');
    }

    // Apply Posture Data Attributes to Dual Sub-Stages
    this.applyStagePostures(scenario);

    // Trigger Specific FX & Animations
    this.triggerScenarioFx(scenario, options);

    // Auto-Revert to idle_observing if holdMs specified
    if (options.holdMs && scenario !== 'night_shift_afk') {
      this.revertTimer = setTimeout(() => {
        this.setScenario('idle_observing');
      }, options.holdMs);
    }
  }

  applyStagePostures(scenario) {
    if (!this.elements.stageNia || !this.elements.stageFerric) return;

    this.container.setAttribute('data-scenario', scenario);

    switch (scenario) {
      case 'idle_observing':
        this.elements.stageNia.setAttribute('data-posture', 'idle');
        this.elements.stageFerric.setAttribute('data-posture', 'idle');
        break;
      case 'debating':
        this.elements.stageNia.setAttribute('data-posture', 'debating');
        this.elements.stageFerric.setAttribute('data-posture', 'debating');
        this.startMouthOscillation();
        break;
      case 'nia_impatient':
        this.elements.stageNia.setAttribute('data-posture', 'impatient');
        this.elements.stageFerric.setAttribute('data-posture', 'sighing');
        break;
      case 'disciplinary_execution':
        this.elements.stageNia.setAttribute('data-posture', 'eject_button');
        this.elements.stageFerric.setAttribute('data-posture', 'pollice_verso');
        break;
      case 'consensus_celebration':
        this.elements.stageNia.setAttribute('data-posture', 'fist_bump');
        this.elements.stageFerric.setAttribute('data-posture', 'fist_bump');
        break;
      case 'veto_clash':
        this.elements.stageNia.setAttribute('data-posture', 'dissent');
        this.elements.stageFerric.setAttribute('data-posture', 'veto_shield');
        break;
      case 'error_alarm':
        this.elements.stageNia.setAttribute('data-posture', 'visor_flare');
        this.elements.stageFerric.setAttribute('data-posture', 'telemetry_scan');
        break;
      case 'gladiator_spectators':
        this.elements.stageNia.setAttribute('data-posture', 'cheering');
        this.elements.stageFerric.setAttribute('data-posture', 'binoculars');
        break;
      case 'courier_arrival':
        this.elements.stageNia.setAttribute('data-posture', 'waving');
        this.elements.stageFerric.setAttribute('data-posture', 'seal_inspect');
        break;
      case 'self_evolution_upgrade':
        this.elements.stageNia.setAttribute('data-posture', 'wireframe');
        this.elements.stageFerric.setAttribute('data-posture', 'wireframe');
        break;
      case 'night_shift_afk':
        this.elements.stageNia.setAttribute('data-posture', 'headphones');
        this.elements.stageFerric.setAttribute('data-posture', 'coffee');
        break;
      default:
        break;
    }
  }

  startMouthOscillation() {
    let frame = 0;
    this.mouthInterval = setInterval(() => {
      frame++;
      const curve = frame % 2 === 0 ? 76 : 64;
      if (this.elements.niaMouth) {
        this.elements.niaMouth.setAttribute('d', `M52 68 Q60 ${curve} 68 68`);
      }
      if (this.elements.ferricMouth) {
        this.elements.ferricMouth.setAttribute('d', `M50 70 Q60 ${curve - 4} 70 70`);
      }
    }, 120);
  }

  triggerScenarioFx(scenario, options) {
    this.particles = [];

    // Dialogue speech ticker display
    if (scenario === 'debating' && options.content && this.elements.speechTicker) {
      this.elements.speechBadge.textContent = options.speaker ? `${options.speaker.toUpperCase()}:` : 'CONSUL:';
      this.elements.speechText.textContent = options.content.slice(0, 75);
      this.elements.speechTicker.classList.remove('hidden');
    } else if (this.elements.speechTicker) {
      this.elements.speechTicker.classList.add('hidden');
    }

    // Spawn initial particle burst
    if (scenario === 'wrestling_fistfight') {
      for (let i = 0; i < 40; i++) {
        this.spawnWrestlingSpark();
      }
    } else if (scenario === 'consensus_celebration') {
      for (let i = 0; i < 30; i++) {
        this.spawnConsensusBurst();
      }
    }
  }

  spawnWrestlingSpark() {
    if (!this.canvas) return;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4.5;
    const colors = ['#ffb000', '#ff1e1e', '#00e5ff', '#ffffff'];

    this.particles.push({
      x: cx + (Math.random() - 0.5) * 10,
      y: cy + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.0,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.03,
      size: 1.5 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: 'spark'
    });
  }

  spawnConsensusBurst() {
    if (!this.canvas) return;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2 + 10;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.0 + Math.random() * 3.0;

    this.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.03,
      size: 2 + Math.random() * 2,
      color: Math.random() > 0.5 ? '#00e5ff' : '#ffb000',
      type: 'star'
    });
  }

  spawnSteamParticle() {
    if (!this.canvas) return;
    this.particles.push({
      x: this.canvas.width * 0.75 + (Math.random() - 0.5) * 8,
      y: this.canvas.height * 0.7,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.6 - Math.random() * 0.6,
      life: 1.0,
      decay: 0.015,
      size: 3 + Math.random() * 4,
      color: 'rgba(255, 255, 255, 0.25)',
      type: 'smoke'
    });
  }

  startParticleLoop() {
    const loop = () => {
      this.updateAndRenderParticles();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  updateAndRenderParticles() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Continuous spawner during specific states
    if (this.currentState === 'wrestling_fistfight' && Math.random() < 0.8) {
      this.spawnWrestlingSpark();
      this.spawnWrestlingSpark();
    } else if (this.currentState === 'night_shift_afk' && Math.random() < 0.2) {
      this.spawnSteamParticle();
    }

    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      if (p.type === 'spark') {
        p.vy += 0.12; // Gravity
      }

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;

      if (p.type === 'smoke') {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * (2 - p.life), 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      this.ctx.restore();
    }
  }

  destroy() {
    clearTimeout(this.revertTimer);
    clearInterval(this.mouthInterval);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.ws) this.ws.close();
  }
}
```

---

#### 4.4. Concrete CSS Specification (`src/public/css/consular-avatars.css`)

Below is the concrete, drop-in stylesheet for `consular-avatars.css`:

```css
/**
 * src/public/css/consular-avatars.css
 *
 * Brutalist Cyberpunk Panopticon Styling for Corner Consular Avatars
 * & 12-Scenario Animation Suite
 */

:root {
  --consul-obsidian: #0a0a0c;
  --consul-panel-bg: #101014;
  --consul-border-crimson: #ff1e1e;
  --consul-border-amber: #ffb000;
  --consul-border-cyan: #00e5ff;
  --consul-dim-border: #22222a;
  --consul-hud-font: 'JetBrains Mono', 'Fira Code', monospace;
}

/* -------------------------------------------------------------
   Corner Avatar Box Container (Docked in Prompt Area)
------------------------------------------------------------- */
.consular-avatar-box {
  position: relative;
  width: 260px;
  height: 130px;
  background-color: var(--consul-obsidian);
  border: 1px solid var(--consul-border-crimson);
  border-radius: 0px !important;
  box-shadow: 0 0 12px rgba(255, 30, 30, 0.25), inset 0 0 8px rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  font-family: var(--consul-hud-font);
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

/* CRT Scanlines Overlay */
.avatar-crt-scanlines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.35) 50%);
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 10;
  opacity: 0.7;
}

/* HUD Header Strip */
.avatar-hud-strip {
  height: 22px;
  background: #141418;
  border-bottom: 1px solid var(--consul-dim-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  font-size: 9px;
  letter-spacing: 0.5px;
  color: #a0a0a8;
  z-index: 5;
}

.hud-left {
  display: flex;
  align-items: center;
  gap: 5px;
}

.active-pulse {
  width: 6px;
  height: 6px;
  background-color: #00ff66;
  border-radius: 0px;
  box-shadow: 0 0 4px #00ff66;
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.hud-state-text {
  font-weight: 700;
  color: #e0e0e8;
}

.hud-consuls-tag {
  color: var(--consul-border-amber);
  margin-right: 4px;
}

.brutalist-mini-btn {
  background: #1c1c24;
  border: 1px solid #3a3a46;
  color: #ffb000;
  font-family: var(--consul-hud-font);
  font-size: 8px;
  padding: 1px 4px;
  cursor: pointer;
  border-radius: 0px;
}
.brutalist-mini-btn:hover {
  background: #ffb000;
  color: #000;
}

/* -------------------------------------------------------------
   Main Stage Viewport & Sub-Stages
------------------------------------------------------------- */
.avatar-stage-viewport {
  position: relative;
  flex: 1;
  width: 100%;
  height: 108px;
  background: #08080a;
  overflow: hidden;
}

.stage-dual-consuls {
  display: flex;
  width: 100%;
  height: 100%;
}

.consul-substage {
  position: relative;
  flex: 1;
  height: 100%;
  overflow: hidden;
}

/* Texture Sheet Layers (2x2 Matrix Offsets) */
.avatar-texture-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 200% 200%;
  transition: background-position 0.25s ease-out;
}

/* Nia 2x2 Texture Sheet Mapping */
.nia-texture-sheet {
  background-image: url('/assets/avatars/consul_nia_nova_sheet.jpg');
  background-position: 0% 0%; /* Default: Idle */
}
.consul-substage[data-posture="debating"] .nia-texture-sheet { background-position: 100% 0%; }
.consul-substage[data-posture="impatient"] .nia-texture-sheet { background-position: 0% 100%; }
.consul-substage[data-posture="fist_bump"] .nia-texture-sheet { background-position: 100% 100%; }

/* Ferric 2x2 Texture Sheet Mapping */
.ferric-texture-sheet {
  background-image: url('/assets/avatars/consul_ferric_lunaux_sheet.jpg');
  background-position: 0% 0%; /* Default: Crossed Arms Grumpy Idle */
}
.consul-substage[data-posture="debating"] .ferric-texture-sheet { background-position: 100% 0%; }
.consul-substage[data-posture="pollice_verso"] .ferric-texture-sheet { background-position: 0% 100%; }
.consul-substage[data-posture="veto_shield"] .ferric-texture-sheet { background-position: 0% 100%; }
.consul-substage[data-posture="coffee"] .ferric-texture-sheet { background-position: 100% 100%; }

/* Unified Wrestling Clash Stage */
.stage-wrestling-clash {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #000;
}
.wrestling-texture-sheet {
  background-image: url('/assets/avatars/consuls_wrestling_clash.jpg');
  background-size: cover;
  background-position: center;
  width: 100%;
  height: 100%;
}

/* Vector SVG Overlays */
.avatar-vector-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.avatar-mouth {
  fill: none;
  stroke: #1a0f0f;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.avatar-eye-glow.cyan-flare {
  fill: var(--consul-border-cyan);
  filter: drop-shadow(0 0 3px #00e5ff);
}

.avatar-eye-glow.amber-flare {
  fill: var(--consul-border-amber);
  filter: drop-shadow(0 0 3px #ffb000);
}

.avatar-nametag {
  position: absolute;
  bottom: 2px;
  font-size: 8px;
  font-weight: 700;
  background: rgba(10, 10, 14, 0.85);
  padding: 1px 4px;
  border: 1px solid #333340;
}
.nia-substage .avatar-nametag { left: 4px; color: var(--consul-border-cyan); }
.ferric-substage .avatar-nametag { right: 4px; color: var(--consul-border-amber); }

/* Center Divider */
.consul-divider {
  width: 10px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0d0d12;
  border-left: 1px solid #1a1a24;
  border-right: 1px solid #1a1a24;
  z-index: 2;
}
.divider-line {
  flex: 1;
  width: 1px;
  background: #2a2a38;
}
.clash-symbol {
  font-size: 8px;
  color: #ff1e1e;
  margin: 2px 0;
}

/* Canvas FX */
.avatar-fx-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 4;
}

/* Dialogue Ticker Bubble */
.avatar-speech-ticker {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(10, 10, 14, 0.95);
  border-top: 1px solid var(--consul-border-cyan);
  padding: 2px 6px;
  font-size: 8.5px;
  color: #ffffff;
  display: flex;
  gap: 4px;
  z-index: 6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.speech-badge {
  color: var(--consul-border-cyan);
  font-weight: 700;
}

/* -------------------------------------------------------------
   Scenario-Specific Animations & Transforms
------------------------------------------------------------- */
/* Impatient Foot-Tapping */
[data-scenario="nia_impatient"] .nia-substage {
  animation: foot-tap 0.25s infinite alternate ease-in-out;
}
@keyframes foot-tap {
  from { transform: translateY(0); }
  to { transform: translateY(-1.5px); }
}

/* Wrestling Clash Deadlock Shake */
.shake-active {
  animation: screen-shake 0.08s infinite alternate ease-in-out;
  border-color: #ff1e1e !important;
  box-shadow: 0 0 16px rgba(255, 30, 30, 0.5) !important;
}
@keyframes screen-shake {
  0% { transform: translate(1px, -1px); }
  50% { transform: translate(-1px, 1px); }
  100% { transform: translate(0px, 1px); }
}

/* Error Alarm Siren Strobe */
[data-scenario="error_alarm"] {
  border-color: #ff0000 !important;
  animation: siren-strobe 0.8s infinite;
}
@keyframes siren-strobe {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 0, 0, 0.8); background-color: #1a0505; }
  50% { box-shadow: 0 0 4px rgba(255, 0, 0, 0.2); background-color: #0a0a0c; }
}

/* -------------------------------------------------------------
   Manual 12-Scenario Selector Drawer
------------------------------------------------------------- */
.consular-scenario-drawer {
  position: absolute;
  top: 22px;
  left: 0;
  right: 0;
  background: #0d0d12;
  border-bottom: 2px solid var(--consul-border-amber);
  padding: 6px;
  z-index: 20;
  transition: transform 0.25s ease-out, opacity 0.25s ease-out;
}
.consular-scenario-drawer.collapsed {
  transform: translateY(-120%);
  opacity: 0;
  pointer-events: none;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8px;
  color: var(--consul-border-amber);
  margin-bottom: 4px;
  font-weight: 700;
}

.drawer-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
}

.scenario-btn {
  background: #181820;
  border: 1px solid #30303c;
  color: #c0c0cc;
  font-family: var(--consul-hud-font);
  font-size: 8px;
  padding: 3px 2px;
  cursor: pointer;
  border-radius: 0px;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 3px;
}
.scenario-btn:hover {
  background: #282834;
  color: #fff;
  border-color: #555566;
}
.scenario-btn .idx {
  color: var(--consul-border-amber);
  font-size: 7px;
}
.scenario-btn.highlight-red:hover { border-color: #ff1e1e; color: #ff1e1e; }
.scenario-btn.highlight-cyan:hover { border-color: #00e5ff; color: #00e5ff; }
.scenario-btn.highlight-amber:hover { border-color: #ffb000; color: #ffb000; }

.hidden { display: none !important; }
```

---

#### 4.5. Backend Integration & Static Asset Routing

To complete the pipeline in `src/server/index.ts` and `src/server/routes/governance-routes.ts`:

1. **Mount Express Static Directory for Avatars**:
   In `src/server/index.ts`:
   ```typescript
   // Serve Panopticon SPA frontend and static assets
   const publicDir = path.join(repoRoot, 'src', 'public');
   app.use(express.static(publicDir));
   app.use('/assets/avatars', express.static(path.join(publicDir, 'assets', 'avatars')));
   ```

2. **Avatar State REST Endpoints in `src/server/routes/governance-routes.ts`**:
   ```typescript
   // Get or manually set Consular Avatar State
   router.get('/governance/avatar-state', (req: Request, res: Response) => {
     res.json({
       scenario: consularEngine.getAvatarState?.() || 'idle_observing',
       timestamp: new Date().toISOString()
     });
   });

   router.post('/governance/avatar-state', (req: Request, res: Response) => {
     const { state, details } = req.body;
     consularEngine.broadcastAvatarState?.(state, details);
     res.json({ success: true, state, timestamp: new Date().toISOString() });
   });
   ```

3. **Asset Deployment Target Paths**:
   - `src/public/assets/avatars/consul_nia_nova_sheet.jpg`
   - `src/public/assets/avatars/consul_ferric_lunaux_sheet.jpg`
   - `src/public/assets/avatars/consuls_wrestling_clash.jpg`

---

### 5. Verification Method

Independent verification steps to validate the Consular Avatars and 12-Scenario Animation Suite:

1. **Asset File Verification**:
   Verify source texture sheets and copied public texture sheets exist on disk:
   ```powershell
   Get-Item "H:\My Drive\Gemini Antigravity\brain\625b0c0a-b332-4982-8f90-d51ac8c9d850\consul_nia_nova_lux_cyberpunk_sheet_1792982091396.jpg"
   Get-Item "H:\My Drive\Gemini Antigravity\brain\625b0c0a-b332-4982-8f90-d51ac8c9d850\consul_ferric_lunaux_lucian_cyberpunk_sheet_1792982043540.jpg"
   Get-Item "H:\My Drive\Gemini Antigravity\brain\625b0c0a-b332-4982-8f90-d51ac8c9d850\consuls_wrestling_clash_v2_1792982145487.jpg"
   ```

2. **Automated Unit / E2E Test Suite**:
   Execute the test suite to verify server broadcast and contract integrity:
   ```powershell
   npx vitest run test/e2e/consular-consensus.test.ts
   npx vitest run test/e2e/tier1-feature-coverage.test.ts
   ```

3. **Interactive UI Verification Protocol**:
   - Launch the server: `npm start`
   - Open browser to `http://localhost:3820/`
   - Inspect the prompt area: Verify `#consular-prompt-avatar-widget` renders in the corner of the prompt console with crisp 0px brutalist borders, monospace HUD telemetry, and active pulse indicator.
   - Click `[DEMO ▼]` to open `#consular-scenario-drawer`.
   - Click through all 12 scenario buttons sequentially:
     - `[01] IDLE`: Verify Nia leaning forward with smirk and Ferric with crossed arms and scowl.
     - `[02] DEBATE`: Verify oscillating lip-sync animation and rising monospace telemetry.
     - `[03] WRESTLE`: Verify cross-fade to `stage-wrestling-clash`, interlocked fingers, gritted teeth, flying spark particles from canvas, and micro-screen shake.
     - `[04] IMPATIENT`: Verify Nia foot-tapping animation and Ferric sighed nose-pinch.
     - `[05] EXECUTE`: Verify Ferric Roman thumb-down (`Pollice Verso`), Nia hitting eject button, and crimson eye flares.
     - `[06] CONSENSUS`: Verify Nia offering fist-bump, Ferric reluctantly bumping fist, and starburst impact.
     - `[07] VETO`: Verify red holographic VETO shield impact.
     - `[08] ALARM`: Verify rotating red siren strobe across widget and visor flare.
     - `[09] GLADIATOR`: Verify Nia balcony cheering and Ferric tactical binoculars.
     - `[10] COURIER`: Verify Nia wave and Ferric inspecting holographic seal.
     - `[11] EVOLVE`: Verify cyan/green matrix rain and wireframe pulse.
     - `[12] NIGHT AFK`: Verify dimmed ambient light, Ferric coffee steam, and Nia cyber-headphones.
   - Click `LIVE SYNC: ON`: Trigger a Consular Veto or consensus via API (`POST /api/governance/review`), and verify the avatar automatically transitions into `veto_clash` or `consensus_celebration` in real time.

4. **Invalidation Conditions**:
   - The test fails if any of the 12 scenarios fail to transition or render visual differences.
   - The test fails if `wrestling_fistfight` does not feature interlocked fingers, gritted teeth, and spark particle effects.
   - The test fails if Nia and Ferric's physical designs do not embody the Lux-inspired and Lucian-inspired cyberpunk aesthetics.
