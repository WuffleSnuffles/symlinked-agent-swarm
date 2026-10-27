import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { ConsularVote } from '../../src/server/types/governance';

describe('Consular Governance & 5 Disciplinary Powers Unit Tests', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_consul');
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

  describe('1. Dual-Consul Initialization, Named Personas & Evolving Growth', () => {
    it('initializes default Roman Republic Dual-Consuls (Nia Nova & Ferric Lunaux) into .swarm/consuls.json', async () => {
      const consuls = consularEngine.getConsuls();
      expect(consuls).toHaveLength(2);

      const [consul1, consul2] = consuls;
      expect(consul1.title).toBe('Consul I');
      expect(consul1.name).toBe('Consul Nia Nova');
      expect(consul1.persona?.alias).toBe('Nia');
      expect(consul1.model).toBe('gemini-4-argon');
      expect(consul1.thinking_level).toBe('High');
      expect(consul1.thinking_budget_tokens).toBe(16000);

      expect(consul2.title).toBe('Consul II');
      expect(consul2.name).toBe('Consul Ferric Lunaux');
      expect(consul2.persona?.alias).toBe('Ferric');
      expect(consul2.model).toBe('gpt-astra');
      expect(consul2.thinking_level).toBe('Ultra');
      expect(consul2.thinking_budget_tokens).toBe(64000);

      const savedJson = await fs.readFile(path.join(sandbox.swarmDir, 'consuls.json'), 'utf8');
      expect(savedJson).toContain('Consul Nia Nova');
      expect(savedJson).toContain('Consul Ferric Lunaux');
    });

    it('tracks evolving growth states for Nia Nova and Ferric Lunaux', async () => {
      const niaGrowth = await consularEngine.evolveNia('Build intuitive UI', 2);
      expect(niaGrowth.total_artistic_rules_championed).toBe(2);
      expect(niaGrowth.advocated_goals).toContain('Build intuitive UI');

      const ferricGrowth = await consularEngine.evolveFerric('cubicle-01', true, false);
      expect(ferricGrowth.cubicle_performance['cubicle-01'].tasks_completed).toBe(1);

      const niaRaw = await fs.readFile(path.join(sandbox.swarmDir, 'memory', 'nia_growth.json'), 'utf8');
      expect(JSON.parse(niaRaw).total_artistic_rules_championed).toBe(2);

      const ferricRaw = await fs.readFile(path.join(sandbox.swarmDir, 'memory', 'ferric_growth.json'), 'utf8');
      expect(JSON.parse(ferricRaw).cubicle_performance['cubicle-01'].tasks_completed).toBe(1);
    });

    it('updates Consul configuration and persists changes', async () => {
      const updated = await consularEngine.updateConsul('consul-1', {
        thinking_budget_tokens: 32000,
        name: 'Consul Nia Nova (High Reason)',
      });
      expect(updated.thinking_budget_tokens).toBe(32000);

      const savedJson = await fs.readFile(path.join(sandbox.swarmDir, 'consuls.json'), 'utf8');
      expect(savedJson).toContain('Consul Nia Nova (High Reason)');
    });
  });

  describe('1B. Visible Inter-Consul Dialogue', () => {
    it('records dialogue between Nia and Ferric and broadcasts event', async () => {
      let dialogueFired = false;
      consularEngine.onEvent((type) => {
        if (type === 'CONSULAR_DIALOGUE') dialogueFired = true;
      });

      const msg1 = await consularEngine.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        'We must give workers full creative freedom.',
        'PLANNING_GATE'
      );
      expect(msg1.content).toContain('creative freedom');
      expect(dialogueFired).toBe(true);

      const msg2 = await consularEngine.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        'Freedom is good, but invariant tests are mandatory.',
        'PLANNING_GATE'
      );
      expect(msg2.content).toContain('tests are mandatory');

      const history = consularEngine.getDialogue();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('1C. Two-Gate 2/2 Unanimous Consensus (Gate 1: Pre-Dispatch Plan Agreement)', () => {
    it('deliberates plan and blocks dispatch if either Consul vetoes the method of approach (Gate 1 Veto)', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Refactor monolithic auth',
        ['Decompose auth module', 'Write JWT tests'],
        [{ cubicleId: 'cubicle-01', subtask: 'Decompose auth' }]
      );
      expect(plan.status).toBe('PENDING_PLAN_VOTE');
      expect(plan.dialogue).toHaveLength(2);

      // Ferric vetoes due to missing boundary checks
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Clean approach giving agents autonomy.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'GATE 1 VETO: Missing test split across subtasks, will lead to unverified commits.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(false);
      expect(result.action).toBe('PLAN_VETO_REVISED');

      const updatedPlan = consularEngine.getPlanGate(plan.plan_id);
      expect(updatedPlan?.status).toBe('PLAN_VETO_REVISED');
    });

    it('authorizes task dispatch when both Consuls agree on the plan (Gate 1 2/2 Unanimous Approval)', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Add distributed cache',
        ['Create Redis adapter', 'Add fallback memory cache'],
        [
          { cubicleId: 'cubicle-01', subtask: 'Redis adapter' },
          { cubicleId: 'cubicle-02', subtask: 'Memory cache' },
        ]
      );

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Plan aligns with user performance requirements.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Architecture verified, fallbacks defined.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(true);
      expect(result.action).toBe('DISPATCH_AUTHORIZED');

      const updatedPlan = consularEngine.getPlanGate(plan.plan_id);
      expect(updatedPlan?.status).toBe('DISPATCH_AUTHORIZED');

      // Verify tasks were dispatched to taskboard todo
      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo.length).toBeGreaterThanOrEqual(2);
      expect(allTasks.todo.some((t) => t.title.includes('Redis adapter'))).toBe(true);
    });
  });

  describe('2. Consensus, Intercessio Veto & Voting Invariants', () => {
    it('authorizes merge when both Consuls vote APPROVE (2/2 unanimous)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Clean architecture and type safety verified.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Zero performance regressions detected.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-100');
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');
      expect(result.dissenting_consuls).toBeUndefined();
    });

    it('normalizes Roman numerals correctly without confusing Consul II with Consul I', () => {
      expect(consularEngine.normalizeConsulTitle('Consul I')).toBe('consul-1');
      expect(consularEngine.normalizeConsulTitle('Consul II')).toBe('consul-2');
      expect(consularEngine.normalizeConsulTitle('Consul 1')).toBe('consul-1');
      expect(consularEngine.normalizeConsulTitle('Consul 2')).toBe('consul-2');
      expect(consularEngine.normalizeConsulTitle('Consul Nia Nova')).toBe('consul-1');
      expect(consularEngine.normalizeConsulTitle('Consul Ferric Lunaux')).toBe('consul-2');
      expect(consularEngine.normalizeConsulTitle('Random Consul')).toBe('unknown');

      // Verify that 2/2 consensus between canonical 'Consul I' and 'Consul II' succeeds
      const res = consularEngine.evaluateConsensus(
        { consul: 'Consul I', decision: 'APPROVE', rationale: 'All good', timestamp: '' },
        { consul: 'Consul II', decision: 'APPROVE', rationale: 'All good', timestamp: '' }
      );
      expect(res.unanimous_approved).toBe(true);
      expect(res.action_taken).toBe('MERGED_TO_MAIN');
    });

    it('blocks merge and triggers Intercessio when either Consul votes VETO (1/2)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Looks fine.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'INTERCESSIO VETO: Unchecked buffer length causes overflow.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-101');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.dissenting_consuls).toEqual(['Consul II']);
      expect(result.dissenting_rationales?.[0]).toContain('Unchecked buffer length');
    });

    it('strictly requires rationale for VETO vote', () => {
      const emptyVeto: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: '   ',
        timestamp: new Date().toISOString(),
      };
      expect(() => consularEngine.validateVote(emptyVeto)).toThrowError(
        /INVALID_VETO: Consular Veto requires an explicit rationale/
      );
    });

    it('blocks unauthorized voting entities outside Consul I and Consul II', () => {
      const rogueVote = {
        consul: 'cubicle-01' as any,
        decision: 'APPROVE' as const,
        rationale: 'Self approval',
        timestamp: new Date().toISOString(),
      };
      expect(() => consularEngine.validateVote(rogueVote)).toThrowError(
        /UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes/
      );
    });

    it('rejects consensus when both votes originate from the same Consul (single-consul self-voting)', () => {
      const voteA: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Self-approval A',
        timestamp: new Date().toISOString(),
      };
      const voteB: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Self-approval B',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(voteA, voteB, 'task-self-vote');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('supports idempotent re-voting on pending task before review resolution', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: 'Initial doubt',
        timestamp: new Date().toISOString(),
      };
      consularEngine.registerPendingVote('task-200', vote1);

      const revisedVote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Clarification received, approving.',
        timestamp: new Date().toISOString(),
      };
      const votesMap = consularEngine.registerPendingVote('task-200', revisedVote1);
      expect(votesMap.get('Consul I')?.decision).toBe('APPROVE');
      expect(votesMap.get('Consul I')?.rationale).toBe('Clarification received, approving.');
    });
  });

  describe('3. Consular Review with Taskboard Lifecycle', () => {
    it('approves task in review, moves to done/, and updates cubicle to idle', async () => {
      const task = await taskboardManager.createTask({
        title: 'Build fast hashmap',
        description: 'Test',
        priority: 'HIGH',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);
      await taskboardManager.submitForReview(task.id, { git_branch: 'swarm/cubicle-01' });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Performance verified',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Contracts satisfied',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.reviewTask(task.id, votes);
      expect(result.unanimous_approved).toBe(true);

      const doneTasks = await taskboardManager.listTasksByColumn('done');
      expect(doneTasks.find((t) => t.id === task.id)).toBeDefined();

      const cubicle = cubicleManager.getCubicle('cubicle-01');
      expect(cubicle.status).toBe('idle');
      expect(cubicle.surface_thoughts).toContain('approved by Consul I & II');
    });

    it('vetoes task in review, rolls back to in_progress/, logs incident, and updates cubicle to working', async () => {
      const task = await taskboardManager.createTask({
        title: 'Add auth middleware',
        description: 'Test',
        priority: 'HIGH',
      });
      await taskboardManager.claimTask('cubicle-02', task.id);
      await taskboardManager.submitForReview(task.id, { git_branch: 'swarm/cubicle-02' });

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Format matches',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: Missing JWT expiration validation',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.reviewTask(task.id, votes);
      expect(result.unanimous_approved).toBe(false);

      const inProgressTasks = await taskboardManager.listTasksByColumn('in_progress');
      const rolledBack = inProgressTasks.find((t) => t.id === task.id);
      expect(rolledBack).toBeDefined();
      expect(rolledBack?.veto_history[0].rationale).toContain('Missing JWT expiration');

      const cubicle = cubicleManager.getCubicle('cubicle-02');
      expect(cubicle.status).toBe('working');
      expect(cubicle.surface_thoughts).toContain('[VETO from Consul II]');

      const incidents = await fs.readFile(path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
      expect(incidents).toContain('CONSULAR_VETO');
      expect(incidents).toContain('Missing JWT expiration validation');
    });
  });

  describe('4. Disciplinary Power 1: killAgent', () => {
    it('terminates errant agent, releases task to todo/, and evicts slot', async () => {
      const task = await taskboardManager.createTask({
        title: 'Infinite loop task',
        description: 'Task that stalls',
        priority: 'CRITICAL',
      });
      await taskboardManager.claimTask('cubicle-01', task.id);

      const cubicle = cubicleManager.getCubicle('cubicle-01');
      cubicle.current_task_id = task.id;
      cubicle.process_pid = 999999; // Mock pid

      await consularEngine.killAgent('cubicle-01', 'Worker stalled and unresponsive in infinite loop');

      expect(cubicle.config.enabled).toBe(false);
      expect(cubicle.status).toBe('vacant');
      expect(cubicle.surface_thoughts).toContain('Terminated and evicted by Consular Decree');

      // Task must be released to todo/
      const todoTasks = await taskboardManager.listTasksByColumn('todo');
      expect(todoTasks.find((t) => t.id === task.id)).toBeDefined();
    });

    it('terminates errant agent and immediately hot-swaps with new configuration', async () => {
      await consularEngine.killAgent('cubicle-02', 'Hallucination loop', {
        brand: 'Claude / Anthropic',
        model: 'claude-3-5-sonnet',
        display_name: 'Claude 3.5 Sonnet (Replacement)',
        thinking_level: 'High',
      });

      const cubicle = cubicleManager.getCubicle('cubicle-02');
      expect(cubicle.config.enabled).toBe(true);
      expect(cubicle.config.model).toBe('claude-3-5-sonnet');
      expect(cubicle.status).toBe('idle');
      expect(cubicle.surface_thoughts).toContain('New worker commissioned');
    });
  });

  describe('5. Disciplinary Power 2: setThinkingLevel & Capability Gating Coupling', () => {
    it('demoting Gemini 4 Argon from High to Low dynamically disables sub-swarm spawning', async () => {
      const c1 = cubicleManager.getCubicle('cubicle-01');
      expect(c1.config.can_spawn_subswarm).toBe(true);

      const result = await consularEngine.setThinkingLevel('cubicle-01', 'Low');
      expect(result.can_spawn_subswarm).toBe(false);
      expect(result.thinking_budget_tokens).toBe(2000);
      expect(c1.config.can_spawn_subswarm).toBe(false);
      expect(c1.config.thinking_level).toBe('Low');
    });

    it('promoting GPT Astra from Very High to Ultra dynamically enables sub-swarm spawning', async () => {
      const c3 = cubicleManager.getCubicle('cubicle-03');
      expect(c3.config.can_spawn_subswarm).toBe(false);

      const result = await consularEngine.setThinkingLevel('cubicle-03', 'Ultra');
      expect(result.can_spawn_subswarm).toBe(true);
      expect(result.thinking_budget_tokens).toBe(64000);
      expect(c3.config.can_spawn_subswarm).toBe(true);
      expect(c3.config.thinking_level).toBe('Ultra');
    });
  });

  describe('6. Disciplinary Power 3: swapRole & swapCubicles', () => {
    it('swapRole changes persona and injects role instructions', async () => {
      await consularEngine.swapRole('cubicle-01', 'Debugger');
      const cubicle = cubicleManager.getCubicle('cubicle-01');
      expect(cubicle.config.role).toBe('Debugger');
      expect(cubicle.role).toBe('Debugger');
      expect(cubicle.surface_thoughts).toContain('Role reassigned to Debugger');
    });

    it('swapCubicles atomically swaps configurations between two cubicles', async () => {
      const c1ModelBefore = cubicleManager.getCubicle('cubicle-01').config.model;
      const c3ModelBefore = cubicleManager.getCubicle('cubicle-03').config.model;

      await consularEngine.swapCubicles('cubicle-01', 'cubicle-03');

      const c1ModelAfter = cubicleManager.getCubicle('cubicle-01').config.model;
      const c3ModelAfter = cubicleManager.getCubicle('cubicle-03').config.model;

      expect(c1ModelAfter).toBe(c3ModelBefore);
      expect(c3ModelAfter).toBe(c1ModelBefore);
    });
  });

  describe('7. Disciplinary Power 4: wipeMemory', () => {
    it('resets surface thoughts, clears error state, preserving token quota when requested', async () => {
      const cubicle = cubicleManager.getCubicle('cubicle-01');
      cubicle.status = 'error';
      cubicle.error_details = { message: 'Context window poisoned', incident_id: null, timestamp: '' };
      cubicle.config.quota.tokens_used = 45000;

      await consularEngine.wipeMemory('cubicle-01', true);

      expect(cubicle.status).toBe('idle');
      expect(cubicle.error_details).toBeNull();
      expect(cubicle.surface_thoughts).toContain('Memory wiped clean');
      expect(cubicle.config.quota.tokens_used).toBe(45000); // Preserved
    });

    it('zeros token usage and resets stamina when preserveRoster is false', async () => {
      const cubicle = cubicleManager.getCubicle('cubicle-01');
      cubicle.config.quota.tokens_used = 45000;

      await consularEngine.wipeMemory('cubicle-01', false);

      expect(cubicle.config.quota.tokens_used).toBe(0);
      expect(cubicle.stamina_percentage).toBe(100);
      expect(cubicle.fatigue_percentage).toBe(0);
    });
  });

  describe('8. Disciplinary Power 5: setAccessScope & ACL Enforcement', () => {
    it('persists ACL and intercepts unauthorized path access', async () => {
      const scope = await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: ['src/server/**', '.env*', 'secrets/**'],
        memory_scopes: ['preferences'],
      });

      expect(scope.cubicle_id).toBe('cubicle-01');

      // 1. Path in denied scope must be blocked
      const deniedCheck = consularEngine.verifyPathAccess('cubicle-01', 'src/server/index.ts', scope);
      expect(deniedCheck.allowed).toBe(false);
      expect(deniedCheck.reason).toContain('SECURITY_VIOLATION');

      // 2. Secret file must be blocked
      const secretCheck = consularEngine.verifyPathAccess('cubicle-01', '.env.production', scope);
      expect(secretCheck.allowed).toBe(false);

      // 3. Path outside allowed scope must be blocked
      const outsideCheck = consularEngine.verifyPathAccess('cubicle-01', 'scripts/deploy.sh', scope);
      expect(outsideCheck.allowed).toBe(false);

      // 4. Authorized path must be allowed
      const allowedCheck = consularEngine.verifyPathAccess('cubicle-01', 'src/client/app.ts', scope);
      expect(allowedCheck.allowed).toBe(true);

      // 5. Path traversal attempt must be blocked
      const traversalCheck = consularEngine.verifyPathAccess('cubicle-01', 'src/client/../../src/server/index.ts', scope);
      expect(traversalCheck.allowed).toBe(false);
      expect(traversalCheck.reason).toContain('SECURITY_VIOLATION');

      // 6. Substring inclusion attack must be blocked (e.g. unauthorized path containing 'src/client')
      const substringBypass = consularEngine.verifyPathAccess('cubicle-01', 'unauthorized/src/client/secret.txt', scope);
      expect(substringBypass.allowed).toBe(false);
      expect(substringBypass.reason).toContain('outside the authorized allowed_paths scope');

      // 7. Directory boundary prefix check (src/client_suffix must NOT match src/client)
      const prefixBypass = consularEngine.verifyPathAccess('cubicle-01', 'src/client_archive/foo.ts', scope);
      expect(prefixBypass.allowed).toBe(false);

      // 8. URL-encoded traversal attempt must be blocked
      const urlEncodedCheck = consularEngine.verifyPathAccess('cubicle-01', 'src/client/%2e%2e/%2e%2e/etc/passwd', scope);
      expect(urlEncodedCheck.allowed).toBe(false);
      expect(urlEncodedCheck.reason).toContain('SECURITY_VIOLATION');
    });
  });

  describe('9. Interactive Consular Question & Answer Engine', () => {
    it('creates a question, answers it, and updates Nia growth memory profile', async () => {
      vi.spyOn(consularEngine as any, 'resumeQuestion').mockResolvedValue(undefined);
      let askedEvent = false;
      let answeredEvent = false;
      consularEngine.onEvent((type) => {
        if (type === 'CONSULAR_QUESTION_ASKED') askedEvent = true;
        if (type === 'CONSULAR_QUESTION_ANSWERED') answeredEvent = true;
      });

      const question = await consularEngine.createQuestion({
        asking_consul: 'Nia',
        prompt: 'Which CSS design style should we prioritize?',
        options: [
          { id: 'opt-1', label: 'Brutalist Cyberpunk', is_recommended: true },
          { id: 'opt-2', label: 'Minimalist Monochrome' },
        ],
        is_multi_select: false,
        allow_custom_write_in: true,
      });

      expect(question.question_id).toBeDefined();
      expect(question.status).toBe('PENDING');
      expect(askedEvent).toBe(true);

      const answered = await consularEngine.answerQuestion(question.question_id, {
        selected_option_ids: ['opt-1'],
        custom_write_in: 'High contrast crimson neon accents',
      });

      expect(answered.status).toBe('ANSWERED');
      expect(answered.user_response?.selected_option_ids).toContain('opt-1');
      expect(answered.user_response?.custom_write_in).toContain('High contrast');
      expect(answeredEvent).toBe(true);

      // Verify Nia growth state updated
      const niaGrowth = consularEngine.getNiaGrowth();
      expect(niaGrowth.total_artistic_rules_championed).toBeGreaterThan(0);
      expect(niaGrowth.advocated_goals.some((g) => g.includes('Brutalist Cyberpunk') || g.includes('opt-1'))).toBe(true);
    });
  });

  describe('10. Merge-Conflict Shield (.swarm/locks/)', () => {
    it('acquires and releases file locks preventing concurrent conflicting writes', async () => {
      const lock1 = await consularEngine.acquireLock('src/server/routes.ts', 'cubicle-01');
      expect(lock1.acquired).toBe(true);

      // Concurrent request from cubicle-02 must be rejected
      const lock2 = await consularEngine.acquireLock('src/server/routes.ts', 'cubicle-02');
      expect(lock2.acquired).toBe(false);
      expect(lock2.currentOwner).toBe('cubicle-01');

      // List locks
      const locks = await consularEngine.listLocks();
      expect(locks.some((l) => l.filePath === 'src/server/routes.ts')).toBe(true);

      // Release lock
      const released = await consularEngine.releaseLock('src/server/routes.ts', 'cubicle-01');
      expect(released.released).toBe(true);

      // Now cubicle-02 can acquire
      const lock3 = await consularEngine.acquireLock('src/server/routes.ts', 'cubicle-02');
      expect(lock3.acquired).toBe(true);
    });

    it('recovers from stale locks (TTL) and corrupt lock files', async () => {
      // 1. Stale lock expiration test: write a lock file with timestamp 10 minutes in the past
      const lockFileName = (consularEngine as any).getLockFileName('src/server/stale.ts');
      const lockFilePath = path.join(sandbox.swarmDir, 'locks', lockFileName);
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await fs.writeFile(
        lockFilePath,
        JSON.stringify({ filePath: 'src/server/stale.ts', cubicleId: 'cubicle-dead', acquiredAt: staleTime }),
        'utf8'
      );

      // Active cubicle should be able to acquire because lock is stale
      const staleAcquire = await consularEngine.acquireLock('src/server/stale.ts', 'cubicle-01');
      expect(staleAcquire.acquired).toBe(true);

      // 2. Corrupt lock recovery: write invalid JSON to lock file
      const corruptFileName = (consularEngine as any).getLockFileName('src/server/corrupt.ts');
      const corruptFilePath = path.join(sandbox.swarmDir, 'locks', corruptFileName);
      await fs.writeFile(corruptFilePath, 'THIS_IS_CORRUPT_NOT_JSON{{{', 'utf8');

      // Acquire must safely recover and overwrite corrupt file
      const corruptAcquire = await consularEngine.acquireLock('src/server/corrupt.ts', 'cubicle-02');
      expect(corruptAcquire.acquired).toBe(true);

      // 3. Same cubicle renewal
      const renew = await consularEngine.acquireLock('src/server/corrupt.ts', 'cubicle-02');
      expect(renew.acquired).toBe(true);
    });
  });

  describe('11. Gladiator Tournament Mode', () => {
    it('evaluates dual-consul tournament and picks victor branch with distinct critiques', async () => {
      const contest = await consularEngine.evaluateGladiatorContest('task-perf-01', [
        { branch: 'swarm/cubicle-01', cubicleId: 'cubicle-01', diffSummary: '+100 lines zero-copy' },
        { branch: 'swarm/cubicle-02', cubicleId: 'cubicle-02', diffSummary: '+200 lines buffered' },
      ]);

      expect(contest.winnerBranch).toBe('swarm/cubicle-01');
      expect(contest.winnerCubicle).toBe('cubicle-01');
      expect(contest.niaCritique).toContain('Nia on Tournament');
      expect(contest.ferricCritique).toContain('Ferric on Tournament');
      expect(contest.consensusRatified).toBe(true);
    });
  });

  describe('12. Infinite-Loop Circuit Breaker & Failover', () => {
    it('trips circuit breaker after >= 3 consecutive errors and fails over task', async () => {
      const r1 = cubicleManager.recordError('cubicle-03', 'Error 1');
      expect(r1.trippedCircuitBreaker).toBe(false);

      const r2 = cubicleManager.recordError('cubicle-03', 'Error 2');
      expect(r2.trippedCircuitBreaker).toBe(false);

      const r3 = cubicleManager.recordError('cubicle-03', 'Error 3');
      expect(r3.trippedCircuitBreaker).toBe(true);
      expect(cubicleManager.getCubicle('cubicle-03').status).toBe('error');

      // Failover task to cubicle-01
      cubicleManager.getCubicle('cubicle-03').current_task_id = 'task-stalled-99';
      const failover = await consularEngine.failoverTask('cubicle-03', 'cubicle-01', 'Circuit breaker trip');
      expect(failover.success).toBe(true);
      expect(failover.task_id).toBe('task-stalled-99');
      expect(cubicleManager.getCubicle('cubicle-01').current_task_id).toBe('task-stalled-99');
      expect(cubicleManager.getCubicle('cubicle-01').status).toBe('working');
    });

    it('persists tripped circuit breaker status to disk in .swarm/status/cubicle-XX.json', async () => {
      cubicleManager.resetErrorCount('cubicle-03');
      cubicleManager.recordError('cubicle-03', 'Error 1');
      cubicleManager.recordError('cubicle-03', 'Error 2');
      cubicleManager.recordError('cubicle-03', 'Error 3');

      // Allow file persistence to flush
      await new Promise((r) => setTimeout(r, 50));

      const statusFile = path.join(sandbox.swarmDir, 'status', 'cubicle-03.json');
      const raw = await fs.readFile(statusFile, 'utf8');
      const statusData = JSON.parse(raw);

      expect(statusData.status).toBe('error');
      expect(statusData.surface_thoughts).toContain('Circuit breaker tripped');
      expect(statusData.error_details.message).toBe('Error 3');
    });
  });

  describe('13. Git Time-Machine Checkpoints (.swarm/checkpoints/)', () => {
    it('creates, lists, and rolls back to checkpoint', async () => {
      const chk = await consularEngine.createCheckpoint('Pre-migration checkpoint');
      expect(chk.checkpoint_id).toBeDefined();

      const list = await consularEngine.listCheckpoints();
      expect(list.some((c) => c.checkpoint_id === chk.checkpoint_id)).toBe(true);

      const rollback = await consularEngine.rollbackCheckpoint(chk.checkpoint_id);
      expect(rollback.success).toBe(true);
      expect(rollback.rolled_back_to).toBe(chk.checkpoint_id);
    });

    it('captures git commit hash and task states snapshot, and restores tasks on rollback', async () => {
      // Create tasks in todo
      const t1 = await taskboardManager.createTask({
        id: 'chk-task-1',
        title: 'Task before checkpoint',
        description: 'Testing checkpoints',
        priority: 'MEDIUM',
      });

      const chk = await consularEngine.createCheckpoint('Snapshot with active tasks');
      expect(chk.checkpoint_id).toBeDefined();
      expect(chk.git_commit).toBeDefined();
      expect(chk.tasks).toBeDefined();
      expect(chk.tasks.todo.some((t: any) => t.id === 'chk-task-1')).toBe(true);

      // Now create another task after checkpoint
      await taskboardManager.createTask({
        id: 'chk-task-2-post',
        title: 'Task after checkpoint',
        description: 'Should disappear after rollback',
        priority: 'LOW',
      });
      const tasksBeforeRollback = await taskboardManager.listAllTasks();
      expect(tasksBeforeRollback.todo.some((t: any) => t.id === 'chk-task-2-post')).toBe(true);

      // Rollback to checkpoint
      const rollback = await consularEngine.rollbackCheckpoint(chk.checkpoint_id);
      expect(rollback.success).toBe(true);
      expect(rollback.tasks_restored).toBeGreaterThanOrEqual(1);

      // Verify taskboard state was restored to snapshot
      const tasksAfterRollback = await taskboardManager.listAllTasks();
      expect(tasksAfterRollback.todo.some((t: any) => t.id === 'chk-task-1')).toBe(true);
      expect(tasksAfterRollback.todo.some((t: any) => t.id === 'chk-task-2-post')).toBe(false);
    });
  });

  describe('14. Inter-Cubicle Shared Contracts (.swarm/contracts/)', () => {
    it('registers, retrieves, and lists shared schema contracts', async () => {
      const reg = await consularEngine.registerContract(
        'user_auth_schema',
        { type: 'object', properties: { username: { type: 'string' } } },
        'cubicle-01'
      );
      expect(reg.name).toBe('user_auth_schema');

      const retrieved = await consularEngine.getContract('user_auth_schema');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.providerCubicle).toBe('cubicle-01');

      const all = await consularEngine.listContracts();
      expect(all.some((c) => c.name === 'user_auth_schema')).toBe(true);
    });

    it('validates contract schemas and validates payloads against registered schema', async () => {
      // 1. Schema without type/properties/$schema must be rejected
      await expect(
        consularEngine.registerContract('bad_contract', { foo: 'bar' } as any, 'cubicle-01')
      ).rejects.toThrow(/Invalid schema/);

      // 2. Schema that is not an object must be rejected
      await expect(
        consularEngine.registerContract('bad_contract_2', 'string_schema' as any, 'cubicle-01')
      ).rejects.toThrow(/Invalid schema/);

      // 3. Valid schema registration
      await consularEngine.registerContract(
        'payment_event',
        {
          type: 'object',
          required: ['orderId', 'amount'],
          properties: {
            orderId: { type: 'string' },
            amount: { type: 'number' },
          },
        },
        'cubicle-02'
      );

      // 4. Valid payload validation
      const validRes = await consularEngine.validatePayload('payment_event', {
        orderId: 'ord-123',
        amount: 49.99,
      });
      expect(validRes.valid).toBe(true);
      expect(validRes.errors).toBeUndefined();

      // 5. Invalid payload validation (missing required field, wrong type)
      const invalidRes = await consularEngine.validatePayload('payment_event', {
        orderId: 12345, // wrong type
        // missing amount
      });
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.errors?.length).toBeGreaterThanOrEqual(2);
      expect(invalidRes.errors?.some((e) => e.includes('amount'))).toBe(true);
      expect(invalidRes.errors?.some((e) => e.includes('orderId'))).toBe(true);
    });
  });

  describe('15. Night-Shift / AFK Mode & Briefing Digest', () => {
    it('sets AFK mode and generates comprehensive morning briefing digest', async () => {
      const afk = consularEngine.setAfkMode(true, 75000);
      expect(afk.afk_mode).toBe(true);
      expect(afk.token_cap).toBe(75000);

      const digest = await consularEngine.generateBriefingDigest();
      expect(digest.summary).toContain('AFK NIGHT-SHIFT DIGEST');
      expect(digest.generated_at).toBeDefined();
    });
  });
});

