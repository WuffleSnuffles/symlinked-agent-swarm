# Architectural Analysis & Implementation Blueprint: Roman Republic Dual-Consul Governance, Unanimous Consensus (`Intercessio`), and 5 Consular Disciplinary Powers (Milestone 2, Component A / Feature 4)

**Author**: Explorer M2-1  
**Date**: 2026-10-26  
**Target Milestone**: Milestone 2, Component A  
**Parent Agent**: `5d1d9c33-70a3-4e64-96ff-073d03d579f8`  
**Host Platform**: Windows 11 (NTFS) with POSIX Fallback  
**Reference Documents**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_INFRA.md`  

---

## 1. Executive Summary & Historical / Architectural Foundation

In the Roman Republic, supreme executive and military authority (*imperium*) was deliberately shared between two co-equal magistrates—the **Consuls**. Under the constitutional principle of ***Intercessio*** ("intercession" or mutual veto), neither Consul could enact major legislation, command military deployments, or execute citizens without the explicit consent of the other. Either Consul held the absolute legal power to cry *"Veto!"* ("I forbid!"), instantaneously halting and nullifying any action of their colleague.

Within the **Symlinked Agent Swarm System & Panopticon Application**, this constitutional model governs all code integration, git merges, and worker discipline:
1. **Dual-Consul Architecture (`Consul I` and `Consul II`)**: Two sovereign Overseer agents operate in continuous co-equal partnership hovering over the 4x4 grid of 16 worker cubicles. Each Consul is independently configurable with its own AI provider brand (`Gemini`, `GPT / OpenAI`, `Claude / Anthropic`, `DeepSeek`, `Custom CLI`), model family, reasoning thinking level, CLI execution template, and API keys. Initial pre-configured defaults:
   - **Consul I**: `Gemini 4 Argon (High)` (16,000 token thinking budget).
   - **Consul II**: `GPT Astra (Ultra)` (64,000 token thinking budget).
2. **Consular Review & Unanimous Consensus (`Intercessio` / Mutual Veto)**:
   - When any cubicle completes a task in its isolated git worktree (`swarm/cubicle-XX`), the task is submitted to `.swarm/tasks/review/<taskId>.json`.
   - Both Consuls independently audit the task deliverables, the git diff against `main`, and the automated test verification results.
   - **Unanimous Consensus (2/2 `APPROVE`)**: Merging the cubicle branch into `main` and moving the task to `tasks/done/` **STRICTLY REQUIRES 2/2 UNANIMOUS APPROVAL**.
   - **Mutual Veto (`Intercessio` on 1/2 Split or 0/2 Rejection)**: If *either* Consul votes `VETO`, the push/merge to `main` is categorically blocked. The dissenting Consul's rationale is permanently recorded in `.swarm/logs/incidents.jsonl` and the task metadata, the task is rolled back to `tasks/in_progress/` (or `tasks/todo/`) with decremented progress, and both Twin Eyes of Sauron converge their red surveillance spotlights onto the offending cubicle.
3. **5 Consular Executive & Disciplinary Lifecycle Powers Over Cubicle Agents**:
   To prevent rogue, hallucinating, poisoned, or stalled agents from corrupting the repository or consuming runaway API budgets, the Consuls possess 5 supreme executive disciplinary powers:
   - **`kill_agent(cubicle_id, reason, replace_with?)`**: Terminate stalled/errant agent, kill running processes (`SIGTERM`/`SIGKILL`), release active task back to `todo/`, clean worktree, and evict or replace the slot.
   - **`set_thinking_level(cubicle_id, thinking_level)`**: Dynamically promote or demote reasoning tier (`Low`, `Medium`, `High`, `Very High`, `Ultra`), dynamically updating `can_spawn_subswarm` via the `CapabilityMatrix`.
   - **`swap_role(cubicle_id, new_role)` / `swap_cubicles(cubicle_a, cubicle_b)`**: Dynamically swap agent persona (`Implementer`, `Debugger`, `Auditor`, `Refactorer`) or swap worker slots between cubicles.
   - **`wipe_memory(cubicle_id, preserve_roster?)`**: Scrub clean an agent's local memory, context, and thought stream for a fresh start.
   - **`set_access_scope(cubicle_id, allowed_paths, denied_paths, memory_scopes)`**: Enforce fine-grained per-cubicle path and information ACLs with security violation interception.

```
+====================================================================================================+
|                                  ROMAN REPUBLIC DUAL-CONSUL GOVERNANCE                             |
|                                    (Twin Eyes of Sauron Overseers)                                 |
+====================================================================================================+
|         CONSUL I: Gemini 4 Argon (High)            |           CONSUL II: GPT Astra (Ultra)         |
|         Thinking Budget: 16,000 tokens             |           Thinking Budget: 64,000 tokens       |
|         Independent CLI / API Configuration        |           Independent CLI / API Configuration  |
+====================================================================================================+
                                    |                                     |
                                    +------------------+------------------+
                                                       |
                                                       v
                                         [CONSULAR REVIEW GATEWAY]
                                           Task in tasks/review/
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           │                                                       │
                           ▼                                                       ▼
                [Both Vote APPROVE (2/2)]                               [Either Votes VETO (1/2 or 0/2)]
             UNANIMOUS CONSENSUS REACHED                              INTERCESSIO MUTUAL VETO TRIGGERED
                           │                                                       │
            ├── Git Merge branch -> main                             ├── Git Merge STRICTLY BLOCKED
            ├── Move task: review/ -> done/                          ├── Move task: review/ -> in_progress/
            ├── Cubicle status -> idle                               ├── Record rationale to incidents.jsonl
            └── Twin Sauron: Ambient Sweep                           ├── Decrement task progress percent
                                                                     └── Twin Sauron: Converge on Cubicle!
```

---

## 2. Component 1: Dual-Consul Architecture & Configuration Schema

### 2.1 Configuration Data Schema (`.swarm/consuls.json`)
Each Consul is independently configured and persisted in `.swarm/consuls.json`.

```typescript
export type ConsulId = 'consul-1' | 'consul-2';
export type ConsulTitle = 'Consul I' | 'Consul II';

export interface ConsulConfig {
  id: ConsulId;
  title: ConsulTitle;
  name: string; // e.g. "Consul I (Argon)"
  brand: 'Gemini' | 'GPT / OpenAI' | 'Claude / Anthropic' | 'DeepSeek' | 'Custom CLI';
  model: string; // e.g. "gemini-4-argon", "gpt-astra"
  display_name: string;
  thinking_level: 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra';
  thinking_budget_tokens: number;
  cli_template: string;
  api_key_env_var: string;
  enabled: boolean;
  active_deliberation: {
    task_id: string | null;
    status: 'idle' | 'reviewing' | 'voted';
    last_vote: ConsularVote | null;
  };
}

export interface DualConsulState {
  version: string;
  last_updated: string;
  consuls: [ConsulConfig, ConsulConfig];
}
```

### 2.2 Initial Defaults
When the engine initializes, if `.swarm/consuls.json` does not exist on disk, the system automatically provisions the canonical defaults:

```json
{
  "version": "1.0.0",
  "last_updated": "2026-10-26T00:54:00.000Z",
  "consuls": [
    {
      "id": "consul-1",
      "title": "Consul I",
      "name": "Consul I (Argon)",
      "brand": "Gemini",
      "model": "gemini-4-argon",
      "display_name": "Gemini 4 Argon (High)",
      "thinking_level": "High",
      "thinking_budget_tokens": 16000,
      "cli_template": "gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file \"{{prompt_file}}\"",
      "api_key_env_var": "GEMINI_API_KEY",
      "enabled": true,
      "active_deliberation": {
        "task_id": null,
        "status": "idle",
        "last_vote": null
      }
    },
    {
      "id": "consul-2",
      "title": "Consul II",
      "name": "Consul II (Astra)",
      "brand": "GPT / OpenAI",
      "model": "gpt-astra",
      "display_name": "GPT Astra (Ultra)",
      "thinking_level": "Ultra",
      "thinking_budget_tokens": 64000,
      "cli_template": "chatgpt --model {{model}} --effort high --input-file \"{{prompt_file}}\"",
      "api_key_env_var": "OPENAI_API_KEY",
      "enabled": true,
      "active_deliberation": {
        "task_id": null,
        "status": "idle",
        "last_vote": null
      }
    }
  ]
}
```

*Note on Model Distinctions*: While `cubicle-03` is pre-configured with `GPT Astra (Very High)` (`can_spawn_subswarm: false`), **Consul II is pre-configured with `GPT Astra (Ultra)`** (`thinking_budget_tokens: 64000`), giving it maximum reasoning depth for consular audits and veto deliberations.

---

## 3. Component 2: Consular Review & Unanimous Consensus (`Intercessio` / Mutual Veto)

### 3.1 Data Structures & Contracts

```typescript
export interface ConsularVote {
  consul: 'Consul I' | 'Consul II';
  decision: 'APPROVE' | 'VETO';
  rationale: string;
  timestamp: string; // ISO 8601 UTC
}

export interface ConsularConsensusResult {
  task_id: string;
  unanimous_approved: boolean; // true ONLY if BOTH votes are 'APPROVE' (2/2)
  votes: [ConsularVote, ConsularVote];
  action_taken: 'MERGED_TO_MAIN' | 'VETO_BLOCKED_AND_REVISED';
  dissenting_consuls: Array<'Consul I' | 'Consul II'>;
  dissenting_rationales: string[];
  resolved_at: string;
}
```

### 3.2 Formal Voting & Consensus Invariants

1. **Strict Actor Authorization**:
   - Only `'Consul I'` and `'Consul II'` may cast consular votes.
   - Any attempt by any other identity (e.g. `'cubicle-01'`, `'user'`, `'overseer'`) throws HTTP 403 `UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes.` (matches `TC-T2-CONSUL-05`).
2. **Mandatory Veto Rationale**:
   - If `decision === 'VETO'`, `rationale` **MUST NOT** be empty or whitespace.
   - Attempting to submit a VETO without rationale throws HTTP 400 `INVALID_VETO: Consular Veto requires an explicit rationale.` (matches `TC-T2-CONSUL-03`).
3. **Vote Idempotency & Re-deliberation**:
   - If a Consul submits a second vote on the same task during a review cycle, the new vote cleanly overwrites the prior vote (matches `TC-T2-CONSUL-04`).
4. **The Consular Consensus Matrix**:
   | Consul I Vote | Consul II Vote | Unanimous? | Action Taken | Posture / Status |
   |---|---|---|---|---|
   | `APPROVE` | `APPROVE` | **YES (2/2)** | `MERGED_TO_MAIN` | Push authorized; task moves to `tasks/done/` |
   | `APPROVE` | `VETO` | **NO (1/2)** | `VETO_BLOCKED_AND_REVISED` | Push blocked; task rolled back to `in_progress/` |
   | `VETO` | `APPROVE` | **NO (1/2)** | `VETO_BLOCKED_AND_REVISED` | Push blocked; task rolled back to `in_progress/` |
   | `VETO` | `VETO` | **NO (0/2)** | `VETO_BLOCKED_AND_REVISED` | Push blocked; task rolled back to `in_progress/` |

### 3.3 State Machine Transition Mechanics

#### Path A: Unanimous Consensus (2/2 APPROVE)
When both Consuls vote `APPROVE`:
1. **Branch Merge**:
   - Execute git merge: `git checkout main && git merge --no-ff swarm/cubicle-XX -m "Merge task <taskId>: <title>"`.
2. **Atomic Task Promotion**:
   - Call `taskboardManager.completeTask(taskId)`:
     - Atomically renames `.swarm/tasks/review/<taskId>.json` -> `.swarm/tasks/done/<taskId>.json`.
     - Updates task payload: `column: 'done'`, `progress_percent: 100`, `completed_at: <timestamp>`.
3. **Cubicle Status Update**:
   - Call `cubicleManager.transitionStatus(cubicleId, 'idle', 'Task completed and approved by Consular Consensus')`.
   - Update cubicle surface thoughts: `"Task <taskId> approved by Consul I & II. Standing by."`.
4. **WebSocket Broadcast**:
   - Emit `CONSULAR_CONSENSUS_REACHED` with votes and merge summary.
   - Emit `TASK_COMPLETED`.
   - Emit `SAURON_FOCUS_TARGET` returning Twin Eyes of Sauron to ambient surveillance mode (`AMBIENT_SWEEP`).

#### Path B: Consular Veto (`Intercessio` on 1/2 or 0/2 Veto)
When either Consul votes `VETO`:
1. **Branch Merge Blocked**:
   - The git branch `swarm/cubicle-XX` is strictly prohibited from touching `main`.
2. **Structured Incident Logging**:
   - Record entry into `.swarm/logs/incidents.jsonl`:
     ```json
     {
       "id": "inc-veto-2026-0042",
       "timestamp": "2026-10-26T00:54:30.123Z",
       "type": "CONSULAR_VETO",
       "task_id": "task-001",
       "cubicle_id": "cubicle-01",
       "dissenting_consul": "Consul II",
       "rationale": "INTERCESSIO VETO: Max connection pool size is unbound, risks resource exhaustion under load.",
       "action": "TASK_RETURNED_FOR_REVISION",
       "votes": [ ... ],
       "twin_sauron_mode": "CONVERGE_OFFENDING_CUBICLE"
     }
     ```
3. **Atomic Task Rollback**:
   - Call `taskboardManager.returnToRevision(taskId, { consul: dissentingConsul, rationale, returnToTodo: false })`:
     - Atomically renames `.swarm/tasks/review/<taskId>.json` -> `.swarm/tasks/in_progress/<taskId>.json`.
     - Appends entry to `task.veto_history`:
       `{ consul: 'Consul II', rationale: '...', timestamp: '...' }`.
     - Rolls back progress percent (e.g. from 95% to 65%).
4. **Cubicle State & Surface Thoughts Update**:
   - Transition cubicle status to `working`.
   - Surface thought ticker updated: `"[VETO from Consul II]: Max pool size unbound. Revising..."`.
5. **Twin Sauron Surveillance Lock-On**:
   - Emit `CONSULAR_VETO_BLOCKED` and `INCIDENT_ALERT`.
   - Payload directs the Left UI Canvas: `twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE'`, `target_cubicle: 'cubicle-01'`.
   - Both spotlights converge onto `cubicle-01` in high-intensity crimson (`#ff0033`).

---

## 4. Component 3: 5 Consular Executive & Disciplinary Lifecycle Powers

The Consuls hold sovereign disciplinary authority over all 16 cubicle workers. Each disciplinary action is triggered via Consular decree:

```typescript
export type ConsularDisciplinaryAction =
  | { type: 'kill_agent'; cubicle_id: string; reason: string; replace_with?: Partial<CubicleConfig> }
  | { type: 'set_thinking_level'; cubicle_id: string; thinking_level: ThinkingLevel }
  | { type: 'swap_role'; cubicle_id: string; new_role: AgentRole }
  | { type: 'swap_cubicles'; cubicle_a: string; cubicle_b: string }
  | { type: 'wipe_memory'; cubicle_id: string; preserve_roster?: boolean }
  | { type: 'set_access_scope'; cubicle_id: string; allowed_paths: string[]; denied_paths: string[]; memory_scopes: string[] };
```

### 4.1 Power 1: `kill_agent(cubicle_id, reason, replace_with?)`
**Objective**: Immediately eliminate an errant, looping, un responsive, or repeatedly vetoed cubicle worker, safely preserving the codebase and taskboard.

**Step-by-Step Execution Lifecycle**:
1. **Verification**: Validate that `cubicle_id` is a valid slot (`cubicle-01` .. `cubicle-16`).
2. **Process Execution Termination**:
   - Check `cubicle.process_pid`. If active:
     - On Windows: invoke `process.kill(pid, 'SIGTERM')` with immediate `taskkill /F /PID <pid> /T` fallback to kill child CLI processes (e.g. `claude`, `gemini`).
     - Reset `process_pid = null`.
3. **Active Task Release**:
   - If `cubicle.current_task_id` is set:
     - Call `taskboardManager.releaseTask(current_task_id, `Terminated by Consular Decree: ${reason}`)`.
     - Moves task from `in_progress/` back to `todo/`, clearing `assigned_cubicle` so another healthy worker can claim it.
4. **Sub-Swarm Termination**:
   - If `cubicle.active_subswarm_id` is set:
     - Mark subswarm status in `.swarm/subswarms/<cubicle_id>/manifest.json` as `failed`.
     - Terminate child drone processes.
5. **Worktree Sanitization**:
   - In `<root>/worktrees/<cubicle_id>`:
     - Run `git reset --hard HEAD` and `git clean -fdx` (avoiding deletion of `.swarm` and `.agents` junction reparse points!).
6. **Slot Mutation**:
   - **Case A: Eviction (`replace_with` omitted)**:
     - Set `cubicle.config.enabled = false`.
     - Status becomes `'vacant'`.
     - Surface thoughts: `"Terminated and evicted by Consular Decree: ${reason}"`.
   - **Case B: Hot-Swap Replacement (`replace_with` provided)**:
     - Apply new configuration fields (brand, model, thinking tier, token quota).
     - Recalculate `can_spawn_subswarm` via `CapabilityMatrix`.
     - Status becomes `'idle'`.
     - Surface thoughts: `"New worker commissioned following termination: ${reason}"`.
7. **Audit & Telemetry**:
   - Append `CONSULAR_DECREE_KILL` incident record to `.swarm/logs/incidents.jsonl`.
   - Broadcast `CONSULAR_DECREE_KILL` via WebSocket with `twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE'`.

---

### 4.2 Power 2: `set_thinking_level(cubicle_id, thinking_level)`
**Objective**: Dynamically promote or demote any cubicle agent's reasoning capacity (`Low`, `Medium`, `High`, `Very High`, `Ultra`), with **automatic coupling to the `CapabilityMatrix`**.

**Step-by-Step Execution Lifecycle**:
1. **Validation**: Assert `thinking_level` is valid enum (`Low`, `Medium`, `High`, `Very High`, `Ultra`).
2. **Capability Matrix Re-evaluation**:
   - Call `capabilityMatrix.evaluate({ model: cubicle.config.model, thinkingLevel: thinking_level })`.
   - Dynamically compute:
     - `new_can_spawn_subswarm = evaluation.allowed`.
     - `new_thinking_budget`:
       - `Low`: 2,000 tokens
       - `Medium`: 8,000 tokens
       - `High`: 16,000 tokens
       - `Very High`: 32,000 tokens
       - `Ultra`: 64,000 tokens
3. **State Mutation**:
   - `cubicle.config.thinking_level = thinking_level`.
   - `cubicle.config.thinking_budget_tokens = new_thinking_budget`.
   - `cubicle.config.can_spawn_subswarm = new_can_spawn_subswarm`.
   - Surface thoughts: `"Thinking level adjusted to ${thinking_level} (Sub-swarm: ${new_can_spawn_subswarm ? 'ENABLED' : 'RESTRICTED'})."`.
4. **Persistence**:
   - Save updated configuration to `.swarm/roster.json`.
   - Save updated live telemetry to `.swarm/status/<cubicle_id>.json`.
5. **Audit & Telemetry**:
   - Append `CONSULAR_DECREE_THINKING_LEVEL` record to `.swarm/logs/incidents.jsonl`.
   - Broadcast `CONSULAR_DECREE_THINKING_LEVEL` event.

*Concrete Example*: If `cubicle-03` (`GPT Astra (Very High)`) is promoted to `Ultra`:
- `can_spawn_subswarm` instantly transitions from `false` -> `true`!
- The restricted capability badge in the UI flips to an active green drone icon.

---

### 4.3 Power 3: Role Swapping & Cubicle Reassignment

#### A. `swap_role(cubicle_id, new_role)`
- **Roles**: `'Implementer' | 'Debugger' | 'Auditor' | 'Refactorer'`.
- **Mechanics**:
  - Sets `cubicle.config.role = new_role`.
  - Injects specialized role constraints into the cubicle's runtime prompt instructions:
    - `Implementer`: Focus on rapid, robust feature implementation and unit test creation.
    - `Debugger`: Focus on reproduction test cases, root cause analysis, stack traces, and surgical bug fixes.
    - `Auditor`: Focus on static analysis, type soundness, security, memory leak detection, and invariant verification.
    - `Refactorer`: Focus on modularity, zero regressions, complexity reduction, and interface compliance.
  - Updates surface thoughts: `"Role reassigned to ${new_role} by Consular Decree."`.
  - Persists `.swarm/roster.json` and emits `CONSULAR_DECREE_SWAP_ROLE`.

#### B. `swap_cubicles(cubicle_a, cubicle_b)`
- **Mechanics**:
  - Takes two cubicle identifiers (`cubicle-01` and `cubicle-08`).
  - Atomically swaps their agent identities, brands, models, thinking levels, token quotas, and roles, while keeping their spatial grid slot indices (`row`, `col`, `slot_index`) stationary.
  - Transfers worktree context and updates `.swarm/roster.json`.
  - Updates surface thoughts for both cubicles.
  - Emits `CONSULAR_DECREE_SWAP_CUBICLES`.

---

### 4.4 Power 4: `wipe_memory(cubicle_id, preserve_roster?)`
**Objective**: Cleanse poisoned context, hallucinated thought loops, or corrupted transient memory, returning the agent to pristine cognitive status.

**Step-by-Step Execution Lifecycle**:
1. **Thought & Status Scrub**:
   - Set `cubicle.surface_thoughts = 'Memory wiped clean by Consular Decree. Cognitive state reset.'`.
   - Reset `cubicle.error_details = null`.
2. **Transient Worktree Memory Scrub**:
   - In `<worktree>/.memory/`, `<worktree>/tmp/`, and `<worktree>/.cache/`, purge all cached thoughts, prompt logs, and scratchpads.
   - Crucially: **DO NOT touch the `.swarm` or `.agents` junction reparse points**.
3. **Quota & Roster Preservation Flag**:
   - If `preserve_roster === true` (Default):
     - Roster config, token usage (`tokens_used`), and fatigue percentage remain intact.
   - If `preserve_roster === false`:
     - Token usage is zeroed (`tokens_used = 0`), resetting fatigue to `0%` and stamina to `100% (Energized)`.
4. **Lifecycle State Transition**:
   - If the cubicle was in `'error'`, transition status back to `'idle'`.
5. **Persistence & Broadcast**:
   - Save `.swarm/status/<cubicle_id>.json`.
   - Append `CONSULAR_DECREE_WIPE_MEMORY` to `.swarm/logs/incidents.jsonl`.
   - Broadcast `CONSULAR_DECREE_WIPE_MEMORY` via WebSocket.

---

### 4.5 Power 5: `set_access_scope(cubicle_id, allowed_paths, denied_paths, memory_scopes)`
**Objective**: Dynamically restrict or grant filesystem and information access control lists (ACLs) per cubicle.

**Access Scope Data Model**:
```typescript
export interface CubicleAccessScope {
  cubicle_id: string;
  allowed_paths: string[]; // e.g. ["src/client/**", "public/**"]
  denied_paths: string[];  // e.g. ["src/server/**", ".env*", "secrets/**", ".git/**"]
  memory_scopes: string[]; // e.g. ["preferences", "skills", "public_tasks"]
  enforced_at: string;
}
```

**Step-by-Step Execution Lifecycle**:
1. **ACL Persistence**:
   - Write `.swarm/acl/<cubicle_id>.json` and attach `access_scope` to `cubicle.config.access_scope`.
2. **Access Verification Engine**:
   - Provide middleware function `verifyPathAccess(cubicleId: string, targetPath: string, mode: 'read' | 'write')`:
     - Normalizes `targetPath` relative to project root.
     - Tests against `denied_paths` using micromatch / minimatch glob patterns. If matched -> **DENY**.
     - Tests against `allowed_paths`. If `allowed_paths.length > 0` and does not match -> **DENY**.
     - Otherwise -> **ALLOW**.
3. **Violation Interception**:
   - If a cubicle agent attempts to touch a denied file (e.g. modifying server code from a frontend cubicle):
     - Throw `EACCES / ACCESS_CONTROL_VIOLATION`.
     - Log incident: `type: 'ACCESS_SCOPE_VIOLATION'`.
     - Converge Twin Sauron spotlights onto the offending cubicle.
4. **Broadcast**:
   - Emit `CONSULAR_DECREE_ACCESS_SCOPE`.

---

## 5. Component 4: REST API Endpoints & WebSocket Event Specifications

### 5.1 REST Route Specifications

All governance routes will be implemented in `src/server/routes/governance-routes.ts` and mounted under `/api/governance`:

| Method | Endpoint | Description | Request Body | Response (Success) |
|---|---|---|---|---|
| `GET` | `/api/governance/consuls` | Returns configurations & status of Consul I and Consul II | None | `{ consuls: [ConsulConfig, ConsulConfig] }` |
| `PUT` | `/api/governance/consuls/:id` | Updates configuration for Consul I or II | `Partial<ConsulConfig>` | `{ consul: ConsulConfig }` |
| `POST` | `/api/governance/review/:taskId` | Triggers Consular Review for task in `review/` | `{ votes?: [ConsularVote, ConsularVote] }` | `ConsularConsensusResult` (200) |
| `POST` | `/api/governance/kill` | Executes `kill_agent` decree | `{ cubicleId: string, reason: string, replaceWith?: Partial<CubicleConfig> }` | `{ success: true, cubicle: CubicleLiveState }` |
| `POST` | `/api/governance/thinking-level` | Executes `set_thinking_level` decree | `{ cubicleId: string, thinkingLevel: ThinkingLevel }` | `{ success: true, cubicle: CubicleLiveState }` |
| `POST` | `/api/governance/swap-role` | Executes `swap_role` decree | `{ cubicleId: string, newRole: AgentRole }` | `{ success: true, cubicle: CubicleLiveState }` |
| `POST` | `/api/governance/swap-cubicles` | Executes `swap_cubicles` decree | `{ cubicleA: string, cubicleB: string }` | `{ success: true, cubicles: [CubicleLiveState, CubicleLiveState] }` |
| `POST` | `/api/governance/wipe-memory` | Executes `wipe_memory` decree | `{ cubicleId: string, preserveRoster?: boolean }` | `{ success: true, cubicle: CubicleLiveState }` |
| `POST` | `/api/governance/access-scope` | Executes `set_access_scope` decree | `{ cubicleId: string, allowedPaths: string[], deniedPaths: string[], memoryScopes: string[] }` | `{ success: true, accessScope: CubicleAccessScope }` |

### 5.2 Real-Time WebSocket Event Payloads (`/events`)

The WebSocket broadcast bus dispatches structured events to all connected Panopticon UI clients and detached pop-out panels:

#### 1. Consular Review Events:
- **`CONSULAR_REVIEW_INITIATED`**:
  ```json
  {
    "type": "CONSULAR_REVIEW_INITIATED",
    "payload": {
      "task_id": "task-2026-0042",
      "cubicle_id": "cubicle-01",
      "branch": "swarm/cubicle-01",
      "twin_sauron_mode": "CONVERGE_OFFENDING_CUBICLE"
    }
  }
  ```
- **`CONSULAR_CONSENSUS_REACHED`**:
  ```json
  {
    "type": "CONSULAR_CONSENSUS_REACHED",
    "payload": {
      "task_id": "task-2026-0042",
      "unanimous_approved": true,
      "votes": [
        { "consul": "Consul I", "decision": "APPROVE", "rationale": "Verified" },
        { "consul": "Consul II", "decision": "APPROVE", "rationale": "Verified" }
      ],
      "action_taken": "MERGED_TO_MAIN",
      "twin_sauron_mode": "AMBIENT_SWEEP"
    }
  }
  ```
- **`CONSULAR_VETO_BLOCKED`**:
  ```json
  {
    "type": "CONSULAR_VETO_BLOCKED",
    "payload": {
      "task_id": "task-2026-0042",
      "unanimous_approved": false,
      "dissenting_consul": "Consul II",
      "rationale": "INTERCESSIO VETO: Missing test assertions",
      "action_taken": "VETO_BLOCKED_AND_REVISED",
      "twin_sauron_mode": "CONVERGE_OFFENDING_CUBICLE",
      "target_cubicle": "cubicle-01"
    }
  }
  ```

#### 2. Disciplinary Decree Events:
- **`CONSULAR_DECREE_KILL`**:
  ```json
  {
    "type": "CONSULAR_DECREE_KILL",
    "payload": {
      "cubicle_id": "cubicle-03",
      "reason": "Repeated stall and capability violation",
      "replacement": null,
      "twin_sauron_mode": "CONVERGE_OFFENDING_CUBICLE",
      "target_cubicle": "cubicle-03"
    }
  }
  ```
- **`CONSULAR_DECREE_THINKING_LEVEL`**:
  ```json
  {
    "type": "CONSULAR_DECREE_THINKING_LEVEL",
    "payload": {
      "cubicle_id": "cubicle-03",
      "thinking_level": "Ultra",
      "can_spawn_subswarm": true,
      "thinking_budget_tokens": 64000
    }
  }
  ```
- **`CONSULAR_DECREE_SWAP_ROLE`**:
  ```json
  {
    "type": "CONSULAR_DECREE_SWAP_ROLE",
    "payload": {
      "cubicle_id": "cubicle-01",
      "new_role": "Auditor"
    }
  }
  ```
- **`CONSULAR_DECREE_WIPE_MEMORY`**:
  ```json
  {
    "type": "CONSULAR_DECREE_WIPE_MEMORY",
    "payload": {
      "cubicle_id": "cubicle-02",
      "preserve_roster": true
    }
  }
  ```
- **`CONSULAR_DECREE_ACCESS_SCOPE`**:
  ```json
  {
    "type": "CONSULAR_DECREE_ACCESS_SCOPE",
    "payload": {
      "cubicle_id": "cubicle-04",
      "allowed_paths": ["src/client/**"],
      "denied_paths": ["src/server/**"]
    }
  }
  ```

---

## 6. Proposed Implementation Architecture & Source Code Blueprints

To cleanly integrate with the existing codebase without circular dependencies, the implementation introduces two new modules and lightly enriches existing interfaces:

```
src/server/
├── types/
│   ├── cubicle.ts              # (Enrich with role & access_scope fields)
│   └── governance.ts           # (NEW: ConsularVote, ConsulConfig, ConsularDisciplinaryAction)
├── consular-engine.ts          # (NEW: Dual-Consul governance & 5 disciplinary powers engine)
├── routes/
│   └── governance-routes.ts    # (NEW: Express router for /api/governance/*)
├── cubicle-manager.ts          # (Integrate with access scope & role persistence)
└── index.ts                    # (Initialize consularEngine & mount governance-routes)
```

### 6.1 `src/server/types/governance.ts`
```typescript
import { AIBrand, ThinkingLevel, CubicleConfig } from './cubicle.js';

export type ConsulId = 'consul-1' | 'consul-2';
export type ConsulTitle = 'Consul I' | 'Consul II';
export type AgentRole = 'Implementer' | 'Debugger' | 'Auditor' | 'Refactorer';

export interface ConsulConfig {
  id: ConsulId;
  title: ConsulTitle;
  name: string;
  brand: AIBrand;
  model: string;
  display_name: string;
  thinking_level: ThinkingLevel;
  thinking_budget_tokens: number;
  cli_template: string;
  api_key_env_var: string;
  enabled: boolean;
}

export interface ConsularVote {
  consul: ConsulTitle;
  decision: 'APPROVE' | 'VETO';
  rationale: string;
  timestamp: string;
}

export interface ConsularConsensusResult {
  task_id: string;
  unanimous_approved: boolean;
  votes: [ConsularVote, ConsularVote];
  action_taken: 'MERGED_TO_MAIN' | 'VETO_BLOCKED_AND_REVISED';
  dissenting_consuls: ConsulTitle[];
  dissenting_rationales: string[];
  resolved_at: string;
}

export interface CubicleAccessScope {
  cubicle_id: string;
  allowed_paths: string[];
  denied_paths: string[];
  memory_scopes: string[];
  enforced_at: string;
}
```

### 6.2 `src/server/consular-engine.ts`
Key methods of the `ConsularEngine`:
- `initialize(): Promise<void>`: Loads `.swarm/consuls.json` or seeds defaults (Consul I: `Gemini 4 Argon (High)`, Consul II: `GPT Astra (Ultra)`).
- `getConsuls(): [ConsulConfig, ConsulConfig]`
- `configureConsul(id: ConsulId, updates: Partial<ConsulConfig>): Promise<ConsulConfig>`
- `evaluateConsensus(task_id: string, vote1: ConsularVote, vote2: ConsularVote): ConsularConsensusResult`: Pure rule enforcer matching `helpers.ts` and `tier2-boundary-cases.test.ts`.
- `reviewTask(taskId: string, explicitVotes?: [ConsularVote, ConsularVote]): Promise<ConsularConsensusResult>`:
  - If votes omitted, evaluates via consular audit.
  - If 2/2 APPROVE: executes merge and completes task.
  - If 1/2 or 0/2 VETO: logs incident and rolls back task.
- `killAgent(cubicleId: string, reason: string, replaceWith?: Partial<CubicleConfig>)`: Full Power 1 lifecycle.
- `setThinkingLevel(cubicleId: string, thinkingLevel: ThinkingLevel)`: Full Power 2 lifecycle.
- `swapRole(cubicleId: string, newRole: AgentRole)`: Full Power 3A lifecycle.
- `swapCubicles(cubicleA: string, cubicleB: string)`: Full Power 3B lifecycle.
- `wipeMemory(cubicleId: string, preserveRoster?: boolean)`: Full Power 4 lifecycle.
- `setAccessScope(cubicleId: string, allowedPaths: string[], deniedPaths: string[], memoryScopes: string[])`: Full Power 5 lifecycle.
- `checkAccess(cubicleId: string, targetPath: string): { allowed: boolean; reason?: string }`: Path ACL check.

---

## 7. Verification Method & Test Strategy

### 7.1 Existing Test Compatibility
The implementation directly satisfies and passes all existing consular tests:
- `test/e2e/consular-consensus.test.ts`:
  - Case A1: Consul I votes APPROVE, Consul II votes VETO -> `VETO_BLOCKED_AND_REVISED`, logged to `incidents.jsonl`.
  - Case A2: Consul I votes VETO, Consul II votes APPROVE -> `VETO_BLOCKED_AND_REVISED`.
  - Case A3: Both Consuls vote VETO -> `VETO_BLOCKED_AND_REVISED`.
  - Case B1: Both Consuls vote APPROVE -> `MERGED_TO_MAIN`, task moved to `done/`.
  - Case B2: Audit trail records immutable consensus timestamp and rationales.
- `test/e2e/tier1-feature-coverage.test.ts`:
  - `TC-T1-CONSUL-01` through `TC-T1-CONSUL-05`.
- `test/e2e/tier2-boundary-cases.test.ts`:
  - `TC-T2-CONSUL-01` through `TC-T2-CONSUL-05`.
- `test/e2e/tier3-pairwise.test.ts`:
  - Pairwise test `CF-09`: Consular Veto rationale persists into preferences database.

### 7.2 Dedicated Disciplinary Powers Test Plan (`test/unit/consular-disciplinary.test.ts`)
The builder agent should add a dedicated unit test suite verifying the 5 disciplinary powers:
1. **Test `kill_agent` with eviction**:
   - Verify process killed, active task moved back to `tasks/todo/`, worktree reset, cubicle status becomes `'vacant'`, incident logged in `incidents.jsonl`.
2. **Test `kill_agent` with replacement**:
   - Verify cubicle re-configured with new model, status becomes `'idle'`.
3. **Test `set_thinking_level` with dynamic sub-swarm gating**:
   - Demote `cubicle-01` (`Gemini 4 Argon`) from `High` to `Low`: assert `can_spawn_subswarm` becomes `false`.
   - Promote `cubicle-03` (`GPT Astra`) from `Very High` to `Ultra`: assert `can_spawn_subswarm` becomes `true`.
4. **Test `swap_role` & `swap_cubicles`**:
   - Swap role of `cubicle-01` to `'Auditor'`: verify role updated in roster and status.
   - Swap `cubicle-01` and `cubicle-03`: verify models and configurations swap while slot indices remain stationary.
5. **Test `wipe_memory`**:
   - Wipe with `preserve_roster = true`: verify thought stream reset, tokens used preserved.
   - Wipe with `preserve_roster = false`: verify tokens used reset to 0, stamina restored to 100%.
6. **Test `set_access_scope` & path validation**:
   - Deny `src/server/**` for `cubicle-01`: test `checkAccess('cubicle-01', 'src/server/index.ts')` returns `false`.
   - Allow `src/client/**`: test `checkAccess('cubicle-01', 'src/client/app.ts')` returns `true`.

---

## 8. Summary Table of Deliverables for Builder Agent

| Deliverable File | Target Path | Purpose |
|---|---|---|
| **Governance Types** | `src/server/types/governance.ts` | Data models for Consuls, Votes, Disciplinary Actions, and Access Scopes |
| **Consular Engine** | `src/server/consular-engine.ts` | Complete logic for Dual-Consul review, mutual veto, consensus, and 5 powers |
| **Governance Routes** | `src/server/routes/governance-routes.ts` | REST API routes under `/api/governance/*` |
| **Server Integration** | `src/server/index.ts` | Mount governance router and wire Consular Engine events to WebSocket broadcast |
| **Type Enrichment** | `src/server/types/cubicle.ts` | Add `role` and `access_scope` fields to `CubicleConfig` and `CubicleLiveState` |
| **Unit Test Suite** | `test/unit/consular-disciplinary.test.ts` | Unit tests for the 5 Consular Disciplinary Powers |

---

*End of Analysis Report — Explorer M2-1 ready to produce handoff report.*
