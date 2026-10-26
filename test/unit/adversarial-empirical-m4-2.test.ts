/**
 * test/unit/adversarial-empirical-m4-2.test.ts
 *
 * Empirical Challenge & Adversarial Stress Suite for Milestone 4:
 * 1. PE Binary Validation in SelfUpdateManager:
 *    - Valid PE32 headers (MZ signature, PE offset at 0x3C, PE\0\0 signature).
 *    - Mock header prefixes (MZ_MOCK_, COMPILED_, STAGED_, RUNNING_).
 *    - Truncated files (<16 bytes, <0x40 bytes, out-of-bounds PE offset).
 *    - Corrupted header bytes (bad DOS magic, non-PE signatures like NE\0\0, LE\0\0, PE\0\x01).
 *    - Non-existent files and empty 0-byte files.
 *    - Exact SHA-256 hash calculation verification.
 * 2. 7-Stage Windows Atomic Binary Swap & Rollback:
 *    - Promotion sequence (.exe -> .old.exe, .new.exe -> .exe).
 *    - Abort on invalid staged binary without mutating active .exe.
 *    - Stale .old.exe eviction & locked collision handling.
 *    - Semantic version bumping (1.0.0 -> 1.0.1, 1.9.9 -> 1.9.10, etc.).
 *    - Rollback recovery (failed binary saved to .failed.<timestamp>.exe, restored from .old.exe).
 *    - Stale executable cleanup sweep (cleanupStaleExecutables).
 * 3. Consular Engine Integration & Pre-Swap Git Time-Machine Checkpoint:
 *    - 2/2 unanimous approval triggering checkpoint and atomic swap.
 *    - 1/2 Veto blocking swap, recording incident, and preventing checkpoint creation.
 *    - Unauthorized votes and empty-rationale veto rejection.
 *    - Consular rollback route restoring binary and taskboard checkpoint.
 * 4. Governance REST API Endpoints:
 *    - /governance/self-update/initiate, /vote, /rollback, /status/:requestId.
 *    - Malformed payload rejection and status code contracts.
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
import { createGovernanceRouter } from '../../src/server/routes/governance-routes.js';
import express, { Express } from 'express';
import type { Server } from 'node:http';

function buildValidPeBuffer(size: number = 512, peOffset: number = 0x40): Buffer {
  const buf = Buffer.alloc(size);
  // DOS header signature 'MZ' (0x4D, 0x5A)
  buf[0] = 0x4d;
  buf[1] = 0x5a;
  // PE offset at 0x3C
  buf.writeUInt32LE(peOffset, 0x3c);
  // PE signature 'PE\0\0' (0x50, 0x45, 0x00, 0x00)
  buf[peOffset] = 0x50;
  buf[peOffset + 1] = 0x45;
  buf[peOffset + 2] = 0x00;
  buf[peOffset + 3] = 0x00;
  return buf;
}

describe('Milestone 4 Challenger 2: PE Validation, Atomic Swap, Consular Gating & Rollback', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let updateManager: SelfUpdateManager;

  beforeEach(async () => {
    sandbox = await createTestSandbox('adversarial_m4_2');
    updateManager = new SelfUpdateManager(sandbox.sandboxDir);
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Challenge 1: PE Binary Validation Stress & Boundary Exploration
  // =========================================================================
  describe('Challenge 1: PE Binary Header Validation (SelfUpdateManager.validateBinary)', () => {
    it('1.1 validates authentic Win32 PE binary with standard 0x40 offset', async () => {
      const peFile = path.join(sandbox.sandboxDir, 'valid_pe.exe');
      const buf = buildValidPeBuffer(512, 0x40);
      await fs.writeFile(peFile, buf);

      const res = await updateManager.validateBinary(peFile);
      expect(res.valid).toBe(true);
      expect(res.fileSize).toBe(512);
      expect(res.sha256).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
      expect(res.reason).toBeUndefined();
    });

    it('1.2 validates authentic Win32 PE binary with extended DOS stub (peOffset = 0x200)', async () => {
      const peFile = path.join(sandbox.sandboxDir, 'extended_pe.exe');
      const buf = buildValidPeBuffer(1024, 0x200);
      await fs.writeFile(peFile, buf);

      const res = await updateManager.validateBinary(peFile);
      expect(res.valid).toBe(true);
      expect(res.fileSize).toBe(1024);
      expect(res.sha256).toBe(crypto.createHash('sha256').update(buf).digest('hex'));
    });

    it('1.3 rejects plaintext mock prefixes without valid PE structure (MZ_MOCK_, COMPILED_, STAGED_, RUNNING_)', async () => {
      const prefixes = [
        'MZ_MOCK_TEST_BINARY_V1',
        'COMPILED_RELEASE_BINARY_V2',
        'STAGED_ATOMIC_SWAP_CANDIDATE',
        'RUNNING_PANOPTICON_SWARM_DAEMON',
      ];

      for (const prefix of prefixes) {
        const filePath = path.join(sandbox.sandboxDir, `mock_${prefix.substring(0, 7)}.exe`);
        await fs.writeFile(filePath, prefix, 'utf8');

        const res = await updateManager.validateBinary(filePath);
        expect(res.valid).toBe(false);
        expect(res.reason).toBeDefined();
      }
    });

    it('1.4 rejects non-existent binary path', async () => {
      const missingPath = path.join(sandbox.sandboxDir, 'does_not_exist.exe');
      const res = await updateManager.validateBinary(missingPath);
      expect(res.valid).toBe(false);
      expect(res.fileSize).toBe(0);
      expect(res.reason).toContain('Binary not found');
    });

    it('1.5 rejects empty 0-byte file', async () => {
      const emptyFile = path.join(sandbox.sandboxDir, 'empty.exe');
      await fs.writeFile(emptyFile, Buffer.alloc(0));

      const res = await updateManager.validateBinary(emptyFile);
      expect(res.valid).toBe(false);
      expect(res.fileSize).toBe(0);
      expect(res.reason).toContain('too small');
    });

    it('1.6 rejects undersized file (< 16 bytes) even with MZ bytes', async () => {
      const tinyFile = path.join(sandbox.sandboxDir, 'tiny_mz.exe');
      // 8 bytes: 'MZ' followed by 6 bytes
      const buf = Buffer.from([0x4d, 0x5a, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
      await fs.writeFile(tinyFile, buf);

      const res = await updateManager.validateBinary(tinyFile);
      expect(res.valid).toBe(false);
      expect(res.fileSize).toBe(8);
      expect(res.reason).toContain('too small (8 bytes)');
    });

    it('1.7 rejects file truncated before 0x3C / 0x40 PE offset table', async () => {
      const truncatedFile = path.join(sandbox.sandboxDir, 'truncated_dos.exe');
      // 48 bytes (0x30), missing the 0x3C offset
      const buf = Buffer.alloc(48);
      buf[0] = 0x4d;
      buf[1] = 0x5a;
      await fs.writeFile(truncatedFile, buf);

      const res = await updateManager.validateBinary(truncatedFile);
      expect(res.valid).toBe(false);
      expect(res.fileSize).toBe(48);
      expect(res.reason).toContain('File truncated before PE pointer');
    });

    it('1.8 rejects out-of-bounds PE header offset (peOffset + 4 > stat.size)', async () => {
      const outOfBoundsFile = path.join(sandbox.sandboxDir, 'oob_offset.exe');
      const buf = Buffer.alloc(128);
      buf[0] = 0x4d;
      buf[1] = 0x5a;
      buf.writeUInt32LE(200, 0x3c); // Offset 200 > file size 128
      await fs.writeFile(outOfBoundsFile, buf);

      const res = await updateManager.validateBinary(outOfBoundsFile);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('PE header pointer out of bounds');
    });

    it('1.9 rejects unsigned 32-bit integer overflow offset (0xFFFFFFF0)', async () => {
      const overflowFile = path.join(sandbox.sandboxDir, 'overflow_offset.exe');
      const buf = Buffer.alloc(128);
      buf[0] = 0x4d;
      buf[1] = 0x5a;
      buf.writeUInt32LE(0xfffffff0, 0x3c);
      await fs.writeFile(overflowFile, buf);

      const res = await updateManager.validateBinary(overflowFile);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('PE header pointer out of bounds');
    });

    it('1.10 rejects invalid DOS header signature (missing MZ / reversed ZM)', async () => {
      const reversedDos = path.join(sandbox.sandboxDir, 'reversed_dos.exe');
      const buf = buildValidPeBuffer(256, 0x40);
      buf[0] = 0x5a; // 'Z'
      buf[1] = 0x4d; // 'M'
      await fs.writeFile(reversedDos, buf);

      const res = await updateManager.validateBinary(reversedDos);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid DOS signature: missing MZ');
    });

    it('1.11 rejects invalid PE signature (NE\\0\\0 16-bit Win / OS2 format)', async () => {
      const neFile = path.join(sandbox.sandboxDir, 'ne_format.exe');
      const buf = buildValidPeBuffer(256, 0x40);
      buf[0x40] = 0x4e; // 'N'
      buf[0x41] = 0x45; // 'E'
      await fs.writeFile(neFile, buf);

      const res = await updateManager.validateBinary(neFile);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid PE signature: missing PE\\0\\0');
    });

    it('1.12 rejects corrupted PE signature with trailing non-zero byte (PE\\0\\x01)', async () => {
      const corruptPe = path.join(sandbox.sandboxDir, 'corrupt_pe_sig.exe');
      const buf = buildValidPeBuffer(256, 0x40);
      buf[0x43] = 0x01; // Should be 0x00
      await fs.writeFile(corruptPe, buf);

      const res = await updateManager.validateBinary(corruptPe);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid PE signature: missing PE\\0\\0');
    });
  });

  // =========================================================================
  // Challenge 2: 7-Stage Atomic Binary Swap & Rollback Recovery
  // =========================================================================
  describe('Challenge 2: 7-Stage Windows Atomic Swap & Rollback (SelfUpdateManager)', () => {
    it('2.1 executes complete atomic swap (.exe -> .old.exe, .new.exe -> .exe) and bumps semver', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();
      const newExe = updateManager.getNewExePath();

      const runningContent = 'RUNNING_VERSION_PAYLOAD_1.0.0';
      const updatedContent = 'COMPILED_VERSION_PAYLOAD_1.0.1';

      await fs.writeFile(rootExe, createPeTestBuffer(runningContent));
      await fs.writeFile(newExe, createPeTestBuffer(updatedContent));

      const result = await updateManager.executeAtomicSwap('1.0.0');

      expect(result.success).toBe(true);
      expect(result.version_after).toBe('1.0.1');
      expect(result.rootExePath).toBe(rootExe);
      expect(result.oldExePath).toBe(oldExe);

      // Verify filesystem states
      expect(await fs.readFile(rootExe, 'utf8')).toContain(updatedContent);
      expect(await fs.readFile(oldExe, 'utf8')).toContain(runningContent);
      expect(existsSync(newExe)).toBe(false);
    });

    it('2.2 increments semantic version across single and multi-digit boundaries', async () => {
      const testCases = [
        { before: '1.0.0', expected: '1.0.1' },
        { before: '1.0.9', expected: '1.0.10' },
        { before: '2.9.99', expected: '2.9.100' },
        { before: '3.4', expected: '3.5' },
      ];

      for (const tc of testCases) {
        const rootExe = updateManager.getRootExePath();
        const newExe = updateManager.getNewExePath();
        await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_V_' + tc.before));
        await fs.writeFile(newExe, createPeTestBuffer('STAGED_V_' + tc.expected));

        const swap = await updateManager.executeAtomicSwap(tc.before);
        expect(swap.version_after).toBe(tc.expected);
      }
    });

    it('2.3 aborts atomic swap when staged .new.exe fails validation, leaving running .exe UNTOUCHED', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();
      const newExe = updateManager.getNewExePath();

      const healthyPayload = 'RUNNING_CRITICAL_HEALTHY_EXE';
      await fs.writeFile(rootExe, createPeTestBuffer(healthyPayload));

      // Stage corrupt new binary (bad DOS header, not mock)
      const corruptBuf = Buffer.alloc(128);
      corruptBuf[0] = 0x00; // invalid DOS signature
      await fs.writeFile(newExe, corruptBuf);

      await expect(updateManager.executeAtomicSwap('1.0.0')).rejects.toThrow(
        /Staged binary validation failed/
      );

      // Running binary MUST be preserved intact
      expect(await fs.readFile(rootExe, 'utf8')).toContain(healthyPayload);
      // Stale oldExe must NOT have been created
      expect(existsSync(oldExe)).toBe(false);
      // Corrupt new binary remains in place for diagnostics
      expect(existsSync(newExe)).toBe(true);
    });

    it('2.4 evicts existing stale .old.exe before executing new swap', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();
      const newExe = updateManager.getNewExePath();

      await fs.writeFile(oldExe, createPeTestBuffer('PREVIOUS_STALE_BACKUP'));
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_V1'));
      await fs.writeFile(newExe, createPeTestBuffer('COMPILED_V2'));

      const swap = await updateManager.executeAtomicSwap('1.0.0');
      expect(swap.success).toBe(true);
      expect(await fs.readFile(oldExe, 'utf8')).toContain('RUNNING_V1');
      expect(await fs.readFile(rootExe, 'utf8')).toContain('COMPILED_V2');
    });

    it('2.5 rollbackSwap restores healthy oldExe and isolates failed binary into .failed.<timestamp>.exe', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();

      const oldHealthy = 'RUNNING_KNOWN_GOOD_VERSION_1.0.0';
      const badPromoted = 'COMPILED_DEFECTIVE_CRASHING_BINARY';

      await fs.writeFile(rootExe, createPeTestBuffer(badPromoted));
      await fs.writeFile(oldExe, createPeTestBuffer(oldHealthy));

      await updateManager.rollbackSwap(oldExe);

      // rootExe should now be restored to oldHealthy
      expect(await fs.readFile(rootExe, 'utf8')).toContain(oldHealthy);
      // oldExe was renamed to rootExe and is gone
      expect(existsSync(oldExe)).toBe(false);

      // failedExe should exist on disk containing the defective binary
      const files = await fs.readdir(sandbox.sandboxDir);
      const failedFile = files.find(
        (f) => f.startsWith('SymlinkedAgentSwarm.failed') && f.endsWith('.exe')
      );
      expect(failedFile).toBeDefined();
      const failedContent = await fs.readFile(path.join(sandbox.sandboxDir, failedFile!), 'utf8');
      expect(failedContent).toContain(badPromoted);
    });

    it('2.6 cleanupStaleExecutables sweeps .old.*.exe and .failed.*.exe without touching active .exe or regular files', async () => {
      const rootExe = updateManager.getRootExePath();
      await fs.writeFile(rootExe, 'ACTIVE_EXE', 'utf8');

      const staleFiles = [
        'SymlinkedAgentSwarm.old.exe',
        'SymlinkedAgentSwarm.old.1730000000.abcd.exe',
        'SymlinkedAgentSwarm.failed.1730000001.exe',
        'SymlinkedAgentSwarm.failed.1730000002.exe',
      ];
      for (const sf of staleFiles) {
        await fs.writeFile(path.join(sandbox.sandboxDir, sf), 'STALE_DATA', 'utf8');
      }

      const regularFile = path.join(sandbox.sandboxDir, 'important_config.json');
      await fs.writeFile(regularFile, '{"retain": true}', 'utf8');

      const cleaned = await updateManager.cleanupStaleExecutables();

      for (const sf of staleFiles) {
        expect(cleaned).toContain(sf);
        expect(existsSync(path.join(sandbox.sandboxDir, sf))).toBe(false);
      }

      // Active rootExe and regular file remain completely intact
      expect(existsSync(rootExe)).toBe(true);
      expect(existsSync(regularFile)).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 3: Consular Engine Dual-Gate Integration & Time-Machine Checkpoint
  // =========================================================================
  describe('Challenge 3: Consular Engine Governance & Checkpoint Snapshot Integration', () => {
    let consularEngine: ConsularEngine;
    let cubicleManager: CubicleManager;
    let taskboardManager: TaskboardManager;
    let capabilityMatrix: CapabilityMatrix;

    beforeEach(async () => {
      cubicleManager = new CubicleManager(sandbox.swarmDir);
      taskboardManager = new TaskboardManager(sandbox.swarmDir);
      capabilityMatrix = new CapabilityMatrix();
      await cubicleManager.initialize();
      await taskboardManager.initialize();

      consularEngine = new ConsularEngine(
        sandbox.swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        sandbox.sandboxDir
      );
      await consularEngine.initialize();
    });

    it('3.1 2/2 unanimous approval creates pre-swap Git checkpoint, executes swap, and emits SELF_UPDATE_READY', async () => {
      // Stage running and new binaries
      const rootExe = consularEngine.getSelfUpdateManager().getRootExePath();
      const newExe = consularEngine.getSelfUpdateManager().getNewExePath();
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_VERSION_1.0.0'));
      await fs.writeFile(newExe, createPeTestBuffer('COMPILED_VERSION_1.0.1'));

      // Create a task in todo column to verify taskboard snapshot in checkpoint
      const todoFile = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-verify-chk.json');
      await fs.writeFile(
        todoFile,
        JSON.stringify({ id: 'task-verify-chk', title: 'Verify checkpoint snapshot', status: 'todo' }),
        'utf8'
      );

      const req = await consularEngine.initiateSelfUpdate('Upgrade Panopticon Raycasting Engine');

      let readyEventPayload: any = null;
      consularEngine.onEvent((type, payload) => {
        if (type === 'SELF_UPDATE_READY') readyEventPayload = payload;
      });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'User requested upgraded raycasting visual fidelity.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Zero performance regression; strict memory bounds satisfied.',
          timestamp: new Date().toISOString(),
        },
      ];

      const reviewed = await consularEngine.reviewSelfUpdate(req.request_id, votes);

      expect(reviewed.status).toBe('SWAP_COMPLETED');
      expect(reviewed.version_after).toBe('1.0.1');
      expect(reviewed.checkpoint_id).toBeDefined();

      // Verify checkpoint exists on disk with taskboard snapshot
      const chkFile = path.join(sandbox.swarmDir, 'checkpoints', `${reviewed.checkpoint_id}.json`);
      expect(existsSync(chkFile)).toBe(true);
      const chkData = JSON.parse(await fs.readFile(chkFile, 'utf8'));
      expect(chkData.label).toContain(`pre-self-update-${req.request_id}`);
      expect(chkData.tasks).toBeDefined();
      expect(chkData.tasks.todo.some((t: any) => t.id === 'task-verify-chk')).toBe(true);

      // Verify event emitted
      expect(readyEventPayload).toBeDefined();
      expect(readyEventPayload.requestId).toBe(req.request_id);
      expect(readyEventPayload.version_after).toBe('1.0.1');

      // Verify binary swapped
      expect(await fs.readFile(rootExe, 'utf8')).toContain('COMPILED_VERSION_1.0.1');
    });

    it('3.2 1/2 Veto blocks self-update, logs incident, emits SELF_UPDATE_VETOED, and leaves binary untouched', async () => {
      const rootExe = consularEngine.getSelfUpdateManager().getRootExePath();
      const newExe = consularEngine.getSelfUpdateManager().getNewExePath();
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_VERSION_1.0.0'));
      await fs.writeFile(newExe, createPeTestBuffer('COMPILED_VERSION_1.0.1'));

      const req = await consularEngine.initiateSelfUpdate('Unsafe kernel hook addition');

      let vetoEventPayload: any = null;
      consularEngine.onEvent((type, payload) => {
        if (type === 'SELF_UPDATE_VETOED') vetoEventPayload = payload;
      });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Looks interesting.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: Unsafe kernel hooks introduce memory corruption risks.',
          timestamp: new Date().toISOString(),
        },
      ];

      const reviewed = await consularEngine.reviewSelfUpdate(req.request_id, votes);

      expect(reviewed.status).toBe('VETOED');
      expect(reviewed.checkpoint_id).toBeUndefined();

      // Verify incident logged
      const incidents = await fs.readFile(path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
      expect(incidents).toContain('SELF_UPDATE_VETO_BLOCKED');
      expect(incidents).toContain('INTERCESSIO VETO');

      // Verify event
      expect(vetoEventPayload).toBeDefined();
      expect(vetoEventPayload.request.request_id).toBe(req.request_id);

      // Verify binary was NOT swapped
      expect(await fs.readFile(rootExe, 'utf8')).toContain('RUNNING_VERSION_1.0.0');
      expect(existsSync(newExe)).toBe(true);
    });

    it('3.3 rejects non-consul votes and vetoes without rationales', async () => {
      const req = await consularEngine.initiateSelfUpdate('Upgrade feature');

      // 1. Rogue agent vote
      const rogueVotes: [any, any] = [
        { consul: 'RogueAgent', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
        { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
      ];
      await expect(consularEngine.reviewSelfUpdate(req.request_id, rogueVotes)).rejects.toThrow(
        /UNAUTHORIZED/
      );

      // 2. Veto without rationale
      const emptyRationaleVotes: [ConsularVote, ConsularVote] = [
        { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
        { consul: 'Consul II', decision: 'VETO', rationale: '', timestamp: new Date().toISOString() },
      ];
      await expect(consularEngine.reviewSelfUpdate(req.request_id, emptyRationaleVotes)).rejects.toThrow(
        /INVALID_VETO/
      );
    });

    it('3.4 rollbackSelfUpdate restores previous executable and rolls back Git time-machine checkpoint', async () => {
      const rootExe = consularEngine.getSelfUpdateManager().getRootExePath();
      const newExe = consularEngine.getSelfUpdateManager().getNewExePath();
      const oldExe = consularEngine.getSelfUpdateManager().getOldExePath();

      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_OLD_ORIGINAL'));
      await fs.writeFile(newExe, createPeTestBuffer('COMPILED_NEW_UPDATED'));

      // Create initial task state
      const todoFile = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-persist.json');
      await fs.writeFile(
        todoFile,
        JSON.stringify({ id: 'task-persist', title: 'Task Before Update', status: 'todo' }),
        'utf8'
      );

      const req = await consularEngine.initiateSelfUpdate('Temporary Experimental Update');

      const votes: [ConsularVote, ConsularVote] = [
        { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
        { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
      ];

      await consularEngine.reviewSelfUpdate(req.request_id, votes);
      expect(await fs.readFile(rootExe, 'utf8')).toContain('COMPILED_NEW_UPDATED');

      // Mutate taskboard state post-swap
      const postSwapTask = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-after.json');
      await fs.writeFile(
        postSwapTask,
        JSON.stringify({ id: 'task-after', title: 'Task Created After Swap', status: 'in_progress' }),
        'utf8'
      );

      // Execute rollback
      let rolledBackEventFired = false;
      consularEngine.onEvent((type) => {
        if (type === 'SELF_UPDATE_ROLLED_BACK') rolledBackEventFired = true;
      });

      const rolledBack = await consularEngine.rollbackSelfUpdate(req.request_id);

      expect(rolledBack.status).toBe('ROLLED_BACK');
      expect(rolledBackEventFired).toBe(true);

      // Executable restored
      expect(await fs.readFile(rootExe, 'utf8')).toContain('RUNNING_OLD_ORIGINAL');

      // Taskboard restored to pre-swap snapshot (task-persist in todo, task-after removed)
      expect(existsSync(todoFile)).toBe(true);
      expect(existsSync(postSwapTask)).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 4: Governance REST API Endpoints Contract
  // =========================================================================
  describe('Challenge 4: Governance REST API Routes Contract', () => {
    let app: Express;
    let consularEngine: ConsularEngine;

    beforeEach(async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      const taskboardManager = new TaskboardManager(sandbox.swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      await cubicleManager.initialize();
      await taskboardManager.initialize();

      consularEngine = new ConsularEngine(
        sandbox.swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        sandbox.sandboxDir
      );
      await consularEngine.initialize();

      app = express();
      app.use(express.json());
      const router = createGovernanceRouter(
        consularEngine,
        {} as any,
        {} as any,
        {} as any
      );
      app.use('/api', router);
    });

    it('4.1 POST /api/governance/self-update/initiate validates prompt and returns 201', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // Missing prompt -> 400
        const badRes = await fetch(`${baseUrl}/api/governance/self-update/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(badRes.status).toBe(400);

        // Valid prompt -> 201
        const goodRes = await fetch(`${baseUrl}/api/governance/self-update/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Implement distributed consensus' }),
        });
        expect(goodRes.status).toBe(201);
        const data = await goodRes.json();
        expect(data.request.request_id).toBeDefined();
        expect(data.request.status).toBe('PENDING_REVIEW');
      } finally {
        server.close();
      }
    });

    it('4.2 POST /api/governance/self-update/vote and GET /status/:requestId handle voting and status queries', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Initiate
        const initRes = await fetch(`${baseUrl}/api/governance/self-update/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Feature patch' }),
        });
        const { request } = await initRes.json();
        const requestId = request.request_id;

        // 2. Query status
        const statusRes = await fetch(`${baseUrl}/api/governance/self-update/status/${requestId}`);
        expect(statusRes.status).toBe(200);
        const statusData = await statusRes.json();
        expect(statusData.request.status).toBe('PENDING_REVIEW');

        // 3. Cast 2/2 vote
        const voteRes = await fetch(`${baseUrl}/api/governance/self-update/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            votes: [
              { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
              { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
            ],
          }),
        });
        expect(voteRes.status).toBe(200);
        const voteData = await voteRes.json();
        expect(voteData.request.status).toBe('SWAP_COMPLETED');

        // 4. Query status post-vote
        const finalStatus = await fetch(`${baseUrl}/api/governance/self-update/status/${requestId}`);
        const finalData = await finalStatus.json();
        expect(finalData.request.status).toBe('SWAP_COMPLETED');
      } finally {
        server.close();
      }
    });

    it('4.3 POST /api/governance/self-update/rollback restores prior version via REST', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // Missing requestId -> 400
        const badRollback = await fetch(`${baseUrl}/api/governance/self-update/rollback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(badRollback.status).toBe(400);

        // Initiate & Vote
        const initRes = await fetch(`${baseUrl}/api/governance/self-update/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Rollback test' }),
        });
        const { request } = await initRes.json();
        const requestId = request.request_id;

        await fetch(`${baseUrl}/api/governance/self-update/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            votes: [
              { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
              { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
            ],
          }),
        });

        // Execute rollback
        const rollbackRes = await fetch(`${baseUrl}/api/governance/self-update/rollback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        });
        expect(rollbackRes.status).toBe(200);
        const rollbackData = await rollbackRes.json();
        expect(rollbackData.success).toBe(true);
        expect(rollbackData.request.status).toBe('ROLLED_BACK');
      } finally {
        server.close();
      }
    });
  });
});
