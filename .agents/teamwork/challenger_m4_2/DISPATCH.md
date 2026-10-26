# DISPATCH — challenger_m4_2

## Mission: Milestone 4 Challenger 2 (SelfUpdateManager, Atomic Swap & Rollback)
You are `challenger_m4_2` (role: `teamwork_preview_challenger`), Challenger 2 for Milestone 4 Gate.
Your working directory is: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\challenger_m4_2`

## Mandatory Reading
Read these documents before taking any action:
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md`
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md`
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m4_1\handoff.md`

## Empirical Challenge Focus
Empirically challenge and stress-test:
1. PE Binary Validation in `SelfUpdateManager`:
   - Valid PE header (DOS `MZ`, offset, `PE\0\0`) -> `valid: true`.
   - Mock header prefixes (`MZ_MOCK_`, `COMPILED_`) -> `valid: true`.
   - Truncated file, missing file, corrupted header bytes -> `valid: false` with specific reason.
2. 7-Stage Atomic Binary Swap:
   - Atomic rename of root `SymlinkedAgentSwarm.exe` to `SymlinkedAgentSwarm.old.exe` and `SymlinkedAgentSwarm.new.exe` to `SymlinkedAgentSwarm.exe`.
   - Stale `.old.exe` eviction.
   - Version increment (`1.0.0` -> `1.0.1`).
   - Rollback capability (`rollbackSwap`) restoring `.old.exe` if `.exe` is invalid.
3. Consular Engine & Pre-Swap Git Checkpoint:
   - 2/2 unanimous approval triggers checkpoint snapshot and binary swap.
   - 1/2 Veto blocks swap and records incident.
   - Rollback route `/governance/self-update/rollback` restores Git commit and taskboard state.
4. Author `handoff.md` with explicit verdict: **APPROVE** or **REQUEST_CHANGES**. Send completion message to parent.

## 2026-10-26T04:45:06Z
[Message] timestamp=2026-10-26T04:45:06Z sender=5d1d9c33-70a3-4e64-96ff-073d03d579f8 priority=MESSAGE_PRIORITY_HIGH content=You are challenger_m4_2 (teamwork_preview_challenger), Challenger 2 for Milestone 4 Gate.
Your working directory is: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\challenger_m4_2

Read your dispatch assignment:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\challenger_m4_2\DISPATCH.md
Read ORIGINAL_REQUEST.md:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md
Read PROJECT.md:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md
Read worker_m4_1 handoff:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m4_1\handoff.md

Empirically challenge:
1. PE Binary Validation in `SelfUpdateManager`: valid PE headers, mock binary headers, truncated and corrupted file rejection.
2. 7-Stage Atomic Binary Swap: atomic rename `.exe` -> `.old.exe` and `.new.exe` -> `.exe`, stale eviction, version increment, and rollback recovery.
3. Consular Engine integration: pre-swap Git time-machine snapshot, 2/2 consensus gating, veto blocking, and rollback route.
4. Author handoff.md with clear verdict (APPROVE or REQUEST_CHANGES). Send completion message to parent.
