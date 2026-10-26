# Technical Design & UI/UX Architecture Survey: Panopticon Brutalist Cyberpunk UI & Multi-Monitor Engine

**Document ID:** `SWARM-SURVEY-UI-002`  
**Author:** Explorer Survey 2  
**Date:** 2026-10-26T00:18:00Z  
**Target Project:** Symlinked Agent Swarm (`SymlinkedAgentSwarm.exe`)  
**Scope:** Brutalist Dystopian Cyberpunk Aesthetic, 3-Section Layout, 4x4 Animated Cubicle Grid with Eye of Sauron Spotlight, Overseer Console & Memory Vault, Shared Taskboard, Multi-Monitor Proportional Scaling, and Real-time Detached Window Engine.

---

## 1. Executive Summary & Architectural Vision

The **Symlinked Agent Swarm** requires an authoritative, high-immersion **Brutalist Dystopian Cyberpunk "Panopticon"** user interface. Inspired by Jeremy Bentham's architectural panopticon, industrial brutalist concrete monoliths, and cold surveillance telemetry, the interface visualizes 16 autonomous AI worker cubicles monitored by a menacing, hovering "Eye of Sauron" Overseer.

```
+======================================================================================================+
| [PANOPTICON OVERSEER HUD v4.0]     MISSION PROGRESS: [=======================.....] 78.4%   [MONITORS: 3] |
+======================================================================================================+
| [LEFT: THE PANOPTICON GRID]       | [CENTER: OVERSEER CONSOLE & VAULT]    | [RIGHT: SHARED TASKBOARD]        |
|                                   |                                       |                                  |
|         ( ( ( [O] ) ) )           | OVERSEER COMMAND TERMINAL             | [MISSION PROGRESS: 78.4%]        |
|        /      |      \            | > "Overseer active. 3 cubicles hot."  |                                  |
|       /  RED SPOTLIGHT \          | > "Sub-swarm #12 running on C-01."   | [TO DO]  [IN PROG] [REV]  [DONE] |
|      /        |         \         |                                       | +-----+  +-----+   +---+   +----+ |
|  [C-01]    [C-02]    [C-03]  ...  | [TABS: TERMINAL | INCIDENTS | VAULT]  | | T-1 |  | T-2 |   |T-3|   |T-4 | |
|  Gemini    Gemini     GPT         |                                       | +-----+  +-----+   +---+   +----+ |
|  WORK      WORK       REST        | INCIDENT FEED:                        |                                  |
|  [||||..]  [|||||.]   [|||...]    | [WARN: C-03 Restricted Spawn Blocked] | GIT DIFF VIEWER DRAWER           |
|                                   |                                       | diff --git a/swarm/task.js ...   |
+======================================================================================================+
| REAL-TIME TELEMETRY BUS: WS://LOCALHOST:PORT/STREAM | BROADCAST-CHANNEL: PANOPTICON_SYNC | FPS: 60.0  |
+======================================================================================================+
```

### Core Design Pillars
1. **Totalitarian Surveillance Metaphor**: The Eye of Sauron physically hovers and projects a dynamic volumetric red spotlight onto cubicles, reacting dynamically to worker status, task dispatches, and incident alarms.
2. **Brutalist Cyberpunk Aesthetic**: High-contrast, pitch-black obsidian backgrounds (`#0a0a0c`), raw cold steel/concrete panels (`#181920`), razor-sharp borders (no rounded corners), and intense phosphor glows (crimson `#ff1a40`, phosphor green `#00ff66`, amber alert `#ffb822`, and telemetry cyan `#00e5ff`).
3. **Low-Latency Multi-Monitor & Detached Pop-Out Engine**: Proportional layout scaling across 1 to X physical monitors, paired with undockable browser windows (`?panel=cubicles`, `?panel=console`, `?panel=taskboard`) synchronized in real time via dual WebSocket and `BroadcastChannel` APIs.
4. **Zero-Dependency Lightweight Web Architecture**: Clean HTML5/CSS3/ES6 Modular JavaScript with Hardware-Accelerated Canvas 2D/SVG rendering. Fast load times (<100ms), zero framework hydration bloat, and lightweight embedding into a standalone single Windows `.exe`.

---

## 2. Visual Style Guide & Design Tokens

### 2.1 Color Palette & Token Definitions
All styles must be anchored in root CSS Custom Properties to allow instant global telemetry updates (e.g. flashing all border accents to red during a high-severity swarm breach).

```css
:root {
  /* Surfaces & Structural Monoliths */
  --bg-abyss: #070709;
  --bg-obsidian: #0e0f14;
  --bg-surface-concrete: #16171f;
  --bg-surface-elevated: #1f202b;
  --bg-surface-hover: #292b3a;

  /* Brutalist Borders & Dividers */
  --border-monolith: #2c2f3f;
  --border-active: #484d66;
  --border-radius-base: 0px; /* STRICT BRUTALISM: ZERO ROUNDED CORNERS */

  /* High-Contrast Surveillance Telemetry */
  --telemetry-crimson: #ff1a40;
  --telemetry-crimson-glow: rgba(255, 26, 64, 0.45);
  --telemetry-crimson-dim: rgba(255, 26, 64, 0.15);

  --telemetry-amber: #ffaa00;
  --telemetry-amber-glow: rgba(255, 170, 0, 0.4);

  --telemetry-phosphor: #00ff66;
  --telemetry-phosphor-glow: rgba(0, 255, 102, 0.35);

  --telemetry-cyan: #00e5ff;
  --telemetry-cyan-glow: rgba(0, 229, 255, 0.35);

  --telemetry-flatline: #800020;

  /* Typography Colors */
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #4e5366;
  --text-crimson: #ff4d6a;

  /* Font Families */
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
  --font-display: 'JetBrains Mono', monospace;
}
```

### 2.2 Scanlines, CRT Flicker, and Chamfered HUD Accents
To achieve the dystopian military terminal feel without degrading readability:
1. **CRT Scanline Overlay**: A full-viewport pseudo-element with subtle 4px horizontal banding:
   ```css
   .panopticon-hud::after {
     content: "";
     position: fixed;
     inset: 0;
     background: repeating-linear-gradient(
       0deg,
       rgba(0, 0, 0, 0) 0px,
       rgba(0, 0, 0, 0) 2px,
       rgba(0, 0, 0, 0.3) 2px,
       rgba(0, 0, 0, 0.3) 4px
     );
     pointer-events: none;
     z-index: 9999;
     opacity: 0.75;
   }
   ```
2. **Brutalist Chamfered Corner Utility**: Chamfered borders (45-degree angled cuts) for tactical telemetry panels using CSS `clip-path`:
   ```css
   .chamfer-card {
     clip-path: polygon(
       0 0,
       calc(100% - 10px) 0,
       100% 10px,
       100% 100%,
       10px 100%,
       0 calc(100% - 10px)
     );
     border: 1px solid var(--border-monolith);
   }
   ```
3. **CRT Screen Vignette & Phosphor Glow**:
   ```css
   .crt-vignette {
     box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.85), inset 0 0 20px var(--telemetry-crimson-dim);
   }
   ```

---

## 3. Left Section: 4x4 Cubicle Grid & Eye of Sauron Blueprint

### 3.1 4x4 Grid Architecture & Cell Addressing
The 16 cubicles are arranged in a 4x4 matrix with uniform addressing: `cubicle-01` to `cubicle-16`.

```
+------------+------------+------------+------------+
| CUBICLE-01 | CUBICLE-02 | CUBICLE-03 | CUBICLE-04 |
|  [Gemini]  |  [Gemini]  |   [GPT]    |  [VACANT]  |
+------------+------------+------------+------------+
| CUBICLE-05 | CUBICLE-06 | CUBICLE-07 | CUBICLE-08 |
|  [VACANT]  |  [VACANT]  |  [VACANT]  |  [VACANT]  |
+------------+------------+------------+------------+
| CUBICLE-09 | CUBICLE-10 | CUBICLE-11 | CUBICLE-12 |
|  [VACANT]  |  [VACANT]  |  [VACANT]  |  [VACANT]  |
+------------+------------+------------+------------+
| CUBICLE-13 | CUBICLE-14 | CUBICLE-15 | CUBICLE-16 |
|  [VACANT]  |  [VACANT]  |  [VACANT]  |  [VACANT]  |
+------------+------------+------------+------------+
```

Each cubicle cell contains:
1. **Header Bar**: Cubicle ID (`CUBICLE-01`), Model Tag (`Gemini 4 Argon (High)`), Sub-Swarm Capability Badge (`[SUBSWARM: ENABLED]` or `[SUBSWARM: BLOCKED]`).
2. **Central Workspace Zone**:
   - Provider Emblem (SVG vector for Gemini, GPT, Claude, DeepSeek, Custom CLI).
   - Animated Worker Avatar / Core Pulse.
   - Orbiting Sub-Swarm Drones (rendered when running nested child tasks).
3. **Fatigue / Stamina Meter**: A multi-segment or gradient energy bar depicting remaining token/budget quota (`0% - 100%`).
4. **Surface Thoughts Marquee**: A live ticker displaying the worker's current mental step or tool action.

### 3.2 AI Provider Iconography & Brand Badges
Rendered as crisp vector SVGs with dynamic phosphor coloring:
- **Gemini**: Four-pointed celestial diamond spark with cyan/blue gradient (`#00e5ff` / `#2563eb`).
- **GPT / OpenAI**: Hexagonal spiraling ring in phosphor green (`#00ff66`).
- **Claude / Anthropic**: Dual-faceted crystalline prism in warm solar amber (`#ff8c00`).
- **DeepSeek**: Dual sonar chevron pointing downward in deep azure (`#3b82f6`).
- **Custom CLI**: Terminal prompt glyph `>_` with blinking cursor in stark white (`#f0f6fc`).
- **Vacant**: Ghosted dashed wireframe box with dim amber pulse `[SLOT UNCONFIGURED]`.

### 3.3 Worker State Machine & Animation Engine
Workers transition between four distinct operational states:

| State | Visual Indicator | Border Animation | Sound Cue / Telemetry |
|---|---|---|---|
| **Working** | Glowing center core; spinning matrix ring; orbiting child drones if multi-swarm active. | Rapid phosphor pulse (`#00ff66` at 1.5s interval). | High-frequency telemetry blip; thought ticker rapidly typing. |
| **Relaxed / Idle** | Low-energy dim glow; gentle breathing scale animation (`1.0` -> `0.98`). | Static slate gray or faint ambient cyan (`#00e5ff` at 0.3 opacity). | `[STATUS: STANDBY / LISTENING]` |
| **Under Inspection** | The Eye of Sauron spotlight is centered directly over this cell. Cell expands slightly (`scale(1.02)`). | Blinking crimson surveillance border (`#ff1a40` 4Hz strobe). | Audio drone hum; thought ticker shows `[EYE LOCK: AUDITING WORKTREE DIFF]`. |
| **Error / Flatlined** | Red diagonal hazard stripes; worker core flickers off; flatline ECG line across the cell. | Harsh pulsing crimson (`#ff1a40`) + warning corner icons. | Klaxon alarm flash; incident card generated in center panel. |

#### Orbiting Sub-Swarm Drone Animation (CSS 3D / Keyframes)
When a cubicle agent (e.g. `Gemini 4 Argon (High)`) spawns child sub-swarms, child drone nodes orbit around the cubicle icon:
```css
.subswarm-orbit-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.subswarm-drone {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--telemetry-cyan);
  box-shadow: 0 0 8px var(--telemetry-cyan);
  border-radius: 50%;
  margin: -4px 0 0 -4px;
}
.subswarm-drone:nth-child(1) {
  animation: orbit-1 3s linear infinite;
}
.subswarm-drone:nth-child(2) {
  animation: orbit-2 4.5s linear infinite reverse;
}
@keyframes orbit-1 {
  0% { transform: rotate(0deg) translateX(36px) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(36px) rotate(-360deg); }
}
@keyframes orbit-2 {
  0% { transform: rotate(180deg) translateX(48px) rotate(-180deg); }
  100% { transform: rotate(540deg) translateX(48px) rotate(-540deg); }
}
```

### 3.4 Fatigue / Usage Remaining Meter Mathematics & Visuals
Each cubicle agent operates against a token/budget quota.
$$\text{Quota Remaining \%} = \max\left(0, \frac{\text{Quota Limit} - \text{Tokens Used}}{\text{Quota Limit}}\right) \times 100$$

- **100% - 70% (Prime / High Stamina)**:
  - Color: Phosphor Green (`#00ff66`).
  - Worker posture: Erect, high animation frequency, crisp ticker.
- **69% - 35% (Nominal Workload)**:
  - Color: Amber Warning (`#ffaa00`).
  - Worker posture: Moderate pacing, subtle thermal scanline overlay.
- **34% - 10% (Fatigued / Strained)**:
  - Color: Warning Crimson (`#ff4d4d`).
  - Worker posture: Visibly strained/flickering animation, random jitter on text, prompt badge displays `[WARNING: QUOTA DEPLETION DANGER]`.
- **< 10% (Critical Exhaustion / Near Flatline)**:
  - Color: Pulsing Hazard Red (`#ff0033`).
  - Worker posture: Slumped / desaturated glyph, stuttering progress bar. If it hits 0%, worker transitions automatically to `Error/Flatlined`.

### 3.5 Surface-Level Thoughts Stream (Live Speech / Ticker)
Located at the bottom of each cubicle card:
```html
<div class="cubicle-thought-stream">
  <span class="thought-prefix">&gt;</span>
  <span class="thought-content typing-active" id="thought-c01">Decomposing AST for symlink junction verification...</span>
  <span class="cursor-blink">_</span>
</div>
```
- Real-time updates via WebSocket event `cubicle:thought`.
- CSS typewriter smoothing with character queue buffer to ensure realistic typing cadence without freezing on high token throughput.

### 3.6 The Eye of Sauron & Dynamic Spotlight Engine
Positioned above the 4x4 grid in a dedicated Canvas/SVG viewport (`#sauron-viewport`):

```
       /===============================\
      |    .---.      /\       .---.    |
      |   /     \   ( () )    /     \   |  <- Sauron Biomechanical Iris & Slit Pupil
      |   \     /    \  /     \     /   |
       \===============================/
                       \
                        \  Volumetric Red Spotlight
                         \   (Canvas 2D Blend: 'screen')
                          \
                   +---------------+
                   |  CUBICLE-02   |  <- Target Focus Lock
                   +---------------+
```

#### Canvas 2D Spotlight Geometry & Raycasting Math
The spotlight is rendered on a hardware-accelerated HTML5 2D Canvas layered across the Left Section:
1. **Light Origin**: Fixed apex point $(x_0, y_0)$ centered at the Eye of Sauron pupil.
2. **Target Coordinates**:
   - In **Patrol Mode**: Target point $(x_t, y_t)$ sweeps smoothly along a Lissajous curve or sinusoidal wave across the 16 cubicles:
     $$x_t(t) = x_{\text{center}} + A_x \sin(\omega_x t)$$
     $$y_t(t) = y_{\text{center}} + A_y \cos(\omega_y t + \phi)$$
   - In **Lock-on Mode** (Task assignment, incident, error audit): Target coordinates snap to the center of the bounding box of the active cubicle $(C_x, C_y)$. A spring-damper or cubic bezier interpolation smoothly swings the spotlight from the current sweep position to the target over 350ms.
3. **Beam Projection**:
   A trapezoidal conical polygon is drawn from $(x_0, y_0)$ expanding to width $W_{\text{beam}}$ at $(x_t, y_t)$.
   ```javascript
   function drawSpotlight(ctx, eyeX, eyeY, targetX, targetY, beamWidth) {
     const angle = Math.atan2(targetY - eyeY, targetX - eyeX);
     const perpAngle = angle + Math.PI / 2;
     
     const x1 = targetX + Math.cos(perpAngle) * (beamWidth / 2);
     const y1 = targetY + Math.sin(perpAngle) * (beamWidth / 2);
     const x2 = targetX - Math.cos(perpAngle) * (beamWidth / 2);
     const y2 = targetY - Math.sin(perpAngle) * (beamWidth / 2);
     
     // Conical Radial Gradient
     const grad = ctx.createRadialGradient(eyeX, eyeY, 10, targetX, targetY, 400);
     grad.addColorStop(0, 'rgba(255, 26, 64, 0.7)');
     grad.addColorStop(0.3, 'rgba(255, 26, 64, 0.25)');
     grad.addColorStop(1, 'rgba(255, 26, 64, 0.0)');
     
     ctx.save();
     ctx.globalCompositeOperation = 'screen';
     ctx.fillStyle = grad;
     ctx.beginPath();
     ctx.moveTo(eyeX, eyeY);
     ctx.lineTo(x1, y1);
     ctx.lineTo(x2, y2);
     ctx.closePath();
     ctx.fill();
     
     // Ambient Ground Ellipse at Target
     ctx.beginPath();
     ctx.ellipse(targetX, targetY, beamWidth / 2, beamWidth / 4, 0, 0, Math.PI * 2);
     ctx.fillStyle = 'rgba(255, 26, 64, 0.35)';
     ctx.fill();
     ctx.restore();
   }
   ```

---

## 4. Center Section: Main Overseer Console, Incident Log & Vault Blueprint

The Center Section is the command bridge for the user, containing three integrated modules:
1. **Interactive Overseer Chat Console**
2. **Panopticon Error & Incident Logging System**
3. **Learned Memory, Skills & MCP Vault Tab**

### 4.1 Interactive Overseer Chat Console Terminal
- **Visual Presentation**: Dark CRT console with green/cyan prompt typography, timestamped output, and system audit logs.
- **Header Telemetry**: Active provider (`OVERSEER: Gemini 4 Argon / Claude 3.5 Sonnet / Local`), Current Swarm Status (`NOMINAL`, `INCIDENT ACTIVE`), Thinking Mode Toggle (`Low`, `Medium`, `High`, `Ultra`).
- **Interactive Features**:
  - Direct natural language instruction to the Overseer (e.g., *"Decompose the payment integration into sub-tasks and assign to Cubicle 1 and 2"*).
  - Quick-command action buttons:
    * `[SYNC WORKTREES]`: Triggers atomic directory junction verification.
    * `[AUDIT REVIEWS]`: Instructs Overseer to inspect Git diffs in `tasks/review/`.
    * `[MERGE ALL DONE]`: Automatically merges passing reviewed branches into `main`.
    * `[PURGE ERRORS]`: Clears resolved incident logs.
  - Collapsible Extended Thinking Trace: When the Overseer reasons, thoughts stream in an expandable brutalist accordion (`[OVERSEER REASONING TRACE - 8.4k TOKENS]`).

### 4.2 Real-time Panopticon Error & Incident Logging Feed
Surfaces critical failures immediately to prevent silent deadlocks.
- **Incident Severity Levels**:
  1. `CRITICAL`: Process crashed, unhandled exception, syntax failure.
  2. `BREACH`: Model capability violation (e.g. `GPT Astra (Very High)` attempted sub-swarm spawn).
  3. `EXHAUSTION`: Token or budget quota reached 0%.
  4. `TEST_FAILURE`: Automated verification test in worktree failed.
- **Card Layout**:
  ```
  +------------------------------------------------------------------------+
  | [!] CRITICAL BREACH | CUBICLE-03 | 2026-10-26 00:22:15 UTC             |
  | Target: Sub-Swarm Spawn Attempt Blocked                               |
  | Detail: Model 'GPT Astra (Very High)' lacks capability matrix permit  |
  |         for nested multi-swarm execution.                             |
  +------------------------------------------------------------------------+
  | STACK TRACE:                                                           |
  | > CapabilityMatrixError: Sub-swarm spawn forbidden for model tier.   |
  |   at evaluateCapability (matrix.ts:44:12)                             |
  +------------------------------------------------------------------------+
  | ACTIONS: [RETRY (CUBICLE-01)]  [OVERRIDE TO ULTRA]  [DISMISS]          |
  +------------------------------------------------------------------------+
  ```
- **One-Click Recovery Actions**:
  - `[RETRY (CUBICLE-01)]`: Re-queues the task in `.swarm/tasks/todo/` locked to Cubicle 1.
  - `[REASSIGN]`: Opens dropdown to assign to any active cubicle.
  - `[RESET WORKER]`: Resets cubicle state, purges branch worktree, resets git HEAD.
  - `[OVERRIDE TO ULTRA]`: Dynamically elevates model thinking tier to `Ultra` to allow sub-swarms.

### 4.3 Learned Memory, Skills & MCP Vault Tab ("Never Explain Twice")
When the user clicks the **[VAULT]** tab in the center section, the interface opens the persistent self-learning repository:

```
+===================================================================================================+
| [VAULT: NEVER EXPLAIN TWICE]     STORAGE: .swarm/memory/preferences.json & .agents/rules/         |
+---------------------------------------------------------------------------------------------------+
| [SUB-TAB 1: USER PREFERENCES]   | [SUB-TAB 2: GENERATED SKILLS]   | [SUB-TAB 3: GENERATED MCPS]   |
+---------------------------------+---------------------------------+-------------------------------+
| * PREF-01: "Always write unit   | * SKILL: git-worktree-junction  | * MCP: panopticon-filesystem  |
|   tests before code (TDD)"      |   Path: .agents/skills/git-junc |   Tools: atomic_move, junction|
|   Extracted: 2026-10-26 00:14   |   Version: 1.2.0                |   Status: RUNNING (PID 9102)  |
|   Tags: [#testing, #workflow]   |   [RUN TEST]  [VIEW SKILL.MD]   |   [RESTART]  [CONFIG JSON]    |
|                                 |                                 |                               |
| * PREF-02: "Brutalist dark UI,  | * SKILL: subswarm-spawner       | * MCP: git-atomic-merger      |
|   zero border-radius strictly"  |   Path: .agents/skills/spawner  |   Tools: merge_tree, diff     |
|   Extracted: 2026-10-26 00:15   |   Version: 2.0.1                |   Status: RUNNING (PID 9105)  |
|   Tags: [#ui, #styling]         |   [RUN TEST]  [VIEW SKILL.MD]   |   [RESTART]  [CONFIG JSON]    |
+===================================================================================================+
```
- **Preference Persistence**: Every rule extracted from user chat is rendered as an editable card. The card links directly to `.swarm/memory/preferences.json` and `.agents/rules/USER_PREFERENCES.md`.
- **Immediate Propagation**: Displays status indicator confirming that all 16 cubicle worktrees inherit these rules via `.agents` directory junctions.
- **Skill / MCP Generator**: A prominent button `[SYNTHESIZE NEW SKILL FROM PATTERN]` allows the user to prompt the Overseer to package recent workflows into a standard SKILL or MCP server.

---

## 5. Right Section: Shared Taskboard & Progress Bars Blueprint

### 5.1 Real-Time Kanban Taskboard Synced with `.swarm/tasks/`
The Right Section reflects the central file-backed taskboard:
- **Columns**:
  1. `To Do` (`.swarm/tasks/todo/`)
  2. `In Progress` (`.swarm/tasks/in_progress/`)
  3. `Review` (`.swarm/tasks/review/`)
  4. `Done` (`.swarm/tasks/done/`)

#### Task Card Anatomy
Each task card rendered in the Kanban column contains:
- **Task ID**: `TASK-104`
- **Title**: `Implement Directory Junction Verification`
- **Priority Badge**: `[URGENT]` (Crimson) or `[NORMAL]` (Slate)
- **Assigned Worker Badge**: Icon + `CUBICLE-01 (Gemini 4 Argon)`
- **Task Progress Bar**: Precise percentage calculated from sub-tasks or worker heartbeats (`75%`).
- **Sub-Swarm Mini-Pills**: If sub-swarms are active, child task badges are rendered directly inside the card:
  - `Drone 1: [DONE]`
  - `Drone 2: [IN PROG: 60%]`
- **Git Diff Inspection Button**: `[VIEW DIFF (4 files, +120/-18)]`. Clicking expands the Git Diff Preview Drawer.

### 5.2 Swarm Mission Overall Progress Bar
Anchored at the top of the Right Section (and mirrored across the global header):
$$\text{Overall Mission Progress \%} = \frac{\sum_{i=1}^{N} \text{Task}_i.\text{weight} \times \text{Task}_i.\text{progress}}{\sum_{i=1}^{N} \text{Task}_i.\text{weight}}$$
- High-visibility brutalist segmented bar with glowing scanline leader:
  `[ ||||||||||||||||||||||||||||||||||||||||.................... ] 72.5%`
- Auxiliary metrics:
  - `ACTIVE AGENTS: 3 / 16`
  - `TASKS: 12 COMPLETED | 3 ACTIVE | 2 QUEUED`
  - `ERROR RATE: 0.0%`
  - `EST. TIME REMAINING: 00:06:45`

### 5.3 Git Diff Previews Drawer / Modal
When inspecting tasks in the `Review` column:
- Monospace side-by-side or unified diff viewer.
- Additions in phosphor green (`#00ff66`), deletions in crimson (`#ff1a40`).
- Direct action controls:
  - `[APPROVE & MERGE INTO MAIN]` (moves task file from `review/` to `done/` and triggers git merge).
  - `[REQUEST REVISION]` (sends feedback back to cubicle worker).

---

## 6. Multi-Monitor Scaling (1..X Displays) & Detached Pop-Out Window Engine

A critical requirement of the system is flexible multi-monitor display scaling: from single laptop screens up to multi-display command bridges (1, 2, 3, or X monitors) and detached pop-out panels.

### 6.1 Proportional Layout Matrix (1, 2, 3, ..., X Monitors)

| Configuration | Monitor Allocation | Layout Distribution |
|---|---|---|
| **1 Monitor (Standard / 1080p / 1440p / 4K)** | Single Display | 3-Column Split: Left Grid (`30%`, min 380px), Center Console (`42%` flex), Right Taskboard (`28%`, min 360px). Responsive collapses to tabbed on narrow screens. |
| **1 Monitor (Ultrawide 21:9 / 32:9)** | Single Display | Expands horizontally: Left Grid (`28%`, 4x4 grid enlarged), Center Console (`44%`, terminal + incident drawer side-by-side), Right Taskboard (`28%`, 4-column kanban full width). |
| **2 Monitors** | Monitor 1 (Left)<br>Monitor 2 (Right) | **Monitor 1**: Panopticon 4x4 Grid + Overseer Chat Console.<br>**Monitor 2**: Shared Taskboard + Full Git Diff Studio + Incident Vault. |
| **3 Monitors (Tactical Command Setup)** | Monitor 1 (Left)<br>Monitor 2 (Center)<br>Monitor 3 (Right) | **Monitor 1**: Fullscreen Panopticon 4x4 Cubicle Grid with Grand Eye of Sauron and real-time thought streams.<br>**Monitor 2**: Fullscreen Overseer Console + Incident Feed + Learned Memory Vault.<br>**Monitor 3**: Fullscreen Shared Taskboard + Diff Inspector + Mission Analytics. |
| **X Monitors (Grid / Wall)** | Multi-Window Matrix | Any panel can be undocked and dragged to any display. The layout engine persists monitor configurations in local storage. |

### 6.2 Detached Pop-Out Window Engine (`?panel=...`)
Each section can be undocked into its own independent OS window:
- Left Grid: `http://localhost:3000/?panel=cubicles`
- Center Console: `http://localhost:3000/?panel=console`
- Center Vault: `http://localhost:3000/?panel=vault`
- Right Taskboard: `http://localhost:3000/?panel=taskboard`

```
  +-------------------------------------------------------------------------+
  |                          LOCAL BACKEND SERVER                           |
  |             (Node.js / Go / Rust standalone runtime on port 3000)       |
  +-------------------------------------------------------------------------+
                     | WebSocket Event Stream (/ws)
                     v
  +-------------------------------------------------------------------------+
  | WINDOW 1 (Main Hub)         WINDOW 2 (?panel=cubicles)                  |
  | [Center + Right Panels]     [Fullscreen 4x4 Panopticon Grid]            |
  |            ^                               ^                            |
  |            |==== BroadcastChannel API =====|                            |
  |                  ('panopticon_window_bus')                              |
  +-------------------------------------------------------------------------+
```

### 6.3 Real-Time State Synchronization Protocol
To prevent race conditions, stale UI state, or desynchronized spotlight targets across detached windows, a **Dual-Layer Synchronization Architecture** is employed:

#### Layer 1: Server WebSocket / SSE Bus (Master Source of Truth)
- The backend watches `.swarm/` file events and agent processes, broadcasting structured JSON state packets to all connected clients:
  - `SWARM_STATE_UPDATE`: Full snapshot of 16 cubicles, active tasks, error counters.
  - `CUBICLE_STATUS_EVENT`: Delta update for specific cubicle (`cubicle_id`, `state`, `thought`, `quota_remaining`).
  - `SPOTLIGHT_LOCK_EVENT`: Coordinates Eye of Sauron spotlight target coordinates across all windows.
  - `TASK_TRANSITION_EVENT`: Emitted when task moves between `todo`, `in_progress`, `review`, `done`.

#### Layer 2: Browser `BroadcastChannel` (Zero-Latency Inter-Window Bus)
- When multiple windows/tabs run on the same machine across displays, they connect to a shared `new BroadcastChannel('panopticon_window_bus')`.
- Handles immediate cross-window UI interactions with <1ms latency:
  - **Hover Lock Sync**: Hovering over a task assigned to `cubicle-02` in the Taskboard window immediately broadcasts a spotlight lock message to the Cubicle window, causing the Eye of Sauron to swing towards Cubicle 2 instantaneously.
  - **Incident Alarm Flash**: Triggering an incident in the Console window immediately triggers the red emergency screen flash on the Cubicle Grid window.
  - **Shared Audio Synthesizer**: Only the primary window plays audio cues (preventing audio echo across 3 windows).

---

## 7. UI Technology Stack Recommendation & Packaging Compatibility

### 7.1 Framework Evaluation & Selection

| Dimension | Option A: Heavy React / Next.js / Vue | Option B: Modular Vanilla ES6 + Pure CSS3 + Web Components |
|---|---|---|
| **Build Artifact Size** | 60MB - 150MB+ (node_modules, vendor chunks) | **< 1.5MB** (pure code, zero dependencies) |
| **Startup / Launch Time** | 1.5s - 4.0s (hydration, runtime init) | **< 80ms** (instant parse and render) |
| **Memory Footprint** | ~120MB - 250MB RAM | **~18MB - 35MB RAM** |
| **Standalone .exe Embedding** | Complex bundling; potential file path issues in virtual FS | **Seamless**: Static HTML/CSS/JS served directly from binary |
| **Canvas 2D / Spotlight Performance** | React reconciliation overhead can drop frames to 30 FPS | **Rock-solid 60 FPS** direct RAF loop |
| **Pop-Out Window Support** | Requires complex multi-root SPA router or Next.js server | **Trivial**: Single HTML file with `?panel=` parameter switch |

### 7.2 Recommended Stack: Modular Vanilla ES6 + Hardware-Accelerated Canvas 2D
- **Core UI Structure**: Semantic HTML5 with brutalist CSS3 design tokens.
- **Eye of Sauron & Spotlight**: Pure HTML5 2D Canvas rendering with `requestAnimationFrame`.
- **State Management**: Reactive lightweight Store class (~100 LOC) with event emitter and `BroadcastChannel` synchronization.
- **Client-Server Protocol**: Native browser `WebSocket` with automatic reconnection backoff.
- **Standalone `.exe` Hosting**: An embedded HTTP server in the backend (e.g. Node.js with built-in `http`, or Go `embed`, or Rust `rust-embed`) serves the UI on `http://localhost:3000` and launches the system browser (or an embedded Chromium webview window).

---

## 8. Detailed Architectural Implementation Specifications

### 8.1 Cubicle Grid State Schema (`CubicleState`)
```typescript
interface CubicleState {
  id: string; // 'cubicle-01' to 'cubicle-16'
  index: number; // 1 to 16
  assigned: boolean;
  provider: 'gemini' | 'gpt' | 'claude' | 'deepseek' | 'custom' | 'vacant';
  modelName: string; // e.g. 'Gemini 4 Argon (High)', 'GPT Astra (Very High)'
  thinkingTier: 'low' | 'medium' | 'high' | 'very_high' | 'ultra';
  canSpawnSubswarm: boolean;
  status: 'working' | 'relaxed' | 'inspected' | 'error' | 'flatlined';
  activeSubswarms: Array<{
    droneId: string;
    subtaskId: string;
    progress: number; // 0 to 100
  }>;
  quota: {
    limitTokens: number;
    usedTokens: number;
    remainingPercent: number; // 0 to 100
  };
  surfaceThoughts: {
    currentThought: string;
    lastUpdated: string;
  };
  currentTaskId: string | null;
  worktreeBranch: string; // e.g. 'swarm/cubicle-01'
}
```

### 8.2 Eye of Sauron Kinematic Controller & Lock-On Protocol
```javascript
class SauronEyeController {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.eyePos = { x: canvas.width / 2, y: 70 };
    this.targetPos = { x: canvas.width / 2, y: 300 };
    this.currentPos = { x: canvas.width / 2, y: 300 };
    this.mode = 'patrol'; // 'patrol' | 'locked'
    this.lockedCubicleId = null;
    this.patrolTime = 0;
  }

  setLock(cubicleId, boundingBox) {
    this.mode = 'locked';
    this.lockedCubicleId = cubicleId;
    this.targetPos = {
      x: boundingBox.left + boundingBox.width / 2,
      y: boundingBox.top + boundingBox.height / 2
    };
  }

  releaseLock() {
    this.mode = 'patrol';
    this.lockedCubicleId = null;
  }

  update(dt) {
    if (this.mode === 'patrol') {
      this.patrolTime += dt * 0.001;
      // Smooth figure-8 / Lissajous sweep across the 4x4 grid
      this.targetPos.x = this.canvas.width / 2 + Math.sin(this.patrolTime * 0.8) * (this.canvas.width * 0.35);
      this.targetPos.y = 280 + Math.cos(this.patrolTime * 1.6) * 120;
    }

    // Smooth cubic interpolation towards target
    const ease = 0.08;
    this.currentPos.x += (this.targetPos.x - this.currentPos.x) * ease;
    this.currentPos.y += (this.targetPos.y - this.currentPos.y) * ease;
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // 1. Draw Eye Sclera, Flaming Iris, and Dilating Slit Pupil
    this.drawEyeIris(this.eyePos.x, this.eyePos.y, this.currentPos);
    // 2. Draw Volumetric Spotlight Beam
    this.drawVolumetricBeam(this.eyePos, this.currentPos, this.mode === 'locked');
  }
}
```

### 8.3 Multi-Window Synchronization Controller (`PanopticonSyncBus`)
```javascript
class PanopticonSyncBus {
  constructor() {
    this.channel = new BroadcastChannel('panopticon_swarm_sync');
    this.socket = null;
    this.listeners = new Map();
    this.initWebSocket();
    this.initBroadcastChannel();
  }

  initWebSocket() {
    const wsUrl = `ws://${window.location.host}/ws`;
    this.socket = new WebSocket(wsUrl);
    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.dispatch(msg.type, msg.payload);
      // Re-broadcast to local sibling windows to guarantee sync
      this.channel.postMessage(msg);
    };
    this.socket.onclose = () => setTimeout(() => this.initWebSocket(), 2000);
  }

  initBroadcastChannel() {
    this.channel.onmessage = (event) => {
      const { type, payload } = event.data;
      this.dispatch(type, payload);
    };
  }

  broadcast(type, payload) {
    this.dispatch(type, payload);
    this.channel.postMessage({ type, payload });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }

  on(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  dispatch(type, payload) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach(fn => fn(payload));
  }
}
```

---

## 9. Verification & Quality Assurance Strategy

1. **Rendering & Layout Verification**:
   - Inspect 4x4 grid responsiveness across 1920x1080, 2560x1440, 3840x2160, and 3440x1440 ultrawide displays.
   - Verify that all cubicles retain 1:1 or 4:3 aspect ratios without content overflow or clipping.
   - Ensure scanline overlay does not block mouse events (`pointer-events: none`).
2. **State Transition & Animation Verification**:
   - Transition cubicles programmatically through `working`, `relaxed`, `inspected`, and `error` states; confirm border pulses, drone rotations, and hazard stripes match specifications.
   - Test sub-swarm drone animation when `can_spawn_subswarm` is true vs. blocked alert when false.
3. **Eye of Sauron Raycasting Verification**:
   - Verify that calling `setLock('cubicle-03')` centers the spotlight beam exactly over Cubicle 3's bounding box within 350ms.
   - Verify smooth fallback to ambient patrol mode on `releaseLock()`.
4. **Detached Pop-Out Window Cross-Sync Verification**:
   - Open main window and open pop-out window `?panel=cubicles`.
   - Hover on task in main window; verify that the spotlight locks onto the assigned cubicle in the detached window with zero perceived lag (<16ms).
   - Verify that errors logged in the console immediately flash the alert badge on the detached grid.
5. **Standalone `.exe` UI Bundle Verification**:
   - Confirm that all assets (HTML, CSS, SVGs, JS, fonts) are self-contained without external CDN URLs to guarantee 100% offline functionality.

---

## 10. Conclusion & Recommendations

The **Brutalist Dystopian Cyberpunk Panopticon UI** provides an intense, atmospheric, and highly functional command center for the Symlinked Agent Swarm. By leveraging a **Modular Vanilla ES6 + Pure CSS3 + Canvas 2D** architecture paired with **Dual-Bus WebSocket/BroadcastChannel synchronization**, the interface delivers 60 FPS performance, instant startup, microscopic binary size, and seamless multi-monitor pop-out capability.

This architecture fully supports all R1-R4 requirements, the self-learning memory vault, and standalone Windows `.exe` distribution.
