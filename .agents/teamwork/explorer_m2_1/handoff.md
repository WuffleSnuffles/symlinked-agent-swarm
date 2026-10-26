# Handoff Report: Roman Republic Dual-Consul Governance & 5 Disciplinary Powers (Milestone 2, Component A)

**Author**: Explorer M2-1  
**Working Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m2_1`  
**Target Milestone**: Milestone 2, Component A (Feature 4)  
**Parent Agent**: `5d1d9c33-70a3-4e64-96ff-073d03d579f8`  
**Handoff Type**: Hard (Investigation complete, actionable architecture and code blueprint delivered)  

---

## 1. Observation

1. **`ORIGINAL_REQUEST.md` (lines 90–126)**:
   - Line 96: *"There are 2 Overseer agents (`Consul I` and `Consul II`, each configurable with its own CLI/API provider and model)."*
   - Line 97: *"They only approve a push, branch merge, or task solution in `review/` if BOTH Consuls agree (2/2 unanimous `APPROVE`)."*
   - Line 98: *"If either `Consul I` or `Consul II` votes `VETO` / `REJECT` (a 1/2 split or 0/2), the merge/push is blocked, the dissenting Consul's veto rationale is logged to the task and error/audit feed, and the task is sent back for revision."*
   - Lines 113–125: Explicitly mandates 5 Consular Disciplinary Powers:
     - 1. `kill_agent`: Terminate stalled/inconsistent cubicle agent, evict or replace, return/reassign task.
     - 2. `set_thinking_level`: Promote/demote reasoning tier (`Low`, `Medium`, `High`, `Very High`, `Ultra`), dynamically updating `can_spawn_subswarm`.
     - 3. `swap_role` / `swap_cubicles`: Swap agent role/persona (`Implementer`, `Debugger`, `Auditor`, `Refactorer`) or swap worker slots.
     - 4. `wipe_memory`: Wipe clean local memory/context/thought history for fresh start.
     - 5. `set_access_scope`: Enforce per-cubicle file/directory path and information ACLs.

2. **`PROJECT.md` (lines 10–11, 35, 50, 150–187)**:
   - Lines 10–11 & 150–170 define interface contracts for `ConsularReviewRequest`, `ConsularVote`, and `ConsularConsensusResult`.
   - Lines 172–187 define the 5 `ConsularDisciplinaryAction` types and required REST endpoints:
     - `POST /api/governance/kill`
     - `POST /api/governance/thinking-level`
     - `POST /api/governance/swap-role`
     - `POST /api/governance/swap-cubicles`
     - `POST /api/governance/wipe-memory`
     - `POST /api/governance/access-scope`

3. **`test/e2e/helpers.ts` (lines 20–31, 214–224)**:
   - Evaluator helper `evaluateConsularConsensus(vote1: ConsularVote, vote2: ConsularVote): ConsularConsensusResult`:
     - Returns `unanimous_approved: true` and `action_taken: 'MERGED_TO_MAIN'` if and only if `vote1.decision === 'APPROVE' && vote2.decision === 'APPROVE'`.
     - Otherwise returns `unanimous_approved: false` and `action_taken: 'VETO_BLOCKED_AND_REVISED'`.

4. **`test/e2e/consular-consensus.test.ts` (lines 26–215)**:
   - Explicitly verifies:
     - Case A1: 1 Approve + 1 Veto -> merge blocked, task renamed from `review/` to `in_progress/`, rationale logged in `.swarm/logs/incidents.jsonl`.
     - Case A2: 1 Veto + 1 Approve -> merge blocked with Consul I rationale.
     - Case A3: Both VETO (0/2) -> merge strictly blocked.
     - Case B1: Both APPROVE (2/2) -> merge authorized, task moved from `review/` to `done/`.
     - Case B2: Audit trail records immutable consensus timestamp and rationales.

5. **`test/e2e/tier2-boundary-cases.test.ts` (lines 254–332)**:
   - Verifies edge cases:
     - `TC-T2-CONSUL-03`: Empty rationale on VETO throws `INVALID_VETO: Consular Veto requires an explicit rationale.`.
     - `TC-T2-CONSUL-04`: Duplicate votes from same Consul overwrite prior vote idempotently.
     - `TC-T2-CONSUL-05`: Non-consular actor attempting to vote throws `UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes.`.

6. **`src/server/capability-matrix.ts` (lines 114–167)**:
   - Implements `evaluate({ model, thinkingLevel, currentDepth, manualOverride, cubicleId })` returning `{ allowed: boolean, reason: string }`.
   - `Gemini 4 Argon` + `High` -> `true`.
   - `GPT Astra` + `Very High` -> `false` (`CAPABILITY_RESTRICTION_ERROR`).
   - `GPT Astra` + `Ultra` -> `true`.

7. **`src/server/cubicle-manager.ts` (lines 181–270)**:
   - Manages cubicle states, transitions, configuration updates, and status persistence in `.swarm/status/<cubicle-id>.json`.

8. **`src/server/taskboard-manager.ts` (lines 184–256)**:
   - Implements atomic `submitForReview(taskId, reviewData)`, `returnToRevision(taskId, vetoData)`, `completeTask(taskId)`, and `releaseTask(taskId, reason)`.

9. **`src/server/index.ts` (lines 68–75, 87–265)**:
   - Express server on port 3820 and WebSocket server on `/events` with `broadcast(type, payload)` helper.

---

## 2. Logic Chain

1. From Observation 1 & 2, the Roman Dual-Consul system is an executive governing layer consisting of `Consul I` and `Consul II`, each independently configurable with AI brand, model, thinking level, and CLI templates.
2. From Observation 1, initial defaults must be `Consul I` as `Gemini 4 Argon (High)` and `Consul II` as `GPT Astra (Ultra)`. These should be persisted in `.swarm/consuls.json`.
3. From Observations 3, 4, and 5, Consular review must enforce unanimous consensus: 2/2 `APPROVE` authorizes branch merge to `main` and moves task to `done/`; 1/2 or 0/2 `VETO` triggers `Intercessio`, blocking the merge, recording an incident to `.swarm/logs/incidents.jsonl`, rolling the task back to `in_progress/` (or `todo/`), and converging Twin Sauron spotlights onto the offending cubicle.
4. From Observation 5, input validation must strictly enforce:
   - Rationale cannot be empty if vote is `VETO`.
   - Actor must be `'Consul I'` or `'Consul II'`.
   - Repeated votes from the same Consul update that Consul's vote idempotently.
5. From Observations 1, 6, 7, and 8, the 5 Consular Disciplinary Powers directly manipulate cubicle processes, worktree branches, thinking tiers, task allocations, and filesystem ACLs:
   - `kill_agent`: Needs `process.kill`, `taskboardManager.releaseTask`, worktree git reset/clean, and slot eviction or re-configuration.
   - `set_thinking_level`: Needs `capabilityMatrix.evaluate` to dynamically recalculate and set `can_spawn_subswarm` alongside the thinking tier and token budget.
   - `swap_role` / `swap_cubicles`: Modifies agent operational persona (`Implementer`, `Debugger`, `Auditor`, `Refactorer`) or exchanges slot configurations.
   - `wipe_memory`: Resets `surface_thoughts`, clears error details, cleans worktree scratchpads, and optionally resets token usage to 0.
   - `set_access_scope`: Stores path/memory ACLs in `.swarm/acl/<cubicleId>.json` and validates read/write access.
6. From Observation 9, the server backend requires a new `ConsularEngine` class in `src/server/consular-engine.ts`, a dedicated router in `src/server/routes/governance-routes.ts`, and WebSocket event broadcasting on `/events`.

---

## 3. Caveats

1. **Physical Git Merges in Sandbox vs Live Repositories**:
   In test environments where git worktrees might not have active git remotes or branches, git merge operations must be conditionally attempted with graceful fallback when running in synthetic file sandboxes (matching how `test/e2e/helpers.ts` handles mocks and real sandboxes).
2. **Access Control (ACL) Enforcement Depth**:
   Filesystem ACLs (`set_access_scope`) are enforced at the application/engine level and task executor boundaries. OS-level filesystem permissions (e.g. NTFS DACLs) are not modified to avoid requiring Administrator privileges on Windows.
3. **M3 Panopticon UI Integration**:
   The canvas spotlight raycaster (`twin-sauron-canvas.js`) and UI components belong to Milestone 3. Milestone 2 provides the exact WebSocket event contracts (`SAURON_FOCUS_TARGET`, `twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE'`) so the frontend will automatically react when built.

---

## 4. Conclusion

The architectural investigation for **Milestone 2, Component A: Roman Republic Dual-Consul Governance & 5 Disciplinary Powers (Feature 4)** is complete. A comprehensive, production-ready design and code blueprint has been documented in:
`H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m2_1\analysis.md`

### Actionable Implementation Blueprint for Builder Agent:
1. **`src/server/types/governance.ts`**:
   Define `ConsulConfig`, `ConsularVote`, `ConsularConsensusResult`, `ConsularDisciplinaryAction`, `CubicleAccessScope`, `AgentRole`.
2. **`src/server/types/cubicle.ts`**:
   Add `role?: AgentRole` and `access_scope?: CubicleAccessScope` to `CubicleConfig` and `CubicleLiveState`.
3. **`src/server/consular-engine.ts`**:
   Implement `ConsularEngine`:
   - Dual-Consul config persistence (`.swarm/consuls.json`).
   - `evaluateConsensus` & `reviewTask` (2/2 unanimous consensus vs 1/2 or 0/2 veto).
   - 5 Disciplinary Powers: `killAgent`, `setThinkingLevel`, `swapRole`, `swapCubicles`, `wipeMemory`, `setAccessScope`.
   - Event emitter callbacks for real-time WebSocket broadcasting.
4. **`src/server/routes/governance-routes.ts`**:
   Implement REST endpoints under `/api/governance/*` for review, consul config, and all 5 disciplinary powers.
5. **`src/server/index.ts`**:
   Initialize `ConsularEngine`, mount `governance-routes`, and wire events to WebSocket broadcast.
6. **`test/unit/consular-disciplinary.test.ts`**:
   Write dedicated unit tests verifying all 5 disciplinary powers.

---

## 5. Verification Method

To independently verify the implementation:
1. **Review Analysis Report**:
   - Inspect `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m2_1\analysis.md`.
2. **Run Existing Vitest Consular Test Suites**:
   - `npx vitest run test/e2e/consular-consensus.test.ts`
   - `npx vitest run test/e2e/tier1-feature-coverage.test.ts -t "F4: Roman Dual-Consul"`
   - `npx vitest run test/e2e/tier2-boundary-cases.test.ts -t "F4 Boundary: Consular Consensus"`
3. **Run New Disciplinary Unit Tests**:
   - `npx vitest run test/unit/consular-disciplinary.test.ts`
4. **Invalidation Conditions**:
   - If a 1/2 split vote (1 APPROVE, 1 VETO) ever authorizes a task to move to `tasks/done/` or merges to `main`, the consensus engine is invalid.
   - If a VETO vote with an empty rationale is accepted without error, boundary validation is invalid.
   - If demoting `cubicle-01` (`Gemini 4 Argon`) to `Low` fails to flip `can_spawn_subswarm` to `false`, capability coupling is invalid.
   - If promoting `cubicle-03` (`GPT Astra`) to `Ultra` fails to flip `can_spawn_subswarm` to `true`, capability coupling is invalid.
   - If `kill_agent` fails to release an active in-progress task back to `tasks/todo/`, task recovery is invalid.
