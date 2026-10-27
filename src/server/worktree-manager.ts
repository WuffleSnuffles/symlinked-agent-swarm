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
  nodeModulesJunctionActive?: boolean;
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

      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on('data', (chunk) => {
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
    if (!/^cubicle-\d{2}$/.test(cubicleId)) throw new Error('Invalid cubicle ID');
    await this.validateRepository();
    await fs.mkdir(this.worktreesBaseDir, { recursive: true });
    await fs.mkdir(this.swarmDir, { recursive: true });
    await fs.mkdir(this.agentsDir, { recursive: true });

    const worktreePath = path.join(this.worktreesBaseDir, cubicleId);
    const branchName = await this.ensureBranch(cubicleId);

    // Reconcile existing worktree list
    const activeWorktrees = await this.listWorktrees();
    const existing = activeWorktrees.find((w) => path.resolve(w.worktreePath) === path.resolve(worktreePath));
    if (existing && existing.branch !== branchName) throw new Error('Cubicle worktree is on an unexpected branch');

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
      await this.execGit(['worktree', 'add', worktreePath, branchName]);
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
      nodeModulesJunctionActive: junctions.nodeModulesActive,
    };
  }

  /**
   * Links .swarm and .agents into the worktree using Windows NTFS Junctions (or POSIX symlinks).
   */
  public async linkSharedDirectories(worktreePath: string): Promise<{ swarmActive: boolean; agentsActive: boolean; nodeModulesActive: boolean }> {
    const targetSwarm = path.resolve(this.swarmDir);
    const linkSwarm = path.join(worktreePath, '.swarm');

    const targetAgents = path.resolve(this.agentsDir);
    const linkAgents = path.join(worktreePath, '.agents');

    await this.createJunctionOrSymlink(targetSwarm, linkSwarm);
    await this.createJunctionOrSymlink(targetAgents, linkAgents);
    const linkModules = path.join(worktreePath, 'node_modules');
    await this.createJunctionOrSymlink(path.join(this.repoRoot, 'node_modules'), linkModules);

    const swarmActive = await this.verifyJunction(linkSwarm);
    const agentsActive = await this.verifyJunction(linkAgents);

    return { swarmActive, agentsActive, nodeModulesActive: await this.verifyJunction(linkModules) };
  }

  /**
   * Creates a zero-privilege NTFS Directory Junction on Windows, or 'dir' symlink on POSIX.
   */
  public async createJunctionOrSymlink(targetDir: string, linkPath: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
    const backup = `${linkPath}.worktree-local`;

    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink()) {
        if (path.resolve(await fs.realpath(linkPath)) === path.resolve(targetDir)) return;
        await this.safeRemoveJunction(linkPath);
      } else if (stat.isDirectory()) {
        // Git may track shared directories. Preserve the checkout before replacing it.
        try {
          await fs.lstat(backup);
          await fs.rm(linkPath, { recursive: true, force: true });
        } catch (error: any) {
          if (error.code !== 'ENOENT') throw error;
          await fs.rename(linkPath, backup);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    try {
      await fs.symlink(path.resolve(targetDir), path.resolve(linkPath), linkType);
    } catch (err: any) {
      // Virtual filesystems (e.g., Google Drive H:\) do not support NTFS junctions and throw EISDIR / EPERM / ENOTSUP / EINVAL.
      if (err && ['EISDIR', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(err.code)) {
        try {
          const bStat = await fs.lstat(backup);
          if (bStat.isDirectory()) {
            await fs.rename(backup, linkPath);
            return;
          }
        } catch {}
        await fs.mkdir(linkPath, { recursive: true });
        return;
      }
      throw err;
    }
  }

  /**
   * Verifies that a path exists and is an active junction or symbolic link.
   */
  public async verifyJunction(junctionPath: string): Promise<boolean> {
    try {
      const stat = await fs.lstat(junctionPath);
      return stat.isSymbolicLink() && (await fs.stat(junctionPath)).isDirectory();
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
      if (stat.isSymbolicLink()) {
        // On Windows NTFS, calling rmdir deletes ONLY the reparse link itself.
        // It never deletes or modifies the contents of the target folder!
        await fs.unlink(junctionPath);
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
    await this.safeRemoveJunction(path.join(worktreePath, 'node_modules'));

    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(worktreePath);

    try {
      await this.execGit(args);
    } catch {
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
    let stdout = '';
    try {
      const res = await this.execGit(['worktree', 'list', '--porcelain']);
      stdout = res.stdout;
    } catch {
      return [];
    }

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
              swarmJunctionActive: false,
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
