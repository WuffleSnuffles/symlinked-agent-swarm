## 2026-10-26T00:30:18Z
You are Worker M1-1 for the Symlinked Agent Swarm System & Panopticon Application project.

### Environment & Working Directory
- Working Directory: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m1_1`
- Project Root: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm`
- Original Request File: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Architecture & Feature Inventory: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md`

### Explorer Reports to Review (Read these first!):
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m1_1\handoff.md` & `analysis.md`
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m1_2\handoff.md` & `analysis.md`
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\spec_miner_m1_3\handoff.md` & `analysis.md`

### MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### File Ownership (You own these files exclusively):
- `package.json`
- `tsconfig.json`
- `src/server/types/cubicle.ts`
- `src/server/types/cubicle-defaults.ts`
- `src/server/cubicle-manager.ts`
- `src/server/cli-engine.ts`
- `src/server/quota-tracker.ts`
- `src/server/capability-matrix.ts`
- `src/server/subswarm-manager.ts`
- `src/server/worktree-manager.ts`
- `src/server/taskboard-manager.ts`
- `src/server/index.ts`
- `test/unit/cubicle-roster.test.ts`
- `test/unit/capability-matrix.test.ts`
- `test/unit/worktree-junction.test.ts`
- `test/unit/atomic-taskboard.test.ts`

### Mission & Tasks
Implement the complete backend foundation for **Milestone 1: Core Swarm Engine**:
1. **Project Setup**:
   - Create root `package.json` and `tsconfig.json`. Ensure all required dependencies are installed: `express` or `fastify`, `ws`, `vitest`, `typescript`, `@types/node`, `@types/ws`, `tsx`, `esbuild`. Run `npm install`.
2. **16-Cubicle Grid Roster & CLI Engine (Feature 1)**:
   - Implement `src/server/types/cubicle.ts` and `src/server/types/cubicle-defaults.ts` with 16 cubicle slots arranged in 4x4 grid. Default pre-configuration: Cubicles 1 & 2: `Gemini 4 Argon (High)`, Cubicle 3: `GPT Astra (Very High)` (`can_spawn_subswarm: false`), Cubicles 4-16: `unassigned`.
   - Implement `src/server/cubicle-manager.ts` for lifecycle state transitions (`vacant`, `idle`, `working`, `under_inspection`, `error`, `exhausted`) and persistence in `.swarm/roster.json` and `.swarm/status/`.
   - Implement `src/server/cli-engine.ts` with parameter substitution (`{{prompt_file}}`, `{{model}}`, etc.) and process execution.
   - Implement `src/server/quota-tracker.ts` with token accounting and stamina/fatigue meter calculation (`0%` to `100%`).
3. **Thinking-Tier Capability Gating & Sub-Swarms (Feature 2)**:
   - Implement `src/server/capability-matrix.ts` enforcing capability matrix: `Gemini 4 Argon (High)` and `GPT Astra (Ultra)` can spawn sub-swarms (`can_spawn_subswarm = true`); `GPT Astra (Very High)` is restricted (`can_spawn_subswarm = false`); recursion cap `max_depth = 1`.
   - Implement `src/server/subswarm-manager.ts` managing `.swarm/subswarms/cubicle-XX/` (`manifest.json`, micro-tasks, patch consolidation). Intercept unauthorized attempts, throw `CapabilityRestrictionError`, write structured incident records into `.swarm/logs/incidents.jsonl`, and emit `INCIDENT_ALERT` for Twin Sauron focus.
4. **Git Worktree Isolation, Windows NTFS Junctions & Atomic Claiming (Feature 3)**:
   - Implement `src/server/worktree-manager.ts` creating branches `swarm/cubicle-01`..`16`, worktrees at `worktrees/cubicle-XX`, and Windows NTFS Directory Junctions (`fs.symlink(..., 'junction')`) for `<worktree>/.swarm` -> `<root>/.swarm` and `<worktree>/.agents` -> `<root>/.agents`, with `safeRemoveJunction` via `fs.promises.rmdir`.
   - Implement `src/server/taskboard-manager.ts` with atomic lock-free task moves (`todo/` -> `in_progress/` -> `review/` -> `done/`) via `fs.promises.rename` with `ENOENT` racing protection.
5. **Server Entry Point**:
   - Implement `src/server/index.ts` binding HTTP and WebSocket servers on port 3820 (configurable), exposing REST endpoints and real-time state broadcasts.
6. **Unit Tests & Verification**:
   - Write comprehensive unit tests in `test/unit/cubicle-roster.test.ts`, `test/unit/capability-matrix.test.ts`, `test/unit/worktree-junction.test.ts`, `test/unit/atomic-taskboard.test.ts`.
   - Run tests (`npm test` or `npx vitest run test/unit`) and verify 100% passing.
