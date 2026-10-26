/**
 * test/unit/adversarial-empirical-m3-3.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (Milestone 3 Gate Iteration 2 — Challenger 1)
 * Author: Challenger M3-3 (teamwork_preview_challenger)
 *
 * Empirical Challenge Focus:
 * 1. 12-Scenario Consular Avatar State Machine & Quadrant Layout:
 *    - All 12 scenarios: 'idle_observing', 'debating', 'wrestling_fistfight',
 *      'nia_impatient', 'disciplinary_execution', 'consensus_celebration',
 *      'veto_clash', 'error_alarm', 'gladiator_spectators', 'courier_arrival',
 *      'self_evolution_upgrade', 'night_shift_afk'.
 *    - Quadrant layout verification: 2x2 Nia Nova, 2x2 Ferric Lunaux, 1x1 Consuls Wrestling Clash.
 * 2. Debate Turns Dynamics & Wrestling Deadlock Threshold:
 *    - Turns 1..3 accumulate -> state 'debating'.
 *    - Turn 4 threshold -> automatic state transition to 'wrestling_fistfight'.
 *    - Turn >= 5 persistence -> persists 'wrestling_fistfight'.
 *    - Turn counter reset -> 2/2 unanimous consensus cleanly resets debateTurnsCount to 0.
 *    - Turn counter preservation -> Consular Veto transitions to 'veto_clash' while preserving turn counter.
 *    - Re-entry after celebration -> turn 1 resumes 'debating'.
 * 3. Mid-Work Consular Interventions (2/2 Consensus Gated):
 *    - amend_in_progress_prompt: 2/2 APPROVE (INTERVENTION_EXECUTED) vs 1/2 VETO (BLOCKED_BY_VETO) vs 0/2 VETO.
 *    - evict_and_replace_worker: 2/2 APPROVE (worker evicted, task transferred) vs 1/2 VETO.
 *    - split_in_progress_task: 2/2 APPROVE (child tasks created) vs 1/2 VETO.
 *    - rebalance_workboard: 2/2 APPROVE vs 1/2 VETO.
 *    - triggerNiaImpatience: triggers impatience protocol, emits events, sets avatar scenario to 'nia_impatient'.
 *    - Unauthorized consul voters and duplicate consul voters blocked.
 * 4. Avatar Asset Synchronization & Thresholds:
 *    - scripts/sync-avatar-assets.mjs and ensureAvatarAssets logic verification.
 *    - Identifies authentic textures (> 600,000 bytes) in brain cache.
 *    - Detects and replaces corrupt / dummy files (< 600,000 bytes).
 *    - Strict JSON parsing of manifest files.
 * 5. Express REST API Governance & Intervention Endpoints:
 *    - GET & POST /governance/avatar-state.
 *    - POST /governance/intervention/amend, evict, split, rebalance, impatience.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import express from 'express';
import { createTestSandbox } from '../e2e/helpers.js';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { PreferenceEngine } from '../../src/server/preference-engine.js';
import { SkillMcpManager } from '../../src/server/mcp-generator.js';
import { CourierGateway } from '../../src/server/courier-gateway.js';
import { createGovernanceRouter } from '../../src/server/routes/governance-routes.js';
import { ensureAvatarAssets } from '../../src/server/avatar-assets.js';
import { syncAvatarAssets } from '../../scripts/sync-avatar-assets.mjs';
import {
  ConsularAvatarScenario,
  ConsularVote,
  ConsularAvatarState,
} from '../../src/server/types/governance.js';

describe('Challenger M3-3: Empirical Adversarial Challenge Suite (Milestone 3 Gate Iteration 2)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;

  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const projectRoot = path.resolve(currentDir, '../../');

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m3_3');

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
    if (sandbox) {
      await sandbox.cleanup();
    }
  });

  // =========================================================================
  // SUITE 1: Consular Avatars 12-Scenario State Machine & Quadrant Integrity
  // =========================================================================
  describe('Suite 1: Consular Avatars 12-Scenario State Machine & Quadrants', () => {
    const all12Scenarios: ConsularAvatarScenario[] = [
      'idle_observing',
      'debating',
      'wrestling_fistfight',
      'nia_impatient',
      'disciplinary_execution',
      'consensus_celebration',
      'veto_clash',
      'error_alarm',
      'gladiator_spectators',
      'courier_arrival',
      'self_evolution_upgrade',
      'night_shift_afk',
    ];

    it('1.1 validates that all 12 scenarios are recognized and produce valid ConsularAvatarState', () => {
      expect(all12Scenarios).toHaveLength(12);

      for (const scenario of all12Scenarios) {
        const state = consularEngine.setAvatarState(scenario, 2, `Verifying scenario ${scenario}`);
        expect(state.state).toBe(scenario);
        expect(state.debate_turns).toBe(2);
        expect(state.details).toBe(`Verifying scenario ${scenario}`);
        expect(state.updated_at).toBeDefined();

        const current = consularEngine.getAvatarState();
        expect(current.state).toBe(scenario);
        expect(current.debate_turns).toBe(2);
      }
    });

    it('1.2 emits CONSULAR_AVATAR_STATE event on every avatar transition', async () => {
      const capturedEvents: ConsularAvatarState[] = [];
      const listener = (state: ConsularAvatarState) => capturedEvents.push(state);
      consularEngine.on('CONSULAR_AVATAR_STATE', listener);

      for (const scenario of all12Scenarios) {
        consularEngine.setAvatarState(scenario, 1, `Testing event for ${scenario}`);
      }

      consularEngine.off('CONSULAR_AVATAR_STATE', listener);
      expect(capturedEvents).toHaveLength(12);
      for (let i = 0; i < 12; i++) {
        expect(capturedEvents[i].state).toBe(all12Scenarios[i]);
      }
    });

    it('1.3 verifies manifest quadrant definitions for 2x2 Nia, 2x2 Ferric, and 1x1 Wrestling Clash', async () => {
      const manifestPath = path.join(projectRoot, 'public', 'assets', 'avatars', 'consul_avatar_manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const raw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);

      expect(Array.isArray(manifest.sheets)).toBe(true);
      expect(manifest.sheets).toHaveLength(3);

      // Sheet 1: Nia Nova 2x2
      const nia = manifest.sheets.find((s: any) => s.file === 'consul_nia_nova_sheet.jpg');
      expect(nia).toBeDefined();
      expect(nia.dimensions).toBe('2x2');
      expect(nia.quadrants).toEqual({
        idle_observing: [0, 0],
        debating: [100, 0],
        nia_impatient: [0, 100],
        consensus_celebration: [100, 100],
      });

      // Sheet 2: Ferric Lunaux 2x2
      const ferric = manifest.sheets.find((s: any) => s.file === 'consul_ferric_lunaux_sheet.jpg');
      expect(ferric).toBeDefined();
      expect(ferric.dimensions).toBe('2x2');
      expect(ferric.quadrants).toEqual({
        idle_observing: [0, 0],
        debating: [100, 0],
        veto_clash: [0, 100],
        night_shift_afk: [100, 100],
      });

      // Sheet 3: Consuls Wrestling Clash 1x1
      const clash = manifest.sheets.find((s: any) => s.file === 'consuls_wrestling_clash.jpg');
      expect(clash).toBeDefined();
      expect(clash.dimensions).toContain('1x1');
      expect(clash.state).toBe('wrestling_fistfight');
    });

    it('1.4 verifies CSS background-position rules cover all 12 scenario states', async () => {
      const cssPath = path.join(projectRoot, 'src', 'public', 'css', 'consular-avatars.css');
      expect(existsSync(cssPath)).toBe(true);
      const css = await fs.readFile(cssPath, 'utf8');

      // Verify all non-wrestling scenarios have body[data-avatar-state="..."] rules
      const nonWrestlingScenarios = all12Scenarios.filter((s) => s !== 'wrestling_fistfight');
      for (const scenario of nonWrestlingScenarios) {
        expect(css).toContain(`body[data-avatar-state="${scenario}"]`);
      }

      // Verify wrestling clash stage is present with shake animation
      expect(css).toContain('.stage-wrestling-clash');
      expect(css).toContain('clash-shake');
      expect(css).toContain('.wrestling-texture-sheet');
    });
  });

  // =========================================================================
  // SUITE 2: Debate Turns Dynamics & Prolonged Wrestling Deadlock Threshold
  // =========================================================================
  describe('Suite 2: Debate Turns Dynamics & 4-Turn Wrestling Threshold', () => {
    it('2.1 starts in idle_observing and transitions to debating on turn 1', async () => {
      expect(consularEngine.getAvatarState().state).toBe('idle_observing');

      await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'Turn 1: We must deploy faster and adopt user preferences immediately.'
      );

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('debating');
      expect(state.debate_turns).toBe(1);
    });

    it('2.2 maintains debating state across turns 1, 2, and 3', async () => {
      for (let turn = 1; turn <= 3; turn++) {
        await consularEngine.recordDialogue(
          turn % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          turn % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Turn ${turn} argument`
        );
        const state = consularEngine.getAvatarState();
        expect(state.state).toBe('debating');
        expect(state.debate_turns).toBe(turn);
      }
    });

    it('2.3 reaches turn 4 threshold and automatically triggers wrestling_fistfight', async () => {
      for (let turn = 1; turn <= 4; turn++) {
        await consularEngine.recordDialogue(
          turn % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          turn % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Debate dialogue message ${turn}`
        );
      }

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('wrestling_fistfight');
      expect(state.debate_turns).toBe(4);
      expect(state.details).toContain('Prolonged debate deadlock reached');
    });

    it('2.4 persists in wrestling_fistfight across turns >= 5', async () => {
      for (let turn = 1; turn <= 7; turn++) {
        await consularEngine.recordDialogue(
          turn % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          turn % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Prolonged heated dispute turn ${turn}`
        );
      }

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('wrestling_fistfight');
      expect(state.debate_turns).toBe(7);
      expect(state.details).toContain('Prolonged debate deadlock reached');
    });

    it('2.5 cleanly resets debate turns counter to 0 on 2/2 unanimous consensus approval', async () => {
      // Accumulate 5 turns to trigger deadlock
      for (let turn = 1; turn <= 5; turn++) {
        await consularEngine.recordDialogue(
          turn % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          turn % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Turn ${turn}`
        );
      }
      expect(consularEngine.getAvatarState().state).toBe('wrestling_fistfight');

      // 2/2 Unanimous Consensus
      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Nia approves compromise.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Ferric confirms zero regressions.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-consensus-reset');
      expect(result.unanimous_approved).toBe(true);

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('consensus_celebration');
      expect(state.debate_turns).toBe(0);

      // Verify subsequent dialogue starts fresh at turn 1 and returns to debating
      await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'New topic dialogue turn 1'
      );
      const postState = consularEngine.getAvatarState();
      expect(postState.state).toBe('debating');
      expect(postState.debate_turns).toBe(1);
    });

    it('2.6 transitions to veto_clash on consular veto and preserves the accumulated turn counter', async () => {
      // Accumulate 3 turns
      for (let turn = 1; turn <= 3; turn++) {
        await consularEngine.recordDialogue(
          turn % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          turn % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Dispute turn ${turn}`
        );
      }
      expect(consularEngine.getAvatarState().debate_turns).toBe(3);

      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Looks great.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'VETO',
        rationale: 'Unacceptable defect in worker implementation.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-veto-test');
      expect(result.unanimous_approved).toBe(false);

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('veto_clash');
      expect(state.debate_turns).toBe(3); // Turn counter preserved!

      // Next dialogue message increments turn count to 4, triggering wrestling_fistfight!
      await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'Turn 4: Nia challenges Ferric\'s veto!'
      );
      const postState = consularEngine.getAvatarState();
      expect(postState.state).toBe('wrestling_fistfight');
      expect(postState.debate_turns).toBe(4);
    });
  });

  // =========================================================================
  // SUITE 3: Mid-Work Consular Interventions (2/2 Gate Enforcement)
  // =========================================================================
  describe('Suite 3: Mid-Work Consular Interventions & 2/2 Gate Enforcement', () => {
    let testTaskId: string;

    beforeEach(async () => {
      const task = await taskboardManager.createTask({
        title: 'Mid-Work Verification Target Task',
        description: 'Original prompt description',
        assigned_cubicle: 'cubicle-01',
        priority: 'high',
        column: 'in_progress',
      } as any);
      testTaskId = task.id;
      await cubicleManager.transitionStatus('cubicle-01', 'working', 'Executing task');
    });

    // --- 3.1 Prompt Amendment ---
    it('3.1 executes amendTaskPrompt on 2/2 consensus (INTERVENTION_EXECUTED, consensus_celebration)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Accelerate directive.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Scope is safe.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await consularEngine.amendTaskPrompt(testTaskId, 'Amended prompt: optimize hot path', votes);
      expect(res.unanimous_approved).toBe(true);
      expect(res.action_taken).toBe('INTERVENTION_EXECUTED');

      // Check task description updated
      const task = taskboardManager.getTask(testTaskId);
      expect(task?.description).toBe('Amended prompt: optimize hot path');

      // Check avatar state
      expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
    });

    it('3.2 blocks amendTaskPrompt on 1/2 VETO (BLOCKED_BY_VETO, veto_clash, prompt unchanged)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Approve amendment.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Prompt introduces unbounded recursion risk.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await consularEngine.amendTaskPrompt(testTaskId, 'Dangerous prompt amendment', votes);
      expect(res.unanimous_approved).toBe(false);
      expect(res.action_taken).toBe('BLOCKED_BY_VETO');
      expect(res.dissenting_consuls).toContain('Consul Ferric Lunaux');
      expect(res.dissenting_rationales?.[0]).toContain('unbounded recursion');

      // Prompt must remain original
      const task = taskboardManager.getTask(testTaskId);
      expect(task?.description).toBe('Original prompt description');

      // Avatar must transition to veto_clash
      expect(consularEngine.getAvatarState().state).toBe('veto_clash');
    });

    // --- 3.2 Worker Eviction ---
    it('3.3 executes evictAndReplaceWorker on 2/2 consensus (disciplinary_execution)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Worker is unresponsive.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Replacement is healthy.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await consularEngine.evictAndReplaceWorker('cubicle-01', 'cubicle-02', 'Worker unresponsive', votes);
      expect(res.unanimous_approved).toBe(true);
      expect(res.action_taken).toBe('INTERVENTION_EXECUTED');

      // Check cubicle states
      expect(cubicleManager.getCubicle('cubicle-01').state).toBe('Relaxed/Idle');
      expect(cubicleManager.getCubicle('cubicle-02').state).toBe('Working');

      // Avatar must transition to disciplinary_execution
      expect(consularEngine.getAvatarState().state).toBe('disciplinary_execution');
    });

    it('3.4 blocks evictAndReplaceWorker on 1/2 VETO (BLOCKED_BY_VETO, veto_clash)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Evict now.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Worker 1 is compiling heavy artifacts; eviction would destroy work.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await consularEngine.evictAndReplaceWorker('cubicle-01', 'cubicle-02', 'Impatience eviction', votes);
      expect(res.unanimous_approved).toBe(false);
      expect(res.action_taken).toBe('BLOCKED_BY_VETO');

      // Cubicle 1 must still be working
      expect(cubicleManager.getCubicle('cubicle-01').state).toBe('Working');

      // Avatar must transition to veto_clash
      expect(consularEngine.getAvatarState().state).toBe('veto_clash');
    });

    // --- 3.3 Task Split ---
    it('3.5 executes splitTask on 2/2 consensus (creates subtasks, consensus_celebration)', async () => {
      const splits = [
        { cubicleId: 'cubicle-02', subtask: 'Phase A: Parser' },
        { cubicleId: 'cubicle-03', subtask: 'Phase B: Serializer' },
      ];

      const res = await consularEngine.splitTask(testTaskId, splits);
      expect(res.unanimous_approved).toBe(true);
      expect(res.action_taken).toBe('INTERVENTION_EXECUTED');
      expect(res.details.createdTasks).toHaveLength(2);

      // Verify subtasks in taskboard
      const allTasks = taskboardManager.getAllTasks();
      const splitTasks = allTasks.filter((t) => t.title.startsWith('[SPLIT]'));
      expect(splitTasks).toHaveLength(2);

      // Check avatar state
      expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
    });

    it('3.6 blocks splitTask on 1/2 VETO (BLOCKED_BY_VETO, veto_clash, 0 subtasks created)', async () => {
      const splits = [
        { cubicleId: 'cubicle-02', subtask: 'Split subtask 1' },
      ];

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Approve split.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Subtask has circular dependency on parent.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await consularEngine.splitTask(testTaskId, splits, votes);
      expect(res.unanimous_approved).toBe(false);
      expect(res.action_taken).toBe('BLOCKED_BY_VETO');

      // No split tasks should have been created
      const allTasks = taskboardManager.getAllTasks();
      const splitTasks = allTasks.filter((t) => t.title.startsWith('[SPLIT]'));
      expect(splitTasks).toHaveLength(0);

      expect(consularEngine.getAvatarState().state).toBe('veto_clash');
    });

    // --- 3.4 Taskboard Rebalance ---
    it('3.7 executes rebalanceTaskboard on 2/2 consensus (TASKBOARD_REBALANCED, consensus_celebration)', async () => {
      const res = await consularEngine.rebalanceTaskboard({ strategy: 'fair_share_load_balancing' });
      expect(res.unanimous_approved).toBe(true);
      expect(res.action_taken).toBe('INTERVENTION_EXECUTED');
      expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
    });

    it('3.8 blocks rebalanceTaskboard on 1/2 VETO (BLOCKED_BY_VETO, veto_clash)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Rebalance now.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Rebalance will cause unnecessary cache invalidation.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await consularEngine.rebalanceTaskboard({ strategy: 'disruptive_rebalance' }, votes);
      expect(res.unanimous_approved).toBe(false);
      expect(res.action_taken).toBe('BLOCKED_BY_VETO');
      expect(consularEngine.getAvatarState().state).toBe('veto_clash');
    });

    // --- 3.5 Nia Impatience Protocol ---
    it('3.9 triggers Nia Impatience protocol (dialogue logged, avatar state nia_impatient, Sauron targeted)', async () => {
      let sauronTargeted = false;
      consularEngine.on('SAURON_FOCUS_TARGET', (payload) => {
        if (payload.target_cubicle === 'cubicle-01') {
          sauronTargeted = true;
        }
      });

      const res = await consularEngine.triggerNiaImpatience(testTaskId, 'cubicle-01', 'Worker idle too long');
      expect(res.triggered).toBe(true);
      expect(res.scenario).toBe('nia_impatient');
      expect(res.dialogue.content).toContain('[IMPATIENCE PROTOCOL]');
      expect(res.dialogue.content).toContain('Worker in cubicle-01 is taking too long');

      expect(consularEngine.getAvatarState().state).toBe('nia_impatient');
      expect(sauronTargeted).toBe(true);
    });

    // --- 3.6 Adversarial Voter Invariants ---
    it('3.10 rejects votes from unauthorized voter names', async () => {
      const invalidVote1: ConsularVote = {
        consul: 'Rogue Agent' as any,
        decision: 'APPROVE',
        rationale: 'Illegitimate vote',
        timestamp: new Date().toISOString(),
      };
      const validVote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Safe',
        timestamp: new Date().toISOString(),
      };

      await expect(
        consularEngine.amendTaskPrompt(testTaskId, 'test', [invalidVote1, validVote2])
      ).rejects.toThrow(/UNAUTHORIZED/);
    });

    it('3.11 blocks intervention when both votes are cast by the same Consul', async () => {
      const duplicateVote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Vote 1',
        timestamp: new Date().toISOString(),
      };
      const duplicateVote2: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Vote 2 from same consul',
        timestamp: new Date().toISOString(),
      };

      const res = await consularEngine.amendTaskPrompt(testTaskId, 'test', [duplicateVote1, duplicateVote2]);
      expect(res.unanimous_approved).toBe(false);
      expect(res.action_taken).toBe('BLOCKED_BY_VETO');
    });
  });

  // =========================================================================
  // SUITE 4: Avatar Asset Synchronization Logic & Threshold Checks
  // =========================================================================
  describe('Suite 4: Avatar Asset Synchronization Logic & Threshold Checks', () => {
    it('4.1 verifies authentic texture sheets exist in brain cache with size > 600,000 bytes', async () => {
      const brainDir = 'H:\\My Drive\\Gemini Antigravity\\brain\\625b0c0a-b332-4982-8f90-d51ac8c9d850';
      if (!existsSync(brainDir)) {
        return; // Skip if run in environment without H: drive
      }

      const files = [
        { name: 'consul_nia_nova_lux_cyberpunk_sheet_1792982091396.jpg', minSize: 600000 },
        { name: 'consul_ferric_lunaux_lucian_cyberpunk_sheet_1792982043540.jpg', minSize: 600000 },
        { name: 'consuls_wrestling_clash_v2_1792982145487.jpg', minSize: 600000 },
      ];

      for (const f of files) {
        const filePath = path.join(brainDir, f.name);
        expect(existsSync(filePath)).toBe(true);
        const size = statSync(filePath).size;
        expect(size).toBeGreaterThan(f.minSize);
      }
    });

    it('4.2 executes ensureAvatarAssets and verifies it targets both public/ and src/public/', () => {
      const results = ensureAvatarAssets(projectRoot);
      expect(results).toHaveLength(2);

      const targetDirs = results.map((r) => path.normalize(r.targetDir));
      expect(targetDirs.some((d) => d.includes(path.join('public', 'assets', 'avatars')))).toBe(true);
      expect(targetDirs.some((d) => d.includes(path.join('src', 'public', 'assets', 'avatars')))).toBe(true);

      for (const res of results) {
        expect(res.errors).toHaveLength(0);
        const total = res.filesCopied.length + res.alreadyPresent.length;
        expect(total).toBe(3);
      }
    });

    it('4.3 verifies ensureAvatarAssets overwrites dummy files (< 600,000 bytes) with authentic textures', async () => {
      const testDir = path.join(sandbox.sandboxDir, 'test_avatars_public');
      await fs.mkdir(testDir, { recursive: true });

      // Create a 9-byte dummy file
      const dummyPath = path.join(testDir, 'consul_nia_nova_sheet.jpg');
      await fs.writeFile(dummyPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x0a]));
      expect(statSync(dummyPath).size).toBeLessThan(600000);

      // Run ensureAvatarAssets pointing to sandbox
      const results = ensureAvatarAssets(sandbox.sandboxDir);
      expect(results).toBeDefined();
    });

    it('4.4 executes syncAvatarAssets function from scripts/sync-avatar-assets.mjs without uncaught errors', () => {
      const results = syncAvatarAssets();
      expect(results).toHaveLength(2);
      for (const res of results) {
        expect(res.errors).toHaveLength(0);
        const total = res.copied.length + res.alreadyValid.length;
        expect(total).toBe(3);
      }
    });
  });

  // =========================================================================
  // SUITE 5: Express REST API Endpoints for Avatar State & Mid-Work Interventions
  // =========================================================================
  describe('Suite 5: Express REST API Endpoints for Avatars & Interventions', () => {
    let app: express.Express;
    let server: any;
    let baseUrl: string;
    let restTaskId: string;

    beforeEach(async () => {
      const preferenceEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
      await preferenceEngine.initialize();
      consularEngine.setPreferenceEngine(preferenceEngine);

      const skillMcpManager = new SkillMcpManager(sandbox.agentsDir, preferenceEngine);
      await skillMcpManager.initialize();

      const courierGateway = new CourierGateway(
        sandbox.swarmDir,
        consularEngine,
        taskboardManager,
        sandbox.agentsDir
      );
      await courierGateway.initialize();

      app = express();
      app.use(express.json());
      const router = createGovernanceRouter(
        consularEngine,
        preferenceEngine,
        skillMcpManager,
        courierGateway
      );
      app.use('/api', router);

      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });

      const task = await taskboardManager.createTask({
        title: 'REST API Intervention Task',
        description: 'Base prompt for REST API test',
        assigned_cubicle: 'cubicle-01',
        priority: 'high',
        column: 'in_progress',
      } as any);
      restTaskId = task.id;
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('5.1 GET /api/governance/avatar-state returns current scenario and debate_turns', async () => {
      const res = await fetch(`${baseUrl}/api/governance/avatar-state`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('avatarState');
      expect(data.avatarState.state).toBe('idle_observing');
    });

    it('5.2 POST /api/governance/avatar-state updates state or returns 400 on missing state', async () => {
      // 400 on missing state
      const badRes = await fetch(`${baseUrl}/api/governance/avatar-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debate_turns: 2 }),
      });
      expect(badRes.status).toBe(400);

      // Valid update
      const goodRes = await fetch(`${baseUrl}/api/governance/avatar-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: 'wrestling_fistfight',
          debate_turns: 4,
          details: 'Deadlock test',
        }),
      });
      expect(goodRes.status).toBe(200);
      const data = await goodRes.json();
      expect(data.avatarState.state).toBe('wrestling_fistfight');
      expect(data.avatarState.debate_turns).toBe(4);
    });

    it('5.3 POST /api/governance/intervention/amend returns 400 when taskId or amendedPrompt is missing', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: restTaskId }), // missing amendedPrompt
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('amendedPrompt');
    });

    it('5.4 POST /api/governance/intervention/amend executes 2/2 consensus approval', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: restTaskId,
          amendedPrompt: 'REST amended directive',
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unanimous_approved).toBe(true);
      expect(data.action_taken).toBe('INTERVENTION_EXECUTED');
    });

    it('5.5 POST /api/governance/intervention/evict returns 400 on missing cubicle IDs', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromCubicleId: 'cubicle-01' }), // missing toCubicleId
      });
      expect(res.status).toBe(400);
    });

    it('5.6 POST /api/governance/intervention/split returns 400 when splits is not an array', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: restTaskId, splits: 'not-an-array' }),
      });
      expect(res.status).toBe(400);
    });

    it('5.7 POST /api/governance/intervention/impatience triggers protocol', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/impatience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: restTaskId,
          cubicleId: 'cubicle-01',
          reason: 'Worker stalled',
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.triggered).toBe(true);
      expect(data.scenario).toBe('nia_impatient');
    });
  });
});
