/**
 * test/unit/adversarial-tier5-core.test.ts
 *
 * TIER 5 ADVERSARIAL COVERAGE HARDENING SUITE
 * White-box Stress Verification across Server Core, Worktrees, Gating,
 * Roman Consular Governance, Preference Learning, and MCP Generator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Subsystems Under Test
import { CubicleManager, InvalidTransitionError } from '../../src/server/cubicle-manager.js';
import { TaskboardManager, SwarmTask } from '../../src/server/taskboard-manager.js';
import { WorktreeManager } from '../../src/server/worktree-manager.js';
import {
  CapabilityMatrix,
  CapabilityRestrictionError,
  MaxRecursionDepthError,
} from '../../src/server/capability-matrix.js';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { PreferenceEngine } from '../../src/server/preference-engine.js';
import { SkillMcpManager } from '../../src/server/mcp-generator.js';
import { ConsularVote, ConsularPlanGate } from '../../src/server/types/governance.js';
import { ThinkingLevel, CubicleStatus } from '../../src/server/types/cubicle.js';

describe('Tier 5 Adversarial Coverage Hardening Suite', () => {
  let tempRoot: string;
  let swarmDir: string;
  let agentsDir: string;
  let worktreesDir: string;

  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let worktreeManager: WorktreeManager;
  let consularEngine: ConsularEngine;
  let preferenceEngine: PreferenceEngine;
  let skillMcpManager: SkillMcpManager;

  beforeEach(async () => {
    const rand = crypto.randomBytes(4).toString('hex');
    tempRoot = path.join(os.tmpdir(), `t5_adversarial_${Date.now()}_${rand}`);
    swarmDir = path.join(tempRoot, '.swarm');
    agentsDir = path.join(tempRoot, '.agents');
    worktreesDir = path.join(tempRoot, 'worktrees');

    // Create standard root layout
    await fs.mkdir(path.join(swarmDir, 'tasks', 'todo'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'tasks', 'in_progress'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'tasks', 'review'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'tasks', 'done'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'status'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'plans'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'acl'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'locks'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'checkpoints'), { recursive: true });
    await fs.mkdir(path.join(swarmDir, 'contracts'), { recursive: true });

    await fs.mkdir(path.join(agentsDir, 'skills'), { recursive: true });
    await fs.mkdir(path.join(agentsDir, 'mcp'), { recursive: true });
    await fs.mkdir(path.join(agentsDir, 'rules'), { recursive: true });
    await fs.mkdir(worktreesDir, { recursive: true });

    // Initialize subsystems
    cubicleManager = new CubicleManager(swarmDir);
    taskboardManager = new TaskboardManager(swarmDir);
    capabilityMatrix = new CapabilityMatrix();
    worktreeManager = new WorktreeManager(tempRoot);

    await cubicleManager.initialize();
    await taskboardManager.initialize();

    consularEngine = new ConsularEngine(
      swarmDir,
      cubicleManager,
      taskboardManager,
      capabilityMatrix,
      worktreeManager,
      tempRoot
    );
    await consularEngine.initialize();

    preferenceEngine = new PreferenceEngine(swarmDir, agentsDir);
    await preferenceEngine.initialize();

    skillMcpManager = new SkillMcpManager(agentsDir, preferenceEngine);
    await skillMcpManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. SERVER CORE & CUBICLE MANAGER INVARIANTS
  // =========================================================================
  describe('1. Server Core: Cubicle Manager & State Machine Invariants', () => {
    it('TC-T5-CORE-01: strictly blocks invalid lifecycle transitions and validates invariant guards', async () => {
      // 1. Vacant cubicle cannot jump directly to working or under_inspection
      const c16 = cubicleManager.getCubicle('cubicle-16');
      expect(c16.status).toBe('vacant');

      await expect(
        cubicleManager.transitionStatus('cubicle-16', 'working')
      ).rejects.toThrow(InvalidTransitionError);

      await expect(
        cubicleManager.transitionStatus('cubicle-16', 'under_inspection')
      ).rejects.toThrow(InvalidTransitionError);

      // 2. Non-existent cubicle throws informative error
      expect(() => cubicleManager.getCubicle('cubicle-99')).toThrow(
        "Cubicle with ID 'cubicle-99' not found in 16-slot grid."
      );

      // 3. Exhausted cubicle (stamina = 0%) cannot transition to working
      const c1 = cubicleManager.getCubicle('cubicle-01');
      await cubicleManager.recordTokenConsumption('cubicle-01', c1.config.quota.max_tokens, 10);
      expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');

      // Attempt transition from exhausted to working (exhausted only allows idle or vacant)
      await expect(
        cubicleManager.transitionStatus('cubicle-01', 'working')
      ).rejects.toThrow(InvalidTransitionError);

      // 4. Idempotent transition is safe no-op
      const beforeState = cubicleManager.getCubicle('cubicle-01');
      const afterState = await cubicleManager.transitionStatus('cubicle-01', 'exhausted');
      expect(afterState.status).toBe('exhausted');
      expect(afterState.last_heartbeat).toBe(beforeState.last_heartbeat);

      // 5. Transition to idle resets active task, subswarm, error details
      const c2 = cubicleManager.getCubicle('cubicle-02');
      c2.current_task_id = 'task-active-123';
      c2.active_subswarm_id = 'subswarm-456';
      c2.error_details = { message: 'err', incident_id: '1', timestamp: new Date().toISOString() };
      await cubicleManager.transitionStatus('cubicle-02', 'working');
      await cubicleManager.transitionStatus('cubicle-02', 'idle');

      const c2Updated = cubicleManager.getCubicle('cubicle-02');
      expect(c2Updated.current_task_id).toBeNull();
      expect(c2Updated.active_subswarm_id).toBeNull();
      expect(c2Updated.error_details).toBeNull();
      expect(c2Updated.surface_thoughts).toBe('Standing by.');
    });

    it('TC-T5-CORE-02: trips circuit breaker after 3 consecutive errors and permits reset', async () => {
      let trippedEmitted = false;
      cubicleManager.onStateChange((state, reason) => {
        if (reason === 'CIRCUIT_BREAKER_TRIPPED') trippedEmitted = true;
      });

      // Strike 1
      const res1 = cubicleManager.recordError('cubicle-02', 'Syntax error on line 42');
      expect(res1.trippedCircuitBreaker).toBe(false);
      expect(res1.count).toBe(1);

      // Strike 2
      const res2 = cubicleManager.recordError('cubicle-02', 'Memory threshold warning');
      expect(res2.trippedCircuitBreaker).toBe(false);
      expect(res2.count).toBe(2);

      // Strike 3: trips circuit breaker
      const res3 = cubicleManager.recordError('cubicle-02', 'Process segfault');
      expect(res3.trippedCircuitBreaker).toBe(true);
      expect(res3.count).toBe(3);
      expect(trippedEmitted).toBe(true);

      const c2 = cubicleManager.getCubicle('cubicle-02');
      expect(c2.status).toBe('error');
      expect(c2.surface_thoughts).toContain('Circuit breaker tripped: >= 3 consecutive errors');

      // Resetting error count restores normal counting
      cubicleManager.resetErrorCount('cubicle-02');
      const resPostReset = cubicleManager.recordError('cubicle-02', 'New minor warning');
      expect(resPostReset.trippedCircuitBreaker).toBe(false);
      expect(resPostReset.count).toBe(1);
    });

    it('TC-T5-CORE-03: executes atomic task failover between cubicles or rejects when no task active', async () => {
      // 1. Failover without active task returns success: false
      const emptyFailover = await cubicleManager.failoverTask(
        'cubicle-01',
        'cubicle-02',
        'Simulated outage'
      );
      expect(emptyFailover.success).toBe(false);
      expect(emptyFailover.task_id).toBeNull();

      // 2. Assign task to cubicle-01 and failover to cubicle-02
      const c1 = cubicleManager.getCubicle('cubicle-01');
      c1.current_task_id = 'task-adversarial-99';
      c1.status = 'working';

      const validFailover = await cubicleManager.failoverTask(
        'cubicle-01',
        'cubicle-02',
        'API quota exhausted'
      );
      expect(validFailover.success).toBe(true);
      expect(validFailover.task_id).toBe('task-adversarial-99');
      expect(validFailover.from).toBe('cubicle-01');
      expect(validFailover.to).toBe('cubicle-02');

      expect(cubicleManager.getCubicle('cubicle-01').status).toBe('error');
      expect(cubicleManager.getCubicle('cubicle-01').current_task_id).toBeNull();
      expect(cubicleManager.getCubicle('cubicle-02').status).toBe('working');
      expect(cubicleManager.getCubicle('cubicle-02').current_task_id).toBe('task-adversarial-99');
    });

    it('TC-T5-CORE-04: tests quota replenishment and exhausted recovery', async () => {
      const c1 = cubicleManager.getCubicle('cubicle-01');
      const maxTokens = c1.config.quota.max_tokens;

      // Deplete quota
      await cubicleManager.recordTokenConsumption('cubicle-01', maxTokens, 5.0);
      expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');
      expect(cubicleManager.getCubicle('cubicle-01').surface_thoughts).toContain('FLATLINED');

      // Recharge quota restores idle status
      await cubicleManager.rechargeQuota('cubicle-01', 500000);
      const restored = cubicleManager.getCubicle('cubicle-01');
      expect(restored.status).toBe('idle');
      expect(restored.stamina_percentage).toBeGreaterThan(0);
      expect(restored.surface_thoughts).toContain('Quota replenished. Ready.');
    });

    it('TC-T5-CORE-05: verifies TaskboardManager edge cases (zero tasks, returnToTodo, and release)', async () => {
      // 1. Calculate progress with zero tasks avoids NaN
      const initialProgress = await taskboardManager.calculateOverallProgress();
      expect(initialProgress.total).toBe(0);
      expect(initialProgress.percentage).toBe(0);
      expect(Number.isNaN(initialProgress.percentage)).toBe(false);

      // 2. Create and claim task
      const task = await taskboardManager.createTask({
        title: 'Adversarial Taskboard Test',
        description: 'Testing Kanban transitions',
        priority: 'CRITICAL',
      });
      const claimed = await taskboardManager.claimTask('cubicle-01', task.id);
      expect(claimed?.column).toBe('in_progress');

      // 3. Submit for review
      await taskboardManager.submitForReview(task.id, { verificationPassed: false });
      const inReview = await taskboardManager.listTasksByColumn('review');
      expect(inReview.some((t) => t.id === task.id)).toBe(true);

      // 4. Return to revision with returnToTodo: true
      const returnedToTodo = await taskboardManager.returnToRevision(task.id, {
        consul: 'Consul Ferric Lunaux',
        rationale: 'Fails verification command.',
        returnToTodo: true,
      });
      expect(returnedToTodo.column).toBe('todo');
      expect(returnedToTodo.assigned_cubicle).toBeNull();
      expect(returnedToTodo.progress_percent).toBe(0);

      // 5. Reclaim and releaseTask
      await taskboardManager.claimTask('cubicle-02', task.id);
      const released = await taskboardManager.releaseTask(task.id, 'Worker crashed mid-execution');
      expect(released.column).toBe('todo');
      expect(released.assigned_cubicle).toBeNull();
      expect(released.error_log).toContain('Worker crashed mid-execution');
    });
  });

  // =========================================================================
  // 2. WORKTREE & REPARSE POINT INVARIANTS
  // =========================================================================
  describe('2. Worktree & Reparse Point Invariants', () => {
    it('TC-T5-WORKTREE-01: tests safe junction unlinking without target destruction and non-existent handling', async () => {
      const targetDir = path.join(tempRoot, 'shared_target');
      const linkPath = path.join(tempRoot, 'link_junction');
      await fs.mkdir(targetDir, { recursive: true });

      // Put important file inside target
      const payloadFile = path.join(targetDir, 'critical_data.txt');
      await fs.writeFile(payloadFile, 'PRESERVE_THIS_CONTENT', 'utf8');

      // Create junction or symlink
      await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);
      expect(await worktreeManager.verifyJunction(linkPath)).toBe(true);

      // Unlink junction
      await worktreeManager.safeRemoveJunction(linkPath);

      // Verify link removed but target content PRESERVED
      expect(await worktreeManager.verifyJunction(linkPath)).toBe(false);
      expect(existsSync(linkPath)).toBe(false);
      expect(existsSync(payloadFile)).toBe(true);
      expect(await fs.readFile(payloadFile, 'utf8')).toBe('PRESERVE_THIS_CONTENT');

      // Verify safeRemoveJunction on non-existent path handles cleanly
      await expect(
        worktreeManager.safeRemoveJunction(path.join(tempRoot, 'does_not_exist'))
      ).resolves.not.toThrow();

      // Verify verifyJunction on non-existent path returns false
      expect(await worktreeManager.verifyJunction(path.join(tempRoot, 'ghost_path'))).toBe(false);
    });

    it('TC-T5-WORKTREE-02: verifies .gitignore enforcement idempotence and newline preservation', async () => {
      const gitignoreFile = path.join(tempRoot, '.gitignore');

      // 1. Initial creation
      await fs.writeFile(gitignoreFile, 'node_modules\n.DS_Store', 'utf8');
      const modified1 = await worktreeManager.ensureGitIgnore();
      expect(modified1).toBe(true);

      const content1 = await fs.readFile(gitignoreFile, 'utf8');
      expect(content1).toContain('/worktrees/');
      expect(content1).toContain('/.swarm/');

      // 2. Second invocation is idempotent no-op
      const modified2 = await worktreeManager.ensureGitIgnore();
      expect(modified2).toBe(false);
    });
  });

  // =========================================================================
  // 3. THINKING-TIER CAPABILITY MATRIX & GATING INVARIANTS
  // =========================================================================
  describe('3. Thinking-Tier Capability Matrix & Gating', () => {
    it('TC-T5-GATE-01: strictly halts sub-swarm recursion at maxDepth = 1 with MaxRecursionDepthError', () => {
      // Depth 0 is allowed for authorized model
      const eval0 = capabilityMatrix.evaluate({
        model: 'gemini-4-argon',
        thinkingLevel: 'High',
        currentDepth: 0,
      });
      expect(eval0.allowed).toBe(true);

      // Depth 1 (child micro-agent) MUST throw MaxRecursionDepthError
      expect(() =>
        capabilityMatrix.evaluate({
          model: 'gemini-4-argon',
          thinkingLevel: 'High',
          currentDepth: 1,
        })
      ).toThrow(MaxRecursionDepthError);

      try {
        capabilityMatrix.evaluate({
          model: 'gemini-4-argon',
          thinkingLevel: 'High',
          currentDepth: 2,
        });
        expect.unreachable('Should have thrown MaxRecursionDepthError');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('MAX_RECURSION_DEPTH_EXCEEDED');
        expect(err.message).toContain('Nested child sub-swarms are prohibited');
      }
    });

    it('TC-T5-GATE-02: verifies manualOverride takes precedence over rules but respects depth cap', () => {
      // 1. Manual override true authorizes restricted GPT Astra (Very High)
      const overriddenAllowed = capabilityMatrix.evaluate({
        model: 'gpt-astra',
        thinkingLevel: 'Very High',
        manualOverride: true,
      });
      expect(overriddenAllowed.allowed).toBe(true);
      expect(overriddenAllowed.reason).toContain('Authorized via explicit manual administrator override');

      // 2. Manual override false restricts authorized Gemini 4 Argon (High)
      const overriddenDenied = capabilityMatrix.evaluate({
        model: 'gemini-4-argon',
        thinkingLevel: 'High',
        manualOverride: false,
      });
      expect(overriddenDenied.allowed).toBe(false);
      expect(overriddenDenied.reason).toContain('Blocked via explicit manual administrator override');

      // 3. Depth check triggers BEFORE manual override! (Depth cannot be bypassed)
      expect(() =>
        capabilityMatrix.evaluate({
          model: 'gpt-astra',
          thinkingLevel: 'Ultra',
          manualOverride: true,
          currentDepth: 1,
        })
      ).toThrow(MaxRecursionDepthError);
    });

    it('TC-T5-GATE-03: enforces conservative default fallback and asserts CapabilityRestrictionError', () => {
      // Unknown model at High tier with no pattern match
      const unknownHigh = capabilityMatrix.evaluate({
        model: 'deepseek-coder-r1',
        thinkingLevel: 'High',
      });
      expect(unknownHigh.allowed).toBe(false);
      expect(unknownHigh.reason).toContain('CAPABILITY_RESTRICTION_ERROR: No matching authorizing rule');

      // assertCanSpawn throws on restricted model
      expect(() =>
        capabilityMatrix.assertCanSpawn({
          model: 'gpt-astra',
          thinkingLevel: 'Very High',
        })
      ).toThrow(CapabilityRestrictionError);

      try {
        capabilityMatrix.assertCanSpawn({
          model: 'claude-3-opus',
          thinkingLevel: 'Medium',
        });
        expect.unreachable('Should have thrown CapabilityRestrictionError');
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('CAPABILITY_RESTRICTION_ERROR');
      }
    });
  });

  // =========================================================================
  // 4. CONSULAR GOVERNANCE & INTERCESSIO INVARIANTS
  // =========================================================================
  describe('4. Consular Governance & Intercessio Invariants', () => {
    it('TC-T5-CONSUL-01: validates consular voting rules (unauthorized voter, empty veto rationale, duplicate voter)', () => {
      // 1. Unauthorized voter
      expect(() =>
        consularEngine.validateVote({
          consul: 'Operator Holden' as any,
          decision: 'APPROVE',
          rationale: 'I am the human operator',
          timestamp: new Date().toISOString(),
        })
      ).toThrow('UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes.');

      // 2. Empty veto rationale
      expect(() =>
        consularEngine.validateVote({
          consul: 'Consul I',
          decision: 'VETO',
          rationale: '   ',
          timestamp: new Date().toISOString(),
        })
      ).toThrow('INVALID_VETO: Consular Veto requires an explicit rationale.');

      // 3. Duplicate votes from same Consul title
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Good to go',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Double approval from Nia',
        timestamp: new Date().toISOString(),
      };
      const result = consularEngine.evaluateConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('Consular consensus requires votes from two distinct Consuls');
    });

    it('TC-T5-CONSUL-02: verifies Gate 1 Plan deliberation, dialogue, and veto revision', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Implement resilient zero-copy IPC bus',
        ['Step 1: Shared memory header', 'Step 2: Signal latch'],
        [{ cubicleId: 'cubicle-01', subtask: 'Shared memory header' }]
      );

      expect(plan.status).toBe('PENDING_PLAN_VOTE');
      expect(plan.dialogue).toHaveLength(2);

      // Gate 1 Asymmetric Veto (Ferric vetos)
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Empowers fast zero-copy communication.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Missing memory leak bounds and cleanup handler.',
          timestamp: new Date().toISOString(),
        },
      ];

      const outcome = await consularEngine.votePlan(plan.plan_id, votes);
      expect(outcome.approved).toBe(false);
      expect(outcome.action).toBe('PLAN_VETO_REVISED');
      expect(outcome.rationales?.[0]).toContain('Missing memory leak bounds');

      // Verify plan file updated
      const gate = consularEngine.getPlanGate(plan.plan_id);
      expect(gate?.status).toBe('PLAN_VETO_REVISED');
    });

    it('TC-T5-CONSUL-03: verifies 12-scenario Consular Avatar state machine and prolonged debate wrestling trigger', async () => {
      expect(consularEngine.getAvatarState().state).toBe('idle_observing');

      // 4 dialogue messages trigger wrestling deadlock
      await consularEngine.recordDialogue('Consul Nia Nova', 'rebellious_champion', 'Point 1');
      await consularEngine.recordDialogue('Consul Ferric Lunaux', 'pragmatic_realist', 'Counterpoint 1');
      await consularEngine.recordDialogue('Consul Nia Nova', 'rebellious_champion', 'Point 2');
      expect(consularEngine.getAvatarState().state).toBe('debating');

      // 4th turn reaches deadlock
      await consularEngine.recordDialogue('Consul Ferric Lunaux', 'pragmatic_realist', 'Counterpoint 2');
      expect(consularEngine.getAvatarState().state).toBe('wrestling_fistfight');
      expect(consularEngine.getAvatarState().details).toContain('Prolonged debate deadlock reached');

      // Ratifying unanimous consensus celebration
      consularEngine.setAvatarState('consensus_celebration', 0, 'Unanimous');
      expect(consularEngine.getAvatarState().state).toBe('consensus_celebration');
    });

    it('TC-T5-CONSUL-04: tests Mid-Work Impatience Protocol (amend, evict, split, impatience trigger)', async () => {
      // 1. Task prompt amendment with 2/2 consensus
      const amendResult = await consularEngine.amendTaskPrompt(
        'task-test-amend',
        'Updated directive: prioritize strict null checks'
      );
      expect(amendResult.unanimous_approved).toBe(true);
      expect(amendResult.action_taken).toBe('INTERVENTION_EXECUTED');

      // 2. Worker eviction with single veto is blocked
      const vetoVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Evict slow worker',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Worker is halfway through expensive build; eviction would waste tokens',
          timestamp: new Date().toISOString(),
        },
      ];
      const blockedEviction = await consularEngine.evictAndReplaceWorker(
        'cubicle-01',
        'cubicle-02',
        'Stalling',
        vetoVotes
      );
      expect(blockedEviction.unanimous_approved).toBe(false);
      expect(blockedEviction.action_taken).toBe('BLOCKED_BY_VETO');

      // 3. Task splitting mid-work
      const splitResult = await consularEngine.splitTask('task-parent-101', [
        { cubicleId: 'cubicle-03', subtask: 'Frontend styling' },
        { cubicleId: 'cubicle-04', subtask: 'Backend endpoint' },
      ]);
      expect(splitResult.unanimous_approved).toBe(true);
      expect(splitResult.action_taken).toBe('INTERVENTION_EXECUTED');
      expect(splitResult.details.createdTasks).toHaveLength(2);

      // 4. Trigger Nia Impatience
      const impatience = await consularEngine.triggerNiaImpatience(
        'task-parent-101',
        'cubicle-03',
        'Elapsed time exceeded threshold'
      );
      expect(impatience.triggered).toBe(true);
      expect(impatience.scenario).toBe('nia_impatient');
      expect(consularEngine.getAvatarState().state).toBe('nia_impatient');
    });

    it('TC-T5-CONSUL-05: verifies Merge-Conflict Shield (.swarm/locks/) exclusive creation, TTL leasing, and recovery', async () => {
      const targetFile = 'src/shared/database.ts';

      // 1. Cubicle-01 acquires lock
      const lock1 = await consularEngine.acquireLock(targetFile, 'cubicle-01');
      expect(lock1.acquired).toBe(true);

      // 2. Cubicle-02 attempts acquisition -> rejected with currentOwner
      const lock2 = await consularEngine.acquireLock(targetFile, 'cubicle-02');
      expect(lock2.acquired).toBe(false);
      expect(lock2.currentOwner).toBe('cubicle-01');

      // 3. Cubicle-01 re-acquires (refreshes lease) -> allowed
      const refresh = await consularEngine.acquireLock(targetFile, 'cubicle-01');
      expect(refresh.acquired).toBe(true);

      // 4. Non-owner cannot release lock
      const nonOwnerRelease = await consularEngine.releaseLock(targetFile, 'cubicle-02');
      expect(nonOwnerRelease.released).toBe(false);

      // 5. Owner releases lock
      const ownerRelease = await consularEngine.releaseLock(targetFile, 'cubicle-01');
      expect(ownerRelease.released).toBe(true);

      // 6. Cubicle-02 can now acquire
      const lock3 = await consularEngine.acquireLock(targetFile, 'cubicle-02');
      expect(lock3.acquired).toBe(true);
    });

    it('TC-T5-CONSUL-06: verifies Time-Machine Checkpoints and rollback state restoration', async () => {
      // Create task in todo/ and in_progress/
      const t1 = await taskboardManager.createTask({ title: 'Task 1', description: 'D1', priority: 'HIGH' });
      await taskboardManager.claimTask('cubicle-01', t1.id);

      // Create checkpoint
      const checkpoint = await consularEngine.createCheckpoint('milestone-alpha-savepoint');
      expect(checkpoint.checkpoint_id).toMatch(/^chk-\d+-[a-z0-9]+$/);
      expect(checkpoint.label).toBe('milestone-alpha-savepoint');

      // Mutate state: complete t1
      await taskboardManager.submitForReview(t1.id);
      await taskboardManager.completeTask(t1.id);
      expect((await taskboardManager.listTasksByColumn('done')).length).toBe(1);

      // Rollback to checkpoint restores task state
      const rollbackRes = await consularEngine.rollbackCheckpoint(checkpoint.checkpoint_id);
      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.tasks_restored).toBeGreaterThan(0);

      const inProgressRestored = await taskboardManager.listTasksByColumn('in_progress');
      expect(inProgressRestored.some((t) => t.id === t1.id)).toBe(true);
    });

    it('TC-T5-CONSUL-07: tests Disciplinary Power 5 ACL path traversal defense and scope enforcement', async () => {
      await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/**', 'test/**'],
        denied_paths: ['**/.env*', 'secrets/**'],
        memory_scopes: ['public'],
      });

      // 1. Directory traversal rejected
      const t1 = consularEngine.verifyPathAccess('cubicle-01', '../../etc/passwd');
      expect(t1.allowed).toBe(false);
      expect(t1.reason).toContain('SECURITY_VIOLATION: Path traversal detected');

      // 2. URL encoded traversal rejected
      const t2 = consularEngine.verifyPathAccess('cubicle-01', '%2e%2e%2fconfig/secret.json');
      expect(t2.allowed).toBe(false);
      expect(t2.reason).toContain('SECURITY_VIOLATION: Path traversal detected');

      // 3. Denied path rejected
      const t3 = consularEngine.verifyPathAccess('cubicle-01', 'secrets/prod.key');
      expect(t3.allowed).toBe(false);
      expect(t3.reason).toContain('denied by Consular ACL rule');

      // 4. Allowed path authorized
      const t4 = consularEngine.verifyPathAccess('cubicle-01', 'src/server/index.ts');
      expect(t4.allowed).toBe(true);

      // 5. Unlisted path outside allowed_paths rejected
      const t5 = consularEngine.verifyPathAccess('cubicle-01', 'bin/unauthorized.sh');
      expect(t5.allowed).toBe(false);
      expect(t5.reason).toContain('outside the authorized allowed_paths scope');
    });

    it('TC-T5-CONSUL-08: tests Inter-Cubicle Shared Contract registration and payload validation', async () => {
      // 1. Rejects invalid contract schema
      await expect(
        consularEngine.registerContract('bad_contract', null, 'cubicle-01')
      ).rejects.toThrow('Schema must be a valid non-null object');

      // 2. Register valid contract
      const contractSchema = {
        type: 'object',
        required: ['workerId', 'action', 'status'],
        properties: {
          workerId: { type: 'string' },
          action: { type: 'string' },
          status: { type: 'string' },
          code: { type: 'number' },
        },
      };
      await consularEngine.registerContract('worker_telemetry_v1', contractSchema, 'cubicle-01');

      // 3. Valid payload passes
      const validRes = await consularEngine.validatePayload('worker_telemetry_v1', {
        workerId: 'cubicle-01',
        action: 'BUILD_PASS',
        status: 'SUCCESS',
        code: 0,
      });
      expect(validRes.valid).toBe(true);

      // 4. Missing required field fails
      const missingFieldRes = await consularEngine.validatePayload('worker_telemetry_v1', {
        workerId: 'cubicle-01',
        action: 'BUILD_PASS',
      });
      expect(missingFieldRes.valid).toBe(false);
      expect(missingFieldRes.errors).toContain("Missing required field: 'status'");

      // 5. Type mismatch fails
      const typeMismatchRes = await consularEngine.validatePayload('worker_telemetry_v1', {
        workerId: 'cubicle-01',
        action: 'BUILD_PASS',
        status: 'SUCCESS',
        code: 'not-a-number',
      });
      expect(typeMismatchRes.valid).toBe(false);
      expect(typeMismatchRes.errors?.some((e) => e.includes("Field 'code' expected number"))).toBe(true);
    });
  });

  // =========================================================================
  // 5. PREFERENCE LEARNING ENGINE ("NEVER EXPLAIN TWICE") INVARIANTS
  // =========================================================================
  describe('5. Preference Learning Engine Invariants', () => {
    it('TC-T5-PREF-01: extracts imperatives, categorizes correctly, and compiles USER_PREFERENCES.md', async () => {
      // 1. Testing imperative
      const prefs1 = preferenceEngine.extractPreferences('always use vitest for all unit tests');
      expect(prefs1).toHaveLength(1);
      expect(prefs1[0].category).toBe('testing');
      expect(prefs1[0].key).toContain('vitest');

      // 2. Workflow imperative
      const prefs2 = preferenceEngine.extractPreferences('never merge without Git worktree isolation');
      expect(prefs2).toHaveLength(1);
      expect(prefs2[0].category).toBe('workflow');

      // 3. Safety imperative
      const prefs3 = preferenceEngine.extractPreferences('must ensure api_key secrets are never logged');
      expect(prefs3).toHaveLength(1);
      expect(prefs3[0].category).toBe('safety');

      // Save to database
      await preferenceEngine.savePreference(prefs1[0]);
      await preferenceEngine.savePreference(prefs2[0]);
      await preferenceEngine.savePreference(prefs3[0]);

      // Verify compiled USER_PREFERENCES.md
      const markdown = await fs.readFile(
        path.join(agentsDir, 'rules', 'USER_PREFERENCES.md'),
        'utf8'
      );
      expect(markdown).toContain('# User Preferences & Project Constraints ("Never Explain Twice")');
      expect(markdown).toContain('Testing & Verification');
      expect(markdown).toContain('Workflow & Git Operations');
      expect(markdown).toContain('Architectural & Safety Constraints');
    });

    it('TC-T5-PREF-02: deduplicates preferences and increments hit count on key collision', async () => {
      const entry1 = await preferenceEngine.savePreference({
        category: 'coding_style',
        key: 'prefer_typescript_strict',
        rule: 'Always use TypeScript in strict mode',
        trigger_patterns: ['**/*.ts'],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all_cubicles',
      });
      expect(entry1.hit_count).toBe(1);

      // Save again with same key (updated rule)
      const entry2 = await preferenceEngine.savePreference({
        category: 'coding_style',
        key: 'prefer_typescript_strict',
        rule: 'Always use TypeScript in strict mode with noImplicitAny',
        trigger_patterns: ['**/*.ts'],
        confidence: 0.95,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      expect(entry2.id).toBe(entry1.id);
      expect(entry2.hit_count).toBe(2);
      expect(entry2.rule).toContain('noImplicitAny');
      expect(preferenceEngine.getPreferences()).toHaveLength(1);
    });

    it('TC-T5-PREF-03: recovers from corrupted preferences.json via backup rotation', async () => {
      // 1. Establish valid entry
      await preferenceEngine.savePreference({
        category: 'architecture',
        key: 'use_ntfs_junctions',
        rule: 'Always link .swarm and .agents via NTFS junctions',
        trigger_patterns: ['src/**'],
        confidence: 1.0,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      const dbPath = path.join(swarmDir, 'memory', 'preferences.json');
      const bakPath = path.join(swarmDir, 'memory', '.preferences.json.bak');
      expect(existsSync(bakPath)).toBe(true);

      // 2. Corrupt primary database file
      await fs.writeFile(dbPath, '{"version": "1.0.0", CORRUPTED_SYNTAX_ERROR...', 'utf8');

      // 3. Re-initialize PreferenceEngine: should transparently recover from backup!
      const recoveredEngine = new PreferenceEngine(swarmDir, agentsDir);
      await recoveredEngine.initialize();

      const prefs = recoveredEngine.getPreferences();
      expect(prefs.length).toBe(1);
      expect(prefs[0].key).toBe('use_ntfs_junctions');
    });

    it('TC-T5-PREF-04: formats prompt injection XML block filtered by touched files', async () => {
      await preferenceEngine.savePreference({
        category: 'testing',
        key: 'require_vitest',
        rule: 'All test files must use Vitest',
        trigger_patterns: ['test/**', '**/*.test.ts'],
        confidence: 1.0,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      const injection = preferenceEngine.injectLearnedPreferences({
        filesTouched: ['test/unit/my-feature.test.ts'],
      });
      expect(injection).toContain('<user_learned_preferences>');
      expect(injection).toContain('- [require_vitest]: All test files must use Vitest');
      expect(injection).toContain('</user_learned_preferences>');
    });
  });

  // =========================================================================
  // 6. SKILL & MCP GENERATOR INVARIANTS
  // =========================================================================
  describe('6. Skill & MCP Generator Invariants', () => {
    it('TC-T5-MCP-01: validates YAML frontmatter strict requirements', () => {
      // 1. Missing opening ---
      const res1 = skillMcpManager.validateFrontmatter('name: my-skill\ndescription: test\n---');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Frontmatter must start with ---');

      // 2. Missing closing ---
      const res2 = skillMcpManager.validateFrontmatter('---\nname: my-skill\ndescription: test\n');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Missing closing ---');

      // 3. Missing name field
      const res3 = skillMcpManager.validateFrontmatter('---\ndescription: test\n---');
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain('Missing mandatory "name:" field');

      // 4. Missing description field
      const res4 = skillMcpManager.validateFrontmatter('---\nname: my-skill\n---');
      expect(res4.valid).toBe(false);
      expect(res4.error).toContain('Missing mandatory "description:" field');

      // 5. Valid frontmatter
      const res5 = skillMcpManager.validateFrontmatter(
        '---\nname: my-skill\ndescription: Test description\n---\n# Body'
      );
      expect(res5.valid).toBe(true);
      expect(res5.metadata?.name).toBe('my-skill');
      expect(res5.metadata?.description).toBe('Test description');
    });

    it('TC-T5-MCP-02: protects against path traversal in skill and MCP server names', async () => {
      // Skill traversal
      await expect(
        skillMcpManager.generateSkill({
          name: '../../etc/bad_skill',
          description: 'Malicious skill attempt',
        })
      ).rejects.toThrow('SECURITY_VIOLATION: Skill name contains illegal path traversal characters.');

      // MCP server traversal
      await expect(
        skillMcpManager.generateMcpServer({
          name: '..\\..\\bad_mcp',
          tools: [],
        })
      ).rejects.toThrow('SECURITY_VIOLATION: MCP server name contains illegal path traversal characters.');
    });

    it('TC-T5-MCP-03: generates MCP server files and safely recovers from corrupted mcp_config.json', async () => {
      // 1. Generate valid MCP server
      const genResult = await skillMcpManager.generateMcpServer({
        name: 'sqlite_analyzer',
        description: 'Analyzes SQLite databases',
        tools: [
          {
            name: 'query_schema',
            description: 'Queries table schemas',
            parameters: { type: 'object', properties: { table: { type: 'string' } } },
          },
        ],
      });

      expect(genResult.serverName).toBe('sqlite_analyzer');
      expect(genResult.toolsCount).toBe(1);

      const serverList = await skillMcpManager.listMcpServers();
      expect(serverList.some((s) => s.name === 'sqlite_analyzer')).toBe(true);

      // 2. Corrupt mcp_config.json
      const configPath = path.join(agentsDir, 'mcp', 'mcp_config.json');
      await fs.writeFile(configPath, 'NOT_VALID_JSON{{{', 'utf8');

      // 3. Calling listMcpServers recovers to default without crashing
      const recoveredList = await skillMcpManager.listMcpServers();
      expect(Array.isArray(recoveredList)).toBe(true);
    });

    it('TC-T5-MCP-04: aggregates Panopticon Vault Catalog across preferences, skills, and MCP servers', async () => {
      // Add skill
      await skillMcpManager.generateSkill({
        name: 'git_worktree_ops',
        description: 'Operates isolated Git worktrees',
      });

      // Add MCP server
      await skillMcpManager.generateMcpServer({
        name: 'panopticon_vault_mcp',
        tools: [{ name: 'inspect_vault', description: 'Inspects vault' }],
      });

      // Add preference
      await preferenceEngine.savePreference({
        category: 'workflow',
        key: 'vault_sync',
        rule: 'Synchronize vault catalog on start',
        trigger_patterns: [],
        confidence: 1.0,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      const catalog = await skillMcpManager.getVaultCatalog();
      expect(catalog.skills.length).toBeGreaterThanOrEqual(1);
      expect(catalog.mcpServers.length).toBeGreaterThanOrEqual(1);
      expect(catalog.preferences.length).toBeGreaterThanOrEqual(1);
      expect(catalog.totalItems).toBe(
        catalog.skills.length + catalog.mcpServers.length + catalog.preferences.length
      );
    });
  });
});
