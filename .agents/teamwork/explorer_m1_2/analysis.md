# Technical Exploration & Architectural Specification: Milestone 1, Component B
# Thinking-Tier-Gated Sub-Swarm Spawning Matrix (Feature 2)

**Author**: Explorer M1-2  
**Date**: 2026-10-26  
**Status**: Ready for Implementation (Milestone 1)  
**Target Codebase**: `src/server/capability-matrix.ts`, `src/server/subswarm-manager.ts`  
**Working Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m1_2`

---

## 1. Executive Summary & Problem Boundary

In the Symlinked Agent Swarm System, individual cubicle workers tackle complex engineering goals by decomposing them into parallel micro-tasks executed by ephemeral child workers. However, unchecked autonomous sub-agent spawning introduces severe failure modes:
1. **Recursive Runaway Fork-Bombs**: A sub-agent spawning child agents, which spawn grandchild agents, causing exponential token exhaustion, Git branch thrashing, and OS thread starvation.
2. **Reasoning Drift & Hallucinated Contracts**: Models with limited reasoning horizons or insufficient thinking budgets (< 16,000 tokens) cannot reliably synthesize multi-file architecture or coordinate concurrent child workers.
3. **Specific Model Behavioral Restrictions**: As mandated in `ORIGINAL_REQUEST.md §R2`, `GPT Astra (Very High)` operates strictly as a solo worker (`can_spawn_subswarm: false`), whereas `Gemini 4 Argon (High)` and `GPT Astra (Ultra)` possess full multi-swarm spawning authority (`can_spawn_subswarm: true`).

This specification establishes the complete technical design for **Feature 2: Thinking-Tier-Gated Sub-Swarm Spawning Matrix**, delivering:
- A deterministic, rule-based **Thinking-Tier Capability Matrix** evaluating model family, pattern, thinking level, and token budgets.
- A hard **Recursion Depth Enforcer** (`max_depth = 1`) preventing any child agent from spawning sub-swarms.
- A structured, isolated **Sub-Swarm Filesystem Hierarchy** under `.swarm/subswarms/cubicle-XX/` containing `manifest.json`, decomposed `subtasks/`, `telemetry/`, and `patches/`.
- An automated **Patch Consolidation Pipeline** applying and verifying child worker diffs sequentially into the parent cubicle's Git worktree branch (`swarm/cubicle-XX`).
- Real-time **Capability Violation Interception & Structured Incident Logging** appending to `.swarm/logs/incidents.jsonl` and broadcasting UI alert events that swivel the **Twin Eyes of Sauron** (`Consul I` and `Consul II`) to lock red surveillance spotlights onto the offending cubicle.

---

## 2. Thinking-Tier Capability Matrix Architecture

### 2.1 Capability Rules & Model Reasoning Hierarchy

Sub-swarm spawning requires the parent agent to formulate formal JSON interface contracts, delegate execution, inspect patch outputs, and perform Git 3-way conflict resolution. The engine gates this capability strictly based on verified reasoning depth:

| AI Brand & Model Pattern | Thinking Tier | Nominal Reasoning Budget | `can_spawn_subswarm` | Status | Engineering Rationale |
|---|---|---|---|---|---|
| **Gemini 4 Argon** (`gemini-4-argon*`) | `High` | 16,000 tokens | **`true`** | **Authorized** | Pre-configured in Cubicles 1 & 2. Frontier multi-step planning and code synthesis. |
| **GPT Astra** (`gpt-astra*`) | `Very High` | 32,000 tokens | **`false`** | **RESTRICTED** | Pre-configured in Cubicle 3. Strictly restricted solo worker to prevent coordination drift. |
| **GPT Astra** (`gpt-astra*`) | `Ultra` | 64,000 tokens | **`true`** | **Authorized** | Top-tier deep reflection mode with verified multi-agent task orchestration capability. |
| **GPT Astra** (`gpt-astra*`) | `Low` / `Medium` / `High` | < 32,000 tokens | **`false`** | **RESTRICTED** | Astra models below Ultra do not meet multi-swarm autonomy guarantees. |
| **Gemini 4 Argon** (`gemini-4-argon*`) | `Ultra` | 32,000+ tokens | **`true`** | **Authorized** | Full autonomous sub-swarm authority. |
| **Claude 3.7 Sonnet** (`claude-3-7-sonnet*`) | `High` / `Very High` / `Ultra` | 16,000 – 64,000 | **`true`** | **Authorized** | Extended thinking mode validated for multi-file architecture. |
| **Claude 3.7 Sonnet** | `Low` / `Medium` | < 8,000 tokens | **`false`** | **RESTRICTED** | Insufficient planning horizon for recursive delegation. |
| **DeepSeek R1** (`deepseek-r1*`) | `High` / `Very High` / `Ultra` | 16,000+ tokens | **`true`** | **Authorized** | Mathematical reasoning and code decomposition validated. |
| **All Models (Universal Baseline)** | `Low` / `Medium` | < 8,000 tokens | **`false`** | **RESTRICTED** | Universal hard block on shallow reasoning models. |
| **Custom CLI** | *Any* | N/A | *Configurable* | User Defined | Defaults to `false`; requires explicit user toggle in cubicle config. |

### 2.2 Evaluation Priority Cascade & Decision Algorithm

When a spawn request is evaluated, the engine evaluates rules in strict hierarchical order:

```
[Spawn Request: cubicle_id, brand, model, thinking_tier, current_depth, manual_override]
                                      |
                                      v
                     +---------------------------------+
                     | 1. Recursion Depth Check:       |
                     |    current_depth >= max_depth?  |
                     +---------------------------------+
                                      |
                      YES             | NO
         +----------------------------+
         v                            v
[THROW: MAX_RECURSION_        +---------------------------------+
 DEPTH_EXCEEDED]              | 2. User Manual Override:        |
                              |    manual_override is set?      |
                              +---------------------------------+
                                      |
                      YES             | NO
         +----------------------------+
         v                            v
[RETURN: Override Decision]   +---------------------------------+
                              | 3. Explicit Model Rule Match:   |
                              |    e.g. gpt-astra + Very High   |
                              |    or gemini-4-argon + High     |
                              +---------------------------------+
                                      |
                      MATCH           | NO MATCH
         +----------------------------+
         v                            v
[RETURN: Matched Rule Status] +---------------------------------+
                              | 4. Brand Fallback Baseline:     |
                              |    Evaluate thinking_tier       |
                              |    against brand thresholds     |
                              +---------------------------------+
                                      |
                                      v
                              [RETURN: Default Decision]
```

### 2.3 Concrete TypeScript Specification: `src/server/capability-matrix.ts`

```typescript
/**
 * src/server/capability-matrix.ts
 * Thinking-Tier Capability Matrix & Gating Enforcer
 */

export type AIBrand = 'Gemini' | 'GPT / OpenAI' | 'Claude / Anthropic' | 'DeepSeek' | 'Custom CLI';

export type ThinkingTier = 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra';

export interface CapabilityRule {
  id: string;
  model_pattern: string; // RegExp pattern or glob string
  brand?: AIBrand;
  thinking_tier: ThinkingTier;
  can_spawn_subswarm: boolean;
  max_sub_workers: number; // Maximum allowed child drones (typically 2 to 4)
  description: string;
  priority: number; // Higher number = higher precedence
}

export interface CapabilityEvaluationRequest {
  cubicle_id: string;
  brand: AIBrand;
  model: string;
  thinking_tier: ThinkingTier;
  thinking_budget_tokens?: number;
  current_depth?: number; // 0 = parent cubicle, 1 = child sub-agent
  manual_override?: boolean;
}

export interface CapabilityEvaluationResult {
  allowed: boolean;
  cubicle_id: string;
  brand: AIBrand;
  model: string;
  thinking_tier: ThinkingTier;
  current_depth: number;
  max_sub_workers: number;
  reason: string;
  matched_rule_id?: string;
  is_override: boolean;
  error_code?: 'CAPABILITY_RESTRICTION_ERROR' | 'MAX_RECURSION_DEPTH_EXCEEDED';
}

export class CapabilityRestrictionError extends Error {
  public readonly code = 'CAPABILITY_RESTRICTION_ERROR';
  public readonly statusCode = 403;
  public readonly cubicle_id: string;
  public readonly model: string;
  public readonly thinking_tier: ThinkingTier;
  public readonly violation_type: string;
  public readonly incident_id: string;

  constructor(params: {
    cubicle_id: string;
    model: string;
    thinking_tier: ThinkingTier;
    violation_type: string;
    incident_id: string;
    message: string;
  }) {
    super(params.message);
    this.name = 'CapabilityRestrictionError';
    this.cubicle_id = params.cubicle_id;
    this.model = params.model;
    this.thinking_tier = params.thinking_tier;
    this.violation_type = params.violation_type;
    this.incident_id = params.incident_id;
    Object.setPrototypeOf(this, CapabilityRestrictionError.prototype);
  }
}

export class MaxRecursionDepthError extends CapabilityRestrictionError {
  public override readonly code = 'MAX_RECURSION_DEPTH_EXCEEDED' as any;

  constructor(params: {
    cubicle_id: string;
    model: string;
    thinking_tier: ThinkingTier;
    incident_id: string;
    current_depth: number;
    max_depth: number;
  }) {
    super({
      cubicle_id: params.cubicle_id,
      model: params.model,
      thinking_tier: params.thinking_tier,
      violation_type: 'MAX_RECURSION_DEPTH_EXCEEDED',
      incident_id: params.incident_id,
      message: `Maximum sub-swarm recursion depth exceeded for ${params.cubicle_id}: current depth ${params.current_depth} >= max depth ${params.max_depth}. Sub-agents cannot spawn nested sub-agents.`
    });
    this.name = 'MaxRecursionDepthError';
    Object.setPrototypeOf(this, MaxRecursionDepthError.prototype);
  }
}

export const DEFAULT_CAPABILITY_RULES: CapabilityRule[] = [
  // 1. Mandatory Core Rule: Gemini 4 Argon (High) -> Allowed
  {
    id: 'rule-gemini-4-argon-high',
    model_pattern: '^gemini-4-argon.*$',
    brand: 'Gemini',
    thinking_tier: 'High',
    can_spawn_subswarm: true,
    max_sub_workers: 3,
    description: 'Gemini 4 Argon at High thinking tier: fully authorized for sub-swarm decomposition.',
    priority: 100
  },
  // 2. Mandatory Core Rule: GPT Astra (Very High) -> RESTRICTED SOLO WORKER
  {
    id: 'rule-gpt-astra-very-high-restricted',
    model_pattern: '^gpt-astra.*$',
    brand: 'GPT / OpenAI',
    thinking_tier: 'Very High',
    can_spawn_subswarm: false,
    max_sub_workers: 0,
    description: 'GPT Astra at Very High thinking tier: STRICTLY RESTRICTED to solo worker mode. Sub-swarms disallowed.',
    priority: 100
  },
  // 3. Mandatory Core Rule: GPT Astra (Ultra) -> Allowed
  {
    id: 'rule-gpt-astra-ultra',
    model_pattern: '^gpt-astra.*$',
    brand: 'GPT / OpenAI',
    thinking_tier: 'Ultra',
    can_spawn_subswarm: true,
    max_sub_workers: 4,
    description: 'GPT Astra at Ultra thinking tier: authorized for multi-swarm decomposition.',
    priority: 100
  },
  // 4. GPT Astra (Low / Medium / High) -> Restricted
  {
    id: 'rule-gpt-astra-lower-tiers',
    model_pattern: '^gpt-astra.*$',
    brand: 'GPT / OpenAI',
    thinking_tier: 'High',
    can_spawn_subswarm: false,
    max_sub_workers: 0,
    description: 'GPT Astra at High tier: restricted. Sub-swarms require Ultra tier.',
    priority: 90
  },
  // 5. Gemini 4 Argon (Ultra) -> Allowed
  {
    id: 'rule-gemini-4-argon-ultra',
    model_pattern: '^gemini-4-argon.*$',
    brand: 'Gemini',
    thinking_tier: 'Ultra',
    can_spawn_subswarm: true,
    max_sub_workers: 4,
    description: 'Gemini 4 Argon at Ultra thinking tier: authorized for multi-swarm decomposition.',
    priority: 95
  },
  // 6. Claude 3.7 Sonnet (High / Very High / Ultra) -> Allowed
  {
    id: 'rule-claude-3-7-sonnet-high',
    model_pattern: '^claude-3-7-sonnet.*$',
    brand: 'Claude / Anthropic',
    thinking_tier: 'High',
    can_spawn_subswarm: true,
    max_sub_workers: 3,
    description: 'Claude 3.7 Sonnet at High thinking tier: authorized.',
    priority: 80
  },
  {
    id: 'rule-claude-3-7-sonnet-ultra',
    model_pattern: '^claude-3-7-sonnet.*$',
    brand: 'Claude / Anthropic',
    thinking_tier: 'Ultra',
    can_spawn_subswarm: true,
    max_sub_workers: 4,
    description: 'Claude 3.7 Sonnet at Ultra thinking tier: authorized.',
    priority: 80
  },
  // 7. DeepSeek R1 (High / Very High / Ultra) -> Allowed
  {
    id: 'rule-deepseek-r1-high',
    model_pattern: '^deepseek-r1.*$',
    brand: 'DeepSeek',
    thinking_tier: 'High',
    can_spawn_subswarm: true,
    max_sub_workers: 3,
    description: 'DeepSeek R1 at High thinking tier: authorized.',
    priority: 80
  },
  // 8. Universal Low / Medium blocks
  {
    id: 'rule-universal-low-tier',
    model_pattern: '.*',
    thinking_tier: 'Low',
    can_spawn_subswarm: false,
    max_sub_workers: 0,
    description: 'Universal block: Low thinking tier models cannot coordinate sub-swarms.',
    priority: 10
  },
  {
    id: 'rule-universal-medium-tier',
    model_pattern: '.*',
    thinking_tier: 'Medium',
    can_spawn_subswarm: false,
    max_sub_workers: 0,
    description: 'Universal block: Medium thinking tier models cannot coordinate sub-swarms.',
    priority: 10
  }
];

export class CapabilityMatrix {
  private rules: CapabilityRule[];
  public readonly max_depth: number = 1;

  constructor(initialRules: CapabilityRule[] = DEFAULT_CAPABILITY_RULES) {
    // Sort descending by priority
    this.rules = [...initialRules].sort((a, b) => b.priority - a.priority);
  }

  public evaluate(req: CapabilityEvaluationRequest): CapabilityEvaluationResult {
    const currentDepth = req.current_depth ?? 0;

    // Gate 1: Recursion depth enforcement
    if (currentDepth >= this.max_depth) {
      return {
        allowed: false,
        cubicle_id: req.cubicle_id,
        brand: req.brand,
        model: req.model,
        thinking_tier: req.thinking_tier,
        current_depth: currentDepth,
        max_sub_workers: 0,
        reason: `Maximum recursion depth of ${this.max_depth} reached. Child micro-workers cannot spawn nested sub-swarms.`,
        is_override: false,
        error_code: 'MAX_RECURSION_DEPTH_EXCEEDED'
      };
    }

    // Gate 2: Explicit manual override
    if (typeof req.manual_override === 'boolean') {
      return {
        allowed: req.manual_override,
        cubicle_id: req.cubicle_id,
        brand: req.brand,
        model: req.model,
        thinking_tier: req.thinking_tier,
        current_depth: currentDepth,
        max_sub_workers: req.manual_override ? 3 : 0,
        reason: `User manual override applied: sub-swarm spawning is ${req.manual_override ? 'FORCE-ENABLED' : 'FORCE-DISABLED'}.`,
        is_override: true
      };
    }

    // Gate 3: Match against ordered rule set
    for (const rule of this.rules) {
      // Check brand match if specified in rule
      if (rule.brand && rule.brand !== req.brand) {
        continue;
      }

      // Check thinking tier match
      if (rule.thinking_tier !== req.thinking_tier) {
        continue;
      }

      // Check regex model match
      const regex = new RegExp(rule.model_pattern, 'i');
      if (regex.test(req.model)) {
        return {
          allowed: rule.can_spawn_subswarm,
          cubicle_id: req.cubicle_id,
          brand: req.brand,
          model: req.model,
          thinking_tier: req.thinking_tier,
          current_depth: currentDepth,
          max_sub_workers: rule.can_spawn_subswarm ? rule.max_sub_workers : 0,
          reason: rule.description,
          matched_rule_id: rule.id,
          is_override: false,
          error_code: rule.can_spawn_subswarm ? undefined : 'CAPABILITY_RESTRICTION_ERROR'
        };
      }
    }

    // Gate 4: Family Fallback baseline
    const fallbackAllowed = req.thinking_tier === 'Ultra';
    return {
      allowed: fallbackAllowed,
      cubicle_id: req.cubicle_id,
      brand: req.brand,
      model: req.model,
      thinking_tier: req.thinking_tier,
      current_depth: currentDepth,
      max_sub_workers: fallbackAllowed ? 2 : 0,
      reason: fallbackAllowed
        ? `Model '${req.model}' allowed under generic Ultra thinking tier baseline.`
        : `Model '${req.model}' restricted: thinking tier '${req.thinking_tier}' does not qualify for sub-swarm generation.`,
      is_override: false,
      error_code: fallbackAllowed ? undefined : 'CAPABILITY_RESTRICTION_ERROR'
    };
  }

  public assertCanSpawn(req: CapabilityEvaluationRequest, incidentId: string): CapabilityEvaluationResult {
    const res = this.evaluate(req);
    if (!res.allowed) {
      if (res.error_code === 'MAX_RECURSION_DEPTH_EXCEEDED') {
        throw new MaxRecursionDepthError({
          cubicle_id: req.cubicle_id,
          model: req.model,
          thinking_tier: req.thinking_tier,
          incident_id: incidentId,
          current_depth: res.current_depth,
          max_depth: this.max_depth
        });
      }

      throw new CapabilityRestrictionError({
        cubicle_id: req.cubicle_id,
        model: req.model,
        thinking_tier: req.thinking_tier,
        violation_type: 'UNAUTHORIZED_SUBSWARM_SPAWN',
        incident_id: incidentId,
        message: `Capability Restriction: ${req.cubicle_id} (${req.model} [${req.thinking_tier}]) is restricted from spawning sub-swarms. ${res.reason}`
      });
    }
    return res;
  }

  public getRules(): CapabilityRule[] {
    return [...this.rules];
  }

  public setRules(newRules: CapabilityRule[]): void {
    this.rules = [...newRules].sort((a, b) => b.priority - a.priority);
  }
}
```

---

## 3. Sub-Swarm Lifecycle & Directory Hierarchy

### 3.1 Filesystem Hierarchy under `.swarm/subswarms/cubicle-XX/`

All sub-swarm assets are compartmentalized by cubicle identifier:

```
<project-root>/.swarm/subswarms/
└── cubicle-01/
    ├── manifest.json                  # Sub-swarm metadata, status, subtasks summary
    ├── subtasks/
    │   ├── subtask-01.json            # Micro-task 1 specification & live progress
    │   ├── subtask-02.json            # Micro-task 2 specification & live progress
    │   └── subtask-03.json            # Micro-task 3 specification & live progress
    ├── telemetry/
    │   ├── child-01.log               # CLI stdout/stderr from child worker 1
    │   ├── child-02.log               # CLI stdout/stderr from child worker 2
    │   └── child-03.log               # CLI stdout/stderr from child worker 3
    └── patches/
        ├── subtask-01.patch           # Unified Git diff produced by child worker 1
        ├── subtask-02.patch           # Unified Git diff produced by child worker 2
        └── subtask-03.patch           # Unified Git diff produced by child worker 3
```

### 3.2 Sub-Swarm Lifecycle State Transitions

```
               +---------------------------------------+
               |                 IDLE                  |
               +---------------------------------------+
                                   | (spawnSubswarm called)
                                   v
               +---------------------------------------+
               |               PLANNING                |
               | (Decompose parent task into subtasks) |
               +---------------------------------------+
                                   |
                                   v
               +---------------------------------------+
               |               RUNNING                 |
               |  (Parallel micro-workers executing,   |
               |   orbiting drones animated in UI)     |
               +---------------------------------------+
                    |                             |
      (All subtasks complete)        (Fatal child error or timeout)
                    |                             |
                    v                             v
   +---------------------------------+   +---------------------------------+
   |          CONSOLIDATING          |   |             FAILED              |
   | (git apply --check, sequential  |   | (Record incident, reset worktree|
   |  apply, test verification)      |   |  state, alert Panopticon)       |
   +---------------------------------+   +---------------------------------+
          |                     |
     (Tests Pass)        (Conflicts/Tests Fail)
          |                     |
          v                     v
   +--------------+      +--------------+
   |  COMPLETED   |      |   ABORTED    |
   | (Commit to   |      | (Rollback    |
   |  worktree,   |      |  patches,    |
   |  move task to|      |  re-queue)   |
   |  'review/')  |      +--------------+
   +--------------+
```

### 3.3 Micro-Task Schema & Progress Aggregation

Each micro-task in `subtasks/subtask-XX.json` contains:
```json
{
  "subtask_id": "subtask-01",
  "title": "Implement CapabilityMatrix class",
  "instructions": "Create src/server/capability-matrix.ts implementing rule evaluation and depth checks.",
  "status": "in_progress",
  "assigned_child_worker": "child-01",
  "created_at": "2026-10-26T00:28:00.000Z",
  "started_at": "2026-10-26T00:28:05.120Z",
  "completed_at": null,
  "patch_file": "patches/subtask-01.patch",
  "progress_percent": 65,
  "output_summary": "Created type definitions and default rule set. Adding evaluation unit tests."
}
```

The overall sub-swarm progress is calculated deterministically as:
$$\text{Total Sub-Swarm Progress \%} = \frac{\sum_{i=1}^{N} \text{Subtask}_i.\text{progress\_percent}}{N}$$

When active, the cubicle card in the Left Panopticon Grid displays:
- AI mascot surrounded by $N$ animated **orbiting drone icons** representing the active child workers.
- HUD sub-ticker: `[SUB-SWARM ACTIVE: 3 Drones | 65% Consolidating]`.

### 3.4 Patch Consolidation & Git Integration into Parent Worktree Branch

When all child subtasks complete with generated `.patch` files:
1. **Pre-flight Check**: In parent worktree (`worktrees/cubicle-XX/` on branch `swarm/cubicle-XX`), verify no uncommitted dirty working files exist (`git status --porcelain`).
2. **Patch Validation**: Sequentially execute:
   ```powershell
   git apply --check --whitespace=fix ".swarm/subswarms/cubicle-XX/patches/subtask-01.patch"
   ```
   If `--check` fails, attempt 3-way merge test:
   ```powershell
   git apply --3way --check ".swarm/subswarms/cubicle-XX/patches/subtask-01.patch"
   ```
3. **Sequential Application**: Apply each patch in order:
   ```powershell
   git apply --whitespace=fix ".swarm/subswarms/cubicle-XX/patches/subtask-XX.patch"
   ```
4. **Integration Verification**: Run the configured verification command (e.g. `npm test`):
   - If tests succeed:
     ```powershell
     git add .
     git commit -m "feat(cubicle-XX): consolidate sub-swarm patches for task <parent_task_id>"
     ```
     Transition parent task from `.swarm/tasks/in_progress/` to `.swarm/tasks/review/` for Roman Dual-Consul review!
   - If tests fail:
     Rollback dirty files via `git checkout -- .` and `git clean -fd`. Log consolidation failure incident.

---

## 4. Violation Handling, Incident Logging & Twin Eyes of Sauron UI Reaction

### 4.1 Unauthorized Spawn Interception

When an unauthorized worker (e.g. Cubicle 3 `GPT Astra (Very High)`) calls `spawnSubswarm()`:
1. `CapabilityMatrix.assertCanSpawn()` evaluates the request.
2. Identifies matching rule `rule-gpt-astra-very-high-restricted` (`can_spawn_subswarm: false`).
3. Generates unique incident ID: `INC-20261026-XXXX`.
4. Appends structured JSON record to `.swarm/logs/incidents.jsonl`.
5. Emits real-time WebSocket event `INCIDENT_ALERT` across the server event bus.
6. Throws `CapabilityRestrictionError` with HTTP 403 status.

### 4.2 Structured Incident Record (`.swarm/logs/incidents.jsonl`)

The incident file is an append-only JSON Lines (`.jsonl`) log:

```json
{
  "incident_id": "INC-20261026-B812",
  "timestamp": "2026-10-26T00:29:44.215Z",
  "severity": "CRITICAL",
  "category": "CAPABILITY_VIOLATION",
  "cubicle_id": "cubicle-03",
  "model": "gpt-astra",
  "thinking_tier": "Very High",
  "violation_type": "UNAUTHORIZED_SUBSWARM_SPAWN",
  "message": "Cubicle 03 (GPT Astra Very High) attempted unauthorized sub-swarm initialization. Sub-swarm spawning requires Ultra thinking tier or Gemini Argon High.",
  "action_taken": "BLOCKED_AND_ISOLATED",
  "metadata": {
    "attempted_depth": 1,
    "max_allowed_depth": 1,
    "rule_id": "rule-gpt-astra-very-high-restricted"
  },
  "remediation_options": [
    {
      "id": "upgrade_model",
      "label": "Upgrade Cubicle 3 to GPT Astra (Ultra)",
      "action": "UPGRADE_MODEL",
      "target_tier": "Ultra"
    },
    {
      "id": "convert_solo",
      "label": "Enforce Solo Worker Execution",
      "action": "CONVERT_TO_SOLO"
    },
    {
      "id": "manual_override",
      "label": "Authorize Manual Gate Bypass",
      "action": "MANUAL_BYPASS"
    }
  ]
}
```

### 4.3 Twin Eyes of Sauron Convergence & Panopticon UI Reaction

To satisfy the **Roman Dual-Consul Overseer System & Twin Eyes of Sauron** mandate (`ORIGINAL_REQUEST Follow-up §2`), the violation triggers a coordinated visual reaction:

```
[Unauthorized Spawn Detected in Cubicle 03]
                     |
                     v
  [Broadcast WebSocket: INCIDENT_ALERT]
                     |
       +-------------+-------------+
       |                           |
       v                           v
[Left Panopticon Section]     [Center Section]
- Twin Eyes of Sauron         - Error & Incident Feed
  (Consul I & Consul II)        appends critical red strobe
  swivel spotlight beams to     alert banner with remediation
  CONVERGE onto Cubicle 03.     buttons.
- Beam color: #ff0033         - Overseer chat terminal emits:
- Cubicle 03 border pulses      "CONSULAR ALERT: Capability
  critical crimson strobe.      violation intercepted in Cubicle 03."
- Cubicle state -> 'error'.
```

#### Coordinate Raycasting for Twin Spotlights:
In `src/public/js/twin-sauron-canvas.js`:
- `Consul I` Eye is located at $(X_1, Y_1) = (25\%, 15\%)$ of the Left Section canvas.
- `Consul II` Eye is located at $(X_2, Y_2) = (75\%, 15\%)$ of the Left Section canvas.
- Target `cubicle-03` is located at $(X_t, Y_t)$ in the 4x4 grid (Row 0, Col 2).
- On `INCIDENT_ALERT` targeting `cubicle-03`, both spotlight vectors $\vec{v}_1 = (X_t - X_1, Y_t - Y_1)$ and $\vec{v}_2 = (X_t - X_2, Y_t - Y_2)$ animate with high acceleration (damping coefficient 0.85) to lock both beams directly on `cubicle-03`.

---

## 5. Concrete TypeScript Specification: `src/server/subswarm-manager.ts`

```typescript
/**
 * src/server/subswarm-manager.ts
 * Sub-Swarm Lifecycle, Directory Management & Patch Consolidation Engine
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CapabilityMatrix,
  CapabilityRestrictionError,
  MaxRecursionDepthError,
  AIBrand,
  ThinkingTier
} from './capability-matrix.js';

const execAsync = promisify(exec);

export type SubswarmStatus =
  | 'idle'
  | 'planning'
  | 'spawning'
  | 'running'
  | 'consolidating'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface SubtaskNode {
  subtask_id: string; // e.g., "subtask-01"
  title: string;
  instructions: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assigned_child_worker: string; // e.g., "child-01"
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  patch_file: string; // relative to .swarm/subswarms/<cubicle>/patches/
  progress_percent: number; // 0 to 100
  output_summary?: string;
  error?: string;
}

export interface ConsolidationReport {
  timestamp: string;
  cubicle_id: string;
  parent_task_id: string;
  applied_patches: string[];
  conflicting_patches: string[];
  verification_passed: boolean;
  commit_sha?: string;
  error?: string;
}

export interface SubswarmManifest {
  subswarm_id: string;
  cubicle_id: string;
  parent_task_id: string;
  goal: string;
  depth: number;
  max_depth: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  status: SubswarmStatus;
  subtasks: SubtaskNode[];
  active_drones_count: number;
  total_progress_percent: number;
  consolidation_strategy: 'sequential_patch' | 'squash_merge';
  verification_command: string;
  consolidation_report?: ConsolidationReport;
}

export interface RemediationOption {
  id: string;
  label: string;
  action: 'UPGRADE_MODEL' | 'CONVERT_TO_SOLO' | 'MANUAL_BYPASS';
  target_tier?: ThinkingTier;
}

export interface IncidentRecord {
  incident_id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'ERROR' | 'WARNING';
  category: 'CAPABILITY_VIOLATION' | 'CONSOLIDATION_FAILURE' | 'EXECUTION_CRASH';
  cubicle_id: string;
  model: string;
  thinking_tier: ThinkingTier;
  violation_type: string;
  message: string;
  action_taken: string;
  metadata?: Record<string, any>;
  remediation_options: RemediationOption[];
}

export interface SpawnSubswarmParams {
  cubicle_id: string;
  brand: AIBrand;
  model: string;
  thinking_tier: ThinkingTier;
  thinking_budget_tokens?: number;
  current_depth?: number;
  manual_override?: boolean;
  parent_task_id: string;
  goal: string;
  verification_command?: string;
}

export interface SubswarmManagerOptions {
  swarmDir: string;
  worktreesDir: string;
  capabilityMatrix: CapabilityMatrix;
  broadcastEvent?: (event: any) => void;
}

export class SubswarmManager {
  private swarmDir: string;
  private worktreesDir: string;
  private matrix: CapabilityMatrix;
  private broadcastEvent: (event: any) => void;

  constructor(options: SubswarmManagerOptions) {
    this.swarmDir = path.resolve(options.swarmDir);
    this.worktreesDir = path.resolve(options.worktreesDir);
    this.matrix = options.capabilityMatrix;
    this.broadcastEvent = options.broadcastEvent ?? (() => {});
  }

  /**
   * Evaluates capability matrix, initializes directory structure, writes manifest.json.
   * Intercepts violations, logs incident, emits Twin Eyes UI alert, and throws error if unauthorized.
   */
  public async spawnSubswarm(params: SpawnSubswarmParams): Promise<SubswarmManifest> {
    const incidentId = this.generateIncidentId();
    const currentDepth = params.current_depth ?? 0;

    // 1. Enforce Capability Matrix Gate
    try {
      this.matrix.assertCanSpawn(
        {
          cubicle_id: params.cubicle_id,
          brand: params.brand,
          model: params.model,
          thinking_tier: params.thinking_tier,
          thinking_budget_tokens: params.thinking_budget_tokens,
          current_depth: currentDepth,
          manual_override: params.manual_override
        },
        incidentId
      );
    } catch (err: any) {
      // 2. Intercept violation & log structured incident
      const incident: IncidentRecord = {
        incident_id: incidentId,
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL',
        category: 'CAPABILITY_VIOLATION',
        cubicle_id: params.cubicle_id,
        model: params.model,
        thinking_tier: params.thinking_tier,
        violation_type: err.violation_type || 'UNAUTHORIZED_SUBSWARM_SPAWN',
        message: err.message,
        action_taken: 'BLOCKED_AND_ISOLATED',
        metadata: {
          attempted_depth: currentDepth + 1,
          max_allowed_depth: this.matrix.max_depth
        },
        remediation_options: [
          {
            id: 'upgrade_model',
            label: `Upgrade ${params.cubicle_id} to Ultra Tier`,
            action: 'UPGRADE_MODEL',
            target_tier: 'Ultra'
          },
          {
            id: 'convert_solo',
            label: 'Enforce Solo Worker Execution',
            action: 'CONVERT_TO_SOLO'
          },
          {
            id: 'manual_override',
            label: 'Authorize Manual Gate Bypass',
            action: 'MANUAL_BYPASS'
          }
        ]
      };

      await this.logIncident(incident);
      this.triggerTwinEyesAlert(incident);
      throw err;
    }

    // 3. Authorized -> Provision Subswarm Directory Hierarchy
    const subswarmDir = path.join(this.swarmDir, 'subswarms', params.cubicle_id);
    const subtasksDir = path.join(subswarmDir, 'subtasks');
    const telemetryDir = path.join(subswarmDir, 'telemetry');
    const patchesDir = path.join(subswarmDir, 'patches');

    await fs.mkdir(subtasksDir, { recursive: true });
    await fs.mkdir(telemetryDir, { recursive: true });
    await fs.mkdir(patchesDir, { recursive: true });

    const now = new Date().toISOString();
    const manifest: SubswarmManifest = {
      subswarm_id: `subswarm-${params.cubicle_id}-${Date.now()}`,
      cubicle_id: params.cubicle_id,
      parent_task_id: params.parent_task_id,
      goal: params.goal,
      depth: currentDepth + 1,
      max_depth: this.matrix.max_depth,
      created_at: now,
      updated_at: now,
      completed_at: null,
      status: 'planning',
      subtasks: [],
      active_drones_count: 0,
      total_progress_percent: 0,
      consolidation_strategy: 'sequential_patch',
      verification_command: params.verification_command ?? 'npm test'
    };

    const manifestPath = path.join(subswarmDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 4. Emit WebSocket Event: SUBSWARM_SPAWNED
    this.broadcastEvent({
      type: 'SUBSWARM_SPAWNED',
      timestamp: now,
      source: 'subswarm_manager',
      payload: {
        cubicle_id: params.cubicle_id,
        subswarm_id: manifest.subswarm_id,
        goal: manifest.goal,
        depth: manifest.depth
      }
    });

    return manifest;
  }

  /**
   * Registers child micro-tasks, creates subtask files, updates manifest.
   */
  public async dispatchSubtasks(
    cubicleId: string,
    subtasks: Array<{ title: string; instructions: string }>
  ): Promise<SubswarmManifest> {
    const subswarmDir = path.join(this.swarmDir, 'subswarms', cubicleId);
    const manifestPath = path.join(subswarmDir, 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest: SubswarmManifest = JSON.parse(raw);

    const now = new Date().toISOString();
    manifest.subtasks = subtasks.map((task, idx) => {
      const subtaskId = `subtask-${String(idx + 1).padStart(2, '0')}`;
      const childWorkerId = `child-${String(idx + 1).padStart(2, '0')}`;
      return {
        subtask_id: subtaskId,
        title: task.title,
        instructions: task.instructions,
        status: 'pending',
        assigned_child_worker: childWorkerId,
        created_at: now,
        started_at: null,
        completed_at: null,
        patch_file: `patches/${subtaskId}.patch`,
        progress_percent: 0
      };
    });

    manifest.active_drones_count = manifest.subtasks.length;
    manifest.status = 'running';
    manifest.updated_at = now;

    // Write micro-task JSON files
    for (const subtask of manifest.subtasks) {
      const subtaskFilePath = path.join(subswarmDir, 'subtasks', `${subtask.subtask_id}.json`);
      await fs.writeFile(subtaskFilePath, JSON.stringify(subtask, null, 2), 'utf8');
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    this.broadcastEvent({
      type: 'SUBSWARM_UPDATED',
      timestamp: now,
      source: 'subswarm_manager',
      payload: {
        cubicle_id: cubicleId,
        subswarm_id: manifest.subswarm_id,
        status: manifest.status,
        active_drones_count: manifest.active_drones_count,
        total_progress_percent: manifest.total_progress_percent
      }
    });

    return manifest;
  }

  /**
   * Updates progress of a specific subtask and recalculates aggregate sub-swarm progress.
   */
  public async updateSubtaskProgress(
    cubicleId: string,
    subtaskId: string,
    update: Partial<SubtaskNode>
  ): Promise<SubswarmManifest> {
    const subswarmDir = path.join(this.swarmDir, 'subswarms', cubicleId);
    const subtaskPath = path.join(subswarmDir, 'subtasks', `${subtaskId}.json`);
    const manifestPath = path.join(subswarmDir, 'manifest.json');

    const subtaskRaw = await fs.readFile(subtaskPath, 'utf8');
    const subtask: SubtaskNode = JSON.parse(subtaskRaw);
    Object.assign(subtask, update);
    await fs.writeFile(subtaskPath, JSON.stringify(subtask, null, 2), 'utf8');

    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest: SubswarmManifest = JSON.parse(manifestRaw);

    const targetIdx = manifest.subtasks.findIndex(s => s.subtask_id === subtaskId);
    if (targetIdx !== -1) {
      manifest.subtasks[targetIdx] = subtask;
    }

    const totalProgress = manifest.subtasks.reduce((sum, s) => sum + (s.progress_percent || 0), 0);
    manifest.total_progress_percent = Math.round(totalProgress / manifest.subtasks.length);
    manifest.updated_at = new Date().toISOString();

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    this.broadcastEvent({
      type: 'SUBSWARM_UPDATED',
      timestamp: manifest.updated_at,
      source: 'subswarm_manager',
      payload: {
        cubicle_id: cubicleId,
        subswarm_id: manifest.subswarm_id,
        subtask_id: subtaskId,
        progress_percent: manifest.total_progress_percent,
        active_drones_count: manifest.active_drones_count
      }
    });

    return manifest;
  }

  /**
   * Consolidates child worker patches into parent worktree branch.
   */
  public async consolidateResults(cubicleId: string): Promise<ConsolidationReport> {
    const subswarmDir = path.join(this.swarmDir, 'subswarms', cubicleId);
    const manifestPath = path.join(subswarmDir, 'manifest.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest: SubswarmManifest = JSON.parse(manifestRaw);

    manifest.status = 'consolidating';
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const parentWorktreeDir = path.join(this.worktreesDir, cubicleId);
    const patchesDir = path.join(subswarmDir, 'patches');

    const appliedPatches: string[] = [];
    const conflictingPatches: string[] = [];

    // 1. Check & Apply Patches Sequentially
    for (const subtask of manifest.subtasks) {
      const patchFilePath = path.join(patchesDir, `${subtask.subtask_id}.patch`);
      try {
        await fs.access(patchFilePath);
      } catch {
        // No patch generated for this subtask
        continue;
      }

      try {
        // Dry-run check
        await execAsync(`git apply --check --whitespace=fix "${patchFilePath}"`, { cwd: parentWorktreeDir });
        // Real apply
        await execAsync(`git apply --whitespace=fix "${patchFilePath}"`, { cwd: parentWorktreeDir });
        appliedPatches.push(subtask.subtask_id);
      } catch (err: any) {
        conflictingPatches.push(subtask.subtask_id);
      }
    }

    if (conflictingPatches.length > 0) {
      // Rollback uncommitted changes
      await execAsync('git checkout -- .', { cwd: parentWorktreeDir }).catch(() => {});
      manifest.status = 'failed';
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const report: ConsolidationReport = {
        timestamp: new Date().toISOString(),
        cubicle_id: cubicleId,
        parent_task_id: manifest.parent_task_id,
        applied_patches: appliedPatches,
        conflicting_patches: conflictingPatches,
        verification_passed: false,
        error: `Patch conflict detected in: ${conflictingPatches.join(', ')}`
      };
      return report;
    }

    // 2. Run Verification Test Command
    let verificationPassed = false;
    try {
      await execAsync(manifest.verification_command, { cwd: parentWorktreeDir });
      verificationPassed = true;
    } catch (testErr: any) {
      verificationPassed = false;
    }

    if (!verificationPassed) {
      await execAsync('git checkout -- .', { cwd: parentWorktreeDir }).catch(() => {});
      manifest.status = 'failed';
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const report: ConsolidationReport = {
        timestamp: new Date().toISOString(),
        cubicle_id: cubicleId,
        parent_task_id: manifest.parent_task_id,
        applied_patches: appliedPatches,
        conflicting_patches: [],
        verification_passed: false,
        error: `Verification command failed: ${manifest.verification_command}`
      };
      return report;
    }

    // 3. Commit Consolidated Changes to Worktree Branch
    await execAsync('git add .', { cwd: parentWorktreeDir });
    const { stdout: commitOut } = await execAsync(
      `git commit -m "feat(${cubicleId}): consolidate sub-swarm patches for task ${manifest.parent_task_id}"`,
      { cwd: parentWorktreeDir }
    );
    const { stdout: revOut } = await execAsync('git rev-parse HEAD', { cwd: parentWorktreeDir });
    const commitSha = revOut.trim();

    manifest.status = 'completed';
    manifest.completed_at = new Date().toISOString();
    manifest.consolidation_report = {
      timestamp: manifest.completed_at,
      cubicle_id: cubicleId,
      parent_task_id: manifest.parent_task_id,
      applied_patches: appliedPatches,
      conflicting_patches: [],
      verification_passed: true,
      commit_sha: commitSha
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return manifest.consolidation_report;
  }

  /**
   * Appends structured incident record to .swarm/logs/incidents.jsonl
   */
  public async logIncident(record: IncidentRecord): Promise<void> {
    const logsDir = path.join(this.swarmDir, 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    const incidentsFile = path.join(logsDir, 'incidents.jsonl');
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(incidentsFile, line, 'utf8');
  }

  /**
   * Triggers Panopticon event focusing Twin Eyes of Sauron onto offending cubicle.
   */
  public triggerTwinEyesAlert(incident: IncidentRecord): void {
    this.broadcastEvent({
      type: 'INCIDENT_ALERT',
      timestamp: incident.timestamp,
      source: 'subswarm_manager',
      payload: {
        incident,
        focus_cubicle: incident.cubicle_id,
        twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
        sauron_beam_color: '#ff0033',
        sauron_intensity: 1.0,
        center_feed_alert: {
          title: `CAPABILITY RESTRICTION: ${incident.cubicle_id.toUpperCase()}`,
          message: incident.message,
          severity: incident.severity
        },
        cubicle_status_update: {
          cubicle_id: incident.cubicle_id,
          status: 'error',
          surface_thoughts: `[ALARM] ${incident.violation_type}: Sub-swarm spawning blocked.`
        }
      }
    });
  }

  private generateIncidentId(): string {
    const prefix = 'INC';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${dateStr}-${rand}`;
  }
}
```

---

## 6. Verification Strategy & Test Matrix

To guarantee robust execution and prepare for the M5 Opaque-Box E2E test suites (Tiers 1-5), the following test scenarios must be verified independently:

| Test ID | Test Scenario | Input Configuration | Expected Output / Behavior |
|---|---|---|---|
| **M1-B-01** | Gemini Argon High Spawning | `cubicle-01`, `Gemini`, `gemini-4-argon`, `High` | Evaluation `allowed = true`. `manifest.json` initialized in `.swarm/subswarms/cubicle-01/`. Drones active. |
| **M1-B-02** | GPT Astra Very High Gating | `cubicle-03`, `GPT / OpenAI`, `gpt-astra`, `Very High` | Throws `CapabilityRestrictionError`. Sub-swarm blocked. Appends incident to `incidents.jsonl`. Spotlights converge. |
| **M1-B-03** | GPT Astra Ultra Spawning | `cubicle-03`, `GPT / OpenAI`, `gpt-astra`, `Ultra` | Evaluation `allowed = true`. Spawns child drones successfully. |
| **M1-B-04** | Max Recursion Depth Check | Any cubicle with `current_depth = 1` attempting spawn | Throws `MaxRecursionDepthError`. No grandchildren spawned. |
| **M1-B-05** | Universal Low/Medium Block | Any model with `Low` or `Medium` tier | Evaluation `allowed = false`. Throws `CapabilityRestrictionError`. |
| **M1-B-06** | Manual Override Opt-In | `cubicle-03` with `manual_override = true` | Evaluation `allowed = true`. Manual override acknowledged. |
| **M1-B-07** | Subtask Progress Aggregation | 3 subtasks at 50%, 75%, 100% | Aggregate subswarm progress updates to 75%. `SUBSWARM_UPDATED` broadcast. |
| **M1-B-08** | Sequential Patch Consolidation | 2 valid `.patch` files | Patches applied cleanly. Verification command passes. Git commit created on branch. |
| **M1-B-09** | Conflict Rollback on Consolidation | Conflicting patch with overlapping edits | Reverts dirty changes via `git checkout -- .`. Marks manifest `failed`. |

---

**End of Analysis Report.**
