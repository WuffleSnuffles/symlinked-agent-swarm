/**
 * test/unit/challenger-m4-4-empirical.test.ts
 *
 * Empirical Challenge & Adversarial Stress Suite (Milestone 4.4 Gate Verification):
 * 1. PE Binary Validation (SelfUpdateManager.validateBinary):
 *    - Strict rejection of mock prefixes (MZ_MOCK_..., COMPILED_..., STAGED_..., RUNNING_...).
 *    - Rejection of invalid DOS headers (missing MZ, inverted ZM).
 *    - Rejection of truncated files (<16 bytes: 0, 8, 15 bytes; <64 bytes: 48 bytes with MZ).
 *    - Rejection of out-of-bounds e_lfanew pointers (<0x40, >stat.size - 4, 32-bit uint overflow).
 *    - Rejection of corrupted PE signatures (NE\0\0, PE\0\x01, all-zero).
 *    - Acceptance of authentic PE buffers (createPeTestBuffer(), standard & extended stubs).
 * 2. Atomic Swap & Rollback Safety (SelfUpdateManager & ConsularEngine):
 *    - executeAtomicSwap throws on missing staged newExe without creating synthetic files or touching active binary.
 *    - rollbackSwap throws on non-existent oldExePath without deleting, moving, or isolating rootExe.
 *    - Dynamic old_exe_path persistence in reviewSelfUpdate and accurate restoration in rollbackSelfUpdate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTestSandbox, createPeTestBuffer } from '../e2e/helpers.js';
import { SelfUpdateManager } from '../../src/server/self-update-manager.js';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { ConsularVote } from '../../src/server/types/governance.js';

function buildSyntheticPe(size: number, peOffset: number, sigBytes: [number, number, number, number] = [0x50, 0x45, 0x00, 0x00]): Buffer {
  const buf = Buffer.alloc(Math.max(size, peOffset + 4));
  buf[0] = 0x4d; // 'M'
  buf[1] = 0x5a; // 'Z'
  buf.writeUInt32LE(peOffset, 0x3c);
  buf[peOffset] = sigBytes[0];
  buf[peOffset + 1] = sigBytes[1];
  buf[peOffset + 2] = sigBytes[2];
  buf[peOffset + 3] = sigBytes[3];
  return buf;
}

describe('Milestone 4.4 Empirical Challenger: Rigorous Safety & PE Validation', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let updateManager: SelfUpdateManager;

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m4_4');
    updateManager = new SelfUpdateManager(sandbox.sandboxDir);
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Deliverable 1: PE Binary Validation
  // =========================================================================
  describe('Deliverable 1: PE Binary Validation (validateBinary)', () => {
    it('1.1 strictly rejects mock prefix files and returns valid: false with descriptive reason', async () => {
      const mockPrefixes = [
        { name: 'mz_mock', content: 'MZ_MOCK_WIN_PE_BINARY_V1.0.1_TEST_PAYLOAD' },
        { name: 'compiled', content: 'COMPILED_RELEASE_EXE_V2.0.0_STAGED_PAYLOAD' },
        { name: 'staged', content: 'STAGED_ATOMIC_SWAP_CANDIDATE_PAYLOAD' },
        { name: 'running', content: 'RUNNING_PANOPTICON_SWARM_DAEMON_V1.0.0' },
      ];

      for (const item of mockPrefixes) {
        const filePath = path.join(sandbox.sandboxDir, `${item.name}.exe`);
        await fs.writeFile(filePath, item.content, 'utf8');

        const result = await updateManager.validateBinary(filePath);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
        expect(result.reason!.length).toBeGreaterThan(0);
      }
    });

    it('1.2 rejects invalid DOS headers (missing MZ or reversed ZM)', async () => {
      // 1. Missing MZ (zeroed first 2 bytes)
      const missingMz = path.join(sandbox.sandboxDir, 'no_mz.exe');
      const badBuf1 = buildSyntheticPe(512, 0x80);
      badBuf1[0] = 0x00;
      badBuf1[1] = 0x00;
      await fs.writeFile(missingMz, badBuf1);

      const res1 = await updateManager.validateBinary(missingMz);
      expect(res1.valid).toBe(false);
      expect(res1.reason).toBe('Invalid DOS signature: missing MZ');

      // 2. Reversed ZM (0x5A, 0x4D)
      const reversedMz = path.join(sandbox.sandboxDir, 'reversed_zm.exe');
      const badBuf2 = buildSyntheticPe(512, 0x80);
      badBuf2[0] = 0x5a;
      badBuf2[1] = 0x4d;
      await fs.writeFile(reversedMz, badBuf2);

      const res2 = await updateManager.validateBinary(reversedMz);
      expect(res2.valid).toBe(false);
      expect(res2.reason).toBe('Invalid DOS signature: missing MZ');
    });

    it('1.3 rejects truncated files (<16 bytes and <64 bytes) with exact reasons', async () => {
      // 0 bytes
      const emptyPath = path.join(sandbox.sandboxDir, 'empty.exe');
      await fs.writeFile(emptyPath, Buffer.alloc(0));
      const res0 = await updateManager.validateBinary(emptyPath);
      expect(res0.valid).toBe(false);
      expect(res0.reason).toBe('Binary file too small (0 bytes)');

      // 8 bytes (with MZ)
      const eightPath = path.join(sandbox.sandboxDir, 'eight_bytes.exe');
      const eightBuf = Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      await fs.writeFile(eightPath, eightBuf);
      const res8 = await updateManager.validateBinary(eightPath);
      expect(res8.valid).toBe(false);
      expect(res8.reason).toBe('Binary file too small (8 bytes)');

      // 15 bytes
      const fifteenPath = path.join(sandbox.sandboxDir, 'fifteen_bytes.exe');
      const fifteenBuf = Buffer.alloc(15);
      fifteenBuf[0] = 0x4d;
      fifteenBuf[1] = 0x5a;
      await fs.writeFile(fifteenPath, fifteenBuf);
      const res15 = await updateManager.validateBinary(fifteenPath);
      expect(res15.valid).toBe(false);
      expect(res15.reason).toBe('Binary file too small (15 bytes)');

      // 48 bytes (stat.size >= 16 but < 64 / 0x40)
      const fortyEightPath = path.join(sandbox.sandboxDir, 'fortyeight_bytes.exe');
      const fortyEightBuf = Buffer.alloc(48);
      fortyEightBuf[0] = 0x4d;
      fortyEightBuf[1] = 0x5a;
      await fs.writeFile(fortyEightPath, fortyEightBuf);
      const res48 = await updateManager.validateBinary(fortyEightPath);
      expect(res48.valid).toBe(false);
      expect(res48.reason).toBe('File truncated before PE pointer');
    });

    it('1.4 rejects out-of-bounds e_lfanew pointers (<0x40, overflow, >stat.size - 4)', async () => {
      // Pointer too low (< 0x40, e.g. 0x20 overlapping DOS header)
      const lowOffsetPath = path.join(sandbox.sandboxDir, 'low_offset.exe');
      const lowBuf = Buffer.alloc(128);
      lowBuf[0] = 0x4d;
      lowBuf[1] = 0x5a;
      lowBuf.writeUInt32LE(0x20, 0x3c);
      await fs.writeFile(lowOffsetPath, lowBuf);
      const resLow = await updateManager.validateBinary(lowOffsetPath);
      expect(resLow.valid).toBe(false);
      expect(resLow.reason).toBe('PE header pointer out of bounds');

      // Pointer beyond file boundary (e.g. offset 300 in 128 byte file)
      const oobPath = path.join(sandbox.sandboxDir, 'oob_offset.exe');
      const oobBuf = Buffer.alloc(128);
      oobBuf[0] = 0x4d;
      oobBuf[1] = 0x5a;
      oobBuf.writeUInt32LE(300, 0x3c);
      await fs.writeFile(oobPath, oobBuf);
      const resOob = await updateManager.validateBinary(oobPath);
      expect(resOob.valid).toBe(false);
      expect(resOob.reason).toBe('PE header pointer out of bounds');

      // 32-bit unsigned integer overflow pointer (0xFFFFFFF0)
      const overflowPath = path.join(sandbox.sandboxDir, 'overflow_offset.exe');
      const overflowBuf = Buffer.alloc(128);
      overflowBuf[0] = 0x4d;
      overflowBuf[1] = 0x5a;
      overflowBuf.writeUInt32LE(0xfffffff0, 0x3c);
      await fs.writeFile(overflowPath, overflowBuf);
      const resOverflow = await updateManager.validateBinary(overflowPath);
      expect(resOverflow.valid).toBe(false);
      expect(resOverflow.reason).toBe('PE header pointer out of bounds');
    });

    it('1.5 rejects corrupted PE signatures with exact reason', async () => {
      // Non-PE format: NE\0\0 (Win16 / OS/2)
      const nePath = path.join(sandbox.sandboxDir, 'ne_format.exe');
      const neBuf = buildSyntheticPe(512, 0x80, [0x4e, 0x45, 0x00, 0x00]);
      await fs.writeFile(nePath, neBuf);
      const resNe = await updateManager.validateBinary(nePath);
      expect(resNe.valid).toBe(false);
      expect(resNe.reason).toBe('Invalid PE signature: missing PE\\0\\0');

      // Corrupted signature byte: PE\0\x01
      const corruptSigPath = path.join(sandbox.sandboxDir, 'corrupt_sig.exe');
      const corruptBuf = buildSyntheticPe(512, 0x80, [0x50, 0x45, 0x00, 0x01]);
      await fs.writeFile(corruptSigPath, corruptBuf);
      const resCorrupt = await updateManager.validateBinary(corruptSigPath);
      expect(resCorrupt.valid).toBe(false);
      expect(resCorrupt.reason).toBe('Invalid PE signature: missing PE\\0\\0');
    });

    it('1.6 accepts authentic PE buffers and returns valid: true with SHA-256', async () => {
      // Standard createPeTestBuffer (1024 bytes, offset 0x80)
      const validPath = path.join(sandbox.sandboxDir, 'authentic.exe');
      const peBuf = createPeTestBuffer('AUTHENTIC_EMBEDDED_PAYLOAD_V1', 1024, 0x80);
      await fs.writeFile(validPath, peBuf);

      const res = await updateManager.validateBinary(validPath);
      expect(res.valid).toBe(true);
      expect(res.fileSize).toBe(1024);
      expect(res.sha256).toBe(crypto.createHash('sha256').update(peBuf).digest('hex'));
      expect(res.reason).toBeUndefined();

      // Standard offset 0x40
      const valid40 = path.join(sandbox.sandboxDir, 'authentic_40.exe');
      const buf40 = buildSyntheticPe(512, 0x40);
      await fs.writeFile(valid40, buf40);
      const res40 = await updateManager.validateBinary(valid40);
      expect(res40.valid).toBe(true);
      expect(res40.fileSize).toBe(512);

      // Extended DOS stub offset 0x200
      const valid200 = path.join(sandbox.sandboxDir, 'authentic_200.exe');
      const buf200 = buildSyntheticPe(1024, 0x200);
      await fs.writeFile(valid200, buf200);
      const res200 = await updateManager.validateBinary(valid200);
      expect(res200.valid).toBe(true);
      expect(res200.fileSize).toBe(1024);
    });
  });

  // =========================================================================
  // Deliverable 2: Atomic Swap & Rollback Safety
  // =========================================================================
  describe('Deliverable 2: Atomic Swap & Rollback Safety', () => {
    it('2.1 throws when executeAtomicSwap is invoked without staged newExe without creating synthetic files or touching active binary', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();
      const newExe = updateManager.getNewExePath();

      const activePayload = createPeTestBuffer('RUNNING_ACTIVE_ORIGINAL_BINARY');
      await fs.writeFile(rootExe, activePayload);
      expect(existsSync(newExe)).toBe(false);

      // Record snapshot of directory before attempt
      const filesBefore = await fs.readdir(sandbox.sandboxDir);

      await expect(updateManager.executeAtomicSwap('1.0.0')).rejects.toThrow(
        /Staged binary validation failed: Binary not found at/
      );

      // Verify active binary remains completely untouched
      const currentActive = await fs.readFile(rootExe);
      expect(currentActive.equals(activePayload)).toBe(true);

      // Verify oldExe was NOT created
      expect(existsSync(oldExe)).toBe(false);

      // Verify newExe was NOT synthetically generated
      expect(existsSync(newExe)).toBe(false);

      // Verify no extra files created
      const filesAfter = await fs.readdir(sandbox.sandboxDir);
      expect(filesAfter.sort()).toEqual(filesBefore.sort());
    });

    it('2.2 throws when rollbackSwap is invoked with non-existent oldExePath without deleting or moving rootExe', async () => {
      const rootExe = updateManager.getRootExePath();
      const fakeOldExe = path.join(sandbox.sandboxDir, 'NonExistent_Backup.old.exe');

      const activePayload = createPeTestBuffer('RUNNING_ACTIVE_SURVIVING_BINARY');
      await fs.writeFile(rootExe, activePayload);

      await expect(updateManager.rollbackSwap(fakeOldExe)).rejects.toThrow(
        /Rollback aborted: Backup binary not found at/
      );

      // Active rootExe must still exist and be completely unaltered
      expect(existsSync(rootExe)).toBe(true);
      const currentRoot = await fs.readFile(rootExe);
      expect(currentRoot.equals(activePayload)).toBe(true);

      // Ensure no .failed.<timestamp>.exe was created
      const files = await fs.readdir(sandbox.sandboxDir);
      const failedFiles = files.filter((f) => f.startsWith('SymlinkedAgentSwarm.failed'));
      expect(failedFiles).toHaveLength(0);
    });

    it('2.3 verifies dynamic old_exe_path persistence in reviewSelfUpdate and recovery in rollbackSelfUpdate', async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      const taskboardManager = new TaskboardManager(sandbox.swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      await cubicleManager.initialize();
      await taskboardManager.initialize();

      const consularEngine = new ConsularEngine(
        sandbox.swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        sandbox.sandboxDir
      );
      await consularEngine.initialize();

      const rootExe = consularEngine.getSelfUpdateManager().getRootExePath();
      const newExe = consularEngine.getSelfUpdateManager().getNewExePath();
      const staticOldExe = consularEngine.getSelfUpdateManager().getOldExePath();

      // Pre-stage:
      // 1. Running rootExe
      const originalPayload = 'RUNNING_VERSION_1.0.0_DYNAMIC_TEST';
      await fs.writeFile(rootExe, createPeTestBuffer(originalPayload));

      // 2. New compiled candidate
      const upgradedPayload = 'COMPILED_VERSION_1.0.1_DYNAMIC_TEST';
      await fs.writeFile(newExe, createPeTestBuffer(upgradedPayload));

      // 3. Pre-existing occupied static oldExe that causes fallback to dynamic collision path if locked or pre-existing
      await fs.writeFile(staticOldExe, createPeTestBuffer('PRE_EXISTING_STATIC_OLD'));

      // Initiate self-update
      const req = await consularEngine.initiateSelfUpdate('Dynamic rollback test');
      expect(req.status).toBe('PENDING_REVIEW');

      // Unanimous 2/2 Approval
      const votes: [ConsularVote, ConsularVote] = [
        { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
        { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
      ];

      const reviewResult = await consularEngine.reviewSelfUpdate(req.request_id, votes);
      expect(reviewResult.status).toBe('SWAP_COMPLETED');
      expect(reviewResult.old_exe_path).toBeDefined();

      // Verify old_exe_path persisted in .json on disk
      const persistedRecord = await consularEngine.getSelfUpdateStatus(req.request_id);
      expect(persistedRecord.old_exe_path).toBe(reviewResult.old_exe_path);
      expect(existsSync(persistedRecord.old_exe_path!)).toBe(true);

      // Verify rootExe contains the upgraded binary
      const activeContent = await fs.readFile(rootExe, 'utf8');
      expect(activeContent).toContain(upgradedPayload);

      // Now invoke rollbackSelfUpdate: must read persisted old_exe_path and restore it
      const rollbackResult = await consularEngine.rollbackSelfUpdate(req.request_id);
      expect(rollbackResult.status).toBe('ROLLED_BACK');

      // Verify active binary restored to original payload
      const restoredContent = await fs.readFile(rootExe, 'utf8');
      expect(restoredContent).toContain(originalPayload);
    });
  });
});
