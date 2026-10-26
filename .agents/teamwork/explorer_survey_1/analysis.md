# Architectural Survey & Technical Design Report: Symlinked Agent Swarm Engine

**Author**: Explorer Survey 1  
**Date**: 2026-10-26  
**Target System**: Symlinked Agent Swarm & Panopticon Overseer  
**Host Platform**: Windows 11 (NTFS) with POSIX Fallback  
**Reference Document**: `ORIGINAL_REQUEST.md` (R1, R2, R3 & Follow-Up)

---

## 1. Executive Summary & System Overview

The **Symlinked Agent Swarm System** is a high-density, multi-agent autonomous engineering engine governed by a central **"Eye of Sauron" Overseer** monitoring a 4x4 spatial grid of **16 worker cubicles** (`cubicle-01` through `cubicle-16`). The system solves three fundamental challenges in concurrent multi-agent software engineering:

1. **State Fragmentation vs. Code Isolation**: Traditional multi-agent systems either run in a single dirty working directory (causing destructive file overwrites and Git merge hell) or run in isolated containers without shared live state. Symlinked Agent Swarm decouples repository code from swarm coordination: each active cubicle executes inside its own dedicated **Git Worktree** on a per-cubicle branch (`swarm/cubicle-XX`), while all task coordination, sub-swarm trees, telemetry, and shared preferences are unified via **NTFS Directory Junctions** (`.swarm/` and `.agents/`) linked directly into every worktree root.
2. **Unchecked Sub-Agent Explosion**: Giving autonomous sub-swarm spawning capabilities to lower-tier reasoning models leads to circular diff loops, infinite task decomposition, and rapid quota burnout. We introduce a **Thinking-Tier Capability Matrix** that strictly gates recursive sub-swarm generation based on verified model reasoning depth (e.g. `Gemini 4 Argon (High)` and `GPT Astra (Ultra)` authorized; `GPT Astra (Very High)` strictly restricted).
3. **Lock-Free Concurrency on Windows**: By utilizing atomic filesystem rename operations on the shared NTFS volume (`tasks/todo/` -> `tasks/in_progress/`), 16 simultaneous worker processes and nested sub-swarms claim tasks with zero lock contention, zero database overhead, and complete immunity to stale lockfile deadlocks.

```
+----------------------------------------------------------------------------------------------------+
|                                    CENTRAL OVERSEER AGENT                                          |
|                                    ("The Eye of Sauron")                                           |
|                   Overseer Chat Console | Panopticon Error & Incident Dispatcher                   |
+----------------------------------------------------------------------------------------------------+
                                                  |
                     +----------------------------+----------------------------+
                     |                                                         |
         [Root Repos & Storage]                                     [4x4 Cubicle Grid Bus]
         .swarm/ (Tasks, Status, Logs)                               16 Worker Cubicles (R1)
         .agents/ (Rules, Skills, MCPs)                             Thinking-Tier Gated (R2)
                     |                                                         |
  +------------------+------------------+                    +-----------------+-----------------+
  |                  |                  |                    |                 |                 |
Worktree 01        Worktree 02        Worktree 03          Cubicle 01        Cubicle 02        Cubicle 03
(swarm/cubicle-01) (swarm/cubicle-02) (swarm/cubicle-03)   Gemini Argon(High) Gemini Argon(High) GPT Astra(VeryHigh)
[Junction .swarm]  [Junction .swarm]  [Junction .swarm]    [Sub-Swarm OK]    [Sub-Swarm OK]    [RESTRICTED]
[Junction .agents] [Junction .agents] [Junction .agents]
```

---

## 2. 16-Cubicle Worker Grid State & Pluggable CLI/API Roster (R1)

### 2.1 Spatial Grid Topology & Initial Pre-Configuration

The worker grid consists of 16 discrete cubicle slots arranged in a 4x4 matrix, numbered `cubicle-01` to `cubicle-16`.

```
+------------------+------------------+------------------+------------------+
|   cubicle-01     |   cubicle-02     |   cubicle-03     |   cubicle-04     |
| Gemini 4 Argon   | Gemini 4 Argon   | GPT Astra        |                  |
| (High)           | (High)           | (Very High)      | [BLANK / VACANT] |
| Sub-Swarm: YES   | Sub-Swarm: YES   | Sub-Swarm: NO    |                  |
+------------------+------------------+------------------+------------------+
|   cubicle-05     |   cubicle-06     |   cubicle-07     |   cubicle-08     |
| [BLANK / VACANT] | [BLANK / VACANT] | [BLANK / VACANT] | [BLANK / VACANT] |
+------------------+------------------+------------------+------------------+
|   cubicle-09     |   cubicle-10     |   cubicle-11     |   cubicle-12     |
| [BLANK / VACANT] | [BLANK / VACANT] | [BLANK / VACANT] | [BLANK / VACANT] |
+------------------+------------------+------------------+------------------+
|   cubicle-13     |   cubicle-14     |   cubicle-15     |   cubicle-16     |
| [BLANK / VACANT] | [BLANK / VACANT] | [BLANK / VACANT] | [BLANK / VACANT] |
+------------------+------------------+------------------+------------------+
```

#### Pre-Configured Default Roster:
- **`cubicle-01`**:
  - `brand`: `"Gemini"`
  - `model`: `"gemini-4-argon"`
  - `display_name`: `"Gemini 4 Argon (High)"`
  - `thinking_level`: `"High"` (16,000 token reasoning budget)
  - `can_spawn_subswarm`: `true`
  - `enabled`: `true`
  - `quota_tokens`: `2,000,000`
  - `tokens_remaining`: `2,000,000`
  - `status`: `"idle"`
- **`cubicle-02`**:
  - `brand`: `"Gemini"`
  - `model`: `"gemini-4-argon"`
  - `display_name`: `"Gemini 4 Argon (High)"`
  - `thinking_level`: `"High"` (16,000 token reasoning budget)
  - `can_spawn_subswarm`: `true`
  - `enabled`: `true`
  - `quota_tokens`: `2,000,000`
  - `tokens_remaining`: `2,000,000`
  - `status`: `"idle"`
- **`cubicle-03`**:
  - `brand`: `"GPT / OpenAI"`
  - `model`: `"gpt-astra"`
  - `display_name`: `"GPT Astra (Very High)"`
  - `thinking_level`: `"Very High"` (32,000 token reasoning budget)
  - `can_spawn_subswarm`: `false` (*Strictly restricted from spawning sub-swarms*)
  - `enabled`: `true`
  - `quota_tokens`: `1,500,000`
  - `tokens_remaining`: `1,500,000`
  - `status`: `"idle"`
- **`cubicle-04` through `cubicle-16`**:
  - `brand`: `null`
  - `model`: `null`
  - `display_name`: `"Unassigned Slot"`
  - `thinking_level`: `"Medium"`
  - `can_spawn_subswarm`: `false`
  - `enabled`: `false`
  - `status`: `"vacant"`

---

### 2.2 Cubicle Lifecycle State Machine

Each cubicle transitions through a deterministic state machine observed by the Overseer and rendered in the Panopticon UI:

```
                  +--------------+
                  |    VACANT    |
                  +--------------+
                         | (Configured & Enabled)
                         v
                  +--------------+
       +--------->|     IDLE     |<---------+
       |          +--------------+          |
       |                 | (Claim Task)     |
       |                 v                  |
       |          +--------------+          |
       |          |   WORKING    |          |
       |          +--------------+          |
       |           /      |     \           |
(Task  |   (Inspect)  (Crash)  (Success)    | (Reset/Retry)
Done)  |         /        |       \         |
       |        v         v        +--------+
       | +------------+ +------------+
       +-| UNDER_INSP | |   ERROR    |
         +------------+ +------------+
                |              |
                v              v
        +-----------------------------+
        |     EXHAUSTED / FLATLINED   | (Quota = 0 or Fatal Crash)
        +-----------------------------+
```

#### State Definitions:
1. **`vacant`**: Cubicle is unconfigured or disabled. The UI renders an empty industrial desk with faint amber outline. Does not poll or claim tasks.
2. **`idle`**: Worker is initialized, healthy, and polling `.swarm/tasks/todo/`. The UI renders the AI mascot in a relaxed/standby breathing animation.
3. **`working`**: Worker is executing a task or command. The UI renders aggressive industrial telemetry, typing animation, live thought ticker, and **orbiting sub-swarm drones** if running child micro-workers.
4. **`under_inspection`**: Overseer Eye of Sauron spotlight has locked onto the cubicle to audit code diffs or review completed task deliverables.
5. **`error`**: Worker command failed, verification test broke, or capability violation was triggered. Telemetry flashes critical crimson. Worker enters flatlined/alarm posture.
6. **`exhausted`**: Usage quota has reached 0%. Worker is physically incapacitated (slumped over desk, warning strobe). Must be replenished or reset by user/Overseer.

---

### 2.3 Pluggable AI Brand/Provider Specification & CLI Templating

To support arbitrary providers, local LLMs, and custom scripts, the system implements a pluggable driver layer with variable interpolation.

#### Supported Brands:
- **`Gemini`**: Google GenAI SDK or Gemini CLI (`gemini run`). Supports structured output, thinking configuration (`thinkingConfig: { thinkingBudget: N }`).
- **`GPT / OpenAI`**: OpenAI SDK or CLI (`chatgpt / openai`). Supports reasoning effort (`low`, `medium`, `high`).
- **`Claude / Anthropic`**: Anthropic SDK or Claude Code CLI (`claude`). Supports extended thinking tokens (`thinking: { type: "enabled", budget_tokens: N }`).
- **`DeepSeek`**: DeepSeek API or Ollama/vLLM CLI for DeepSeek-R1. Native reasoning tokens.
- **`Custom CLI`**: Universal command wrapper for local models, shell scripts, Python runners, or Docker containers.

#### CLI Template Engine & Interpolation Variables:
When launching an agent task via CLI, command templates are evaluated with safe parameter escaping:

| Variable | Description | Example Value |
|---|---|---|
| `{{prompt}}` | Verbatim task description and instructions | `"Refactor auth router"` |
| `{{prompt_file}}` | Absolute path to temporary task instructions file | `C:\...\.swarm\tasks\tmp\t-01.txt` |
| `{{model}}` | Model identifier string | `"gemini-4-argon"` |
| `{{thinking_level}}` | Symbolic thinking tier | `"High"` |
| `{{thinking_budget}}` | Numeric thinking budget in tokens | `16000` |
| `{{worktree_dir}}` | Working directory for the cubicle's Git worktree | `H:\...\worktrees\cubicle-01` |
| `{{task_id}}` | Unique task ID | `"task-2026-0042"` |
| `{{cubicle_id}}` | Assigned cubicle identifier | `"cubicle-01"` |
| `{{api_key}}` | Injected API key for the provider | `sk-ant-...` |

#### Example CLI Command Templates:
1. **Gemini CLI**:
   ```powershell
   gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file "{{prompt_file}}" --dir "{{worktree_dir}}"
   ```
2. **Claude Code CLI**:
   ```powershell
   claude --model {{model}} --dangerously-skip-permissions --workdir "{{worktree_dir}}" -p "{{prompt}}"
   ```
3. **Custom Local Python Agent**:
   ```powershell
   python.exe scripts/run_local_agent.py --cubicle {{cubicle_id}} --task {{task_id}} --worktree "{{worktree_dir}}"
   ```

---

### 2.4 Quota Tracking & Fatigue Modeling

Each cubicle maintains fine-grained usage statistics updated on every tool invocation or response chunk.

$$\text{Stamina \%} = \max\left(0, \min\left(100, \left(1 - \frac{\text{Tokens Used}}{\text{Token Quota}}\right) \times 100\right)\right)$$

#### Fatigue Posture Mapping:
- **100% – 65% (Energized)**: Normal posture, green/cyan phosphor UI glow, fast thought stream updates.
- **64% – 30% (Fatigued)**: Slight slouch, amber/yellow UI glow, perspiration animation, steady thought ticker.
- **29% – 1% (Critical Strain)**: Heavy slouch, crimson/orange UI glow, warning ticker: `"CRITICAL QUOTA DEPLETION"`.
- **0% (Exhausted / Flatlined)**: Worker collapses onto console, crimson CRT static, locked out of claiming new tasks.

---

## 3. Thinking-Tier-Gated Sub-Swarm Spawning Architecture (R2)

### 3.1 Motivation & Capability Matrix

Autonomous recursive sub-agents are powerful for decomposing large engineering tasks (e.g. implementing frontend, backend, and database schema in parallel). However, recursive decomposition requires **deep meta-reasoning** to:
1. Accurately split tasks into orthogonal sub-problems without race conditions.
2. Formulate rigorous interface contracts between sub-workers.
3. Synthesize child Git patches and resolve conflicting diffs.

When applied to models with insufficient thinking budgets or weak planning capabilities, sub-agent decomposition degrades into infinite loops, duplicate edits, or corrupt worktree state. We enforce a **strict capability gate**:

| AI Brand & Model | Thinking Level | Token Budget | `can_spawn_subswarm` | Gate Status | Rationale |
|---|---|---|---|---|---|
| **Gemini 4 Argon** | `High` | 16,000+ | **`true`** | **Authorized** | Default Cubicles 1 & 2. SOTA multi-step reasoning & code planning. |
| **GPT Astra** | `Ultra` | 64,000+ | **`true`** | **Authorized** | Top-tier recursive decomposition & synthesis capability. |
| **GPT Astra** | `Very High` | 32,000 | **`false`** | **RESTRICTED** | Default Cubicle 3. Restricted to single-worker execution to prevent drift. |
| **Claude 3.7 Sonnet** | `High` / `Ultra` | 16,000 – 64,000 | **`true`** | **Authorized** | Extended thinking mode validated for multi-file architecture. |
| **DeepSeek R1** | `High` | 16,000+ | **`true`** | **Authorized** | Mathematical & algorithmic decomposition verified. |
| *Any Model* | `Medium` / `Low` | < 8,000 | **`false`** | **RESTRICTED** | Insufficient planning horizon for recursive delegation. |
| *Custom CLI* | *Configurable* | N/A | *Manual Toggle* | User Defined | Overridable in cubicle settings modal. |

---

### 3.2 Sub-Swarm Storage Hierarchy & Child Worker Topology

All sub-swarm state is partitioned under `.swarm/subswarms/<cubicle-id>/` to prevent cross-cubicle collisions:

```
.swarm/
└── subswarms/
    ├── cubicle-01/
    │   ├── manifest.json             # Sub-swarm topology, goal, and status
    │   ├── subtasks/
    │   │   ├── subtask-01.json       # Child task: "API router implementation"
    │   │   ├── subtask-02.json       # Child task: "Vite UI component"
    │   │   └── subtask-03.json       # Child task: "Unit test suite"
    │   ├── telemetry/
    │   │   ├── child-worker-01.log
    │   │   ├── child-worker-02.log
    │   │   └── child-worker-03.log
    │   └── patches/
    │       ├── subtask-01.patch      # Git diff output from Child 1
    │       ├── subtask-02.patch      # Git diff output from Child 2
    │       └── subtask-03.patch      # Git diff output from Child 3
    └── cubicle-02/
        └── ...
```

---

### 3.3 Execution, Consolidation & Branch Integration Flow

1. **Decomposition**: Parent worker in `cubicle-01` receives parent task `task-101.json`. With `can_spawn_subswarm: true`, it creates `.swarm/subswarms/cubicle-01/manifest.json` and decomposes the task into 3 child specifications.
2. **Parallel Micro-Workers**: The engine spawns 3 lightweight ephemeral child worker processes. Each child worker operates within a designated subdirectory or produces an isolated Git patch file in `patches/subtask-XX.patch`.
3. **Consolidation**: Once all child sub-tasks enter `completed`, the parent cubicle process:
   - Evaluates each patch using `git apply --check`.
   - Applies patches sequentially to the cubicle's worktree branch (`swarm/cubicle-01`).
   - Runs integration verification tests.
   - Commits the consolidated changeset to `swarm/cubicle-01`.
   - Transitions parent task to `review/`.
4. **UI Visual Feedback**: While child workers are active, the cubicle card in the Left Panopticon Grid renders **animated orbiting sub-swarm drone icons** around the central AI mascot, with a sub-progress indicator `[3/3 drones active]`.

---

### 3.4 Capability Violation Interception & Incident Dispatch

If a restricted cubicle (specifically `cubicle-03` running `GPT Astra (Very High)`) attempts to invoke `spawn_subswarm()` or write to `.swarm/subswarms/`:

```
[RESTRICTED CUBICLE: cubicle-03]
                |
                | (Attempts Sub-Swarm Spawning)
                v
    [CAPABILITY GATE ENFORCER]
                |
                +---> [BLOCKED: Operation Aborted with EACCES]
                |
                +---> [Write Incident to .swarm/logs/incidents.jsonl]
                |
                +---> [WebSocket Broadcast: CAPABILITY_VIOLATION]
                |
                v
+-------------------------------------------------------------------+
| PANOPTICON SYSTEM REACTION:                                       |
| 1. Center Error Feed: High-contrast red flash banner.            |
| 2. Sauron Eye: Rotates & locks spotlight on Cubicle 03.           |
| 3. Overseer Chat: Emits security warning message.                 |
| 4. Cubicle State: Switches to "error" with flatlined animation.   |
+-------------------------------------------------------------------+
```

#### Structured Incident Log Schema (`.swarm/logs/incidents.jsonl`):
```json
{
  "timestamp": "2026-10-26T00:18:24.102Z",
  "incident_id": "INC-2026-0891",
  "cubicle_id": "cubicle-03",
  "model": "gpt-astra",
  "thinking_level": "Very High",
  "violation_type": "UNAUTHORIZED_SUBSWARM_SPAWN",
  "message": "Cubicle 03 (GPT Astra Very High) attempted to initialize a sub-swarm. Gated by capability matrix.",
  "action_taken": "BLOCKED_AND_ISOLATED",
  "user_actions": [
    { "label": "Upgrade to Ultra", "action": "UPGRADE_MODEL", "target_tier": "Ultra" },
    { "label": "Force Solo Worker", "action": "CONVERT_TO_SOLO" },
    { "label": "Override Gate", "action": "MANUAL_BYPASS" }
  ]
}
```

---

## 4. Isolated Git Worktrees with Symlinked Shared `.swarm/` and `.agents/` (R3 & Follow-Up)

### 4.1 Git Worktree Lifecycle & Branch Isolation

To prevent file collision between 16 parallel agents, each cubicle receives an isolated **Git Worktree**:

```
<project-root>/
├── .git/                          # Master Git repository database
├── .swarm/                        # Shared swarm state (Tasks, Status, Logs)
├── .agents/                       # Shared agent state (Rules, Skills, MCPs)
├── src/                           # Main working tree source
└── worktrees/                     # Dedicated worktree directory
    ├── cubicle-01/                # Branch: swarm/cubicle-01
    │   ├── .git                   # Git pointer file -> <root>/.git/worktrees/cubicle-01
    │   ├── .swarm/                # [NTFS Junction -> <root>/.swarm]
    │   ├── .agents/               # [NTFS Junction -> <root>/.agents]
    │   └── src/                   # Independent files modified by Cubicle 1
    ├── cubicle-02/                # Branch: swarm/cubicle-02
    │   ├── .git
    │   ├── .swarm/                # [NTFS Junction -> <root>/.swarm]
    │   ├── .agents/               # [NTFS Junction -> <root>/.agents]
    │   └── src/
    └── cubicle-03/                # Branch: swarm/cubicle-03
        ├── ...
```

#### Provisioning Workflow:
```powershell
# 1. Ensure target cubicle branch exists
git branch swarm/cubicle-01 main

# 2. Add isolated worktree
git worktree add worktrees/cubicle-01 swarm/cubicle-01

# 3. Create NTFS Directory Junctions (Zero-privilege)
cmd.exe /c mklink /J "worktrees\cubicle-01\.swarm" ".swarm"
cmd.exe /c mklink /J "worktrees\cubicle-01\.agents" ".agents"
```

---

### 4.2 Windows Directory Junctions (`mklink /J`) vs. Symlinks: The Zero-Privilege Rule

A critical pitfall in Windows development is privilege requirements for symbolic links:

| Link Mechanism | Windows API / Command | Administrator Required? | Developer Mode Required? | NTFS Native Reparse Point? | Cross-Volume Support? |
|---|---|---|---|---|---|
| **Directory Junction** | `mklink /J <link> <target>` | **NO** | **NO** | **YES** (`IO_REPARSE_TAG_MOUNT_POINT`) | Local drives only (e.g. `H:` to `H:`) |
| **Directory Symlink** | `mklink /D <link> <target>` | **YES** (by default) | **YES** (if unprivileged) | **YES** (`IO_REPARSE_TAG_SYMLINK`) | Yes (including network shares) |
| **POSIX Symlink** | `ln -s <target> <link>` | NO | N/A | Linux/macOS VFS | Yes |

#### Crucial Architectural Decision:
Because standard Windows users do **not** run shells as Administrator and often have Developer Mode disabled, **Directory Junctions (`/J`) are mandatory on Windows**. They work out-of-the-box without elevation on any NTFS volume.

#### Programmatic Implementation Across Runtimes:
- **Node.js (Built-in)**:
  ```typescript
  import fs from 'node:fs/promises';
  import path from 'node:path';

  export async function createSharedJunction(targetDir: string, linkDir: string): Promise<void> {
    if (process.platform === 'win32') {
      // 'junction' type automatically invokes CreateSymbolicLinkW / FSCTL_SET_REPARSE_POINT without admin!
      await fs.symlink(path.resolve(targetDir), path.resolve(linkDir), 'junction');
    } else {
      await fs.symlink(path.resolve(targetDir), path.resolve(linkDir), 'dir');
    }
  }
  ```
- **PowerShell Fallback**:
  ```powershell
  New-Item -ItemType Junction -Path "$worktreePath\.swarm" -Target "$rootPath\.swarm" -Force
  New-Item -ItemType Junction -Path "$worktreePath\.agents" -Target "$rootPath\.agents" -Force
  ```

---

### 4.3 Shared `.agents/` Propagation & "Never Explain Twice" (Follow-Up Requirement)

Per the user follow-up update, `.agents/` is symlinked alongside `.swarm/`. This architecture solves the continuous preference learning and MCP vault synchronization problem:

1. **Global Rule Mirroring**:
   - When the user states a rule to the Overseer in the Center Console (e.g., *"Always write unit tests with 100% assertions and no mocks"*), the Overseer appends it to:
     - `.swarm/memory/preferences.json` (Structured JSON representation)
     - `.agents/rules/USER_PREFERENCES.md` (Human- and agent-readable Markdown)
2. **Instant Zero-Latency Inheritance**:
   - Because `<worktree>/.agents` is an NTFS junction to `<root>/.agents`, every one of the 16 cubicles immediately sees the updated `USER_PREFERENCES.md` without any Git pull, branch rebasing, or IPC broadcast!
3. **Overseer Skill & MCP Generator**:
   - When the Overseer synthesizes a reusable skill or tool, it writes to:
     - `.agents/skills/<skill-name>/SKILL.md`
     - `.agents/mcp/<server-name>/tool.json` and `.agents/mcp/mcp_config.json`
   - Active cubicle agents immediately access the new skill or tool directly in their local working directory via `.agents/skills/`.

---

### 4.4 Lock-Free Atomic Task Claiming via File Moves

Task claiming across 16 parallel workers must be strictly thread-safe, process-safe, and free from deadlocks.

```
.swarm/tasks/
├── todo/
│   ├── task-01.json
│   ├── task-02.json
│   └── task-03.json
├── in_progress/
│   ├── task-01-cubicle-01.json
│   └── task-02-cubicle-02.json
├── review/
│   └── task-04-cubicle-01.json
└── done/
    └── task-00.json
```

#### Atomic Claiming Protocol:
Instead of maintaining a separate lock file or coordinating through a centralized database, claiming leverages **atomic filesystem renames** (`rename(oldPath, newPath)`):

```typescript
export async function claimTask(cubicleId: string, todoTaskId: string): Promise<boolean> {
  const src = path.join(SWARM_DIR, 'tasks', 'todo', `${todoTaskId}.json`);
  const dst = path.join(SWARM_DIR, 'tasks', 'in_progress', `${todoTaskId}-${cubicleId}.json`);

  try {
    // ATOMIC MOVE: Under Windows NTFS, MoveFileExW with MOVEFILE_WRITE_THROUGH is atomic at the MFT directory entry level.
    // If two cubicles execute rename() on the exact same microsecond:
    // EXACTLY ONE succeeds. The loser receives ENOENT (file not found).
    await fs.rename(src, dst);

    // Winner reads, tags assignment, and writes back
    const raw = await fs.readFile(dst, 'utf8');
    const task = JSON.parse(raw);
    task.status = 'in_progress';
    task.assigned_cubicle = cubicleId;
    task.claimed_at = new Date().toISOString();
    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');

    return true; // Claim succeeded
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // Task was claimed by another worker a split-second earlier; back off gracefully
      return false;
    }
    throw err;
  }
}
```

#### Concurrency & Failure Invariants:
1. **Zero Double-Claims**: No two cubicles can ever claim the same task. The filesystem guarantees uniqueness.
2. **Crash Resilience**: If a cubicle crashes while processing, the task remains in `tasks/in_progress/<task>-<cubicle>.json`. The Overseer detects the heartbeat timeout, moves the file back to `tasks/todo/`, and resets the state. No orphaned lockfiles exist to poison the queue.

---

## 5. System Runtime & Technology Stack Recommendation

### 5.1 Candidate Runtime Evaluation

To fulfill R4 (Brutalist Panopticon UI + multi-monitor) and R5 (Standalone Windows `.exe` `SymlinkedAgentSwarm.exe`), we evaluate three candidate runtimes against strict technical criteria:

| Evaluation Criterion | Candidate A: Node.js / TypeScript (Fastify + ws + Vite) | Candidate B: Python (FastAPI + WebSockets) | Candidate C: Go / Rust (Native Engine + WebView) |
|---|---|---|---|
| **Windows Directory Junctions** | **Native**: `fs.symlink(target, link, 'junction')` built into standard library without elevation. | **Requires C-bindings**: `_winapi.CreateJunction` or `ctypes` calling Win32 API. | **Native Win32**: Requires `DeviceIoControl` with `FSCTL_SET_REPARSE_POINT`. |
| **Atomic File Renames** | **Native**: `fs.promises.rename` guarantees POSIX & NTFS atomic rename. | **Native**: `os.rename` / `os.replace`. | **Native**: `std::fs::rename` / `os.Rename`. |
| **Reactive WebSocket Bus** | **Ultra-Low Latency**: `ws` handles 100k msgs/sec; seamless broadcast across 1..X detached browser windows. | High latency under heavy event load; asyncio event loop overhead. | Extremely fast, but complex client serialization and multi-window state management. |
| **Standalone Windows `.exe` Packaging** | **Excellent**: `@yao-pkg/pkg` or Node 20+ Single Executable Application (SEA) creates clean `SymlinkedAgentSwarm.exe` with zero runtime dependencies. | **Problematic**: PyInstaller unpacks 150MB of `.pyc` and `.dll` to `%TEMP%` on every run, high antivirus false positives. | **Outstanding**: Single static binary 15-25MB, instant startup. |
| **UI Development & Brutalist Shader Pipeline** | **Native Web Tech**: HTML5 Canvas, SVG Eye of Sauron spotlight, CSS scanlines, pop-out multi-window sync. | Requires embedding local web server and orchestrating external browser. | Requires embedding Webview2 or serving local web assets from embedded bytes. |
| **Development Velocity & Maintainability** | **Highest**: Unified TypeScript across backend taskboard engine, WebSocket protocols, and UI state models. | Moderate: Dual-stack (Python backend + JS frontend). | Low: High boilerplate for process pipelines and dynamic CLI templates. |

---

### 5.2 Recommended Architecture & Bill of Materials

We definitively recommend **Node.js + TypeScript** as the core host runtime, structured as follows:

```
                          [SymlinkedAgentSwarm.exe]
                                     |
    +--------------------------------+--------------------------------+
    |                                                                 |
[Core Engine Services]                                      [Embedded Web Server]
- Cubicle Grid Manager (16 slots)                           - Fastify HTTP Engine
- Sub-Swarm Orchestrator & Gatekeeper                       - High-Performance 'ws' WebSocket Hub
- Git Worktree & Junction Provisioner                       - Embedded Static Assets (Panopticon UI)
- Atomic Task Queue Engine                                            |
- Preference Learning & MCP Generator                                 | (WebSocket Events)
                                                                      v
                                                            [Panopticon HUD Client]
                                                            - Main Dashboard (3 columns)
                                                            - Detached Pop-Out Windows (?panel=...)
                                                            - Eye of Sauron SVG Spotlight
```

#### Production Bill of Materials (BOM):
1. **Host Backend**: Node.js 20+ LTS / TypeScript 5.x.
2. **HTTP & API Framework**: `Fastify` (fastest Node HTTP server, low memory footprint).
3. **Real-Time Event Bus**: `ws` (WebSocket server) with JSON-RPC telemetry broadcast.
4. **Git Engine**: Direct execution of Git CLI via `child_process.spawn` (avoids buggy libgit2 worktree bugs).
5. **UI Frontend**: Vanilla modern HTML5 + TypeScript + CSS Grid/Flexbox + HTML5 Canvas / SVG (zero heavy framework bloat, sub-50ms render latency, instant multi-monitor pop-out instantiation).
6. **Packaging Toolchain**: `@yao-pkg/pkg` targeting `node20-win-x64` to compile the entire project into a self-contained `SymlinkedAgentSwarm.exe`.

---

## 6. Comprehensive Data Schemas & TypeScript Contracts

### 6.1 Cubicle Grid & Configuration Schema (`cubicle.ts`)

```typescript
export type AIBrand = 'Gemini' | 'GPT / OpenAI' | 'Claude / Anthropic' | 'DeepSeek' | 'Custom CLI';

export type ThinkingLevel = 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra';

export type CubicleStatus = 'vacant' | 'idle' | 'working' | 'under_inspection' | 'error' | 'exhausted';

export interface CubicleConfig {
  id: string; // e.g., 'cubicle-01' through 'cubicle-16'
  slot_index: number; // 0 to 15 (row = floor(index/4), col = index % 4)
  enabled: boolean;
  brand: AIBrand | null;
  model: string | null; // e.g., 'gemini-4-argon', 'gpt-astra'
  display_name: string;
  thinking_level: ThinkingLevel;
  thinking_budget_tokens: number; // e.g., 16000
  can_spawn_subswarm: boolean; // Capability matrix flag
  cli_template: string; // e.g., "gemini run --model {{model}} --prompt-file {{prompt_file}}"
  api_key_env_var: string; // e.g., "GEMINI_API_KEY"
  quota: {
    max_tokens: number;
    tokens_used: number;
    max_cost_usd: number;
    cost_usd_accumulated: number;
  };
}

export interface CubicleLiveState {
  config: CubicleConfig;
  status: CubicleStatus;
  current_task_id: string | null;
  active_subswarm_id: string | null;
  surface_thoughts: string; // Live speech/thought ticker
  fatigue_percentage: number; // 0 (flatlined) to 100 (energized)
  last_heartbeat: string; // ISO 8601 UTC timestamp
  worktree_path: string;
  branch_name: string; // 'swarm/cubicle-XX'
}
```

---

### 6.2 Task & Taskboard Schema (`task.ts`)

```typescript
export type TaskColumn = 'todo' | 'in_progress' | 'review' | 'done';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SwarmTask {
  id: string; // e.g. "task-2026-0001"
  title: string;
  description: string;
  priority: TaskPriority;
  column: TaskColumn;
  assigned_cubicle: string | null; // 'cubicle-01' ... 'cubicle-16'
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  progress_percent: number; // 0 to 100
  subswarm_active: boolean;
  subswarm_manifest_path: string | null;
  git_branch: string | null;
  git_diff_summary: {
    files_changed: number;
    insertions: number;
    deletions: number;
  } | null;
  verification_commands: string[]; // e.g. ["npm test", "git status"]
  verification_passed: boolean | null;
  error_log: string | null;
}
```

---

### 6.3 Sub-Swarm Hierarchy Schema (`subswarm.ts`)

```typescript
export interface SubtaskNode {
  subtask_id: string; // e.g. "subtask-01"
  title: string;
  instructions: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  assigned_child_worker: string; // e.g. "child-01"
  patch_file: string; // relative to .swarm/subswarms/<cubicle>/patches/
  progress_percent: number;
}

export interface SubswarmManifest {
  cubicle_id: string; // Parent cubicle
  parent_task_id: string;
  goal: string;
  created_at: string;
  status: 'planning' | 'executing' | 'consolidating' | 'completed' | 'failed';
  subtasks: SubtaskNode[];
  consolidation_strategy: 'sequential_patch' | 'squash_merge';
  verification_test_command: string;
}
```

---

### 6.4 Panopticon Real-Time WebSocket Event Bus (`events.ts`)

```typescript
export type PanopticonEventType =
  | 'CUBICLE_STATE_UPDATED'
  | 'SAURON_FOCUS_TARGET'
  | 'TASK_CLAIMED'
  | 'TASK_PROGRESS_UPDATED'
  | 'TASK_MOVED'
  | 'CAPABILITY_VIOLATION'
  | 'SUBSWARM_SPAWNED'
  | 'SUBSWARM_UPDATED'
  | 'INCIDENT_LOGGED'
  | 'PREFERENCE_LEARNED'
  | 'SKILL_GENERATED';

export interface PanopticonEvent<T = any> {
  type: PanopticonEventType;
  timestamp: string;
  source: 'overseer' | 'cubicle_grid' | 'taskboard' | 'worktree_engine';
  payload: T;
}
```

---

## 7. Actionable Implementation Blueprint for Downstream Builders

### Phase 1: Core File & Directory Provisioning
1. Initialize `.swarm/` directory structure:
   - `tasks/todo/`, `tasks/in_progress/`, `tasks/review/`, `tasks/done/`
   - `subswarms/`
   - `status/` (Stores `cubicle-XX.json` heartbeats)
   - `logs/` (Stores `incidents.jsonl` and execution logs)
   - `memory/preferences.json`
2. Initialize `.agents/` directory structure:
   - `rules/USER_PREFERENCES.md`
   - `skills/`
   - `mcp/`
3. Generate initial seed tasks in `tasks/todo/` and pre-populate `cubicles.json` with the required default roster:
   - Cubicles 1 & 2: `Gemini 4 Argon (High)`
   - Cubicle 3: `GPT Astra (Very High)`
   - Cubicles 4-16: Blank

### Phase 2: Worktree & Junction Manager Engine
1. Implement `WorktreeManager`:
   - Checks Git status, verifies repo root.
   - Creates per-cubicle branches `swarm/cubicle-01` to `swarm/cubicle-16`.
   - Provisions directory worktrees in `worktrees/cubicle-XX/`.
   - Executes `fs.symlink(target, link, 'junction')` for `.swarm` and `.agents`.
2. Implement `TaskClaimEngine`:
   - Polling loop executing atomic `fs.rename` from `todo/` to `in_progress/`.
   - Handles `ENOENT` as natural concurrency backoff.

### Phase 3: Capability Matrix & Sub-Swarm Enforcer
1. Build `CapabilityMatrixEvaluator`:
   - Strictly validates `can_spawn_subswarm`.
   - Rejects unauthorized invocations from `GPT Astra (Very High)`.
   - Dispatches structured violation events to `.swarm/logs/incidents.jsonl` and WebSocket broadcaster.
2. Build `SubswarmDecomposer`:
   - Generates `.swarm/subswarms/cubicle-XX/manifest.json`.
   - Manages child micro-workers and stages `.patch` consolidation.

### Phase 4: Standalone Packaging & Release Pipeline
1. Package server backend and embedded UI assets using `@yao-pkg/pkg`.
2. Produce standalone Windows executable `SymlinkedAgentSwarm.exe`.
3. Provide automated smoke test scripts verifying zero-crash execution, worktree creation, junction resolution, and task dispatching.

---

**End of Analysis Report — Ready for Orchestrator Synthesis and Milestone Dispatch.**
