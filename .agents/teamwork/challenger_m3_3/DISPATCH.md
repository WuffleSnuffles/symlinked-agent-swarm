# DISPATCH — challenger_m3_3

## Mission: Milestone 3 Challenger 1 (Iteration 2)
You are `challenger_m3_3` (role: `teamwork_preview_challenger`), Challenger 1 for Milestone 3 Gate Iteration 2.
Your working directory is: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\challenger_m3_3`

## Mandatory Reading
Read these documents before taking any action:
1. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\ORIGINAL_REQUEST.md`
2. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md`
3. `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\worker_m3_2\handoff.md`

## Empirical Challenge Scope
Empirically verify:
1. Corner consular avatars: 12-scenario animation states, quadrant coordinates (2x2 Nia, 2x2 Ferric, 1x1 wrestling clash), debate turns counter dynamics (turns 1..3 `debating`, turn 4 threshold `wrestling_fistfight`, persistence on turn $\ge 5$, reset to 0 on 2/2 consensus).
2. Mid-work intervention consensus: 2/2 unanimous approval triggers `INTERVENTION_EXECUTED`, 1/2 veto triggers `BLOCKED_BY_VETO` and transition to `veto_clash`.
3. Avatar asset synchronization: Verify `scripts/sync-avatar-assets.mjs` and `ensureAvatarAssets` correctly identify source textures ($> 600,000$ bytes) and reject corrupt/dummy files.
4. Issue an unambiguous verdict: **APPROVE** or **REQUEST_CHANGES**, fully justified in `handoff.md`.
