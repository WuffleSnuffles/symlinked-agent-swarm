/**
 * test/unit/adversarial-gating-and-atomic-claim.test.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS SUITE (Milestone 1)
 *
 * Focus Areas:
 * 1. Adversarial Gating Tests (CapabilityMatrix, SubswarmManager, Casing, Whitespace, Depth Bypasses)
 * 2. Adversarial Atomic Claim Race (TaskboardManager, High-Concurrency Racing Promises, Mutual Exclusion)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import {
  CapabilityMatrix,
  CapabilityRestrictionError,
  MaxRecursionDepthError,
} from '../../src/server/capability-matrix.js';
import { SubswarmManager, IncidentRecord } from '../../src/server/subswarm-manager.js';
import { TaskboardManager, SwarmTask } from '../../src/server/taskboard-manager.js';
import { ThinkingLevel } from '../../src/server/types/cubicle.js';

describe('Adversarial Stress Suite: Gating & Atomic Claiming', () => {
  let tempRoot: string;
  let swarmDir: string;
  let matrix: CapabilityMatrix;
  let subswarmManager: SubswarmManager;
  let taskboardManager: TaskboardManager;

  beforeEach(async () => {
    tempRoot = path.join(
      os.tmpdir(),
      `panopticon_adversarial_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    );
    swarmDir = path.join(tempRoot, '.swarm');
    await fs.mkdir(swarmDir, { recursive: true });

    matrix = new CapabilityMatrix();
    subswarmManager = new SubswarmManager(swarmDir, matrix);
    await subswarmManager.initialize();

    taskboardManager = new TaskboardManager(swarmDir);
    await taskboardManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. ADVERSARIAL GATING TESTS
  // =========================================================================
  describe('1. Adversarial CapabilityMatrix & Subswarm Gating', () => {
    describe('1.1 Casing, Whitespace, & Delimiter Variations', () => {
      const gptAstraVariations = [
        'gpt-astra',
        'GPT-ASTRA',
        'GPT Astra',
        'gpt astra',
        'gPt AsTrA',
        'gptastra',
        'GPTASTRA',
        '  GPT Astra  ',
        '\tGPT-Astra\n',
        '   gpt astra   ',
        'openai/gpt-astra',
        'gpt-astra-v2',
      ];

      for (const variant of gptAstraVariations) {
        it(`strictly blocks GPT Astra variant "${variant.replace(/[\t\n]/g, '\\t')}" at Very High thinking tier`, () => {
          const evalResult = matrix.evaluate({
            model: variant,
            thinkingLevel: 'Very High',
          });
          expect(evalResult.allowed).toBe(false);

          expect(() =>
            matrix.assertCanSpawn({
              model: variant,
              thinkingLevel: 'Very High',
              cubicleId: 'cubicle-03',
            })
          ).toThrow(CapabilityRestrictionError);
        });
      }

      const gemini4ArgonVariations = [
        'gemini-4-argon',
        'Gemini 4 Argon',
        'GEMINI-4-ARGON',
        'gEmInI 4 aRgOn',
        'gemini4argon',
        'GEMINI4ARGON',
        '  Gemini 4 Argon  ',
        '\tGemini-4-Argon\n',
        'google/gemini-4-argon',
      ];

      for (const variant of gemini4ArgonVariations) {
        it(`authorizes Gemini 4 Argon variant "${variant.replace(/[\t\n]/g, '\\t')}" at High thinking tier`, () => {
          const evalResult = matrix.evaluate({
            model: variant,
            thinkingLevel: 'High',
          });
          expect(evalResult.allowed).toBe(true);

          expect(() =>
            matrix.assertCanSpawn({
              model: variant,
              thinkingLevel: 'High',
              cubicleId: 'cubicle-01',
            })
          ).not.toThrow();
        });
      }

      it('authorizes GPT Astra at Ultra thinking tier across casing variations', () => {
        for (const variant of ['gpt-astra', 'GPT Astra', 'GPT-ASTRA']) {
          const evalResult = matrix.evaluate({
            model: variant,
            thinkingLevel: 'Ultra',
          });
          expect(evalResult.allowed).toBe(true);
        }
      });
    });

    describe('1.2 Exhaustive Thinking Tier Gating Combinations', () => {
      const allTiers: ThinkingLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Ultra'];

      it('verifies full matrix for GPT Astra: ONLY Ultra is allowed, all other tiers are 100% blocked', () => {
        for (const tier of allTiers) {
          const evalResult = matrix.evaluate({
            model: 'gpt-astra',
            thinkingLevel: tier,
          });

          if (tier === 'Ultra') {
            expect(evalResult.allowed).toBe(true);
          } else {
            expect(evalResult.allowed).toBe(false);
            expect(() =>
              matrix.assertCanSpawn({
                model: 'gpt-astra',
                thinkingLevel: tier,
              })
            ).toThrow(CapabilityRestrictionError);
          }
        }
      });

      it('verifies full matrix for Gemini 4 Argon: High and Ultra are allowed, others blocked', () => {
        for (const tier of allTiers) {
          const evalResult = matrix.evaluate({
            model: 'gemini-4-argon',
            thinkingLevel: tier,
          });

          if (tier === 'High' || tier === 'Ultra') {
            expect(evalResult.allowed).toBe(true);
          } else {
            expect(evalResult.allowed).toBe(false);
            expect(() =>
              matrix.assertCanSpawn({
                model: 'gemini-4-argon',
                thinkingLevel: tier,
              })
            ).toThrow(CapabilityRestrictionError);
          }
        }
      });

      it('verifies universal models: Ultra allowed, Low and Medium blocked, unlisted High/Very High fallback blocked', () => {
        const testModels = ['claude-3-7-sonnet', 'deepseek-v3', 'custom-cli-agent'];
        for (const model of testModels) {
          expect(matrix.evaluate({ model, thinkingLevel: 'Ultra' }).allowed).toBe(true);
          expect(matrix.evaluate({ model, thinkingLevel: 'Low' }).allowed).toBe(false);
          expect(matrix.evaluate({ model, thinkingLevel: 'Medium' }).allowed).toBe(false);
          expect(matrix.evaluate({ model, thinkingLevel: 'High' }).allowed).toBe(false);
          expect(matrix.evaluate({ model, thinkingLevel: 'Very High' }).allowed).toBe(false);
        }
      });
    });

    describe('1.3 Adversarial Recursion Depth & Invariant Precedence', () => {
      it('allows depth 0 (top-level cubicle)', () => {
        expect(() =>
          matrix.assertCanSpawn({
            model: 'gemini-4-argon',
            thinkingLevel: 'High',
            currentDepth: 0,
          })
        ).not.toThrow();
      });

      const adversarialDepths = [1, 2, 3, 5, 10, 100, Number.MAX_SAFE_INTEGER, Infinity];
      for (const depth of adversarialDepths) {
        it(`strictly blocks recursion depth ${depth} with MaxRecursionDepthError`, () => {
          expect(() =>
            matrix.evaluate({
              model: 'gemini-4-argon',
              thinkingLevel: 'High',
              currentDepth: depth,
            })
          ).toThrow(MaxRecursionDepthError);
        });
      }

      it('ASSERT CRITICAL INVARIANT: manualOverride: true CANNOT bypass recursion depth cap (max_depth=1)', () => {
        // Even if an administrator attempts to force manualOverride = true on child sub-worker,
        // recursion depth invariant check precedes override evaluation.
        expect(() =>
          matrix.evaluate({
            model: 'gemini-4-argon',
            thinkingLevel: 'High',
            currentDepth: 1,
            manualOverride: true,
          })
        ).toThrow(MaxRecursionDepthError);

        expect(() =>
          matrix.assertCanSpawn({
            model: 'gpt-astra',
            thinkingLevel: 'Ultra',
            currentDepth: 2,
            manualOverride: true,
          })
        ).toThrow(MaxRecursionDepthError);
      });
    });

    describe('1.4 SubswarmManager Interception & Incident Alerting', () => {
      it('intercepts GPT Astra (Very High) spawn, emits alert, and logs incident to incidents.jsonl', async () => {
        const emittedAlerts: any[] = [];
        subswarmManager.onEvent((event) => {
          if (event.type === 'INCIDENT_ALERT') emittedAlerts.push(event.payload);
        });

        await expect(
          subswarmManager.spawnSubswarm({
            cubicleId: 'cubicle-03',
            parentTaskId: 'task-adv-001',
            model: 'GPT Astra',
            thinkingLevel: 'Very High',
            goal: 'Unauthorized recursive subswarm',
          })
        ).rejects.toThrow(CapabilityRestrictionError);

        expect(emittedAlerts).toHaveLength(1);
        expect(emittedAlerts[0].focus_cubicle).toBe('cubicle-03');
        expect(emittedAlerts[0].twin_sauron_mode).toBe('CONVERGE_OFFENDING_CUBICLE');

        const incidents = await subswarmManager.readIncidents();
        expect(incidents.length).toBeGreaterThanOrEqual(1);
        const inc = incidents[0];
        expect(inc.cubicle_id).toBe('cubicle-03');
        expect(inc.type).toBe('CAPABILITY_VIOLATION');
        expect(inc.severity).toBe('BLOCKED');
        expect(inc.twin_sauron_mode).toBe('CONVERGE_OFFENDING_CUBICLE');
      });

      it('intercepts recursion depth >= 1, emits alert with MAX_RECURSION_VIOLATION', async () => {
        const emittedAlerts: any[] = [];
        subswarmManager.onEvent((event) => {
          if (event.type === 'INCIDENT_ALERT') emittedAlerts.push(event.payload);
        });

        await expect(
          subswarmManager.spawnSubswarm({
            cubicleId: 'cubicle-01',
            parentTaskId: 'task-adv-002',
            model: 'gemini-4-argon',
            thinkingLevel: 'High',
            goal: 'Grandchild subswarm attempt',
            currentDepth: 1, // drone attempting to spawn grandchild
          })
        ).rejects.toThrow(MaxRecursionDepthError);

        expect(emittedAlerts).toHaveLength(1);
        const incidents = await subswarmManager.readIncidents();
        const inc = incidents[0];
        expect(inc.cubicle_id).toBe('cubicle-01');
        expect(inc.type).toBe('MAX_RECURSION_VIOLATION');
        expect(inc.severity).toBe('BLOCKED');
      });
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL ATOMIC CLAIM RACE TESTS
  // =========================================================================
  describe('2. Adversarial Atomic Claim Race (TaskboardManager Concurrency)', () => {
    it('EMPIRICAL STRESS TEST: 50 concurrent workers racing to claim 1 task -> exactly 1 winner, 49 losers (null), 0 double claims, 0 unhandled exceptions', async () => {
      const contestedTaskId = 'task-race-50-workers';
      await taskboardManager.createTask({
        id: contestedTaskId,
        title: '50-Worker Race Challenge',
        description: '50 cubicle agents attempt atomic claim concurrently',
        priority: 'CRITICAL',
      });

      const workerCount = 50;
      const workerIds = Array.from({ length: workerCount }, (_, i) => `cubicle-${String(i + 1).padStart(2, '0')}`);

      // Launch all 50 claims concurrently via Promise.all
      const results: Array<SwarmTask | null> = await Promise.all(
        workerIds.map((cubicleId) => taskboardManager.claimTask(cubicleId, contestedTaskId))
      );

      // Verify mutual exclusion:
      const winners = results.filter((r): r is SwarmTask => r !== null);
      const losers = results.filter((r) => r === null);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(49);

      const winner = winners[0];
      expect(winner.id).toBe(contestedTaskId);
      expect(winner.column).toBe('in_progress');
      expect(workerIds).toContain(winner.assigned_cubicle);

      // Verify filesystem state on disk:
      const todoFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'todo'));
      const inProgressFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'in_progress'));

      expect(todoFiles.filter((f) => f.endsWith('.json'))).toHaveLength(0);
      expect(inProgressFiles.filter((f) => f.endsWith('.json'))).toHaveLength(1);
      expect(inProgressFiles).toContain(`${contestedTaskId}.json`);

      // Verify content of in_progress file matches winning worker
      const rawDisk = await fs.readFile(
        path.join(swarmDir, 'tasks', 'in_progress', `${contestedTaskId}.json`),
        'utf8'
      );
      const parsedDisk: SwarmTask = JSON.parse(rawDisk);
      expect(parsedDisk.assigned_cubicle).toBe(winner.assigned_cubicle);
      expect(parsedDisk.column).toBe('in_progress');
    });

    it('EMPIRICAL STRESS TEST: 100 concurrent workers racing to claim 1 task -> exactly 1 winner, 99 losers (null)', async () => {
      const contestedTaskId = 'task-race-100-workers';
      await taskboardManager.createTask({
        id: contestedTaskId,
        title: '100-Worker Mega Race',
        description: '100 racing promises',
        priority: 'CRITICAL',
      });

      const workerCount = 100;
      const workerIds = Array.from({ length: workerCount }, (_, i) => `worker-${String(i + 1).padStart(3, '0')}`);

      const results = await Promise.all(
        workerIds.map((id) => taskboardManager.claimTask(id, contestedTaskId))
      );

      const winners = results.filter((r) => r !== null);
      const losers = results.filter((r) => r === null);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(99);
    });

    it('EMPIRICAL STRESS TEST: Multi-task race (5 tasks contested by 30 workers without specificTaskId)', async () => {
      // Create 5 tasks in todo queue
      for (let i = 1; i <= 5; i++) {
        await taskboardManager.createTask({
          id: `task-multi-batch-${i}`,
          title: `Batch Task ${i}`,
          description: 'Testing multi-task claiming',
          priority: 'HIGH',
        });
      }

      // 30 workers attempt to claim whatever task is available next in queue
      const workerIds = Array.from({ length: 30 }, (_, i) => `cubicle-${String(i + 1).padStart(2, '0')}`);

      // Round 1 of racing
      const round1Results = await Promise.all(
        workerIds.map((id) => taskboardManager.claimTask(id))
      );

      // In Round 1, all 30 workers read todo simultaneously and target the first sorted file.
      // Exactly 1 winner gets that file, remaining 29 get null due to ENOENT.
      const round1Winners = round1Results.filter((r) => r !== null);
      expect(round1Winners.length).toBeGreaterThanOrEqual(1);

      // Verify that no task was double claimed
      const claimedIds = round1Winners.map((w) => w!.id);
      const uniqueClaimedIds = new Set(claimedIds);
      expect(claimedIds.length).toBe(uniqueClaimedIds.size);

      // Check remaining tasks in todo + claimed tasks in in_progress
      const todoFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'todo'));
      const inProgressFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'in_progress'));
      expect(todoFiles.length + inProgressFiles.length).toBe(5);
    });

    it('EMPIRICAL EDGE CASE: Non-existent task ID claim returns null with zero unhandled exceptions', async () => {
      const claimResult = await taskboardManager.claimTask('cubicle-01', 'non-existent-task-id-999');
      expect(claimResult).toBeNull();

      // Concurrent race for non-existent task
      const results = await Promise.all([
        taskboardManager.claimTask('cubicle-01', 'non-existent-task-id-999'),
        taskboardManager.claimTask('cubicle-02', 'non-existent-task-id-999'),
        taskboardManager.claimTask('cubicle-03', 'non-existent-task-id-999'),
      ]);
      expect(results).toEqual([null, null, null]);
    });

    it('EMPIRICAL EDGE CASE: Claiming an already claimed task returns null immediately', async () => {
      const taskId = 'task-double-claim-prevention';
      await taskboardManager.createTask({
        id: taskId,
        title: 'Double Claim Prevention Task',
        description: 'Verify sequential double claim is impossible',
        priority: 'MEDIUM',
      });

      // First claim succeeds
      const firstClaim = await taskboardManager.claimTask('cubicle-01', taskId);
      expect(firstClaim).not.toBeNull();
      expect(firstClaim?.assigned_cubicle).toBe('cubicle-01');

      // Second claim on same task ID fails and returns null
      const secondClaim = await taskboardManager.claimTask('cubicle-02', taskId);
      expect(secondClaim).toBeNull();

      // Third claim also returns null
      const thirdClaim = await taskboardManager.claimTask('cubicle-03', taskId);
      expect(thirdClaim).toBeNull();
    });

    it('EMPIRICAL STRESS TEST: Rapid atomic transitions (todo -> in_progress -> review -> done) with zero data corruption', async () => {
      const taskId = 'task-full-lifecycle';
      await taskboardManager.createTask({
        id: taskId,
        title: 'Full Lifecycle Transition',
        description: 'Testing state transitions and integrity',
        priority: 'HIGH',
      });

      // 1. Claim
      const claimed = await taskboardManager.claimTask('cubicle-01', taskId);
      expect(claimed?.column).toBe('in_progress');

      // 2. Progress update
      const updated = await taskboardManager.updateTaskProgress(taskId, {
        progress_percent: 80,
        subswarm_active: true,
      });
      expect(updated.progress_percent).toBe(80);
      expect(updated.subswarm_active).toBe(true);

      // 3. Submit for review
      const inReview = await taskboardManager.submitForReview(taskId, {
        verificationPassed: true,
      });
      expect(inReview.column).toBe('review');
      expect(inReview.progress_percent).toBe(95);

      // 4. Consular Veto revision
      const revised = await taskboardManager.returnToRevision(taskId, {
        consul: 'Consul I',
        rationale: 'Edge case test failure',
      });
      expect(revised.column).toBe('in_progress');
      expect(revised.veto_history).toHaveLength(1);

      // 5. Re-submit and complete
      await taskboardManager.submitForReview(taskId);
      const completed = await taskboardManager.completeTask(taskId);
      expect(completed.column).toBe('done');
      expect(completed.progress_percent).toBe(100);

      // Verify TASKBOARD.md reflects final done status
      const mdPath = path.join(swarmDir, 'TASKBOARD.md');
      const mdContent = await fs.readFile(mdPath, 'utf8');
      expect(mdContent).toContain('Overall Mission Progress');
      expect(mdContent).toContain(taskId);
    });
  });
});
