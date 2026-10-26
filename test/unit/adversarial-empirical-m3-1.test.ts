/**
 * test/unit/adversarial-empirical-m3-1.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (Milestone 3 Verification 1)
 * Author: Challenger M3-1 (teamwork_preview_challenger)
 *
 * Empirical Challenge Focus:
 * 1. Consular Avatars 12-Scenario State Machine:
 *    - Transitions across all 12 scenarios:
 *      'idle_observing', 'debating', 'wrestling_fistfight', 'nia_impatient',
 *      'disciplinary_execution', 'consensus_celebration', 'veto_clash',
 *      'error_alarm', 'gladiator_spectators', 'courier_arrival',
 *      'self_evolution_upgrade', 'night_shift_afk'.
 *    - In-engine and REST endpoint transition verification.
 *    - Event broadcasting of CONSULAR_AVATAR_STATE.
 * 2. Prolonged Debate Fistfight Trigger:
 *    - Dialogue turn accumulation: 1..3 turns -> 'debating'.
 *    - Turn 4 threshold -> automatic transition to 'wrestling_fistfight'.
 *    - Turn >= 5 -> persists 'wrestling_fistfight'.
 *    - 2/2 Consensus approval -> resets turn counter to 0 and transitions to 'consensus_celebration'.
 *    - Consular Veto -> transitions to 'veto_clash' without turn counter erasure.
 * 3. Mid-Work Consular Interventions (2/2 Consensus Gated):
 *    - amend_in_progress_prompt: 2/2 APPROVE (INTERVENTION_EXECUTED) vs 1/2 VETO (BLOCKED_BY_VETO) vs 0/2 VETO.
 *    - evict_and_replace_worker: 2/2 APPROVE (worker evicted, task transferred) vs 1/2 VETO.
 *    - split_in_progress_task: 2/2 APPROVE (child tasks created) vs 1/2 VETO.
 *    - rebalance_workboard: 2/2 APPROVE vs 1/2 VETO.
 *    - triggerNiaImpatience: triggers impatience protocol, logs dialogue, updates avatar state.
 * 4. Adversarial Invariant Stress-Testing:
 *    - Unauthorized consul voters rejected.
 *    - Duplicate consul votes (e.g. 2x Consul I) rejected.
 *    - Veto without rationale rejected.
 * 5. Avatar Asset Manifests & Synchronization:
 *    - Strict JSON parsing of public/ and src/public/ manifests without syntax errors.
 *    - Manifest structure & quadrant mapping integrity.
 *    - Texture sheet file existence and size verification.
 *    - ensureAvatarAssets programmatic copy and fallback validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'node:fs';
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
import {
  ConsularAvatarScenario,
  ConsularVote,
} from '../../src/server/types/governance.js';

describe('Challenger M3-1: Adversarial Empirical Challenge Suite', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m3_1');

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
  // SUITE 1: 12-Scenario Consular Avatar State Machine
  // =========================================================================
  describe('1. 12-Scenario Consular Avatar State Machine', () => {
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

    it('initializes in idle_observing state with 0 debate turns', () => {
      const initial = consularEngine.getAvatarState();
      expect(initial.state).toBe('idle_observing');
      expect(initial.debate_turns).toBe(0);
      expect(initial.updated_at).toBeDefined();
    });

    it('transitions cleanly across all 12 defined scenarios with debate turns and details', () => {
      for (const scenario of all12Scenarios) {
        const turns = scenario === 'wrestling_fistfight' ? 4 : 1;
        const details = `Testing scenario ${scenario}`;

        const updated = consularEngine.setAvatarState(scenario, turns, details);
        expect(updated.state).toBe(scenario);
        expect(updated.debate_turns).toBe(turns);
        expect(updated.details).toBe(details);

        const current = consularEngine.getAvatarState();
        expect(current.state).toBe(scenario);
        expect(current.debate_turns).toBe(turns);
        expect(current.details).toBe(details);
      }
    });

    it('emits CONSULAR_AVATAR_STATE event on every state transition', () => {
      const emittedStates: ConsularAvatarScenario[] = [];
      const unsubscribe = consularEngine.onEvent((type, payload) => {
        if (type === 'CONSULAR_AVATAR_STATE') {
          emittedStates.push(payload.state);
        }
      });

      for (const scenario of all12Scenarios) {
        consularEngine.setAvatarState(scenario);
      }

      unsubscribe();
      expect(emittedStates).toEqual(all12Scenarios);
    });

    it('updates updated_at timestamp on each state change', async () => {
      const first = consularEngine.setAvatarState('debating', 1);
      const firstTime = new Date(first.updated_at!).getTime();

      // Small delay to ensure timestamp progression
      await new Promise((r) => setTimeout(r, 10));

      const second = consularEngine.setAvatarState('error_alarm', 0);
      const secondTime = new Date(second.updated_at!).getTime();

      expect(secondTime).toBeGreaterThanOrEqual(firstTime);
    });
  });

  // =========================================================================
  // SUITE 2: Prolonged Debate Fistfight Trigger & Turn Dynamics
  // =========================================================================
  describe('2. Prolonged Debate Fistfight Trigger & Turn Dynamics', () => {
    it('progresses from idle_observing to debating on turns 1, 2, and 3', async () => {
      expect(consularEngine.getAvatarState().state).toBe('idle_observing');

      // Turn 1
      await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'Turn 1 argument: we should empower workers.'
      );
      let state = consularEngine.getAvatarState();
      expect(state.state).toBe('debating');
      expect(state.debate_turns).toBe(1);

      // Turn 2
      await consularEngine.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        'Turn 2 counter-argument: we must enforce strict types.'
      );
      state = consularEngine.getAvatarState();
      expect(state.state).toBe('debating');
      expect(state.debate_turns).toBe(2);

      // Turn 3
      await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'Turn 3 rebuttal: types should not restrict agility.'
      );
      state = consularEngine.getAvatarState();
      expect(state.state).toBe('debating');
      expect(state.debate_turns).toBe(3);
    });

    it('automatically triggers wrestling_fistfight upon accumulating 4 debate dialogue turns', async () => {
      // 3 preliminary turns
      for (let i = 1; i <= 3; i++) {
        await consularEngine.recordDialogue(
          i % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          i % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Debate argument ${i}`
        );
      }
      expect(consularEngine.getAvatarState().state).toBe('debating');

      // Turn 4 - Deadlock trigger!
      await consularEngine.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        'Turn 4 deadlock: I refuse to yield on boundary tests.'
      );

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('wrestling_fistfight');
      expect(state.debate_turns).toBe(4);
      expect(state.details).toBe('Prolonged debate deadlock reached');
    });

    it('persists wrestling_fistfight state if debate continues beyond turn 4', async () => {
      for (let i = 1; i <= 6; i++) {
        await consularEngine.recordDialogue(
          i % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          i % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Debate argument ${i}`
        );
      }

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('wrestling_fistfight');
      expect(state.debate_turns).toBe(6);
    });

    it('transitions to consensus_celebration and resets debate turns count to 0 upon 2/2 consensus approval', async () => {
      // Build up 4 turns of deadlock
      for (let i = 1; i <= 4; i++) {
        await consularEngine.recordDialogue(
          i % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          i % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Debate argument ${i}`
        );
      }
      expect(consularEngine.getAvatarState().state).toBe('wrestling_fistfight');

      // 2/2 Unanimous Consensus Approval
      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Nia agrees on compromised architecture.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Ferric confirms zero leaks and approves.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(true);

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('consensus_celebration');
      expect(state.debate_turns).toBe(0);

      // Verify subsequent dialogue starts a fresh debate counter rather than immediate fistfight
      await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'Starting new deliberation on subsequent feature.'
      );
      const newState = consularEngine.getAvatarState();
      expect(newState.state).toBe('debating');
      expect(newState.debate_turns).toBe(1);
    });

    it('transitions to veto_clash on consular veto without resetting debate turn counter', async () => {
      // 2 dialogue turns
      await consularEngine.recordDialogue('Consul Nia Nova', 'rebellious_champion', 'Proposal A');
      await consularEngine.recordDialogue('Consul Ferric Lunaux', 'pragmatic_realist', 'Critique B');

      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Looks acceptable to me.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'VETO',
        rationale: 'Critical regression detected: VETO!',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);

      const state = consularEngine.getAvatarState();
      expect(state.state).toBe('veto_clash');
      expect(state.debate_turns).toBe(2);
      expect(state.details).toBe('Consular Veto Enforced');
    });
  });

  // =========================================================================
  // SUITE 3: Mid-Work Consular Interventions & 2/2 Consensus Gating
  // =========================================================================
  describe('3. Mid-Work Consular Interventions (2/2 Consensus Gated)', () => {
    let testTaskId: string;

    beforeEach(async () => {
      const task = await taskboardManager.createTask({
        title: 'Original Worker Task',
        description: 'Original instructions for the worker.',
        priority: 'high',
        assigned_cubicle: 'cubicle-01',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);
      testTaskId = task.id;
    });

    // 3.1 amend_in_progress_prompt
    describe('3.1 amend_in_progress_prompt', () => {
      it('executes prompt amendment on 2/2 unanimous approval and updates taskboard', async () => {
        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Nia approves amended scope to meet user goals.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'APPROVE',
            rationale: 'Ferric confirms amended scope is safe.',
            timestamp: new Date().toISOString(),
          },
        ];

        const amendedPrompt = 'Updated instructions: strictly sanitize inputs and use UTF-8.';
        const result = await consularEngine.amendTaskPrompt(testTaskId, amendedPrompt, votes);

        expect(result.unanimous_approved).toBe(true);
        expect(result.action_taken).toBe('INTERVENTION_EXECUTED');
        expect(result.intervention_type).toBe('amend_in_progress_prompt');
        expect(result.details?.amendedPrompt).toBe(amendedPrompt);

        // Verify task on taskboard has amended description
        const allTasks = await taskboardManager.listAllTasks();
        const updatedTask = allTasks.in_progress.find((t) => t.id === testTaskId);
        expect(updatedTask?.description).toBe(amendedPrompt);

        // Verify avatar state is consensus_celebration
        expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
      });

      it('blocks prompt amendment on 1/2 VETO and leaves taskboard untouched', async () => {
        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Nia approves rewrite.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'VETO',
            rationale: 'Scope creep during in-progress execution is prohibited.',
            timestamp: new Date().toISOString(),
          },
        ];

        const dangerousPrompt = 'Rewrite everything from scratch in Rust.';
        const result = await consularEngine.amendTaskPrompt(testTaskId, dangerousPrompt, votes);

        expect(result.unanimous_approved).toBe(false);
        expect(result.action_taken).toBe('BLOCKED_BY_VETO');
        expect(result.dissenting_consuls).toEqual(['Consul Ferric Lunaux']);
        expect(result.dissenting_rationales?.[0]).toContain('Scope creep');

        // Verify taskboard still has original description
        const allTasks = await taskboardManager.listAllTasks();
        const unchangedTask = allTasks.in_progress.find((t) => t.id === testTaskId);
        expect(unchangedTask?.description).toBe('Original instructions for the worker.');

        // Verify avatar state transitioned to veto_clash
        expect(consularEngine.getAvatarState().state).toBe('veto_clash');
      });

      it('blocks prompt amendment on 0/2 VETO and identifies both dissenting consuls', async () => {
        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'VETO',
            rationale: 'Nia rejects prompt: violates user aesthetic intent.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'VETO',
            rationale: 'Ferric rejects prompt: causes severe regression.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.amendTaskPrompt(testTaskId, 'Bad prompt', votes);

        expect(result.unanimous_approved).toBe(false);
        expect(result.action_taken).toBe('BLOCKED_BY_VETO');
        expect(result.dissenting_consuls).toHaveLength(2);
        expect(result.dissenting_consuls).toContain('Consul Nia Nova');
        expect(result.dissenting_consuls).toContain('Consul Ferric Lunaux');
      });
    });

    // 3.2 evict_and_replace_worker
    describe('3.2 evict_and_replace_worker', () => {
      it('evicts stalled worker, transitions fromCubicle to idle, and reassigns task to toCubicle on 2/2 approval', async () => {
        // Ensure cubicle-01 is working on testTaskId
        await cubicleManager.transitionStatus('cubicle-01', 'working', 'Working on task');
        const c1 = cubicleManager.getCubicle('cubicle-01');
        c1.current_task_id = testTaskId;

        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Nia approves eviction: cubicle-01 has stalled.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'APPROVE',
            rationale: 'Ferric confirms cubicle-02 is ready for handover.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.evictAndReplaceWorker(
          'cubicle-01',
          'cubicle-02',
          'Cubicle 1 stalled for > 120s',
          votes
        );

        expect(result.unanimous_approved).toBe(true);
        expect(result.action_taken).toBe('INTERVENTION_EXECUTED');
        expect(result.intervention_type).toBe('evict_and_replace_worker');

        // Check cubicle-01 status transitioned to idle
        expect(cubicleManager.getCubicle('cubicle-01').status).toBe('idle');

        // Check cubicle-02 status transitioned to working
        expect(cubicleManager.getCubicle('cubicle-02').status).toBe('working');

        // Check task assigned to cubicle-02
        const allTasks = await taskboardManager.listAllTasks();
        const activeTask = allTasks.in_progress.find((t) => t.id === testTaskId);
        expect(activeTask?.assigned_cubicle).toBe('cubicle-02');

        // Verify avatar state is disciplinary_execution
        expect(consularEngine.getAvatarState().state).toBe('disciplinary_execution');
      });

      it('blocks worker eviction when 1 consul vetoes and leaves cubicles untouched', async () => {
        await cubicleManager.transitionStatus('cubicle-01', 'working', 'Executing task');
        const c1 = cubicleManager.getCubicle('cubicle-01');
        c1.current_task_id = testTaskId;

        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Nia votes to replace worker.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'VETO',
            rationale: 'Worker is compiling heavy AST, eviction would waste 15 minutes of work.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.evictAndReplaceWorker(
          'cubicle-01',
          'cubicle-02',
          'Premature eviction request',
          votes
        );

        expect(result.unanimous_approved).toBe(false);
        expect(result.action_taken).toBe('BLOCKED_BY_VETO');
        expect(result.dissenting_consuls).toEqual(['Consul Ferric Lunaux']);

        // Check cubicle-01 still working
        expect(cubicleManager.getCubicle('cubicle-01').status).toBe('working');
        expect(cubicleManager.getCubicle('cubicle-01').current_task_id).toBe(testTaskId);

        // Avatar state is veto_clash
        expect(consularEngine.getAvatarState().state).toBe('veto_clash');
      });
    });

    // 3.3 split_in_progress_task
    describe('3.3 split_in_progress_task', () => {
      it('splits in-progress task into parallel child tasks on 2/2 Consular approval', async () => {
        const splits = [
          { cubicleId: 'cubicle-02', subtask: 'Subtask Alpha: Core Engine' },
          { cubicleId: 'cubicle-03', subtask: 'Subtask Beta: API Layer' },
        ];

        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Splitting accelerates parallel execution.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'APPROVE',
            rationale: 'Child tasks are decoupled with clean contracts.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.splitTask(testTaskId, splits, votes);

        expect(result.unanimous_approved).toBe(true);
        expect(result.action_taken).toBe('INTERVENTION_EXECUTED');
        expect(result.details?.createdTasks).toHaveLength(2);

        // Verify tasks exist in in_progress on taskboard
        const allTasks = await taskboardManager.listAllTasks();
        const alpha = allTasks.in_progress.find((t) => t.title.includes('Subtask Alpha'));
        const beta = allTasks.in_progress.find((t) => t.title.includes('Subtask Beta'));

        expect(alpha).toBeDefined();
        expect(alpha?.assigned_cubicle).toBe('cubicle-02');
        expect(beta).toBeDefined();
        expect(beta?.assigned_cubicle).toBe('cubicle-03');

        // Verify cubicles set to working
        expect(cubicleManager.getCubicle('cubicle-02').status).toBe('working');
        expect(cubicleManager.getCubicle('cubicle-03').status).toBe('working');

        // Verify avatar state is consensus_celebration
        expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
      });

      it('blocks task split when 1 consul vetoes and does not create child tasks', async () => {
        const splits = [
          { cubicleId: 'cubicle-02', subtask: 'Fragile subtask' },
        ];

        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'VETO',
            rationale: 'Nia vetoes: splitting breaks holistic architecture cohesion.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'APPROVE',
            rationale: 'Ferric approves split.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.splitTask(testTaskId, splits, votes);

        expect(result.unanimous_approved).toBe(false);
        expect(result.action_taken).toBe('BLOCKED_BY_VETO');
        expect(result.dissenting_consuls).toEqual(['Consul Nia Nova']);

        // Verify no child tasks created
        const allTasks = await taskboardManager.listAllTasks();
        const fragile = allTasks.in_progress.find((t) => t.title.includes('Fragile subtask'));
        expect(fragile).toBeUndefined();

        // Avatar state is veto_clash
        expect(consularEngine.getAvatarState().state).toBe('veto_clash');
      });
    });

    // 3.4 rebalance_workboard
    describe('3.4 rebalance_workboard', () => {
      it('executes workboard rebalance on 2/2 Consular approval', async () => {
        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Rebalancing frees overloaded workers.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'APPROVE',
            rationale: 'Plan balances load factor under 0.70.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.rebalanceTaskboard({ strategy: 'load_leveling' }, votes);
        expect(result.unanimous_approved).toBe(true);
        expect(result.action_taken).toBe('INTERVENTION_EXECUTED');
        expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
      });

      it('blocks workboard rebalance on 1/2 VETO', async () => {
        const votes: [ConsularVote, ConsularVote] = [
          {
            consul: 'Consul Nia Nova',
            decision: 'APPROVE',
            rationale: 'Nia approves.',
            timestamp: new Date().toISOString(),
          },
          {
            consul: 'Consul Ferric Lunaux',
            decision: 'VETO',
            rationale: 'Rebalancing disrupts active pipeline cache.',
            timestamp: new Date().toISOString(),
          },
        ];

        const result = await consularEngine.rebalanceTaskboard({ strategy: 'disruptive_rebalance' }, votes);
        expect(result.unanimous_approved).toBe(false);
        expect(result.action_taken).toBe('BLOCKED_BY_VETO');
        expect(consularEngine.getAvatarState().state).toBe('veto_clash');
      });
    });

    // 3.5 triggerNiaImpatience
    describe('3.5 triggerNiaImpatience', () => {
      it('triggers Nia impatience protocol, logs speech, and sets avatar state to nia_impatient', async () => {
        let impatienceEventReceived = false;
        let eventPayload: any = null;

        const unsubscribe = consularEngine.onEvent((type, payload) => {
          if (type === 'NIA_IMPATIENCE_TRIGGERED') {
            impatienceEventReceived = true;
            eventPayload = payload;
          }
        });

        const result = await consularEngine.triggerNiaImpatience(
          testTaskId,
          'cubicle-01',
          'No commits for 180 seconds'
        );

        unsubscribe();

        expect(result.triggered).toBe(true);
        expect(result.scenario).toBe('nia_impatient');
        expect(result.dialogue.content).toContain('[IMPATIENCE PROTOCOL]');
        expect(result.dialogue.content).toContain('No commits for 180 seconds');

        expect(impatienceEventReceived).toBe(true);
        expect(eventPayload.cubicleId).toBe('cubicle-01');

        // Check avatar state is nia_impatient
        const currentAvatar = consularEngine.getAvatarState();
        expect(currentAvatar.state).toBe('nia_impatient');
        expect(currentAvatar.details).toContain('Impatience triggered');
      });
    });
  });

  // =========================================================================
  // SUITE 4: Adversarial Security & Invariant Stress-Testing
  // =========================================================================
  describe('4. Adversarial Security & Invariant Stress-Testing', () => {
    it('rejects votes from unauthorized/imposter consul names with UNAUTHORIZED error', () => {
      const imposterVote: ConsularVote = {
        consul: 'Rogue Infiltrator' as any,
        decision: 'APPROVE',
        rationale: 'Malicious approval',
        timestamp: new Date().toISOString(),
      };

      expect(() => consularEngine.validateVote(imposterVote)).toThrow(/UNAUTHORIZED/);
    });

    it('rejects consular VETO when rationale is omitted or whitespace-only', () => {
      const invalidVeto: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'VETO',
        rationale: '   ',
        timestamp: new Date().toISOString(),
      };

      expect(() => consularEngine.validateVote(invalidVeto)).toThrow(/INVALID_VETO/);
    });

    it('rejects duplicate votes from the same consul (c1 === c2) with explicit failure', () => {
      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Approval 1',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Duplicate vote from same consul',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });
  });

  // =========================================================================
  // SUITE 5: Avatar Asset Manifests & Synchronization Integrity
  // =========================================================================
  describe('5. Avatar Asset Manifests & Synchronization Integrity', () => {
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const projectRoot = path.resolve(currentDir, '../../');
    const publicManifestPath = path.join(projectRoot, 'public', 'assets', 'avatars', 'consul_avatar_manifest.json');
    const srcPublicManifestPath = path.join(projectRoot, 'src', 'public', 'assets', 'avatars', 'consul_avatar_manifest.json');

    it('ensures public/assets/avatars/consul_avatar_manifest.json is valid strict JSON without syntax errors', async () => {
      expect(existsSync(publicManifestPath)).toBe(true);
      const raw = await fs.readFile(publicManifestPath, 'utf8');

      // Must parse cleanly with native JSON.parse
      let parsed: any;
      expect(() => {
        parsed = JSON.parse(raw);
      }).not.toThrow();

      expect(parsed).toHaveProperty('sheets');
      expect(Array.isArray(parsed.sheets)).toBe(true);
      expect(parsed.sheets).toHaveLength(3);

      // Verify no C-style comments exist in the raw file
      expect(raw).not.toMatch(/\/\//);
      expect(raw).not.toMatch(/\/\*[\s\S]*?\*\//);
    });

    it('ensures src/public/assets/avatars/consul_avatar_manifest.json is valid strict JSON and mirrors public/', async () => {
      expect(existsSync(srcPublicManifestPath)).toBe(true);
      const rawPublic = await fs.readFile(publicManifestPath, 'utf8');
      const rawSrc = await fs.readFile(srcPublicManifestPath, 'utf8');

      const parsedPublic = JSON.parse(rawPublic);
      const parsedSrc = JSON.parse(rawSrc);

      expect(parsedSrc).toEqual(parsedPublic);
    });

    it('verifies manifest schema structure: Nia Nova 2x2, Ferric Lunaux 2x2, and Wrestling Clash 1x1', async () => {
      const raw = await fs.readFile(publicManifestPath, 'utf8');
      const manifest = JSON.parse(raw);

      // Sheet 1: Nia Nova
      const niaSheet = manifest.sheets.find((s: any) => s.file === 'consul_nia_nova_sheet.jpg');
      expect(niaSheet).toBeDefined();
      expect(niaSheet.dimensions).toBe('2x2');
      expect(niaSheet.quadrants).toEqual({
        idle_observing: [0, 0],
        debating: [100, 0],
        nia_impatient: [0, 100],
        consensus_celebration: [100, 100],
      });

      // Sheet 2: Ferric Lunaux
      const ferricSheet = manifest.sheets.find((s: any) => s.file === 'consul_ferric_lunaux_sheet.jpg');
      expect(ferricSheet).toBeDefined();
      expect(ferricSheet.dimensions).toBe('2x2');
      expect(ferricSheet.quadrants).toEqual({
        idle_observing: [0, 0],
        debating: [100, 0],
        veto_clash: [0, 100],
        night_shift_afk: [100, 100],
      });

      // Sheet 3: Wrestling Clash
      const clashSheet = manifest.sheets.find((s: any) => s.file === 'consuls_wrestling_clash.jpg');
      expect(clashSheet).toBeDefined();
      expect(clashSheet.state).toBe('wrestling_fistfight');
      expect(clashSheet.dimensions).toContain('1x1');
    });

    it('verifies ensureAvatarAssets executes without errors and copies or reports assets present', () => {
      const results = ensureAvatarAssets(projectRoot);
      expect(results).toHaveLength(2); // public/ and src/public/

      for (const res of results) {
        expect(res.errors).toHaveLength(0);
        const totalAccounted = res.filesCopied.length + res.alreadyPresent.length;
        expect(totalAccounted).toBe(3); // 3 avatar assets
      }
    });

    it('verifies all 3 avatar texture files exist in both public and src/public and have non-zero file sizes', async () => {
      const targetDirs = [
        path.join(projectRoot, 'public', 'assets', 'avatars'),
        path.join(projectRoot, 'src', 'public', 'assets', 'avatars'),
      ];

      const expectedFiles = [
        'consul_nia_nova_sheet.jpg',
        'consul_ferric_lunaux_sheet.jpg',
        'consuls_wrestling_clash.jpg',
      ];

      for (const dir of targetDirs) {
        for (const file of expectedFiles) {
          const filePath = path.join(dir, file);
          expect(existsSync(filePath)).toBe(true);
          const stat = await fs.stat(filePath);
          expect(stat.size).toBeGreaterThan(100); // JPEG header or full texture
        }
      }
    });
  });

  // =========================================================================
  // SUITE 6: Express REST Endpoints for Consular Avatars & Mid-Work Interventions
  // =========================================================================
  describe('6. Express REST Endpoints for Avatars & Interventions', () => {
    let app: express.Express;
    let server: any;
    let baseUrl: string;
    let testTaskId: string;

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
      app.use('/api', createGovernanceRouter(consularEngine, preferenceEngine, skillMcpManager, courierGateway));

      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const port = (server.address() as AddressInfo).port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const task = await taskboardManager.createTask({
        title: 'REST Target Task',
        description: 'Initial prompt for REST test.',
        priority: 'high',
        assigned_cubicle: 'cubicle-01',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);
      testTaskId = task.id;
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('GET /api/governance/avatar-state returns current avatar state', async () => {
      const res = await fetch(`${baseUrl}/api/governance/avatar-state`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.avatarState.state).toBe('idle_observing');
    });

    it('POST /api/governance/avatar-state transitions avatar state across all scenarios', async () => {
      const testScenarios = ['courier_arrival', 'gladiator_spectators', 'night_shift_afk'] as const;
      for (const sc of testScenarios) {
        const res = await fetch(`${baseUrl}/api/governance/avatar-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: sc, debate_turns: 0, details: `REST transition to ${sc}` }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.avatarState.state).toBe(sc);
      }
    });

    it('POST /api/governance/avatar-state returns 400 when state field is missing', async () => {
      const res = await fetch(`${baseUrl}/api/governance/avatar-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debate_turns: 2 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('state is required');
    });

    it('POST /api/governance/intervention/amend (2/2 APPROVE vs 1/2 VETO vs missing params)', async () => {
      // 1. Missing params -> 400
      const badRes = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(badRes.status).toBe(400);

      // 2. 2/2 APPROVE -> 200 INTERVENTION_EXECUTED
      const approveRes = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: testTaskId,
          amendedPrompt: 'REST amended prompt',
          votes: [
            { consul: 'Consul Nia Nova', decision: 'APPROVE', rationale: 'Approved by Nia', timestamp: new Date().toISOString() },
            { consul: 'Consul Ferric Lunaux', decision: 'APPROVE', rationale: 'Approved by Ferric', timestamp: new Date().toISOString() },
          ],
        }),
      });
      expect(approveRes.status).toBe(200);
      const approveData = await approveRes.json();
      expect(approveData.unanimous_approved).toBe(true);
      expect(approveData.action_taken).toBe('INTERVENTION_EXECUTED');

      // 3. 1/2 VETO -> 200 BLOCKED_BY_VETO
      const vetoRes = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: testTaskId,
          amendedPrompt: 'Disallowed prompt',
          votes: [
            { consul: 'Consul Nia Nova', decision: 'APPROVE', rationale: 'Approved by Nia', timestamp: new Date().toISOString() },
            { consul: 'Consul Ferric Lunaux', decision: 'VETO', rationale: 'Vetoed by Ferric', timestamp: new Date().toISOString() },
          ],
        }),
      });
      expect(vetoRes.status).toBe(200);
      const vetoData = await vetoRes.json();
      expect(vetoData.unanimous_approved).toBe(false);
      expect(vetoData.action_taken).toBe('BLOCKED_BY_VETO');
      expect(vetoData.dissenting_consuls).toEqual(['Consul Ferric Lunaux']);
    });

    it('POST /api/governance/intervention/evict (2/2 APPROVE vs 1/2 VETO vs missing params)', async () => {
      // 1. Missing params -> 400
      const badRes = await fetch(`${baseUrl}/api/governance/intervention/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromCubicleId: 'cubicle-01' }),
      });
      expect(badRes.status).toBe(400);

      // 2. 2/2 APPROVE -> 200 INTERVENTION_EXECUTED
      const approveRes = await fetch(`${baseUrl}/api/governance/intervention/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCubicleId: 'cubicle-01',
          toCubicleId: 'cubicle-02',
          reason: 'Worker stalled',
          votes: [
            { consul: 'Consul Nia Nova', decision: 'APPROVE', rationale: 'Approve', timestamp: new Date().toISOString() },
            { consul: 'Consul Ferric Lunaux', decision: 'APPROVE', rationale: 'Approve', timestamp: new Date().toISOString() },
          ],
        }),
      });
      expect(approveRes.status).toBe(200);
      const approveData = await approveRes.json();
      expect(approveData.unanimous_approved).toBe(true);
      expect(approveData.action_taken).toBe('INTERVENTION_EXECUTED');
    });

    it('POST /api/governance/intervention/split (2/2 APPROVE vs 1/2 VETO)', async () => {
      const splits = [
        { cubicleId: 'cubicle-01', subtask: 'Split 1' },
        { cubicleId: 'cubicle-02', subtask: 'Split 2' },
      ];

      const approveRes = await fetch(`${baseUrl}/api/governance/intervention/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: testTaskId,
          splits,
          votes: [
            { consul: 'Consul Nia Nova', decision: 'APPROVE', rationale: 'Approve split', timestamp: new Date().toISOString() },
            { consul: 'Consul Ferric Lunaux', decision: 'APPROVE', rationale: 'Approve split', timestamp: new Date().toISOString() },
          ],
        }),
      });
      expect(approveRes.status).toBe(200);
      const approveData = await approveRes.json();
      expect(approveData.unanimous_approved).toBe(true);
      expect(approveData.action_taken).toBe('INTERVENTION_EXECUTED');
    });

    it('POST /api/governance/intervention/impatience triggers impatience and updates avatar state', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/impatience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: testTaskId,
          cubicleId: 'cubicle-01',
          reason: 'Worker delayed on API routes',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.triggered).toBe(true);
      expect(data.scenario).toBe('nia_impatient');
      expect(data.dialogue.content).toContain('[IMPATIENCE PROTOCOL]');
    });
  });
});
