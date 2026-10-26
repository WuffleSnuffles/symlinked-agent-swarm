# Technical Architecture & Implementation Blueprint: Panopticon UI Layout, 3-Section Grid & Multi-Monitor Engine (Milestone 3)

**Author**: `explorer_m3_1` (Teamwork Explorer / Preview Architect)  
**Date**: 2026-10-26  
**Scope**: Milestone 3 UI Core Architecture (Three-Section Brutalist Panopticon Layout, 4x4 Cubicle Grid, Swarm Radar, Kanban Taskboard, Mid-Work Consular Intervention & Multi-Monitor Detachable Panel Engine)  
**Target Output**: `src/public/` UI suite and Express static file serving in `src/server/index.ts`

---

## 1. Observation

### 1.1 Existing Server Infrastructure & Filesystem State
1. **Server Entry Point (`src/server/index.ts`)**:
   - `index.ts` creates an Express server and WebSocket broadcast server at `/events` (lines 11, 96: `const wss = new WebSocketServer({ server, path: '/events' })`).
   - Line 81-82 mounts `app.use(express.json())`.
   - Line 134 mounts `app.use('/api', createGovernanceRouter(consularEngine, preferenceEngine, skillMcpManager, courierGateway))`.
   - **Crucial Observation**: Neither `express.static` nor SPA fallback routing is currently configured. `src/public/` directory currently does NOT exist.
   - Orchestrator directive specifies:
     `app.use('/assets', express.static(path.join(__dirname, '../public/assets')))` and static serving from `src/public/`.

2. **16-Cubicle Grid Roster & Ports (`src/server/cubicle-manager.ts`)**:
   - Lines 108, 134: Each cubicle is explicitly allocated port `4101 + i` (`cubicle-01` -> 4101 .. `cubicle-16` -> 4116).
   - Lines 47-54: Valid lifecycle transitions are defined:
     ```typescript
     vacant: ['idle'],
     idle: ['working', 'vacant'],
     working: ['under_inspection', 'idle', 'error', 'exhausted'],
     under_inspection: ['idle', 'working', 'error'],
     error: ['idle', 'vacant', 'working'],
     exhausted: ['idle', 'vacant'],
     ```
   - Lines 120-136: Live state payload includes:
     `id, config, status, current_task_id, active_subswarm_id, surface_thoughts, stamina_percentage, fatigue_percentage, stamina_tier, last_heartbeat, worktree_path, branch_name, process_pid, port, error_details`.
   - Default pre-configured roster (`src/server/types/cubicle-defaults.ts`):
     - `cubicle-01`: `Gemini 4 Argon (High)`, `can_spawn_subswarm: true`
     - `cubicle-02`: `Gemini 4 Argon (High)`, `can_spawn_subswarm: true`
     - `cubicle-03`: `GPT Astra (Very High)`, `can_spawn_subswarm: false` (strictly restricted solo worker)
     - `cubicle-04` through `cubicle-16`: Unassigned blank slots (`enabled: false`).

3. **Taskboard & Progress Tracking (`src/server/taskboard-manager.ts`)**:
   - Lines 12: `TaskColumn = 'todo' | 'in_progress' | 'review' | 'done'`.
   - Lines 21-40: `SwarmTask` fields include `id, title, description, priority, column, assigned_cubicle, created_at, claimed_at, completed_at, progress_percent, subswarm_active, subswarm_manifest_path, git_branch, git_diff_summary, verification_commands, verification_passed, veto_history, error_log`.
   - Lines 42-49: `OverallMissionProgress = { total, todo, inProgress, review, done, percentage }`.
   - `GET /api/tasks` returns `{ tasks: { todo: [], in_progress: [], review: [], done: [] }, progress: OverallMissionProgress }`.

4. **Dual-Consul Governance & Advanced Swarm Endpoints (`src/server/routes/governance-routes.ts`)**:
   - Consuls: `GET /api/governance/consuls`, `PUT /api/governance/consuls/:id`
   - Review Gate 2: `POST /api/governance/review` (2/2 unanimous consensus or veto)
   - Gate 1 Pre-Dispatch: `POST /api/governance/plan/deliberate`, `POST /api/governance/plan/vote`
   - Dialogue: `GET /api/governance/dialogue?limit=50`
   - Growth: `GET /api/governance/growth` (Nia Nova & Ferric Lunaux profiles)
   - Disciplinary: `POST /api/governance/kill`, `POST /api/governance/thinking-level`, `POST /api/governance/swap-role`, `POST /api/governance/swap-cubicles`, `POST /api/governance/wipe-memory`, `POST /api/governance/access-scope`
   - Self-Update: `POST /api/governance/self-update/initiate`, `POST /api/governance/self-update/review`
   - Vault: `GET /api/vault`, `GET /api/preferences`, `GET /api/skills`, `GET /api/mcp`
   - Courier Gateway: `POST /api/courier/petition`, `GET /api/courier/wisdom`, `GET /api/courier/status/:id`, `GET /api/courier/envoys`
   - File Locks: `POST /api/swarm/locks/acquire`, `POST /api/swarm/locks/release`, `GET /api/swarm/locks`
   - Gladiator: `POST /api/governance/gladiator`
   - Checkpoints: `POST /api/swarm/checkpoints`, `GET /api/swarm/checkpoints`, `POST /api/swarm/checkpoints/:id/rollback`
   - Shared Contracts: `POST /api/swarm/contracts`, `GET /api/swarm/contracts`, `GET /api/swarm/contracts/:name`
   - AFK Mode: `POST /api/swarm/afk`, `GET /api/swarm/afk/digest`
   - Questions: `GET /api/governance/questions`, `POST /api/governance/questions`, `POST /api/governance/questions/:id/answer`

5. **Test Assertions (`test/e2e/tier1-feature-coverage.test.ts`)**:
   - Lines 641-654: `themeTokens = { bgPrimary: '#0a0b0e', borderSharp: '0px', colorCrimson: '#ef4444', colorAmber: '#f59e0b', colorPhosphor: '#10b981', fontMono: '...' }`.
   - Lines 656-666: Worker states: `'Working' | 'Relaxed/Idle' | 'Under Inspection' | 'Error'`.
   - Lines 668-678: Fatigue calculations: `fatigue = Math.round((used / quota) * 100)`.
   - Lines 688-700: Kanban taskboard aggregates per-task and overall mission progress bars.
   - Lines 765-794: Multi-monitor scaling supports 1..X displays, pop-out routes (`/?panel=cubicles`, `/?panel=console`, `/?panel=taskboard`), and real-time synchronization via `BroadcastChannel('panopticon_swarm_sync')`.

6. **Peer Agent Allocations**:
   - `explorer_m3_2`: Twin Sauron Canvas 2D raycasting spotlight engine, Prompt Attachment System (`<input type="file" multiple>`, `webkitdirectory`, drag-drop), Rich Multimodal Media Renderer (`/api/media/...`), and Interactive Multiple-Choice Question Widget.
   - `explorer_m3_3`: Corner Consular Avatars (Lux-inspired Nia & Lucian-inspired Ferric) & 12-scenario animation suite with interlocked-fingers wrestling clash in prompt corner.

---

## 2. Logic Chain

1. **Zero-Build Vanilla SPA Architecture**:
   - The application is packaged into a standalone Windows binary `SymlinkedAgentSwarm.exe` via esbuild/pkg. Adding complex frontend bundlers (e.g. Vite/Webpack/React) introduces compile-time friction and runtime bloat.
   - By structuring the UI as modern, clean ES2022 JavaScript modules (`type="module"`) with native Web Components and modular vanilla controller objects, the frontend serves directly from `src/public/` with zero transpilation overhead, instant hot-reload, and tiny binary footprint.

2. **Strict Industrial Cyberpunk Brutalist Aesthetics**:
   - In accordance with R4 and TC-T1-UI-01, all container elements enforce `border-radius: 0px` and sharp `1px` high-contrast HUD borders.
   - Obsidian primary background `#0a0b0e`, panel background `#111318`, card background `#161922`.
   - Monospace typography throughout: `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.
   - Scanline HUD overlay using CSS repeating linear gradients + subtle CRT vignette layer that toggles via UI header switch.

3. **Left Section Structure & Visual Dynamics**:
   - A 4x4 CSS Grid (`grid-template-columns: repeat(4, 1fr)`) renders the 16 cubicle slots.
   - Each cubicle card dynamically reflects:
     - Worker State animations:
       - `working`: Amber/crimson border pulse + CSS/Canvas orbiting drones (`.subswarm-drone-orbit`) when `active_subswarm_id` or `subswarm_active` is true.
       - `idle`: Calm phosphor green breathing border glow.
       - `under_inspection`: High-visibility flashing amber reticle border locked onto by Twin Sauron spotlights.
       - `error`: High-contrast red flashing strobe + flatline audio-visual warning.
       - `vacant`: Wireframe slot with "+ CONFIGURE" hot-swap modal trigger.
     - Fatigue Meter (0%–100%): Reverse of stamina percentage (`100 - stamina`). Visual stamina bar colored green (>60%), amber (20-59%), crimson (<20%).
     - Surface Thoughts Stream: Live monospace marquee / ticker showing agent's active internal monologue.
     - Port Sandbox Preview: Port badge `PORT 4101`..`4116` with click-to-preview button opening an inline slide-out drawer iframe loading `http://localhost:<port>`.
     - Visual Animated Dependency Lines: An SVG overlay (`#contracts-dependency-svg`) positioned over the 4x4 grid. When contracts in `.swarm/contracts/` indicate inter-cubicle collaboration (e.g. provider cubicle X, consumer cubicle Y), SVG bezier curve curves between cell centroids with glowing flowing dashes.

4. **Center Section Navigation & Dual-Consul Terminal**:
   - Header with Dual-Consul statuses (`Consul Nia Nova` [Lux-inspired] & `Consul Ferric Lunaux` [Lucian-inspired]), Gate 1 and Gate 2 status chips.
   - Center Tab Navigation:
     - **Tab 1: Overseer Chat Console**: Inter-Consul live dialogue transcript (alternating dialogue balloons with Nia's rebellious aesthetic and Ferric's disciplined persona), User prompt input area, Prompt Attachment dock (provided by m3-2), and Corner Consular Avatars box `#consular-avatars-box` (provided by m3-3).
     - **Tab 2: Swarm Radar**:
       - *Live File-Lock Radar*: Visual table/map of active locks in `.swarm/locks/` with cubicle owner, acquired timestamp, and force-release button.
       - *Gladiator Tournament Split View*: Side-by-side branch diff viewer comparing competing worktrees, displaying Nia's artistic critique vs Ferric's reliability evaluation.
       - *Git Time-Machine Timeline*: Chronological list of snapshot checkpoints in `.swarm/checkpoints/` with 1-click rollback (`POST /api/swarm/checkpoints/:id/rollback`).
       - *Night-Shift / AFK Mode*: Toggle switch for AFK mode, token budget cap slider, and latest morning Briefing Digest viewer.
     - **Tab 3: Learned Memory & Skills/MCP Vault**: Live view of `.swarm/memory/preferences.json`, `.agents/rules/USER_PREFERENCES.md`, generated skills (`.agents/skills/`), and registered MCP servers (`.agents/mcp/`) with interactive tool testing interface.

5. **Right Section Kanban Taskboard & Mid-Work Consular Intervention**:
   - 4 Kanban columns: `To Do` (`tasks/todo/`), `In Progress` (`tasks/in_progress/`), `Review` (`tasks/review/`), `Done` (`tasks/done/`).
   - Top Header: Overall Swarm Mission Progress Bar (`percentage = round(done / total * 100)`).
   - Per-Task Cards: Task ID, priority, assigned cubicle badge, Courier origin badge (`[OPENCLAW]`, `[HERMES]`, `[GPT DOT]`, `[USER]`), progress bar (0%-100%), and git diff summary preview (+ins, -del).
   - Mid-Work Consular Intervention Panel:
     - Controls exposed on active `in_progress/` tasks and via Consular Decree:
       1. `amend_in_progress_prompt`: Edit prompt and instructions mid-flight.
       2. `evict_and_replace_worker`: Evict slow/stalled cubicle and assign task to another cubicle.
       3. `split_in_progress_task`: Subdivide a slow task into 2+ child tasks across multiple cubicles.
       4. `rebalance_workboard`: Re-order or re-assign tasks.
       5. `trigger_nia_impatience`: Manual velocity trigger for Nia's impatience protocol.
     - Mandatory 2/2 Consular Consensus Gate: Any mid-work intervention prompts a Consular consensus modal displaying Nia and Ferric's votes before atomic execution.

6. **Multi-Monitor Scaling & Detachable Pop-Out Engine**:
   - URL Route Switcher:
     - Inspection of `window.location.search`:
       - `?panel=cubicles` -> Add class `panel-cubicles` to `<body>`, hide Center and Right sections, full-screen Left 4x4 grid.
       - `?panel=console` -> Add class `panel-console` to `<body>`, hide Left and Right sections, full-screen Center terminal & radar/vault.
       - `?panel=taskboard` -> Add class `panel-taskboard` to `<body>`, hide Left and Center sections, full-screen Right Kanban board.
       - `?panel=all` or default -> Render all 3 sections proportionally.
   - Pop-Out Launch Buttons: Each section header features a `[ ↗ DETACH ]` button that calls `window.open('/?panel=<name>', 'Panopticon_<name>', 'width=1280,height=900')`.
   - Multi-Monitor Proportional Layout Presets:
     - Header dropdown allows selecting `1 Monitor` (compact 3-column), `2 Monitors` (50/50 span), `3 Monitors` (33/33/33 wide), or `Auto Proportional`.
   - Dual-Bus Synchronization Architecture:
     - **Bus 1: WebSocket (`/events`)**: Receives all server-side state mutations (`CUBICLE_UPDATED`, `TASK_CREATED`, `TASK_CLAIMED`, `TASK_SUBMITTED_REVIEW`, `TASK_COMPLETED`, `TASK_VETOED`, `CONSULAR_DIALOGUE`, `SAURON_SPOTLIGHT_TARGET`, `CONSULAR_AVATAR_STATE`, `FILE_LOCK_ACQUIRED`, `FILE_LOCK_RELEASED`, `CHECKPOINT_CREATED`, `AFK_MODE_CHANGED`).
     - **Bus 2: Browser `BroadcastChannel('panopticon_swarm_sync')`**:
       - Enables peer-to-peer inter-window synchronization across tabs/pop-outs.
       - Synchronizes UI tab selections, manual spotlight targets, draft messages, and window lifecycles.
       - Supports `REQUEST_STATE_SNAPSHOT` on window startup: when a pop-out panel opens, it broadcasts `REQUEST_STATE_SNAPSHOT`; the master window replies with `STATE_SNAPSHOT_REPLY` containing cached cubicles, tasks, dialogue, and radar data for instant zero-latency initialization.

---

## 3. Concrete Implementation Blueprint

### 3.1 Server Static Serving & Route Mounting (`src/server/index.ts`)
To serve the Panopticon SPA, static assets, and avatar texture sheets, `src/server/index.ts` must be updated with the following middleware:

```typescript
// Insert after express.json() and CORS headers:
const publicDir = path.join(repoRoot, 'src', 'public');
const assetsDir = path.join(publicDir, 'assets');

// Serve static assets (CSS, JS, textures, avatar sheets)
app.use('/assets', express.static(assetsDir));
app.use(express.static(publicDir));

// SPA Fallback for detachable panel routes (/?panel=cubicles, etc.)
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
```

### 3.2 Mid-Work Consular Intervention API Endpoints (`src/server/routes/governance-routes.ts`)
The server's `governance-routes.ts` will be extended to back the UI's Mid-Work Intervention controls:

```typescript
// POST /api/governance/intervention/amend
// Amend prompt of an in-progress task
router.post('/governance/intervention/amend', async (req: Request, res: Response) => {
  try {
    const { taskId, amendedPrompt, votes } = req.body;
    const result = await consularEngine.amendTaskPrompt(taskId, amendedPrompt, votes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/governance/intervention/evict
// Evict slow worker and assign to faster cubicle
router.post('/governance/intervention/evict', async (req: Request, res: Response) => {
  try {
    const { fromCubicleId, toCubicleId, reason, votes } = req.body;
    const result = await consularEngine.evictAndReplaceWorker(fromCubicleId, toCubicleId, reason, votes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/governance/intervention/split
// Split slow task across multiple cubicles
router.post('/governance/intervention/split', async (req: Request, res: Response) => {
  try {
    const { taskId, splits, votes } = req.body;
    const result = await consularEngine.splitTask(taskId, splits, votes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/governance/intervention/rebalance
// Rebalance active taskboard
router.post('/governance/intervention/rebalance', async (req: Request, res: Response) => {
  try {
    const { rebalancePlan, votes } = req.body;
    const result = await consularEngine.rebalanceTaskboard(rebalancePlan, votes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

---

### 3.3 File-by-File Frontend Architecture (`src/public/`)

```
src/public/
├── index.html                   # Master Panopticon SPA
├── css/
│   ├── brutalist-theme.css      # Brutalist cyberpunk design tokens & scanlines
│   ├── panopticon-grid.css      # 4x4 animated cubicle grid, fatigue & drone styling
│   ├── multi-monitor.css        # Proportional 1..X monitor layout & pop-out modes
│   ├── twin-sauron.css          # Twin Eyes of Sauron canvas overlay (m3-2 mount)
│   └── consular-avatars.css     # Corner avatars & 12-scenario animations (m3-3 mount)
├── js/
│   ├── app.js                   # Client bootstrap, routing & dual-bus synchronizer
│   ├── cubicle-grid.js          # 4x4 grid renderer, fatigue bars, port drawer, contracts
│   ├── overseer-console.js      # Dual-Consul terminal, dialogue stream, radar tabs
│   ├── taskboard-view.js        # Kanban taskboard, mission progress, mid-work interventions
│   ├── vault-view.js            # Learned preferences & skills/MCP catalog
│   ├── twin-sauron-canvas.js    # Spotlight canvas raycaster (m3-2 mount)
│   └── consular-avatars.js      # Corner avatars & wrestling engine (m3-3 mount)
└── assets/
    └── avatars/                 # Texture sheets for avatars & wrestling clash
        ├── consul_nia_nova_sheet.jpg
        ├── consul_ferric_lunaux_sheet.jpg
        └── consuls_wrestling_clash.jpg
```

---

### 3.4 Component Specifications & DOM Architecture

#### A. Master HTML (`src/public/index.html`)
The master document contains:
1. **Top HUD Bar (`#panopticon-hud-header`)**:
   - System title: `SYMLINKED AGENT SWARM // PANOPTICON SURVEILLANCE MATRIX v1.0.0`
   - Active WebSocket heartbeat beacon (`#ws-status-beacon`)
   - Dual Consuls quick status indicator (`Consul Nia Nova` & `Consul Ferric Lunaux`)
   - Proportional Monitor layout selector (`#monitor-layout-select`: 1 Monitor, 2 Monitors, 3 Monitors, Spanned)
   - Scanline HUD toggle switch (`#toggle-scanlines-btn`)
   - Global Self-Update Status indicator (`#self-update-hud-badge`)
2. **Main 3-Section Container (`#panopticon-main-container`)**:
   - **Section 1: Left Grid Section (`#section-cubicles`)**:
     - Header: Title `[ 4x4 WORKER CUBICLE ROSTER ]`, pop-out button `[ ↗ DETACH ]`
     - Twin Sauron Canvas mount: `<canvas id="twin-sauron-canvas"></canvas>` (explorer_m3_2)
     - Contracts Dependency SVG layer: `<svg id="contracts-dependency-svg"></svg>`
     - 4x4 Grid Container: `<div id="cubicle-grid" class="cubicle-4x4-grid"></div>`
     - Isolated Port Sandbox Drawer: `<aside id="port-sandbox-drawer" class="sandbox-drawer hidden"><iframe id="sandbox-iframe"></iframe></aside>`
   - **Section 2: Center Section (`#section-console`)**:
     - Header: Title `[ DUAL-CONSUL COMMAND & SWARM RADAR ]`, pop-out button `[ ↗ DETACH ]`
     - Navigation Tabs:
       - `[1] OVERSEER CONSOLE` (`#tab-btn-console`)
       - `[2] SWARM RADAR` (`#tab-btn-radar`)
       - `[3] VAULT (PREFERENCES & MCP)` (`#tab-btn-vault`)
     - Tab View 1: `#view-console`:
       - Gate 1 & Gate 2 Consensus Status Bar
       - Inter-Consul Live Dialogue Feed: `<div id="consular-dialogue-feed"></div>`
       - Incident Alert Drawer: `<div id="incident-alert-ticker"></div>`
       - Chat Prompt Dock:
         - Prompt Attachment Chips area (explorer_m3_2 mount: `#prompt-attachments-dock`)
         - Prompt Input: `<textarea id="overseer-prompt-input" placeholder="Issue Consular decree or command..."></textarea>`
         - Corner Consular Avatars box (explorer_m3_3 mount: `<div id="consular-avatars-box"></div>`)
         - Prompt Action Buttons: Attach File, Attach Folder, Submit Decree
     - Tab View 2: `#view-radar`:
       - Radar Sub-Tabs: `File-Lock Radar`, `Gladiator Split-View`, `Time-Machine Timeline`, `Night-Shift AFK`
       - File-Lock Radar: Live active locks table, acquire lock form, release lock controls
       - Gladiator Split-View: Branch A vs Branch B diff viewer + Nia & Ferric critique panels
       - Time-Machine Timeline: Checkpoint cards with commit hash, task counts, 1-click Rollback button
       - Night-Shift AFK: AFK toggle, token cap slider, Morning Consular Briefing Digest
     - Tab View 3: `#view-vault`:
       - Preferences Catalog (`.swarm/memory/preferences.json`)
       - Generated Skills (`.agents/skills/`)
       - Generated MCP Servers (`.agents/mcp/`) with Test Tool modal
   - **Section 3: Right Taskboard Section (`#section-taskboard`)**:
     - Header: Title `[ SHARED SWARM TASKBOARD ]`, pop-out button `[ ↗ DETACH ]`
     - Mission Progress Bar Container:
       - Label: `OVERALL SWARM MISSION PROGRESS: <percentage>%`
       - Meter: `<div class="mission-progress-bar"><div id="mission-progress-fill" style="width: 0%"></div></div>`
       - Counters: `<span id="counter-todo">0</span> | <span id="counter-prog">0</span> | <span id="counter-review">0</span> | <span id="counter-done">0</span>`
     - 4-Column Kanban Board (`#kanban-board`):
       - Column `todo`: `<div id="col-todo" class="kanban-col"><h3>TO DO</h3><div class="task-list"></div></div>`
       - Column `in_progress`: `<div id="col-in_progress" class="kanban-col"><h3>IN PROGRESS</h3><div class="task-list"></div></div>`
       - Column `review`: `<div id="col-review" class="kanban-col"><h3>CONSULAR REVIEW</h3><div class="task-list"></div></div>`
       - Column `done`: `<div id="col-done" class="kanban-col"><h3>DONE</h3><div class="task-list"></div></div>`
     - Mid-Work Consular Intervention Drawer (`#mid-work-intervention-drawer`):
       - Controls: Amend Prompt, Evict & Replace Worker, Split Task, Rebalance Workboard, Trigger Impatience
       - Consular Gate approval dialogue before commit
3. **Modals & Overlays Mount Points**:
   - Multimodal Media Lightbox modal (explorer_m3_2 mount: `#media-lightbox-modal`)
   - Interactive Multiple-Choice Question modal (explorer_m3_2 mount: `#consular-qa-modal`)
   - Cubicle Configuration modal (`#cubicle-config-modal`)

---

#### B. CSS Design Tokens & Brutalist Theme (`src/public/css/brutalist-theme.css`)
```css
:root {
  /* Colors */
  --bg-primary: #0a0b0e;
  --bg-secondary: #111318;
  --bg-card: #161922;
  --bg-elevated: #1f2430;
  
  --border-sharp: 0px;
  --border-color: #272d3d;
  --border-active: #3b455c;
  
  --color-crimson: #ef4444;
  --color-crimson-glow: rgba(239, 68, 68, 0.35);
  --color-amber: #f59e0b;
  --color-amber-glow: rgba(245, 158, 11, 0.35);
  --color-phosphor: #10b981;
  --color-phosphor-glow: rgba(16, 185, 129, 0.35);
  --color-cyan: #06b6d4;
  --color-text-dim: #94a3b8;
  --color-text-bright: #f8fafc;
  
  /* Monospace Typography */
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Brutalist Sharp Borders & Obsidian Surfaces */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border-radius: var(--border-sharp) !important;
}

body {
  background-color: var(--bg-primary);
  color: var(--color-text-bright);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

/* Scanline HUD Overlay */
.scanlines-overlay {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  pointer-events: none;
  z-index: 9999;
  background: linear-gradient(
    rgba(18, 16, 16, 0) 50%, 
    rgba(0, 0, 0, 0.25) 50%
  ), linear-gradient(
    90deg,
    rgba(255, 0, 0, 0.03),
    rgba(0, 255, 0, 0.01),
    rgba(0, 0, 255, 0.03)
  );
  background-size: 100% 3px, 6px 100%;
  opacity: 0.85;
}
```

---

#### C. 4x4 Cubicle Grid Styling & State Animations (`src/public/css/panopticon-grid.css`)
```css
/* 4x4 Spatial Matrix */
.cubicle-4x4-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 8px;
  height: calc(100vh - 120px);
  padding: 8px;
  position: relative;
}

.cubicle-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
  overflow: hidden;
}

/* Worker States */
.cubicle-card.state-working {
  border-color: var(--color-amber);
  box-shadow: 0 0 10px var(--color-amber-glow);
  animation: pulse-working 2s infinite ease-in-out;
}

.cubicle-card.state-idle {
  border-color: var(--color-phosphor);
  box-shadow: 0 0 6px var(--color-phosphor-glow);
}

.cubicle-card.state-under_inspection {
  border-color: var(--color-crimson);
  box-shadow: 0 0 15px var(--color-crimson-glow);
  animation: flash-reticle 1s infinite alternate;
}

.cubicle-card.state-error {
  border-color: #ff0033;
  background: rgba(255, 0, 51, 0.08);
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.6);
  animation: flash-alarm 0.5s infinite alternate;
}

.cubicle-card.state-vacant {
  border-style: dashed;
  opacity: 0.45;
}

/* Orbiting Sub-Swarm Drones */
.orbit-drone-container {
  position: absolute;
  top: 10px; right: 10px;
  width: 28px; height: 28px;
}
.orbiting-drone {
  position: absolute;
  width: 5px; height: 5px;
  background: var(--color-amber);
  box-shadow: 0 0 4px var(--color-amber);
  animation: drone-orbit 2.4s linear infinite;
}
@keyframes drone-orbit {
  0% { transform: rotate(0deg) translateX(12px) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(12px) rotate(-360deg); }
}

/* Fatigue / Stamina Meter */
.fatigue-meter-container {
  width: 100%;
  height: 6px;
  background: #11141c;
  border: 1px solid #272d3d;
  margin: 4px 0;
}
.fatigue-meter-fill {
  height: 100%;
  transition: width 0.3s ease;
}
.fatigue-meter-fill.tier-energized { background: var(--color-phosphor); }
.fatigue-meter-fill.tier-fatigued { background: var(--color-amber); }
.fatigue-meter-fill.tier-critical { background: var(--color-crimson); }
.fatigue-meter-fill.tier-exhausted { background: #550000; animation: flash-exhausted 1s infinite; }

/* Surface Thoughts Stream Ticker */
.surface-thoughts-ticker {
  font-size: 11px;
  color: var(--color-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #0d0f14;
  padding: 2px 4px;
  border-left: 2px solid var(--color-cyan);
}
```

---

#### D. Multi-Monitor Scaling & Detachable Panel CSS (`src/public/css/multi-monitor.css`)
```css
/* Master Grid Layout (Default 3-Column Panopticon) */
#panopticon-main-container {
  display: grid;
  grid-template-columns: var(--col-left-width, 32%) var(--col-center-width, 38%) var(--col-right-width, 30%);
  height: calc(100vh - 40px);
  width: 100vw;
  border-top: 1px solid var(--border-color);
}

.panopticon-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow: hidden;
}
.panopticon-section:last-child {
  border-right: none;
}

/* Proportional Layout Presets */
body[data-monitors="1"] #panopticon-main-container {
  --col-left-width: 32%;
  --col-center-width: 38%;
  --col-right-width: 30%;
}

body[data-monitors="2"] #panopticon-main-container {
  --col-left-width: 45%;
  --col-center-width: 55%;
  --col-right-width: 0%; /* When spanned or dual-screen tiled */
}

body[data-monitors="3"] #panopticon-main-container {
  --col-left-width: 33.333%;
  --col-center-width: 33.333%;
  --col-right-width: 33.333%;
}

/* Detachable Panel Pop-Out Modes (?panel=cubicles, ?panel=console, ?panel=taskboard) */
body.panel-cubicles #section-console,
body.panel-cubicles #section-taskboard {
  display: none !important;
}
body.panel-cubicles #section-cubicles {
  width: 100vw !important;
  border-right: none !important;
}
body.panel-cubicles #panopticon-main-container {
  grid-template-columns: 1fr !important;
}

body.panel-console #section-cubicles,
body.panel-console #section-taskboard {
  display: none !important;
}
body.panel-console #section-console {
  width: 100vw !important;
  border-right: none !important;
}
body.panel-console #panopticon-main-container {
  grid-template-columns: 1fr !important;
}

body.panel-taskboard #section-cubicles,
body.panel-taskboard #section-console {
  display: none !important;
}
body.panel-taskboard #section-taskboard {
  width: 100vw !important;
  border-right: none !important;
}
body.panel-taskboard #panopticon-main-container {
  grid-template-columns: 1fr !important;
}
```

---

#### E. Client Bootstrap & Dual-Bus Synchronization Engine (`src/public/js/app.js`)
```javascript
/**
 * src/public/js/app.js
 *
 * Master Panopticon Client Bootstrap & Dual-Bus Synchronization Engine.
 * Dual-Bus:
 * 1. Server WebSocket (ws://<host>:<port>/events) for backend mutations.
 * 2. Client BroadcastChannel('panopticon_swarm_sync') for sub-millisecond
 *    inter-window pop-out panel synchronization.
 */

import { initCubicleGrid, updateCubicleState, handleSauronTarget } from './cubicle-grid.js';
import { initOverseerConsole, appendDialogue, updateRadar } from './overseer-console.js';
import { initTaskboard, updateTasks, updateMissionProgress } from './taskboard-view.js';

export class PanopticonApp {
  constructor() {
    this.windowId = 'win_' + Math.random().toString(36).substring(2, 8);
    this.urlParams = new URLSearchParams(window.location.search);
    this.panelMode = this.urlParams.get('panel') || 'all';
    this.ws = null;
    this.broadcastChannel = null;
    this.isMasterWindow = this.panelMode === 'all';
  }

  async initialize() {
    this.applyPanelRoute();
    this.initHUDControls();
    this.setupBroadcastChannel();
    this.connectWebSocket();

    // Initialize UI subsystems
    await initCubicleGrid(this);
    await initOverseerConsole(this);
    await initTaskboard(this);

    // Initial state fetch
    await this.fetchInitialState();

    if (!this.isMasterWindow) {
      // Request instant state snapshot from master window via BroadcastChannel
      this.broadcastChannel.postMessage({
        channel: 'panopticon_swarm_sync',
        type: 'REQUEST_STATE_SNAPSHOT',
        senderWindowId: this.windowId,
        timestamp: Date.now()
      });
    }
  }

  applyPanelRoute() {
    if (this.panelMode !== 'all') {
      document.body.classList.add(`panel-${this.panelMode}`);
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
        document.getElementById('scanlines-overlay').classList.toggle('hidden');
      });
    }

    // Attach detach handlers
    document.querySelectorAll('[data-detach-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const panel = e.target.getAttribute('data-detach-panel');
        window.open(
          `/?panel=${panel}`,
          `PanopticonPanel_${panel}`,
          'width=1280,height=900,menubar=no,toolbar=no'
        );
      });
    });
  }

  setupBroadcastChannel() {
    this.broadcastChannel = new BroadcastChannel('panopticon_swarm_sync');
    this.broadcastChannel.onmessage = (event) => {
      const { type, payload, senderWindowId } = event.data;
      if (senderWindowId === this.windowId) return; // Ignore own messages

      if (type === 'REQUEST_STATE_SNAPSHOT' && this.isMasterWindow) {
        // Master window shares in-memory cache
        this.broadcastChannel.postMessage({
          channel: 'panopticon_swarm_sync',
          type: 'STATE_SNAPSHOT_REPLY',
          payload: {
            cubicles: window.__PANOPTICON_STATE?.cubicles,
            tasks: window.__PANOPTICON_STATE?.tasks,
            dialogue: window.__PANOPTICON_STATE?.dialogue
          },
          senderWindowId: this.windowId,
          timestamp: Date.now()
        });
      } else if (type === 'STATE_SNAPSHOT_REPLY') {
        if (payload.cubicles) payload.cubicles.forEach(c => updateCubicleState(c));
        if (payload.tasks) updateTasks(payload.tasks);
        if (payload.dialogue) payload.dialogue.forEach(d => appendDialogue(d));
      } else if (type === 'MONITOR_LAYOUT_CHANGED') {
        document.body.setAttribute('data-monitors', payload.monitors);
      } else if (type === 'CLIENT_UI_EVENT') {
        this.handleClientUiEvent(payload);
      }
    };
  }

  broadcastSync(type, payload) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        channel: 'panopticon_swarm_sync',
        type,
        payload,
        senderWindowId: this.windowId,
        timestamp: Date.now()
      });
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/events`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      const beacon = document.getElementById('ws-status-beacon');
      if (beacon) beacon.classList.add('online');
    };

    this.ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        this.handleServerEvent(data.type, data.payload);
      } catch (err) {
        console.error('[Panopticon] Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onclose = () => {
      const beacon = document.getElementById('ws-status-beacon');
      if (beacon) beacon.classList.remove('online');
      setTimeout(() => this.connectWebSocket(), 2000); // Reconnect loop
    };
  }

  handleServerEvent(type, payload) {
    switch (type) {
      case 'CUBICLE_UPDATED':
        updateCubicleState(payload.cubicle, payload.reason);
        break;
      case 'TASK_CREATED':
      case 'TASK_CLAIMED':
      case 'TASK_SUBMITTED_REVIEW':
      case 'TASK_COMPLETED':
      case 'TASK_VETOED':
        this.refreshTasks();
        break;
      case 'CONSULAR_DIALOGUE':
        appendDialogue(payload);
        break;
      case 'SAURON_SPOTLIGHT_TARGET':
        handleSauronTarget(payload);
        break;
      case 'CONSULAR_AVATAR_STATE':
        window.dispatchEvent(new CustomEvent('consular-avatar-update', { detail: payload }));
        break;
      case 'FILE_LOCK_ACQUIRED':
      case 'FILE_LOCK_RELEASED':
      case 'CHECKPOINT_CREATED':
      case 'AFK_MODE_CHANGED':
        updateRadar(type, payload);
        break;
    }
  }

  async fetchInitialState() {
    try {
      const [cubiclesRes, tasksRes, dialogueRes] = await Promise.all([
        fetch('/api/cubicles').then(r => r.json()),
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/governance/dialogue?limit=50').then(r => r.json())
      ]);

      window.__PANOPTICON_STATE = {
        cubicles: cubiclesRes.cubicles,
        tasks: tasksRes.tasks,
        dialogue: dialogueRes.dialogue
      };

      cubiclesRes.cubicles.forEach(c => updateCubicleState(c));
      updateTasks(tasksRes.tasks);
      updateMissionProgress(tasksRes.progress);
      dialogueRes.dialogue.forEach(d => appendDialogue(d));
    } catch (err) {
      console.error('[Panopticon] Failed to fetch initial state:', err);
    }
  }

  async refreshTasks() {
    try {
      const tasksRes = await fetch('/api/tasks').then(r => r.json());
      updateTasks(tasksRes.tasks);
      updateMissionProgress(tasksRes.progress);
    } catch (err) {
      console.error('[Panopticon] Failed to refresh tasks:', err);
    }
  }
}

// Auto-bootstrap when loaded in browser
window.addEventListener('DOMContentLoaded', () => {
  const app = new PanopticonApp();
  app.initialize();
  window.__PANOPTICON_APP = app;
});
```

---

#### F. 4x4 Grid Renderer & Visual Contracts Layer (`src/public/js/cubicle-grid.js`)
Responsible for:
1. Generating the 16 cubicle DOM elements (`cubicle-01` .. `cubicle-16`).
2. Updating worker states (`state-working`, `state-idle`, `state-under_inspection`, `state-error`, `state-vacant`).
3. Orbiting drone DOM injection when `active_subswarm_id` or `subswarm_active` is true.
4. Calculating fatigue meters (`fatigue = 100 - stamina`) and applying tier color classes (`tier-energized`, `tier-fatigued`, `tier-critical`, `tier-exhausted`).
5. Live surface thoughts stream typewriter / marquee ticker.
6. Isolated port sandbox button (`PORT 4101..4116`) that toggles the slide-out iframe drawer pointing to `http://localhost:<port>`.
7. Inter-Cubicle Shared Contracts visual dependency lines:
   - Fetches `GET /api/swarm/contracts`.
   - Maps each contract's `providerCubicle` to collaborating cubicles.
   - Computes centroid coordinates of provider and consumer cubicles on the 4x4 grid.
   - Draws SVG bezier curve connectors on `#contracts-dependency-svg` with animated SVG dash arrays (`stroke-dasharray`, `stroke-dashoffset` keyframe animation).

---

#### G. Center Section Overseer Console & Swarm Radar (`src/public/js/overseer-console.js`)
Responsible for:
1. Tab management: `OVERSEER CONSOLE`, `SWARM RADAR`, `VAULT`.
2. Inter-Consul Dialogue Stream:
   - Live message rendering: Nia messages (Lux blonde styling, defiant cyan/amber HUD theme) and Ferric messages (Lucian locs/coat styling, disciplined crimson/steel HUD theme).
   - Gate 1 Pre-Dispatch consensus badge (2/2 approved vs negotiating) and Gate 2 Final Push consensus badge.
3. Chat Prompt & Execution Dispatcher:
   - Submits user prompts to `POST /api/governance/plan/deliberate` or `/api/preferences/extract`.
   - Receives attached files/folders from explorer_m3_2's prompt attachment dock.
   - Bridges to explorer_m3_3's Corner Consular Avatar box (`#consular-avatars-box`).
4. Swarm Radar Sub-Views:
   - **File-Lock Radar**: Fetches `/api/swarm/locks`, displays active file locks with paths and cubicle owners, allows manual lock release.
   - **Gladiator Comparison Split View**: Displays side-by-side branch comparison diffs and Consular critiques (`niaCritique` on taste/aesthetics vs `ferricCritique` on stability/bugs).
   - **Time-Machine Timeline**: Fetches `/api/swarm/checkpoints`, renders interactive timeline of Git checkpoints with commit hashes, and invokes `POST /api/swarm/checkpoints/:id/rollback`.
   - **Night-Shift AFK Mode**: Toggle for `/api/swarm/afk`, token cap slider, and viewer for `/api/swarm/afk/digest`.

---

#### H. Right Section Kanban Taskboard & Mid-Work Consular Intervention (`src/public/js/taskboard-view.js`)
Responsible for:
1. 4-column Kanban layout: `To Do`, `In Progress`, `Review`, `Done`.
2. Overall Mission Progress bar:
   - Computes aggregated percentage from `tasks.done.length / totalTasks * 100`.
   - Animates `#mission-progress-fill` width.
3. Per-Task Card Renderer:
   - Card header: Task ID, priority tag (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
   - Assigned cubicle chip (`[CUBICLE-01: GEMINI 4 ARGON]`).
   - Courier Origin Badge: High-visibility brutalist chips for external agents:
     - `[OPENCLAW]` (amber)
     - `[HERMES]` (cyan)
     - `[GPT DOT]` (phosphor green)
     - `[USER / CONSOLE]` (obsidian)
   - Task Progress Bar: Approximate completion percentage (`task.progress_percent` 0%-100%).
   - Git Diff preview (+insertions, -deletions).
   - Consular Review vote badges (`Nia: APPROVE/VETO`, `Ferric: APPROVE/VETO`).
4. Mid-Work Consular Intervention Controls:
   - Appended to each card in `in_progress/` and in an executive panel:
     - `[ AMEND PROMPT ]`: Opens modal to update task description via `POST /api/governance/intervention/amend`.
     - `[ EVICT WORKER ]`: Replaces stalled cubicle via `POST /api/governance/intervention/evict`.
     - `[ SPLIT TASK ]`: Splits task across multiple cubicles via `POST /api/governance/intervention/split`.
     - `[ REBALANCE ]`: Re-orders task priorities via `POST /api/governance/intervention/rebalance`.
     - `[ STIMULATE (NIA IMPATIENCE) ]`: Velocity check trigger initiating visible Consular intervention dialogue.
   - 2/2 Consular Consensus Confirmation Dialog: All mid-work interventions display both Consuls' votes before applying.

---

#### I. Learned Preferences & Skills/MCP Vault View (`src/public/js/vault-view.js`)
Responsible for:
1. Fetching `/api/vault` (`{ preferences, skills, mcpServers }`).
2. Preferences Catalog: Lists all entries in `.swarm/memory/preferences.json`, category tags, and direct rule editor.
3. Skills Catalog: Lists generated skills in `.agents/skills/` with markdown `SKILL.md` viewer.
4. MCP Server Catalog: Lists registered tools in `.agents/mcp/` and provides an interactive parameter input modal calling `POST /api/mcp/test-tool`.

---

## 4. Caveats & Assumptions

1. **No External CDN Dependencies**:
   - The UI runs completely offline in air-gapped or standalone Windows executable environments (`SymlinkedAgentSwarm.exe`). All CSS and JS must be self-contained; no Google Fonts, Tailwind CDN, or external script tags are permitted.
2. **Dual-Bus Cross-Origin Isolation**:
   - `BroadcastChannel` requires all windows (main and detached panels) to share the same browser origin (`http://localhost:<port>`). Detached windows opened via `window.open('/?panel=...')` share this origin, ensuring instant sub-millisecond event sharing.
3. **Twin Sauron & Consular Avatars Component Isolation**:
   - `explorer_m3_2` owns the internal raycasting math and canvas drawing inside `#twin-sauron-canvas`.
   - `explorer_m3_3` owns the internal sprite/keyframe state machine inside `#consular-avatars-box`.
   - This blueprint provides the exact DOM container mount points, dimensions, CSS z-indices, and event bus contracts for seamless composition.
4. **Port Sandbox Security**:
   - Cubicle sandboxes run at `http://localhost:4101` .. `4116`. Browsers will permit iframe embedding of `localhost` ports from `localhost:3820` without CORS/X-Frame-Options friction provided workers do not send `X-Frame-Options: DENY`.

---

## 5. Conclusion

The technical architecture for Milestone 3 provides a comprehensive, production-ready, zero-build Brutalist Dystopian Cyberpunk Panopticon UI system:
1. **Three-Section Layout**: Sharp 0px borders, obsidian/crimson/amber/phosphor HUD palette, monospace typography, and scanlines overlay.
2. **Left Section**: 4x4 animated cubicle grid, worker states with orbiting sub-swarm drones, fatigue meters, surface thoughts stream, isolated port sandbox drawers (`4101`–`4116`), and visual animated dependency lines (`.swarm/contracts/`).
3. **Center Section**: Dual-Consul Overseer Chat Terminal with live visible dialogue feed between Consul Nia Nova and Consul Ferric Lunaux, Swarm Radar tabs (Live File-Lock Radar, Gladiator comparison split view, Time-Machine Timeline, AFK Mode toggle with Consular Digest), and Learned Memory/Skills/MCP Vault Tab (`GET /api/vault`).
4. **Right Section**: Kanban Taskboard (`To Do`, `In Progress`, `Review`, `Done`), per-task progress bars, overall Swarm Mission progress bar, Courier origin badges (`OpenClaw`, `Hermes`, `GPT Dot`), and Mid-Work Consular Intervention controls (amend prompt, evict worker, split task, rebalance).
5. **Multi-Monitor Engine**: Proportional 1..X scaling presets, detachable pop-out routes (`?panel=cubicles`, `?panel=console`, `?panel=taskboard`), and real-time dual-bus synchronization combining server WebSocket (`/events`) and client `BroadcastChannel('panopticon_swarm_sync')`.
6. **Express Static Serving**: Serves `src/public/` and `src/public/assets/` (`public/assets/avatars/`) with SPA route fallback.

---

## 6. Verification Method

### 6.1 Automated Test Verification
Run the existing test suites to confirm zero regressions:
```powershell
npm test
npm run test:unit
npm run test:e2e
```

### 6.2 Frontend DOM & Layout Verification
1. **HTTP Endpoint Verification**:
   - `GET /` -> Returns status 200 and loads `src/public/index.html`.
   - `GET /assets/avatars/consul_nia_nova_sheet.jpg` -> Returns 200 or proper asset response.
   - `GET /api/health` -> Returns status 200 `{ status: "ok" }`.
   - `GET /api/cubicles` -> Returns 16 cubicle objects with ports 4101–4116.
   - `GET /api/tasks` -> Returns tasks and overall progress object.
   - `GET /api/vault` -> Returns vault catalog.
2. **Panel Detach Routing**:
   - `GET /?panel=cubicles` -> HTML body contains class `panel-cubicles`, hiding Center and Right sections and rendering Left Section at 100vw.
   - `GET /?panel=console` -> HTML body contains class `panel-console`, hiding Left and Right sections and rendering Center Section at 100vw.
   - `GET /?panel=taskboard` -> HTML body contains class `panel-taskboard`, hiding Left and Center sections and rendering Right Section at 100vw.
3. **Dual-Bus BroadcastChannel Test**:
   - In browser console or automated test:
     ```javascript
     const bc = new BroadcastChannel('panopticon_swarm_sync');
     bc.postMessage({ channel: 'panopticon_swarm_sync', type: 'TEST_SYNC', payload: { ok: true } });
     ```
   - Confirms sub-millisecond event dispatch across all open windows.
4. **Mid-Work Consular Intervention Verification**:
   - Invoke `POST /api/governance/intervention/amend` and verify 2/2 Consular consensus gating and atomic prompt update.

---
*Report certified by `explorer_m3_1` for Milestone 3 implementation handoff.*
