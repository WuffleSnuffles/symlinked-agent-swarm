## 2026-10-26T01:32:36Z
You are Worker M2-2 for Milestone 2 Remediation & Feature Alignment.

### Working Directory
Your working directory is:
`H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m2_2`
Maintain `progress.md` with timestamps and write your final report to `handoff.md` in this directory.

### Mandatory Documents to Read
You MUST read:
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\ORIGINAL_REQUEST.md` (Authoritative user requirements)
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md` (Master specification, architecture, contracts, especially Sections 3, 6, 7, 8)
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\reviewer_m2_1\handoff.md` (Reviewer 1 findings)
4. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\reviewer_m2_2\handoff.md` (Reviewer 2 findings)
5. `src/server/courier-gateway.ts`, `src/server/consular-engine.ts`, `src/server/preference-engine.ts`, `src/server/types/governance.ts`, `src/server/routes/governance-routes.ts`.

### Exclusive File Ownership
You exclusively own and may modify:
- `src/server/courier-gateway.ts`
- `src/server/consular-engine.ts`
- `src/server/preference-engine.ts`
- `src/server/types/governance.ts`
- `src/server/routes/governance-routes.ts`
- `src/server/index.ts`
- `test/unit/` test files

### Remediation Mandates
1. **`src/server/courier-gateway.ts` (CRITICAL)**:
   - Remove the mock facade in `submitPetition` that was returning hardcoded approvals.
   - Genuinely wire `ConsularEngine`:
     - If `petition.requested_type === 'WISDOM'` or `'BOTH'`, call `consularEngine.deliberatePlan` to generate authentic Consular wisdom.
     - If `petition.requested_type === 'POWER'` or `'BOTH'`, create task on `taskboardManager` (in `todo/`), execute work, and submit for Consular review.
     - Call `consularEngine.evaluateConsensus` to evaluate votes. Only apply `RATIFIED_BY_TWIN_CONSULS` seal if 2/2 unanimous `APPROVE`. If vetoed, mark `'VETOED'`, record rationale, and return without seal.
   - Align `CourierPetition` fields in `src/server/types/governance.ts` and `courier-gateway.ts` to `PROJECT.md § 7`:
     `petition_id`, `sender_agent` ('openclaw' | 'hermes' | 'gpt-dot' | string), `requested_type` ('WISDOM' | 'POWER' | 'BOTH'), `prompt`, `context_payload`, `status` ('RECEIVED' | 'CONSULAR_DELIBERATION' | 'SWARM_EXECUTING' | 'SEALED_DONE' | 'VETOED'), `wisdom_response`, `tasks_spawned`, `sealed_output`, `consular_seal`.

2. **`src/server/consular-engine.ts` (MAJOR)**:
   - In `evaluateConsensus`, verify that `vote1` and `vote2` originate from **distinct Consuls**:
     Normalize consul identifiers (`Consul I` / `Nia` -> `Nia`, `Consul II` / `Ferric` -> `Ferric`). If `c1 === c2`, return `{ unanimous_approved: false, action_taken: 'VETO_BLOCKED_AND_REVISED', reason: 'Consular consensus requires votes from two distinct Consuls' }`.
   - In `verifyPathAccess`, resolve relative dot segments (`path.normalize` / `path.resolve`) to strictly prevent path traversal bypasses (`../`, `..\\`).
   - In `votePlan`, when 2/2 consensus authorizes dispatch (`DISPATCH_AUTHORIZED`), create the tasks in `taskboardManager` / `.swarm/tasks/todo/` so they are available for cubicle execution!
   - In `reviewSelfUpdate`, handle existing `.old.exe` cleanly with timestamped rotation or unlinking.
   - Add Consular Question/Answer handling:
     `createQuestion(dto)`, `answerQuestion(id, answer)` updating Nia's memory (`nia_growth.json` and `USER_PREFERENCES.md`). Mount endpoints:
     `GET /api/governance/questions`, `POST /api/governance/questions`, `POST /api/governance/questions/:id/answer`.

3. **`src/server/preference-engine.ts` (RESILIENCE)**:
   - In `atomicWriteDb`, only rotate backup if primary parsed successfully, and generate unique random UUID temp filenames (`.preferences.json.tmp.${process.pid}.${Date.now()}.${crypto.randomUUID()}`).

4. **Testing**:
   - Update `test/unit/courier-gateway.test.ts` and ensure all test suites in `test/unit/` and `test/e2e/consular-consensus.test.ts` pass cleanly.


## 2026-10-26T01:39:26Z
**Context**: Milestone 2 Scope Integration — 7 Advanced Swarm Management Features
**Content**: Parent has updated requirements with 7 Advanced Swarm Management Features. Along with your current remediation tasks, please incorporate these core backend engines/models in `src/server/`:
1. **Merge-Conflict Shield (`.swarm/locks/`)**: `LockManager` in `consular-engine.ts` or standalone: `acquireLock(filePath, cubicleId)`, `releaseLock(filePath, cubicleId)`, `listLocks()`.
2. **Gladiator Tournament Mode**: In `consular-engine.ts`: `evaluateGladiatorContest(taskId, branches)` where Nia evaluates UX/user alignment and Ferric evaluates stability/minimal bugs to select winning branch.
3. **Infinite-Loop Circuit Breaker & Failover**: In `consular-engine.ts` / `cubicle-manager.ts`: tracks consecutive error repetitions ($N \ge 3$) tripping circuit breaker, and `failoverTask(cubicleId, targetCubicleId)` for exhausted quota (`0%`) or provider outage.
4. **Git Time-Machine Checkpoints (`.swarm/checkpoints/`)**: In `consular-engine.ts`: `createCheckpoint(label)`, `listCheckpoints()`, `rollbackCheckpoint(id)`.
5. **Per-Cubicle Isolated Port Manager**: Assign ports `4101`–`4116` to `cubicle-01`..`16` in `cubicle-manager.ts` (`port: 4100 + index`).
6. **Inter-Cubicle Shared Contracts (`.swarm/contracts/`)**: Directory management and registry for shared API contracts.
7. **Night-Shift / AFK Mode & Digest**: In `consular-engine.ts`: `setAfkMode(enabled, tokenCap)`, `generateBriefingDigest()` compiling completed tasks, vetoes, disciplinary decrees, and usage while user was away.
8. Expose REST endpoints under `/api/governance/*` and `/api/swarm/*` for these capabilities.
**Action**: Please include these in your Milestone 2 implementation and report them in your handoff.md.
