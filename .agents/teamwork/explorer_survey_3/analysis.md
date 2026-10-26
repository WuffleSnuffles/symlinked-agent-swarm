# Architectural Survey & Technical Design Report: Preferences, Skill/MCP Generation, Windows Executable Packaging, and Dual-Track E2E Testing

**Author**: Explorer Survey 3  
**Date**: 2026-10-26  
**Target System**: Symlinked Agent Swarm & Brutalist Dystopian Cyberpunk Panopticon  
**Host Platform**: Windows 11 (NTFS) with POSIX Fallback  
**Reference Document**: `ORIGINAL_REQUEST.md` (R4, R5 & Follow-Up Requirements)

---

## 1. Executive Summary & Survey Scope

This report establishes the complete architectural, algorithmic, and verification blueprint for four mission-critical subsystems of the **Symlinked Agent Swarm System**:

1. **Self-Learning Preference Repository ("Never Explain Twice")**: An autonomous, continuous extraction and persistence pipeline that ingests user instructions, coding styles, and architectural constraints from the Overseer chat, structures them into `.swarm/memory/preferences.json`, compiles them into `.agents/rules/USER_PREFERENCES.md`, and propagates them across all 16 cubicle worktrees instantaneously via NTFS directory junctions.
2. **Overseer Skill & MCP Generator**: An autonomous synthesis engine empowering the Overseer agent to invent, write, test, and register reusable agent **Skills** (`.agents/skills/<name>/SKILL.md` + helper scripts) and **Model Context Protocol (MCP) Servers** (`.agents/mcp/<name>/` + `mcp_config.json`). This subsystem is fully inspectable, editable, and triggerable through the Panopticon UI's **Learned Memory, Skills & MCP Vault**.
3. **Standalone Windows `.exe` Packaging & GitHub Repository**: A zero-dependency single-binary Windows compilation pipeline producing `dist/SymlinkedAgentSwarm.exe` (copied to root `SymlinkedAgentSwarm.exe`), verified against Windows NTFS junction execution, spaces in paths (e.g., `H:\My Drive\...`), automated via `scripts/build-exe.ps1`, continuous integration via `.github/workflows/release-exe.yml`, and repository publishing via `scripts/publish-github.ps1`.
4. **Dual-Track End-to-End Testing & Verification Strategy**: An exhaustive testing harness featuring an **Opaque-Box E2E Testing Suite** partitioned into four rigorous tiers:
   - **Tier 1: Feature Coverage** (>= 5 exhaustive tests per feature across 9 features = 45+ test cases)
   - **Tier 2: Boundary & Corner Cases** (>= 5 boundary tests per feature = 45+ test cases)
   - **Tier 3: Cross-Feature Combinations** (Pairwise interaction matrix & test cases)
   - **Tier 4: Real-World Living Swarm Scenarios** (5 end-to-end full lifecycle engineering simulations)
   - Plus dedicated test runners for Junction verification, Atomic Claim Concurrency races, Capability Gating, and Standalone `.exe` smoke tests.

```
+====================================================================================================+
|                                    CENTRAL OVERSEER AGENT                                          |
|                          Chat Console | Incident Dispatcher | Vault Engine                         |
+====================================================================================================+
           |                                     |                                    |
           v                                     v                                    v
+-----------------------+             +-----------------------+            +-----------------------+
|  Continuous Learning  |             |  Skill & MCP Generator|            |  Panopticon Vault UI  |
|  Preference Engine    |             |  Autonomous Synthesis |            |  Learned Memory Tab   |
+-----------------------+             +-----------------------+            +-----------------------+
           |                                     |                                    |
           +-----------------+-------------------+                                    |
                             |                                                        |
                             v                                                        v
                 [Root Shared Storage]                              [Real-Time State Bus]
          .swarm/memory/preferences.json                             WebSocket & Broadcast
          .agents/rules/USER_PREFERENCES.md                          (Live Vault Sync)
          .agents/skills/<name>/SKILL.md
          .agents/mcp/<name>/mcp_config.json
                             |
         +-------------------+-------------------+
         | (NTFS Directory Junction .agents)     | (NTFS Directory Junction .agents)
         v                                       v
+---------------------------------+     +---------------------------------+
| Worktree: cubicle-01            |     | Worktree: cubicle-02            |
| (swarm/cubicle-01)              |     | (swarm/cubicle-02)              |
| .agents/ (Zero-Copy Shared)     |     | .agents/ (Zero-Copy Shared)     |
| Immediate Preference Enforced   |     | Immediate Preference Enforced   |
+---------------------------------+     +---------------------------------+
```

---

## 2. Self-Learning Preference Repository Architecture ("Never Explain Twice")

### 2.1 The Problem: Context Evaporation in Multi-Agent Swarms
In traditional multi-agent architectures, when a human operator instructs the system: *"Always use strict TypeScript with zero any, wrap all fs calls in try-catch with custom SwarmError, and use vitest for testing"*, that constraint is lost the moment a sub-agent is spawned in a separate subprocess or git worktree. The operator is forced to repeat themselves across every task prompt, leading to frustration, inconsistent code quality, and rule violations.

The **Self-Learning Preference Repository** eliminates this by transforming ephemeral Overseer chat dialogues into permanent, versioned, structured rules automatically inherited by all cubicles.

### 2.2 Continuous Extraction Pipeline & Heuristics
The Overseer chat pipeline incorporates a real-time extraction middleware operating on every incoming user message and every correction response.

```
User Message in Overseer Console
              │
              ▼
   [Intent Classification]
              │
   ├── Question / Task Dispatch ──> Standard Taskboard Pipeline
   │
   └── Preference / Rule / Constraint Detected
              │
              ▼
    [Extraction Engine]
   (Dual-Mode: Deterministic Regex + LLM Structural Extractor)
              │
              ├── Category: 'coding_style' | 'architecture' | 'workflow' | 'testing' | 'constraint'
              ├── Trigger: Exact pattern or context where rule applies
              ├── Rule: Normalized, unambiguous imperative instruction
              ├── Confidence: 0.0 to 1.0 (threshold >= 0.70 for auto-persistence)
              ├── Scope: 'global' | 'model_family' | 'cubicle_specific'
              │
              ▼
   [Conflict & Deduplication Engine]
              │
              ├── Match existing rule by semantic similarity / key?
              │     ├── Yes: Update rule, increment hit count, bump timestamp
              │     └── No: Insert new structured preference entry
              │
              ▼
   [Atomic Multi-File Persistence]
              ├── 1. Append/Update `.swarm/memory/preferences.json` (Machine-readable)
              ├── 2. Compile `.agents/rules/USER_PREFERENCES.md` (Agent system prompt ruleset)
              └── 3. Emit `PREFERENCE_LEARNED` WebSocket event to UI Vault
```

#### Deterministic Heuristic Regex Matchers (Zero-Latency Fast Path)
For common imperative patterns, regex extractors provide instantaneous detection without requiring an LLM call:
- **Style/Constraint Triggers**: `/(?:always|never|do not|ensure|make sure to|must|prohibit)\s+([^.!?\n]+)/gi`
- **Preference Explicit Statements**: `/(?:i prefer|i like|i want you to|my preference is|from now on|in this project)\s+([^.!?\n]+)/gi`
- **Testing/Tooling Directives**: `/(?:use|switch to|rely on)\s+(vitest|jest|playwright|pnpm|npm|yarn|biome|prettier|eslint)\s+(?:for|instead of|as)\s*([^.!?\n]*)/gi`
- **Correction Markers**: `/(?:that's wrong|don't do that|stop using|incorrect|fix that rule)[:,\s]+([^.!?\n]+)/gi`

#### LLM Structured Extraction Schema
When messages contain compound conversational instructions, the Overseer invokes a structured extraction function:

```typescript
export interface ExtractedPreferencePayload {
  category: 'coding_style' | 'architecture' | 'workflow' | 'tooling' | 'testing' | 'safety';
  rule_statement: string; // e.g., "Use Vitest with in-source testing for unit tests"
  trigger_context: string; // e.g., "When writing unit tests or running verification"
  rationale: string; // e.g., "User specified preference during task planning"
  applies_to: 'all_cubicles' | 'gemini_only' | 'gpt_only' | string[];
  confidence: number; // 0.0 to 1.0
  action_type: 'add' | 'update' | 'deprecate';
}
```

### 2.3 Preference Data Schema (`preferences.json`)
Located at `.swarm/memory/preferences.json`, this is the authoritative machine-readable database:

```json
{
  "$schema": "./preferences.schema.json",
  "version": "1.0.0",
  "last_updated": "2026-10-26T00:20:00.000Z",
  "total_preferences": 4,
  "preferences": [
    {
      "id": "pref-2026-0001",
      "category": "coding_style",
      "key": "strict_typescript_no_any",
      "rule": "Always use strict TypeScript. The 'any' type is strictly prohibited; use 'unknown' with type narrowing or generic constraints.",
      "trigger_patterns": ["*.ts", "*.tsx", "tsconfig.json"],
      "confidence": 0.98,
      "source_message_id": "msg-101",
      "created_at": "2026-10-26T00:18:10.000Z",
      "updated_at": "2026-10-26T00:18:10.000Z",
      "hit_count": 5,
      "enabled": true,
      "applies_to": "all_cubicles"
    },
    {
      "id": "pref-2026-0002",
      "category": "workflow",
      "key": "atomic_commits_per_task",
      "rule": "Every completed task must produce exactly one atomic commit on the cubicle branch with a conventional commit message (feat, fix, refactor, test).",
      "trigger_patterns": ["git commit", "review"],
      "confidence": 0.95,
      "source_message_id": "msg-104",
      "created_at": "2026-10-26T00:18:45.000Z",
      "updated_at": "2026-10-26T00:18:45.000Z",
      "hit_count": 3,
      "enabled": true,
      "applies_to": "all_cubicles"
    },
    {
      "id": "pref-2026-0003",
      "category": "testing",
      "key": "dual_track_opaque_box_e2e",
      "rule": "Unit and integration tests must run via Vitest; end-to-end acceptance tests must follow the Opaque-Box 4-tier methodology without mocking the filesystem.",
      "trigger_patterns": ["test", "*.test.ts", "*.spec.ts"],
      "confidence": 0.99,
      "source_message_id": "msg-109",
      "created_at": "2026-10-26T00:19:12.000Z",
      "updated_at": "2026-10-26T00:19:12.000Z",
      "hit_count": 8,
      "enabled": true,
      "applies_to": "all_cubicles"
    },
    {
      "id": "pref-2026-0004",
      "category": "safety",
      "key": "subswarm_thinking_tier_gating",
      "rule": "Never spawn sub-swarms from GPT Astra (Very High); only Gemini 4 Argon (High) or GPT Astra (Ultra) may spawn child sub-agents.",
      "trigger_patterns": ["subswarm", "spawn", "decompose"],
      "confidence": 1.0,
      "source_message_id": "msg-system-01",
      "created_at": "2026-10-26T00:12:22.000Z",
      "updated_at": "2026-10-26T00:12:22.000Z",
      "hit_count": 12,
      "enabled": true,
      "applies_to": "all_cubicles"
    }
  ]
}
```

### 2.4 Human-Readable Markdown Ruleset (`USER_PREFERENCES.md`)
Whenever `preferences.json` is modified, the compiler atomically rewrites `.agents/rules/USER_PREFERENCES.md`. This file serves as the canonical rules injection file for AI agents:

```markdown
<!-- AUTO-GENERATED BY OVERSEER PREFERENCE ENGINE - DO NOT EDIT MANUALLY -->
<!-- Last Updated: 2026-10-26T00:20:00.000Z | Total Active Rules: 4 -->

# User Preferences & Project Constraints ("Never Explain Twice")

> [!IMPORTANT]
> The following rules were extracted directly from user directives. All worker agents
> operating in this repository must strictly adhere to these rules without exception.

## 1. Coding Style & Quality
- **[strict_typescript_no_any]**: Always use strict TypeScript. The 'any' type is strictly prohibited; use 'unknown' with type narrowing or generic constraints. *(Pattern: `*.ts`, `*.tsx`, `tsconfig.json`)*

## 2. Testing & Verification
- **[dual_track_opaque_box_e2e]**: Unit and integration tests must run via Vitest; end-to-end acceptance tests must follow the Opaque-Box 4-tier methodology without mocking the filesystem. *(Pattern: `test`, `*.test.ts`, `*.spec.ts`)*

## 3. Workflow & Git Operations
- **[atomic_commits_per_task]**: Every completed task must produce exactly one atomic commit on the cubicle branch with a conventional commit message (feat, fix, refactor, test). *(Pattern: `git commit`, `review`)*

## 4. Architectural & Safety Constraints
- **[subswarm_thinking_tier_gating]**: Never spawn sub-swarms from GPT Astra (Very High); only Gemini 4 Argon (High) or GPT Astra (Ultra) may spawn child sub-agents. *(Pattern: `subswarm`, `spawn`, `decompose`)*
```

### 2.5 Worktree Inheritance via NTFS Directory Junction
When Git worktrees are provisioned for cubicles (`worktrees/cubicle-01`, etc.), the system creates **two NTFS Directory Junctions**:
1. `<worktree>/.swarm` -> `<root>/.swarm`
2. `<worktree>/.agents` -> `<root>/.agents`

Because NTFS directory junctions operate at the Windows filesystem driver level:
- There is **zero latency** between the Overseer learning a rule and a worker cubicle reading it.
- No file copying or synchronization scripts are required.
- Any tool or agent executing in `worktrees/cubicle-01/` reading `.agents/rules/USER_PREFERENCES.md` accesses the exact same physical byte stream as the Overseer in `<root>`.

### 2.6 Worker Prompt Injection Mechanism
When a task is dispatched to a cubicle worker:
1. The Task Executor reads `.agents/rules/USER_PREFERENCES.md` directly from its worktree root.
2. It filters rules by relevance (matching file extensions of files touched by the task).
3. It prepends the active preferences into the LLM system instruction under a designated `<user_learned_preferences>` section:
   ```markdown
   <user_learned_preferences>
   You are operating under the following learned project preferences:
   - Always use strict TypeScript. The 'any' type is strictly prohibited.
   - Every completed task must produce exactly one atomic commit.
   - Unit tests must run via Vitest.
   </user_learned_preferences>
   ```
4. If a worker violates a learned rule during code verification in `review/`, the Overseer verification gate rejects the task, cites the specific rule key, logs an alert to the incident console, and directs the Sauron spotlight to the offending cubicle.

---

## 3. Overseer Skill & MCP Generator Architecture

### 3.1 Overview
The Overseer acts as the meta-programmer of the swarm. When complex, repetitive, or tool-assisted workflows arise (e.g., interacting with an external database, parsing specialized file formats, or generating specific test fixtures), the Overseer does not merely execute a one-off command; it **synthesizes reusable modular Skills and MCP Servers**.

### 3.2 Skill Specification & Folder Layout
A Skill adheres to the standard Agentic Skill specification:
- Directory: `.agents/skills/<skill-name>/`
- Entry Point: `SKILL.md` with YAML frontmatter
- Optional subdirectories: `scripts/`, `references/`, `resources/`

```
.agents/skills/
└── git-conflict-resolver/
    ├── SKILL.md
    ├── scripts/
    │   └── resolve_conflict.ps1
    └── references/
        └── strategies.md
```

#### Exact `SKILL.md` Schema Template:
```markdown
---
name: git-conflict-resolver
description: Automatically detects, analyzes, and resolves 3-way merge conflicts between cubicle branches and main using semantic AST parsing and atomic git resolution.
---

# Git Conflict Resolver Skill

## Critical Rules
- Never force push or drop incoming changes without semantic diff validation.
- Always run the test suite against resolved code before committing.

## When to Use
- Triggered whenever a cubicle branch encounters a merge conflict during task completion or consolidation.

## Step-by-Step Instructions
1. Inspect conflicting files using `git status` and `git diff --check`.
2. Execute `scripts/resolve_conflict.ps1 -Branch <branch_name>`.
3. Verify compilation and test suite.
```

### 3.3 MCP Server Specification (`mcp_config.json` & Tool Schemas)
Model Context Protocol (MCP) servers expose structured tools to cubicle agents via standard JSON-RPC over stdio or SSE.

#### Folder Layout:
```
.agents/mcp/
├── mcp_config.json
├── database-inspector/
│   ├── index.mjs
│   ├── package.json
│   └── tools/
│       ├── query_schema.json
│       └── run_query.json
└── gitlab-bridge/
    ├── bridge.py
    └── tools/
        └── fetch_mr.json
```

#### Authority Configuration File (`.agents/mcp/mcp_config.json`):
```json
{
  "mcpServers": {
    "database-inspector": {
      "command": "node",
      "args": [".agents/mcp/database-inspector/index.mjs"],
      "env": {
        "DB_URL": "sqlite://./.swarm/state.db"
      },
      "tools": {
        "query_schema": { "eager": true },
        "run_query": { "eager": false }
      }
    },
    "gitlab-bridge": {
      "command": "python",
      "args": [".agents/mcp/gitlab-bridge/bridge.py"],
      "env": {},
      "tools": {
        "fetch_mr": { "eager": true }
      }
    }
  }
}
```

#### Tool Schema Specification (`tools/query_schema.json`):
```json
{
  "name": "query_schema",
  "description": "Inspects SQLite or Postgres tables, columns, and foreign keys.",
  "parameters": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "table_name": {
        "type": "string",
        "description": "Name of the database table to inspect"
      }
    },
    "required": ["table_name"],
    "additionalProperties": false
  }
}
```

### 3.4 Autonomous Skill & MCP Synthesis Engine
The Overseer contains an autonomous generation workflow:
1. **Trigger**: User prompts Overseer *"Create an MCP tool to query local SQLite database"* or the Overseer detects a recurring requirement across >= 3 tasks.
2. **Scaffolding**: Overseer creates directory `.agents/skills/<name>/` or `.agents/mcp/<name>/`.
3. **Synthesis**: Overseer writes `SKILL.md` (with YAML frontmatter) or MCP server code (`index.mjs` / `bridge.py` and tool JSON schemas).
4. **Validation**: Overseer validates:
   - YAML frontmatter parses cleanly without syntax errors.
   - Script executable runs cleanly with `--help` or exit code 0.
   - MCP server responds to JSON-RPC `tools/list` handshake.
5. **Registration**: Overseer updates `.agents/mcp/mcp_config.json` and emits `SKILL_GENERATED` or `MCP_REGISTERED` event.
6. **Instant Worktree Visibility**: Because `<worktree>/.agents` is a junction pointing to `<root>/.agents`, every worker cubicle immediately discovers and can invoke the new Skill or MCP tool without process restarts.

### 3.5 Learned Memory, Skills & MCP Vault UI View
The center section of the Panopticon UI houses an interactive **Vault View** accessible via tabs above the console:

```
+----------------------------------------------------------------------------------------------------+
|  [OVERSEER CONSOLE]  |  [INCIDENT LOGS (0)]  |  [★ MEMORY & SKILL VAULT]  |  [SYSTEM DIAGNOSTICS]  |
+----------------------------------------------------------------------------------------------------+
| ┌────────────────────────┐  ┌────────────────────────────────────────────────────────────────────┐ |
| │ Vault Navigation       │  │ Selected: [Skill] git-conflict-resolver                            │ |
| │                        │  │ Status: ACTIVE (Verified) | Created: 2026-10-26T00:19:30Z          │ |
| │ ▼ Learned Preferences  │  │                                                                    │ |
| │   • strict_typescript  │  │ ---                                                                │ |
| │   • dual_track_e2e     │  │ name: git-conflict-resolver                                        │ |
| │   • atomic_commits     │  │ description: Automatically detects, analyzes, and resolves...      │ |
| │                        │  │ ---                                                                │ |
| │ ▼ Active Skills (3)    │  │                                                                    │ |
| │   ★ git-conflict-resolv│  │ # Git Conflict Resolver Skill                                      │ |
| │   • react-memo-audit   │  │                                                                    │ |
| │   • api-mock-generator │  │ [EDIT IN-PLACE]   [RUN DRY-RUN TEST]   [RE-INJECT]   [DELETE]          │ |
| │                        │  └────────────────────────────────────────────────────────────────────┘ |
| │ ▼ MCP Servers (2)      │  ┌────────────────────────────────────────────────────────────────────┐ |
| │   • database-inspector │  │ Tool Playground: `query_schema`                                    │ |
| │   • gitlab-bridge      │  │ Input JSON: {"table_name": "tasks"}                                │ |
| │                        │  │ [TEST INVOKE] -> Output: {"columns": ["id", "title", "status"]}   │ |
| └────────────────────────┘  └────────────────────────────────────────────────────────────────────┘ |
+----------------------------------------------------------------------------------------------------+
```

Features of the Vault:
- **Preference Inspector & Editor**: View confidence score, hit count, rule definition. Toggle enabled/disabled or edit rules directly with one-click re-compilation to `USER_PREFERENCES.md`.
- **Skill Live Studio**: Live markdown preview, syntax highlighting, and dry-run execution of helper scripts.
- **MCP Tool Tester**: Direct GUI playground to test-call any MCP tool using custom JSON parameters.

---

## 4. Standalone Windows `.exe` Packaging & GitHub Repository Architecture

### 4.1 Packaging Tooling Evaluation

To deliver a production-ready, double-clickable `SymlinkedAgentSwarm.exe` on Windows that hosts the full backend server and static frontend assets without requiring the user to install Node.js, Python, or Git dependencies manually, we evaluated the primary packaging technologies:

| Packaging Tool | Target Runtime | Binary Size | Embedded Static Assets | Windows Junction (`mklink /J`) Compatibility | Verdict | Rationale |
|---|---|---|---|---|---|---|
| **Node.js SEA (Single Executable App)** | Node.js 20+ / 22+ | ~75 MB | Partial (Blob injection via `postject`) | **Native** (Full win32 `fs.symlink`) | **Recommended Primary** | Official Node.js native standard since v20. No third-party bytecode loaders; zero external runtime dependencies. Runs full Express/Fastify + WS server. |
| **`@yao-pkg/pkg`** | Node.js 18-22 | ~65 MB | **Built-in** (Virtual filesystem `/snapshot/`) | **Native** (Full win32 `fs.symlink`) | **Recommended Alternative / Production Bundler** | Battle-tested, excellent asset embedding support via `pkg.assets`, builds clean single `.exe` file. |
| **PyInstaller / Nuitka** | Python 3.12 | ~45-80 MB | Supported (`--add-data`) | **Native** (`_winapi.CreateJunction`) | Viable Fallback | Strong if backend was Python, but requires Python WebSocket server (Uvicorn) and heavier bundle extraction overhead. |
| **Bun (`bun build --compile`)** | Bun Runtime | ~60 MB | **Built-in** | Limited on Windows NTFS reparse points | Not Recommended | Bun's Windows support for native NTFS directory junction flags and reparse point inspection is currently experimental. |
| **Go / Rust Wrapper Binary** | Native Go/Rust | ~25 MB | Embeds HTML/CSS/JS via `embed.FS` | Native Win32 API calls (`CreateSymbolicLinkW`) | High Complexity | Excellent performance, but duplicates Node.js CLI execution logic. |

#### Architectural Decision:
Use **`@yao-pkg/pkg`** or **Node.js SEA** to bundle the Node.js backend runtime, WebSocket event broadcaster, Git worktree/junction engine, and static Panopticon web assets into a unified standalone `dist/SymlinkedAgentSwarm.exe`.

### 4.2 Windows NTFS Filesystem Mechanics

#### Directory Junctions vs. Symbolic Links on Windows:
A critical engineering distinction for Windows deployment:
- **NTFS Symbolic Links (`mklink /D`)**: Require Windows **Developer Mode** enabled or elevated Administrator privileges. If a standard user launches `SymlinkedAgentSwarm.exe` without admin rights, `mklink /D` fails with `ERROR_PRIVILEGE_NOT_HELD` (Error code 1314).
- **NTFS Directory Junctions (`mklink /J` or `fs.symlink(target, link, 'junction')`)**: Use Windows Reparse Points (`IO_REPARSE_TAG_MOUNT_POINT`). **Junctions do NOT require Administrator privileges or Developer Mode!** Any standard Windows user can create Directory Junctions on local NTFS volumes.

#### Windows Paths with Spaces & Drive Letters:
In the target environment, paths frequently contain spaces and non-standard characters, such as:
`H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm`

The engine and scripts must strictly enforce:
1. In PowerShell: Always wrap paths in double quotes or pass as argument arrays:
   ```powershell
   cmd.exe /c "mklink /J `"$targetWorktree\.swarm`" `"$sharedSwarmRoot`""
   ```
2. In Node.js: Use `path.resolve()` and pass raw strings to `fs.promises.symlink(target, linkPath, 'junction')`. Node.js win32 binding directly invokes `CreateSymbolicLinkW` / `DeviceIoControl(FSCTL_SET_REPARSE_POINT)` without shell interpolation, eliminating space-escaping bugs.

### 4.3 Packaging Architecture & Single-Binary Assembly

```
Project Root
├── server/               (Express + WebSocket + Git Worktree Engine)
├── ui/                   (Brutalist Panopticon UI: HTML, CSS, JS, Assets)
└── package.json
           │
           ▼
[1. Build Frontend UI] -> Bundles to `dist/public/`
[2. Build Backend Server] -> Bundles via esbuild/tsc to `dist/server.js`
[3. Embed Assets via pkg] -> Packages `dist/server.js` + `dist/public/**/*`
           │
           ▼
`dist/SymlinkedAgentSwarm.exe` (Standalone Windows Executable)
           │
           ▼ (Copied to project root per R5)
`H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\SymlinkedAgentSwarm.exe`
```

### 4.4 Automated PowerShell Build Script (`scripts/build-exe.ps1`)

```powershell
<#
.SYNOPSIS
    Builds the standalone Windows executable SymlinkedAgentSwarm.exe.
.DESCRIPTION
    Compiles frontend and backend assets, packages them into a single-binary
    executable using @yao-pkg/pkg, copies the output to root, and verifies
    executable integrity.
#>
param (
    [string]$OutputDir = "$PSScriptRoot\..\dist",
    [string]$TargetExe = "SymlinkedAgentSwarm.exe"
)

$ErrorActionPreference = "Stop"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Symlinked Agent Swarm] Starting Standalone .exe Build   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $ProjectRoot

# 1. Ensure Dependencies
Write-Host "`n[1/5] Checking and installing dependencies..." -ForegroundColor Yellow
if (!(Test-Path "node_modules")) {
    npm ci
}

# 2. Build UI Assets
Write-Host "`n[2/5] Building Panopticon Web Assets..." -ForegroundColor Yellow
npm run build:ui

# 3. Build Backend Bundle
Write-Host "`n[3/5] Compiling server backend with esbuild..." -ForegroundColor Yellow
npx esbuild server/src/index.ts --bundle --platform=node --target=node20 --outfile=dist/server.bundle.js --external:fsevents

# 4. Package Standalone Executable
Write-Host "`n[4/5] Packaging standalone executable via pkg..." -ForegroundColor Yellow
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

npx @yao-pkg/pkg dist/server.bundle.js `
    --target node20-win-x64 `
    --output "$OutputDir\$TargetExe" `
    --public `
    --options max-old-space-size=4096

# 5. Copy to Root & Verify
Write-Host "`n[5/5] Copying $TargetExe to project root and validating..." -ForegroundColor Yellow
$RootExePath = Join-Path $ProjectRoot $TargetExe
Copy-Item -Path "$OutputDir\$TargetExe" -Destination $RootExePath -Force

if (Test-Path $RootExePath) {
    $exeSize = (Get-Item $RootExePath).Length / 1MB
    Write-Host "`nBUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "Executable location: $RootExePath" -ForegroundColor Green
    Write-Host ("Executable size: {0:N2} MB" -f $exeSize) -ForegroundColor Green
} else {
    Write-Error "Build verification failed: $RootExePath was not created."
}
```

### 4.5 GitHub Actions Release Pipeline (`.github/workflows/release-exe.yml`)

```yaml
name: Release Standalone Windows Executable

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:

jobs:
  build-and-release:
    name: Build SymlinkedAgentSwarm.exe (Windows)
    runs-on: windows-latest
    permissions:
      contents: write

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Test Suite (Dual Track Tiers 1-4)
        run: npm test

      - name: Build Standalone Windows Executable
        run: powershell -ExecutionPolicy Bypass -File ./scripts/build-exe.ps1

      - name: Compute SHA256 Checksum
        id: checksum
        shell: pwsh
        run: |
          $hash = (Get-FileHash -Path ./SymlinkedAgentSwarm.exe -Algorithm SHA256).Hash
          Set-Content -Path ./SymlinkedAgentSwarm.exe.sha256 -Value "$hash  SymlinkedAgentSwarm.exe"
          echo "SHA256=$hash" >> $env:GITHUB_OUTPUT

      - name: Smoke Test Executable Launch
        shell: pwsh
        run: |
          $process = Start-Process -FilePath "./SymlinkedAgentSwarm.exe" -ArgumentList "--headless --port 3820" -PassThru
          Start-Sleep -Seconds 5
          try {
            $resp = Invoke-RestMethod -Uri "http://localhost:3820/api/health" -Method Get
            if ($resp.status -ne "ok") { throw "Health check returned invalid status" }
            Write-Host "Smoke test PASSED! Server is responding." -ForegroundColor Green
          } finally {
            Stop-Process -Id $process.Id -Force
          }

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            ./SymlinkedAgentSwarm.exe
            ./SymlinkedAgentSwarm.exe.sha256
          name: Release ${{ github.ref_name }}
          draft: false
          prerelease: false
          generate_release_notes: true
```

### 4.6 GitHub Repository Setup & Publishing Script (`scripts/publish-github.ps1`)

```powershell
<#
.SYNOPSIS
    Initializes Git repository and publishes to https://github.com/holdenliu1/symlinked-agent-swarm.git
#>
param (
    [string]$RemoteUrl = "https://github.com/holdenliu1/symlinked-agent-swarm.git",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
Write-Host "Initializing and Publishing to $RemoteUrl on branch $Branch..." -ForegroundColor Cyan

if (!(Test-Path ".git")) {
    git init
    git branch -M $Branch
}

# Ensure .gitignore
if (!(Test-Path ".gitignore")) {
    @"
node_modules/
dist/
.swarm/tasks/in_progress/
.swarm/logs/*.log
worktrees/
*.tmp
.env
"@ | Out-File -FilePath .gitignore -Encoding utf8
}

git add .
git commit -m "feat: initial commit of Symlinked Agent Swarm & Panopticon UI"

$remotes = git remote
if ($remotes -contains "origin") {
    git remote set-url origin $RemoteUrl
} else {
    git remote add origin $RemoteUrl
}

Write-Host "`nPushing to remote repository..." -ForegroundColor Yellow
git push -u origin $Branch

Write-Host "`nRepository successfully configured and published to $RemoteUrl" -ForegroundColor Green
```

---

## 5. End-to-End Testing & Verification Strategy (Dual Track Test Suite)

### 5.1 The Dual-Track Testing Philosophy
A complex autonomous multi-agent swarm cannot be verified using shallow mock tests. If a mock replaces `fs.symlink`, real-world NTFS junction permission bugs in Windows will slip into production.

The **Dual-Track Test Suite** divides verification into two strictly separated tracks:
1. **Track A (White-Box Unit & Integration)**: Tests internal functions (regex extractors, priority queue, event schema parsers).
2. **Track B (Opaque-Box E2E Testing Tiers 1-4)**: Interacts with the running system **strictly as an external black box** via:
   - Real HTTP REST endpoints (`POST /api/tasks`, `GET /api/cubicles`, `POST /api/overseer/chat`)
   - Real WebSocket event streams (`ws://localhost:3820/events`)
   - Direct physical filesystem inspection on disk (`.swarm/`, `.agents/`, `worktrees/`)
   - Subprocess process signals.

```
+====================================================================================================+
|                              OPAQUE-BOX E2E TEST HARNESS (TRACK B)                                  |
+====================================================================================================+
  │
  ├──► TIER 1: FEATURE COVERAGE (>=5 tests per feature; 45+ concrete cases)
  │    Verifies every core functional contract operates as specified.
  │
  ├──► TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature; 45+ concrete cases)
  │    Injects extreme inputs, malformed payloads, quota exhaustion, and resource starvation.
  │
  ├──► TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise interaction matrix)
  │    Tests concurrency, multi-monitor pop-outs during atomic claims, error cascades.
  │
  └──► TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 living swarm end-to-end workflows)
       Simulates realistic end-to-end user journeys from prompt to git merge.
```

---

### 5.2 Tier 1: Feature Coverage Suite (>= 5 Tests per Feature)

The system comprises 9 distinct core features. Each feature receives at least 5 exhaustive automated test cases:

#### Feature 1: 16-Cubicle Grid Roster (R1)
- `TC-T1-ROSTER-01`: Verify exact 4x4 spatial layout with 16 distinct cubicle IDs (`cubicle-01` to `cubicle-16`).
- `TC-T1-ROSTER-02`: Verify default pre-population: Cubicles 1 & 2 are `Gemini 4 Argon (High)`, Cubicle 3 is `GPT Astra (Very High)`, Cubicles 4–16 are `unassigned`.
- `TC-T1-ROSTER-03`: Configure vacant `cubicle-04` with Custom CLI provider and verify state persists in `.swarm/status/cubicle-04.json`.
- `TC-T1-ROSTER-04`: Hot-swap model in `cubicle-02` from `Gemini 4 Argon` to `Claude 3.7 Sonnet` and verify UI icon and capability badge update.
- `TC-T1-ROSTER-05`: Clear occupied cubicle back to vacant state and assert all active task claims are released.

#### Feature 2: Thinking-Tier Sub-Swarm Gating (R2)
- `TC-T1-TIER-01`: Verify `Gemini 4 Argon (High)` is flagged `can_spawn_subswarm: true` upon startup.
- `TC-T1-TIER-02`: Verify `GPT Astra (Very High)` is flagged `can_spawn_subswarm: false` upon startup.
- `TC-T1-TIER-03`: Dispatch a complex decomposable task to Cubicle 1; verify `.swarm/subswarms/cubicle-01/manifest.json` is generated with child micro-tasks.
- `TC-T1-TIER-04`: Attempt sub-swarm spawn command from Cubicle 3 (`GPT Astra (Very High)`); verify gate immediately blocks execution with HTTP 403 / `CAPABILITY_RESTRICTION_ERROR`.
- `TC-T1-TIER-05`: Configure a custom model with thinking level `Ultra` (`can_spawn_subswarm: true`); verify sub-swarm spawning succeeds.

#### Feature 3: Worktree Isolation & NTFS Junctions (R3)
- `TC-T1-JUNC-01`: Initialize git repository target; verify directory worktrees exist at `worktrees/cubicle-01` through `worktrees/cubicle-03`.
- `TC-T1-JUNC-02`: Verify `<worktree>/.swarm` is an NTFS Reparse Point (Junction) pointing to `<root>/.swarm`.
- `TC-T1-JUNC-03`: Verify `<worktree>/.agents` is an NTFS Reparse Point (Junction) pointing to `<root>/.agents`.
- `TC-T1-JUNC-04`: Write file `<root>/.swarm/probe.tmp`; verify instant zero-copy visibility inside `<worktree-01>/.swarm/probe.tmp` without git commit.
- `TC-T1-JUNC-05`: Verify Git commits made in `worktrees/cubicle-01` are isolated to branch `swarm/cubicle-01` and do not appear in `main` until merged.

#### Feature 4: Atomic Taskboard & Progress Bars (R3, R4)
- `TC-T1-TASK-01`: Post new task to Overseer; verify creation in `.swarm/tasks/todo/task-XXX.json` and UI `To Do` column.
- `TC-T1-TASK-02`: Cubicle claims task; verify atomic `fs.rename` from `todo/task-XXX.json` to `in_progress/task-XXX.json`.
- `TC-T1-TASK-03`: Update task progress to 45%; verify task JSON reflects `progress_percent: 45` and UI progress bar animates.
- `TC-T1-TASK-04`: Complete task verification; verify atomic move from `in_progress/` to `review/` and finally `done/`.
- `TC-T1-TASK-05`: Verify Swarm Mission Progress Bar aggregates all task states accurately (`(done_tasks / total_tasks) * 100`).

#### Feature 5: Panopticon Brutalist UI, Error Feed & Sauron Spotlight (R4)
- `TC-T1-UI-01`: Verify UI renders with Brutalist Dystopian styling tokens (obsidian `#0a0b0e`, amber `#f59e0b`, crimson `#ef4444`).
- `TC-T1-UI-02`: Verify hovering "Eye of Sauron" SVG spotlight renders above 4x4 grid and performs ambient sweep across cubicles.
- `TC-T1-UI-03`: Trigger synthetic error in `cubicle-02`; verify Sauron spotlight locks directly onto `cubicle-02` with high-intensity crimson beam.
- `TC-T1-UI-04`: Verify incident entry created in `.swarm/logs/incidents.jsonl` and rendered in Center Incident Feed.
- `TC-T1-UI-05`: Test one-click "Reset Cubicle" in Error Feed; verify error status clears and cubicle returns to `idle`.

#### Feature 6: Multi-Monitor Proportional Scaling & Detachable Panels (R4)
- `TC-T1-MON-01`: Toggle multi-monitor selector from 1 to 2 displays; verify CSS grid adapts layout proportions.
- `TC-T1-MON-02`: Open detached pop-out window with `?panel=cubicles`; verify Left Grid renders in standalone viewport.
- `TC-T1-MON-03`: Open detached pop-out window with `?panel=taskboard`; verify Right Taskboard renders in standalone viewport.
- `TC-T1-MON-04`: Mutate task state in main window; verify pop-out taskboard updates within <= 50ms via WebSocket event.
- `TC-T1-MON-05`: Close pop-out window; verify main window seamlessly re-absorbs panel into unified view.

#### Feature 7: Preference Learning & Inheritance (Follow-Up R77-80)
- `TC-T1-PREF-01`: Chat preference `"Always use Vitest for unit tests"` to Overseer; verify extraction into `.swarm/memory/preferences.json`.
- `TC-T1-PREF-02`: Verify compiled markdown output in `.agents/rules/USER_PREFERENCES.md` contains the new rule.
- `TC-T1-PREF-03`: Inspect `worktrees/cubicle-01/.agents/rules/USER_PREFERENCES.md`; verify rule is immediately readable via junction.
- `TC-T1-PREF-04`: Dispatch new task to Cubicle 1; verify task context injection payload includes the learned Vitest rule.
- `TC-T1-PREF-05`: State contradictory preference `"Switch testing framework from Vitest to Jest"`; verify preference engine updates existing key with new rule and bumps `updated_at`.

#### Feature 8: Overseer Skill & MCP Generator (Follow-Up R81-84)
- `TC-T1-SKILL-01`: Chat command `"Generate a skill for git merge conflict resolution"`; verify creation of `.agents/skills/git-merge-conflict-resolver/SKILL.md`.
- `TC-T1-SKILL-02`: Validate YAML frontmatter in synthesized `SKILL.md` contains valid `name` and `description`.
- `TC-T1-SKILL-03`: Chat command `"Generate an MCP tool to inspect sqlite tables"`; verify creation of `.agents/mcp/sqlite-inspector/` and tool schema JSON.
- `TC-T1-SKILL-04`: Verify `.agents/mcp/mcp_config.json` automatically includes the new server entry.
- `TC-T1-SKILL-05`: Open Vault UI tab; verify newly generated Skill and MCP tool appear in the catalog with edit/test controls.

#### Feature 9: Standalone Executable Packaging & Launch (R5)
- `TC-T1-EXE-01`: Execute `scripts/build-exe.ps1`; verify exit code 0 and presence of `dist/SymlinkedAgentSwarm.exe`.
- `TC-T1-EXE-02`: Verify root copy exists at `<root>/SymlinkedAgentSwarm.exe`.
- `TC-T1-EXE-03`: Launch `SymlinkedAgentSwarm.exe --headless --port 3830`; verify server starts and returns HTTP 200 on `/api/health`.
- `TC-T1-EXE-04`: Fetch `GET /` from executable server; verify HTML payload contains Brutalist Panopticon root markup.
- `TC-T1-EXE-05`: Send SIGTERM / kill signal to executable process; verify clean shutdown and release of port 3830.

---

### 5.3 Tier 2: Boundary & Corner Cases Suite (>= 5 Tests per Feature)

Extreme inputs and failure conditions:

- `TC-T2-BOUND-01 (Zero Quota Exhaustion)`: Cubicle token balance reaches exactly `0`. Verify animation shifts to `Flatlined / Exhausted`, meter shows `0%`, and worker refuses to claim further tasks until replenished.
- `TC-T2-BOUND-02 (Mass Concurrent Claim Race)`: 100 simulated worker requests concurrently attempt to claim the same single task in `.swarm/tasks/todo/task-001.json`. Assert exactly one worker succeeds (HTTP 200), 99 receive `409 Conflict` / `ENOENT`, and the file is never corrupted or duplicated.
- `TC-T2-BOUND-03 (Path With Spaces & Unicode)`: Run the swarm in a directory with spaces and unicode: `H:\My Drive\Gemini Antigravity\scratch\swarm test 🚀\`. Verify NTFS junctions and executable build scripts execute with zero path-splitting errors.
- `TC-T2-BOUND-04 (Corrupted Preference JSON)`: Inject a malformed, invalid JSON syntax into `.swarm/memory/preferences.json`. Verify the engine falls back to `.preferences.json.bak`, logs a critical incident, and does not crash the swarm server.
- `TC-T2-BOUND-05 (Max Grid Saturation)`: Simultaneously configure and activate all 16 cubicles with intensive concurrent tasks. Verify system resource limits, websocket event throttling, and taskboard performance maintain <= 60 FPS UI rendering.
- `TC-T2-BOUND-06 (Circular Sub-Swarm Recursion Prevention)`: Child worker in a sub-swarm attempts to spawn another nested sub-swarm. Verify recursion depth cap (`max_depth = 1`) aborts the spawn and flags a nesting violation.
- `TC-T2-BOUND-07 (Malformed SKILL.md Frontmatter)`: Hand-edit a generated `SKILL.md` to omit closing `---`. Verify Vault UI surfaces a validation error badge and excludes it from active agent injection.
- `TC-T2-BOUND-08 (Orphaned Junction Recovery)`: Delete the target `.swarm` folder while a worktree junction still exists. Verify worktree health check detects the broken reparse point and cleanly recreates the junction.
- `TC-T2-BOUND-09 (Extreme Thought Ticker Content)`: Worker streams a 100,000-character thought log in a single frame. Verify UI thought bubble truncates gracefully with ellipsis and does not cause DOM reflow lag.
- `TC-T2-BOUND-10 (Rapid Monitor Detach/Attach Loop)`: Rapidly open and close detached pop-out monitor windows 50 times in 5 seconds. Verify WebSocket subscriptions are cleanly garbage collected without memory leaks.

---

### 5.4 Tier 3: Cross-Feature Combinations Suite (Pairwise Interaction Matrix)

Pairwise testing evaluates complex interactions between distinct features:

```
+------------------------------------+---------------+---------------+---------------+---------------+
| Feature Matrix                     | Sub-Swarm (R2)| Task Claim(R3)| Sauron Eye(R4)| Pref Learn(R7)|
+------------------------------------+---------------+---------------+---------------+---------------+
| Fatigue / Usage Meter              | [TEST CF-01]  | [TEST CF-02]  |               |               |
| Pop-Out Monitor Window             |               | [TEST CF-03]  | [TEST CF-04]  |               |
| Incident Logging Feed              | [TEST CF-05]  |               | [TEST CF-06]  |               |
| MCP Generator Hot-Reload           | [TEST CF-07]  |               |               | [TEST CF-08]  |
+------------------------------------+---------------+---------------+---------------+---------------+
```

- `CF-01 (Sub-Swarm x Fatigue Meter)`: When a parent cubicle spawns 4 child sub-swarm workers, verify token depletion from child workers aggregates back to the parent cubicle's fatigue meter in real time.
- `CF-02 (Task Claim x Fatigue Meter)`: A worker whose fatigue meter is below 5% attempts to claim a high-priority task. Verify system assigns a warning flag and requests Overseer confirmation before dispatching.
- `CF-03 (Task Claim x Pop-Out Monitor)`: An atomic task move occurs on the backend while the user is viewing a detached Taskboard on Monitor 2. Verify Monitor 2 updates via WebSocket within 50ms without full page reload.
- `CF-04 (Sauron Eye x Pop-Out Monitor)`: Sauron eye locks onto Cubicle 2 in the Left Grid window; verify the Pop-Out Console window on Monitor 3 displays the corresponding surveillance telemetry in sync.
- `CF-05 (Sub-Swarm x Incident Feed)`: Child worker in sub-swarm crashes during patch application. Verify parent cubicle catches failure, halts remaining subtasks, logs structured stack trace to incident feed, and triggers Sauron red spotlight.
- `CF-06 (Sauron Eye x Incident Feed)`: Clicking an incident log entry in the Center Console instantly commands the Eye of Sauron spotlight to swing across the 4x4 grid and lock onto the cubicle that caused the incident.
- `CF-07 (Sub-Swarm x MCP Generator)`: While a sub-swarm is actively running, Overseer generates a new MCP tool. Verify the child workers in `worktree/cubicle-01` discover and can invoke the tool mid-task via junction `.agents/mcp/`.
- `CF-08 (MCP Generator x Preference Learning)`: User states a preference regarding MCP timeout limits. Verify preference persists and immediately applies to newly generated MCP server templates.

---

### 5.5 Tier 4: Real-World Application Scenarios (Living Swarm Workflows)

Five complete end-to-end autonomous engineering simulations:

#### Scenario 1: Multi-Agent Feature Implementation Workflow
1. User enters Overseer prompt: *"Implement an encrypted session cookie middleware in src/auth.ts with full unit tests."*
2. Overseer decomposes goal into 2 tasks: `Task-001 (Middleware Implementation)` and `Task-002 (Unit Test Suite)`.
3. Task-001 is claimed by Cubicle 1 (`Gemini 4 Argon High`); Task-002 is claimed by Cubicle 2 (`Gemini 4 Argon High`).
4. Cubicle 1 spawns a sub-swarm to write the cipher routines in parallel.
5. Worktrees execute code changes on branches `swarm/cubicle-01` and `swarm/cubicle-02`.
6. Tasks move to `review/`. Verification test command `npm test` runs automatically.
7. Tests pass; branches are merged into `main`; tasks move to `done/`. Overall progress bar reaches 100%.

#### Scenario 2: Thinking-Tier Capability Enforcement & Recovery
1. User or Overseer attempts to dispatch a recursive architectural refactoring task requiring sub-swarms to Cubicle 3 (`GPT Astra Very High`).
2. Capability gate detects `can_spawn_subswarm: false`.
3. Action is blocked; HTTP 403 returned.
4. Red incident entry logged: `"Capability Restriction: GPT Astra (Very High) in Cubicle 3 unauthorized for sub-swarm generation."`
5. Eye of Sauron spotlight snaps to Cubicle 3 with blinking amber warning.
6. Overseer chat console alerts user and recommends reassigning to Cubicle 1 (`Gemini 4 Argon High`) or upgrading Cubicle 3 to `GPT Astra (Ultra)`.
7. User approves reassignment; task dispatches to Cubicle 1 and completes successfully.

#### Scenario 3: Continuous Preference Learning ("Never Explain Twice")
1. During review, user observes a worker generated an untyped function and chats: *"Stop using any in TypeScript files. Always use unknown and type guards."*
2. Overseer preference engine intercepts message, extracts `key: "no_any_type"`, writes to `.swarm/memory/preferences.json`, and recompiles `.agents/rules/USER_PREFERENCES.md`.
3. Overseer confirms in chat: *"Rule recorded in Vault. Propagated to all 16 cubicles via .agents junction."*
4. User dispatches a new task to Cubicle 3: *"Write a parser for user input."*
5. Cubicle 3 loads updated preferences; system prompt enforces strict typing.
6. Inspection of generated code in `worktrees/cubicle-03/` confirms zero instances of `any`. User did not repeat the instruction.

#### Scenario 4: Autonomous Skill & MCP Synthesis
1. User notices recurring manual git rebase issues and asks: *"Create a skill for rebasing cubicle branches onto main."*
2. Overseer generates `.agents/skills/git-rebase-sync/SKILL.md` and `scripts/sync_rebase.ps1`.
3. Overseer registers the skill; event broadcasts to UI Vault.
4. User navigates to Vault tab in Panopticon UI, inspects the generated skill, and clicks `[RUN DRY-RUN TEST]`.
5. Script executes in dry-run mode and reports success.
6. Cubicle 1 subsequently invokes `git-rebase-sync` during its next task finalization.

#### Scenario 5: Catastrophic Worker Failure & Incident Recovery
1. Synthetic memory leak or syntax panic is triggered in `cubicle-02` during task execution.
2. Worker process terminates unexpectedly.
3. Swarm heartbeat detector notes missing heartbeat (> 10s).
4. Cubicle status changes to `Error / Flatlined`; fatigue bar drops to 0%.
5. Eye of Sauron spotlight swings and pulses intense crimson on `cubicle-02`.
6. Incident panel shows stack trace and offers one-click `[RETRY & REASSIGN TASK]`.
7. User clicks button: task moves back to `.swarm/tasks/todo/`, Cubicle 2 resets to `idle`, and Cubicle 1 reclaims the task.

---

### 5.6 Automated Verification Scripts

#### 1. NTFS Junction & Worktree Integrity Test (`test-junctions.ps1`)
```powershell
param ([string]$RepoRoot = "$PSScriptRoot\..")

Write-Host "Verifying NTFS Junctions across cubicle worktrees..." -ForegroundColor Cyan

$cubicles = 1..3 | ForEach-Object { "cubicle-{0:D2}" -f $_ }
$allPassed = $true

foreach ($c in $cubicles) {
    $wtPath = Join-Path $RepoRoot "worktrees\$c"
    $swarmJunc = Join-Path $wtPath ".swarm"
    $agentsJunc = Join-Path $wtPath ".agents"

    # Test worktree exists
    if (!(Test-Path $wtPath)) {
        Write-Error "Worktree missing: $wtPath"
        $allPassed = $false
        continue
    }

    # Verify ReparsePoint (Junction)
    $swarmItem = Get-Item $swarmJunc -Force
    if (($swarmItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        Write-Error "$swarmJunc is NOT an NTFS Reparse Point!"
        $allPassed = $false
    } else {
        Write-Host " [PASS] $swarmJunc is valid Junction" -ForegroundColor Green
    }

    $agentsItem = Get-Item $agentsJunc -Force
    if (($agentsItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        Write-Error "$agentsJunc is NOT an NTFS Reparse Point!"
        $allPassed = $false
    } else {
        Write-Host " [PASS] $agentsJunc is valid Junction" -ForegroundColor Green
    }

    # Zero-Copy Write/Read Verification
    $testId = [Guid]::NewGuid().ToString()
    $testFile = Join-Path $RepoRoot ".swarm\test_$testId.tmp"
    Set-Content -Path $testFile -Value "junction_test_payload"
    
    $readBackPath = Join-Path $swarmJunc "test_$testId.tmp"
    if ((Test-Path $readBackPath) -and ((Get-Content $readBackPath) -eq "junction_test_payload")) {
        Write-Host " [PASS] Zero-copy verification succeeded for $c" -ForegroundColor Green
        Remove-Item $testFile -Force
    } else {
        Write-Error "Zero-copy read verification FAILED for $c"
        $allPassed = $false
    }
}

if ($allPassed) {
    Write-Host "`nAll NTFS Junction tests PASSED!" -ForegroundColor Green
} else {
    exit 1
}
```

#### 2. Atomic Concurrency Claim Race Test (`test-atomic-claim.ts`)
```typescript
import { promises as fs } from 'fs';
import path from 'path';

async function testAtomicClaimRace() {
  console.log('Testing atomic task claim race condition...');
  const swarmDir = path.resolve(process.cwd(), '.swarm/tasks');
  const todoFile = path.join(swarmDir, 'todo/task-race-01.json');
  const inProgressDir = path.join(swarmDir, 'in_progress');

  await fs.mkdir(path.dirname(todoFile), { recursive: true });
  await fs.mkdir(inProgressDir, { recursive: true });
  await fs.writeFile(todoFile, JSON.stringify({ id: 'task-race-01', title: 'Race Test' }));

  const workers = Array.from({ length: 50 }, (_, i) => `cubicle-${String(i + 1).padStart(2, '0')}`);
  let claimSuccesses = 0;
  let claimCollisions = 0;

  // 50 concurrent rename attempts simulating simultaneous workers
  const results = await Promise.allSettled(
    workers.map(async (workerId) => {
      const dest = path.join(inProgressDir, `task-race-01.json`);
      try {
        await fs.rename(todoFile, dest);
        claimSuccesses++;
        return { workerId, success: true };
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          claimCollisions++;
          return { workerId, success: false, reason: 'Already claimed' };
        }
        throw err;
      }
    })
  );

  console.log(`Results: Successes = ${claimSuccesses}, Collisions = ${claimCollisions}`);
  if (claimSuccesses === 1 && claimCollisions === 49) {
    console.log('PASS: Exactly one worker claimed the task with zero corruptions!');
    await fs.unlink(path.join(inProgressDir, `task-race-01.json`)).catch(() => {});
  } else {
    console.error('FAIL: Concurrency race invariant violated!');
    process.exit(1);
  }
}

testAtomicClaimRace();
```

#### 3. Standalone Executable Smoke Test (`test-exe-smoke.ps1`)
```powershell
param (
    [string]$ExePath = "$PSScriptRoot\..\SymlinkedAgentSwarm.exe",
    [int]$Port = 3840
)

$ErrorActionPreference = "Stop"
Write-Host "Running Standalone Executable Smoke Test on $ExePath..." -ForegroundColor Cyan

if (!(Test-Path $ExePath)) {
    Write-Error "Executable not found at $ExePath"
    exit 1
}

$proc = Start-Process -FilePath $ExePath -ArgumentList "--headless --port $Port" -PassThru
Write-Host "Process spawned with PID $($proc.Id). Waiting for HTTP health check..." -ForegroundColor Yellow

$maxRetries = 15
$ready = $false

for ($i = 1; $i -le $maxRetries; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -Method Get -TimeoutSec 2
        if ($res.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        # Waiting for server startup
    }
}

try {
    if ($ready) {
        Write-Host " [PASS] Server responded with status 'ok' on port $Port" -ForegroundColor Green
        
        # Test UI HTML endpoint
        $uiRes = Invoke-WebRequest -Uri "http://localhost:$Port/" -Method Get -TimeoutSec 2
        if ($uiRes.Content -match "Panopticon") {
            Write-Host " [PASS] UI HTML rendered with Panopticon markers" -ForegroundColor Green
        } else {
            throw "UI HTML missing Panopticon markers"
        }
    } else {
        throw "Server failed to respond to health check after $maxRetries seconds"
    }
} finally {
    Write-Host "Stopping test process PID $($proc.Id)..." -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force
}

Write-Host "Standalone Executable Smoke Test PASSED!" -ForegroundColor Green
```

---

## 6. Unified Interfaces, Data Models & File Layout

### 6.1 Complete Repository Layout Blueprint
```
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\
├── SymlinkedAgentSwarm.exe                 # Root standalone executable (R5)
├── README.md                               # Comprehensive system manual
├── package.json                            # Node.js project manifest
├── tsconfig.json                           # Strict TypeScript configuration
├── dist/
│   ├── SymlinkedAgentSwarm.exe             # Compiled standalone executable
│   └── public/                             # Embedded UI bundle
├── .swarm/                                 # Central Coordination Root
│   ├── TASKBOARD.md                        # Master markdown taskboard
│   ├── tasks/                              # Atomic task state
│   │   ├── todo/
│   │   ├── in_progress/
│   │   ├── review/
│   │   └── done/
│   ├── subswarms/                          # Per-cubicle sub-swarm manifests
│   │   └── cubicle-01/
│   ├── status/                             # Per-cubicle heartbeats & telemetry
│   │   ├── cubicle-01.json
│   │   └── cubicle-16.json
│   ├── logs/                               # Incident & execution logs
│   │   └── incidents.jsonl
│   └── memory/                             # Machine-readable learned state
│       └── preferences.json                # Learned preferences database
├── .agents/                                # Agent Rules, Skills & Tools
│   ├── rules/
│   │   └── USER_PREFERENCES.md             # Compiled agent instructions
│   ├── skills/                             # Synthesized skills
│   │   └── <skill-name>/
│   │       ├── SKILL.md
│   │       └── scripts/
│   └── mcp/                                # Synthesized MCP servers
│       ├── mcp_config.json                 # MCP registration authority
│       └── <server-name>/
│           └── tools/
├── worktrees/                              # Isolated Git Worktrees
│   ├── cubicle-01/                         # (branch: swarm/cubicle-01)
│   │   ├── .swarm/                         # -> Junction to <root>/.swarm
│   │   └── .agents/                        # -> Junction to <root>/.agents
│   └── cubicle-16/
├── server/                                 # Backend Source Code
│   ├── src/
│   │   ├── index.ts                        # Server entry point
│   │   ├── overseer/                       # Overseer brain & preference engine
│   │   ├── worktrees/                      # Worktree & Junction manager
│   │   ├── capability/                     # Thinking-tier gate matrix
│   │   ├── skills/                         # Skill & MCP generator
│   │   └── events/                         # Real-time WebSocket event bus
├── ui/                                     # Brutalist Panopticon Frontend
│   ├── index.html
│   ├── css/
│   │   ├── brutalist.css                   # Cyberpunk styling tokens
│   │   └── panopticon.css                  # 3-column & spotlight styles
│   └── js/
│       ├── app.js                          # Main coordinator & multi-monitor router
│       ├── grid.js                         # 4x4 animated cubicle grid
│       ├── sauron.js                       # Eye of Sauron spotlight physics
│       ├── console.js                      # Overseer chat & incident feed
│       ├── taskboard.js                    # Kanban & progress bars
│       └── vault.js                        # Memory, Skills & MCP vault
├── scripts/
│   ├── build-exe.ps1                       # Executable compilation script
│   ├── publish-github.ps1                  # GitHub init & push script
│   ├── test-junctions.ps1                  # Junction verification script
│   └── test-exe-smoke.ps1                  # Executable smoke test script
├── tests/                                  # Dual-Track Test Suite
│   ├── unit/                               # Track A tests
│   └── e2e/                                # Track B Opaque-Box tests
│       ├── tier1-feature-coverage.spec.ts  # Tiers 1-4
│       ├── tier2-boundary.spec.ts
│       ├── tier3-pairwise.spec.ts
│       └── tier4-scenarios.spec.ts
└── .github/
    └── workflows/
        └── release-exe.yml                 # Automated release pipeline
```

---

## 7. Actionable Implementation Roadmap for Downstream Milestone Builders

To guide subsequent Sub-orchestrators and Implementers, the build sequence should follow these 4 phased milestones:

### Milestone 1: Storage, Repos & Preference Engine
- Provision `.swarm/` and `.agents/` directory trees.
- Implement `PreferenceExtractor` and `RuleCompiler` in `server/src/overseer/preferences.ts`.
- Write atomic file writers for `preferences.json` and `USER_PREFERENCES.md`.
- Implement `test-atomic-claim.ts` and `test-junctions.ps1`.

### Milestone 2: Overseer Skill & MCP Generator & Vault Engine
- Implement `SkillGenerator` scaffolding `.agents/skills/<name>/SKILL.md`.
- Implement `McpGenerator` generating stdio wrappers and `mcp_config.json`.
- Expose REST API endpoints for Vault: `GET /api/vault/preferences`, `POST /api/vault/skills/test`, `POST /api/vault/mcp/invoke`.
- Build UI Vault tab in Center Panopticon section.

### Milestone 3: Packaging & Release Pipeline
- Configure `@yao-pkg/pkg` in `package.json` with target `node20-win-x64` and embedded static assets.
- Create `scripts/build-exe.ps1` and test end-to-end `.exe` compilation.
- Verify `SymlinkedAgentSwarm.exe` launch with `test-exe-smoke.ps1`.
- Setup `.github/workflows/release-exe.yml` and `scripts/publish-github.ps1`.

### Milestone 4: Opaque-Box Dual-Track Test Harness Execution
- Implement the 45+ Tier 1 test cases covering all 9 core features.
- Implement the 45+ Tier 2 boundary and corner case test suite.
- Execute Tier 3 Pairwise combination matrix.
- Execute Tier 4 living swarm end-to-end scenarios.
- Verify 100% pass rate before final delivery.

---

**End of Analysis Report — Explorer Survey 3.**
