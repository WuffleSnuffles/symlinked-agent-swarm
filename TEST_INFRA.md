# Test Infrastructure Specification: Symlinked Agent Swarm & Panopticon

**Document Version**: 1.0.0  
**Status**: APPROVED & PUBLISHED  
**Author**: E2E Test Writer 1 (Independent E2E Testing Track)  
**Project Root**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm`  
**Target Runner**: Vitest / Node.js 20+ with TypeScript  

---

## 1. Testing Philosophy

The Symlinked Agent Swarm System and Brutalist Dystopian Cyberpunk Panopticon orchestrates multi-agent autonomous swarms, Windows NTFS Directory Junctions, Git worktrees, dual-consul governance, and real-time multi-monitor interfaces.

To ensure production stability, the testing infrastructure adheres to three core tenets:

### 1.1 Strict Opaque-Box Verification (Black Box)
- Tests interact with the system strictly through its **public observable interfaces**:
  1. **HTTP REST Endpoints**: `/api/tasks`, `/api/cubicles`, `/api/overseer/chat`, `/api/governance`, `/api/vault`, `/api/health`.
  2. **Real-Time WebSocket & Broadcast Streams**: `ws://localhost:3820/events` and browser `BroadcastChannel('panopticon_swarm_sync')`.
  3. **Authoritative Filesystem State**: Physical inspection of `.swarm/` (`tasks/`, `subswarms/`, `status/`, `memory/`, `logs/`) and `.agents/` (`rules/`, `skills/`, `mcp/`).
  4. **Operating System Process Signals**: Windows process lifecycle, CLI arguments, and port management.
- Tests do **NOT** hook into private internal state variables or monkey-patch private module methods. If an internal refactoring occurs, the test suite remains authoritative and stable.

### 1.2 Zero Mocking of Real Reparse Points (NTFS Directory Junctions)
- Traditional mocked file systems (like mock-fs) fail to reproduce the genuine kernel-level semantics of NTFS Directory Junctions (`IO_REPARSE_TAG_MOUNT_POINT`), junction loop prevention, case sensitivity nuances, and Windows security descriptors.
- The test harness creates **physical temporary workspaces** on NTFS-backed storage. It invokes native `fs.symlink(target, link, 'junction')` or `mklink /J` to verify real zero-copy file propagation across Git worktrees.
- Atomic claims are verified using native `fs.promises.rename` under high concurrency, asserting true OS-level lock-free mutual exclusion.

### 1.3 Requirement-Driven Traceability
- Every test case maps directly to explicit functional requirements from `ORIGINAL_REQUEST.md` (R1 through R5, Follow-up 1, Follow-up 2) and `PROJECT.md` (Features 1 through 10).
- Expected outputs are derived mathematically, logically, and contractually from the interface schemas defined in `PROJECT.md`.

---

## 2. Test Architecture & Runner Invocation

### 2.1 Test Directory Layout
```
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\
├── test/
│   └── e2e/
│       ├── helpers.ts                      # Opaque-box test harness & fixture utilities
│       ├── tier1-feature-coverage.test.ts  # T1: 10 core features (>=5 tests each = 50+ tests)
│       ├── tier2-boundary-cases.test.ts    # T2: Boundary, error, race & stress (50+ tests)
│       ├── tier3-pairwise.test.ts          # T3: Cross-feature pairwise interactions (10+ tests)
│       ├── tier4-real-world-swarm.test.ts  # T4: 5 Living swarm full lifecycle scenarios
│       ├── consular-consensus.test.ts      # Roman Dual-Consul veto & consensus suite
│       └── standalone-smoke.test.ts        # SymlinkedAgentSwarm.exe packaging & smoke launch
├── vitest.config.ts                        # Vitest runner configuration
├── TEST_INFRA.md                           # This infrastructure document
└── TEST_READY.md                           # Published verification readiness gate
```

### 2.2 Runner Invocation Commands

#### Run All E2E Suites:
```bash
npm test
# or directly via npx:
npx vitest run test/e2e
```

#### Run Specific Test Tiers:
```bash
# Tier 1: Core Feature Coverage
npx vitest run test/e2e/tier1-feature-coverage.test.ts

# Tier 2: Boundary & Corner Cases
npx vitest run test/e2e/tier2-boundary-cases.test.ts

# Tier 3: Pairwise Interactions
npx vitest run test/e2e/tier3-pairwise.test.ts

# Tier 4: Real-World Scenarios
npx vitest run test/e2e/tier4-real-world-swarm.test.ts

# Roman Dual-Consul Consensus Suite
npx vitest run test/e2e/consular-consensus.test.ts

# Standalone Executable Smoke Test
npx vitest run test/e2e/standalone-smoke.test.ts
```

#### Environment Variables:
- `TEST_SERVER_URL`: Base HTTP URL of running swarm server (Default: `http://localhost:3820`).
- `TEST_WS_URL`: WebSocket URL of running swarm server (Default: `ws://localhost:3820/events`).
- `SWARM_EXE_PATH`: Absolute path to standalone executable (Default: `SymlinkedAgentSwarm.exe`).
- `SWARM_TEST_ISOLATION_DIR`: Root path for test workspaces (Default: `<os_temp>/swarm_e2e_<timestamp>`).

---

## 3. Feature Inventory to Test Tier Mapping

| # | Feature Name | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) | Dedicated Suite |
|---|--------------|-------------------|-------------------|-------------------|-------------------|-----------------|
| F1 | 16-Cubicle Grid Roster | 5 tests (`TC-T1-ROSTER-01..05`) | 5 tests (`TC-T2-ROSTER-01..05`) | `CF-02` | `Scenario-1` | - |
| F2 | Thinking-Tier Gating | 5 tests (`TC-T1-GATE-01..05`) | 5 tests (`TC-T2-GATE-01..05`) | `CF-01`, `CF-05`, `CF-07` | `Scenario-2` | - |
| F3 | Git Worktrees & Junctions | 5 tests (`TC-T1-WORKTREE-01..05`) | 5 tests (`TC-T2-WORKTREE-01..05`) | `CF-02`, `CF-03` | `Scenario-1`, `Scenario-3` | - |
| F4 | Roman Dual-Consul Governance | 5 tests (`TC-T1-CONSUL-01..05`) | 5 tests (`TC-T2-CONSUL-01..05`) | `CF-04`, `CF-06`, `CF-09` | `Scenario-1` | `consular-consensus.test.ts` |
| F5 | Preference Learning ("Never Explain Twice") | 5 tests (`TC-T1-PREF-01..05`) | 5 tests (`TC-T2-PREF-01..05`) | `CF-08`, `CF-09` | `Scenario-3` | - |
| F6 | Overseer Skill & MCP Generator | 5 tests (`TC-T1-SKILL-01..05`) | 5 tests (`TC-T2-SKILL-01..05`) | `CF-07`, `CF-08` | `Scenario-4` | - |
| F7 | Brutalist UI & Error Feed | 5 tests (`TC-T1-UI-01..05`) | 5 tests (`TC-T2-UI-01..05`) | `CF-05`, `CF-06` | `Scenario-5` | - |
| F8 | Twin Eyes of Sauron Spotlights | 5 tests (`TC-T1-SAURON-01..05`) | 5 tests (`TC-T2-SAURON-01..05`) | `CF-04`, `CF-06` | `Scenario-2`, `Scenario-5` | - |
| F9 | Multi-Monitor & Detachable Panels | 5 tests (`TC-T1-MONITOR-01..05`) | 5 tests (`TC-T2-MONITOR-01..05`) | `CF-03`, `CF-04`, `CF-10` | `Scenario-1` | - |
| F10 | Standalone Windows .exe Packaging | 5 tests (`TC-T1-EXE-01..05`) | 5 tests (`TC-T2-EXE-01..05`) | - | - | `standalone-smoke.test.ts` |

---

## 4. Coverage Thresholds & Quality Gates

1. **Pass Rate Threshold**: **100% Pass** required across all suites. Zero test failures or skipped critical assertions.
2. **Feature Coverage**: >= 5 distinct test cases per core feature in Tier 1 (Total >= 50 test cases).
3. **Boundary & Stress Coverage**: >= 5 boundary test cases per core feature in Tier 2 (Total >= 50 test cases).
4. **Concurrency Invariant**: Under 50-100 parallel workers attempting atomic claim of a single task in `tasks/todo/`, exactly 1 worker succeeds and the rest receive collision/rejection; zero file corruption or duplicate claim.
5. **Junction Invariant**: Any file written to `.swarm/` or `.agents/` at root must be instantly visible and byte-identical inside all active worktree junctions without Git operations.
6. **Consular Consensus Invariant**: Branch merges and moves to `done/` require 2/2 unanimous `APPROVE` votes. A 1/2 split or 0/2 vote MUST issue a `VETO`, log rationale to `incidents.jsonl`, and return task for revision.
7. **Clean Teardown**: All test runs create isolated sandbox directories and clean up temporary junctions and processes upon completion.
