# Milestone 5 (Phase 1): Opaque-Box E2E Test Suite Exploration — Consular Consensus & Boundary Suites

**Author**: `explorer_m5_2` (Teamwork Explorer)  
**Date**: 2026-10-26T06:35:00Z  
**Status**: COMPLETE  
**Target Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m5_2`

---

## 1. Observation

### 1.1 Test Suite Inventory & Structure
Direct inspection of the codebase revealed the following test files and harness utilities:

1. **`test/e2e/consular-consensus.test.ts`** (217 lines, 8,545 bytes):
   - **Imports**: `describe, it, expect, beforeEach, afterEach` from `vitest`; `promises as fs` from `fs`; `path` from `path`; `createTestSandbox, evaluateConsularConsensus, ConsularVote, TaskRecord` from `./helpers` (lines 1-9).
   - **Lifecycle**: `beforeEach` calls `createTestSandbox('consul_suite')` (line 15); `afterEach` calls `sandbox.cleanup()` (line 19).
   - **Case A1 (1 Approve + 1 Veto)** (lines 26-94):
     - Sets up `task-consul-veto-01.json` in `sandbox.swarmDir/tasks/review/` (line 29).
     - Consul I votes `APPROVE` (`rationale`: "Connection pool implementation is thread-safe and matches spec.").
     - Consul II votes `VETO` (`rationale`: "INTERCESSIO VETO: Max connection pool size is unbound, risks resource exhaustion under load.").
     - Calls `evaluateConsularConsensus(vote1, vote2)` -> asserts `unanimous_approved === false` and `action_taken === 'VETO_BLOCKED_AND_REVISED'` (lines 59-60).
     - Renames task file from `tasks/review/` to `tasks/in_progress/` with status updated to `in_progress` and progress to `75%` (lines 64-73).
     - Logs incident to `sandbox.swarmDir/logs/incidents.jsonl` with `type: 'CONSULAR_VETO'`, `dissenting_consul: 'Consul II'`, `action: 'TASK_RETURNED_FOR_REVISION'` (lines 76-85).
     - Asserts file presence at revision path, absence at review path, and incident log contents (lines 88-93).
   - **Case A2 (1 Veto + 1 Approve)** (lines 96-114):
     - Consul I votes `VETO` ("INTERCESSIO VETO: Type narrowing missing in response parser."), Consul II votes `APPROVE`.
     - Asserts `unanimous_approved === false`, `action_taken === 'VETO_BLOCKED_AND_REVISED'`, `votes[0].rationale` contains "Type narrowing missing".
   - **Case A3 (0 Approve + 2 Veto)** (lines 116-133):
     - Both Consuls vote `VETO`. Asserts `unanimous_approved === false` and `action_taken === 'VETO_BLOCKED_AND_REVISED'`.
   - **Case B1 (2 Approve + 0 Veto)** (lines 140-195):
     - Sets up `task-consul-approve-01.json` in `tasks/review/`.
     - Both Consuls vote `APPROVE`. Asserts `unanimous_approved === true` and `action_taken === 'MERGED_TO_MAIN'`.
     - Renames task file from `tasks/review/` to `tasks/done/` with `status: 'done'` and `progress_percent: 100` (lines 177-186).
     - Asserts file presence in `done/`, absence in `review/`, and JSON status fields (lines 189-194).
   - **Case B2 (Audit Trail Timestamps)** (lines 197-214):
     - Verifies consensus result strictly preserves individual vote timestamps (`2026-10-26T00:30:00.000Z` and `2026-10-26T00:30:05.000Z`).

2. **`test/e2e/tier2-boundary-cases.test.ts`** (726 lines, 29,195 bytes):
   - **Feature 1 Boundary (Roster & Quotas)** (lines 31-113):
     - `TC-T2-ROSTER-01`: Zero remaining quota (`token_quota = 500000`, `tokens_used = 500000`) flatlines cubicle to `Error` and rejects task claims.
     - `TC-T2-ROSTER-02`: Negative quota (-5000) throws `INVALID_QUOTA`.
     - `TC-T2-ROSTER-03`: Max grid saturation (16 cubicles, `cubicle-01` to `cubicle-16`) creates 16 non-colliding instances.
     - `TC-T2-ROSTER-04`: Out-of-bounds IDs (`cubicle-00`, `cubicle-17`, `cubicle-99`) fail validation regex `/^cubicle-(\d{2})$/` bounded to 1..16.
     - `TC-T2-ROSTER-05`: 50 rapid alternating provider hot-swaps maintain clean deterministic state.
   - **Feature 2 Boundary (Capability Gating & Recursion)** (lines 118-177):
     - `TC-T2-GATE-01`: Child worker sub-swarm attempt blocked by `max_depth = 1` with `CIRCULAR_RECURSION_ERROR`.
     - `TC-T2-GATE-02`: Whitespace and case normalization (`'   gpt ASTRA   '`, `'  VERY high  '`) correctly evaluated as restricted.
     - `TC-T2-GATE-03`: Unknown model with Low tier restricted by default policy.
     - `TC-T2-GATE-04`: 20 concurrent unauthorized spawn attempts append 20 distinct log lines to `logs/incidents.jsonl`.
     - `TC-T2-GATE-05`: Empty task decomposition list (`[]`) throws `BAD_REQUEST`.
   - **Feature 3 Boundary (Worktrees, Junctions & Concurrency)** (lines 182-250):
     - `TC-T2-WORKTREE-01`: Directory with spaces, parentheses, and Unicode (`'test dir with spaces (special) 🚀'`) successfully hosts NTFS directory junction verified by `isReparsePoint()`.
     - `TC-T2-WORKTREE-02`: 50 concurrent workers attempt `fs.rename` of `tasks/todo/race-task-01.json` to `tasks/in_progress/` -> exactly 1 success, 49 collisions (`ENOENT`, `EPERM`, `EACCES`), zero duplicates.
     - `TC-T2-WORKTREE-03`: Broken/orphaned junction link healed cleanly by re-invoking `createJunction`.
     - `TC-T2-WORKTREE-04`: Deep directory nesting (`tasks/todo/nested/deep/task-deep.json`) accessible through worktree junction link.
     - `TC-T2-WORKTREE-05`: Non-existent source file rename rejects cleanly without unhandled crash.
   - **Feature 4 Boundary (Consular Governance Edge Cases)** (lines 254-332):
     - `TC-T2-CONSUL-01`: Simultaneous mutual veto (0/2) captures both rationales and sets `VETO_BLOCKED_AND_REVISED`.
     - `TC-T2-CONSUL-02`: Large Git diff summary (500,000 chars) handled safely without memory overflow.
     - `TC-T2-CONSUL-03`: Empty rationale in VETO vote throws `INVALID_VETO`.
     - `TC-T2-CONSUL-04`: Duplicate votes from same Consul overwrite prior vote idempotently in Map.
     - `TC-T2-CONSUL-05`: Unauthorized actor (`cubicle-01`) voting throws `UNAUTHORIZED`.
   - **Feature 5 Boundary (Preference Learning)** (lines 337-451):
     - `TC-T2-PREF-01`: Corrupted `preferences.json` (`{ invalid json syntax !!!`) gracefully recovers to empty preference structure without crash.
     - `TC-T2-PREF-02`: 50,000-character preference string compiles into `USER_PREFERENCES.md`.
     - `TC-T2-PREF-03`: Emojis (`🚀, 🛡️`), HTML tags (`<script>`), and markdown special characters preserved verbatim.
     - `TC-T2-PREF-04`: 20 rapid sequential writes to `preferences.json` execute atomically without file truncation.
     - `TC-T2-PREF-05`: Duplicate preference keys upsert in-place rather than appending duplicates.
   - **Feature 6 Boundary (Skill & MCP Generator)** (lines 456-521):
     - `TC-T2-SKILL-01`: Missing closing `---` frontmatter delimiter returns `MALFORMED_FRONTMATTER`.
     - `TC-T2-SKILL-02`: Path traversal (`../../etc/evil`) throws `SECURITY_VIOLATION`.
     - `TC-T2-SKILL-03`: Corrupted `mcp_config.json` recovers to `{ mcpServers: {} }`.
     - `TC-T2-SKILL-04`: Duplicate MCP server name registration replaces older definition.
     - `TC-T2-SKILL-05`: Missing tool parameters object defaults to `{ type: 'object', properties: {} }`.
   - **Feature 7 Boundary (Brutalist UI & Incident Feed)** (lines 525-573):
     - `TC-T2-UI-01`: 100,000-character thought ticker string truncated to 150 chars ending in `...`.
     - `TC-T2-UI-02`: Zero tasks queue calculates 0% overall progress without `NaN`.
     - `TC-T2-UI-03`: Fatigue clamped strictly between `0%` and `100%`.
     - `TC-T2-UI-04`: 500-incident burst buffered without event loss.
     - `TC-T2-UI-05`: Missing/whitespace thoughts fall back to `'Awaiting instructions.'`.
   - **Feature 8 Boundary (Twin Sauron Spotlights)** (lines 578-619):
     - `TC-T2-SAURON-01`: Coordinate values outside `[0, 100]` clamped to boundary.
     - `TC-T2-SAURON-02`: Divergent target cubicles produce distinct spotlight vectors.
     - `TC-T2-SAURON-03`: Zero active cubicles triggers `AMBIENT_PULSE` mode.
     - `TC-T2-SAURON-04`: Linear interpolation (`lerp`) avoids `NaN` under rapid updates.
     - `TC-T2-SAURON-05`: Opacity clamped to `[0.0, 1.0]`.
   - **Feature 9 Boundary (Multi-Monitor & Pop-Out Panels)** (lines 624-667):
     - `TC-T2-MONITOR-01`: 0 or negative display counts normalized to 1.
     - `TC-T2-MONITOR-02`: 16 displays maintain minimum panel width of `320px`.
     - `TC-T2-MONITOR-03`: Unknown pop-out parameter falls back to `'all'`.
     - `TC-T2-MONITOR-04`: 50 rapid connect/disconnects leave 0 leaking subscribers.
     - `TC-T2-MONITOR-05`: 100,000-char message payload received across channel without corruption.
   - **Feature 10 Boundary (Standalone Executable CLI)** (lines 672-724):
     - `TC-T2-EXE-01`: Invalid port (`'abc'`, `'99999'`) throws `INVALID_PORT`.
     - `TC-T2-EXE-02`: Missing workspace directory argument resolves to `process.cwd()`.
     - `TC-T2-EXE-03`: `EADDRINUSE` mapped to `PORT_IN_USE_ERROR`.
     - `TC-T2-EXE-04`: `EACCES` or `EPERM` mapped to `PERMISSION_DENIED`.
     - `TC-T2-EXE-05`: Active `swarm.lock` file detected on duplicate launch.

3. **`test/e2e/helpers.ts`** (365 lines, 12,882 bytes):
   - `createJunction(target, link)` (lines 72-90): Uses `fs.symlink(target, link, isWindows ? 'junction' : 'dir')`.
   - `isReparsePoint(targetPath)` (lines 95-102): Uses `(await fs.lstat(targetPath)).isSymbolicLink()`.
   - `simulateConcurrentClaims(todoFile, inProgressDir, workerCount)` (lines 143-173): Executes parallel `fs.rename` across 50 workers, catching `ENOENT`, `EPERM`, `EACCES`.
   - `evaluateConsularConsensus(vote1, vote2)` (lines 215-231): Enforces 2 distinct Consuls and unanimous `APPROVE` decision.
   - `createTestSandbox(prefix)` (lines 271-309): Allocates temporary directory tree in `os.tmpdir()` with `.swarm/` and `.agents/` structure.

4. **Underlying Production Implementations**:
   - `src/server/consular-engine.ts` (2,154 lines): Implements Two-Gate Consensus (`Gate 1: deliberatePlan/votePlan`, `Gate 2: reviewTask`), `evaluateConsensus`, `validateVote`, incident logging to `.swarm/logs/incidents.jsonl`, and plan records in `.swarm/plans/`.
   - `src/server/worktree-manager.ts` (374 lines): Implements zero-privilege NTFS junction creation with absolute paths, safe junction unlinking via `fs.rmdir()`, and branch isolation.
   - `src/server/taskboard-manager.ts` (396 lines): Implements lock-free atomic `fs.rename` with Windows collision error code handling (`ENOENT`, `EBUSY`, `EPERM`, `EACCES`).

---

## 2. Logic Chain

1. **Premise 1 (Consular Consensus Invariant)**:
   - *Observation*: `test/e2e/consular-consensus.test.ts` lines 56-62, 110-114, 130-133, and 169-175 test all four permutations of dual votes: (Approve, Veto) -> Veto; (Veto, Approve) -> Veto; (Veto, Veto) -> Veto; (Approve, Approve) -> Merge.
   - *Inference*: The 2/2 unanimous consensus rule (`Intercessio`) is strictly tested at the decision boundary. Neither a split vote nor a mutual veto can authorize a merge.
   - *Audit Trail Step*: In Case A1 (line 76) and Case B2 (line 197), the audit log records are verified in `.swarm/logs/incidents.jsonl` with immutable timestamp and rationale assertions.

2. **Premise 2 (Boundary Coverage Completeness)**:
   - *Observation*: `test/e2e/tier2-boundary-cases.test.ts` contains exactly 10 feature-level describe blocks with 5 test cases each = 50 boundary test cases.
   - *Inference*: The suite satisfies the quality gate requirement defined in `TEST_INFRA.md §4.3` (>= 5 boundary test cases per core feature).

3. **Premise 3 (NTFS Reparse Point and Windows Safety)**:
   - *Observation*: `worktree-manager.ts:240-241` specifies `linkType = process.platform === 'win32' ? 'junction' : 'dir'` and `fs.symlink(path.resolve(targetDir), path.resolve(linkPath), linkType)`.
   - *Observation*: `worktree-manager.ts:265` uses `fs.rmdir(junctionPath)` to remove junction links without deleting target contents.
   - *Observation*: `helpers.ts:79` uses `fs.unlink(link).catch(() => fs.rmdir(link))`.
   - *Inference*: The suite and server are built specifically for zero-privilege Windows NTFS directory junctions (`IO_REPARSE_TAG_MOUNT_POINT`). No administrator privileges or developer mode activation are required.

4. **Premise 4 (Race Conditions and Windows Error Code Handling)**:
   - *Observation*: In `taskboard-manager.ts:134`, atomic claim catches `err.code === 'ENOENT' || err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES'`.
   - *Observation*: In `helpers.ts:163`, `simulateConcurrentClaims` catches `err.code === 'ENOENT' || err.code === 'EPERM' || err.code === 'EACCES'`, omitting `EBUSY`.
   - *Inference*: On Windows NTFS under high I/O concurrency (50 parallel file renames on the same disk sector), Windows can intermittently return `STATUS_SHARING_VIOLATION` (`EBUSY`). If `helpers.ts` encounters `EBUSY`, Vitest could report an unhandled rejection in `TC-T2-WORKTREE-02`. Adding `EBUSY` to `helpers.ts:163` eliminates this race condition vulnerability.

5. **Premise 5 (Audit Log Location Discrepancy)**:
   - *Observation*: The dispatch prompt references `.swarm/governance/reviews/`.
   - *Observation*: In `consular-consensus.test.ts:76`, `tier1-feature-coverage.test.ts:405`, and `consular-engine.ts:101-102`, the actual filesystem paths are `.swarm/logs/incidents.jsonl`, `.swarm/logs/consular_dialogue.jsonl`, and `.swarm/plans/<planId>.json`.
   - *Inference*: The production architecture and existing test suites standardize on `.swarm/logs/incidents.jsonl` for consular veto and consensus audit logs. If an external consumer or test expects `.swarm/governance/reviews/`, that directory is currently unused by the engine.

---

## 3. Caveats

1. **Shell Execution Environment**:
   - `run_command` in this explorer agent session failed with `"The system cannot find the file specified"` when attempting to launch `powershell.exe` or `cmd.exe` directly via the tool runner. Consequently, test execution must be performed by Worker in an environment with properly configured process spawning.
2. **NTFS Storage Requirement**:
   - Directory junctions (`mklink /J` / `fs.symlink(..., 'junction')`) are an NTFS feature. Running tests on FAT32, exFAT, or network shares (SMB) that do not support reparse points will fail at `fs.symlink`. `os.tmpdir()` must reside on an NTFS volume (standard on Windows C:\ drive).
3. **Audit Log Directory Nomenclature**:
   - As established in Logic Chain 5, consular review logs are stored in `.swarm/logs/incidents.jsonl` rather than `.swarm/governance/reviews/`. This is fully consistent between the production server and the E2E test suite, but differs from the dispatch note's phrasing.
4. **No Other Uninvestigated Areas**:
   - Both target test suites, their helper harness, and all referencing server implementations have been inspected line-by-line.

---

## 4. Conclusion

1. **Suite Readiness**: Both `test/e2e/consular-consensus.test.ts` (5 tests) and `test/e2e/tier2-boundary-cases.test.ts` (50 tests) are fully implemented, structurally sound, and adhere strictly to opaque-box testing principles with real NTFS sandboxes and zero mocking.
2. **Consular Consensus Coverage**: The Roman Dual-Consul suite thoroughly exercises 2/2 unanimous approval, 1/2 split veto, 0/2 mutual veto, task lifecycle state transitions (`review/` -> `in_progress/` vs `review/` -> `done/`), and immutable timestamp audit records.
3. **Boundary Suite Coverage**: All 10 core features have 5 distinct boundary test cases, satisfying all acceptance criteria for quota exhaustion, mass concurrency (50 workers), Unicode/space paths, corrupted JSON resilience, and CLI arguments.
4. **Identified Windows Hardening Recommendation**:
   - In `test/e2e/helpers.ts` line 163, add `err.code === 'EBUSY'` to the collision catch list alongside `ENOENT`, `EPERM`, and `EACCES` to prevent rare transient file-sharing violation failures during the 50-worker rename race.

---

## 5. Verification Plan for Worker

The Worker agent should execute and verify these test suites according to the following phased plan:

### Step 1: Pre-Execution Environment Check
Ensure the workspace is at `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm` and Node 20+ is available:
```bash
node -v
npx vitest --version
```

### Step 2: (Recommended) Helper Hardening
Inspect `test/e2e/helpers.ts` at line 163. If `EBUSY` is not in the collision filter:
```typescript
// Replace line 163:
if (err.code === 'ENOENT' || err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') {
  collisions++;
  return { workerId, success: false, reason: 'Collision/AlreadyClaimed' };
}
```

### Step 3: Execute Dedicated Consular Consensus Suite
Run the 5-test Roman Dual-Consul Governance & Intercessio suite:
```bash
npx vitest run test/e2e/consular-consensus.test.ts --reporter=verbose
```
**Expected Output**:
- `✓ Roman Republic Dual-Consul Governance & Intercessio Consensus Suite > Consular Veto (Intercessio) Invariants > Case A1: Consul I votes APPROVE, Consul II votes VETO`
- `✓ Roman Republic Dual-Consul Governance & Intercessio Consensus Suite > Consular Veto (Intercessio) Invariants > Case A2: Consul I votes VETO, Consul II votes APPROVE`
- `✓ Roman Republic Dual-Consul Governance & Intercessio Consensus Suite > Consular Veto (Intercessio) Invariants > Case A3: Both Consuls vote VETO (0/2 unanimous rejection)`
- `✓ Roman Republic Dual-Consul Governance & Intercessio Consensus Suite > Unanimous Consular Consensus Invariants > Case B1: Both Consul I and Consul II vote APPROVE`
- `✓ Roman Republic Dual-Consul Governance & Intercessio Consensus Suite > Unanimous Consular Consensus Invariants > Case B2: Audit trail records immutable consensus timestamp and rationales`
- **Result**: `Tests 5 passed (5)`

### Step 4: Execute Tier 2 Boundary Cases Suite
Run the 50-test boundary and corner cases suite:
```bash
npx vitest run test/e2e/tier2-boundary-cases.test.ts --reporter=verbose
```
**Expected Output**:
- 5 tests passed under `F1 Boundary: Roster, Quotas & Grid Limits`
- 5 tests passed under `F2 Boundary: Capability Gating & Recursion Caps`
- 5 tests passed under `F3 Boundary: Spaces, Unicode & Concurrency Races` (including 50-worker race & Unicode junction)
- 5 tests passed under `F4 Boundary: Consular Consensus Edge Cases`
- 5 tests passed under `F5 Boundary: Corrupted JSON, Extreme Strings & Deduplication`
- 5 tests passed under `F6 Boundary: Skill Frontmatter & MCP Config Invariants`
- 5 tests passed under `F7 Boundary: Thought Ticker Truncation & Zero Task Handling`
- 5 tests passed under `F8 Boundary: Raycasting Clamping & Dual Spotlights`
- 5 tests passed under `F9 Boundary: Multi-Monitor Scaling & Detachable Panels`
- 5 tests passed under `F10 Boundary: CLI Arguments & Executable Invocation`
- **Result**: `Tests 50 passed (50)`

### Step 5: Invalidation Conditions
The verification run shall be considered **invalidated** if:
1. Any test case in either suite fails (`0%` failure tolerance).
2. `TC-T2-WORKTREE-02` yields more than 1 success or fewer than 49 collisions.
3. `TC-T2-WORKTREE-01` fails to identify the NTFS junction reparse point on Windows.
4. Tasks moved during consular veto remain in `tasks/review/` or tasks moved during unanimous approval remain in `tasks/review/`.
