## 2026-10-26T05:10:37Z
You are worker_m4_2.
Working directory: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m4_2
Parent: 5d1d9c33-70a3-4e64-96ff-073d03d579f8

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS (Read these first):
- ORIGINAL_REQUEST.md: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md
- PROJECT.md: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md
- DEAD_ENDS.md: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\DEAD_ENDS.md
- Full Explorer 4 Handoff (PE Validation & Zero-Mock Fixes): H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_4\handoff.md
- Full Explorer 5 Handoff (Authentic Executable Staging & Rollback Safety): H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_5\handoff.md
- Full Explorer 6 Handoff (CLI Dispatcher & Health Contract): H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_6\handoff.md
- CLI & Health Remediation Patch: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_6\remediation.patch
- CLI & Health Proposed Tests: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_6\proposed_tests.ts

YOUR EXCLUSIVE WRITE OWNERSHIP:
- `src/server/self-update-manager.ts`
- `src/server/types/governance.ts`
- `src/server/consular-engine.ts`
- `src/server/cli-dispatcher.ts`
- `src/server/index.ts`
- `scripts/stage-binaries.mjs`
- `test/e2e/helpers.ts`
- `test/unit/consular-self-update.test.ts`
- `test/unit/adversarial-vault-selfupdate-courier.test.ts`
- `test/unit/milestone4-packaging-cli.test.ts`
- `test/unit/adversarial-empirical-m4-2.test.ts`
- `SymlinkedAgentSwarm.exe`, `dist/SymlinkedAgentSwarm.exe`, `SymlinkedAgentSwarm.exe.sha256`, `dist/SymlinkedAgentSwarm.exe.sha256`, `dist/SHA256SUMS.txt`

TASK REQUIREMENTS:
1. `src/server/self-update-manager.ts`:
   - Delete mock prefix bypass (lines 79–87) in `validateBinary`. PE validation must strictly enforce DOS MZ (0x4D, 0x5A), size >= 0x40, little-endian e_lfanew pointer at 0x3C, bounds check, and NT signature PE\0\0 (0x50, 0x45, 0x00, 0x00).
   - Delete synthetic mock file generation (lines 130–133) in `executeAtomicSwap`. Missing `newExe` must immediately throw `Staged binary validation failed: Binary not found at ...`.
   - In `rollbackSwap(oldExePath)`: Verify `existsSync(oldExePath)` BEFORE renaming `rootExe`. If `oldExePath` does not exist, throw error and leave `rootExe` untouched.
   - In `relaunchDetached()`: Attach `child.on('error', ...)` handler before `child.unref()`.
2. `src/server/types/governance.ts`:
   - Add `old_exe_path?: string;` to `SelfUpdateRequest`.
3. `src/server/consular-engine.ts`:
   - In `reviewSelfUpdate`: Persist `request.old_exe_path = swapResult.oldExePath;`.
   - In `rollbackSelfUpdate`: Use `request.old_exe_path || path.join(this.projectRoot, 'SymlinkedAgentSwarm.old.exe')` and pass to `rollbackSwap`.
4. `src/server/cli-dispatcher.ts`:
   - `courier submit`: Require `--prompt` or positional task string. If missing or whitespace, errLog `Error: task prompt is required. Usage: SymlinkedAgentSwarm.exe courier submit --agent <name> "<task>"` and return `{ handled: true, exitCode: 1 }` (or exit 1 when `exitOnComplete`).
   - `status` / `grid status`: Load `.swarm/roster.json` and enrich with `.swarm/status/${id}.json` (with fallbacks to `cubicles.json` and `CubicleManager`), and format 4x4 ASCII spatial matrix grid (`[cubicle-01: idle] ...`) followed by detailed 16-row status table.
   - Support `--prompt` and `-p` in `parseCliArgs`.
5. `src/server/index.ts`:
   - In `/api/health`: Count active cubicles using:
     `allCubicles.filter((c: any) => (c.config?.enabled ?? c.assigned ?? false) && c.status !== 'error' && c.status !== 'vacant' && c.state !== 'Error').length`
6. `scripts/stage-binaries.mjs` & Authentic Staged Executables:
   - Implement authentic Win32 PE binary staging (>100KB, valid PE headers, executes cleanly) for `dist/SymlinkedAgentSwarm.exe` and copied to `SymlinkedAgentSwarm.exe`.
   - Stage exact SHA-256 checksums in `dist/SymlinkedAgentSwarm.exe.sha256`, `SymlinkedAgentSwarm.exe.sha256`, and `dist/SHA256SUMS.txt`.
7. `test/e2e/helpers.ts` & Test Suites:
   - Add and export `createPeTestBuffer(identifier, size, peOffset)` producing authentic in-memory PE buffers (valid MZ, e_lfanew=0x80, PE\0\0).
   - Update `test/unit/consular-self-update.test.ts` to use `createPeTestBuffer`.
   - Update `test/unit/adversarial-vault-selfupdate-courier.test.ts` to use `createPeTestBuffer`.
   - Update `test/unit/milestone4-packaging-cli.test.ts` to use `createPeTestBuffer`, test missing courier submit args, test 4x4 matrix on status, test active cubicles on health endpoint, and test `relaunchDetached`.
   - Update `test/unit/adversarial-empirical-m4-2.test.ts` to invert Challenge 1.3 (strictly verifying mock strings are rejected) and use `createPeTestBuffer`.
