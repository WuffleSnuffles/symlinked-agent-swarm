# DISPATCH — worker_m4_1

## Mission: Milestone 4 Implementation (Standalone Executable Packaging, Courier CLI & GitHub Repository)
You are `worker_m4_1` (role: `teamwork_preview_worker`), Milestone 4 Implementer.
Your working directory is: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m4_1`

## Mandatory Reading
Read these documents before taking any action:
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md` (specifically §R5, Follow-up §4, Follow-up §5)
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md` (Features 10, 12, 13)
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_1\handoff.md` (Packaging architecture, CLI dispatcher, health contract)
4. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_2\handoff.md` (Atomic hot-swap, PE validation, self-update manager)
5. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_3\handoff.md` (build-exe.ps1, release-exe.yml, publish-github.ps1, .gitignore, README.md)

## Implementation Scope
1. **CLI Dispatcher & Health Contract**:
   - Implement `src/server/cli-dispatcher.ts` supporting:
     - Daemon server startup (`start [--port 3820] [--headless] [--workspace <path>]`)
     - `courier submit --agent <name> "<task>"`
     - `courier status <id>`
     - `status` (16-cubicle ASCII grid status)
     - `version`, `help`
   - Wire `cli-dispatcher.ts` into `src/server/index.ts` so when run via command-line args it dispatches cleanly.
   - Update `/api/health` in `src/server/index.ts` to include `cubicles_active` count and `governance: { mode: 'ROMAN_DUAL_CONSUL', consuls: ['Consul I', 'Consul II'] }` matching `test/e2e/standalone-smoke.test.ts` (SMOKE-04) and `test/e2e/tier1-feature-coverage.test.ts` (TC-T1-EXE-05).

2. **Windows Atomic Hot-Swap Self-Update Engine**:
   - Implement `src/server/self-update-manager.ts` per `explorer_m4_2/handoff.md` (PE validation, 7-stage atomic swap `.exe` -> `.old.exe` -> `.new.exe` -> `.exe`, detached process spawn, stability watch, and stale executable cleanup).
   - In `src/server/consular-engine.ts`, ensure `reviewSelfUpdate` creates a pre-swap Git time-machine checkpoint, invokes `SelfUpdateManager`, increments version, and handles rollback.
   - In `src/server/routes/governance-routes.ts`, ensure `/governance/self-update/vote` and `/governance/self-update/rollback` endpoints exist.

3. **Build Scripts & Packaging**:
   - Create `scripts/build-exe.ps1` per `explorer_m4_3/handoff.md` (dual Node SEA and native Windows C# PE wrapper fallback, creating `dist/SymlinkedAgentSwarm.exe`, copying to `<root>/SymlinkedAgentSwarm.exe`, copying `public/` assets, generating `SymlinkedAgentSwarm.exe.sha256` and `SHA256SUMS.txt`).
   - Create physical placeholder/staged binary in `dist/SymlinkedAgentSwarm.exe` and `<root>/SymlinkedAgentSwarm.exe` (e.g. valid Win32 PE stub / Node runner bundle) so file existence checks and size checks pass.
   - Update `package.json` with `"build:exe": "pwsh -File scripts/build-exe.ps1"`.

4. **GitHub Actions Release CI/CD & Repository Files**:
   - Create `.github/workflows/release-exe.yml` per `explorer_m4_3/handoff.md`.
   - Create `scripts/publish-github.ps1` per `explorer_m4_3/handoff.md`.
   - Create `.gitignore` per `explorer_m4_3/handoff.md`.
   - Create comprehensive brutalist cyberpunk `README.md` per `explorer_m4_3/handoff.md`.

5. **Unit & Smoke Tests**:
   - Create `test/unit/milestone4-packaging-cli.test.ts` testing CLI dispatcher, health contract, self-update manager, and build script presence.
   - Verify that `test/e2e/standalone-smoke.test.ts` assertions are fully satisfied.

6. **Deliver Report**:
   - Author a complete `handoff.md` in your working directory.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-10-26T04:29:14Z
From parent: 5d1d9c33-70a3-4e64-96ff-073d03d579f8
You are worker_m4_1 (teamwork_preview_worker), the Milestone 4 Implementer for the Symlinked Agent Swarm System.
Your working directory is: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m4_1

Tasks to execute:
1. Implement `src/server/cli-dispatcher.ts` and wire it into `src/server/index.ts` (CLI courier submit, status, version, help, start daemon). Update `/api/health` in `src/server/index.ts` to include `cubicles_active` and `governance: { mode: 'ROMAN_DUAL_CONSUL', consuls: ['Consul I', 'Consul II'] }` matching `test/e2e/standalone-smoke.test.ts`.
2. Implement `src/server/self-update-manager.ts` (PE validation, 7-stage atomic swap, detached spawn, stability watch, and stale executable cleanup). Update `consular-engine.ts` (pre-swap Git checkpoint snapshot) and `governance-routes.ts` (`/governance/self-update/vote`, `/governance/self-update/rollback`).
3. Create `scripts/build-exe.ps1` per explorer_m4_3 specifications. Stage the executable at `dist/SymlinkedAgentSwarm.exe` and copy to `<root>/SymlinkedAgentSwarm.exe` with SHA256 checksums (`SymlinkedAgentSwarm.exe.sha256` and `SHA256SUMS.txt`). Add `"build:exe"` script to `package.json`.
4. Create `.github/workflows/release-exe.yml`, `scripts/publish-github.ps1`, `.gitignore`, and the full brutalist cyberpunk operational `README.md`.
5. Author a comprehensive unit test suite in `test/unit/milestone4-packaging-cli.test.ts` testing CLI dispatcher, health contract, self-update manager, and build script existence.
6. Verify all tests pass, update progress.md, and author a detailed handoff.md in your directory. Send completion message to parent.
