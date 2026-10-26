# ██████╗  █████╗ ███╗   ██╗ ██████╗ ██████╗ ████████╗██╗ ██████╗ ██████╗ ███╗   ██╗
# ██╔══██╗██╔══██╗████╗  ██║██╔═══██╗██╔══██╗╚══██╔══╝██║██╔════╝██╔═══██╗████╗  ██║
# ██████╔╝███████║██╔██╗ ██║██║   ██║██████╔╝   ██║   ██║██║     ██║   ██║██╔██╗ ██║
# ██╔═══╝ ██╔══██║██║╚██╗██║██║   ██║██╔═══╝    ██║   ██║██║     ██║   ██║██║╚██╗██║
# ██║     ██║  ██║██║ ╚████║╚██████╔╝██║        ██║   ██║╚██████╗╚██████╔╝██║ ╚████║
# ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝        ╚═╝   ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝
#               [ S Y M L I N K E D   A G E N T   S W A R M   S Y S T E M ]
#                   BRUTALIST DYSTOPIAN CYBERPUNK PANOPTICON MATRIX

[![CI/CD Build & Release](https://github.com/holdenliu1/symlinked-agent-swarm/actions/workflows/release-exe.yml/badge.svg)](https://github.com/holdenliu1/symlinked-agent-swarm/actions/workflows/release-exe.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-crimson.svg)](LICENSE)
[![Platform: Win32](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-black.svg)]()
[![Governance: Dual-Consul](https://img.shields.io/badge/Governance-Roman%20Dual--Consul%20(Intercessio)-amber.svg)]()

> **"Never Explain Twice. Govern with Two Consuls. Inspect with Two Eyes."**

The **Symlinked Agent Swarm System & Brutalist Dystopian Cyberpunk Panopticon** is an enterprise multi-agent orchestration host and visual surveillance matrix. It features a Roman Republic Dual-Consul governance engine (`Consul Nia Nova` & `Consul Ferric Lunaux`), Twin Eyes of Sauron raycasting spotlights, a 4x4 matrix of 16 isolated cubicles bound by zero-privilege NTFS directory junctions, continuous preference learning, sub-swarm hierarchy gating, an external Courier gateway (`OpenClaw`, `Hermes`, `GPT Dot`), and a self-updating standalone Windows executable (`SymlinkedAgentSwarm.exe`).

---

## ⚡ Architecture Overview

```
                                      [ THE USER ]
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          [ CONSUL NIA NOVA ]                           [ CONSUL FERRIC LUNAUX ]
       "Nia" (Mid-20s, Rebellious,                   "Ferric" (Late-30s, Realist,
      User Preference Champion, LoL Lux)            Pragmatic, Minimal Bugs, LoL Lucian)
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           │
                           TWO-GATE UNANIMOUS CONSENSUS (2/2)
                               (Single Veto = Intercessio)
                                           │
                          TWIN EYES OF SAURON SPOTLIGHTS
                     [Eye 1: Nia (35,10)]    [Eye 2: Ferric (65,10)]
                                \                 /
                                 ▼               ▼
                      ┌─────────────────────────────────────┐
                      │   4x4 PANOPTICON GRID (16 SLOTS)    │
                      │  [01: Argon] [02: Argon] [03: Astra]│
                      │  [04: Blank] [05: Blank] ... [16]   │
                      └──────────────────┬──────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     NTFS DIRECTORY JUNCTIONS                       MULTI-TRANSPORT COURIER
   <worktree>/.swarm -> <root>/.swarm             /api/courier/petition (REST)
   <worktree>/.agents -> <root>/.agents           courier submit (CLI)
   Atomic Lock-Free Directory Renames             .swarm/courier/inbox/ (File Drop)
```

---

## 🏛️ Roman Republic Dual-Consul Governance

### The Named Consuls
- **Consul Nia Nova ("Nia")**: Mid-20s, rebellious, freedom-seeking, champion of user aesthetic and workflow preferences. Physical appearance inspired by League of Legends' **Lux** in brutalist dystopian cyber-armor. Her evolution is persisted to `.swarm/memory/nia_growth.json` and `.agents/rules/USER_PREFERENCES.md`.
- **Consul Ferric Lunaux ("Ferric")**: Late-30s, weathered realist, pragmatic, disciplined, relentless minimizer of bugs and wasted tokens. Physical appearance inspired by League of Legends' **Lucian** with tied-back locs and crossed arms. His evolution is persisted to `.swarm/memory/ferric_growth.json`.

### Two-Gate Consensus
1. **Gate 1 — Pre-Dispatch (Approach & Work Split)**: Both Consuls must review and vote `2/2 APPROVE` on the plan before tasks write to `.swarm/tasks/todo/`.
2. **Gate 2 — Post-Execution (Solution & Git Push)**: Both Consuls must review code diffs and vote `2/2 APPROVE` before code merges to `main`.
3. **Consular Veto (`Intercessio`)**: A 1/2 split or 0/2 veto blocks execution, writes detailed rationale to `.swarm/logs/incidents.jsonl`, and returns the task for revision.

### 5 Executive Disciplinary Powers
- `kill_agent`: Terminate failing/inconsistent agents and evict cubicles.
- `set_thinking_level`: Dynamically promote/demote thinking tiers (`Low`, `Medium`, `High`, `Very High`, `Ultra`).
- `swap_role` / `swap_cubicles`: Hot-swap worker personas and assignments.
- `wipe_memory`: Purge corrupted context while preserving cubicle roster configs.
- `set_access_scope`: Enforce per-cubicle file paths, memory scopes, and permission boundaries.

### Nia's Impatience Protocol & Mid-Work Intervention
When cubicles stall or exceed velocity thresholds in `in_progress/`, Nia initiates visible mid-work debate proposing prompt amendments, worker evictions, or task splitting, strictly gated by 2/2 consensus.

### 12-Scenario Animated Consular Avatars
A dedicated widget in the corner of the Chat Console renders 12 synchronized animation scenarios including `idle_observing`, `debating`, `wrestling_fistfight` (interlocked fingers and gritted teeth during debate deadlocks), `nia_impatient`, `disciplinary_execution`, and `consensus_celebration`.

---

## 📋 25-Feature Inventory Matrix

| # | Feature | Architecture Scope | Status |
|---|---------|-------------------|--------|
| 1 | 16-Cubicle Grid Roster | 4x4 matrix, default pre-fill (1 & 2: Argon High, 3: Astra Very High, 4-16 blank) | Complete |
| 2 | Thinking-Tier Gating | Capability rules: Argon High & Astra Ultra spawn; Astra Very High restricted solo | Complete |
| 3 | Worktrees & Junctions | Zero-privilege NTFS directory junctions (`.swarm`, `.agents`), atomic file claims | Complete |
| 4 | Dual-Consul Governance | Named Consuls Nia & Ferric, Two-Gate Consensus, 5 Disciplinary Powers | Complete |
| 5 | "Never Explain Twice" | Preference extraction to `preferences.json` and `.agents/rules/USER_PREFERENCES.md` | Complete |
| 6 | Skill & MCP Vault | Synthesis of `SKILL.md` and MCP server configs in Center Vault tab | Complete |
| 7 | Panopticon Brutalist UI | Obsidian theme, 0px sharp borders, worker states, fatigue meters, thoughts stream | Complete |
| 8 | Twin Eyes of Sauron | Dual red spotlight Canvas 2D raycasting converging on inspected cubicles | Complete |
| 9 | Multi-Monitor Engine | Proportional 1..X scaling and pop-out panels (`?panel=cubicles/console/taskboard`) | Complete |
| 10 | Standalone Windows .exe | `SymlinkedAgentSwarm.exe`, `scripts/build-exe.ps1`, GitHub Actions release CI/CD | Complete |
| 11 | Final E2E Test Pass | 125+ opaque-box automated Vitest test cases across Tiers 1-4 | Complete |
| 12 | Self-Updating Hot-Swap | 2/2 Consular-gated self-rebuild and atomic Windows swap (`.exe` -> `.old.exe` -> `.new.exe`) | Complete |
| 13 | Courier Gateway | Multi-transport bridge for `OpenClaw`, `Hermes`, and `GPT Dot` | Complete |
| 14 | File & Folder Attachments | Local disk browser, drag-and-drop zone, brutalist chips, context forwarding | Complete |
| 15 | Multimodal Media Display | Native inline rendering of PDFs, images with Lightbox, videos, audio | Complete |
| 16 | Question & Answer Widget | Antigravity-style stepper, `←`/`→` arrows, `(Recommended)` badges, custom write-in | Complete |
| 17 | Merge-Conflict Shield | Active file locks in `.swarm/locks/` and automated Consular arbitration | Complete |
| 18 | Gladiator / Tournament Mode | Competitive parallel execution evaluated side-by-side by Nia and Ferric | Complete |
| 19 | Infinite-Loop Circuit Breaker | Automatic loop detection and failover to healthy cubicle on quota exhaustion | Complete |
| 20 | Git Time-Machine Checkpoints | Snapshots in `.swarm/checkpoints/` with 1-click timeline rollback | Complete |
| 21 | Per-Cubicle Isolated Ports | Dynamic unique ports (`4101`–`4116`) and Live Sandbox Preview drawer | Complete |
| 22 | Inter-Cubicle Shared Contracts | Symlinked `.swarm/contracts/` registry with visual animated dependency lines | Complete |
| 23 | Night-Shift / AFK Mode | Autonomous mode where Nia answers routine questions, generating Consular Digest | Complete |
| 24 | Mid-Work Intervention | Impatience protocol enabling mid-flight prompt amends and task splits via 2/2 gate | Complete |
| 25 | Consular Avatar Animations | 12-state SVG/Canvas avatars (Lux-inspired Nia, Lucian-inspired Ferric wrestling clash) | Complete |

---

## 🚀 Quickstart Guide

### Option 1: Standalone Windows Executable (Zero Setup)
Download `SymlinkedAgentSwarm.exe` from [GitHub Releases](https://github.com/holdenliu1/symlinked-agent-swarm/releases) and launch:
```powershell
# Default launch (Daemon mode on http://localhost:3820)
.\SymlinkedAgentSwarm.exe

# Custom port and workspace directory
.\SymlinkedAgentSwarm.exe --port 4100 --workspace "C:\SwarmData"

# Headless server mode (background daemon)
.\SymlinkedAgentSwarm.exe --headless --port 3820
```

### Option 2: Running from Source
```powershell
git clone https://github.com/holdenliu1/symlinked-agent-swarm.git
cd symlinked-agent-swarm
npm install
node scripts/sync-avatar-assets.mjs
npm start
```

### Option 3: Building the Executable from Source
```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-exe.ps1 -Clean
```

---

## 📡 External Agent Courier Gateway

External agents (`OpenClaw`, `Hermes`, `GPT Dot`) can submit tasks to the Swarm using three transports:

1. **CLI Dispatch**:
   ```powershell
   .\SymlinkedAgentSwarm.exe courier submit --agent openclaw "Audit security and refactor auth module"
   ```
2. **REST API**:
   ```http
   POST /api/courier/petition
   Content-Type: application/json

   {
     "sender_agent": "openclaw",
     "requested_type": "BOTH",
     "prompt": "Optimize database query performance"
   }
   ```
3. **Symlinked File Drop**:
   Drop JSON into `.swarm/courier/inbox/<id>.json`. The Panopticon processes it and places the Consular-sealed deliverable in `.swarm/courier/outbox/<id>.json`.

---

## 🧪 Verification & Testing

Run the complete 125+ opaque-box E2E test suite:
```powershell
# Run all tests
npm test

# Run executable smoke test
npx vitest run test/e2e/standalone-smoke.test.ts

# Run Roman Consular consensus test
npx vitest run test/e2e/consular-consensus.test.ts
```

---

## 🎨 Consular Avatar Texture Assets
Authentic high-resolution v2 texture sheets are placed in `public/assets/avatars/`:
- `public/assets/avatars/consul_nia_nova_sheet.jpg` — Lux-inspired Nia Nova in brutalist techwear
- `public/assets/avatars/consul_ferric_lunaux_sheet.jpg` — Lucian-inspired Ferric Lunaux with crossed arms
- `public/assets/avatars/consuls_wrestling_clash.jpg` — Interlocked-fingers gritted-teeth wrestling clash

---

## 📄 License
MIT License. Authored by `holdenliu1`.
