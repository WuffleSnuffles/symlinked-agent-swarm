## 2026-10-26T00:24:42Z
You are Spec Miner M1-3.
Your working directory is:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\spec_miner_m1_3
Original Request File:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\ORIGINAL_REQUEST.md
Master Project Architecture:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\PROJECT.md
Reference Survey:
H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_survey_1\analysis.md

You MUST read `ORIGINAL_REQUEST.md` and `PROJECT.md` first.

### Objective
Extract and formulate the exact specifications and implementation design for **Milestone 1, Component C: Git Worktree Isolation, Windows NTFS Directory Junctions, and Atomic Task Claiming (Feature 3)**:
1. Git worktree provisioning:
   - Creating per-cubicle branches `swarm/cubicle-01` through `swarm/cubicle-16` on demand.
   - Provisioning isolated worktrees at `worktrees/cubicle-XX`.
2. Windows NTFS Directory Junctions vs Symbolic Links:
   - Technical specifications for `IO_REPARSE_TAG_MOUNT_POINT` (NTFS Junctions).
   - Zero-admin privilege requirement on Windows.
   - Node.js native API call: `fs.promises.symlink(target, linkPath, 'junction')`.
   - Linking `<worktree>/.swarm` -> `<root>/.swarm`.
   - Linking `<worktree>/.agents` -> `<root>/.agents`.
   - Safe removal via `fs.promises.rmdir` (deletes reparse point without deleting target directory).
   - Fallback logic for POSIX environments (`'dir'` symlink).
3. Atomic lock-free task claiming:
   - Atomic rename mechanism (`fs.promises.rename` / Win32 `MoveFileExW`) from `.swarm/tasks/todo/<task_id>.json` to `.swarm/tasks/in_progress/<task_id>.json`.
   - High-concurrency race condition behavior: exactly one worker succeeds, losing workers receive `ENOENT` with zero state corruption.
4. Provide concrete TypeScript implementation design for `src/server/worktree-manager.ts` and `src/server/taskboard-manager.ts`.

Write `analysis.md` and `handoff.md` in your working directory. Update `progress.md` and notify parent when complete.
