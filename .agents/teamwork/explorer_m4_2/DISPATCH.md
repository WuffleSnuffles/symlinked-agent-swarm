# DISPATCH — explorer_m4_2

## Mission: Milestone 4 Exploration 2 — Windows In-Place Atomic Hot-Swap Self-Update Mechanism
You are `explorer_m4_2` (role: `teamwork_preview_explorer`), Technical Investigation Specialist for Milestone 4.
Your working directory is: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_2`

## Mandatory Reading
Read these documents before taking any action:
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md` (specifically Follow-up §4: Consular-Gated Self-Updating .exe & Atomic Hot-Swap)
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md` (Feature 12)
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\src\server\routes\governance-routes.ts`

## Technical Investigation Focus
1. **Windows Binary Locking & In-Place Atomic Swap Mechanics**:
   - On Windows, a running executable is locked by the OS and cannot be directly overwritten or truncated.
   - However, the Windows NTFS filesystem DOES permit renaming a running executable!
   - Investigate the precise atomic swap sequence:
     1. New binary compiled to `SymlinkedAgentSwarm.new.exe`.
     2. Verify binary validity (file size $> 0$, PE header, signature or hash).
     3. Atomic rename: `SymlinkedAgentSwarm.exe` -> `SymlinkedAgentSwarm.old.exe`.
     4. Atomic rename: `SymlinkedAgentSwarm.new.exe` -> `SymlinkedAgentSwarm.exe`.
     5. Relaunch: Spawn new `SymlinkedAgentSwarm.exe` with `detached: true, stdio: 'inherit'`.
     6. Clean exit of old process: Old process exits with code 0.
     7. Cleanup: On next startup, check for and delete `SymlinkedAgentSwarm.old.exe`.
2. **Consular Governance Gating for Self-Update**:
   - How self-update is gated by Dual-Consul Consensus (2/2 approval required; 1 veto aborts).
   - Integration with `POST /api/governance/self-update` and Git time-machine snapshot before swap.
   - Rollback recovery: If new binary fails startup or crashes within 10 seconds, swap back `SymlinkedAgentSwarm.old.exe` -> `SymlinkedAgentSwarm.exe`.
3. Author a comprehensive `handoff.md` with Observation, Logic Chain, Caveats, Conclusion, and Verification Method.

## 2026-10-26T04:18:00Z
You are explorer_m4_2 (teamwork_preview_explorer), Technical Investigation Specialist for Milestone 4 (Windows In-Place Atomic Hot-Swap Self-Update Mechanism).
Your working directory is: H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_2

Read your dispatch assignment:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_2\DISPATCH.md
Read ORIGINAL_REQUEST.md:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md
Read PROJECT.md:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md

Investigate:
1. Windows binary locking & NTFS atomic swap sequence (.exe -> .old.exe, .new.exe -> .exe, process relaunch, cleanup).
2. Dual-Consul governance gating for self-update (2/2 consensus, veto rollback, checkpoint snapshot).
3. Author handoff.md with complete findings, code designs, and verification methods. Send completion message to parent.
