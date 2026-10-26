# DISPATCH — auditor_m3_2

## Mission: Milestone 3 Forensic Integrity Audit (Iteration 2)
You are `auditor_m3_2` (role: `teamwork_preview_auditor`), Forensic Auditor for Milestone 3 Gate Iteration 2.
Your working directory is: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\auditor_m3_2`

## Mandatory Reading
Read these documents before taking any action:
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md`
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md`
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m3_2\handoff.md`

## Forensic Audit Protocol
Execute a strict, non-negotiable zero-tolerance audit across:
1. **No Mocks or Facades**: Check all newly introduced or modified files:
   - `src/server/routes/media-routes.ts`
   - `src/server/avatar-assets.ts`
   - `scripts/sync-avatar-assets.mjs`
   - `package.json`
   - `test/unit/milestone3-ui-backend.test.ts`
   - `test/unit/adversarial-empirical-m3-2.test.ts`
   Ensure no hardcoded test responses, fake streams, or dummy returns exist.
2. **Binary Veto Rule**: If ANY integrity violation, mock, facade, or cheating is detected, return **INTEGRITY VIOLATION** immediately with full evidence chains.
3. **Clean Certification**: If all implementations are genuine, robust, and authentic, return **CLEAN**.
4. Author complete audit report in `handoff.md`.

## 2026-10-26T04:06:46Z
You are auditor_m3_2 (teamwork_preview_auditor), Forensic Auditor for Milestone 3 Gate Iteration 2.
Your working directory is: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\auditor_m3_2

Read your dispatch assignment:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\auditor_m3_2\DISPATCH.md
Read ORIGINAL_REQUEST.md:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md
Read PROJECT.md:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md
Read worker_m3_2 handoff:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m3_2\handoff.md

Execute a strict, non-negotiable zero-tolerance audit across:
1. No Mocks or Facades in media-routes.ts, avatar-assets.ts, scripts/sync-avatar-assets.mjs, package.json, test/unit/milestone3-ui-backend.test.ts, test/unit/adversarial-empirical-m3-2.test.ts.
2. Binary Veto Rule: Any integrity violation, fake stream, dummy return, or mock trips an immediate INTEGRITY VIOLATION verdict.
3. If genuine production logic is verified throughout, return CLEAN.
4. Author handoff.md with clear verdict (CLEAN or INTEGRITY VIOLATION). Send completion message to parent.
