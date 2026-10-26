# Explorer Survey 1: Handoff Report

## 1. Observation
- **Original Requirements (`ORIGINAL_REQUEST.md`)**:
  - Lines 12-16: 16-cubicle grid (`cubicle-01` to `cubicle-16`), pre-populating Cubicles 1 & 2 with `Gemini 4 Argon (High)`, Cubicle 3 with `GPT Astra (Very High)`, and Cubicles 4-16 blank.
  - Lines 17-25: Thinking-tier gating matrix. `Gemini 4 Argon (High)` and `GPT Astra (Ultra)` can spawn (`can_spawn_subswarm = true`); `GPT Astra (Very High)` is restricted (`can_spawn_subswarm = false`); sub-swarm decomposition under `.swarm/subswarms/cubicle-XX/` with violation alerting and logging.
  - Lines 26-30: Isolated Git worktrees on per-cubicle branches (`swarm/cubicle-01` .. `swarm/cubicle-16`), symlinking/junctioning central `.swarm/` into each worktree, with atomic file moves for lock-free claiming (`tasks/todo/` -> `tasks/in_progress/`).
  - Lines 73-88: Follow-up update requiring continuous preference learning into `.swarm/memory/preferences.json` and `.agents/rules/USER_PREFERENCES.md`, with `.agents/` symlinked/junctioned alongside `.swarm/` into every worktree, plus Overseer skill/MCP generation.
- **Windows Filesystem Constraints**:
  - Windows Directory Symbolic Links (`mklink /D`) fail without Administrator elevation or Developer Mode (`ERROR_PRIVILEGE_NOT_HELD (1314)`).
  - Windows Directory Junctions (`mklink /J` or `fs.symlink(target, link, 'junction')`) are native NTFS reparse points (`IO_REPARSE_TAG_MOUNT_POINT`) that require **zero privileges / no administrator elevation**, making them the only reliable link mechanism for general Windows deployment.
  - Filesystem renames (`fs.promises.rename` / Win32 `MoveFileExW`) on the same volume are atomic at the NTFS Master File Table (MFT) directory entry level, providing a zero-overhead lock-free mechanism for task claiming.

## 2. Logic Chain
1. *From Observation 1*: The system requires 16 cubicles with 3 pre-filled and 13 configurable blank slots, running heterogeneous models with token quotas and fatigue modeling.
2. *From Observation 2*: Sub-swarm recursive decomposition requires significant planning depth. Authorizing `Gemini 4 Argon (High)` (Cubicles 1 & 2) while explicitly blocking `GPT Astra (Very High)` (Cubicle 3) prevents divergence and runaway sub-agent loops. A centralized capability matrix enforcer at the API and directory layer intercepting unauthorized spawning and emitting structured incident logs (`.swarm/logs/incidents.jsonl`) satisfies R2 and feeds the Panopticon Error panel.
3. *From Observation 3*: Standard multi-agent setups suffer from git merge conflicts in shared workspaces. Creating separate Git worktrees per cubicle branch (`swarm/cubicle-XX`) isolates code changes completely.
4. *From Observation 4*: Standard symlinks on Windows require elevated privileges, which fails in user-space environments. NTFS Directory Junctions (`/J`) provide transparent, zero-privilege directory aliasing. Linking `<worktree>/.swarm` -> `<root>/.swarm` and `<worktree>/.agents` -> `<root>/.agents` enables real-time synchronization of tasks, logs, sub-swarms, preferences, skills, and MCPs across all 16 cubicles without network or database overhead.
5. *From Observation 5*: Atomic renames of task files between `todo/` and `in_progress/` eliminate the need for distributed locks or transactional databases. When concurrent cubicles race to claim the same task, NTFS guarantees exactly one winner while the other receives `ENOENT` and gracefully backs off.
6. *From Observations 1-5*: Node.js/TypeScript is the optimal runtime because:
   - Native `fs.symlink(..., 'junction')` provides unprivileged NTFS directory junctions out-of-the-box.
   - Native `fs.promises.rename` provides atomic task claiming.
   - High-throughput WebSocket server (`ws`) broadcasts real-time telemetry to multi-monitor windows.
   - `@yao-pkg/pkg` or Node 20 SEA compiles the complete runtime, backend, and static UI assets into a single standalone Windows executable (`SymlinkedAgentSwarm.exe`).

## 3. Caveats
- **Cross-Volume Junction Limitation**: NTFS Directory Junctions can only point to directories on the same local drive (or another local NTFS drive). They cannot cross over to remote network shares (`UNC` paths). For our project root and worktrees on drive `H:` (or `C:`), this is fully supported.
- **Git Worktree Cleanup**: If a cubicle is cleared or reset, its Git worktree must be pruned cleanly with `git worktree remove` and junction links removed with `fs.rmdir` (standard directory removal deletes junction points without deleting target directory contents).
- **Sub-Swarm Patch Merge Conflicts**: When child micro-workers produce conflicting git patches, the parent cubicle must run sequential `git apply` checks and reject conflicting sub-tasks, triggering a sub-task retry.

## 4. Conclusion
The architectural blueprint for the Symlinked Agent Swarm Engine is fully formulated and documented in `analysis.md`:
1. **Grid Roster & State**: A 16-slot 4x4 matrix with strict lifecycle states (`vacant`, `idle`, `working`, `under_inspection`, `error`, `exhausted`), dynamic fatigue calculation based on token quota usage, and a pluggable CLI templating engine supporting Gemini, GPT, Claude, DeepSeek, and Custom CLI runners.
2. **Thinking-Tier Gating**: Strict enforcement of `can_spawn_subswarm` with `Gemini 4 Argon (High)` enabled, `GPT Astra (Very High)` gated/restricted, and structured incident logging to `.swarm/logs/incidents.jsonl` triggering Sauron spotlight focus and error banner dispatch.
3. **Worktree & Junction Engine**: Isolated Git branches `swarm/cubicle-01` through `swarm/cubicle-16` equipped with unprivileged NTFS Directory Junctions for `.swarm` and `.agents`, backed by lock-free atomic file moves for task claiming.
4. **Runtime & Packaging**: Node.js/TypeScript host with Fastify and `ws`, packaged via `@yao-pkg/pkg` into standalone `SymlinkedAgentSwarm.exe`.

## 5. Verification Method
1. **Directory Junction Verification**:
   - Inspect test script logic: create temp directory `root/.swarm`, create `worktree/`, execute `fs.symlink(root/.swarm, worktree/.swarm, 'junction')`, write `worktree/.swarm/test.txt`, verify `root/.swarm/test.txt` contains identical content without elevation.
2. **Atomic Task Claiming Verification**:
   - Concurrency stress test: spawn 16 parallel async workers calling `claimTask()` on 5 tasks in `tasks/todo/`. Verify exactly 5 distinct workers claim the 5 tasks, 0 double-claims occur, and 11 workers gracefully receive false/`ENOENT`.
3. **Capability Gating Verification**:
   - Invoke sub-swarm spawn API for `cubicle-03` (`GPT Astra (Very High)`). Verify it throws `CAPABILITY_RESTRICTION_ERROR`, writes an incident entry to `.swarm/logs/incidents.jsonl`, and prevents directory creation in `.swarm/subswarms/cubicle-03/`.
4. **Specification File Inspection**:
   - Review `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_survey_1\analysis.md` for complete schema contracts, CLI templates, and lifecycle state diagrams.
