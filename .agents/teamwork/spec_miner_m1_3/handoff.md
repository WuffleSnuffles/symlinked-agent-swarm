# Hand-off Report: Milestone 1, Component C (Feature 3)
## Git Worktree Isolation, Windows NTFS Directory Junctions, and Atomic Task Claiming

**Author**: Spec Miner M1-3  
**Date**: 2026-10-26  
**Type**: Hard Hand-off (Task Complete)  
**Assigned Artifacts**: `analysis.md`, `progress.md`, `BRIEFING.md`, `DISPATCH.md`  
**Recipients**: Sub-Orchestrator M1 (`5d1d9c33-70a3-4e64-96ff-073d03d579f8`), Downstream Builders (`builder_m1_*`)

---

### 1. Observation
- `ORIGINAL_REQUEST.md` (lines 26–30):
  > "When pointed at a target Git repository, automatically provision isolated Git worktrees on per-cubicle branches (`swarm/cubicle-01` .. `swarm/cubicle-16`) and link a single central `.swarm/` directory into each worktree using Windows-compatible Directory Junctions (with POSIX symlink fallback):
  > - Store all task files (`tasks/todo/`, `tasks/in_progress/`, `tasks/review/`, `tasks/done/`), sub-swarm state (`subswarms/`), per-cubicle status/heartbeats/thoughts/usage (`status/`), error and execution logs (`logs/`), and the Overseer's master `TASKBOARD.md` inside `.swarm/`.
  > - Use atomic file moves/renames when cubicles claim tasks from `todo/` to `in_progress/` so concurrent workers never double-claim a task or corrupt shared state."
- `ORIGINAL_REQUEST.md` Follow-up (lines 77–88):
  > "Symlink/junction `.agents/` (alongside `.swarm/`) into every cubicle worktree (`<worktree>/.agents` -> `<root>/.agents`) so all 16 cubicles immediately inherit and enforce learned preferences on every task without the user ever having to repeat themselves."
- `PROJECT.md` (lines 129–135):
  > "1. Cubicle Worktree & Junction Contract
  > - Target directory: `<root>/worktrees/<cubicle_id>` (branch `swarm/<cubicle_id>`)
  > - Junction 1: `<root>/worktrees/<cubicle_id>/.swarm` -> `<root>/.swarm`
  > - Junction 2: `<root>/worktrees/<cubicle_id>/.agents` -> `<root>/.agents`
  > - Windows Implementation: `fs.symlink(target, link, 'junction')`
  > - Atomic Task Claim: `fs.promises.rename('<root>/.swarm/tasks/todo/<task_id>.json', '<root>/.swarm/tasks/in_progress/<task_id>.json')`"
- Win32 API and NTFS Reparse Tag Architecture:
  - NTFS Directory Junctions use tag `IO_REPARSE_TAG_MOUNT_POINT` (`0xA0000003`). Standard non-admin Windows users have full permission to create directory junctions without UAC elevation or Windows Developer Mode.
  - Symlinks (`IO_REPARSE_TAG_SYMLINK`, `0xA000000C`) require `SeCreateSymbolicLinkPrivilege`, which fails with `ERROR_PRIVILEGE_NOT_HELD` unless Developer Mode is globally enabled or running elevated.
  - Safe removal of junctions on Windows requires calling `fs.promises.rmdir` on the link path. This invokes Win32 `RemoveDirectoryW`, removing the reparse point while leaving the target directory (`<root>/.swarm` or `<root>/.agents`) completely untouched.

---

### 2. Logic Chain
1. From **Observation 1 & 2**, each of the 16 cubicles needs an isolated Git working directory to execute commands and modifications simultaneously without git index locks or cross-cubicle branch contamination.
2. From **Observation 4**, standard Windows environments often have Developer Mode disabled and lack Administrator privileges. Standard directory symlinks (`type: 'dir'`) fail on Windows unless elevated. Therefore, setting `type: 'junction'` in `fs.symlink(target, link, 'junction')` is mandatory to guarantee zero-admin privilege execution.
3. Because directory junctions behave like directory mount points, naive recursive deletion (`rm -rf` or unvetted tools) could descend into the junction and erase all shared swarm tasks and preferences in `<root>/.swarm`. Therefore, an explicit `safeRemoveJunction()` function using `fs.promises.rmdir()` is required before any worktree removal is executed.
4. From **Observation 1 & 3**, task claiming across 16 workers must be race-condition-free without centralized database or lockfile overhead. In Windows NTFS, `fs.promises.rename` (Win32 `MoveFileExW`) modifies directory entries atomically in the Master File Table. Under simultaneous claiming of the same task file, exactly one process completes the rename; all contending processes receive `ENOENT` (or transient `EBUSY`/`EPERM`), allowing them to gracefully back off with zero file corruption.
5. We synthesized these principles into two complete TypeScript classes: `WorktreeManager` (`src/server/worktree-manager.ts`) and `TaskboardManager` (`src/server/taskboard-manager.ts`), documented in `analysis.md`.

---

### 3. Caveats
- Junctions are supported strictly on local NTFS filesystems (e.g. `C:`, `D:`, `H:`). If a user attempts to run the swarm on a remote SMB network share (UNC path), junction creation fails; the code handles this by falling back to directory symlinks or reporting a clear error.
- Git worktrees require that the root repository contains at least one initial commit (so `HEAD` resolves). If an empty repository is initialized, the manager must create an initial commit (`git commit --allow-empty`) before adding worktrees.
- If a cubicle worker crashes during execution, the task remains in `tasks/in_progress/`. A watchdog mechanism that monitors cubicle heartbeats (> 60s timeout) is specified to atomically recover stranded tasks back to `tasks/todo/`.

---

### 4. Conclusion
Milestone 1 Component C is fully specified and designed. The specifications detail:
1. Per-cubicle branch provisioning (`swarm/cubicle-01` through `swarm/cubicle-16`) and worktree provisioning at `worktrees/cubicle-XX`.
2. Zero-privilege NTFS directory junctions (`IO_REPARSE_TAG_MOUNT_POINT`) linking both `<worktree>/.swarm` and `<worktree>/.agents` to the project root, with safe unlinking via `fs.promises.rmdir`.
3. High-concurrency lock-free task claiming via atomic filesystem renames (`todo/` to `in_progress/`), with complete race condition immunity (`ENOENT` handling).
4. Full TypeScript reference designs for `src/server/worktree-manager.ts` and `src/server/taskboard-manager.ts`.

---

### 5. Verification Method
Downstream implementers and testers can independently verify the specification via the following procedures:

1. **Junction Zero-Admin Test**:
   - Run a non-elevated Node.js script on Windows:
     ```typescript
     await fs.symlink(path.resolve('.swarm'), path.resolve('worktrees/cubicle-01/.swarm'), 'junction');
     ```
   - Verify that the junction is created with exit code 0 and no permission errors.
   - Verify that writing a file to `worktrees/cubicle-01/.swarm/test.txt` is instantly readable at `.swarm/test.txt`.
   - Call `fs.promises.rmdir('worktrees/cubicle-01/.swarm')` and verify that `.swarm/test.txt` still exists in `<root>/.swarm`.
2. **Worktree Isolation Test**:
   - Execute `git worktree list --porcelain` and verify 16 cubicles have unique worktree directories and branches.
   - Modify a file in `worktrees/cubicle-01` and run `git status` in `worktrees/cubicle-02` to confirm clean working tree.
3. **High-Concurrency Atomic Rename Test**:
   - Create 100 test files in `.swarm/tasks/todo/`.
   - Launch 16 parallel Node.js worker promises executing `claimTask()` concurrently.
   - Assert that exactly 100 claims succeed, all remaining attempts receive `ENOENT`, 0 tasks are claimed twice, and all 100 files exist in `.swarm/tasks/in_progress/`.
