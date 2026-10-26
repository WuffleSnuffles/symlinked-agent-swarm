/**
 * test/unit/capability-matrix.test.ts
 *
 * Unit tests for Thinking-Tier Capability Gating Matrix, Subswarm Management,
 * Recursion Limits, and Incident Alerting (Feature 2).
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
import { SubswarmManager } from '../../src/server/subswarm-manager.js';

describe('Feature 2: Thinking-Tier Capability Matrix & Subswarms', () => {
  let matrix: CapabilityMatrix;
  let tempDir: string;
  let swarmDir: string;
  let subswarmManager: SubswarmManager;

  beforeEach(async () => {
    matrix = new CapabilityMatrix();
    tempDir = path.join(os.tmpdir(), `subswarm_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    swarmDir = path.join(tempDir, '.swarm');
    await fs.mkdir(swarmDir, { recursive: true });
    subswarmManager = new SubswarmManager(swarmDir, matrix);
    await subswarmManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Capability Matrix Evaluation Rules', () => {
    it('authorizes Gemini 4 Argon at High thinking level (can_spawn_subswarm = true)', () => {
      const result = matrix.evaluate({
        model: 'gemini-4-argon',
        thinkingLevel: 'High',
      });
      expect(result.allowed).toBe(true);
      expect(() =>
        matrix.assertCanSpawn({
          model: 'gemini-4-argon',
          thinkingLevel: 'High',
        })
      ).not.toThrow();
    });

    it('strictly RESTRICTS GPT Astra at Very High thinking level (can_spawn_subswarm = false)', () => {
      const result = matrix.evaluate({
        model: 'gpt-astra',
        thinkingLevel: 'Very High',
      });
      expect(result.allowed).toBe(false);

      expect(() =>
        matrix.assertCanSpawn({
          model: 'gpt-astra',
          thinkingLevel: 'Very High',
          cubicleId: 'cubicle-03',
        })
      ).toThrow(CapabilityRestrictionError);
    });

    it('authorizes GPT Astra at Ultra thinking level (can_spawn_subswarm = true)', () => {
      const result = matrix.evaluate({
        model: 'gpt-astra',
        thinkingLevel: 'Ultra',
      });
      expect(result.allowed).toBe(true);
    });

    it('authorizes universal models at Ultra thinking tier', () => {
      const result = matrix.evaluate({
        model: 'claude-3-7-sonnet',
        thinkingLevel: 'Ultra',
      });
      expect(result.allowed).toBe(true);
    });

    it('restricts models at Low and Medium thinking tiers', () => {
      const lowResult = matrix.evaluate({
        model: 'gemini-4-argon',
        thinkingLevel: 'Low',
      });
      expect(lowResult.allowed).toBe(false);

      const medResult = matrix.evaluate({
        model: 'gpt-astra',
        thinkingLevel: 'Medium',
      });
      expect(medResult.allowed).toBe(false);
    });

    it('respects administrative manual override flag', () => {
      const forcedAllowed = matrix.evaluate({
        model: 'gpt-astra',
        thinkingLevel: 'Very High',
        manualOverride: true,
      });
      expect(forcedAllowed.allowed).toBe(true);

      const forcedBlocked = matrix.evaluate({
        model: 'gemini-4-argon',
        thinkingLevel: 'High',
        manualOverride: false,
      });
      expect(forcedBlocked.allowed).toBe(false);
    });
  });

  describe('Recursion Depth Enforcement', () => {
    it('prohibits nested child sub-swarms beyond max recursion depth of 1', () => {
      expect(() =>
        matrix.evaluate({
          model: 'gemini-4-argon',
          thinkingLevel: 'High',
          currentDepth: 1, // Child worker attempting to spawn grandchild
        })
      ).toThrow(MaxRecursionDepthError);
    });
  });

  describe('Unauthorized Subswarm Interception & Incident Alerting', () => {
    it('intercepts unauthorized spawn from Cubicle 3, logs incident to incidents.jsonl, and emits INCIDENT_ALERT', async () => {
      let alertEmitted = false;
      let alertPayload: any = null;

      subswarmManager.onEvent((event) => {
        if (event.type === 'INCIDENT_ALERT') {
          alertEmitted = true;
          alertPayload = event.payload;
        }
      });

      await expect(
        subswarmManager.spawnSubswarm({
          cubicleId: 'cubicle-03',
          parentTaskId: 'task-test-01',
          model: 'gpt-astra',
          thinkingLevel: 'Very High',
          goal: 'Attempted multi-agent decomposition',
        })
      ).rejects.toThrow(CapabilityRestrictionError);

      expect(alertEmitted).toBe(true);
      expect(alertPayload.focus_cubicle).toBe('cubicle-03');
      expect(alertPayload.twin_sauron_mode).toBe('CONVERGE_OFFENDING_CUBICLE');

      // Verify incident in .swarm/logs/incidents.jsonl
      const incidents = await subswarmManager.readIncidents();
      expect(incidents.length).toBeGreaterThanOrEqual(1);

      const lastIncident = incidents[0];
      expect(lastIncident.cubicle_id).toBe('cubicle-03');
      expect(lastIncident.type).toBe('CAPABILITY_VIOLATION');
      expect(lastIncident.severity).toBe('BLOCKED');
      expect(lastIncident.twin_sauron_mode).toBe('CONVERGE_OFFENDING_CUBICLE');
    });
  });

  describe('Authorized Subswarm Lifecycle & Patch Consolidation', () => {
    it('spawns authorized subswarm with micro-tasks and manifest in .swarm/subswarms/cubicle-XX/', async () => {
      const manifest = await subswarmManager.spawnSubswarm({
        cubicleId: 'cubicle-01',
        parentTaskId: 'task-auth-01',
        model: 'gemini-4-argon',
        thinkingLevel: 'High',
        goal: 'Refactor database models with parallel micro-tasks',
        subtaskCount: 3,
      });

      expect(manifest.subswarm_id).toMatch(/^subswarm-cubicle-01-/);
      expect(manifest.status).toBe('running');
      expect(manifest.subtasks).toHaveLength(3);

      // Verify files on disk
      const saved = await subswarmManager.getManifest('cubicle-01');
      expect(saved).not.toBeNull();
      expect(saved?.subtasks).toHaveLength(3);
    });

    it('consolidates child patches into manifest and marks status completed', async () => {
      await subswarmManager.spawnSubswarm({
        cubicleId: 'cubicle-01',
        parentTaskId: 'task-auth-02',
        model: 'gemini-4-argon',
        thinkingLevel: 'High',
        goal: 'Optimize query indices',
        subtaskCount: 2,
      });

      const patches = [
        {
          subtaskId: 'subtask-1',
          patchContent: '--- a/src/db.ts\n+++ b/src/db.ts\n@@ -1 +1 @@\n-// old\n+// new\n',
        },
        {
          subtaskId: 'subtask-2',
          patchContent: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-// old\n+// new\n',
        },
      ];

      const completed = await subswarmManager.consolidateResults('cubicle-01', patches);

      expect(completed.status).toBe('completed');
      expect(completed.patches_applied).toHaveLength(2);
      expect(completed.completed_at).toBeDefined();

      const patch1 = await fs.readFile(
        path.join(swarmDir, 'subswarms', 'cubicle-01', 'patches', 'subtask-1.patch'),
        'utf8'
      );
      expect(patch1).toContain('--- a/src/db.ts');
    });
  });
});
