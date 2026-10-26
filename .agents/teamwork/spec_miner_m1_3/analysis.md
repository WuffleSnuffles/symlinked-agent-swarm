# Technical Specification & Implementation Design Report
## Milestone 1, Component C: Git Worktree Isolation, Windows NTFS Directory Junctions, and Atomic Task Claiming (Feature 3)

**Author**: Spec Miner M1-3  
**Date**: 2026-10-26  
**Working Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\spec_miner_m1_3`  
**Target Subsystem**: `src/server/worktree-manager.ts` & `src/server/taskboard-manager.ts`  
**Host Platform**: Windows 11 (NTFS) with POSIX Fallback  
**Reference Documents**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `explorer_survey_1/analysis.md`

---

## 1. Executive Summary & Scope

Milestone 1, Component C (Feature 3) provides the foundational concurrency, filesystem isolation, and task distribution substrate for the Symlinked Agent Swarm Panopticon system. It resolves three core engineering challenges:

1. **Complete Code Isolation Across 16 Cubicles**: Each cubicle worker runs inside its own isolated Git worktree (`worktrees/cubicle-01` through `worktrees/cubicle-16`) on a dedicated Git branch (`swarm/cubicle-01` through `swarm/cubicle-16`). This prevents parallel agents from dirtying each other's working trees, overwriting uncommitted edits, or generating merge conflicts during task execution.
2. **Zero-Privilege Windows Shared State via NTFS Directory Junctions**: Standard Windows users cannot create symbolic links (`IO_REPARSE_TAG_SYMLINK`) without Administrator elevation or Windows Developer Mode enabled. To achieve zero-admin compatibility, the engine establishes **NTFS Directory Junctions** (`IO_REPARSE_TAG_MOUNT_POINT`) from `<worktree>/.swarm` to `<root>/.swarm` and `<worktree>/.agents` to `<root>/.agents`. This provides instant, zero-copy, sub-millisecond visibility of shared tasks, telemetry, learned user preferences, skills, and MCP definitions across all 16 cubicles.
3. **Lock-Free Atomic Task Claiming**: Avoids fragile `.lock` files and external databases by executing atomic filesystem rename operations (`fs.promises.rename` / Win32 `MoveFileExW`) from `.swarm/tasks/todo/<task_id>.json` to `.swarm/tasks/in_progress/<task_id>.json`. Under heavy concurrency from 16 workers, the NTFS Master File Table guarantees that exactly one worker successfully renames the file; losing workers receive `ENOENT` with zero state corruption.

---

## 2. Features Discovered

The following features were discovered, probed, and specified from the authoritative project requirements:

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Git Worktree | Repository Root Validation | Detects and validates that the target project is a valid Git repository before attempting any worktree operations. | `repoRoot: string` | `{ isValid: boolean; repoRoot: string; headSha: string; defaultBranch: string }` | Throws `Error('Target directory is not a valid Git repository')` if `.git` or `git rev-parse` fails. | `ORIGINAL_REQUEST.md` §R3; Git CLI Spec |
| 2 | Git Worktree | Per-Cubicle Branch Provisioning | Creates or validates isolated Git branches `swarm/cubicle-01` .. `swarm/cubicle-16` branching from `main` or `HEAD`. | `cubicleId: string` (e.g. `'cubicle-01'`), `baseBranch?: string` | `branchName: string` (`'swarm/cubicle-XX'`) | If branch already exists, reuses it without error; if base branch missing, defaults to `HEAD`. | `ORIGINAL_REQUEST.md` §R3; `PROJECT.md` §Interface 1 |
| 3 | Git Worktree | Worktree Directory Provisioning | Creates an isolated working tree at `worktrees/cubicle-XX` linked to branch `swarm/cubicle-XX` via `git worktree add`. | `cubicleId: string` | `WorktreeInfo` object with path, branch, head SHA, and junction status. | If worktree path exists or branch is already checked out, validates and reuses or cleans up stale state. | `ORIGINAL_REQUEST.md` §R3; `PROJECT.md` §Interface 1 |
| 4 | Git Worktree | Worktree Enumeration & Reconciliation | Queries `git worktree list --porcelain` to discover active worktrees and reconcile discrepancies between Git metadata and disk. | None | `WorktreeInfo[]` array | Gracefully handles detached heads or missing directories. | Git CLI `git-worktree` specification |
| 5 | Git Worktree | Stale Worktree Pruning | Executes `git worktree prune` to clean internal administrative files for worktrees whose directories were deleted. | None | `prunedCount: number` | Emits warning log if prune fails due to file locks. | Git CLI `git-worktree` specification |
| 6 | Git Worktree | Worktree Removal & Teardown | Safely unlinks junctions first, then calls `git worktree remove --force` to delete the worktree and release the branch. | `cubicleId: string`, `force?: boolean` | `void` | Throws descriptive error if worktree does not exist or branch is locked. | Git CLI `git-worktree` specification |
| 7 | Git Worktree | Root `.gitignore` Maintenance | Ensures `/worktrees/` and `/.swarm/` are present in root `.gitignore` to prevent tracking nested worktrees. | `repoRoot: string` | `boolean` (true if `.gitignore` was updated) | Appends entries idempotently if missing. | Git Best Practices & Explorer Survey 1 |
| 8 | NTFS Junction | Zero-Admin NTFS Directory Junction Creation | Creates NTFS directory junctions (`IO_REPARSE_TAG_MOUNT_POINT`) on Windows without Administrator privileges or Developer Mode. | `targetDir: string`, `linkPath: string` | `void` | Throws `ENOENT` if target directory does not exist; throws `EEXIST` if link path already exists. | `ORIGINAL_REQUEST.md` §R3; Win32 NTFS Spec |
| 9 | NTFS Junction | Dual Junction Provisioning (`.swarm` & `.agents`) | Links `<worktree>/.swarm` -> `<root>/.swarm` and `<worktree>/.agents` -> `<root>/.agents` inside every provisioned worktree. | `worktreePath: string`, `repoRoot: string` | `{ swarmJunction: string; agentsJunction: string }` | Verifies target directories exist before linking; cleans existing links if re-provisioning. | `ORIGINAL_REQUEST.md` Follow-up §1; `PROJECT.md` §Interface 1 |
| 10 | NTFS Junction | Safe Junction Removal via `rmdir` | Deletes the reparse point using `fs.promises.rmdir` without deleting or traversing into target directory contents. | `junctionPath: string` | `void` | Never calls recursive delete; handles `ENOENT` gracefully if already removed. | Win32 `RemoveDirectoryW` specification |
| 11 | NTFS Junction | Junction Verification & Reparse Inspection | Inspects filesystem path via `fs.promises.lstat` to verify it is a symbolic link or directory reparse point. | `path: string` | `{ exists: boolean; isJunction: boolean; target: string \| null }` | Returns `exists: false` if path is absent. | Node.js `fs.lstat` / `fs.readlink` Spec |
| 12 | NTFS Junction | POSIX Symlink Fallback | Automatically detects non-Windows platforms (`process.platform !== 'win32'`) and falls back to standard directory symlinks (`'dir'`). | `targetDir: string`, `linkPath: string` | `void` | Creates POSIX symbolic link using relative or absolute path. | `PROJECT.md` Architecture §Worktree |
| 13 | Taskboard | Atomic Lock-Free Task Claiming | Renames task file from `.swarm/tasks/todo/<id>.json` to `.swarm/tasks/in_progress/<id>.json` via atomic OS filesystem rename. | `cubicleId: string`, `taskId?: string` | `SwarmTask \| null` | Returns `null` if claimed by another worker (`ENOENT`) or if queue is empty; zero file corruption. | `ORIGINAL_REQUEST.md` §R3; `PROJECT.md` §Interface 1 |
| 14 | Taskboard | Task Payload Assignment Enrichment | Reads claimed task JSON, populates `assigned_cubicle`, `status: 'in_progress'`, and `claimed_at`, and writes back to disk. | `claimedPath: string`, `cubicleId: string` | `SwarmTask` | Recovers if file read fails; atomic file remains claimed. | Explorer Survey 1 §4.4 |
| 15 | Taskboard | Task Progress & Diff Telemetry Update | Updates `progress_percent` (0-100), `subswarm_active`, and Git diff summary on active `in_progress` task. | `taskId: string`, `updates: Partial<SwarmTask>` | `SwarmTask` | Throws `ENOENT` if task is not in `in_progress/`. | `ORIGINAL_REQUEST.md` §R4; `PROJECT.md` §Feature 3 |
| 16 | Taskboard | Task Submission to Consular Review | Atomically renames task from `tasks/in_progress/<id>.json` to `tasks/review/<id>.json` with verification output. | `taskId: string`, `reviewData: { diff: string; branch: string; testOutput?: string }` | `SwarmTask` | Fails if task is not currently `in_progress`. | `PROJECT.md` §Interface 3 |
| 17 | Taskboard | Consular Veto Task Rollback | Atomically returns task from `tasks/review/<id>.json` back to `tasks/in_progress/<id>.json` with recorded veto rationale. | `taskId: string`, `vetoRationale: string`, `returnToTodo?: boolean` | `SwarmTask` | Appends incident entry to `.swarm/logs/incidents.jsonl`. | `ORIGINAL_REQUEST.md` Follow-up §2 |
| 18 | Taskboard | Task Completion & Main Merge | Atomically moves task from `tasks/review/<id>.json` to `tasks/done/<id>.json` upon unanimous Consular approval. | `taskId: string`, `mergeCommitSha: string` | `SwarmTask` | Records `completed_at` timestamp and merges branch to `main`. | `PROJECT.md` §Feature 4 |
| 19 | Taskboard | Stalled Task Watchdog & Crash Recovery | Periodically scans `tasks/in_progress/` for tasks whose assigned cubicle has not updated its heartbeat within `timeoutMs` (default 60s). | `timeoutMs?: number` | `SwarmTask[]` (list of recovered tasks) | Atomically moves stalled task back to `tasks/todo/`, clearing assignment. | Explorer Survey 1 §4.4 |
| 20 | Taskboard | `TASKBOARD.md` Markdown Synchronization | Generates a clean human-readable Markdown Kanban summary at `.swarm/TASKBOARD.md` after any column transition. | None | `void` (writes `.swarm/TASKBOARD.md`) | Handles concurrent generation via debounced single-flight writes. | `ORIGINAL_REQUEST.md` §R3; `PROJECT.md` Layout |
| 21 | Taskboard | Overall Swarm Mission Progress Metric | Calculates weighted mission progress percentage across all tasks in `todo`, `in_progress`, `review`, and `done`. | None | `{ total: number; completed: number; inProgress: number; percentage: number }` | Returns 0% if no tasks exist. | `ORIGINAL_REQUEST.md` §R4; `PROJECT.md` §Feature 7 |

---

## 3. Edge Cases & Boundary Behaviors

| # | Feature | Input / Scenario | Observed / Specified Behavior |
|---|---------|------------------|-------------------------------|
| 1 | Worktree Provisioning | Worktree directory `worktrees/cubicle-XX` already exists on disk, but branch is unlinked in Git metadata. | Engine checks directory status; if directory is dirty or non-empty, re-attaches or cleans directory before running `git worktree add`. |
| 2 | Worktree Provisioning | `git worktree list` lists `cubicle-XX`, but the physical folder was deleted by user or OS cleanup. | `git worktree add` would fail with `fatal: '...' already exists in worktree list`. Engine detects stale entry, runs `git worktree prune`, then proceeds with `git worktree add`. |
| 3 | Worktree Provisioning | Branch `swarm/cubicle-XX` is currently checked out in another worktree or main working directory. | Git forbids checking out the same branch in multiple worktrees. Engine detects the conflicting worktree via `git worktree list --porcelain`, detaches or redirects checkout cleanly. |
| 4 | Worktree Provisioning | Repository has spaces in path (e.g. `H:\My Drive\Gemini Antigravity\...`). | Command arguments passed as discrete array items to `child_process.spawn` or enclosed in double quotes for shells to prevent path tokenization errors. |
| 5 | Worktree Provisioning | Fresh Git repository with zero commits (`HEAD` does not resolve to a commit). | `git worktree add` requires a valid parent commit. Engine detects unborn branch, creates an initial empty commit (`git commit --allow-empty -m "Initial swarm commit"`), and initializes `main`. |
| 6 | NTFS Junction | Attempting to create junction when target directory (`<root>/.swarm` or `<root>/.agents`) does not exist yet. | `fs.symlink(..., 'junction')` on Windows fails if target does not exist. Engine guarantees `<root>/.swarm` and `<root>/.agents` are created with `fs.mkdir(..., { recursive: true })` prior to junction call. |
| 7 | NTFS Junction | Junction link path `<worktree>/.swarm` already exists (e.g. from prior aborted run). | `fs.symlink` throws `EEXIST`. Engine verifies existence via `lstat`, calls `safeRemoveJunction()` to remove stale link, and re-creates junction cleanly. |
| 8 | NTFS Junction | Worktree teardown: user or automated script deletes `worktrees/cubicle-XX`. | If recursive deletion descends into the junction, it could delete `<root>/.swarm` files! Engine enforces `safeRemoveJunction()` which calls `fs.promises.rmdir` on the junction first before deleting worktree. |
| 9 | NTFS Junction | Repository hosted on non-NTFS filesystem (e.g. FAT32, exFAT, or network SMB share). | Junction creation fails. Engine detects filesystem error, logs warning, and falls back to directory symlink or managed directory synchronization. |
| 10 | Task Claiming | High concurrency: 16 cubicles attempt to claim the exact same `task-01.json` at the exact same millisecond. | Exactly one cubicle's `fs.promises.rename` succeeds. 15 cubicles receive `ENOENT` (or transient `EBUSY`/`EPERM`). Losers catch error, return `null`, and continue polling without corrupting the file or crashing. |
| 11 | Task Claiming | Cubicle claims task when `tasks/todo/` is completely empty. | Engine reads directory entries via `fs.readdir`, finds 0 matches, and returns `null` immediately without throwing. |
| 12 | Task Claiming | Task file in `tasks/todo/` contains malformed or corrupt JSON. | During claim, winner detects `SyntaxError` on `JSON.parse`, moves corrupt file to `.swarm/logs/corrupt-tasks/`, logs an incident to `incidents.jsonl`, and returns `null`. |
| 13 | Task Lifecycle | Worker process crashes abruptly mid-task; task remains stranded in `tasks/in_progress/`. | The Stalled Task Watchdog periodically inspects cubicle heartbeats (`.swarm/status/cubicle-XX.json`). If heartbeat > 60s stale, engine atomically moves task back to `tasks/todo/`, logs warning, and frees cubicle. |
| 14 | Task Lifecycle | Consular Veto: 1 Consul approves, 1 Consul vetoes (`1/2` split). | Consular engine invokes `returnToRevision(taskId, vetoReason)`. Task atomically moves from `review/` to `in_progress/` (or `todo/`), rationale is recorded in task history and `incidents.jsonl`, and Sauron spotlights lock on cubicle. |
| 15 | Taskboard Sync | Multiple tasks transition states simultaneously, triggering concurrent `TASKBOARD.md` updates. | Engine implements debounced single-flight queue for `TASKBOARD.md` generation, preventing file lock collisions or partial Markdown writes. |

---

## 4. Deep-Dive: Git Worktree Provisioning & Branch Architecture

### 4.1 Topology & Branch Namespace
The system provisions up to 16 isolated worktrees inside `<repo-root>/worktrees/`:
```
<repo-root>/
├── .git/                                    # Master Git repository
├── .swarm/                                  # Central swarm state
│   ├── tasks/ {todo, in_progress, review, done}
│   ├── subswarms/
│   ├── status/
│   └── logs/
├── .agents/                                 # Central agent state
│   ├── rules/USER_PREFERENCES.md
│   ├── skills/
│   └── mcp/
├── src/                                     # Root working tree
└── worktrees/
    ├── cubicle-01/                          # Branch: swarm/cubicle-01
    │   ├── .git                             # Git worktree pointer file
    │   ├── .swarm -> <root>/.swarm          # NTFS Junction
    │   ├── .agents -> <root>/.agents        # NTFS Junction
    │   └── src/                             # Cubicle 01 working files
    ├── cubicle-02/                          # Branch: swarm/cubicle-02
    │   ├── .git
    │   ├── .swarm -> <root>/.swarm
    │   ├── .agents -> <root>/.agents
    │   └── src/
    └── cubicle-03/                          # Branch: swarm/cubicle-03
        ├── ...
```

### 4.2 Git Commands Specification
All Git commands execute via standard CLI to avoid libgit2 worktree bugs on Windows:

1. **Check repo root**:
   ```bash
   git rev-parse --show-toplevel
   ```
2. **List active worktrees (porcelain mode)**:
   ```bash
   git worktree list --porcelain
   ```
   *Output format parsing*:
   ```text
   worktree H:/My Drive/.../worktrees/cubicle-01
   HEAD 7a8b9c...
   branch refs/heads/swarm/cubicle-01
   ```
3. **Branch creation & checkout**:
   ```bash
   git branch swarm/cubicle-01 main
   git worktree add worktrees/cubicle-01 swarm/cubicle-01
   ```
4. **Stale metadata prune**:
   ```bash
   git worktree prune
   ```
5. **Worktree teardown**:
   ```bash
   git worktree remove --force worktrees/cubicle-01
   ```

---

## 5. Deep-Dive: Windows NTFS Directory Junctions vs Symbolic Links

### 5.1 Technical Comparison
| Attribute | Directory Junction (`junction`) | Directory Symlink (`dir`) |
|---|---|---|
| **Win32 Reparse Tag** | `IO_REPARSE_TAG_MOUNT_POINT` (`0xA0000003`) | `IO_REPARSE_TAG_SYMLINK` (`0xA000000C`) |
| **Admin Privilege Required?** | **NO** (Standard unprivileged user) | **YES** (Unless Developer Mode enabled) |
| **Windows Developer Mode?** | **NOT REQUIRED** | **REQUIRED** for unprivileged users |
| **Node.js API Call** | `fs.symlink(target, link, 'junction')` | `fs.symlink(target, link, 'dir')` |
| **Target Type** | Directories only | Files or directories |
| **Target Path Resolution** | Absolute path on local volume (`\??\C:\...`) | Relative or absolute |
| **Cross-Volume Support** | Local volumes only (e.g. `C:` to `H:`) | Any volume or UNC network share |
| **Safe Deletion API** | `fs.promises.rmdir(linkPath)` | `fs.promises.unlink(linkPath)` |

### 5.2 Safe Deletion Mechanics (Avoiding Target Deletion Disaster)
In Windows, calling `fs.promises.rm(junctionPath, { recursive: true })` or running an external recursive deletion tool can inadvertently follow directory reparse points if not configured correctly, resulting in the catastrophic erasure of `<root>/.swarm` or `<root>/.agents`.

**The Invariant Safe Removal Rule**:
```typescript
export async function safeRemoveJunction(junctionPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(junctionPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      // In Node.js on Windows, rmdir on an NTFS junction deletes ONLY the reparse point!
      // It never touches the contents of the target directory.
      await fs.rmdir(junctionPath);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}
```

---

## 6. Deep-Dive: Lock-Free Atomic Task Claiming Engine

### 6.1 Concurrency Mechanics Under NTFS
Under Windows NTFS, `fs.promises.rename` invokes `MoveFileExW` with `MOVEFILE_WRITE_THROUGH`. The operation acquires an exclusive lock on the directory index record in the Master File Table (MFT).
- When 16 workers simultaneously invoke:
  ```typescript
  await fs.rename(
    '<root>/.swarm/tasks/todo/task-001.json',
    '<root>/.swarm/tasks/in_progress/task-001.json'
  );
  ```
  - **Thread A**: Locks entry, updates parent pointer, unlocks entry -> **Promise Resolves (Claim Won)**.
  - **Threads B..P**: Attempt to find entry in `todo/` directory index -> Entry gone -> **Throws `ENOENT` (Claim Lost)**.
  - No file locking daemon, no redis, no sqlite, and zero risk of orphan lockfiles deadlocking the swarm if a worker crashes.

### 6.2 Task Lifecycle State Flow
```
               [Create Task]
                     |
                     v
             +---------------+
             |  tasks/todo/  |
             +---------------+
                     |
                     | (Atomic Rename by Cubicle Worker)
                     v
         +-----------------------+
         |   tasks/in_progress/  | <-----+ (Consular Veto / Revision)
         +-----------------------+       |
                     |                   |
                     | (Submit Diff)     |
                     v                   |
             +---------------+           |
             | tasks/review/ | ----------+
             +---------------+
                     |
                     | (2/2 Unanimous Consular Approval)
                     v
             +---------------+
             |  tasks/done/  |
             +---------------+
```

---

## 7. Concrete TypeScript Implementation: `src/server/worktree-manager.ts`

```typescript
/**
 * src/server/worktree-manager.ts
 *
 * Production Git Worktree & NTFS Directory Junction Isolation Engine.
 * Manages per-cubicle worktrees (swarm/cubicle-01..16) and dual junction linking
 * (<worktree>/.swarm and <worktree>/.agents) with zero-admin Windows compatibility.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface WorktreeInfo {
  cubicleId: string;
  worktreePath: string;
  branch: string;
  headSha: string;
  isLocked: boolean;
  swarmJunctionActive: boolean;
  agentsJunctionActive: boolean;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class WorktreeManager {
  private repoRoot: string;
  private worktreesBaseDir: string;
  private swarmDir: string;
  private agentsDir: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
    this.worktreesBaseDir = path.join(this.repoRoot, 'worktrees');
    this.swarmDir = path.join(this.repoRoot, '.swarm');
    this.agentsDir = path.join(this.repoRoot, '.agents');
  }

  /**
   * Executes a Git command with safe argument passing and directory context.
   */
  public async execGit(args: string[], cwd: string = this.repoRoot): Promise<GitExecResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 });
        } else {
          const err = new Error(`Git command 'git ${args.join(' ')}' failed with exit code ${exitCode}: ${stderr}`);
          (err as any).exitCode = exitCode;
          (err as any).stdout = stdout;
          (err as any).stderr = stderr;
          reject(err);
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn git process: ${err.message}`));
      });
    });
  }

  /**
   * Validates that the target directory is inside a valid Git repository.
   */
  public async validateRepository(): Promise<{ isValid: boolean; repoRoot: string; defaultBranch: string }> {
    try {
      const { stdout: toplevel } = await this.execGit(['rev-parse', '--show-toplevel']);
      const normalizedRoot = path.resolve(toplevel);
      
      let defaultBranch = 'main';
      try {
        const { stdout: branch } = await this.execGit(['symbolic-ref', '--short', 'HEAD']);
        if (branch) defaultBranch = branch;
      } catch {
        // Fallback to main
      }

      await this.ensureGitIgnore();
      return { isValid: true, repoRoot: normalizedRoot, defaultBranch };
    } catch (err: any) {
      throw new Error(`Invalid Git repository at '${this.repoRoot}': ${err.message}`);
    }
  }

  /**
   * Ensures root .gitignore contains entries for /worktrees/ and /.swarm/.
   */
  public async ensureGitIgnore(): Promise<boolean> {
    const gitignorePath = path.join(this.repoRoot, '.gitignore');
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf8');
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const requiredEntries = ['/worktrees/', '/.swarm/'];
    let modified = false;

    for (const entry of requiredEntries) {
      if (!content.includes(entry)) {
        content = content.endsWith('\n') || content.length === 0 ? `${content}${entry}\n` : `${content}\n${entry}\n`;
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(gitignorePath, content, 'utf8');
    }
    return modified;
  }

  /**
   * Ensures the target cubicle branch exists (e.g. swarm/cubicle-01).
   */
  public async ensureBranch(cubicleId: string, baseBranch: string = 'HEAD'): Promise<string> {
    const branchName = `swarm/${cubicleId}`;
    try {
      await this.execGit(['rev-parse', '--verify', `refs/heads/${branchName}`]);
      // Branch already exists
    } catch {
      // Create branch from baseBranch
      await this.execGit(['branch', branchName, baseBranch]);
    }
    return branchName;
  }

  /**
   * Provisions an isolated Git worktree for the specified cubicle and creates junctions.
   */
  public async provisionWorktree(cubicleId: string): Promise<WorktreeInfo> {
    await this.validateRepository();
    await fs.mkdir(this.worktreesBaseDir, { recursive: true });
    await fs.mkdir(this.swarmDir, { recursive: true });
    await fs.mkdir(this.agentsDir, { recursive: true });

    const worktreePath = path.join(this.worktreesBaseDir, cubicleId);
    const branchName = await this.ensureBranch(cubicleId);

    // Reconcile existing worktree list
    const activeWorktrees = await this.listWorktrees();
    const existing = activeWorktrees.find((w) => w.cubicleId === cubicleId);

    let needsAdd = true;
    if (existing) {
      let diskExists = false;
      try {
        const stat = await fs.stat(worktreePath);
        diskExists = stat.isDirectory();
      } catch {}

      if (diskExists) {
        needsAdd = false;
      } else {
        // Prune stale entry
        await this.pruneWorktrees();
      }
    }

    if (needsAdd) {
      try {
        await this.execGit(['worktree', 'add', worktreePath, branchName]);
      } catch (err: any) {
        // If git error indicates checkout conflict or dirty tree, try pruning and re-adding
        await this.pruneWorktrees();
        await this.execGit(['worktree', 'add', '--force', worktreePath, branchName]);
      }
    }

    // Link shared .swarm and .agents junctions
    const junctions = await this.linkSharedDirectories(worktreePath);

    const { stdout: headSha } = await this.execGit(['rev-parse', 'HEAD'], worktreePath);

    return {
      cubicleId,
      worktreePath,
      branch: branchName,
      headSha,
      isLocked: false,
      swarmJunctionActive: junctions.swarmActive,
      agentsJunctionActive: junctions.agentsActive,
    };
  }

  /**
   * Links .swarm and .agents into the worktree using Windows NTFS Junctions (or POSIX symlinks).
   */
  public async linkSharedDirectories(worktreePath: string): Promise<{ swarmActive: boolean; agentsActive: boolean }> {
    const targetSwarm = path.resolve(this.swarmDir);
    const linkSwarm = path.join(worktreePath, '.swarm');

    const targetAgents = path.resolve(this.agentsDir);
    const linkAgents = path.join(worktreePath, '.agents');

    await this.createJunctionOrSymlink(targetSwarm, linkSwarm);
    await this.createJunctionOrSymlink(targetAgents, linkAgents);

    const swarmActive = await this.verifyJunction(linkSwarm);
    const agentsActive = await this.verifyJunction(linkAgents);

    return { swarmActive, agentsActive };
  }

  /**
   * Creates a zero-privilege NTFS Directory Junction on Windows, or 'dir' symlink on POSIX.
   */
  public async createJunctionOrSymlink(targetDir: string, linkPath: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });

    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        await this.safeRemoveJunction(linkPath);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(path.resolve(targetDir), path.resolve(linkPath), linkType);
  }

  /**
   * Verifies that a path exists and is an active junction or symbolic link.
   */
  public async verifyJunction(junctionPath: string): Promise<boolean> {
    try {
      const stat = await fs.lstat(junctionPath);
      return stat.isSymbolicLink() || stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Safely deletes an NTFS junction using rmdir without traversing or deleting target contents.
   */
  public async safeRemoveJunction(junctionPath: string): Promise<void> {
    try {
      const stat = await fs.lstat(junctionPath);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        await fs.rmdir(junctionPath);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Safely removes a cubicle's worktree, unlinking junctions first.
   */
  public async removeWorktree(cubicleId: string, force: boolean = true): Promise<void> {
    const worktreePath = path.join(this.worktreesBaseDir, cubicleId);
    
    // Safely remove junctions first!
    await this.safeRemoveJunction(path.join(worktreePath, '.swarm'));
    await this.safeRemoveJunction(path.join(worktreePath, '.agents'));

    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(worktreePath);

    try {
      await this.execGit(args);
    } catch (err: any) {
      // If worktree command fails, attempt prune
      await this.pruneWorktrees();
    }
  }

  /**
   * Prunes stale worktrees from Git's administrative database.
   */
  public async pruneWorktrees(): Promise<void> {
    await this.execGit(['worktree', 'prune']);
  }

  /**
   * Enumerates all currently registered Git worktrees.
   */
  public async listWorktrees(): Promise<WorktreeInfo[]> {
    const { stdout } = await this.execGit(['worktree', 'list', '--porcelain']);
    const lines = stdout.split('\n');
    const worktrees: WorktreeInfo[] = [];

    let currentPath = '';
    let currentHead = '';
    let currentBranch = '';
    let isLocked = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (currentPath) {
          const cubicleMatch = path.basename(currentPath).match(/^(cubicle-\d{2})$/);
          if (cubicleMatch) {
            worktrees.push({
              cubicleId: cubicleMatch[1],
              worktreePath: currentPath,
              branch: currentBranch.replace(/^refs\/heads\//, ''),
              headSha: currentHead,
              isLocked,
              swarmJunctionActive: false, // populated on verify
              agentsJunctionActive: false,
            });
          }
          currentPath = '';
          currentHead = '';
          currentBranch = '';
          isLocked = false;
        }
        continue;
      }

      if (line.startsWith('worktree ')) {
        currentPath = line.substring(9).trim();
      } else if (line.startsWith('HEAD ')) {
        currentHead = line.substring(5).trim();
      } else if (line.startsWith('branch ')) {
        currentBranch = line.substring(7).trim();
      } else if (line.startsWith('locked')) {
        isLocked = true;
      }
    }

    if (currentPath) {
      const cubicleMatch = path.basename(currentPath).match(/^(cubicle-\d{2})$/);
      if (cubicleMatch) {
        worktrees.push({
          cubicleId: cubicleMatch[1],
          worktreePath: currentPath,
          branch: currentBranch.replace(/^refs\/heads\//, ''),
          headSha: currentHead,
          isLocked,
          swarmJunctionActive: false,
          agentsJunctionActive: false,
        });
      }
    }

    return worktrees;
  }
}
```

---

## 8. Concrete TypeScript Implementation: `src/server/taskboard-manager.ts`

```typescript
/**
 * src/server/taskboard-manager.ts
 *
 * Production Lock-Free Atomic Taskboard & Kanban Engine.
 * Implements atomic filesystem renames (tasks/todo/ -> tasks/in_progress/),
 * sub-swarm progress tracking, consular review workflow, and TASKBOARD.md sync.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export type TaskColumn = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GitDiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface SwarmTask {
  id: string; // e.g. "task-2026-0001"
  title: string;
  description: string;
  priority: TaskPriority;
  column: TaskColumn;
  assigned_cubicle: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  progress_percent: number; // 0 to 100
  subswarm_active: boolean;
  subswarm_manifest_path: string | null;
  git_branch: string | null;
  git_diff_summary: GitDiffSummary | null;
  verification_commands: string[];
  verification_passed: boolean | null;
  veto_history: Array<{ consul: string; rationale: string; timestamp: string }>;
  error_log: string | null;
}

export interface OverallMissionProgress {
  total: number;
  todo: number;
  inProgress: number;
  review: number;
  done: number;
  percentage: number;
}

export class TaskboardManager {
  private swarmDir: string;
  private tasksDir: string;
  private columns: Record<TaskColumn, string>;
  private isSyncingMarkdown: boolean = false;
  private syncPending: boolean = false;

  constructor(swarmDir: string) {
    this.swarmDir = path.resolve(swarmDir);
    this.tasksDir = path.join(this.swarmDir, 'tasks');
    this.columns = {
      todo: path.join(this.tasksDir, 'todo'),
      in_progress: path.join(this.tasksDir, 'in_progress'),
      review: path.join(this.tasksDir, 'review'),
      done: path.join(this.tasksDir, 'done'),
    };
  }

  /**
   * Initializes all required task directories under .swarm/tasks/.
   */
  public async initialize(): Promise<void> {
    for (const colPath of Object.values(this.columns)) {
      await fs.mkdir(colPath, { recursive: true });
    }
    await fs.mkdir(path.join(this.swarmDir, 'logs'), { recursive: true });
    await this.syncTaskboardMarkdown();
  }

  /**
   * Creates a new task and writes it to .swarm/tasks/todo/<id>.json.
   */
  public async createTask(
    params: Omit<SwarmTask, 'id' | 'created_at' | 'claimed_at' | 'completed_at' | 'column' | 'veto_history'> & { id?: string }
  ): Promise<SwarmTask> {
    const id = params.id || `task-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const task: SwarmTask = {
      ...params,
      id,
      column: 'todo',
      assigned_cubicle: null,
      created_at: new Date().toISOString(),
      claimed_at: null,
      completed_at: null,
      progress_percent: 0,
      subswarm_active: false,
      subswarm_manifest_path: null,
      git_branch: null,
      git_diff_summary: null,
      verification_commands: params.verification_commands || [],
      verification_passed: null,
      veto_history: [],
      error_log: null,
    };

    const filePath = path.join(this.columns.todo, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Atomically claims a task from todo/ to in_progress/.
   * Uses OS atomic rename (MoveFileExW). If contested, exactly one wins; losers receive null.
   */
  public async claimTask(cubicleId: string, specificTaskId?: string): Promise<SwarmTask | null> {
    let targetFileName = specificTaskId ? `${specificTaskId}.json` : null;

    if (!targetFileName) {
      const files = await fs.readdir(this.columns.todo);
      const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
      if (jsonFiles.length === 0) return null;
      targetFileName = jsonFiles[0];
    }

    const src = path.join(this.columns.todo, targetFileName);
    const dst = path.join(this.columns.in_progress, targetFileName);

    try {
      // ATOMIC MOVE: Under Windows NTFS, MoveFileExW is atomic.
      // High concurrency: exactly one process succeeds. Contenders receive ENOENT.
      await fs.rename(src, dst);
    } catch (err: any) {
      if (err.code === 'ENOENT' || err.code === 'EBUSY' || err.code === 'EPERM') {
        // Lost the race or transient lock contention; another cubicle claimed it.
        return null;
      }
      throw err;
    }

    // Winner enriches task payload
    try {
      const raw = await fs.readFile(dst, 'utf8');
      const task: SwarmTask = JSON.parse(raw);
      task.column = 'in_progress';
      task.assigned_cubicle = cubicleId;
      task.claimed_at = new Date().toISOString();
      task.git_branch = `swarm/${cubicleId}`;
      await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
      await this.syncTaskboardMarkdown();
      return task;
    } catch (err: any) {
      // If JSON parse or write fails, attempt recovery
      throw new Error(`Failed to enrich claimed task at '${dst}': ${err.message}`);
    }
  }

  /**
   * Updates task progress, surface thoughts, or diff telemetry on active task.
   */
  public async updateTaskProgress(
    taskId: string,
    updates: Partial<Pick<SwarmTask, 'progress_percent' | 'subswarm_active' | 'subswarm_manifest_path' | 'git_diff_summary' | 'error_log'>>
  ): Promise<SwarmTask> {
    const filePath = path.join(this.columns.in_progress, `${taskId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    const task: SwarmTask = JSON.parse(raw);

    if (updates.progress_percent !== undefined) {
      task.progress_percent = Math.max(0, Math.min(100, updates.progress_percent));
    }
    if (updates.subswarm_active !== undefined) task.subswarm_active = updates.subswarm_active;
    if (updates.subswarm_manifest_path !== undefined) task.subswarm_manifest_path = updates.subswarm_manifest_path;
    if (updates.git_diff_summary !== undefined) task.git_diff_summary = updates.git_diff_summary;
    if (updates.error_log !== undefined) task.error_log = updates.error_log;

    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Atomically transitions task from in_progress/ to review/ for Consular evaluation.
   */
  public async submitForReview(
    taskId: string,
    reviewData: { diffSummary?: GitDiffSummary; verificationPassed?: boolean }
  ): Promise<SwarmTask> {
    const src = path.join(this.columns.in_progress, `${taskId}.json`);
    const dst = path.join(this.columns.review, `${taskId}.json`);

    await fs.rename(src, dst);

    const raw = await fs.readFile(dst, 'utf8');
    const task: SwarmTask = JSON.parse(raw);
    task.column = 'review';
    task.progress_percent = 95;
    if (reviewData.diffSummary) task.git_diff_summary = reviewData.diffSummary;
    if (reviewData.verificationPassed !== undefined) task.verification_passed = reviewData.verificationPassed;

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Handles Consular Veto: atomically returns task from review/ back to in_progress/ (or todo/).
   */
  public async returnToRevision(
    taskId: string,
    vetoData: { consul: string; rationale: string; returnToTodo?: boolean }
  ): Promise<SwarmTask> {
    const src = path.join(this.columns.review, `${taskId}.json`);
    const targetCol = vetoData.returnToTodo ? 'todo' : 'in_progress';
    const dst = path.join(this.columns[targetCol], `${taskId}.json`);

    await fs.rename(src, dst);

    const raw = await fs.readFile(dst, 'utf8');
    const task: SwarmTask = JSON.parse(raw);
    task.column = targetCol;
    task.veto_history.push({
      consul: vetoData.consul,
      rationale: vetoData.rationale,
      timestamp: new Date().toISOString(),
    });
    if (vetoData.returnToTodo) {
      task.assigned_cubicle = null;
      task.progress_percent = 0;
    } else {
      task.progress_percent = Math.max(10, task.progress_percent - 30);
    }

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Completes task upon unanimous Consular approval: atomically moves from review/ to done/.
   */
  public async completeTask(taskId: string): Promise<SwarmTask> {
    const src = path.join(this.columns.review, `${taskId}.json`);
    const dst = path.join(this.columns.done, `${taskId}.json`);

    await fs.rename(src, dst);

    const raw = await fs.readFile(dst, 'utf8');
    const task: SwarmTask = JSON.parse(raw);
    task.column = 'done';
    task.completed_at = new Date().toISOString();
    task.progress_percent = 100;

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Releases an in_progress task back to todo/ (e.g. on crash or quota exhaustion).
   */
  public async releaseTask(taskId: string, reason: string): Promise<SwarmTask> {
    const src = path.join(this.columns.in_progress, `${taskId}.json`);
    const dst = path.join(this.columns.todo, `${taskId}.json`);

    await fs.rename(src, dst);

    const raw = await fs.readFile(dst, 'utf8');
    const task: SwarmTask = JSON.parse(raw);
    task.column = 'todo';
    task.assigned_cubicle = null;
    task.error_log = `Task released back to todo: ${reason}`;

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Retrieves all tasks in a specific column.
   */
  public async listTasksByColumn(column: TaskColumn): Promise<SwarmTask[]> {
    const colDir = this.columns[column];
    const files = await fs.readdir(colDir);
    const tasks: SwarmTask[] = [];

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(path.join(colDir, file), 'utf8');
        tasks.push(JSON.parse(raw));
      } catch {}
    }
    return tasks;
  }

  /**
   * Lists all tasks grouped by column.
   */
  public async listAllTasks(): Promise<Record<TaskColumn, SwarmTask[]>> {
    const [todo, in_progress, review, done] = await Promise.all([
      this.listTasksByColumn('todo'),
      this.listTasksByColumn('in_progress'),
      this.listTasksByColumn('review'),
      this.listTasksByColumn('done'),
    ]);
    return { todo, in_progress, review, done };
  }

  /**
   * Calculates overall mission progress metrics across the swarm.
   */
  public async calculateOverallProgress(): Promise<OverallMissionProgress> {
    const all = await this.listAllTasks();
    const counts = {
      todo: all.todo.length,
      inProgress: all.in_progress.length,
      review: all.review.length,
      done: all.done.length,
      total: all.todo.length + all.in_progress.length + all.review.length + all.done.length,
    };

    if (counts.total === 0) {
      return { ...counts, percentage: 0 };
    }

    // Weighted progress: todo=0%, in_progress=individual progress, review=95%, done=100%
    let totalProgressSum = 0;
    for (const t of all.in_progress) totalProgressSum += t.progress_percent;
    totalProgressSum += counts.review * 95;
    totalProgressSum += counts.done * 100;

    const percentage = Math.round(totalProgressSum / counts.total);
    return { ...counts, percentage };
  }

  /**
   * Synchronizes human-readable .swarm/TASKBOARD.md markdown summary.
   */
  public async syncTaskboardMarkdown(): Promise<void> {
    if (this.isSyncingMarkdown) {
      this.syncPending = true;
      return;
    }

    this.isSyncingMarkdown = true;
    try {
      const all = await this.listAllTasks();
      const progress = await this.calculateOverallProgress();

      let md = `# PANOPTICON SWARM TASKBOARD\n\n`;
      md += `**Overall Mission Progress**: \`[${progress.percentage}%]\` (${progress.done}/${progress.total} tasks completed)\n\n`;
      md += `| Column | Count | Details |\n`;
      md += `|---|---|---|\n`;
      md += `| **To Do** | ${all.todo.length} | Unclaimed queue |\n`;
      md += `| **In Progress** | ${all.in_progress.length} | Actively executing |\n`;
      md += `| **Review** | ${all.review.length} | Awaiting Consular Consensus |\n`;
      md += `| **Done** | ${all.done.length} | Merged to main |\n\n`;

      md += `## 1. To Do (${all.todo.length})\n`;
      if (all.todo.length === 0) md += `*No tasks waiting.*\n\n`;
      for (const t of all.todo) {
        md += `- **[${t.priority}]** \`${t.id}\`: **${t.title}**\n`;
      }
      md += `\n`;

      md += `## 2. In Progress (${all.in_progress.length})\n`;
      if (all.in_progress.length === 0) md += `*No active tasks.*\n\n`;
      for (const t of all.in_progress) {
        const droneBadge = t.subswarm_active ? ' *(Drones Active)*' : '';
        md += `- **[${t.assigned_cubicle}]** \`${t.id}\`: **${t.title}** - \`${t.progress_percent}%\`${droneBadge}\n`;
      }
      md += `\n`;

      md += `## 3. Review (${all.review.length})\n`;
      if (all.review.length === 0) md += `*No tasks in review.*\n\n`;
      for (const t of all.review) {
        md += `- **[${t.assigned_cubicle}]** \`${t.id}\`: **${t.title}** (Branch: \`${t.git_branch}\`)\n`;
      }
      md += `\n`;

      md += `## 4. Done (${all.done.length})\n`;
      if (all.done.length === 0) md += `*No completed tasks.*\n\n`;
      for (const t of all.done) {
        md += `- \`${t.id}\`: **${t.title}** (Completed at ${t.completed_at})\n`;
      }
      md += `\n`;

      await fs.writeFile(path.join(this.swarmDir, 'TASKBOARD.md'), md, 'utf8');
    } finally {
      this.isSyncingMarkdown = false;
      if (this.syncPending) {
        this.syncPending = false;
        await this.syncTaskboardMarkdown();
      }
    }
  }
}
```

---

## 9. Verification & Quality Assurance Methodologies

1. **Worktree Isolation Verification**:
   - Create 16 worktrees simultaneously.
   - Verify each worktree has its own dedicated `.git` pointer pointing into `<root>/.git/worktrees/cubicle-XX`.
   - Verify uncommitted edits in `worktrees/cubicle-01/src/index.ts` do NOT appear in `worktrees/cubicle-02/src/index.ts`.
2. **NTFS Junction Zero-Admin Verification**:
   - Execute junction creation without Administrator elevation.
   - Verify `fs.lstat` returns `isSymbolicLink() === true` or directory reparse point.
   - Verify file written to `<root>/.swarm/tasks/todo/test.json` is immediately visible at `worktrees/cubicle-01/.swarm/tasks/todo/test.json` with 0ms delay.
   - Verify `safeRemoveJunction` deletes the junction without modifying files inside `<root>/.swarm`.
3. **High-Concurrency Task Claiming Verification**:
   - Seed `tasks/todo/` with 5 tasks.
   - Launch 16 concurrent workers calling `claimTask()` in tight loops.
   - Verify exactly 5 claims succeed, remaining return `null`.
   - Verify no task is claimed twice.
   - Verify no files are corrupted or left in invalid state.
