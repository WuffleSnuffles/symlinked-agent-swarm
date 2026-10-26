# DISPATCH — explorer_m4_8

## Mission
Investigate and design the exact fix strategy for the Vitest binary buffer assertion defect in `test/unit/adversarial-empirical-m4-2.test.ts` line 497 and audit all related test assertions across all M4 test files.

## Context & Audit Evidence
Path to ORIGINAL_REQUEST.md: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md`
Path to PROJECT.md: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md`
Path to DEAD_ENDS.md: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\DEAD_ENDS.md`
Path to Auditor Report: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\auditor_m4_2\handoff.md`

### Full Auditor & Challenger Evidence:
```text
From auditor_m4_2:
At line 457 of test/unit/adversarial-empirical-m4-2.test.ts:
  await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_VERSION_1.0.0'));
At line 497:
  expect(await fs.readFile(rootExe, 'utf8')).toBe('RUNNING_VERSION_1.0.0');
Finding: Because createPeTestBuffer() generates a 1024-byte binary PE buffer beginning with MZ and placing 'RUNNING_VERSION_1.0.0' at byte offset 0x98, reading rootExe as UTF-8 string will never match .toBe('RUNNING_VERSION_1.0.0'). This assertion will fail when vitest runs. It must be updated to .toContain('RUNNING_VERSION_1.0.0'), exactly as implemented on line 451 and line 569.

From challenger_m4_4:
Line 497 in test/unit/adversarial-empirical-m4-2.test.ts uses .toBe('RUNNING_VERSION_1.0.0') instead of .toContain('RUNNING_VERSION_1.0.0').
```

## Specific Investigation Focus
1. Inspect `test/unit/adversarial-empirical-m4-2.test.ts` around line 450–510.
2. Verify why `toBe` fails on binary PE buffers and confirm `toContain` matches the section payload at offset 0x98.
3. Check lines 451, 497, 569, and all other assertions in:
   - `test/unit/adversarial-empirical-m4-2.test.ts`
   - `test/unit/adversarial-empirical-m4-3.test.ts`
   - `test/unit/challenger-m4-4-empirical.test.ts`
   - `test/unit/consular-self-update.test.ts`
   - `test/unit/adversarial-vault-selfupdate-courier.test.ts`
   - `test/unit/milestone4-packaging-cli.test.ts`
4. Verify if there are any other `.toBe` comparisons against `createPeTestBuffer()` results.
5. Provide the exact diff specification for Worker to apply.

## Instructions
- Do NOT implement or edit source code files directly (Exploration only).
- Output your structured findings and recommendations to:
  `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_8\handoff.md`.
