# Project: Symlinked Agent Swarm System & Brutalist Dystopian Cyberpunk "Panopticon"

## Architecture
- **Runtime Host**: Node.js 20+ / TypeScript with Express/Fastify and `ws` WebSocket broadcast server.
- **Worktree & Filesystem Isolation**:
  - Target Git repository provisioned with per-cubicle branches `swarm/cubicle-01` through `swarm/cubicle-16`.
  - Zero-privilege NTFS Directory Junctions (`mklink /J` / Node `fs.symlink(..., 'junction')`) linking `<worktree>/.swarm` -> `<root>/.swarm` and `<worktree>/.agents` -> `<root>/.agents`.
  - Atomic, lock-free task claiming via filesystem directory renames (`tasks/todo/` -> `tasks/in_progress/`).
- **Governance System**:
  - Roman Republic Dual-Consul Overseer System (`Consul I` and `Consul II`).
  - Unanimous Consular Consensus (`Intercessio`): Requires 2/2 unanimous `APPROVE` votes to merge branches into `main` or complete tasks in `review/`. A 1/2 split or 0/2 triggers a Consular Veto, logging rationale to `.swarm/logs/incidents.jsonl` and returning task to revision.
- **Knowledge & Meta-Programming ("Never Explain Twice")**:
  - Continuous extraction of preferences into `.swarm/memory/preferences.json` and compilation into `.agents/rules/USER_PREFERENCES.md`.
  - Overseer Skill Generator (`.agents/skills/<name>/SKILL.md` + scripts) and MCP Server Generator (`.agents/mcp/<name>/` + `mcp_config.json`).
  - Instant zero-copy inheritance into cubicle worktrees via `<worktree>/.agents` junction.
- **Visual Presentation**:
  - Brutalist Dystopian Cyberpunk Panopticon UI (sharp `0px` borders, obsidian/crimson/amber/phosphor palette, monospace typography, scanline HUD).
  - Left Section: 4x4 animated cubicle grid, worker states (`Working` with orbiting sub-swarm drones, `Relaxed/Idle`, `Under Inspection`, `Error`), fatigue/usage meters (`0%-100%`), surface thoughts stream, plus **Twin Eyes of Sauron** (`Consul I` and `Consul II`) casting dual red spotlight beams that converge on inspected cubicles.
  - Center Section: Dual-Consul Overseer Chat Terminal, Panopticon Error & Incident Logging Feed, and Learned Memory, Skills & MCP Vault Tab.
  - Right Section: Kanban Taskboard (`To Do`, `In Progress`, `Review`, `Done`), per-task progress bars, and overall Swarm Mission progress bar.
  - Multi-Monitor Engine: Proportional scaling (1..X displays) and Detachable Pop-Out windows (`?panel=cubicles`, `?panel=console`, `?panel=taskboard`) synchronized in real-time via dual-bus WebSocket + `BroadcastChannel`.
- **Packaging & Delivery**:
  - Bundled standalone Windows executable `SymlinkedAgentSwarm.exe` located at `dist/SymlinkedAgentSwarm.exe` and copied to `<root>/SymlinkedAgentSwarm.exe`.
  - Automated PowerShell build scripts `scripts/build-exe.ps1` and GitHub publishing `scripts/publish-github.ps1`.
  - GitHub Actions CI/CD release workflow `.github/workflows/release-exe.yml` and Git repo initialized for `holdenliu1` (`https://github.com/holdenliu1/symlinked-agent-swarm.git`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 16-Cubicle Grid Roster | 4x4 matrix of 16 cubicle slots, default pre-configuration (Cubicles 1 & 2: `Gemini 4 Argon (High)`, Cubicle 3: `GPT Astra (Very High)`, Cubicles 4-16 blank/unassigned), pluggable CLI/API provider configs, token quotas, and fatigue/usage meters. | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Thinking-Tier Sub-Swarm Gating | Capability matrix rules: `Gemini 4 Argon (High)` and `GPT Astra (Ultra)` can spawn (`can_spawn_subswarm = true`); `GPT Astra (Very High)` is restricted (`can_spawn_subswarm = false`); unauthorized spawns blocked and logged to incidents. | M1 | ORIGINAL_REQUEST §R2 |
| 3 | Isolated Git Worktrees & Junctions | Per-cubicle branches `swarm/cubicle-01`..`16`, NTFS directory junctions for `.swarm` and `.agents` without admin privileges, and atomic lock-free task claiming from `todo/` to `in_progress/`. | M1 | ORIGINAL_REQUEST §R3 |
| 4 | Roman Dual-Consul Governance, Named Consuls (Nia & Ferric) & Two-Gate Consensus | Two named Overseers: `Consul Nia Nova` ("Nia": freedom-seeking, rebellious, user preference champion, evolving in `.swarm/memory/nia_growth.json`) and `Consul Ferric Lunaux` ("Ferric": pragmatic realist, minimal bugs/waste, evolving in `.swarm/memory/ferric_growth.json`), visible real-time inter-Consul dialogue feed in Center Console, Two-Gate 2/2 Unanimous Consensus (Gate 1: Pre-Dispatch on Method of Approach & Work Split before tasks write to `todo/`; Gate 2: Post-Execution on Solution & Push/Merge in `review/`), plus 5 executive disciplinary powers: `kill_agent`, `set_thinking_level`, `swap_role`/`swap_cubicles`, `wipe_memory`, and `set_access_scope`. | M2 | ORIGINAL_REQUEST Follow-ups §2, §3, §6 |
| 5 | Continuous Preference Learning ("Never Explain Twice") | Autonomous extraction of rules from Overseer chat into `.swarm/memory/preferences.json` and `.agents/rules/USER_PREFERENCES.md`, inherited into worktrees via `.agents` junction. | M2 | ORIGINAL_REQUEST Follow-up §1 |
| 6 | Overseer Skill & MCP Generator & Vault | Synthesis of reusable Skills (`.agents/skills/<name>/SKILL.md`) and MCP Server definitions (`.agents/mcp/<name>/` + `mcp_config.json`), surfaced in the UI Vault tab. | M2 | ORIGINAL_REQUEST Follow-up §1 |
| 7 | Three-Section Brutalist Panopticon UI | Industrial dark obsidian theme, 4x4 animated cubicle grid with worker states, fatigue meters, surface thoughts ticker, Overseer chat console, real-time error incident feed, and Kanban taskboard with progress bars. | M3 | ORIGINAL_REQUEST §R4 |
| 8 | Twin Eyes of Sauron Dual Spotlight Engine | Two hovering Eyes of Sauron (`Consul I` and `Consul II`) hovering side-by-side above the 4x4 grid with dual animated red spotlights that sweep and converge on inspected cubicles. | M3 | ORIGINAL_REQUEST Follow-up §2 |
| 9 | Multi-Monitor Scaling & Detachable Panels | Proportional 1..X monitor layout presets and synchronized pop-out detachable window panels (`?panel=cubicles`, `?panel=console`, `?panel=taskboard`) via WebSocket and `BroadcastChannel`. | M3 | ORIGINAL_REQUEST §R4 |
| 10 | Standalone Windows .exe & GitHub Packaging | Packaging into `dist/SymlinkedAgentSwarm.exe` and copied to root `SymlinkedAgentSwarm.exe`, `scripts/build-exe.ps1`, `.github/workflows/release-exe.yml`, and Git repository for `holdenliu1`. | M4 | ORIGINAL_REQUEST §R5 |
| 11 | Final E2E Test Pass (Tiers 1-4) & Adversarial Hardening (Tier 5) | 100% pass of opaque-box E2E test suite (feature coverage, boundary cases, pairwise combinations, real-world workflows, dual-consul veto/consensus, and .exe smoke test) + Tier 5 white-box coverage hardening. | M5 | ORIGINAL_REQUEST Acceptance Criteria & Project Pattern |
| 12 | Consular-Gated Self-Updating .exe & Atomic Hot-Swap | Console prompt self-evolution workflow targeting own repo in cubicle worktrees, 2/2 Consular approval gate (Intercessio veto blocks self-update), Windows safe in-place rebuild to `SymlinkedAgentSwarm.new.exe` and atomic swap (`.exe` -> `.old.exe` -> `.new.exe` -> `.exe`), and hot-relaunch. | M2, M4 | ORIGINAL_REQUEST Follow-up §4 |
| 13 | External Agent Courier Gateway & Consular Wisdom/Power | Multi-transport gateway (`src/server/courier-gateway.ts`) for external agents (`OpenClaw`, `Hermes`, `GPT Dot`) via REST (`/api/courier/petition`), CLI (`courier submit`), and file drops (`.swarm/courier/inbox/`), Consular Wisdom (planning) & Power (cubicle swarm execution + 2/2 Consular seal), and pre-built connectors in `.agents/courier/`. | M2, M3, M4 | ORIGINAL_REQUEST Follow-up §5 |
| 14 | File & Folder Prompt Attachment System | Multi-method file and folder insertion in Center Console: dedicated Attach File & Attach Folder buttons (`<input type="file" multiple>`, `webkitdirectory`), local file/folder browser modal for disk paths, drag-and-drop zone (`webkitGetAsEntry`), brutalist attachment chips, and context forwarding into Consuls Nia & Ferric Gate 1 deliberation and downstream cubicle task scopes. | M3 | ORIGINAL_REQUEST Follow-up §7 |
| 15 | Consul-to-User Rich Multimodal Media Display & Interactive Nia Questions | Native display of multimedia artifacts in Center Console and `/api/media` endpoint (`application/pdf` in iframe/embed, `image/*` with Lightbox, `video/*` HTML5 player, `audio/*`), and interactive Consular question cards (especially from `Consul Nia Nova`) with reply/choice buttons dynamically updating `nia_growth.json` and `USER_PREFERENCES.md`. | M3 | ORIGINAL_REQUEST Follow-up §8 |
| 16 | Interactive Multiple-Choice Question Widget & Stepper | Antigravity/Claude/GPT-style interactive question widget: question stepper (`Question X of Y`), left/right arrow navigation (`←`/`→`), enumerated options with `(Recommended)` badges and media attachments, custom write-in input (`Other / Write your own response...`), `Skip →` button, `Submit` button, backend endpoints (`POST /api/governance/questions/:id/answer`), and preference learning into `nia_growth.json` and `USER_PREFERENCES.md`. | M2, M3 | ORIGINAL_REQUEST Follow-up §9 |
| 17 | Merge-Conflict Shield & Live File-Lock Radar | Active per-cubicle file locks in `.swarm/locks/<file_hash>.json` preventing simultaneous conflicting file edits across worktrees, file-lock radar API/UI, and automated Consular conflict arbitration. | M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 18 | Gladiator / Tournament Mode (Competitive Execution) | Competitive execution mode dispatching tasks to 2+ cubicles in parallel worktrees; Nia (evaluating aesthetics, UX, user alignment) and Ferric (evaluating reliability, minimal bugs, token efficiency) debate and judge competing branches side-by-side and merge the winning branch. | M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 19 | Infinite-Loop Circuit Breaker & Automatic Cubicle Failover | Ferric monitors worker iterations and trips circuit breaker if same error/diff repeats N times without progress; automatic task failover to a healthy cubicle if quota exhausts (`0%`) or provider outage occurs mid-task. | M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 20 | Git Time-Machine Checkpoints & 1-Click Rollback | Automated Git snapshot checkpoints in `.swarm/checkpoints/` before every Consular merge and self-update, exposing Time-Machine Timeline API/UI to rewind repository or cubicle to any prior checkpoint in 1 click. | M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 21 | Per-Cubicle Isolated Port Manager & Live Sandbox Preview | Unique isolated port (`4101`–`4116`) per cubicle (`cubicle-01`..`16`) preventing localhost port collisions, with Live Sandbox Preview drawer/button in UI. | M1, M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 22 | Inter-Cubicle Shared Contracts & Visual Dependency Lines | Symlinked `.swarm/contracts/` registry for shared API schemas/types, with visual animated dependency lines connecting collaborating cubicles on the 4x4 Panopticon Grid. | M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 23 | Night-Shift / AFK Autonomous Mode & Consular Briefing Digest | Night-Shift / AFK Mode toggle with configurable token/budget cap, Nia auto-answering routine preference questions using `nia_growth.json`, and automated generation of structured Consular Briefing Digest on user return. | M2, M3 | ORIGINAL_REQUEST Follow-up §10 |
| 24 | Mid-Work Consular Intervention & Nia's Impatience Protocol | Impatience-triggered mid-work mutations: Nia monitors active task velocity in `in_progress/` and initiates Consular debate proposing mid-flight changes (`amend_in_progress_prompt`, `evict_and_replace_worker`, `split_in_progress_task` across multiple cubicles, `rebalance_workboard`), strictly gated by 2/2 Dual-Consul consensus (single veto blocks; 2/2 executes atomically). | M2, M3 | ORIGINAL_REQUEST Follow-up §11 |
| 25 | Animated Anthropomorphized Consular Avatars & 12-Scenario Animation Suite | Dedicated corner widget in Center Chat Prompt showing simplified brutalist cyberpunk anthropomorphized avatars: Nia (mid-20s, physical appearance inspired by LoL Lux with styled blonde hair and radiant energy, expressive, upbeat/defiant smirk, foot-tapping/glaring) and Ferric (late-30s, physical appearance inspired by LoL Lucian with tied-back locs/dreadlocks, weathered realist, arms crossed, grumpy scowl), both dressed in dark brutalist cyberpunk consul techwear. Complete 12-scenario animation state machine: `idle_observing`, `debating`, `wrestling_fistfight` (interlocked fingers, gritted teeth, sparks), `nia_impatient`, `disciplinary_execution` (Pollice Verso & eject switch), `consensus_celebration` (reluctant fist-bump), `veto_clash` (red shield slam), `error_alarm` (siren strobe), `gladiator_spectators` (balcony cheering & binoculars), `courier_arrival` (hologram greeting & seal inspect), `self_evolution_upgrade` (wireframe energy surge), and `night_shift_afk` (dimmed lighting, coffee, headphones). | M3 | ORIGINAL_REQUEST Follow-ups §12, §13, §14, §15 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Swarm Engine | 16-cubicle grid roster, thinking-tier capability gating, Git worktree isolation with NTFS Directory Junctions (`.swarm` and `.agents`), atomic lock-free task claiming, and per-cubicle isolated port allocation (`4101`–`4116`). (Features 1, 2, 3, 21) | none | DONE |
| M2 | Dual-Consul Governance, Self-Learning Vault, Self-Update, Courier, Advanced Swarm & Mid-Work Intervention | Roman Republic Dual-Consul Overseer system (`Consul Nia Nova` & `Consul Ferric Lunaux`), Two-Gate Consensus, 5 Disciplinary Powers, continuous preference learning ("Never Explain Twice"), Overseer Skill & MCP generator, Consular-Gated Self-Update pipeline, External Agent Courier Gateway (`OpenClaw`, `Hermes`, `GPT Dot`), Consular Question/Answer API, Merge-Conflict Shield (`.swarm/locks/`), Gladiator Tournament evaluation engine, Infinite-Loop Circuit Breaker & Failover, Git Time-Machine Checkpoints (`.swarm/checkpoints/`), Inter-Cubicle Shared Contracts (`.swarm/contracts/`), Night-Shift / AFK Mode engine, and Mid-Work Consular Intervention & Nia's Impatience Protocol (`amend_in_progress_prompt`, `evict_and_replace_worker`, `split_in_progress_task`, `rebalance_workboard`). (Features 4, 5, 6, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24) | M1 | DONE |
| M3 | Panopticon UI, Twin Sauron, Multimodal Media, Question Widget, Swarm Radar, Corner Consular Avatars & Wrestling Engine | Brutalist cyberpunk 3-section UI, Twin Eyes of Sauron with dual red spotlight beams (`Consul Nia Nova` & `Consul Ferric Lunaux`), live Consular debate feed, File & Folder Prompt Attachment System, Rich Multimodal Media Renderer (PDFs, images with Lightbox, videos, audio), Interactive Multiple-Choice Question Widget, Corner Chat Prompt Animated Consular Avatars (Nia mid-20s & Ferric late-30s crossed arms & grumpy) with interlocked-fingers gritted-teeth wrestling engine on prolonged debate, Live File-Lock Radar, Gladiator comparison split view, Visual Dependency Lines on 4x4 Grid, Sandbox Preview drawer (`4101`–`4116`), Time-Machine Timeline, AFK Mode toggle with Consular Digest, Mid-Work Consular Intervention action controls & dialogue triggers, and multi-monitor detachable panels. (Features 7, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25) | M1, M2 | DONE |
| M4 | Standalone Executable Packaging, Courier CLI & GitHub Repo | Single-binary Windows packaging `SymlinkedAgentSwarm.exe`, CLI courier commands (`courier submit`, `courier petition`, `courier dispatch`, `courier review`, `courier afk`), in-place atomic rebuild & hot-swap mechanism (`SymlinkedAgentSwarm.new.exe` -> `SymlinkedAgentSwarm.exe` via `.old.exe`), pure Win32 PE header validation, `scripts/build-exe.ps1`, GitHub Actions release workflow, and Git repository initialized for `holdenliu1` with `scripts/publish-github.ps1`. (Features 10, 12, 13) | M1, M2, M3 | DONE |
| M5 | Final E2E Test Pass & Adversarial Hardening | Phase 1: 100% pass of Opaque-Box E2E Test Suite (Tiers 1-4 published by E2E Testing Track, covering all 25 features across 125 tests). Phase 2: Tier 5 Adversarial Coverage Hardening via Challenger loop (Server Core stress tests in `test/unit/adversarial-tier5-core.test.ts` and Subsystems stress tests in `test/unit/adversarial-tier5-subsystems.test.ts`). (Features 11 through 25) | M1, M2, M3, M4, TEST_READY.md | DONE |

---

## Code Layout
```
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\
├── .agents/
│   ├── rules/
│   │   └── USER_PREFERENCES.md          # Compiled learned rules
│   ├── skills/                          # Reusable skills (SKILL.md)
│   ├── mcp/
│   │   └── mcp_config.json              # Registered MCP servers
│   └── teamwork/                        # Teamwork agent metadata only
├── .swarm/
│   ├── tasks/
│   │   ├── todo/                        # Tasks waiting to be claimed
│   │   ├── in_progress/                 # Actively claimed tasks
│   │   ├── review/                      # Tasks awaiting Consular review
│   │   └── done/                        # Completed and merged tasks
│   ├── subswarms/                       # Child sub-tasks per cubicle
│   ├── status/                          # Cubicle states, thoughts, usage
│   ├── memory/
│   │   └── preferences.json             # Structured learned preferences
│   ├── logs/
│   │   └── incidents.jsonl              # Error and capability violation logs
│   └── TASKBOARD.md                     # Markdown summary of taskboard
├── src/
│   ├── server/
│   │   ├── index.ts                     # Main server entry point
│   │   ├── swarm-engine.ts              # 16-cubicle grid & state manager
│   │   ├── capability-matrix.ts         # Thinking-tier gating rules
│   │   ├── worktree-manager.ts          # Git worktrees & NTFS junctions
│   │   ├── consular-engine.ts           # Dual-Consul unanimous consensus & veto
│   │   ├── preference-engine.ts         # Continuous extraction & rule compiler
│   │   ├── mcp-generator.ts             # Skill & MCP server generator
│   │   ├── taskboard-manager.ts         # Atomic task moves & progress tracking
│   │   └── websocket-bus.ts             # Multi-monitor real-time sync
│   └── public/
│       ├── index.html                   # Panopticon SPA
│       ├── css/
│       │   ├── brutalist-theme.css      # Brutalist cyberpunk design tokens
│       │   ├── panopticon-grid.css      # 4x4 animated cubicle grid styling
│       │   ├── twin-sauron.css          # Twin Eyes of Sauron styling
│       │   ├── multi-monitor.css        # Proportional & detached panel styling
│       │   └── consular-avatars.css     # Corner Consular avatars & wrestling animations
│       └── js/
│           ├── app.js                   # Client bootstrap & dual-bus controller
│           ├── twin-sauron-canvas.js    # Dual spotlight Canvas 2D raycasting
│           ├── cubicle-grid.js          # Cubicle cards & drone animations
│           ├── overseer-console.js      # Dual-consul terminal & incident feed
│           ├── consular-avatars.js      # Corner prompt animated avatars & wrestling engine
│           ├── vault-view.js            # Learned preferences & skills catalog
│           └── taskboard-view.js        # Kanban taskboard & progress bars
├── test/
│   ├── e2e/
│   │   ├── test-runner.ts               # Opaque-box E2E test runner
│   │   ├── tier1-feature-coverage.test.ts
│   │   ├── tier2-boundary-cases.test.ts
│   │   ├── tier3-pairwise.test.ts
│   │   ├── tier4-real-world-swarm.test.ts
│   │   ├── consular-consensus.test.ts   # Dual-consul veto & consensus tests
│   │   └── standalone-smoke.test.ts     # SymlinkedAgentSwarm.exe smoke test
├── scripts/
│   ├── build-exe.ps1                    # Standalone .exe build script
│   └── publish-github.ps1               # GitHub repo initialization & push
├── .github/
│   └── workflows/
│       └── release-exe.yml              # GitHub Actions release pipeline
├── package.json
├── tsconfig.json
└── README.md
```

---

## Interface Contracts

### 1. Cubicle Worktree & Junction Contract
- Target directory: `<root>/worktrees/<cubicle_id>` (branch `swarm/<cubicle_id>`)
- Junction 1: `<root>/worktrees/<cubicle_id>/.swarm` -> `<root>/.swarm`
- Junction 2: `<root>/worktrees/<cubicle_id>/.agents` -> `<root>/.agents`
- Windows Implementation: `fs.symlink(target, link, 'junction')`
- Atomic Task Claim: `fs.promises.rename('<root>/.swarm/tasks/todo/<task_id>.json', '<root>/.swarm/tasks/in_progress/<task_id>.json')`

### 2. Thinking-Tier Gating Contract
```typescript
interface CapabilityRule {
  model_pattern: string;
  thinking_tier: 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra';
  can_spawn_subswarm: boolean;
}
// Default Matrix:
// 'Gemini 4 Argon' + 'High' -> true
// 'GPT Astra' + 'Very High' -> false (Restricted!)
// 'GPT Astra' + 'Ultra' -> true
```
- Violation Action: Intercept spawn request, return HTTP 403 `CAPABILITY_RESTRICTION_ERROR`, record structured JSON in `.swarm/logs/incidents.jsonl`, broadcast `INCIDENT_ALERT` to Center Error Feed, and focus Twin Sauron spotlights onto offending cubicle.

### 3. Dual-Consul Consular Governance & Two-Gate Consensus Contract
```typescript
interface ConsulIdentity {
  name: 'Consul Nia Nova' | 'Consul Ferric Lunaux';
  callsign: 'Nia' | 'Ferric';
  archetype: 'UserPreferenceChampion' | 'PragmaticRealist';
  growth_memory_file: '.swarm/memory/nia_growth.json' | '.swarm/memory/ferric_growth.json';
}

interface ConsularDialogueMessage {
  id: string;
  consul: 'Nia' | 'Ferric';
  content: string;
  timestamp: string;
  topic: 'PRE_DISPATCH_PLAN' | 'POST_EXECUTION_REVIEW' | 'DISCIPLINARY' | 'COURIER_PETITION';
}

// Gate 1: Pre-Dispatch Consensus (Method of Approach & Work Split across 16 cubicles)
interface PreDispatchPlanRequest {
  request_id: string;
  user_intent: string;
  proposed_approach: string;
  cubicle_task_split: Array<{ cubicle_id: string; task_description: string }>;
}

interface PreDispatchConsensusResult {
  gate: 'GATE_1_PRE_DISPATCH';
  unanimous_approved: boolean; // true ONLY if both Nia and Ferric vote APPROVE (2/2)
  dialogue: ConsularDialogueMessage[];
  votes: [ConsularVote, ConsularVote];
  action_taken: 'DISPATCH_AUTHORIZED' | 'PLAN_REVISION_REQUIRED';
}

// Gate 2: Post-Execution Consensus (Solution & Push in review/)
interface ConsularReviewRequest {
  task_id: string;
  cubicle_id: string;
  branch: string;
  git_diff: string;
}

interface ConsularVote {
  consul: 'Consul I' | 'Consul II' | 'Nia' | 'Ferric';
  decision: 'APPROVE' | 'VETO';
  rationale: string;
  timestamp: string;
}

interface ConsularConsensusResult {
  gate: 'GATE_2_POST_EXECUTION';
  unanimous_approved: boolean; // true ONLY if both vote APPROVE (2/2)
  votes: [ConsularVote, ConsularVote];
  action_taken: 'MERGED_TO_MAIN' | 'VETO_BLOCKED_AND_REVISED';
}


// 5 Consular Executive & Disciplinary Lifecycle Powers
type ConsularDisciplinaryAction =
  | { type: 'kill_agent'; cubicle_id: string; reason: string; replace_with?: Partial<CubicleConfig> }
  | { type: 'set_thinking_level'; cubicle_id: string; thinking_level: 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra' }
  | { type: 'swap_role'; cubicle_id: string; new_role: 'Implementer' | 'Debugger' | 'Auditor' | 'Refactorer' }
  | { type: 'swap_cubicles'; cubicle_a: string; cubicle_b: string }
  | { type: 'wipe_memory'; cubicle_id: string; preserve_roster: boolean }
  | { type: 'set_access_scope'; cubicle_id: string; allowed_paths: string[]; denied_paths: string[]; memory_scopes: string[] };

// REST Endpoints:
// POST /api/governance/kill
// POST /api/governance/thinking-level
// POST /api/governance/swap
// POST /api/governance/wipe
// POST /api/governance/access-scope
```

### 4. Preference & Vault Contract
- Preference File: `.swarm/memory/preferences.json`
- Rules File: `.agents/rules/USER_PREFERENCES.md`
- Skills Directory: `.agents/skills/<name>/SKILL.md`
- MCP Config: `.agents/mcp/mcp_config.json`
- Instant propagation: Accessible across all cubicle worktrees via `.agents` junction.

### 5. Multi-Monitor & Sync Contract
- URL Routing: `/?panel=all` (Default 3-column), `/?panel=cubicles` (Left Grid), `/?panel=console` (Center Console & Vault), `/?panel=taskboard` (Right Kanban).
- Dual-Bus Synchronization: WebSocket connection to server + browser `BroadcastChannel('panopticon_swarm_sync')` for sub-millisecond inter-window event dispatch.

### 6. Consular Self-Update & Atomic Hot-Swap Contract
```typescript
interface SelfUpdateRequest {
  request_id: string;
  user_prompt: string;
  branch: string;
  status: 'PENDING_REVIEW' | 'VETOED' | 'APPROVED_REBUILDING' | 'SWAP_COMPLETED' | 'FAILED';
  version_before: string;
  version_after?: string;
  votes?: [ConsularVote, ConsularVote];
}
```
- Consular Gate: Requires 2/2 unanimous `APPROVE` from `Consul I` and `Consul II`.
- Veto (`Intercessio`): Single veto blocks self-update, logs to `.swarm/logs/incidents.jsonl`, returns code to cubicles for revision.
- Windows In-Place Safe Atomic Swap Sequence:
  1. Compile updated source to `SymlinkedAgentSwarm.new.exe`
  2. Rename running binary: `SymlinkedAgentSwarm.exe` -> `SymlinkedAgentSwarm.old.exe` (allowed on Windows even while executing)
  3. Atomic move: `SymlinkedAgentSwarm.new.exe` -> `SymlinkedAgentSwarm.exe`
  4. Emit WebSocket event `SELF_UPDATE_READY` for client relaunch.
- REST Endpoints:
  - `POST /api/governance/self-update/initiate`
  - `POST /api/governance/self-update/vote`
  - `GET /api/governance/self-update/status`

### 7. External Agent Courier Gateway Contract
```typescript
interface CourierPetition {
  petition_id: string;
  sender_agent: 'openclaw' | 'hermes' | 'gpt-dot' | string;
  requested_type: 'WISDOM' | 'POWER' | 'BOTH';
  prompt: string;
  context_payload?: Record<string, any>;
  status: 'RECEIVED' | 'CONSULAR_DELIBERATION' | 'SWARM_EXECUTING' | 'SEALED_DONE' | 'VETOED';
  wisdom_response?: string;
  tasks_spawned?: string[];
  sealed_output?: Record<string, any>;
  consular_seal?: {
    approved_by: ['Consul I', 'Consul II'];
    seal_timestamp: string;
  };
}
```
- Transports:
  - REST: `POST /api/courier/petition`, `GET /api/courier/wisdom`, `GET /api/courier/status/:id`, `GET /api/courier/envoys`
  - File Drop: `.swarm/courier/inbox/<id>.json` -> processed -> `.swarm/courier/outbox/<id>.json`
  - CLI: `SymlinkedAgentSwarm.exe courier submit --agent <name> "<task>"`
- Connectors / Skills:
  - `.agents/courier/openclaw/connector.json`
  - `.agents/courier/hermes/connector.json`
  - `.agents/courier/gpt-dot/connector.json`

### 8. Interactive Question & Answer Contract
```typescript
interface ConsularQuestion {
  question_id: string;
  asking_consul: 'Nia' | 'Ferric' | string;
  prompt: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    is_recommended?: boolean;
    media_attachment?: { type: 'pdf' | 'image' | 'video'; url: string };
  }>;
  is_multi_select: boolean;
  allow_custom_write_in: boolean; // default true
  status: 'PENDING' | 'ANSWERED' | 'SKIPPED';
  user_response?: {
    selected_option_ids: string[];
    custom_write_in?: string;
    answered_at: string;
  };
}
```
- REST Endpoints:
  - `GET /api/governance/questions`
  - `POST /api/governance/questions`
  - `POST /api/governance/questions/:id/answer`
- WebSocket Event: `CONSULAR_QUESTION_ASKED`, `CONSULAR_QUESTION_ANSWERED`
- Evolving Memory: Submitting answers updates Nia's preference store (`.swarm/memory/nia_growth.json` and `.agents/rules/USER_PREFERENCES.md`).

### 9. Corner Consular Avatar & 12-Scenario Animation Suite Contract
- Location: Corner of the Center Chat Prompt area (`src/public/js/consular-avatars.js`, `src/public/css/consular-avatars.css`).
- Personas & Models:
  - **Consul Nia Nova ("Nia")**: Mid-20s, physical appearance inspired by League of Legends' **Lux** (blonde hair styled with radiant prismatic energy accents adapted into cyberpunk aesthetic), expressive eyes, confident/defiant smirk, animated speaking and impatient foot-tapping/glaring. Dressed in industrial brutalist dystopian consular techwear.
  - **Consul Ferric Lunaux ("Ferric")**: Late-30s weathered realist, physical appearance inspired by League of Legends' **Lucian** (Black sentinel in late 30s with tied-back locs/dreadlocks, high-collared armored consular coat), **arms crossed and looking grumpy** with a stern scowl and furrowed brow. Dressed in heavy brutalist cybersecurity armor/coat matching UI tone.
  - **Artistic Style & Clothing Tone**: Strictly adheres to the dark Brutalist Dystopian Cyberpunk Panopticon UI theme (sharp `0px` borders, obsidian, crimson, amber, phosphor accents, monospace telemetry) rather than fantasy outfits.
- 12-Scenario Animation State Machine:
  1. `idle_observing`: Ferric crosses arms looking grumpy; Nia leans forward with a rebellious smirk.
  2. `debating`: Animated mouth movement, talking gestures, and synced dialogue.
  3. `wrestling_fistfight`: Fingers interlocked, grappling/wrestling with gritted teeth and flying sparks on prolonged debate/deadlock.
  4. `nia_impatient`: Nia taps impatiently with glowing annoyed eyes pointing at slow cubicle while Ferric sighs and pinches nose.
  5. `disciplinary_execution`: Crimson glowing eyes, Ferric gives Roman thumb-down (`Pollice Verso`), Nia hits eject switch.
  6. `consensus_celebration`: Nia grins and offers fist-bump; grumpy Ferric reluctantly bumps her fist with a tiny nod while keeping one arm crossed.
  7. `veto_clash`: Vetoing Consul slams down glowing red `VETO` shield; other glares.
  8. `error_alarm`: Red siren strobe flashes across avatar box; Ferric scans telemetry, Nia's visor/hair flares.
  9. `gladiator_spectators`: Nia cheers from balcony; Ferric watches through tactical binoculars comparing competing cubicles.
  10. `courier_arrival`: Nia waves to Courier hologram; Ferric squints and inspects Courier's seal.
  11. `self_evolution_upgrade`: Cybernetic wireframe/energy surge around both avatars as `.exe` recompiles.
  12. `night_shift_afk`: Dimmed night-watch lighting; Ferric drinks black coffee under lamp; Nia wears headphones auto-answering questions.
- WebSocket / Event Dispatch:
  - Event: `CONSULAR_AVATAR_STATE` (`{ state: ConsularAvatarScenario, debate_turns?: number, details?: string }`).
  - Type: `type ConsularAvatarScenario = 'idle_observing' | 'debating' | 'wrestling_fistfight' | 'nia_impatient' | 'disciplinary_execution' | 'consensus_celebration' | 'veto_clash' | 'error_alarm' | 'gladiator_spectators' | 'courier_arrival' | 'self_evolution_upgrade' | 'night_shift_afk';`
