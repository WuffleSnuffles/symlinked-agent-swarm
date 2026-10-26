# Technical Design & Implementation Architecture: 16-Cubicle Worker Grid Roster & Pluggable CLI/API Engine

**Milestone**: Milestone 1, Component A (Feature 1)  
**Author**: Explorer M1-1  
**Target System**: Symlinked Agent Swarm Engine (`src/server/`)  
**Timestamp**: 2026-10-26T00:27:30Z  
**References**: `ORIGINAL_REQUEST.md` (§R1), `PROJECT.md` (Feature 1), `explorer_survey_1/analysis.md`

---

## 1. Executive Summary & Problem Boundary

Feature 1 establishes the operational core of the Symlinked Agent Swarm: the **16-Cubicle Worker Grid Roster** and the **Pluggable CLI/API Engine**.

In the Brutalist Dystopian Cyberpunk Panopticon metaphor, 16 distinct worker cubicles (`cubicle-01` through `cubicle-16`) are arranged in a 4x4 spatial grid. The system must support:
1. **Deterministic Pre-Configuration**: Cubicles 1 and 2 pre-configured as high-power reasoning units (`Gemini 4 Argon (High)`), Cubicle 3 configured as a restricted solo worker (`GPT Astra (Very High)`), and Cubicles 4–16 initialized as vacant, unassigned slots.
2. **Provider Agnosticism**: Hot-swappable configuration for any LLM brand (`Gemini`, `GPT / OpenAI`, `Claude / Anthropic`, `DeepSeek`, or `Custom CLI`) via parameterized command templates and isolated API credentials.
3. **Rigorous Lifecycle Management**: A 6-state finite state machine (`vacant`, `idle`, `working`, `under_inspection`, `error`, `exhausted`) with strict transition invariants and heartbeat telemetry.
4. **Fatigue & Stamina Simulation**: Continuous token consumption tracking mapped to a $[0\%, 100\%]$ stamina metric that visually drives worker posture, animation cadence, CRT distortion, and ultimate quota exhaustion lockouts.

This document details the complete data model, CLI templating engine, lifecycle transitions, fatigue mathematics, and concrete TypeScript interfaces to be implemented in `src/server/`.

---

## 2. 16-Cubicle Grid Data Model & 4x4 Spatial Topology

### 2.1 Grid Coordinate Mapping

The 16 cubicles are arranged in a 4-row by 4-column matrix:

```
Row 0: [cubicle-01 (0,0)] [cubicle-02 (0,1)] [cubicle-03 (0,2)] [cubicle-04 (0,3)]
Row 1: [cubicle-05 (1,0)] [cubicle-06 (1,1)] [cubicle-07 (1,2)] [cubicle-08 (1,3)]
Row 2: [cubicle-09 (2,0)] [cubicle-10 (2,1)] [cubicle-11 (2,2)] [cubicle-12 (2,3)]
Row 3: [cubicle-13 (3,0)] [cubicle-14 (3,1)] [cubicle-15 (3,2)] [cubicle-16 (3,3)]
```

Given a 0-based linear index $i \in [0, 15]$:
$$\text{id} = \text{"cubicle-"} + \text{String}(i + 1)\text{.padStart}(2, \text{"0"})$$
$$\text{row} = \lfloor i / 4 \rfloor, \quad \text{col} = i \pmod 4$$

Inverse mapping from row $r \in [0, 3]$ and column $c \in [0, 3]$:
$$i = 4r + c$$

### 2.2 Storage Partitioning: Configuration vs. Runtime Telemetry

To ensure crash resilience and zero race conditions:
1. **Administrative Roster Configuration** (`.swarm/roster.json`):
   - Stores user-defined configurations (model, brand, thinking tier, CLI templates, quota limits, enabled status).
   - Modified only via user configuration actions (REST `/api/cubicles/:id/configure` or Overseer commands).
2. **Dynamic Volatile Telemetry** (`.swarm/status/cubicle-XX.json`):
   - Stores real-time operational state: current status, task ID, active subswarm ID, surface thoughts stream, tokens consumed, fatigue percentage, process PID, and UTC heartbeat.
   - Flushed periodically (every 1,000 ms) and on every state transition.

---

## 3. Default Pre-Configuration Roster

Upon initial startup or database reset, the system initializes the 16 slots according to the following specifications:

| Cubicle ID | Slot | Provider / Brand | Model Identifier | Display Name | Thinking Tier | Budget Tokens | `can_spawn_subswarm` | Enabled | Initial Status | Quota Tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| `cubicle-01` | 0 | `Gemini` | `gemini-4-argon` | `Gemini 4 Argon (High)` | `High` | 16,000 | `true` | `true` | `idle` | 2,000,000 |
| `cubicle-02` | 1 | `Gemini` | `gemini-4-argon` | `Gemini 4 Argon (High)` | `High` | 16,000 | `true` | `true` | `idle` | 2,000,000 |
| `cubicle-03` | 2 | `GPT / OpenAI` | `gpt-astra` | `GPT Astra (Very High)` | `Very High` | 32,000 | **`false`** | `true` | `idle` | 1,500,000 |
| `cubicle-04` | 3 | `null` | `null` | `Unassigned Slot 04` | `Medium` | 0 | `false` | `false` | `vacant` | 1,000,000 |
| `cubicle-05` | 4 | `null` | `null` | `Unassigned Slot 05` | `Medium` | 0 | `false` | `false` | `vacant` | 1,000,000 |
| `...` | ... | `null` | `null` | `...` | `...` | 0 | `false` | `false` | `vacant` | 1,000,000 |
| `cubicle-16` | 15 | `null` | `null` | `Unassigned Slot 16` | `Medium` | 0 | `false` | `false` | `vacant` | 1,000,000 |

### Critical Invariants:
1. **Sub-Swarm Restriction on Cubicle 3**: `cubicle-03` running `GPT Astra (Very High)` **MUST** have `can_spawn_subswarm = false`. Only models matching the authorized capability matrix (such as `Gemini 4 Argon (High)` or `GPT Astra (Ultra)`) are authorized to initiate child swarms.
2. **Blank Slots Inactive**: Cubicles 4–16 must have `enabled: false` and `status: "vacant"`. The task dispatcher and atomic task claiming engine will never dispatch tasks to unassigned slots.

---

## 4. Pluggable CLI & API Engine Specification

The pluggable engine decouples agent execution from specific AI vendors. Each cubicle can run via direct SDK calls or via arbitrary command-line executables.

### 4.1 AI Brands & Thinking Tier Budgets

| AI Brand | Supported Models | Thinking Levels | Default Token Budgets | Notes |
|---|---|---|---|---|
| **`Gemini`** | `gemini-4-argon`, `gemini-2.5-pro`, `gemini-2.5-flash` | `Low`, `Medium`, `High`, `Ultra` | Low: 2k, Med: 8k, High: 16k, Ultra: 64k | Google GenAI SDK / Gemini CLI |
| **`GPT / OpenAI`** | `gpt-astra`, `o3`, `o4-mini`, `gpt-4.5` | `Low`, `Medium`, `High`, `Very High`, `Ultra` | Low: 2k, Med: 8k, High: 16k, Very High: 32k, Ultra: 64k | OpenAI CLI / SDK reasoning effort |
| **`Claude / Anthropic`** | `claude-3-7-sonnet`, `claude-3-5-sonnet` | `Medium`, `High`, `Ultra` | Med: 8k, High: 16k, Ultra: 64k | Anthropic extended thinking tokens |
| **`DeepSeek`** | `deepseek-r1`, `deepseek-v3` | `Medium`, `High` | Med: 8k, High: 16k | Native reasoning tokens / Ollama / vLLM |
| **`Custom CLI`** | *Arbitrary binary / script* | *User defined* | User defined | Universal shell execution wrapper |

### 4.2 Parameter Substitution Engine

When executing a cubicle task via CLI, the template string is interpolated against the runtime execution context.

#### Supported Template Variables:

| Variable | Description | Example Replacement |
|---|---|---|
| `{{prompt}}` | Verbatim task instruction text (shell-escaped) | `"Refactor auth router with unit tests"` |
| `{{prompt_file}}` | Absolute path to temporary task prompt file | `C:\...\.swarm\tasks\tmp\prompt-task-01.txt` |
| `{{model}}` | Model identifier string | `"gemini-4-argon"` |
| `{{thinking_level}}` | Symbolic thinking tier string | `"High"` |
| `{{thinking_budget}}` | Numeric token budget integer | `16000` |
| `{{worktree_dir}}` | Absolute path to isolated Git worktree | `H:\...\worktrees\cubicle-01` |
| `{{task_id}}` | Task unique identifier | `"task-2026-0042"` |
| `{{cubicle_id}}` | Assigned cubicle identifier | `"cubicle-01"` |
| `{{api_key}}` | Resolved API credential for the provider | `sk-ant-api03-...` |

#### Template Substitution Rules:
1. **Safety with `{{prompt_file}}`**: Command lines on Windows have an 8,191-character limit (`cmd.exe`) or 32,767 characters (`CreateProcessW`). Tasks containing detailed code specifications or multi-line instructions MUST use `{{prompt_file}}` instead of inline `{{prompt}}` to prevent shell truncation and quoting escapes.
2. **Escaping**: If `{{prompt}}` is referenced, quotes and special shell characters (`"`, `$`, `` ` ``, `\`) must be escaped according to the host platform (`cmd.exe` vs `powershell.exe` vs `bash`).
3. **Regex Interpolator**:
   ```typescript
   export function interpolateTemplate(
     template: string,
     context: Record<string, string | number>
   ): string {
     return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
       if (key in context) {
         return String(context[key]);
       }
       return match;
     });
   }
   ```

### 4.3 Default CLI Command Templates

1. **Gemini CLI Template**:
   ```bash
   gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file "{{prompt_file}}" --dir "{{worktree_dir}}"
   ```
2. **OpenAI / GPT CLI Template**:
   ```bash
   openai api chat.completions.create --model {{model}} --input "{{prompt}}" --workdir "{{worktree_dir}}"
   ```
3. **Claude Code CLI Template**:
   ```bash
   claude --model {{model}} --dangerously-skip-permissions --workdir "{{worktree_dir}}" -p "{{prompt}}"
   ```
4. **DeepSeek CLI (via Ollama) Template**:
   ```bash
   ollama run {{model}} "{{prompt}}" --workdir "{{worktree_dir}}"
   ```
5. **Custom Python / Shell Script Template**:
   ```bash
   python.exe scripts/agent_runner.py --cubicle {{cubicle_id}} --task {{task_id}} --worktree "{{worktree_dir}}" --prompt-file "{{prompt_file}}"
   ```

### 4.4 API Key & Environment Variable Security

1. **Lookup Priority**:
   - `process.env[config.api_key_env_var]`
   - Local `.env` file in the project root
   - Direct encrypted configuration override in `.swarm/secrets.json` (optional)
2. **Masking Guarantee**:
   Any credential passed to UI telemetry or logged to disk must be masked:
   ```typescript
   export function maskCredential(key: string): string {
     if (!key || key.length <= 8) return '********';
     return `${key.slice(0, 4)}...${key.slice(-4)}`;
   }
   ```
   Raw API keys are NEVER broadcast over WebSocket or written to `.swarm/logs/`.

---

## 5. 6-State Lifecycle Machine & Transition Validation

### 5.1 State Definitions

| State | Visual Indicator | Engine Behavior | Transition Out |
|---|---|---|---|
| **`vacant`** | Dark gray desk, unlit terminal, "UNASSIGNED" badge | Slot is ignored by task dispatchers; does not poll `.swarm/tasks/todo/` | User configures slot (`-> idle`) |
| **`idle`** | Relaxed breathing mascot, cyan/green standby glow | Polls `.swarm/tasks/todo/` using atomic file renames; ready for direct assignment | Task claimed (`-> working`), Slot cleared (`-> vacant`) |
| **`working`** | Aggressive typing animation, streaming telemetry, live thought ticker, orbiting drones (if sub-swarm active) | Child process executing in worktree; heartbeat emitting every 1s | Task completes (`-> under_inspection` or `-> idle`), Error (`-> error`), Quota zero (`-> exhausted`) |
| **`under_inspection`** | Twin Sauron spotlights locked on cubicle, amber audit glow | Code submitted to `review/`; worktree locked while Consuls review diffs | 2/2 Consular Approval (`-> idle`), Consular Veto (`-> working` or `-> idle`) |
| **`error`** | Crimson flashing CRT static, flatline alarm posture, alarm siren badge | Execution failed, tests failed, or capability violation logged | User/Overseer retry or reset (`-> idle`), Disabled (`-> vacant`) |
| **`exhausted`** | Collapsed face-down mascot, power off strobe, "QUOTA DEPLETED" badge | Tokens remaining = 0; prevented from claiming any tasks | User/Overseer quota recharge (`-> idle`) |

### 5.2 State Transition Matrix & Invariants

```
                +-------------------+
                |      VACANT       |
                +-------------------+
                       |     ^
              (Enable) |     | (Clear)
                       v     |
                +-------------------+
      +-------->|       IDLE        |<---------+
      |         +-------------------+          |
      |             |           ^              |
      |     (Claim) |           | (Release)    |
      |             v           |              |
      |         +-------------------+          | (Reset / Retry)
      |         |      WORKING      |          |
      |         +-------------------+          |
(Approve)      /          |          \         |
      |       / (Review)  | (Crash)   \ (Quota)|
      |      v            v            v       |
      | +-----------+ +-----------+ +----------+--+
      +-| UNDER_INSP| |   ERROR   | | EXHAUSTED   |
        +-----------+ +-----------+ +-------------+
             | (Veto / Revise)
             v
       (Back to Working)
```

#### Deterministic Transition Table:

| From State | Allowed Target States | Trigger Event | Invariant Check |
|---|---|---|---|
| `vacant` | `idle` | `CONFIGURE_CUBICLE` | Must have valid `brand` and `model` |
| `idle` | `working` | `TASK_CLAIMED`, `TASK_ASSIGNED` | Must have active worktree; `stamina > 0%` |
| `idle` | `vacant` | `DISABLE_CUBICLE` | No active task assigned |
| `working` | `under_inspection` | `TASK_SUBMITTED_FOR_REVIEW` | Git branch pushed to `swarm/cubicle-XX` |
| `working` | `idle` | `TASK_COMPLETED_NO_REVIEW` | Task moved to `done/` |
| `working` | `error` | `PROCESS_EXIT_ERROR`, `TEST_FAILED`, `CAPABILITY_VIOLATION` | Incident logged to `.swarm/logs/incidents.jsonl` |
| `working` | `exhausted` | `QUOTA_EXHAUSTION` | `tokens_remaining <= 0` |
| `under_inspection` | `idle` | `CONSULAR_UNANIMOUS_APPROVE` | Both Consuls vote APPROVE (2/2) |
| `under_inspection` | `working` | `CONSULAR_VETO_REVISE` | Consular veto triggers revision |
| `error` | `idle` | `RESET_ERROR`, `RETRY_TASK` | Error acknowledged; state cleared |
| `error` | `vacant` | `CLEAR_SLOT` | Reset to unassigned |
| `exhausted` | `idle` | `RECHARGE_QUOTA` | Quota tokens added (`tokens_remaining > 0`) |

---

## 6. Fatigue & Stamina Mathematical Modeling

### 6.1 Formula Formulation

Let $Q_{\text{max}}$ be the total token quota allocated to the cubicle ($Q_{\text{max}} \in \mathbb{N}^+$), and $Q_{\text{used}}$ be the cumulative tokens consumed during execution ($Q_{\text{used}} \ge 0$).

The remaining stamina percentage $S \in [0, 100]$ is computed as:

$$S = \begin{cases} 
0, & \text{if } Q_{\text{max}} \le 0 \\
\max\left(0, \min\left(100, \text{round}\left(\frac{Q_{\text{max}} - Q_{\text{used}}}{Q_{\text{max}}} \times 100\right)\right)\right), & \text{if } Q_{\text{max}} > 0
\end{cases}$$

Tokens remaining:
$$Q_{\text{rem}} = \max(0, Q_{\text{max}} - Q_{\text{used}})$$

### 6.2 Fatigue Tiers & UI Visual Synthesis

The stamina value $S$ is categorized into 4 operational tiers that govern the visual presentation in the Panopticon UI:

```
[100% ========================= 70%] Tier 1: Energized
[69%  ================ 35%]          Tier 2: Nominal / Fatigued
[34%  ====== 1%]                     Tier 3: Critical Strain
[0%]                                 Tier 4: Exhausted / Flatlined
```

| Tier Name | Stamina Range $S$ | UI Accent Color | Mascot Animation | Telemetry / Thoughts Style | Engine Reaction |
|---|---|---|---|---|---|
| **Energized** | $70\% \le S \le 100\%$ | Phosphor Cyan (`#00f3ff`) / Emerald (`#00ff66`) | Upright posture, high-speed typing, vibrant particle aura | Crisp, high-frequency thought stream updates | Full speed execution; normal claiming |
| **Fatigued** | $35\% \le S \le 69\%$ | Industrial Amber (`#ffb700`) | Slight slouch, steady typing, occasional brow wipe animation | Standard frequency thoughts | Normal claiming |
| **Critical Strain** | $1\% \le S \le 34\%$ | High-Contrast Orange/Crimson (`#ff5500`) | Heavy slouch, trembling animation, CRT jitter, perspiration particles | `"CRITICAL QUOTA DEPLETION"` ticker warning | Emits warning event to Center Incident Feed |
| **Exhausted** | $S = 0\%$ | Critical Crimson (`#ff003c`) / CRT Static | Worker collapsed face-down on desk; warning beacon flashing; flatline EKG line | `"FLATLINED: QUOTA DEPLETED. SHUTDOWN."` | Status forced to `'exhausted'`; blocked from claiming tasks |

### 6.3 Quota Consumption & Replenishment Logic

1. **Token Accounting Hook**:
   After every API call or CLI process termination, the cubicle manager extracts token usage (from provider response payload, stderr summary, or token estimation) and executes:
   ```typescript
   export function recordTokenUsage(
     state: CubicleLiveState,
     consumedTokens: number
   ): void {
     state.config.quota.tokens_used += consumedTokens;
     const max = state.config.quota.max_tokens;
     const remaining = Math.max(0, max - state.config.quota.tokens_used);
     state.fatigue_percentage = max > 0 ? Math.round((remaining / max) * 100) : 0;
     
     if (remaining === 0 && state.status !== 'exhausted') {
       state.status = 'exhausted';
     }
   }
   ```
2. **Recharge / Replenishment**:
   User or Overseer can replenish stamina by invoking:
   - `addQuota(cubicleId, 500000)`: Increments `max_tokens` or resets `tokens_used`.
   - `resetQuota(cubicleId)`: Resets `tokens_used = 0`, restoring stamina to $100\%$ and transitioning state from `'exhausted'` to `'idle'`.

---

## 7. Concrete TypeScript Interfaces (`src/server/types/cubicle.ts`)

Below is the definitive TypeScript contract to be implemented in `src/server/types/cubicle.ts`:

```typescript
/**
 * Cubicle Types and Schemas for Symlinked Agent Swarm Engine
 * Location: src/server/types/cubicle.ts
 */

export type AIBrand = 
  | 'Gemini' 
  | 'GPT / OpenAI' 
  | 'Claude / Anthropic' 
  | 'DeepSeek' 
  | 'Custom CLI';

export type ThinkingLevel = 
  | 'Low' 
  | 'Medium' 
  | 'High' 
  | 'Very High' 
  | 'Ultra';

export type CubicleStatus = 
  | 'vacant' 
  | 'idle' 
  | 'working' 
  | 'under_inspection' 
  | 'error' 
  | 'exhausted';

export type StaminaTier = 
  | 'energized' 
  | 'fatigued' 
  | 'critical_strain' 
  | 'exhausted';

/**
 * Quota and financial budget limits for a cubicle
 */
export interface CubicleQuotaConfig {
  max_tokens: number;
  tokens_used: number;
  max_cost_usd: number;
  cost_usd_accumulated: number;
}

/**
 * Administrative configuration for a cubicle slot
 */
export interface CubicleConfig {
  id: string; // e.g. 'cubicle-01' through 'cubicle-16'
  slot_index: number; // 0 to 15
  row: number; // 0 to 3
  col: number; // 0 to 3
  enabled: boolean;
  brand: AIBrand | null;
  model: string | null; // e.g. 'gemini-4-argon', 'gpt-astra'
  display_name: string;
  thinking_level: ThinkingLevel;
  thinking_budget_tokens: number;
  can_spawn_subswarm: boolean;
  cli_template: string;
  api_key_env_var: string;
  quota: CubicleQuotaConfig;
}

/**
 * Real-time operational state and telemetry of a cubicle
 */
export interface CubicleLiveState {
  id: string; // 'cubicle-01' .. 'cubicle-16'
  config: CubicleConfig;
  status: CubicleStatus;
  current_task_id: string | null;
  active_subswarm_id: string | null;
  surface_thoughts: string;
  fatigue_percentage: number; // 0 to 100
  stamina_tier: StaminaTier;
  last_heartbeat: string; // ISO 8601 UTC
  worktree_path: string;
  branch_name: string; // 'swarm/cubicle-XX'
  process_pid: number | null;
  error_details: {
    message: string;
    incident_id: string | null;
    timestamp: string;
  } | null;
}

/**
 * Context variables available for CLI command template parameter interpolation
 */
export interface CLITemplateContext {
  prompt: string;
  prompt_file: string;
  model: string;
  thinking_level: ThinkingLevel;
  thinking_budget: number;
  worktree_dir: string;
  task_id: string;
  cubicle_id: string;
  api_key: string;
}

/**
 * Update request payload for configuring a cubicle slot
 */
export interface ConfigureCubicleDTO {
  enabled?: boolean;
  brand?: AIBrand | null;
  model?: string | null;
  display_name?: string;
  thinking_level?: ThinkingLevel;
  thinking_budget_tokens?: number;
  can_spawn_subswarm?: boolean;
  cli_template?: string;
  api_key_env_var?: string;
  max_tokens?: number;
  max_cost_usd?: number;
}
```

---

## 8. Default Pre-Configuration Constants

```typescript
/**
 * Initial Default Pre-Configuration for the 16-Cubicle Roster
 * Location: src/server/types/cubicle-defaults.ts
 */

import { CubicleConfig } from './cubicle.js';

export const DEFAULT_CUBICLE_ROSTER: CubicleConfig[] = [
  // Cubicle 1: Gemini 4 Argon (High) - Sub-swarm authorized
  {
    id: 'cubicle-01',
    slot_index: 0,
    row: 0,
    col: 0,
    enabled: true,
    brand: 'Gemini',
    model: 'gemini-4-argon',
    display_name: 'Gemini 4 Argon (High)',
    thinking_level: 'High',
    thinking_budget_tokens: 16000,
    can_spawn_subswarm: true,
    cli_template: 'gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file "{{prompt_file}}" --dir "{{worktree_dir}}"',
    api_key_env_var: 'GEMINI_API_KEY',
    quota: {
      max_tokens: 2000000,
      tokens_used: 0,
      max_cost_usd: 20.0,
      cost_usd_accumulated: 0.0,
    },
  },

  // Cubicle 2: Gemini 4 Argon (High) - Sub-swarm authorized
  {
    id: 'cubicle-02',
    slot_index: 1,
    row: 0,
    col: 1,
    enabled: true,
    brand: 'Gemini',
    model: 'gemini-4-argon',
    display_name: 'Gemini 4 Argon (High)',
    thinking_level: 'High',
    thinking_budget_tokens: 16000,
    can_spawn_subswarm: true,
    cli_template: 'gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file "{{prompt_file}}" --dir "{{worktree_dir}}"',
    api_key_env_var: 'GEMINI_API_KEY',
    quota: {
      max_tokens: 2000000,
      tokens_used: 0,
      max_cost_usd: 20.0,
      cost_usd_accumulated: 0.0,
    },
  },

  // Cubicle 3: GPT Astra (Very High) - STRICTLY RESTRICTED from sub-swarms
  {
    id: 'cubicle-03',
    slot_index: 2,
    row: 0,
    col: 2,
    enabled: true,
    brand: 'GPT / OpenAI',
    model: 'gpt-astra',
    display_name: 'GPT Astra (Very High)',
    thinking_level: 'Very High',
    thinking_budget_tokens: 32000,
    can_spawn_subswarm: false, // MANDATORY: Restricted solo worker!
    cli_template: 'openai api chat.completions.create --model {{model}} --input "{{prompt}}" --workdir "{{worktree_dir}}"',
    api_key_env_var: 'OPENAI_API_KEY',
    quota: {
      max_tokens: 1500000,
      tokens_used: 0,
      max_cost_usd: 30.0,
      cost_usd_accumulated: 0.0,
    },
  },

  // Cubicles 4-16: Blank / Unassigned slots
  ...Array.from({ length: 13 }, (_, i) => {
    const slotIndex = i + 3;
    const num = String(slotIndex + 1).padStart(2, '0');
    return {
      id: `cubicle-${num}`,
      slot_index: slotIndex,
      row: Math.floor(slotIndex / 4),
      col: slotIndex % 4,
      enabled: false,
      brand: null,
      model: null,
      display_name: `Unassigned Slot ${num}`,
      thinking_level: 'Medium' as const,
      thinking_budget_tokens: 0,
      can_spawn_subswarm: false,
      cli_template: '',
      api_key_env_var: '',
      quota: {
        max_tokens: 1000000,
        tokens_used: 0,
        max_cost_usd: 0.0,
        cost_usd_accumulated: 0.0,
      },
    };
  }),
];
```

---

## 9. Recommended File Layout & Module Breakdown under `src/server/`

To maintain modularity and clean separation of concerns, the implementation under `src/server/` should follow this structure:

```
src/
└── server/
    ├── index.ts                      # Server bootstrap (Fastify + ws)
    ├── types/
    │   ├── cubicle.ts                # TypeScript interfaces, enums, DTOs
    │   ├── cubicle-defaults.ts       # 16-slot default pre-configuration array
    │   └── events.ts                 # Real-time WebSocket event payloads
    ├── cubicle-manager.ts            # State machine, 16-slot registry, status persistence
    ├── cli-engine.ts                 # CLI template interpolation, child process execution
    ├── quota-tracker.ts              # Token accounting, fatigue math, stamina tiering
    ├── capability-matrix.ts          # Feature 2 (Explorer M1-2): Sub-swarm capability rules
    ├── worktree-manager.ts           # Feature 3 (Spec Miner M1-3): Git worktrees & junctions
    ├── routes/
    │   ├── cubicle-routes.ts         # REST endpoints for cubicle CRUD & operations
    │   └── task-routes.ts            # REST endpoints for taskboard
    └── websocket-bus.ts              # Broadcast manager for Panopticon UI clients
```

### Module Responsibilities:

1. **`cubicle-manager.ts`**:
   - Manages the in-memory array of 16 `CubicleLiveState` objects.
   - Loads and persists `.swarm/roster.json` and `.swarm/status/cubicle-XX.json`.
   - Validates and performs state transitions: `transitionState(cubicleId, newStatus, reason)`.
   - Broadcasts `CUBICLE_STATE_UPDATED` events over WebSocket on every transition.
   - Emits heartbeats every 1,000 ms.

2. **`cli-engine.ts`**:
   - Compiles command templates using `interpolateTemplate()`.
   - Writes prompt files to `.swarm/tasks/tmp/` to avoid shell command length limitations.
   - Spawns child processes with isolated working directory (`worktrees/cubicle-XX`).
   - Hooks stdout/stderr streams to capture surface thoughts and progress milestones.
   - Provides process management: cancellation, graceful SIGTERM, and forceful tree kill on Windows (`taskkill /F /T /PID`).

3. **`quota-tracker.ts`**:
   - Pure mathematical functions for `calculateStamina(maxTokens, usedTokens)`.
   - Tier classifier `getStaminaTier(staminaPercent)`.
   - Accounting updates for token usage and USD expenditures.

4. **`routes/cubicle-routes.ts`**:
   - `GET /api/cubicles`: Returns full 16-cubicle roster with live states.
   - `GET /api/cubicles/:id`: Returns detailed state and telemetry for a single slot.
   - `PUT /api/cubicles/:id/configure`: Updates configuration (model, brand, template, quota).
   - `POST /api/cubicles/:id/recharge`: Replenishes token quota and resets exhausted state.
   - `POST /api/cubicles/:id/reset`: Clears errors or resets slot to idle.

---

## 10. Verification Method & Acceptance Criteria for Downstream Builders

### 10.1 Unit & Integration Test Suite (`test/unit/cubicle-roster.test.ts`)

Builders can independently verify Feature 1 compliance by running:
`npm test test/unit/cubicle-roster.test.ts`

The test suite must verify:
1. **Roster Completeness**: Exactly 16 cubicle slots exist (`cubicle-01` to `cubicle-16`), arranged in a 4x4 matrix with correct `(row, col)` coordinates.
2. **Pre-Configuration Verification**:
   - Cubicles 1 & 2 are `Gemini 4 Argon (High)` with `can_spawn_subswarm === true`, `status === 'idle'`.
   - Cubicle 3 is `GPT Astra (Very High)` with `can_spawn_subswarm === false`, `status === 'idle'`.
   - Cubicles 4–16 are `enabled === false`, `status === 'vacant'`.
3. **Pluggable Template Interpolation**:
   - Testing parameter substitution of `{{model}}`, `{{prompt}}`, `{{prompt_file}}`, `{{worktree_dir}}`, `{{thinking_budget}}`.
   - Verifying shell parameter escaping on Windows.
4. **Lifecycle State Transitions**:
   - Validating legal transitions (`idle -> working`, `working -> under_inspection`, `working -> error`, etc.).
   - Rejecting illegal transitions (e.g., `vacant -> working` directly throws `InvalidTransitionError`).
5. **Fatigue Mathematical Precision**:
   - $Q_{\text{max}} = 2000000, Q_{\text{used}} = 0 \implies S = 100\%$ (Energized).
   - $Q_{\text{max}} = 2000000, Q_{\text{used}} = 1000000 \implies S = 50\%$ (Fatigued).
   - $Q_{\text{max}} = 2000000, Q_{\text{used}} = 1800000 \implies S = 10\%$ (Critical Strain).
   - $Q_{\text{max}} = 2000000, Q_{\text{used}} = 2000000 \implies S = 0\%$ (Exhausted, state flips to `'exhausted'`).

---

**Report complete. Ready for handoff to Milestone 1 Builder Agents.**
