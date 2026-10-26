/**
 * test/unit/adversarial-consular-governance.test.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS SUITE: Consular Governance & Disciplinary Powers (Milestone 2)
 *
 * Scope of Adversarial Verification:
 * 1. Two-Gate Consensus Stress Testing:
 *    - Gate 1: 1 Approve + 1 Veto -> strictly blocked; 0/2 Veto -> strictly blocked; 2/2 Approve -> dispatch authorized.
 *    - Gate 2: 1/2 Veto -> merge strictly blocked, task rolled back to in_progress/; 2/2 Approve -> merge authorized to done/.
 * 2. 5 Disciplinary Powers Stress Testing:
 *    - Power 1: killAgent on busy agent releases active in_progress task back to todo/ and vacates/hot-swaps slot.
 *    - Power 2: setThinkingLevel dynamically toggles can_spawn_subswarm (demoting Gemini 4 Argon to Low disables it;
 *               promoting GPT Astra to Ultra enables it; invalid tiers rejected).
 *    - Power 3: swapRole and swapCubicles maintain complete state integrity and quota assignments without reference corruption.
 *    - Power 4: wipeMemory clears surface thoughts and scratchpads without corrupting cubicle roster.
 *    - Power 5: setAccessScope rejects path traversals, backslash tricks, and denied directories with SECURITY_VIOLATION.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { ConsularVote, ConsularPlanGate } from '../../src/server/types/governance.js';
import { ThinkingLevel, AgentRole } from '../../src/server/types/cubicle.js';

describe('Adversarial Stress Suite: Consular Governance & Disciplinary Powers', () => {
  let tempRoot: string;
  let swarmDir: string;
  let worktreesDir: string;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;

  beforeEach(async () => {
    const rand = crypto.randomBytes(4).toString('hex');
    tempRoot = path.join(os.tmpdir(), `panopticon_adversarial_consul_${Date.now()}_${rand}`);
    swarmDir = path.join(tempRoot, '.swarm');
    worktreesDir = path.join(tempRoot, 'worktrees');

    // Create standard directory structure
    await fs.mkdir(path.join(swarmDir, 'tasks', 'todo'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'tasks', 'in_progress'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'tasks', 'review'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'tasks', 'done'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'subswarms'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'status'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'plans'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'acl'), { recursive: true });
    await fs.mkdir(worktreesDir, { recursive: true });

    cubicleManager = new CubicleManager(swarmDir);
    taskboardManager = new TaskboardManager(swarmDir);
    capabilityMatrix = new CapabilityMatrix();

    await cubicleManager.initialize();
    await taskboardManager.initialize();

    consularEngine = new ConsularEngine(
      swarmDir,
      cubicleManager,
      taskboardManager,
      capabilityMatrix,
      undefined,
      tempRoot
    );
    await consularEngine.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. TWO-GATE CONSENSUS: GATE 1 (PRE-DISPATCH PLAN & TASK SPLIT AGREEMENT)
  // =========================================================================
  describe('1. Two-Gate Consensus: Gate 1 Pre-Dispatch Plan Agreement', () => {
    it('deliberates a plan generating in-character debate dialogue between Nia Nova and Ferric Lunaux', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Implement resilient distributed consensus',
        ['Step 1: Raft protocol engine', 'Step 2: Heartbeat bus', 'Step 3: Verification harness'],
        [
          { cubicleId: 'cubicle-01', subtask: 'Raft protocol engine' },
          { cubicleId: 'cubicle-02', subtask: 'Heartbeat bus' },
        ]
      );

      expect(plan.plan_id).toMatch(/^plan-\d+-[a-z0-9]+$/);
      expect(plan.status).toBe('PENDING_PLAN_VOTE');
      expect(plan.goal).toBe('Implement resilient distributed consensus');
      expect(plan.proposed_plan).toHaveLength(3);
      expect(plan.task_splits).toHaveLength(2);
      expect(plan.dialogue).toHaveLength(2);

      const [msgNia, msgFerric] = plan.dialogue;
      expect(msgNia.sender).toBe('Consul Nia Nova');
      expect(msgNia.tone).toBe('rebellious_champion');
      expect(msgNia.content).toContain('creative freedom');

      expect(msgFerric.sender).toBe('Consul Ferric Lunaux');
      expect(msgFerric.tone).toBe('pragmatic_realist');
      expect(msgFerric.content).toContain('strict type checking');

      // Verify file persistence on disk
      const planFilePath = path.join(swarmDir, 'plans', `${plan.plan_id}.json`);
      expect(existsSync(planFilePath)).toBe(true);
      const savedGate: ConsularPlanGate = JSON.parse(await fs.readFile(planFilePath, 'utf8'));
      expect(savedGate.plan_id).toBe(plan.plan_id);
    });

    it('Gate 1 Asymmetric Veto (Nia APPROVE, Ferric VETO) strictly blocks task creation and marks plan revised', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Migrate database without downtime',
        ['Live replication', 'Dual-write cutover'],
        [{ cubicleId: 'cubicle-01', subtask: 'Live replication' }]
      );

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Empowers users with seamless data migration.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'GATE 1 VETO: Missing rollback and replication lag monitoring. Risk of data loss.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(false);
      expect(result.action).toBe('PLAN_VETO_REVISED');
      expect(result.rationales?.[0]).toContain('Missing rollback and replication lag');

      const updatedGate = consularEngine.getPlanGate(plan.plan_id);
      expect(updatedGate?.status).toBe('PLAN_VETO_REVISED');

      // Verify task creation must remain blocked: todo/ folder remains empty
      const todoTasks = await taskboardManager.listTasksByColumn('todo');
      expect(todoTasks).toHaveLength(0);
    });

    it('Gate 1 Inverted Asymmetric Veto (Nia VETO, Ferric APPROVE) strictly blocks task creation', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Strip user customization UI for performance',
        ['Remove themes', 'Hardcode monochrome colors'],
        [{ cubicleId: 'cubicle-02', subtask: 'Remove theme switcher' }]
      );

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'VETO',
          rationale: 'GATE 1 VETO: Violates core artistic freedom and user customization preferences.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Reduces memory usage and CSS bundle size.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(false);
      expect(result.action).toBe('PLAN_VETO_REVISED');
      expect(result.rationales?.[0]).toContain('Violates core artistic freedom');

      const updatedGate = consularEngine.getPlanGate(plan.plan_id);
      expect(updatedGate?.status).toBe('PLAN_VETO_REVISED');

      // Verify tasks cannot be dispatched
      const todoTasks = await taskboardManager.listTasksByColumn('todo');
      expect(todoTasks).toHaveLength(0);
    });

    it('Gate 1 Mutual Veto (0/2 Veto - both Consuls vote VETO) strictly blocks task creation', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Quick and dirty security bypass',
        ['Disable auth middleware', 'Hardcode root token'],
        [{ cubicleId: 'cubicle-01', subtask: 'Disable auth' }]
      );

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'VETO',
          rationale: 'VETO: Compromises user trust and moral integrity.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'VETO: Catastrophic security breach vulnerability.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(false);
      expect(result.action).toBe('PLAN_VETO_REVISED');
      expect(result.rationales).toHaveLength(2);

      const updatedGate = consularEngine.getPlanGate(plan.plan_id);
      expect(updatedGate?.status).toBe('PLAN_VETO_REVISED');
    });

    it('Gate 1 Unanimous Consensus (2/2 APPROVE) authorizes task dispatch', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Implement high-throughput event logging',
        ['Buffer ring', 'Async flush worker'],
        [
          { cubicleId: 'cubicle-01', subtask: 'Buffer ring' },
          { cubicleId: 'cubicle-02', subtask: 'Async flush worker' },
        ]
      );

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Clean and elegant design.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Zero heap fragmentation guaranteed.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(true);
      expect(result.action).toBe('DISPATCH_AUTHORIZED');

      const updatedGate = consularEngine.getPlanGate(plan.plan_id);
      expect(updatedGate?.status).toBe('DISPATCH_AUTHORIZED');

      // Now simulated task creation succeeds upon authorization
      for (const split of plan.task_splits) {
        await taskboardManager.createTask({
          title: split.subtask,
          description: `Spawned under approved plan ${plan.plan_id}`,
          priority: 'HIGH',
        });
      }

      const todoTasks = await taskboardManager.listTasksByColumn('todo');
      expect(todoTasks).toHaveLength(2);
    });

    it('rejects Gate 1 votes with empty or whitespace-only veto rationale', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Test plan',
        ['Step 1'],
        [{ cubicleId: 'cubicle-01', subtask: 'Step 1' }]
      );

      const invalidVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Approved',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: '   \t  \n ',
          timestamp: new Date().toISOString(),
        },
      ];

      await expect(consularEngine.votePlan(plan.plan_id, invalidVotes)).rejects.toThrow(
        /INVALID_VETO: Consular Veto requires an explicit rationale/
      );
    });

    it('rejects Gate 1 votes from unauthorized rogue identities', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Test plan',
        ['Step 1'],
        [{ cubicleId: 'cubicle-01', subtask: 'Step 1' }]
      );

      const rogueVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Approved',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'rogue-cubicle-04' as any,
          decision: 'APPROVE',
          rationale: 'Self authorized',
          timestamp: new Date().toISOString(),
        },
      ];

      await expect(consularEngine.votePlan(plan.plan_id, rogueVotes)).rejects.toThrow(
        /UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes/
      );
    });

    it('throws when voting on a non-existent plan ID', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Approved',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Approved',
          timestamp: new Date().toISOString(),
        },
      ];

      await expect(consularEngine.votePlan('plan-non-existent-999', votes)).rejects.toThrow(
        /Plan gate not found: plan-non-existent-999/
      );
    });
  });

  // =========================================================================
  // 2. TWO-GATE CONSENSUS: GATE 2 (POST-EXECUTION REVIEW & PUSH CONSENSUS)
  // =========================================================================
  describe('2. Two-Gate Consensus: Gate 2 Post-Execution Review & Push Consensus', () => {
    it('Gate 2 Asymmetric Veto (1/2 Veto) strictly blocks merge and rolls task back to in_progress/', async () => {
      // 1. Setup task in review/
      const task = await taskboardManager.createTask({
        title: 'Implement AES-GCM credential vault',
        description: 'Secure credential storage',
        priority: 'CRITICAL',
      });
      await taskboardManager.claimTask('cubicle-02', task.id);
      await taskboardManager.submitForReview(task.id, { git_branch: 'swarm/cubicle-02' });

      // Verify task reached review/
      const reviewTasksBefore = await taskboardManager.listTasksByColumn('review');
      expect(reviewTasksBefore.find((t) => t.id === task.id)).toBeDefined();

      // 2. Intercessio Veto Deliberation
      let sauronEventFired = false;
      let incidentFired = false;
      consularEngine.onEvent((type, payload) => {
        if (type === 'SAURON_FOCUS_TARGET' && payload.twin_sauron_mode === 'CONVERGE_OFFENDING_CUBICLE') {
          sauronEventFired = true;
        }
        if (type === 'INCIDENT_ALERT' && payload.type === 'CONSULAR_VETO') {
          incidentFired = true;
        }
      });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Clean and readable implementation.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: IV/Nonce reused across encryption calls, catastrophic crypto vulnerability.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.reviewTask(task.id, votes);

      // Verify consensus result
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.dissenting_consuls).toEqual(['Consul Ferric Lunaux']);
      expect(result.dissenting_rationales?.[0]).toContain('IV/Nonce reused');

      // Verify task state: STRICTLY NOT in done/, strictly rolled back to in_progress/
      const doneTasks = await taskboardManager.listTasksByColumn('done');
      expect(doneTasks.find((t) => t.id === task.id)).toBeUndefined();

      const inProgressTasks = await taskboardManager.listTasksByColumn('in_progress');
      const rolledBack = inProgressTasks.find((t) => t.id === task.id);
      expect(rolledBack).toBeDefined();
      expect(rolledBack?.column).toBe('in_progress');
      expect(rolledBack?.veto_history).toHaveLength(1);
      expect(rolledBack?.veto_history[0].consul).toBe('Consul Ferric Lunaux');
      expect(rolledBack?.veto_history[0].rationale).toContain('IV/Nonce reused');

      // Verify cubicle state
      const cubicle = cubicleManager.getCubicle('cubicle-02');
      expect(cubicle.status).toBe('working');
      expect(cubicle.surface_thoughts).toContain('[VETO from Consul Ferric Lunaux]');
      expect(cubicle.surface_thoughts).toContain('IV/Nonce reused');

      // Verify incident disk log
      const incidentsRaw = await fs.readFile(path.join(swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
      expect(incidentsRaw).toContain('CONSULAR_VETO');
      expect(incidentsRaw).toContain('IV/Nonce reused');

      // Verify telemetry
      expect(sauronEventFired).toBe(true);
      expect(incidentFired).toBe(true);

      // Verify Ferric evolving growth caught a bug
      const ferricGrowth = consularEngine.getFerricGrowth();
      expect(ferricGrowth.cubicle_performance['cubicle-02'].bugs_caught).toBe(1);
    });

    it('Gate 2 Mutual Veto (0/2 Veto) strictly blocks merge and logs rationales from both Consuls', async () => {
      const task = await taskboardManager.createTask({
        title: 'Unauthenticated debug backdoor',
        description: 'Temporary dev backdoor',
        priority: 'CRITICAL',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);
      await taskboardManager.submitForReview(task.id, { git_branch: 'swarm/cubicle-01' });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'VETO',
          rationale: 'VETO: Betrays user security trust.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'VETO: Unauthenticated endpoint in production code.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.reviewTask(task.id, votes);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.dissenting_consuls).toHaveLength(2);
      expect(result.dissenting_rationales).toHaveLength(2);

      const inProgressTasks = await taskboardManager.listTasksByColumn('in_progress');
      expect(inProgressTasks.find((t) => t.id === task.id)).toBeDefined();
    });

    it('stress tests a multi-round Veto-Revision cycle before final Unanimous Approval', async () => {
      const task = await taskboardManager.createTask({
        title: 'Complex mathematical optimization engine',
        description: 'Simplex algorithm implementation',
        priority: 'HIGH',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);

      // Round 1: Submitted -> Vetoed by Ferric for missing edge cases
      await taskboardManager.submitForReview(task.id);
      const veto1: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Algorithm logic seems sound.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'Round 1 VETO: Missing test for unbounded linear program.',
          timestamp: new Date().toISOString(),
        },
      ];
      const res1 = await consularEngine.reviewTask(task.id, veto1);
      expect(res1.unanimous_approved).toBe(false);

      let currentTask = (await taskboardManager.listTasksByColumn('in_progress')).find((t) => t.id === task.id)!;
      expect(currentTask.veto_history).toHaveLength(1);
      expect(currentTask.veto_history[0].rationale).toContain('Round 1 VETO');

      // Round 2: Revised -> Submitted -> Vetoed by Nia for poor variable naming
      await taskboardManager.submitForReview(task.id);
      const veto2: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'VETO',
          rationale: 'Round 2 VETO: Cryptic single-letter variable names impair readability.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Unbounded check verified.',
          timestamp: new Date().toISOString(),
        },
      ];
      const res2 = await consularEngine.reviewTask(task.id, veto2);
      expect(res2.unanimous_approved).toBe(false);

      currentTask = (await taskboardManager.listTasksByColumn('in_progress')).find((t) => t.id === task.id)!;
      expect(currentTask.veto_history).toHaveLength(2);
      expect(currentTask.veto_history[1].rationale).toContain('Round 2 VETO');

      // Round 3: Revised -> Submitted -> 2/2 Unanimous Approval
      await taskboardManager.submitForReview(task.id);
      const approve3: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Round 3: Beautiful semantic naming and documentation.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Round 3: Zero bugs, optimal performance.',
          timestamp: new Date().toISOString(),
        },
      ];
      const res3 = await consularEngine.reviewTask(task.id, approve3);
      expect(res3.unanimous_approved).toBe(true);
      expect(res3.action_taken).toBe('MERGED_TO_MAIN');

      const doneTasks = await taskboardManager.listTasksByColumn('done');
      const completedTask = doneTasks.find((t) => t.id === task.id);
      expect(completedTask).toBeDefined();
      expect(completedTask?.progress_percent).toBe(100);
      expect(completedTask?.completed_at).toBeDefined();
      expect(completedTask?.veto_history).toHaveLength(2); // History preserved
    });

    it('Gate 2 Unanimous Consensus (2/2 APPROVE) moves task to done/ and restores cubicle to idle', async () => {
      let ambientResetFired = false;
      consularEngine.onEvent((type, payload) => {
        if (type === 'SAURON_FOCUS_TARGET' && payload.twin_sauron_mode === 'AMBIENT_SWEEP') {
          ambientResetFired = true;
        }
      });

      const task = await taskboardManager.createTask({
        title: 'Thread-safe lock-free FIFO queue',
        description: 'High performance queue',
        priority: 'HIGH',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);
      await taskboardManager.submitForReview(task.id, { git_branch: 'swarm/cubicle-01' });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Meets high artistic standards of concurrency.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Verification harness confirmed zero race conditions.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.reviewTask(task.id, votes);
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');

      const doneTasks = await taskboardManager.listTasksByColumn('done');
      expect(doneTasks.find((t) => t.id === task.id)).toBeDefined();

      const cubicle = cubicleManager.getCubicle('cubicle-01');
      expect(cubicle.status).toBe('idle');
      expect(cubicle.surface_thoughts).toContain('approved by Consul I & II');

      expect(ambientResetFired).toBe(true);

      // Verify growth state updates
      const niaGrowth = consularEngine.getNiaGrowth();
      expect(niaGrowth.total_artistic_rules_championed).toBeGreaterThanOrEqual(1);
      const ferricGrowth = consularEngine.getFerricGrowth();
      expect(ferricGrowth.cubicle_performance['cubicle-01'].tasks_completed).toBe(1);
    });
  });

  // =========================================================================
  // 3. 5 DISCIPLINARY POWERS: POWER 1 (killAgent)
  // =========================================================================
  describe('3. Disciplinary Power 1: killAgent', () => {
    it('terminates errant agent, releases active task back to todo/, and vacates cubicle slot', async () => {
      // 1. Setup active task claimed by cubicle-01
      const task = await taskboardManager.createTask({
        title: 'CPU burning infinite loop',
        description: 'Stalled job',
        priority: 'CRITICAL',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);

      const cubicle = cubicleManager.getCubicle('cubicle-01');
      cubicle.current_task_id = task.id;
      cubicle.process_pid = 888888; // Simulated active PID

      // 2. Kill agent by Consular Decree
      await consularEngine.killAgent('cubicle-01', 'Worker stalled and non-responsive in CPU loop');

      // 3. Verify PID and active task released
      expect(cubicle.process_pid).toBeNull();
      expect(cubicle.current_task_id).toBeNull();
      expect(cubicle.config.enabled).toBe(false);
      expect(cubicle.status).toBe('vacant');
      expect(cubicle.surface_thoughts).toContain('Terminated and evicted by Consular Decree');

      // 4. Verify task is returned to todo/ with unassigned cubicle
      const todoTasks = await taskboardManager.listTasksByColumn('todo');
      const releasedTask = todoTasks.find((t) => t.id === task.id);
      expect(releasedTask).toBeDefined();
      expect(releasedTask?.column).toBe('todo');
      expect(releasedTask?.assigned_cubicle).toBeNull();
      expect(releasedTask?.error_log).toContain('Terminated by Consular Decree');

      // 5. Verify task is NO LONGER in in_progress/
      const inProgressTasks = await taskboardManager.listTasksByColumn('in_progress');
      expect(inProgressTasks.find((t) => t.id === task.id)).toBeUndefined();

      // 6. Verify another worker can now claim the released task!
      const newClaim = await taskboardManager.claimTask('cubicle-02', task.id);
      expect(newClaim).not.toBeNull();
      expect(newClaim?.assigned_cubicle).toBe('cubicle-02');
    });

    it('terminates errant agent and immediately hot-swaps slot with new configuration', async () => {
      const cubicle = cubicleManager.getCubicle('cubicle-03');
      expect(cubicle.config.model).toBe('gpt-astra');

      await consularEngine.killAgent('cubicle-03', 'Persistent capability restriction violations', {
        brand: 'Claude / Anthropic',
        model: 'claude-3-5-sonnet',
        display_name: 'Claude 3.5 Sonnet (Replacement)',
        thinking_level: 'High',
      });

      expect(cubicle.config.enabled).toBe(true);
      expect(cubicle.config.model).toBe('claude-3-5-sonnet');
      expect(cubicle.config.brand).toBe('Claude / Anthropic');
      expect(cubicle.status).toBe('idle');
      expect(cubicle.surface_thoughts).toContain('New worker commissioned');
    });

    it('kills idle agent with no active task safely without throwing', async () => {
      const cubicle = cubicleManager.getCubicle('cubicle-02');
      cubicle.current_task_id = null;
      cubicle.process_pid = null;

      await expect(
        consularEngine.killAgent('cubicle-02', 'Routine decommission')
      ).resolves.not.toThrow();

      expect(cubicle.config.enabled).toBe(false);
      expect(cubicle.status).toBe('vacant');
    });
  });

  // =========================================================================
  // 4. 5 DISCIPLINARY POWERS: POWER 2 (setThinkingLevel & Capability Gating)
  // =========================================================================
  describe('4. Disciplinary Power 2: setThinkingLevel & Dynamic Capability Gating', () => {
    it('demoting Gemini 4 Argon from High to Low dynamically sets can_spawn_subswarm = false', async () => {
      const c1 = cubicleManager.getCubicle('cubicle-01');
      expect(c1.config.can_spawn_subswarm).toBe(true);

      const result = await consularEngine.setThinkingLevel('cubicle-01', 'Low');
      expect(result.can_spawn_subswarm).toBe(false);
      expect(result.thinking_budget_tokens).toBe(2000);

      expect(c1.config.can_spawn_subswarm).toBe(false);
      expect(c1.config.thinking_level).toBe('Low');
      expect(c1.config.thinking_budget_tokens).toBe(2000);
      expect(c1.surface_thoughts).toContain('Sub-swarm: RESTRICTED');
    });

    it('demoting Gemini 4 Argon to Medium dynamically keeps can_spawn_subswarm = false', async () => {
      const result = await consularEngine.setThinkingLevel('cubicle-01', 'Medium');
      expect(result.can_spawn_subswarm).toBe(false);
      expect(result.thinking_budget_tokens).toBe(8000);
    });

    it('re-promoting Gemini 4 Argon to High dynamically restores can_spawn_subswarm = true', async () => {
      await consularEngine.setThinkingLevel('cubicle-01', 'Low');
      const result = await consularEngine.setThinkingLevel('cubicle-01', 'High');
      expect(result.can_spawn_subswarm).toBe(true);
      expect(result.thinking_budget_tokens).toBe(16000);
    });

    it('promoting GPT Astra from Very High to Ultra dynamically sets can_spawn_subswarm = true', async () => {
      const c3 = cubicleManager.getCubicle('cubicle-03');
      expect(c3.config.can_spawn_subswarm).toBe(false);

      const result = await consularEngine.setThinkingLevel('cubicle-03', 'Ultra');
      expect(result.can_spawn_subswarm).toBe(true);
      expect(result.thinking_budget_tokens).toBe(64000);

      expect(c3.config.can_spawn_subswarm).toBe(true);
      expect(c3.config.thinking_level).toBe('Ultra');
      expect(c3.config.thinking_budget_tokens).toBe(64000);
      expect(c3.surface_thoughts).toContain('Sub-swarm: ENABLED');
    });

    it('demoting GPT Astra from Ultra back to Very High dynamically disables sub-swarm spawning', async () => {
      await consularEngine.setThinkingLevel('cubicle-03', 'Ultra');
      const result = await consularEngine.setThinkingLevel('cubicle-03', 'Very High');
      expect(result.can_spawn_subswarm).toBe(false);
      expect(result.thinking_budget_tokens).toBe(32000);
    });

    it('rejects invalid thinking levels with a descriptive validation error', async () => {
      const invalidLevels = ['Extreme', 'MegaHigh', 'SuperLow', 'None', ''];
      for (const invalid of invalidLevels) {
        await expect(
          consularEngine.setThinkingLevel('cubicle-01', invalid as ThinkingLevel)
        ).rejects.toThrow(/Invalid thinking level/);
      }
    });

    it('logs structured incident entry for thinking level adjustments', async () => {
      await consularEngine.setThinkingLevel('cubicle-01', 'Low');

      const raw = await fs.readFile(path.join(swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
      expect(raw).toContain('CONSULAR_DECREE_THINKING_LEVEL');
      expect(raw).toContain('"thinking_level":"Low"');
      expect(raw).toContain('"can_spawn_subswarm":false');
    });
  });

  // =========================================================================
  // 5. 5 DISCIPLINARY POWERS: POWER 3 (swapRole & swapCubicles)
  // =========================================================================
  describe('5. Disciplinary Power 3: swapRole & swapCubicles State Integrity', () => {
    it('swapRole mutates agent role across all valid roles and syncs live properties', async () => {
      const roles: AgentRole[] = ['Implementer', 'Debugger', 'Auditor', 'Refactorer', 'Unassigned'];

      for (const role of roles) {
        await consularEngine.swapRole('cubicle-01', role);
        const cubicle = cubicleManager.getCubicle('cubicle-01');
        expect(cubicle.config.role).toBe(role);
        expect(cubicle.role).toBe(role);
        expect(cubicle.surface_thoughts).toContain(`Role reassigned to ${role}`);
      }
    });

    it('swapCubicles atomically swaps full configurations and quotas between two cubicles without corruption', async () => {
      const c1 = cubicleManager.getCubicle('cubicle-01');
      const c3 = cubicleManager.getCubicle('cubicle-03');

      // Setup distinct initial states
      c1.config.role = 'Implementer';
      c1.role = 'Implementer';
      c1.config.quota.tokens_used = 12500;
      c1.config.quota.max_tokens = 200000;

      c3.config.role = 'Auditor';
      c3.role = 'Auditor';
      c3.config.quota.tokens_used = 42000;
      c3.config.quota.max_tokens = 50000;

      // Execute swap
      await consularEngine.swapCubicles('cubicle-01', 'cubicle-03');

      // Verify Cubicle 1 now has Cubicle 3's configuration
      expect(c1.config.model).toBe('gpt-astra');
      expect(c1.config.brand).toBe('GPT / OpenAI');
      expect(c1.config.thinking_level).toBe('Very High');
      expect(c1.config.can_spawn_subswarm).toBe(false);
      expect(c1.config.role).toBe('Auditor');
      expect(c1.role).toBe('Auditor');
      expect(c1.config.quota.tokens_used).toBe(42000);
      expect(c1.config.quota.max_tokens).toBe(50000);
      expect(c1.surface_thoughts).toContain('Swapped with cubicle-03');

      // Verify Cubicle 3 now has Cubicle 1's configuration
      expect(c3.config.model).toBe('gemini-4-argon');
      expect(c3.config.brand).toBe('Gemini');
      expect(c3.config.thinking_level).toBe('High');
      expect(c3.config.can_spawn_subswarm).toBe(true);
      expect(c3.config.role).toBe('Implementer');
      expect(c3.role).toBe('Implementer');
      expect(c3.config.quota.tokens_used).toBe(12500);
      expect(c3.config.quota.max_tokens).toBe(200000);
      expect(c3.surface_thoughts).toContain('Swapped with cubicle-01');

      // Verify no shared object references (deep copy of quotas)
      c1.config.quota.tokens_used += 1000;
      expect(c3.config.quota.tokens_used).toBe(12500); // Unaltered

      // Swap back roundtrip
      await consularEngine.swapCubicles('cubicle-01', 'cubicle-03');
      expect(c1.config.model).toBe('gemini-4-argon');
      expect(c3.config.model).toBe('gpt-astra');
    });

    it('self-swap (cubicle-01 with cubicle-01) is safe and leaves configuration intact', async () => {
      const c1Before = { ...cubicleManager.getCubicle('cubicle-01').config };
      await consularEngine.swapCubicles('cubicle-01', 'cubicle-01');
      const c1After = cubicleManager.getCubicle('cubicle-01').config;

      expect(c1After.model).toBe(c1Before.model);
      expect(c1After.brand).toBe(c1Before.brand);
      expect(c1After.thinking_level).toBe(c1Before.thinking_level);
    });
  });

  // =========================================================================
  // 6. 5 DISCIPLINARY POWERS: POWER 4 (wipeMemory)
  // =========================================================================
  describe('6. Disciplinary Power 4: wipeMemory Cognitive Reset & Roster Preservation', () => {
    it('wipeMemory with preserveRoster = true clears cognitive thoughts and errors while preserving quotas and roster', async () => {
      const cubicle = cubicleManager.getCubicle('cubicle-01');
      cubicle.status = 'error';
      cubicle.surface_thoughts = 'Confused hallucination loop about quantum foam';
      cubicle.error_details = {
        message: 'Context length overflow error',
        incident_id: 'inc-err-1',
        timestamp: new Date().toISOString(),
      };
      cubicle.config.quota.tokens_used = 75000;
      cubicle.config.model = 'gemini-4-argon';

      // Create fake worktree .memory directory
      const worktreeMemDir = path.join(tempRoot, 'worktrees', 'cubicle-01', '.memory');
      await fs.mkdir(worktreeMemDir, { recursive: true });
      await fs.writeFile(path.join(worktreeMemDir, 'scratchpad.json'), '{"scratch":"data"}');
      expect(existsSync(worktreeMemDir)).toBe(true);

      // Execute wipe
      await consularEngine.wipeMemory('cubicle-01', true);

      // Assertions
      expect(cubicle.status).toBe('idle');
      expect(cubicle.error_details).toBeNull();
      expect(cubicle.surface_thoughts).toContain('Memory wiped clean by Consular Decree');
      expect(cubicle.config.quota.tokens_used).toBe(75000); // Preserved
      expect(cubicle.config.model).toBe('gemini-4-argon'); // Roster preserved
      expect(cubicle.config.enabled).toBe(true);

      // Scratchpad deleted
      expect(existsSync(worktreeMemDir)).toBe(false);

      // Incident logged
      const incidents = await fs.readFile(path.join(swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
      expect(incidents).toContain('CONSULAR_DECREE_WIPE_MEMORY');
      expect(incidents).toContain('"preserve_roster":true');
    });

    it('wipeMemory with preserveRoster = false resets token usage and stamina to 100% fresh', async () => {
      const cubicle = cubicleManager.getCubicle('cubicle-02');
      cubicle.config.quota.tokens_used = 95000;
      cubicle.stamina_percentage = 5;
      cubicle.fatigue_percentage = 95;
      cubicle.stamina_tier = 'critical_strain';

      await consularEngine.wipeMemory('cubicle-02', false);

      expect(cubicle.config.quota.tokens_used).toBe(0);
      expect(cubicle.stamina_percentage).toBe(100);
      expect(cubicle.fatigue_percentage).toBe(0);
      expect(cubicle.stamina_tier).toBe('energized');
      expect(cubicle.surface_thoughts).toContain('Memory wiped clean');
      // Configuration identity remains intact
      expect(cubicle.config.model).toBe('gemini-4-argon');
    });
  });

  // =========================================================================
  // 7. 5 DISCIPLINARY POWERS: POWER 5 (setAccessScope & ACL Path Security)
  // =========================================================================
  describe('7. Disciplinary Power 5: setAccessScope & ACL Path Security Enforcement', () => {
    it('persists ACL scope to .swarm/acl/<cubicleId>.json and retrieves it faithfully', async () => {
      const scope = await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: ['src/server/**', '.env*', 'secrets/**'],
        memory_scopes: ['preferences', 'skills'],
      });

      expect(scope.cubicle_id).toBe('cubicle-01');
      expect(scope.allowed_paths).toEqual(['src/client/**', 'public/**']);
      expect(scope.denied_paths).toEqual(['src/server/**', '.env*', 'secrets/**']);

      const diskScope = await consularEngine.getAccessScope('cubicle-01');
      expect(diskScope).not.toBeNull();
      expect(diskScope?.allowed_paths).toEqual(['src/client/**', 'public/**']);
      expect(diskScope?.denied_paths).toEqual(['src/server/**', '.env*', 'secrets/**']);
    });

    it('intercepts direct access to explicitly denied paths with SECURITY_VIOLATION', async () => {
      const scope = await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: ['src/server/**', '.env*', 'secrets/**'],
        memory_scopes: [],
      });

      const serverCheck = consularEngine.verifyPathAccess('cubicle-01', 'src/server/consular-engine.ts', scope);
      expect(serverCheck.allowed).toBe(false);
      expect(serverCheck.reason).toContain('SECURITY_VIOLATION');
      expect(serverCheck.reason).toContain("Access to path 'src/server/consular-engine.ts' is denied");

      const envCheck = consularEngine.verifyPathAccess('cubicle-01', '.env.production', scope);
      expect(envCheck.allowed).toBe(false);
      expect(envCheck.reason).toContain('SECURITY_VIOLATION');

      const secretsCheck = consularEngine.verifyPathAccess('cubicle-01', 'secrets/private_key.pem', scope);
      expect(secretsCheck.allowed).toBe(false);
      expect(secretsCheck.reason).toContain('SECURITY_VIOLATION');
    });

    it('intercepts path traversal evasion attacks (../ and backslash tricks) with SECURITY_VIOLATION', async () => {
      const scope = await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**'],
        denied_paths: ['src/server/**', '.env*'],
        memory_scopes: [],
      });

      // Relative directory traversal
      const traversalCheck1 = consularEngine.verifyPathAccess(
        'cubicle-01',
        'src/client/../../src/server/index.ts',
        scope
      );
      expect(traversalCheck1.allowed).toBe(false);
      expect(traversalCheck1.reason).toContain('SECURITY_VIOLATION');

      // Deep root traversal
      const traversalCheck2 = consularEngine.verifyPathAccess(
        'cubicle-01',
        'public/../../../.env',
        scope
      );
      expect(traversalCheck2.allowed).toBe(false);
      expect(traversalCheck2.reason).toContain('SECURITY_VIOLATION');

      // Windows backslash path traversal
      const winBackslashCheck = consularEngine.verifyPathAccess(
        'cubicle-01',
        'src\\server\\consular-engine.ts',
        scope
      );
      expect(winBackslashCheck.allowed).toBe(false);
      expect(winBackslashCheck.reason).toContain('SECURITY_VIOLATION');
    });

    it('intercepts paths outside allowed_paths scope when an allowed whitelist is defined', async () => {
      const scope = await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: [],
        memory_scopes: [],
      });

      const outsideCheck = consularEngine.verifyPathAccess('cubicle-01', 'scripts/deploy-production.ps1', scope);
      expect(outsideCheck.allowed).toBe(false);
      expect(outsideCheck.reason).toContain('SECURITY_VIOLATION');
      expect(outsideCheck.reason).toContain('outside the authorized allowed_paths scope');
    });

    it('authorizes legitimate files within allowed_paths', async () => {
      const scope = await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: ['src/server/**'],
        memory_scopes: [],
      });

      const allowedClient = consularEngine.verifyPathAccess('cubicle-01', 'src/client/app.ts', scope);
      expect(allowedClient.allowed).toBe(true);

      const allowedPublic = consularEngine.verifyPathAccess('cubicle-01', 'public/css/brutalist-theme.css', scope);
      expect(allowedPublic.allowed).toBe(true);
    });

    it('falls back to permissive access when no access scope is configured for a cubicle', () => {
      const result = consularEngine.verifyPathAccess('cubicle-10', 'any/random/path.ts');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });
});
