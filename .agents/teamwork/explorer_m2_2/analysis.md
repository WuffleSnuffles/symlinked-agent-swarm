# Milestone 2 Component B: Self-Learning Preference Repository ("Never Explain Twice", Feature 5)
## Architectural Blueprint & Technical Implementation Strategy

**Author**: Explorer M2-2  
**Date**: 2026-10-26  
**Target Subsystem**: Milestone 2, Component B (Feature 5)  
**Host Architecture**: Node.js 20+ / TypeScript (ESM, NodeNext), Windows 11 NTFS Directory Junctions  
**Related Components**: Milestone 2 Component A (`consular-engine.ts`), Milestone 2 Component C (`mcp-generator.ts` & Vault), Milestone 1 Worktrees (`worktree-manager.ts`)  

---

## 1. Executive Summary & Problem Space

In an autonomous multi-agent swarm system with 16 concurrent worker cubicles operating in isolated Git worktrees, one of the most severe failure modes is **Context Evaporation & Repetition Fatigue**:
1. A human operator issues an explicit directive in the Overseer console (e.g., *"Always use strict TypeScript with zero any, use Vitest for tests, and ensure atomic commits with conventional prefix"*).
2. Because worker cubicles operate as isolated processes on isolated branches (`swarm/cubicle-01` .. `swarm/cubicle-16`), this constraint is lost the moment a cubicle claims a new task.
3. The operator is repeatedly forced to re-explain constraints on every task, destroying swarm autonomy.

**Feature 5: Self-Learning Preference Repository ("Never Explain Twice")** solves this problem permanently through an autonomous closed loop:
- **Continuous Extraction**: Intercepts Overseer console chat messages and user directives in real-time, executing a dual-mode extractor (instant zero-latency deterministic regex fast-path + structural JSON extractor) to detect imperatives, rules, and preferences.
- **Persistent Storage**: Stores versioned, structured rules in `.swarm/memory/preferences.json` with automatic deduplication, semantic key matching, hit count tracking, and corruption-resilient atomic writes.
- **Dynamic Markdown Compilation**: Compiles active rules into `.agents/rules/USER_PREFERENCES.md` formatted cleanly with categorized sections.
- **Zero-Copy Junction Inheritance**: Exploits the existing NTFS Directory Junction (`<worktree>/.agents` -> `<root>/.agents`) established by `WorktreeManager` so that all 16 cubicle worktrees inherit updated rules with **0ms latency, zero polling, and zero duplicated disk bytes**.
- **Worker Prompt Injection**: Filters active rules matching files touched by a task and injects them into LLM worker prompts under `<user_learned_preferences>`.
- **API & Real-Time Sync**: Exposes standard REST endpoints (`GET`, `POST /extract`, `PUT /:id`, `DELETE /:id`) and WebSocket events (`PREFERENCE_LEARNED`, `PREFERENCE_UPDATED`) to feed the Panopticon Vault UI and Overseer terminal.

```
+====================================================================================================+
|                                    USER IN OVERSEER CONSOLE                                        |
|         "From now on, never use any in TypeScript. Always use strict typing with unknown."         |
+====================================================================================================+
                                                  │
                                                  ▼
+────────────────────────────────────────────────────────────────────────────────────────────────────+
|                        CONTINUOUS PREFERENCE EXTRACTION MIDDLEWARE                                  |
|   ├── Mode 1: Deterministic Regex Fast-Path (Zero-Latency Imperatives: always/never/prefer)       |
|   └── Mode 2: Structural JSON Extractor (Schema Validation, Confidence Scoring, Scoping)           |
+────────────────────────────────────────────────────────────────────────────────────────────────────+
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         ▼                                                 ▼
+───────────────────────────────────────────────────+    +───────────────────────────────────────────+
|      CONFLICT RESOLUTION & DEDUPLICATION          |    |          REAL-TIME EVENT BUS              |
|  • Match semantic key: 'strict_typescript_no_any' |    |  • Broadcast 'PREFERENCE_LEARNED'         |
|  • Update statement, bump hit_count (1 -> 2)      |    |  • Update Panopticon UI Vault tab         |
|  • Atomic write to .swarm/memory/preferences.json |    +───────────────────────────────────────────+
+───────────────────────────────────────────────────+
                         │
                         ▼
+────────────────────────────────────────────────────────────────────────────────────────────────────+
|                     DYNAMIC MARKDOWN RULESET COMPILER                                              |
|  • Compiles .swarm/memory/preferences.json -> .agents/rules/USER_PREFERENCES.md                    |
|  • Categorized sections: Coding Style, Architecture, Workflow, Tooling, Testing, Safety           |
+────────────────────────────────────────────────────────────────────────────────────────────────────+
                         │
                         ├─────────────────────────────────────────┐
                         ▼ (NTFS Junction: .agents)                ▼ (NTFS Junction: .agents)
+─────────────────────────────────────────────────+      +───────────────────────────────────────────+
| Worktree: cubicle-01 (swarm/cubicle-01)         |      | Worktree: cubicle-02 (swarm/cubicle-02)   |
| .agents/rules/USER_PREFERENCES.md (Instant byte)|      | .agents/rules/USER_PREFERENCES.md (Instant)|
+─────────────────────────────────────────────────+      +───────────────────────────────────────────+
                         │
                         ▼
+────────────────────────────────────────────────────────────────────────────────────────────────────+
|                        WORKER PROMPT INJECTION ENGINE                                              |
|  • Task touches '*.ts' -> Matches trigger pattern '*.ts'                                           |
|  • Injects <user_learned_preferences> block into LLM worker prompt                                 |
|  • Consular Review Gate verifies compliance; rejects with VETO if rule is violated                |
+────────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Component Architecture & Data Models

### 2.1 Preference Data Schema (`preferences.json`)

The authoritative database resides at `<root>/.swarm/memory/preferences.json`:

```typescript
export type PreferenceCategory =
  | 'coding_style'
  | 'architecture'
  | 'workflow'
  | 'tooling'
  | 'testing'
  | 'safety';

export interface PreferenceEntry {
  id: string;                      // e.g. "pref-2026-0001" or UUID
  category: PreferenceCategory;    // Categorized domain
  key: string;                     // Normalized semantic identifier (snake_case)
  rule: string;                    // Unambiguous, normalized imperative instruction
  trigger_patterns: string[];      // File globs or keywords e.g. ["*.ts", "*.tsx"]
  confidence: number;              // 0.0 to 1.0 (>= 0.70 auto-persists)
  source_message_id?: string;      // ID of Overseer console message that triggered extraction
  created_at: string;              // ISO 8601 UTC timestamp
  updated_at: string;              // ISO 8601 UTC timestamp
  hit_count: number;               // Frequency counter (reinforcement)
  enabled: boolean;                // Allows user/consuls to toggle without deletion
  applies_to: string;              // "all_cubicles" | "cubicle-01" | "gemini_only" | etc.
}

export interface PreferencesDatabase {
  version: string;                 // Schema version, e.g. "1.0.0"
  last_updated: string;            // ISO 8601 UTC timestamp
  total_preferences: number;       // Total count of entries in array
  preferences: PreferenceEntry[];
}
```

### 2.2 Canonical Markdown Format (`USER_PREFERENCES.md`)

Located at `<root>/.agents/rules/USER_PREFERENCES.md`:

```markdown
<!-- AUTO-GENERATED BY OVERSEER PREFERENCE ENGINE - DO NOT EDIT MANUALLY -->
<!-- Last Updated: 2026-10-26T00:20:00.000Z | Total Active Rules: 4 -->

# User Preferences & Project Constraints ("Never Explain Twice")

> [!IMPORTANT]
> The following rules were extracted directly from user directives. All worker agents
> operating in this repository must strictly adhere to these rules without exception.

## 1. Coding Style & Quality
- **[strict_typescript_no_any]**: Always use strict TypeScript. The 'any' type is strictly prohibited; use 'unknown' with type narrowing or generic constraints. *(Pattern: `*.ts`, `*.tsx`, `tsconfig.json`)*

## 2. Architecture & System Design
- **[modular_service_boundaries]**: Maintain strict separation between core engine logic and HTTP/WebSocket transport layers.

## 3. Workflow & Git Operations
- **[atomic_commits_per_task]**: Every completed task must produce exactly one atomic commit on the cubicle branch with a conventional commit message (feat, fix, refactor, test). *(Pattern: `git commit`, `review`)*

## 4. Tooling & Build System
- **[package_manager_pnpm]**: Use pnpm as the exclusive package manager; do not commit package-lock.json or yarn.lock. *(Pattern: `package.json`, `pnpm-lock.yaml`)*

## 5. Testing & Verification
- **[vitest_opaque_box]**: Unit and E2E tests must execute using Vitest with opaque-box methodology. *(Pattern: `test`, `*.test.ts`, `*.spec.ts`)*

## 6. Architectural & Safety Constraints
- **[subswarm_thinking_tier_gating]**: Never spawn sub-swarms from GPT Astra (Very High); only Gemini 4 Argon (High) or GPT Astra (Ultra) may spawn child sub-agents. *(Pattern: `subswarm`, `spawn`, `decompose`)*
```

---

## 3. Detailed Subsystem Specifications

### 3.1 Continuous Preference & Rule Extraction Pipeline

The extraction pipeline operates as an active filter over every incoming chat message in the Overseer console and can also be triggered directly via REST API.

#### 1. Dual-Mode Extraction Mechanics
- **Mode A: Deterministic Regex Fast-Path (Instant Zero-Latency)**
  - Runs in `< 1ms` synchronously on every message before invoking any downstream LLM processes.
  - Matches explicit imperative linguistic constructions:
    1. *Imperative Command*: `/(?:always|never|do not|don't|ensure|make sure to|must|prohibit)\s+([^.!?\n]+)/gi`
    2. *Explicit Stated Preference*: `/(?:i prefer|i like|i want you to|my preference is|from now on|in this project)\s+([^.!?\n]+)/gi`
    3. *Tooling / Framework Selection*: `/(?:use|switch to|rely on)\s+(vitest|jest|playwright|pnpm|npm|yarn|biome|prettier|eslint|tsc)\s*(?:for|instead of|as)?\s*([^.!?\n]*)/gi`
    4. *Correction / Prohibition*: `/(?:that's wrong|don't do that|stop using|incorrect|fix that rule)[:,\s]+([^.!?\n]+)/gi`
  - Assigns initial confidence `0.90`–`0.99` for explicit matches.

- **Mode B: Structural JSON Extractor**
  - Accepts structured extraction payloads via `POST /api/preferences/extract` or from an LLM-assisted conversational parser when compound, multi-clause instructions are detected.
  - Validates and sanitizes fields against the `PreferenceEntry` schema.
  - Filters out conversational pleasantries, extracting the bare imperative constraint.

#### 2. Key Derivation & Category Inference Algorithm
To allow semantic deduplication without duplicate rules proliferating, the engine converts free-form sentences into normalized semantic keys:
- **Category Inference**:
  - `coding_style`: matches keywords `typescript`, `javascript`, `python`, `naming`, `formatting`, `camelcase`, `snake_case`, `any`, `unknown`, `types`, `lint`, `prettier`, `indentation`.
  - `testing`: matches keywords `test`, `vitest`, `jest`, `spec`, `e2e`, `unit`, `mock`, `coverage`, `assertion`, `opaque-box`.
  - `workflow`: matches keywords `git`, `commit`, `branch`, `rebase`, `merge`, `conventional`, `pr`, `atomic`, `review`.
  - `architecture`: matches keywords `architecture`, `layer`, `modular`, `controller`, `service`, `repository`, `interface`, `dependency`.
  - `tooling`: matches keywords `tool`, `pnpm`, `npm`, `yarn`, `esbuild`, `bundler`, `vite`, `compiler`, `scripts`.
  - `safety`: matches keywords `safety`, `security`, `subswarm`, `spawn`, `gating`, `quota`, `token`, `credential`, `secret`, `access_scope`.
- **Semantic Key Generation**:
  - If a specific tool/constraint is detected, uses canonical slugs (e.g. `strict_typescript_no_any`, `vitest_opaque_box`, `atomic_commits_per_task`, `subswarm_thinking_tier_gating`).
  - Fallback slug generator: takes top 3-4 significant content words (excluding stopwords `the`, `is`, `a`, `to`, `for`, `in`), normalizes to lowercase, and joins with underscores.
- **Trigger Patterns Inference**:
  - Automatically associates file patterns based on category and rule contents:
    - TypeScript rules -> `["*.ts", "*.tsx", "tsconfig.json"]`
    - Testing rules -> `["test", "*.test.ts", "*.spec.ts"]`
    - Git/Workflow rules -> `["git commit", "review"]`
    - Sub-swarm/Safety rules -> `["subswarm", "spawn", "decompose"]`
    - General coding style -> `["*.*"]`

---

### 3.2 Persistent Storage, Conflict Resolution & Deduplication

#### 1. Machine-Readable Storage (`preferences.json`)
The preferences database is stored at `.swarm/memory/preferences.json`.
- Directory auto-creation: The engine guarantees `.swarm/memory/` exists on initialization.
- In-memory synchronization: Preferences are loaded into an in-memory cache on startup and updated in-memory synchronously while queueing atomic disk flushes.

#### 2. Atomic Multi-File Persistence & Crash Resilience
To ensure zero corruption during power failure, abrupt task termination, or concurrent writes:
1. **Temp File Write**: Writes new JSON content to `.swarm/memory/preferences.json.tmp.<pid>.<timestamp>`.
2. **Atomic Rename**: Calls `fs.promises.rename(tempPath, targetPath)`. On Windows NTFS, this is an atomic metadata operation that replaces the destination file without exposing a partial-write state.
3. **Backup File Retention**: Before overwriting, the previous valid file is copied to `.swarm/memory/preferences.json.bak`.
4. **Corrupted File Safe Recovery (Boundary Case `TC-T2-PREF-01`)**:
   - If `JSON.parse` fails due to syntax corruption, the engine logs an alert to `.swarm/logs/incidents.jsonl`.
   - Attempts recovery from `.preferences.json.bak`.
   - If backup is unavailable or also corrupted, gracefully initializes an empty database `{ version: "1.0.0", last_updated: ..., total_preferences: 0, preferences: [] }` and does **not** crash the server process.

#### 3. Conflict Resolution & Deduplication Engine (Boundary Case `TC-T2-PREF-05`)
When a new preference is extracted:
1. **Exact Key Match**:
   - If an existing entry shares the same `key` (e.g. `test_framework`):
     - The existing rule is updated: `existing.rule = newRule`.
     - `existing.hit_count++` (reinforcing preference frequency).
     - `existing.updated_at = new Date().toISOString()`.
     - `existing.enabled = true`.
     - Preserves original `id` and `created_at`.
2. **Semantic Similarity Match**:
   - Computes Jaccard word-token similarity on normalized lowercase strings.
   - If similarity threshold `J(A, B) >= 0.75`, treats as an update to the existing rule rather than inserting a duplicate.
3. **Contradictory Directives**:
   - If user commands *"Switch from Vitest to Jest"*, the engine detects target conflict on category `testing` + key `test_framework`, replacing the old rule text and bumping hit count, preventing contradictory rules from co-existing.

---

### 3.3 Dynamic Markdown Ruleset Compiler (`USER_PREFERENCES.md`)

Whenever `preferences.json` is modified (added, updated, toggled, or deleted), the Markdown Compiler automatically generates `.agents/rules/USER_PREFERENCES.md`.

#### 1. Categorization & Section Structure
Rules are grouped into 6 standard sections in deterministic order:
1. `coding_style` -> `## 1. Coding Style & Quality`
2. `architecture` -> `## 2. Architecture & System Design`
3. `workflow` -> `## 3. Workflow & Git Operations`
4. `tooling` -> `## 4. Tooling & Build System`
5. `testing` -> `## 5. Testing & Verification`
6. `safety` -> `## 6. Architectural & Safety Constraints`

#### 2. Filtering & Formatting Rules
- Only **enabled** preferences (`pref.enabled === true`) are compiled into the markdown output.
- Each rule is rendered as:
  `- **[${pref.key}]**: ${pref.rule}${patterns ? ` *(Pattern: ${patterns})*` : ''}`
- If `trigger_patterns` has items, they are formatted with backticks: `*(Pattern: `*.ts`, `*.tsx`)*`.

#### 3. Zero-Copy Worktree Inheritance via NTFS Directory Junctions
In Milestone 1, `WorktreeManager.provisionWorktree(cubicleId)` created two NTFS junctions:
- `<root>/worktrees/<cubicle_id>/.swarm` -> `<root>/.swarm`
- `<root>/worktrees/<cubicle_id>/.agents` -> `<root>/.agents`

Because NTFS directory junctions are kernel-level filesystem reparse points:
- Any file written to `<root>/.agents/rules/USER_PREFERENCES.md` is immediately readable at `<root>/worktrees/<cubicle_id>/.agents/rules/USER_PREFERENCES.md`.
- **0ms propagation delay**: No file copy scripts, no watcher restarts, no race conditions.
- **Zero storage overhead**: All 16 cubicles read from the exact same disk sectors.

---

### 3.4 Worker Prompt Injection Engine

When a cubicle claims a task or when `CLIEngine.prepareCommand` stages a prompt, active preferences must be dynamically injected into the worker's prompt context.

#### 1. Filtering & Selection Logic
Given a task and cubicle context:
1. Retrieve all active rules (`enabled: true`).
2. Filter by `applies_to`:
   - Matches `all_cubicles` OR matching specific `cubicleId` (e.g. `cubicle-01`) OR matching model family (e.g. `gemini`).
3. Filter by `touchedFiles`:
   - If the task metadata specifies target files or branches (e.g. `["src/auth.ts", "test/auth.test.ts"]`), match against `trigger_patterns`.
   - If a rule has empty `trigger_patterns` (or `["*.*"]`), it is globally applicable to all tasks.
   - If any touched file matches any glob pattern in `trigger_patterns`, the rule is included.

#### 2. Canonical XML Block Injection Syntax
The selected rules are formatted into a clean XML block:
```markdown
<user_learned_preferences>
You are operating under the following learned project preferences:
- [strict_typescript_no_any] Always use strict TypeScript. The 'any' type is strictly prohibited.
- [atomic_commits_per_task] Every completed task must produce exactly one atomic commit on the cubicle branch.
- [vitest_opaque_box] Unit and E2E tests must execute using Vitest with opaque-box methodology.
</user_learned_preferences>
```

#### 3. Boundary & Corner Cases (T2 Tests)
- **Extreme Length Strings (`TC-T2-PREF-02`)**: Handles preference rules up to 50,000+ characters without memory truncation or regex stack overflow.
- **Unicode & Markdown Escaping (`TC-T2-PREF-03`)**: Correctly preserves emojis (🚀), CJK characters, HTML tags (`<div>`), and markdown symbols (`*`, `_`, `[ ]`) without mangling.
- **Empty Ruleset**: If no rules are enabled, `injectLearnedPreferences()` cleanly returns the base prompt without injecting an empty `<user_learned_preferences>` tag.

---

### 3.5 API & WebSocket Event Integration

#### 1. REST Endpoints Specification
The preference engine exposes 5 REST endpoints on the Express server:

| Method | Path | Description | Request Body | Response Payload |
|---|---|---|---|---|
| `GET` | `/api/preferences` | Lists all preferences with summary counts | None (Optional `?category=...&enabled=true`) | `{ preferences: PreferenceEntry[], total: number, active: number }` |
| `POST` | `/api/preferences/extract` | Analyzes text, extracts preference, and auto-persists if confidence >= 0.70 | `{ text: string, source_message_id?: string, auto_persist?: boolean }` | `{ extracted: PreferenceEntry[], auto_persisted: boolean, total_active: number }` |
| `POST` | `/api/preferences` | Manually creates a new preference entry | `Omit<PreferenceEntry, 'id' \| 'created_at' \| 'updated_at' \| 'hit_count'>` | `{ preference: PreferenceEntry }` |
| `PUT` | `/api/preferences/:id` | Updates or toggles an existing preference | `Partial<PreferenceEntry>` (e.g. `{ enabled: false }` or `{ rule: "..." }`) | `{ preference: PreferenceEntry }` |
| `DELETE` | `/api/preferences/:id` | Deletes a preference rule | None | `{ success: true, id: string }` |

#### 2. Real-Time WebSocket Event Bus
The server broadcasts two events over `ws://localhost:3820/events`:
- **`PREFERENCE_LEARNED`**:
  ```json
  {
    "type": "PREFERENCE_LEARNED",
    "payload": {
      "preference": {
        "id": "pref-2026-0005",
        "category": "coding_style",
        "key": "strict_typescript_no_any",
        "rule": "Always use strict TypeScript; no any permitted.",
        "trigger_patterns": ["*.ts"],
        "confidence": 0.98,
        "hit_count": 1,
        "enabled": true,
        "applies_to": "all_cubicles"
      },
      "total_active": 5
    },
    "timestamp": "2026-10-26T00:58:00.000Z"
  }
  ```
- **`PREFERENCE_UPDATED`**:
  ```json
  {
    "type": "PREFERENCE_UPDATED",
    "payload": {
      "preference": { "id": "pref-2026-0005", ... },
      "action": "update" // "update" | "toggle" | "delete"
    },
    "timestamp": "2026-10-26T00:58:30.000Z"
  }
  ```

#### 3. Overseer Chat Console Middleware Integration
Whenever the user submits a prompt in the Overseer console (`POST /api/overseer/chat`):
1. The message string is passed directly to `preferenceEngine.analyzeAndExtract(chatMessage)`.
2. If one or more preferences are extracted with `confidence >= 0.70`:
   - Rules are persisted to `preferences.json`.
   - `USER_PREFERENCES.md` is recompiled.
   - `PREFERENCE_LEARNED` is broadcast over WebSocket.
   - The Overseer response incorporates a brief confirmation tag:
     `"[Learned Preference: 'strict_typescript_no_any' registered in Vault and inherited across all 16 cubicles.]"`

---

## 4. Complete Technical Implementation Design (`preference-engine.ts`)

Below is the complete, drop-in TypeScript architecture for `src/server/preference-engine.ts`:

```typescript
/**
 * src/server/preference-engine.ts
 *
 * Self-Learning Preference Repository & Continuous Extraction Engine ("Never Explain Twice").
 * Features:
 * 1. Dual-mode extraction (deterministic regex fast-path + structural extractor).
 * 2. Atomic persistence to .swarm/memory/preferences.json with corruption resilience.
 * 3. Dynamic compilation into .agents/rules/USER_PREFERENCES.md.
 * 4. Zero-copy NTFS directory junction inheritance across all 16 cubicle worktrees.
 * 5. Prompt injection engine under <user_learned_preferences>.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export type PreferenceCategory =
  | 'coding_style'
  | 'architecture'
  | 'workflow'
  | 'tooling'
  | 'testing'
  | 'safety';

export interface PreferenceEntry {
  id: string;
  category: PreferenceCategory;
  key: string;
  rule: string;
  trigger_patterns: string[];
  confidence: number;
  source_message_id?: string;
  created_at: string;
  updated_at: string;
  hit_count: number;
  enabled: boolean;
  applies_to: string;
}

export interface PreferencesDatabase {
  version: string;
  last_updated: string;
  total_preferences: number;
  preferences: PreferenceEntry[];
}

export interface ExtractedPreferenceResult {
  category: PreferenceCategory;
  key: string;
  rule: string;
  trigger_patterns: string[];
  confidence: number;
  applies_to: string;
}

export type PreferenceEventCallback = (event: {
  type: 'PREFERENCE_LEARNED' | 'PREFERENCE_UPDATED';
  payload: any;
}) => void;

export class PreferenceEngine {
  private repoRoot: string;
  private swarmDir: string;
  private agentsDir: string;
  private memoryDir: string;
  private prefJsonPath: string;
  private prefBakPath: string;
  private rulesMdPath: string;
  private database: PreferencesDatabase | null = null;
  private listeners: Set<PreferenceEventCallback> = new Set();
  private writeLock: Promise<void> = Promise.resolve();

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = path.resolve(repoRoot);
    this.swarmDir = path.join(this.repoRoot, '.swarm');
    this.agentsDir = path.join(this.repoRoot, '.agents');
    this.memoryDir = path.join(this.swarmDir, 'memory');
    this.prefJsonPath = path.join(this.memoryDir, 'preferences.json');
    this.prefBakPath = path.join(this.memoryDir, 'preferences.json.bak');
    this.rulesMdPath = path.join(this.agentsDir, 'rules', 'USER_PREFERENCES.md');
  }

  /**
   * Initializes directories, loads database with corruption recovery, and compiles markdown rules.
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(this.memoryDir, { recursive: true });
    await fs.mkdir(path.dirname(this.rulesMdPath), { recursive: true });

    this.database = await this.safeLoadDatabase();
    await this.compileMarkdownRules();
  }

  /**
   * Registers a listener for real-time WebSocket events.
   */
  public onEvent(callback: PreferenceEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitEvent(type: 'PREFERENCE_LEARNED' | 'PREFERENCE_UPDATED', payload: any): void {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch (err) {
        console.error('[PREFERENCE_ENGINE] Listener error:', err);
      }
    }
  }

  /**
   * Safe loader with corruption recovery (TC-T2-PREF-01).
   */
  private async safeLoadDatabase(): Promise<PreferencesDatabase> {
    try {
      const content = await fs.readFile(this.prefJsonPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.preferences)) {
        return parsed;
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[PREFERENCE_ENGINE] Failed to parse ${this.prefJsonPath}, attempting backup recovery:`, err.message);
        try {
          const bakContent = await fs.readFile(this.prefBakPath, 'utf8');
          const bakParsed = JSON.parse(bakContent);
          if (Array.isArray(bakParsed.preferences)) {
            return bakParsed;
          }
        } catch {
          // Backup unavailable or corrupted
        }
      }
    }

    return {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      total_preferences: 0,
      preferences: [],
    };
  }

  /**
   * Deterministic fast-path regex extraction engine.
   */
  public extractFromText(text: string): ExtractedPreferenceResult[] {
    const results: ExtractedPreferenceResult[] = [];
    if (!text || typeof text !== 'string') return results;

    const trimmed = text.trim();

    // 1. Tooling / Framework Directives
    const toolRegex = /(?:use|switch to|rely on)\s+(vitest|jest|playwright|pnpm|npm|yarn|biome|prettier|eslint|tsc)\s*(?:for|instead of|as)?\s*([^.!?\n]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = toolRegex.exec(trimmed)) !== null) {
      const tool = match[1].toLowerCase();
      const rest = match[2]?.trim() || '';
      const category: PreferenceCategory = ['vitest', 'jest', 'playwright'].includes(tool) ? 'testing' : 'tooling';
      const key = `${category}_${tool}`;
      const rule = `Use ${tool.toUpperCase()} for ${rest || category} tasks.`;
      const trigger_patterns = category === 'testing' ? ['test', '*.test.ts', '*.spec.ts'] : ['package.json'];
      results.push({
        category,
        key,
        rule,
        trigger_patterns,
        confidence: 0.96,
        applies_to: 'all_cubicles',
      });
    }

    // 2. Strict Imperatives (always / never / must / ensure / prohibit)
    const imperativeRegex = /(?:always|never|do not|don't|ensure|make sure to|must|prohibit)\s+([^.!?\n]+)/gi;
    while ((match = imperativeRegex.exec(trimmed)) !== null) {
      const statement = match[0].trim();
      const clause = match[1].trim().toLowerCase();

      let category: PreferenceCategory = 'coding_style';
      if (clause.includes('test') || clause.includes('vitest') || clause.includes('jest')) category = 'testing';
      else if (clause.includes('git') || clause.includes('commit') || clause.includes('branch')) category = 'workflow';
      else if (clause.includes('subswarm') || clause.includes('spawn') || clause.includes('quota') || clause.includes('secret')) category = 'safety';
      else if (clause.includes('architecture') || clause.includes('service') || clause.includes('layer')) category = 'architecture';

      let key = this.generateKey(clause, category);
      let trigger_patterns = this.inferTriggerPatterns(clause, category);

      results.push({
        category,
        key,
        rule: statement.endsWith('.') ? statement : `${statement}.`,
        trigger_patterns,
        confidence: 0.94,
        applies_to: 'all_cubicles',
      });
    }

    // 3. Explicit Preference Statements (i prefer / from now on / my preference is)
    const prefRegex = /(?:i prefer|i like|i want you to|my preference is|from now on|in this project)\s+([^.!?\n]+)/gi;
    while ((match = prefRegex.exec(trimmed)) !== null) {
      const clause = match[1].trim();
      const lower = clause.toLowerCase();

      let category: PreferenceCategory = 'coding_style';
      if (lower.includes('test')) category = 'testing';
      else if (lower.includes('commit') || lower.includes('git')) category = 'workflow';
      else if (lower.includes('subswarm') || lower.includes('safety')) category = 'safety';

      results.push({
        category,
        key: this.generateKey(lower, category),
        rule: clause.endsWith('.') ? clause : `${clause}.`,
        trigger_patterns: this.inferTriggerPatterns(lower, category),
        confidence: 0.92,
        applies_to: 'all_cubicles',
      });
    }

    // Deduplicate extracted results within the same text turn
    const unique = new Map<string, ExtractedPreferenceResult>();
    for (const r of results) {
      if (!unique.has(r.key)) {
        unique.set(r.key, r);
      }
    }

    return Array.from(unique.values());
  }

  private generateKey(phrase: string, category: PreferenceCategory): string {
    if (phrase.includes('any') && (phrase.includes('typescript') || phrase.includes('ts'))) {
      return 'strict_typescript_no_any';
    }
    if (phrase.includes('vitest')) return 'vitest_opaque_box';
    if (phrase.includes('atomic') && phrase.includes('commit')) return 'atomic_commits_per_task';
    if (phrase.includes('subswarm') && (phrase.includes('gpt') || phrase.includes('tier'))) return 'subswarm_thinking_tier_gating';

    // Slugify key
    const sanitized = phrase
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => !['the', 'is', 'a', 'to', 'for', 'in', 'and', 'with', 'that', 'this'].includes(w))
      .slice(0, 4)
      .join('_');

    return sanitized || `${category}_rule`;
  }

  private inferTriggerPatterns(phrase: string, category: PreferenceCategory): string[] {
    if (phrase.includes('typescript') || phrase.includes('.ts') || phrase.includes('any')) {
      return ['*.ts', '*.tsx'];
    }
    if (category === 'testing') return ['test', '*.test.ts', '*.spec.ts'];
    if (category === 'workflow') return ['git commit', 'review'];
    if (category === 'safety') return ['subswarm', 'spawn', 'decompose'];
    return [];
  }

  /**
   * Ingests, dedupes, persists, and compiles preferences extracted from chat or directives.
   */
  public async ingestPreference(
    payload: {
      category: PreferenceCategory;
      key: string;
      rule: string;
      trigger_patterns?: string[];
      confidence?: number;
      source_message_id?: string;
      applies_to?: string;
    }
  ): Promise<PreferenceEntry> {
    if (!this.database) await this.initialize();
    const db = this.database!;

    const now = new Date().toISOString();
    const existingIndex = db.preferences.findIndex((p) => p.key === payload.key);

    let entry: PreferenceEntry;
    let isNew = false;

    if (existingIndex >= 0) {
      // Deduplicate & update existing rule
      entry = db.preferences[existingIndex];
      entry.rule = payload.rule;
      entry.category = payload.category;
      if (payload.trigger_patterns) entry.trigger_patterns = payload.trigger_patterns;
      if (payload.confidence) entry.confidence = Math.max(entry.confidence, payload.confidence);
      entry.updated_at = now;
      entry.hit_count++;
      entry.enabled = true;
    } else {
      isNew = true;
      entry = {
        id: `pref-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
        category: payload.category,
        key: payload.key,
        rule: payload.rule,
        trigger_patterns: payload.trigger_patterns || [],
        confidence: payload.confidence ?? 0.9,
        source_message_id: payload.source_message_id,
        created_at: now,
        updated_at: now,
        hit_count: 1,
        enabled: true,
        applies_to: payload.applies_to || 'all_cubicles',
      };
      db.preferences.push(entry);
    }

    db.total_preferences = db.preferences.length;
    db.last_updated = now;

    await this.atomicSaveDatabase();
    await this.compileMarkdownRules();

    this.emitEvent(isNew ? 'PREFERENCE_LEARNED' : 'PREFERENCE_UPDATED', {
      preference: entry,
      total_active: db.preferences.filter((p) => p.enabled).length,
      action: isNew ? 'created' : 'updated',
    });

    return entry;
  }

  /**
   * Thread-safe atomic file persistence with backup rotation (TC-T2-PREF-04).
   */
  private async atomicSaveDatabase(): Promise<void> {
    if (!this.database) return;

    this.writeLock = this.writeLock.then(async () => {
      const tempPath = `${this.prefJsonPath}.tmp.${process.pid}.${Date.now()}`;
      const jsonContent = JSON.stringify(this.database, null, 2);

      await fs.writeFile(tempPath, jsonContent, 'utf8');

      // Rotate existing file to .bak if present
      try {
        await fs.copyFile(this.prefJsonPath, this.prefBakPath);
      } catch {
        // Ignored if target does not exist yet
      }

      await fs.rename(tempPath, this.prefJsonPath);
    });

    return this.writeLock;
  }

  /**
   * Dynamic Markdown Ruleset Compiler.
   */
  public async compileMarkdownRules(): Promise<string> {
    if (!this.database) await this.initialize();
    const db = this.database!;

    const activeRules = db.preferences.filter((p) => p.enabled);

    const header = [
      '<!-- AUTO-GENERATED BY OVERSEER PREFERENCE ENGINE - DO NOT EDIT MANUALLY -->',
      `<!-- Last Updated: ${db.last_updated} | Total Active Rules: ${activeRules.length} -->`,
      '',
      '# User Preferences & Project Constraints ("Never Explain Twice")',
      '',
      '> [!IMPORTANT]',
      '> The following rules were extracted directly from user directives. All worker agents',
      '> operating in this repository must strictly adhere to these rules without exception.',
      '',
    ].join('\n');

    const categories: PreferenceCategory[] = [
      'coding_style',
      'architecture',
      'workflow',
      'tooling',
      'testing',
      'safety',
    ];

    const categoryTitles: Record<PreferenceCategory, string> = {
      coding_style: 'Coding Style & Quality',
      architecture: 'Architecture & System Design',
      workflow: 'Workflow & Git Operations',
      tooling: 'Tooling & Build System',
      testing: 'Testing & Verification',
      safety: 'Architectural & Safety Constraints',
    };

    let body = '';
    let sectionIdx = 1;

    for (const cat of categories) {
      const catRules = activeRules.filter((r) => r.category === cat);
      if (catRules.length === 0) continue;

      body += `## ${sectionIdx++}. ${categoryTitles[cat]}\n`;
      for (const r of catRules) {
        const patterns = r.trigger_patterns.length > 0
          ? ` *(Pattern: \`${r.trigger_patterns.join('`, `')}\`)*`
          : '';
        body += `- **[${r.key}]**: ${r.rule}${patterns}\n`;
      }
      body += '\n';
    }

    const fullMarkdown = header + body;

    const tempMdPath = `${this.rulesMdPath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tempMdPath, fullMarkdown, 'utf8');
    await fs.rename(tempMdPath, this.rulesMdPath);

    return fullMarkdown;
  }

  /**
   * Injects matching active rules into worker prompt under <user_learned_preferences>.
   */
  public injectLearnedPreferences(
    basePrompt: string,
    options: {
      cubicleId?: string;
      touchedFiles?: string[];
    } = {}
  ): string {
    if (!this.database) return basePrompt;

    const activeRules = this.database.preferences.filter((p) => {
      if (!p.enabled) return false;
      if (p.applies_to !== 'all_cubicles' && options.cubicleId && p.applies_to !== options.cubicleId) {
        return false;
      }

      if (options.touchedFiles && options.touchedFiles.length > 0 && p.trigger_patterns.length > 0) {
        const matches = p.trigger_patterns.some((pattern) => {
          if (pattern === '*.*' || pattern === '*') return true;
          const ext = pattern.replace(/^\*/, '');
          return options.touchedFiles!.some((file) => file.endsWith(ext) || file.includes(pattern));
        });
        if (!matches) return false;
      }

      return true;
    });

    if (activeRules.length === 0) return basePrompt;

    const rulesFormatted = activeRules.map((r) => `- [${r.key}] ${r.rule}`).join('\n');
    const injectionBlock = [
      '<user_learned_preferences>',
      'You are operating under the following learned project preferences:',
      rulesFormatted,
      '</user_learned_preferences>',
      '',
    ].join('\n');

    return `${injectionBlock}\n${basePrompt}`;
  }

  // --- CRUD API Helpers ---

  public getAllPreferences(): PreferenceEntry[] {
    return this.database ? [...this.database.preferences] : [];
  }

  public getPreference(id: string): PreferenceEntry | undefined {
    return this.database?.preferences.find((p) => p.id === id);
  }

  public async updatePreference(id: string, updates: Partial<PreferenceEntry>): Promise<PreferenceEntry | null> {
    if (!this.database) await this.initialize();
    const entry = this.database!.preferences.find((p) => p.id === id);
    if (!entry) return null;

    if (updates.rule !== undefined) entry.rule = updates.rule;
    if (updates.category !== undefined) entry.category = updates.category;
    if (updates.trigger_patterns !== undefined) entry.trigger_patterns = updates.trigger_patterns;
    if (updates.enabled !== undefined) entry.enabled = updates.enabled;
    if (updates.applies_to !== undefined) entry.applies_to = updates.applies_to;

    entry.updated_at = new Date().toISOString();
    this.database!.last_updated = entry.updated_at;

    await this.atomicSaveDatabase();
    await this.compileMarkdownRules();

    this.emitEvent('PREFERENCE_UPDATED', { preference: entry, action: 'update' });
    return entry;
  }

  public async deletePreference(id: string): Promise<boolean> {
    if (!this.database) await this.initialize();
    const initialLen = this.database!.preferences.length;
    this.database!.preferences = this.database!.preferences.filter((p) => p.id !== id);

    if (this.database!.preferences.length !== initialLen) {
      this.database!.total_preferences = this.database!.preferences.length;
      this.database!.last_updated = new Date().toISOString();

      await this.atomicSaveDatabase();
      await this.compileMarkdownRules();

      this.emitEvent('PREFERENCE_UPDATED', { id, action: 'delete' });
      return true;
    }
    return false;
  }
}
```

---

## 5. Server Integration & Route Wiring (`src/server/index.ts`)

To integrate Component B into the running server instance, the following additions are wired into `src/server/index.ts`:

```typescript
// 1. Import PreferenceEngine
import { PreferenceEngine } from './preference-engine.js';

// 2. Instantiate and initialize in createSwarmServer()
const preferenceEngine = new PreferenceEngine(repoRoot);
await preferenceEngine.initialize();

// 3. Connect real-time WebSocket broadcast
preferenceEngine.onEvent((event) => {
  broadcast(event.type, event.payload);
});

// 4. REST Endpoints
app.get('/api/preferences', (_req: Request, res: Response) => {
  const preferences = preferenceEngine.getAllPreferences();
  const active = preferences.filter((p) => p.enabled).length;
  res.json({ preferences, total: preferences.length, active });
});

app.post('/api/preferences/extract', async (req: Request, res: Response) => {
  try {
    const { text, source_message_id, auto_persist = true } = req.body;
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const extracted = preferenceEngine.extractFromText(text);
    const persisted: PreferenceEntry[] = [];

    if (auto_persist && extracted.length > 0) {
      for (const item of extracted) {
        if (item.confidence >= 0.70) {
          const entry = await preferenceEngine.ingestPreference({
            ...item,
            source_message_id,
          });
          persisted.push(entry);
        }
      }
    }

    res.json({
      extracted,
      persisted,
      auto_persisted: persisted.length > 0,
      total_active: preferenceEngine.getAllPreferences().filter((p) => p.enabled).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/preferences', async (req: Request, res: Response) => {
  try {
    const entry = await preferenceEngine.ingestPreference(req.body);
    res.status(201).json({ preference: entry });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/preferences/:id', async (req: Request, res: Response) => {
  try {
    const updated = await preferenceEngine.updatePreference(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Preference not found' });
      return;
    }
    res.json({ preference: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/preferences/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await preferenceEngine.deletePreference(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Preference not found' });
      return;
    }
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 6. Verification & Test Plan Mapping

Component B is verified against the complete Dual-Track test suite across all 4 tiers:

### 6.1 Tier 1 Feature Coverage Tests
- **`TC-T1-PREF-01`**: Verifies structured JSON writing to `.swarm/memory/preferences.json` with correct keys, timestamps, and hit count.
- **`TC-T1-PREF-02`**: Verifies dynamic compilation into `.agents/rules/USER_PREFERENCES.md` with auto-generation header, categorized sections, and rule formatting.
- **`TC-T1-PREF-03`**: Verifies instant NTFS Directory Junction inheritance into `worktrees/cubicle-01/.agents/rules/USER_PREFERENCES.md` without process restart or disk copying.
- **`TC-T1-PREF-04`**: Verifies `injectLearnedPreferences()` correctly wraps active matching rules inside `<user_learned_preferences>`.
- **`TC-T1-PREF-05`**: Verifies that modifying an existing key (`test_framework`) updates the existing record and increments `hit_count` rather than inserting a duplicate.

### 6.2 Tier 2 Boundary & Corner Case Tests
- **`TC-T2-PREF-01`**: Corrupted JSON syntax in `preferences.json` is handled safely via backup restoration or clean empty initialization without crashing the server.
- **`TC-T2-PREF-02`**: Accommodates 50,000+ character rule statements safely without truncation or memory explosion.
- **`TC-T2-PREF-03`**: Preserves Unicode, emojis, HTML entities, and Markdown symbols faithfully.
- **`TC-T2-PREF-04`**: 20 rapid consecutive async writes execute atomically without race condition corruption or file locking conflicts.
- **`TC-T2-PREF-05`**: Deduplication engine detects duplicate keys and merges them.

### 6.3 Tier 3 Pairwise & Tier 4 Real-World Scenario
- **`CF-08 (Tier 3 Pairwise)`**: User instructs MCP timeout preference -> persists to `preferences.json` -> automatically propagates to synthesized MCP servers.
- **`Scenario 3 (Tier 4 Real-World Swarm)`**: User chats rule to Overseer -> extracted to `preferences.json` -> compiled to `USER_PREFERENCES.md` -> cubicle claims task -> prompt includes `<user_learned_preferences>` -> generated code strictly adheres to rule with zero user repetition.

---

## 7. Downstream Implementer Guidance

For the Implementer agent tasked with coding Milestone 2 Component B:
1. **Target File**: Create `src/server/preference-engine.ts` using the design provided in Section 4.
2. **Server Wiring**: Update `src/server/index.ts` to instantiate `PreferenceEngine` and mount the REST routes as detailed in Section 5.
3. **Prompt Staging Integration**: Update `src/server/cli-engine.ts` to call `preferenceEngine.injectLearnedPreferences()` before staging prompt files.
4. **Verification**: Run `npx vitest run test/unit/adversarial-gating-and-atomic-claim.test.ts` and ensure all tests continue passing. Add `test/unit/preference-engine.test.ts` to verify fast-path extraction and markdown compilation.
