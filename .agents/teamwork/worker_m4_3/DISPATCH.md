# DISPATCH — worker_m4_3

## Mission
Apply the targeted remediation fixes for Milestone 4 (Iteration 3):
1. Fix test assertion in `test/unit/adversarial-empirical-m4-2.test.ts` line 497 (.toBe -> .toContain).
2. Wire missing courier CLI command aliases (`petition`, `dispatch`, `review`, `afk`) in `src/server/cli-dispatcher.ts` per `explorer_m4_9/handoff.md`.
3. Preserve the authentic 140,288-byte Win32 PE binary at `dist/SymlinkedAgentSwarm.exe` and `<root>/SymlinkedAgentSwarm.exe` (DO NOT overwrite or stub!).
4. Run all Milestone 4 test suites to verify 100% pass.

## Mandatory Paths to Read First
- `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md`
- `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md`
- `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\DEAD_ENDS.md`
- `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_7\handoff.md`
- `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_8\handoff.md`
- `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_9\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Tasks

### Task 1: Fix Assertion in `test/unit/adversarial-empirical-m4-2.test.ts`
At line 497, change:
```typescript
expect(await fs.readFile(rootExe, 'utf8')).toBe('RUNNING_VERSION_1.0.0');
```
to:
```typescript
expect(await fs.readFile(rootExe, 'utf8')).toContain('RUNNING_VERSION_1.0.0');
```

### Task 2: Update `src/server/cli-dispatcher.ts`
1. Support `courier petition` and `courier dispatch` alongside `courier submit`.
   - If `sub === 'petition'` with an existing petition ID argument (no `--`), route to `courier_status`.
   - Otherwise, route to `courier_submit` with `--agent`, `--type`, `--prompt`/`-p`, `--workspace`/`-w`.
2. Support `courier review` alongside `courier status`.
3. Support `courier afk` command in `parseCliArgs` and `executeCliCommand`:
   - Prints Panopticon Night-Shift / AFK status and digest summary from `.swarm/memory/afk_state.json` and `.swarm/logs/consular_digest.json`.
4. Ensure mandatory prompt check in `courier submit` remains intact (exit code 1 on empty/missing prompt).
5. Ensure 4x4 spatial matrix grid from `.swarm/roster.json` remains intact.

### Task 3: Verify Executable Binaries on Disk
- Verify that `dist/SymlinkedAgentSwarm.exe` and `SymlinkedAgentSwarm.exe` are 140,288 bytes and match SHA256 `b2c16041ace7a4abdc5b20724c131ceb6de89dc081949fa6561ea6da6c2ca504` in `dist/SHA256SUMS.txt`.
- DO NOT overwrite or delete these binaries.

### Task 4: Run Verification Tests
- Run `npx vitest run test/unit/adversarial-empirical-m4-2.test.ts`
- Run `npx vitest run test/unit/adversarial-empirical-m4-3.test.ts`
- Run `npx vitest run test/unit/challenger-m4-4-empirical.test.ts`
- Run `npx vitest run test/unit/milestone4-packaging-cli.test.ts`
- Run `npx vitest run test/e2e/standalone-smoke.test.ts`

Document all commands, stdout/stderr, and outcomes in `handoff.md`.
