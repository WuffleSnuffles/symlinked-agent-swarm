/**
 * src/server/self-update-manager.ts
 *
 * Windows Safe In-Place Atomic Hot-Swap Self-Update Engine.
 * Implements 7-stage atomic swap (.exe -> .old.exe -> .new.exe -> .exe),
 * PE binary header validation, detached process relaunch, stability rollback guard,
 * and startup stale executable cleanup.
 */

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, ChildProcess } from 'node:child_process';

export interface PeValidationResult {
  valid: boolean;
  fileSize: number;
  sha256?: string;
  reason?: string;
}

export interface SwapResult {
  success: boolean;
  rootExePath: string;
  oldExePath: string;
  version_after: string;
  checkpoint_id?: string;
}

export class SelfUpdateManager {
  private projectRoot: string;
  private rootExeName: string = 'SymlinkedAgentSwarm.exe';
  private oldExeName: string = 'SymlinkedAgentSwarm.old.exe';
  private newExeName: string = 'SymlinkedAgentSwarm.new.exe';

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
  }

  public getRootExePath(): string {
    return path.join(this.projectRoot, this.rootExeName);
  }

  public getOldExePath(): string {
    return path.join(this.projectRoot, this.oldExeName);
  }

  public getNewExePath(): string {
    return path.join(this.projectRoot, this.newExeName);
  }

  /**
   * Validates PE binary integrity: DOS header 'MZ', PE offset, and 'PE\0\0' signature.
   */
  public async validateBinary(targetPath?: string): Promise<PeValidationResult> {
    const binaryPath = targetPath || path.join(this.projectRoot, this.newExeName);
    if (!existsSync(binaryPath)) {
      return { valid: false, fileSize: 0, reason: `Binary not found at ${binaryPath}` };
    }

    const stat = await fs.stat(binaryPath);
    if (stat.size < 16) {
      return { valid: false, fileSize: stat.size, reason: `Binary file too small (${stat.size} bytes)` };
    }

    // Read header bytes
    const handle = await fs.open(binaryPath, 'r');
    const headerBuf = Buffer.alloc(Math.min(stat.size, 1024));
    await handle.read(headerBuf, 0, headerBuf.length, 0);
    await handle.close();

    // Compute SHA-256
    const fileContent = await fs.readFile(binaryPath);
    const sha256 = crypto.createHash('sha256').update(fileContent).digest('hex');

    // Real Win32 PE validation
    // 1. DOS header signature (0x4D, 0x5A) -> "MZ"
    if (headerBuf[0] !== 0x4d || headerBuf[1] !== 0x5a) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'Invalid DOS signature: missing MZ' };
    }

    // 2. PE header offset at 0x3C
    if (stat.size < 0x40) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'File truncated before PE pointer' };
    }
    const peOffset = headerBuf.readUInt32LE(0x3c);
    if (peOffset < 0x40 || peOffset + 4 > stat.size) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'PE header pointer out of bounds' };
    }

    // Read PE signature at peOffset
    const peSigHandle = await fs.open(binaryPath, 'r');
    const peSigBuf = Buffer.alloc(4);
    await peSigHandle.read(peSigBuf, 0, 4, peOffset);
    await peSigHandle.close();

    // 3. 'PE\0\0' signature (0x50, 0x45, 0x00, 0x00)
    if (peSigBuf[0] !== 0x50 || peSigBuf[1] !== 0x45 || peSigBuf[2] !== 0x00 || peSigBuf[3] !== 0x00) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'Invalid PE signature: missing PE\\0\\0' };
    }

    return { valid: true, fileSize: stat.size, sha256 };
  }

  /**
   * Executes Windows safe in-place atomic binary swap.
   * 1. Validates staged new binary
   * 2. Evicts old backup
   * 3. Renames running .exe to .old.exe
   * 4. Atomically moves .new.exe to .exe
   */
  public async executeAtomicSwap(versionBefore: string): Promise<SwapResult> {
    const rootExe = path.join(this.projectRoot, this.rootExeName);
    const oldExe = path.join(this.projectRoot, this.oldExeName);
    const newExe = path.join(this.projectRoot, this.newExeName);

    // 1. Validate staged binary
    const validation = await this.validateBinary(newExe);
    if (!validation.valid) {
      throw new Error(`Staged binary validation failed: ${validation.reason}`);
    }

    // 2. Evict stale .old.exe
    let resolvedOldExe = oldExe;
    if (existsSync(oldExe)) {
      try {
        await fs.unlink(oldExe);
      } catch {
        resolvedOldExe = path.join(
          this.projectRoot,
          `SymlinkedAgentSwarm.old.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.exe`
        );
      }
    }

    // 3. Rename running binary to .old.exe
    if (existsSync(rootExe)) {
      try {
        await fs.rename(rootExe, resolvedOldExe);
      } catch {
        const fallbackOld = path.join(
          this.projectRoot,
          `SymlinkedAgentSwarm.old.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.exe`
        );
        await fs.rename(rootExe, fallbackOld);
        resolvedOldExe = fallbackOld;
      }
    }

    // 4. Atomically promote .new.exe -> .exe
    try {
      await fs.rename(newExe, rootExe);
    } catch (err: any) {
      // Revert if promotion fails
      if (existsSync(resolvedOldExe) && !existsSync(rootExe)) {
        await fs.rename(resolvedOldExe, rootExe).catch(() => {});
      }
      throw new Error(`Failed to promote new binary to ${this.rootExeName}: ${err.message}`);
    }

    // Calculate incremented version
    const parts = versionBefore.split('.').map(Number);
    parts[parts.length - 1] = (parts[parts.length - 1] || 0) + 1;
    const versionAfter = parts.join('.');

    return {
      success: true,
      rootExePath: rootExe,
      oldExePath: resolvedOldExe,
      version_after: versionAfter,
    };
  }

  /**
   * Spawns new process detached and unreferenced.
   */
  public relaunchDetached(args: string[] = ['--relaunch']): ChildProcess {
    const rootExe = path.join(this.projectRoot, this.rootExeName);
    const binToSpawn = existsSync(rootExe) ? rootExe : process.execPath;
    const spawnArgs = existsSync(rootExe) ? args : ['--version'];
    const child = spawn(binToSpawn, spawnArgs, {
      detached: true,
      stdio: 'inherit',
      cwd: this.projectRoot,
      windowsHide: false,
      env: {
        ...process.env,
        SWARM_SELF_UPDATED: '1',
        SWARM_PARENT_PID: String(process.pid),
      },
    });
    child.on('error', (err: Error) => {
      console.error(`[SelfUpdateManager] Detached child process spawn error (${binToSpawn}):`, err);
    });
    child.unref();
    return child;
  }

  /**
   * Rollback swap if new binary crashes or fails stability gate.
   */
  public async rollbackSwap(oldExePath: string): Promise<void> {
    if (!existsSync(oldExePath)) {
      throw new Error(`Rollback aborted: Backup binary not found at ${oldExePath}`);
    }

    const rootExe = path.join(this.projectRoot, this.rootExeName);
    const failedExe = path.join(this.projectRoot, `SymlinkedAgentSwarm.failed.${Date.now()}.exe`);

    if (existsSync(rootExe)) {
      try {
        await fs.rename(rootExe, failedExe);
      } catch (err: any) {
        throw new Error(`Failed to isolate active executable before rollback: ${err.message}`);
      }
    }

    try {
      await fs.rename(oldExePath, rootExe);
    } catch (err: any) {
      if (existsSync(failedExe) && !existsSync(rootExe)) {
        await fs.rename(failedExe, rootExe).catch(() => {});
      }
      throw new Error(`Rollback failed to restore ${oldExePath} to ${rootExe}: ${err.message}`);
    }
  }

  /**
   * Startup cleanup routine to remove stale .old.exe or .failed.exe files.
   */
  public async cleanupStaleExecutables(): Promise<string[]> {
    const files = await fs.readdir(this.projectRoot).catch(() => []);
    const removed: string[] = [];

    for (const file of files) {
      if (
        (file.startsWith('SymlinkedAgentSwarm.old') && file.endsWith('.exe')) ||
        (file.startsWith('SymlinkedAgentSwarm.failed') && file.endsWith('.exe'))
      ) {
        const fullPath = path.join(this.projectRoot, file);
        try {
          await fs.unlink(fullPath);
          removed.push(file);
        } catch {
          // Locked by active OS handles; skip silently
        }
      }
    }
    return removed;
  }
}
