/**
 * test/unit/adversarial-empirical-m2-6.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (Milestone 2 Iteration 4)
 * Author: Challenger M2-6 (teamwork_preview_challenger)
 *
 * Empirical Challenge Focus:
 * 1. Git Time-Machine Checkpoints (.swarm/checkpoints/):
 *    - Creation with Git commit SHA and full task snapshot across all 4 columns.
 *    - Complete multi-column taskboard state restoration on rollback.
 *    - Rejection of invalid / non-existent checkpoint IDs.
 * 2. Inter-Cubicle Shared Contracts (.swarm/contracts/):
 *    - Rejection of invalid schema structures (primitives, arrays, objects lacking type/properties/$schema).
 *    - Name cleansing and schema file persistence.
 *    - Runtime validatePayload across type matches, required fields, and property types.
 * 3. Merge-Conflict Shield & File Locks (.swarm/locks/):
 *    - Atomic lock acquisition via flag 'wx' and duplicate acquisition rejection.
 *    - Lease renewal for same-cubicle requests.
 *    - Stale lock TTL expiration (5 minutes default).
 *    - Safe disaster recovery and overwrite of corrupt lock files in acquireLock and releaseLock.
 *    - Rogue release protection (cannot release lock owned by another cubicle).
 * 4. Infinite-Loop Circuit Breaker (.swarm/status/):
 *    - Trip at >= 3 consecutive errors.
 *    - Verification of in-memory state transition to status = 'error'.
 *    - Immediate persistence of status = 'error' and surface thoughts to disk in .swarm/status/cubicle-XX.json.
 *    - Reset of consecutive error count and re-trip prevention.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';

describe('Challenger M2-6: Empirical Adversarial Challenge Suite (Iteration 4)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m2_6');

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

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // 1. GIT TIME-MACHINE CHECKPOINTS (.swarm/checkpoints/)
  // =========================================================================
  describe('1. Git Time-Machine Checkpoints & Multi-Column Taskboard Restoration', () => {
    it('creates checkpoint capturing git commit hash and task states across all 4 columns', async () => {
      // 1. Seed tasks into todo, in_progress, review, done
      const tTodo = await taskboardManager.createTask({
        id: 'task-chk-todo-1',
        title: 'Pending Todo Task',
        description: 'Should be in todo',
        priority: 'HIGH',
      });
      const tProg = await taskboardManager.createTask({
        id: 'task-chk-prog-1',
        title: 'Active Work Task',
        description: 'Should be in in_progress',
        priority: 'MEDIUM',
      });
      await taskboardManager.claimTask('cubicle-01', 'task-chk-prog-1');

      const tRev = await taskboardManager.createTask({
        id: 'task-chk-rev-1',
        title: 'Review Candidate Task',
        description: 'Should be in review',
        priority: 'MEDIUM',
      });
      await taskboardManager.claimTask('cubicle-02', 'task-chk-rev-1');
      await taskboardManager.submitForReview('task-chk-rev-1');

      const tDone = await taskboardManager.createTask({
        id: 'task-chk-done-1',
        title: 'Completed Task',
        description: 'Should be in done',
        priority: 'LOW',
      });
      await taskboardManager.claimTask('cubicle-03', 'task-chk-done-1');
      await taskboardManager.submitForReview('task-chk-done-1');
      await taskboardManager.completeTask('task-chk-done-1');

      // 2. Create checkpoint
      const chk = await consularEngine.createCheckpoint('Multi-Column Snapshot Milestone 2');
      expect(chk.checkpoint_id).toMatch(/^chk-\d+-[a-z0-9]+$/);
      expect(chk.label).toBe('Multi-Column Snapshot Milestone 2');
      expect(chk.timestamp).toBeDefined();
      expect(chk.git_commit).toBeDefined();
      expect(typeof chk.git_commit).toBe('string');
      expect(chk.git_commit!.length).toBeGreaterThanOrEqual(4);

      // Verify task snapshot structure
      expect(chk.tasks).toBeDefined();
      expect(chk.tasks.todo.some((t: any) => t.id === 'task-chk-todo-1')).toBe(true);
      expect(chk.tasks.in_progress.some((t: any) => t.id === 'task-chk-prog-1')).toBe(true);
      expect(chk.tasks.review.some((t: any) => t.id === 'task-chk-rev-1')).toBe(true);
      expect(chk.tasks.done.some((t: any) => t.id === 'task-chk-done-1')).toBe(true);

      // Verify persisted file on disk
      const chkPath = path.join(sandbox.swarmDir, 'checkpoints', `${chk.checkpoint_id}.json`);
      const diskData = JSON.parse(await fs.readFile(chkPath, 'utf8'));
      expect(diskData.checkpoint_id).toBe(chk.checkpoint_id);
      expect(diskData.tasks.todo).toHaveLength(1);
      expect(diskData.tasks.in_progress).toHaveLength(1);
      expect(diskData.tasks.review).toHaveLength(1);
      expect(diskData.tasks.done).toHaveLength(1);
    });

    it('rolls back taskboard state cleanly restoring snapshot across columns and purging post-checkpoint tasks', async () => {
      // 1. Initial snapshot with 1 task in todo and 1 in done
      await taskboardManager.createTask({
        id: 'task-anchor-todo',
        title: 'Anchor Todo Task',
        description: 'Must survive rollback',
        priority: 'HIGH',
      });
      const tDone = await taskboardManager.createTask({
        id: 'task-anchor-done',
        title: 'Anchor Done Task',
        description: 'Must remain done',
        priority: 'MEDIUM',
      });
      await taskboardManager.claimTask('cubicle-01', 'task-anchor-done');
      await taskboardManager.submitForReview('task-anchor-done');
      await taskboardManager.completeTask('task-anchor-done');

      const chk = await consularEngine.createCheckpoint('Pre-Mutation Checkpoint');

      // 2. Radical mutation:
      // - Move anchor todo task to in_progress
      await taskboardManager.claimTask('cubicle-02', 'task-anchor-todo');
      // - Create rogue tasks in todo and review
      await taskboardManager.createTask({
        id: 'rogue-task-todo',
        title: 'Rogue Todo Task',
        description: 'Must disappear after rollback',
        priority: 'LOW',
      });
      const tRogueRev = await taskboardManager.createTask({
        id: 'rogue-task-rev',
        title: 'Rogue Review Task',
        description: 'Must disappear after rollback',
        priority: 'LOW',
      });
      await taskboardManager.claimTask('cubicle-03', 'rogue-task-rev');
      await taskboardManager.submitForReview('rogue-task-rev');

      // Verify mutated state before rollback
      const mutated = await taskboardManager.listAllTasks();
      expect(mutated.todo.some((t: any) => t.id === 'rogue-task-todo')).toBe(true);
      expect(mutated.in_progress.some((t: any) => t.id === 'task-anchor-todo')).toBe(true);
      expect(mutated.review.some((t: any) => t.id === 'rogue-task-rev')).toBe(true);

      // 3. Rollback checkpoint
      const rollbackResult = await consularEngine.rollbackCheckpoint(chk.checkpoint_id);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolled_back_to).toBe(chk.checkpoint_id);
      expect(rollbackResult.tasks_restored).toBe(2);

      // 4. Verify post-rollback taskboard state matches original snapshot exactly
      const restored = await taskboardManager.listAllTasks();
      // Anchor todo must be back in todo, NOT in_progress
      expect(restored.todo.some((t: any) => t.id === 'task-anchor-todo')).toBe(true);
      expect(restored.in_progress.some((t: any) => t.id === 'task-anchor-todo')).toBe(false);
      // Anchor done must still be in done
      expect(restored.done.some((t: any) => t.id === 'task-anchor-done')).toBe(true);
      // Rogue tasks must be completely purged from all columns
      expect(restored.todo.some((t: any) => t.id === 'rogue-task-todo')).toBe(false);
      expect(restored.review.some((t: any) => t.id === 'rogue-task-rev')).toBe(false);
      expect(restored.in_progress).toHaveLength(0);
      expect(restored.review).toHaveLength(0);
    });

    it('handles empty taskboard snapshot and purges subsequent tasks on rollback', async () => {
      // Create checkpoint when taskboard is completely empty
      const emptyChk = await consularEngine.createCheckpoint('Empty Taskboard Snapshot');
      expect(emptyChk.tasks.todo).toHaveLength(0);
      expect(emptyChk.tasks.in_progress).toHaveLength(0);
      expect(emptyChk.tasks.review).toHaveLength(0);
      expect(emptyChk.tasks.done).toHaveLength(0);

      // Create new tasks across columns
      await taskboardManager.createTask({
        id: 'transient-todo',
        title: 'Transient Todo',
        priority: 'LOW',
      });
      await taskboardManager.createTask({
        id: 'transient-done',
        title: 'Transient Done',
        priority: 'LOW',
      });
      await taskboardManager.claimTask('cubicle-01', 'transient-done');
      await taskboardManager.submitForReview('transient-done');
      await taskboardManager.completeTask('transient-done');

      // Verify board has tasks
      const beforeRollback = await taskboardManager.listAllTasks();
      expect(beforeRollback.todo).toHaveLength(1);
      expect(beforeRollback.done).toHaveLength(1);

      // Rollback to empty snapshot
      const rollback = await consularEngine.rollbackCheckpoint(emptyChk.checkpoint_id);
      expect(rollback.success).toBe(true);

      // Verify all columns are empty
      const afterRollback = await taskboardManager.listAllTasks();
      expect(afterRollback.todo).toHaveLength(0);
      expect(afterRollback.in_progress).toHaveLength(0);
      expect(afterRollback.review).toHaveLength(0);
      expect(afterRollback.done).toHaveLength(0);
    });

    it('rejects rollback for non-existent checkpoint ID with descriptive error', async () => {
      await expect(
        consularEngine.rollbackCheckpoint('chk-does-not-exist-xyz')
      ).rejects.toThrow(/Checkpoint not found: chk-does-not-exist-xyz/);
    });
  });

  // =========================================================================
  // 2. INTER-CUBICLE SHARED CONTRACTS (.swarm/contracts/)
  // =========================================================================
  describe('2. Inter-Cubicle Shared Contracts & Payload Validation', () => {
    it('strictly rejects invalid schema structures during registerContract', async () => {
      // Null / undefined / primitive rejections
      await expect(
        consularEngine.registerContract('bad_null', null as any, 'cubicle-01')
      ).rejects.toThrow(/Schema must be a valid non-null object/);

      await expect(
        consularEngine.registerContract('bad_string', 'not a schema object' as any, 'cubicle-01')
      ).rejects.toThrow(/Schema must be a valid non-null object/);

      await expect(
        consularEngine.registerContract('bad_array', [{ type: 'string' }] as any, 'cubicle-01')
      ).rejects.toThrow(/Schema must be a valid non-null object/);

      // Objects lacking type, properties, or $schema
      await expect(
        consularEngine.registerContract('bad_empty_obj', {} as any, 'cubicle-01')
      ).rejects.toThrow(/Schema must define 'type', 'properties', or '\$schema'/);

      await expect(
        consularEngine.registerContract('bad_irrelevant_keys', { author: 'Alice', version: 1 } as any, 'cubicle-01')
      ).rejects.toThrow(/Schema must define 'type', 'properties', or '\$schema'/);
    });

    it('sanitizes contract name, persists contract to disk, and retrieves cleanly', async () => {
      const reg = await consularEngine.registerContract(
        'payment/processor:v2',
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            transactionId: { type: 'string' },
          },
        },
        'cubicle-04'
      );
      expect(reg.name).toBe('payment_processor_v2');

      const retrieved = await consularEngine.getContract('payment_processor_v2');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('payment_processor_v2');
      expect(retrieved?.providerCubicle).toBe('cubicle-04');

      const diskPath = path.join(sandbox.swarmDir, 'contracts', 'payment_processor_v2.json');
      const diskRaw = JSON.parse(await fs.readFile(diskPath, 'utf8'));
      expect(diskRaw.schema.properties.transactionId.type).toBe('string');
    });

    it('validates payloads against complex schema using validatePayload', async () => {
      await consularEngine.registerContract(
        'user_registration',
        {
          type: 'object',
          required: ['userId', 'email', 'tags'],
          properties: {
            userId: { type: 'number' },
            email: { type: 'string' },
            tags: { type: 'array' },
            metadata: { type: 'object' },
            isVerified: { type: 'boolean' },
          },
        },
        'cubicle-02'
      );

      // 1. Valid conforming payload
      const validRes = await consularEngine.validatePayload('user_registration', {
        userId: 1042,
        email: 'agent@swarm.internal',
        tags: ['bot', 'worker'],
        metadata: { region: 'us-east' },
        isVerified: true,
      });
      expect(validRes.valid).toBe(true);
      expect(validRes.errors).toBeUndefined();

      // 2. Missing required fields
      const missingRes = await consularEngine.validatePayload('user_registration', {
        userId: 1042,
        // missing email and tags
      });
      expect(missingRes.valid).toBe(false);
      expect(missingRes.errors).toBeDefined();
      expect(missingRes.errors!.some((e) => e.includes("Missing required field: 'email'"))).toBe(true);
      expect(missingRes.errors!.some((e) => e.includes("Missing required field: 'tags'"))).toBe(true);

      // 3. Property type mismatches
      const typeMismatchRes = await consularEngine.validatePayload('user_registration', {
        userId: 'string_instead_of_number',
        email: 12345,
        tags: 'string_instead_of_array',
        metadata: 'string_instead_of_object',
      });
      expect(typeMismatchRes.valid).toBe(false);
      expect(typeMismatchRes.errors!.some((e) => e.includes("Field 'userId' expected number"))).toBe(true);
      expect(typeMismatchRes.errors!.some((e) => e.includes("Field 'email' expected string"))).toBe(true);
      expect(typeMismatchRes.errors!.some((e) => e.includes("Field 'tags' expected array"))).toBe(true);
      expect(typeMismatchRes.errors!.some((e) => e.includes("Field 'metadata' expected object"))).toBe(true);

      // 4. Root type mismatch (e.g. array when object expected)
      const rootMismatchRes = await consularEngine.validatePayload('user_registration', ['not an object']);
      expect(rootMismatchRes.valid).toBe(false);
      expect(rootMismatchRes.errors!.some((e) => e.includes('Expected object payload'))).toBe(true);

      // 5. Non-existent contract error
      await expect(
        consularEngine.validatePayload('non_existent_contract', { foo: 'bar' })
      ).rejects.toThrow(/Contract not found: non_existent_contract/);
    });

    it('handles array schemas and meta-schemas with $schema', async () => {
      // Register array contract
      await consularEngine.registerContract(
        'batch_event_list',
        {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'array',
        },
        'cubicle-03'
      );

      // Valid array payload
      const validArray = await consularEngine.validatePayload('batch_event_list', ['event1', 'event2']);
      expect(validArray.valid).toBe(true);

      // Invalid non-array payload
      const invalidArray = await consularEngine.validatePayload('batch_event_list', { not: 'an array' });
      expect(invalidArray.valid).toBe(false);
      expect(invalidArray.errors!.some((e) => e.includes('Expected array payload'))).toBe(true);
    });
  });

  // =========================================================================
  // 3. MERGE-CONFLICT SHIELD & FILE LOCKS (TOCTOU, TTL, CORRUPT RECOVERY)
  // =========================================================================
  describe('3. File Locks Concurrency, Duplicate Blocks, TTL & Corruption Recovery', () => {
    it('acquires lock atomically with flag wx and blocks duplicate acquisition by another cubicle', async () => {
      const lock1 = await consularEngine.acquireLock('src/common/state.ts', 'cubicle-01');
      expect(lock1.acquired).toBe(true);
      expect(lock1.lockPath).toBeDefined();

      // Duplicate attempt by different cubicle must be blocked
      const lock2 = await consularEngine.acquireLock('src/common/state.ts', 'cubicle-02');
      expect(lock2.acquired).toBe(false);
      expect(lock2.currentOwner).toBe('cubicle-01');
      expect(lock2.lockPath).toBe(lock1.lockPath);
    });

    it('permits lease renewal when the same cubicle re-acquires its own lock', async () => {
      const initial = await consularEngine.acquireLock('src/common/shared.ts', 'cubicle-01');
      expect(initial.acquired).toBe(true);

      const renewal = await consularEngine.acquireLock('src/common/shared.ts', 'cubicle-01');
      expect(renewal.acquired).toBe(true);
      expect(renewal.lockPath).toBe(initial.lockPath);
    });

    it('automatically expires stale lock after 5-minute TTL allowing new cubicle to acquire', async () => {
      const lockFileName = (consularEngine as any).getLockFileName('src/server/stale-service.ts');
      const lockFilePath = path.join(sandbox.swarmDir, 'locks', lockFileName);

      // Write stale lock file with acquiredAt set to 10 minutes ago
      const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await fs.writeFile(
        lockFilePath,
        JSON.stringify({
          filePath: 'src/server/stale-service.ts',
          cubicleId: 'cubicle-dead-worker',
          acquiredAt: staleTimestamp,
        }, null, 2),
        'utf8'
      );

      // New cubicle attempts acquisition; should detect TTL expiration and claim lock
      const claim = await consularEngine.acquireLock('src/server/stale-service.ts', 'cubicle-05');
      expect(claim.acquired).toBe(true);

      // Verify file now belongs to cubicle-05
      const updated = JSON.parse(await fs.readFile(lockFilePath, 'utf8'));
      expect(updated.cubicleId).toBe('cubicle-05');
    });

    it('safely recovers and overwrites corrupt lock file in acquireLock', async () => {
      const lockFileName = (consularEngine as any).getLockFileName('src/server/corrupt-acquire.ts');
      const lockFilePath = path.join(sandbox.swarmDir, 'locks', lockFileName);

      // Write corrupt invalid JSON
      await fs.writeFile(lockFilePath, 'CORRUPT_BYTES_NOT_JSON{{{', 'utf8');

      // acquireLock must not crash, must recover and take ownership
      const recovery = await consularEngine.acquireLock('src/server/corrupt-acquire.ts', 'cubicle-06');
      expect(recovery.acquired).toBe(true);

      const diskRaw = JSON.parse(await fs.readFile(lockFilePath, 'utf8'));
      expect(diskRaw.cubicleId).toBe('cubicle-06');
    });

    it('safely recovers and overwrites 0-byte empty lock file in acquireLock', async () => {
      const lockFileName = (consularEngine as any).getLockFileName('src/server/empty-zero-byte.ts');
      const lockFilePath = path.join(sandbox.swarmDir, 'locks', lockFileName);

      // Write 0-byte empty file
      await fs.writeFile(lockFilePath, '', 'utf8');

      // acquireLock must safely recover and claim
      const recovery = await consularEngine.acquireLock('src/server/empty-zero-byte.ts', 'cubicle-09');
      expect(recovery.acquired).toBe(true);

      const diskRaw = JSON.parse(await fs.readFile(lockFilePath, 'utf8'));
      expect(diskRaw.cubicleId).toBe('cubicle-09');
    });

    it('safely recovers and unlinks corrupt lock file in releaseLock', async () => {
      const lockFileName = (consularEngine as any).getLockFileName('src/server/corrupt-release.ts');
      const lockFilePath = path.join(sandbox.swarmDir, 'locks', lockFileName);

      // Write corrupt non-JSON file
      await fs.writeFile(lockFilePath, '<<<INVALID_JSON>>>', 'utf8');

      // releaseLock must safely unlink corrupt file and return released: true
      const rel = await consularEngine.releaseLock('src/server/corrupt-release.ts', 'cubicle-01');
      expect(rel.released).toBe(true);

      // Verify file is gone from disk
      const exists = await fs.access(lockFilePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('protects against rogue release by unauthorized cubicle', async () => {
      await consularEngine.acquireLock('src/server/guarded.ts', 'cubicle-01');

      // Unauthorized cubicle-02 attempts release
      const rogueRelease = await consularEngine.releaseLock('src/server/guarded.ts', 'cubicle-02');
      expect(rogueRelease.released).toBe(false);

      // Genuine owner can release
      const ownerRelease = await consularEngine.releaseLock('src/server/guarded.ts', 'cubicle-01');
      expect(ownerRelease.released).toBe(true);
    });
  });

  // =========================================================================
  // 4. INFINITE-LOOP CIRCUIT BREAKER STATE PERSISTENCE
  // =========================================================================
  describe('4. Infinite-Loop Circuit Breaker Disk Persistence', () => {
    it('trips circuit breaker at exactly 3 errors and persists status=error to disk', async () => {
      cubicleManager.resetErrorCount('cubicle-07');

      // 1. Error 1: does not trip
      const err1 = cubicleManager.recordError('cubicle-07', 'SyntaxError: unexpected token');
      expect(err1.trippedCircuitBreaker).toBe(false);
      expect(err1.count).toBe(1);
      expect(cubicleManager.getCubicle('cubicle-07').status).not.toBe('error');

      // 2. Error 2: does not trip
      const err2 = cubicleManager.recordError('cubicle-07', 'TypeError: cannot read property undefined');
      expect(err2.trippedCircuitBreaker).toBe(false);
      expect(err2.count).toBe(2);
      expect(cubicleManager.getCubicle('cubicle-07').status).not.toBe('error');

      // 3. Error 3: trips circuit breaker
      const err3 = cubicleManager.recordError('cubicle-07', 'FatalLoopError: max stack size exceeded');
      expect(err3.trippedCircuitBreaker).toBe(true);
      expect(err3.count).toBe(3);

      const live = cubicleManager.getCubicle('cubicle-07');
      expect(live.status).toBe('error');
      expect(live.surface_thoughts).toContain('Circuit breaker tripped: >= 3 consecutive errors (3)');

      // 4. Verify disk persistence in .swarm/status/cubicle-07.json
      // Wait brief flush tick for async saveStatusFile
      await new Promise((resolve) => setTimeout(resolve, 60));

      const statusPath = path.join(sandbox.swarmDir, 'status', 'cubicle-07.json');
      const diskRaw = JSON.parse(await fs.readFile(statusPath, 'utf8'));

      expect(diskRaw.id).toBe('cubicle-07');
      expect(diskRaw.status).toBe('error');
      expect(diskRaw.surface_thoughts).toContain('Circuit breaker tripped: >= 3 consecutive errors (3)');
      expect(diskRaw.error_details).toBeDefined();
      expect(diskRaw.error_details.message).toBe('FatalLoopError: max stack size exceeded');
    });

    it('resets error counter and allows recovery without premature tripping', async () => {
      cubicleManager.resetErrorCount('cubicle-08');

      cubicleManager.recordError('cubicle-08', 'Intermittent glitch 1');
      cubicleManager.recordError('cubicle-08', 'Intermittent glitch 2');

      // Reset error count (e.g. after health check or task completion)
      cubicleManager.resetErrorCount('cubicle-08');

      // Next error should start count back at 1 and not trip
      const nextErr = cubicleManager.recordError('cubicle-08', 'Subsequent error');
      expect(nextErr.count).toBe(1);
      expect(nextErr.trippedCircuitBreaker).toBe(false);
      expect(cubicleManager.getCubicle('cubicle-08').status).not.toBe('error');
    });

    it('maintains status=error on 4th and subsequent consecutive errors after breaker is tripped', async () => {
      cubicleManager.resetErrorCount('cubicle-10');

      cubicleManager.recordError('cubicle-10', 'Error 1');
      cubicleManager.recordError('cubicle-10', 'Error 2');
      const err3 = cubicleManager.recordError('cubicle-10', 'Error 3');
      expect(err3.trippedCircuitBreaker).toBe(true);
      expect(cubicleManager.getCubicle('cubicle-10').status).toBe('error');

      // 4th consecutive error
      const err4 = cubicleManager.recordError('cubicle-10', 'Error 4');
      expect(err4.trippedCircuitBreaker).toBe(true);
      expect(err4.count).toBe(4);
      expect(cubicleManager.getCubicle('cubicle-10').status).toBe('error');
      expect(cubicleManager.getCubicle('cubicle-10').surface_thoughts).toContain('Circuit breaker tripped: >= 3 consecutive errors (4)');
    });
  });
});
