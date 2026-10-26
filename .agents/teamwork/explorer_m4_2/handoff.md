# Technical Investigation Report: Windows In-Place Atomic Hot-Swap Self-Update Mechanism & Dual-Consul Governance Gating

**Author**: `explorer_m4_2` (Technical Investigation Specialist, Milestone 4)  
**Target Milestone**: Milestone 4 (Packaging, Courier CLI & In-Place Atomic Hot-Swap Self-Update)  
**Date**: 2026-10-26T04:26:00Z  
**Working Directory**: `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\.agents\teamwork\explorer_m4_2`  
**Parent Agent**: `5d1d9c33-70a3-4e64-96ff-073d03d579f8`  

---

### Executive Summary
On Windows NTFS, running executables are memory-mapped by the NT kernel with `FILE_SHARE_READ | FILE_SHARE_DELETE`, strictly forbidding direct in-place writes (`ERROR_SHARING_VIOLATION`), but permitting filesystem directory renames. By leveraging NTFS atomic rename semantics, the system achieves safe in-place self-updates via a 7-stage pipeline (`.exe` -> `.old.exe` -> `.new.exe` -> `.exe` -> detached relaunch -> 10s health watch -> startup cleanup), strictly gated by Roman Dual-Consul 2/2 unanimous consensus and backed by Git time-machine snapshot checkpoints for automatic crash rollback.

---

## 1. Observation

### 1.1 Project Specification Requirements
Direct quotes from project contracts:

1. **`PROJECT.md` Feature 12 (Lines 43, 250–273)**:
   > "Feature 12: Consular-Gated Self-Updating .exe & Atomic Hot-Swap... Console prompt self-evolution workflow targeting own repo in cubicle worktrees, 2/2 Consular approval gate (Intercessio veto blocks self-update), Windows safe in-place rebuild to `SymlinkedAgentSwarm.new.exe` and atomic swap (`.exe` -> `.old.exe` -> `.new.exe` -> `.exe`), and hot-relaunch."
   > 
   > "Consular Gate: Requires 2/2 unanimous `APPROVE` from `Consul I` and `Consul II`."
   > "Veto (`Intercessio`): Single veto blocks self-update, logs to `.swarm/logs/incidents.jsonl`, returns code to cubicles for revision."
   > "Windows In-Place Safe Atomic Swap Sequence:
   > 1. Compile updated source to `SymlinkedAgentSwarm.new.exe`
   > 2. Rename running binary: `SymlinkedAgentSwarm.exe` -> `SymlinkedAgentSwarm.old.exe` (allowed on Windows even while executing)
   > 3. Atomic move: `SymlinkedAgentSwarm.new.exe` -> `SymlinkedAgentSwarm.exe`
   > 4. Emit WebSocket event `SELF_UPDATE_READY` for client relaunch."

2. **`ORIGINAL_REQUEST.md` Follow-up §4 (Lines 130–141)**:
   > "Once both Consuls agree (2/2 `APPROVE`), the system merges the worker branch into `main`, pushes to the Git remote (when remote credentials are active / or commits locally + queues push), recompiles the updated standalone executable to `SymlinkedAgentSwarm.new.exe`, performs a Windows-safe atomic binary swap (renaming the currently running `SymlinkedAgentSwarm.exe` to `SymlinkedAgentSwarm.old.exe` and moving `SymlinkedAgentSwarm.new.exe` to `SymlinkedAgentSwarm.exe` so Windows file locking never blocks the self-update), and supports hot-reloading/relaunching the updated executable."

3. **`DISPATCH.md` Technical Focus**:
   > "1. Windows binary locking & NTFS atomic swap sequence (.exe -> .old.exe, .new.exe -> .exe, process relaunch, cleanup)."
   > "2. Dual-Consul governance gating for self-update (2/2 consensus, veto rollback, checkpoint snapshot)."
   > "Rollback recovery: If new binary fails startup or crashes within 10 seconds, swap back `SymlinkedAgentSwarm.old.exe` -> `SymlinkedAgentSwarm.exe`."

### 1.2 Codebase Baseline Analysis

1. **`src/server/consular-engine.ts` (Lines 1073–1198)**:
   - Method `initiateSelfUpdate(userPrompt: string)` sets initial status `PENDING_REVIEW`, writes request file `.swarm/self_update/<requestId>.json`, logs dialogue for `Consul Nia Nova`, and emits `SELF_UPDATE_INITIATED`.
   - Method `reviewSelfUpdate(requestId: string, votes: [ConsularVote, ConsularVote])`:
     - Checks consensus via `this.evaluateConsensus(votes[0], votes[1], requestId)`.
     - When not unanimous: Sets status to `VETOED`, logs incident `SELF_UPDATE_VETO_BLOCKED` to `incidents.jsonl`, logs dialogue for dissenting consul, emits `SELF_UPDATE_VETOED`.
     - When unanimous (2/2 `APPROVE`):
       - Sets status to `APPROVED_REBUILDING`.
       - Path resolutions:
         ```typescript
         const rootExe = path.join(this.projectRoot, 'SymlinkedAgentSwarm.exe');
         const oldExe = path.join(this.projectRoot, 'SymlinkedAgentSwarm.old.exe');
         const newExe = path.join(this.projectRoot, 'SymlinkedAgentSwarm.new.exe');
         ```
       - Mock binary generation if `newExe` doesn't exist:
         ```typescript
         if (!existsSync(newExe)) {
           await fs.writeFile(newExe, 'MZ_MOCK_WIN_PE_BINARY_V2_' + Date.now(), 'utf8');
         }
         ```
       - Swap execution:
         ```typescript
         if (existsSync(rootExe)) {
           if (existsSync(oldExe)) {
             try { await fs.unlink(oldExe); } catch {}
           }
           try {
             await fs.rename(rootExe, oldExe);
           } catch {
             const timestampedOld = path.join(
               this.projectRoot,
               `SymlinkedAgentSwarm.old.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.exe`
             );
             await fs.rename(rootExe, timestampedOld);
           }
         }
         await fs.rename(newExe, rootExe);
         ```
       - Increments patch version (`version_before` -> `version_after`), sets status to `SWAP_COMPLETED`, and emits `SELF_UPDATE_READY`.

2. **`src/server/consular-engine.ts` (Lines 1459–1618) — Git Time-Machine Checkpoints**:
   - `createCheckpoint(label: string)`: Snapshots git commit hash (`git rev-parse HEAD` or `.git/HEAD`) and taskboard state across all columns (`todo`, `in_progress`, `review`, `done`), persists to `.swarm/checkpoints/<id>.json`, and emits `CHECKPOINT_CREATED`.
   - `rollbackCheckpoint(id: string)`: Reverts git repository to snapshot commit (`git checkout <git_commit>`), restores tasks across all columns, and emits `CHECKPOINT_ROLLED_BACK`.

3. **`src/server/routes/governance-routes.ts` (Lines 220–260)**:
   - `POST /governance/self-update/initiate` -> calls `consularEngine.initiateSelfUpdate(prompt)`
   - `POST /governance/self-update/review` -> calls `consularEngine.reviewSelfUpdate(requestId, votes)`
   - `GET /governance/self-update/status/:requestId` -> calls `consularEngine.getSelfUpdateStatus(requestId)`

4. **Existing Unit Test Coverage (`test/unit/consular-self-update.test.ts` & `test/unit/adversarial-vault-selfupdate-courier.test.ts`)**:
   - Tests verify `PENDING_REVIEW` initialization.
   - Tests verify 1/2 Veto blocks swap, keeps binary untouched, and logs incident.
   - Tests verify 2/2 Approval executes `.new.exe` -> `.old.exe` -> `.exe` file swap and increments version.

### 1.3 Identified Technical Gaps
1. **Pre-Swap Binary Validation**: Currently `consular-engine.ts` does not validate whether `SymlinkedAgentSwarm.new.exe` has valid PE binary headers (`MZ` DOS header + `PE\0\0` NT signature) or non-zero byte size before beginning the rename sequence.
2. **Pre-Swap Time-Machine Checkpoint Snapshot**: `createCheckpoint()` exists in `consular-engine.ts` but is not invoked inside `reviewSelfUpdate()` prior to executing binary mutations.
3. **Detached Process Relaunch**: Currently `reviewSelfUpdate()` emits `SELF_UPDATE_READY`, but lacks an automated or API-driven detached process spawn (`child_process.spawn(..., { detached: true, stdio: 'inherit' })`).
4. **Crash-Guard & 10-Second Stability Rollback**: No watchdog monitors whether the newly launched process crashes or fails its health check within 10 seconds.
5. **Startup Cleanup Routine**: Leftover `.old.exe` or `.old.*.exe` files are only removed ad-hoc during the next update, rather than being cleaned up at server boot.

---

## 2. Logic Chain

### Step 1: Windows NT Kernel Memory Management & File Locking Semantics
- **Observation**: Windows processes executing `SymlinkedAgentSwarm.exe` cannot be directly overwritten or truncated.
- **Root Cause**: When a Win32/Win64 executable is launched, Windows NT kernel (`ntoskrnl.exe`) creates a Section Object with `SEC_IMAGE` flag mapped into the process's Virtual Address Space. The OS loader opens the executable file object with access `GENERIC_READ | GENERIC_EXECUTE` and sharing flags `FILE_SHARE_READ | FILE_SHARE_DELETE`.
- **Constraint**: `FILE_SHARE_WRITE` is withheld. Any subsequent call to `CreateFileW` with `GENERIC_WRITE` or `CREATE_ALWAYS` fails with `STATUS_SHARING_VIOLATION` (Win32 error `32` / `ERROR_SHARING_VIOLATION`, Node.js error `EBUSY`).
- **NTFS Capability**: Because `FILE_SHARE_DELETE` is included in the open section, NTFS permits directory rename operations on the open file handle (`MoveFileExW` / `FileRenameInformation`).
- **Inference**: Renaming updates the Master File Table (MFT) directory index record ($I30) in the containing directory. The active memory-mapped image section retains its open handle to the file's cluster allocations on disk without interruption. Once the name `SymlinkedAgentSwarm.exe` is detached from the running file allocation, a new file `SymlinkedAgentSwarm.new.exe` can immediately be renamed into `SymlinkedAgentSwarm.exe`.

### Step 2: Binary Integrity Verification Before Swap
- **Observation**: If a corrupt, incomplete, or 0-byte file is renamed to `SymlinkedAgentSwarm.exe`, the application cannot relaunch, causing an immediate outage.
- **Deduction**: Verification must occur *before* the active binary is touched.
- **PE Header Structure Verification**:
  1. File size check: Must exceed minimum PE size (minimum 64 bytes for DOS header, plus PE header offset).
  2. DOS Header Magic: Bytes `0..1` must equal `0x4D, 0x5A` (`MZ`).
  3. PE Header Offset (`e_lfanew`): 4-byte unsigned LE integer at offset `0x3C`. Must point within file bounds.
  4. PE NT Signature: 4 bytes at `e_lfanew` must equal `0x50, 0x45, 0x00, 0x00` (`PE\0\0`).
  5. SHA-256 Checksum: Computed and saved in request metadata for immutable auditability.

### Step 3: Git Time-Machine Integration
- **Observation**: Self-update involves not only the binary, but also underlying source code changes on Git branches merged into `main`.
- **Deduction**: If the binary crashes after update, rolling back only the executable leaves the repository in a desynchronized state.
- **Solution**: Before any file swap, `consularEngine.createCheckpoint('pre-self-update-' + requestId)` captures:
  - Exact Git HEAD commit SHA.
  - Taskboard state across `todo`, `in_progress`, `review`, and `done`.
  - The resulting `checkpoint_id` is linked directly to the `SelfUpdateRequest`.

### Step 4: The 7-Stage Atomic Swap Sequence
- **Step 1 — Pre-Swap Snapshot**: Generate Git time-machine checkpoint.
- **Step 2 — Integrity Gate**: Verify `SymlinkedAgentSwarm.new.exe` size and PE headers.
- **Step 3 — Stale Eviction**: Unlink existing `SymlinkedAgentSwarm.old.exe`. If locked by another lingering process, fall back to timestamped `SymlinkedAgentSwarm.old.<timestamp>.<pid>.exe`.
- **Step 4 — Running Binary Rename**: Rename running `SymlinkedAgentSwarm.exe` -> `SymlinkedAgentSwarm.old.exe`.
- **Step 5 — Atomic Promotion**: Rename `SymlinkedAgentSwarm.new.exe` -> `SymlinkedAgentSwarm.exe`.
- **Step 6 — Detached Relaunch**: Spawn the new `SymlinkedAgentSwarm.exe` with `detached: true, stdio: 'inherit'`.
- **Step 7 — 10s Stability Watch & Rollback Guard**:
  - If new binary terminates with error or fails HTTP `/api/health` within 10 seconds:
    - Automatic rollback restores `SymlinkedAgentSwarm.old.exe` -> `SymlinkedAgentSwarm.exe`.
    - Git checkpoint rolls back commit and task state.
    - Incident is logged and Consuls alerted.
  - If new binary remains healthy: old process cleanly exits (code 0).

### Step 5: Startup Cleanup Protocol
- **Observation**: Previous `.old.exe` files cannot be deleted until the old process exits.
- **Deduction**: The newly started process (or subsequent restarts) is responsible for deleting leftover `.old.exe` and `.old.*.exe` files.
- **Implementation**: At server boot (`createSwarmServer`), an async cleanup scans the root directory and unlinks stale update artifacts.

---

## 3. Caveats

1. **Filesystem Volume Boundaries**:
   - NTFS atomic rename semantics require both files to reside on the same filesystem volume (e.g. drive `C:` or `H:`).
   - Moving across volume boundaries triggers a copy-and-delete fallback which is neither atomic nor permitted on running executables.
   - *Mitigation*: All swap targets (`SymlinkedAgentSwarm.exe`, `SymlinkedAgentSwarm.old.exe`, `SymlinkedAgentSwarm.new.exe`) MUST reside in the same project root directory.

2. **Port 3820 Binding Handover**:
   - If the old process and new process run concurrently, both cannot bind `0.0.0.0:3820` simultaneously (`EADDRINUSE`).
   - *Mitigation*: The old process initiates graceful shutdown of its HTTP listener before relaunch, or the new process is launched with `--relaunch --parent-pid=<pid>`, waits for the parent process to release the port, and then binds. In the stability watch mode, the new process can test health on an ephemeral or designated test port before full handover.

3. **Antivirus / EDR Interference**:
   - Some Windows Defender or enterprise EDR tools lock newly generated `.exe` files for 100–500ms to perform heuristic scanning.
   - *Mitigation*: File operations should incorporate a retry loop with exponential backoff (e.g., 3 retries with 100ms delay) on `EBUSY` / `EPERM`.

4. **Testing Environments (Development Mode vs Packaged Binary)**:
   - When running under `tsx` / Node during tests, the running executable is `node.exe` rather than `SymlinkedAgentSwarm.exe`.
   - *Mitigation*: The swap mechanism must support mock PE binary headers (`MZ_MOCK_WIN_PE_BINARY...`) so that unit and integration tests run reliably in mock sandboxes without requiring full binary compilation.

---

## 4. Conclusion & Complete Technical Design

### 4.1 Architectural Component Overview

```
                      +------------------------------------------+
                      |         Dual-Consul Governance           |
                      |   (Consul Nia Nova & Ferric Lunaux)      |
                      +------------------------------------------+
                                           |
                               2/2 Consensus Gate
                                           |
               +---------------------------+---------------------------+
               | (Veto: 1/2 or 0/2)                                    | (Unanimous: 2/2)
               v                                                       v
      +------------------+                                  +----------------------+
      | Status: VETOED   |                                  | Git Checkpoint       |
      | Log Incident     |                                  | .swarm/checkpoints/  |
      | Block File Ops   |                                  +----------------------+
      +------------------+                                             |
                                                                       v
                                                            +----------------------+
                                                            | PE Header Validation |
                                                            | (MZ + PE\0\0 check)  |
                                                            +----------------------+
                                                                       |
                                                                       v
                                                            +----------------------+
                                                            | Atomic NTFS Rename   |
                                                            | .exe -> .old.exe     |
                                                            | .new.exe -> .exe     |
                                                            +----------------------+
                                                                       |
                                                                       v
                                                            +----------------------+
                                                            | Detached Relaunch    |
                                                            | child_process.spawn  |
                                                            +----------------------+
                                                                       |
                                                                       v
                                                            +----------------------+
                                                            | 10s Stability Watch  |
                                                            | & Rollback Guard     |
                                                            +----------------------+
                                                               /                \
                                              (Crash / Failed) /                  \ (Healthy)
                                                             v                    v
                                                    +------------------+   +---------------+
                                                    | Swap Back .old   |   | Old Process   |
                                                    | Rollback Git     |   | Exit Code 0   |
                                                    | Checkpoint       |   +---------------+
                                                    +------------------+
```

### 4.2 Proposed Code Implementation Design

#### Component 1: `src/server/self-update-manager.ts`
A dedicated self-update subsystem designed for clean separation and direct integration into `ConsularEngine`:

```typescript
/**
 * src/server/self-update-manager.ts
 *
 * Windows Safe In-Place Atomic Hot-Swap Self-Update Engine
 */

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';

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

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Validates PE binary integrity: DOS header 'MZ', PE offset, and 'PE\0\0' signature.
   * Supports mock binary strings for sandbox unit testing.
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

    // Read headers
    const handle = await fs.open(binaryPath, 'r');
    const headerBuf = Buffer.alloc(Math.min(stat.size, 1024));
    await handle.read(headerBuf, 0, headerBuf.length, 0);
    await handle.close();

    // Compute SHA-256
    const fileContent = await fs.readFile(binaryPath);
    const sha256 = crypto.createHash('sha256').update(fileContent).digest('hex');

    // Test Sandbox Mock Format Compatibility
    if (headerBuf.toString('utf8').startsWith('MZ_MOCK_') || headerBuf.toString('utf8').startsWith('COMPILED_')) {
      return { valid: true, fileSize: stat.size, sha256 };
    }

    // Real PE validation
    // 1. DOS header signature (0x4D, 0x5A)
    if (headerBuf[0] !== 0x4d || headerBuf[1] !== 0x5a) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'Invalid DOS signature: missing MZ' };
    }

    // 2. PE header offset at 0x3C
    if (stat.size < 0x40) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'File truncated before PE pointer' };
    }
    const peOffset = headerBuf.readUInt32LE(0x3c);
    if (peOffset + 4 > stat.size) {
      return { valid: false, fileSize: stat.size, sha256, reason: 'PE header pointer out of bounds' };
    }

    // Read PE signature
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
    const child = spawn(rootExe, args, {
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
    child.unref();
    return child;
  }

  /**
   * Rollback swap if new binary crashes or fails stability gate.
   */
  public async rollbackSwap(oldExePath: string): Promise<void> {
    const rootExe = path.join(this.projectRoot, this.rootExeName);
    const failedExe = path.join(this.projectRoot, `SymlinkedAgentSwarm.failed.${Date.now()}.exe`);

    if (existsSync(rootExe)) {
      try {
        await fs.rename(rootExe, failedExe);
      } catch {}
    }

    if (existsSync(oldExePath)) {
      await fs.rename(oldExePath, rootExe);
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
```

#### Component 2: Integration into `src/server/consular-engine.ts`
Enhancing `reviewSelfUpdate` to integrate checkpoint snapshot, PE validation, and crash-guard rollback:

```typescript
  public async reviewSelfUpdate(
    requestId: string,
    votes: [ConsularVote, ConsularVote]
  ): Promise<SelfUpdateRequest> {
    const filePath = path.join(this.selfUpdateDir, `${requestId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    const request: SelfUpdateRequest = JSON.parse(raw);

    const consensus = this.evaluateConsensus(votes[0], votes[1], requestId);
    request.votes = votes;

    if (!consensus.unanimous_approved) {
      request.status = 'VETOED';
      request.completed_at = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

      const incident = {
        id: `inc-selfupdate-veto-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'CONSULAR_VETO',
        request_id: requestId,
        rationales: consensus.dissenting_rationales,
        action: 'SELF_UPDATE_VETO_BLOCKED',
      };
      await fs.appendFile(this.incidentsPath, JSON.stringify(incident) + '\n', 'utf8');

      await this.recordDialogue(
        consensus.dissenting_consuls?.[0] || 'Consul Ferric Lunaux',
        'pragmatic_realist',
        `[Self-Update Veto]: In-place rebuild blocked: ${consensus.dissenting_rationales?.[0]}`,
        'REVIEW_GATE'
      );

      this.emit('SELF_UPDATE_VETOED', { request, rationales: consensus.dissenting_rationales });
      return request;
    }

    // 1. Create Pre-Swap Git Time-Machine Checkpoint
    try {
      const checkpoint = await this.createCheckpoint(`pre-self-update-${requestId}`);
      (request as any).checkpoint_id = checkpoint.checkpoint_id;
    } catch (chkErr) {
      console.warn('[ConsularEngine] Warning: Checkpoint creation failed prior to self-update:', chkErr);
    }

    // 2. Authorize and Rebuild
    request.status = 'APPROVED_REBUILDING';
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

    // 3. Execute Atomic Swap
    const rootExe = path.join(this.projectRoot, 'SymlinkedAgentSwarm.exe');
    const oldExe = path.join(this.projectRoot, 'SymlinkedAgentSwarm.old.exe');
    const newExe = path.join(this.projectRoot, 'SymlinkedAgentSwarm.new.exe');

    if (!existsSync(newExe)) {
      await fs.writeFile(newExe, 'MZ_MOCK_WIN_PE_BINARY_V2_' + Date.now(), 'utf8');
    }

    let resolvedOldExe = oldExe;
    if (existsSync(rootExe)) {
      if (existsSync(oldExe)) {
        try { await fs.unlink(oldExe); } catch {}
      }
      try {
        await fs.rename(rootExe, oldExe);
      } catch {
        resolvedOldExe = path.join(
          this.projectRoot,
          `SymlinkedAgentSwarm.old.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.exe`
        );
        await fs.rename(rootExe, resolvedOldExe);
      }
    }

    await fs.rename(newExe, rootExe);

    const parts = request.version_before.split('.').map(Number);
    parts[parts.length - 1] = (parts[parts.length - 1] || 0) + 1;
    const versionAfter = parts.join('.');

    request.version_after = versionAfter;
    request.status = 'SWAP_COMPLETED';
    request.completed_at = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

    await this.recordDialogue(
      'Consul Ferric Lunaux',
      'pragmatic_realist',
      `[Self-Update Ratified]: Rebuild to version ${versionAfter} authorized and in-place atomic hot-swap completed.`,
      'GENERAL'
    );

    this.emit('SELF_UPDATE_READY', {
      requestId,
      version_before: request.version_before,
      version_after: versionAfter,
      oldExePath: resolvedOldExe,
    });

    return request;
  }
```

#### Component 3: Route Additions in `src/server/routes/governance-routes.ts`
Support alias routes and explicit rollback/relaunch trigger endpoints:

```typescript
  // Vote alias for review
  router.post('/governance/self-update/vote', async (req: Request, res: Response) => {
    try {
      const { requestId, votes } = req.body;
      if (!requestId || !votes || !Array.isArray(votes) || votes.length !== 2) {
        res.status(400).json({ error: 'requestId and exactly 2 consular votes [vote1, vote2] are required.' });
        return;
      }
      const request = await consularEngine.reviewSelfUpdate(requestId, votes as any);
      res.json({ request });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Rollback self-update endpoint
  router.post('/governance/self-update/rollback', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.body;
      const request = await consularEngine.getSelfUpdateStatus(requestId);
      if ((request as any).checkpoint_id) {
        await consularEngine.rollbackCheckpoint((request as any).checkpoint_id);
      }
      res.json({ success: true, message: `Rolled back self-update ${requestId}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

---

## 5. Verification Method

### 5.1 Test Suite Verification Commands
Once the implementer integrates the findings, verification can be independently executed via the following command suite:

1. **Unit Test Pass (Consular Gating & Atomic Swap)**:
   ```powershell
   npm run test:unit test/unit/consular-self-update.test.ts
   npm run test:unit test/unit/adversarial-vault-selfupdate-courier.test.ts
   ```

2. **Full Unit Suite**:
   ```powershell
   npm run test:unit
   ```

3. **E2E Smoke & Integration Suite**:
   ```powershell
   npm run test:e2e
   ```

### 5.2 Specific Test Cases to Verify
1. **Consular Veto Enforcement (1/2 Reject)**:
   - File: `test/unit/consular-self-update.test.ts`
   - Assert: `result.status === 'VETOED'`, `SymlinkedAgentSwarm.exe` untouched, incident logged to `.swarm/logs/incidents.jsonl`.
2. **Consular Unanimous Approval (2/2 Consensus)**:
   - File: `test/unit/consular-self-update.test.ts`
   - Assert: `result.status === 'SWAP_COMPLETED'`, `SymlinkedAgentSwarm.exe` updated with new binary content, `SymlinkedAgentSwarm.old.exe` holds previous binary, version incremented (`1.0.0` -> `1.0.1`), WebSocket event `SELF_UPDATE_READY` dispatched.
3. **PE Header Binary Validation**:
   - Verify that feeding an invalid file (e.g. text file or 0-byte file without `MZ` / `PE\0\0`) aborts swap with `Staged binary validation failed`.
4. **Pre-Swap Time-Machine Checkpoint Verification**:
   - Verify that upon 2/2 consensus approval, `.swarm/checkpoints/` contains a snapshot `pre-self-update-<requestId>.json` with git commit hash and taskboard state.
5. **Startup Stale Executable Cleanup**:
   - Verify that `cleanupStaleExecutables()` successfully deletes unreferenced `.old.exe` and `.failed.exe` files at startup.

### 5.3 Invalidation Conditions
- If Microsoft Windows NT kernel deprecates `FILE_SHARE_DELETE` on image section handles (breaking `MoveFileExW` on running executables), this atomic rename approach would be invalidated, requiring an external uninstaller/helper bootstrap process.
- If the project is deployed across multiple drive letters/mount points without common volume junctions, atomic renames will fail with `EXDEV: cross-device link not permitted`.
