/**
 * test/unit/adversarial-empirical-m2-3.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (Milestone 2 Iteration 3)
 * Author: Challenger M2-3 (teamwork_preview_challenger)
 *
 * Empirical Challenge Focus:
 * 1. Distinct Voter Enforcement (evaluateConsensus):
 *    - Rejection of identical voters ('Consul I' + 'Consul I', 'Consul II' + 'Consul II').
 *    - Rejection of alias pairs ('Consul I' + 'Consul Nia Nova', 'Consul II' + 'Consul Ferric Lunaux', 'Consul I' + 'Nia').
 *    - Rejection of empty/malformed votes (missing consul, empty string, whitespace VETO rationale).
 * 2. Gate 1 Taskboard Dispatch:
 *    - Genuine task creation in `.swarm/tasks/todo/` upon 2/2 unanimous approval.
 *    - Strict task suppression in `.swarm/tasks/todo/` upon 1/2 or 0/2 veto.
 * 3. Courier Gateway Execution Loop:
 *    - Petition type 'WISDOM': provides wisdom guidance, no taskboard tasks queued, sealed deliverable in outbox.
 *    - Petition type 'POWER': queues taskboard task, no wisdom guidance, sealed deliverable in outbox.
 *    - Petition type 'BOTH': provides wisdom guidance, queues taskboard task, sealed deliverable in outbox.
 *    - 1/2 Consular Veto: transitions to VETOED, withholds seal, suppresses outbox deliverable creation, records taskboard veto.
 * 4. Path Traversal Defenses in verifyPathAccess:
 *    - Rejection of relative segments ('../', '..\\', '..', nested traversals).
 *    - Strict enforcement of denied_paths and allowed_paths ACL boundaries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { CourierGateway } from '../../src/server/courier-gateway';
import { ConsularVote } from '../../src/server/types/governance';

describe('Challenger M2-3: Empirical Adversarial Challenge Suite', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;
  let courierGateway: CourierGateway;

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m2_3');

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

    courierGateway = new CourierGateway(
      sandbox.swarmDir,
      consularEngine,
      taskboardManager,
      sandbox.agentsDir
    );
    await courierGateway.initialize();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // 1. DISTINCT VOTER ENFORCEMENT
  // =========================================================================
  describe('1. Distinct Voter Enforcement (evaluateConsensus)', () => {
    it('rejects consensus when identical voters cast both votes (Consul I + Consul I)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Legitimate check 1',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Duplicate check 2',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-identical-voters-1');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('rejects consensus when identical voters cast both votes (Consul II + Consul II)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Ferric evaluation 1',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Ferric evaluation 2',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-identical-voters-2');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('rejects alias pairs representing the same Consul (Consul I + Consul Nia Nova)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Official Title Vote',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Persona Full Name Vote',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-alias-pair-1');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('rejects alias pairs representing the same Consul (Consul II + Consul Ferric Lunaux)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Official Title Vote',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Persona Full Name Vote',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-alias-pair-2');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('rejects or blocks alias pair using informal short callsign (Consul I + Nia)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Vote 1',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Nia' as any,
        decision: 'APPROVE',
        rationale: 'Vote 2 from callsign',
        timestamp: new Date().toISOString(),
      };

      // Depending on whether 'Nia' passes validateVote or is caught early:
      // It must either throw UNAUTHORIZED or return unanimous_approved: false
      let consensusApproved = false;
      try {
        const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-alias-nia');
        consensusApproved = result.unanimous_approved;
      } catch (err: any) {
        expect(err.message).toContain('UNAUTHORIZED');
        consensusApproved = false;
      }
      expect(consensusApproved).toBe(false);
    });

    it('rejects empty votes or votes with missing / unauthorized consul identities', () => {
      const emptyConsulVote = {
        consul: '' as any,
        decision: 'APPROVE' as const,
        rationale: 'Empty voter identity',
        timestamp: new Date().toISOString(),
      };
      expect(() => consularEngine.validateVote(emptyConsulVote)).toThrowError(/UNAUTHORIZED/);
    });

    it('rejects VETO votes with empty or whitespace-only rationale', () => {
      const emptyRationaleVote: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: '   \n\t  ',
        timestamp: new Date().toISOString(),
      };
      expect(() => consularEngine.validateVote(emptyRationaleVote)).toThrowError(/INVALID_VETO/);
    });

    it('authorizes consensus ONLY when two legitimately distinct Consuls vote APPROVE', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Consul I verifies UI and UX standards',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Consul II verifies zero resource leaks and test coverage',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-valid-2-2');
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');
      expect(result.reason).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. GATE 1 TASKBOARD DISPATCH INVARIANTS
  // =========================================================================
  describe('2. Gate 1 Taskboard Dispatch Invariants', () => {
    it('genuinely populates .swarm/tasks/todo/ when 2/2 Consuls approve Gate 1 plan', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Implement resilient WebSocket heartbeats',
        ['Task 1: Server ping loop', 'Task 2: Client pong handler', 'Task 3: Reconnect exponential backoff'],
        [
          { cubicleId: 'cubicle-01', subtask: 'Server ping loop' },
          { cubicleId: 'cubicle-02', subtask: 'Client pong handler' },
          { cubicleId: 'cubicle-03', subtask: 'Reconnect exponential backoff' },
        ]
      );

      expect(plan.status).toBe('PENDING_PLAN_VOTE');

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Approach gives cubicles autonomy and clean division.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Modular tasks allow zero-regression unit testing.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, votes);
      expect(result.approved).toBe(true);
      expect(result.action).toBe('DISPATCH_AUTHORIZED');

      // Verify taskboardManager lists 3 tasks in todo
      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo).toHaveLength(3);

      // Verify physical JSON task files genuinely exist on disk in .swarm/tasks/todo/
      const todoFiles = await fs.readdir(path.join(sandbox.swarmDir, 'tasks', 'todo'));
      const jsonFiles = todoFiles.filter((f) => f.endsWith('.json'));
      expect(jsonFiles).toHaveLength(3);

      for (const split of plan.task_splits) {
        const found = allTasks.todo.some((t) => t.title.includes(split.subtask));
        expect(found).toBe(true);
      }
    });

    it('strictly suppresses task creation in .swarm/tasks/todo/ when Gate 1 is vetoed', async () => {
      const plan = await consularEngine.deliberatePlan(
        'Unsafe memory bypass',
        ['Subtask: disable bounds checking'],
        [{ cubicleId: 'cubicle-01', subtask: 'Disable bounds checking' }]
      );

      const dissentingVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Optimistic approval.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'GATE 1 INTERCESSIO: Bounds checking is a mandatory safety invariant.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.votePlan(plan.plan_id, dissentingVotes);
      expect(result.approved).toBe(false);
      expect(result.action).toBe('PLAN_VETO_REVISED');

      // Verify no tasks were written to todo/
      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo).toHaveLength(0);

      const todoFiles = await fs.readdir(path.join(sandbox.swarmDir, 'tasks', 'todo'));
      expect(todoFiles.filter((f) => f.endsWith('.json'))).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. COURIER GATEWAY EXECUTION LOOP (WISDOM, POWER, BOTH, VETO)
  // =========================================================================
  describe('3. Courier Gateway Execution Loop', () => {
    it('executes petition with requested_type: WISDOM (deliberates wisdom, no task queued, writes sealed deliverable to outbox)', async () => {
      const petition = await courierGateway.submitPetition({
        sender_agent: 'openclaw',
        prompt: 'Architectural evaluation for zero-copy file streaming',
        requested_type: 'WISDOM',
      });

      expect(petition.status).toBe('SEALED');
      expect(petition.requested_type).toBe('WISDOM');
      expect(petition.wisdom_response).toContain('CONSULAR WISDOM RATIFIED');
      expect(petition.consular_seal?.approved_by).toEqual(['Consul I', 'Consul II']);

      // No taskboard task should be created
      expect(petition.swarm_task_id).toBeUndefined();
      expect(petition.tasks_spawned).toBeUndefined();
      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo).toHaveLength(0);

      // Verify physical outbox deliverable file on disk
      const outboxDir = path.join(sandbox.swarmDir, 'courier', 'outbox');
      const expectedFilename = `deliverable_openclaw_${petition.petition_id}.json`;
      const outboxPath = path.join(outboxDir, expectedFilename);
      const exists = await fs.access(outboxPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const raw = await fs.readFile(outboxPath, 'utf8');
      const payload = JSON.parse(raw);
      expect(payload.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
      expect(payload.petition_id).toBe(petition.petition_id);
    });

    it('executes petition with requested_type: POWER (queues task on taskboard, no wisdom, writes sealed deliverable to outbox)', async () => {
      const petition = await courierGateway.submitPetition({
        sender_agent: 'hermes',
        prompt: 'Compile optimized binary release',
        requested_type: 'POWER',
      });

      expect(petition.status).toBe('SEALED');
      expect(petition.requested_type).toBe('POWER');
      expect(petition.wisdom_response).toBeUndefined();
      expect(petition.consular_wisdom).toBeUndefined();

      // Swarm task must be queued in .swarm/tasks/todo/
      expect(petition.swarm_task_id).toBeDefined();
      expect(petition.tasks_spawned).toHaveLength(1);
      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo.some((t) => t.id === petition.swarm_task_id)).toBe(true);

      // Verify physical deliverable JSON in outbox with seal
      const outboxPath = path.join(
        sandbox.swarmDir,
        'courier',
        'outbox',
        `deliverable_hermes_${petition.petition_id}.json`
      );
      const exists = await fs.access(outboxPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const payload = JSON.parse(await fs.readFile(outboxPath, 'utf8'));
      expect(payload.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
      expect(payload.sender_agent).toBe('hermes');
    });

    it('executes petition with requested_type: BOTH (deliberates wisdom AND queues task, writes sealed deliverable to outbox)', async () => {
      const petition = await courierGateway.submitPetition({
        sender_agent: 'gpt-dot',
        prompt: 'Refactor database indexing scheme and benchmark',
        requested_type: 'BOTH',
      });

      expect(petition.status).toBe('SEALED');
      expect(petition.requested_type).toBe('BOTH');
      expect(petition.wisdom_response).toContain('CONSULAR WISDOM RATIFIED');
      expect(petition.consular_wisdom).toBeDefined();

      // Task must be created
      expect(petition.swarm_task_id).toBeDefined();
      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo.some((t) => t.id === petition.swarm_task_id)).toBe(true);

      // Verify deliverable file in outbox with RATIFIED_BY_TWIN_CONSULS seal
      const outboxPath = path.join(
        sandbox.swarmDir,
        'courier',
        'outbox',
        `deliverable_gpt-dot_${petition.petition_id}.json`
      );
      const exists = await fs.access(outboxPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const payload = JSON.parse(await fs.readFile(outboxPath, 'utf8'));
      expect(payload.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
      expect(petition.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
    });

    it('transitions to VETOED with no seal when 1/2 Consuls dissent, withholding deliverable output', async () => {
      const dissentingVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Surface proposal looks benign.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: Malicious buffer overrun detected in context payload.',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'openclaw',
          prompt: 'Execute unvalidated assembly shellcode',
          requested_type: 'POWER',
        },
        dissentingVotes
      );

      expect(petition.status).toBe('VETOED');
      expect(petition.consular_seal).toBeUndefined();
      expect(petition.sealed_deliverable).toBeUndefined();
      expect(petition.sealed_output).toBeUndefined();
      expect(petition.veto_rationale).toContain('Malicious buffer overrun detected');

      // Verify deliverable JSON file was NOT created in outbox
      const outboxPath = path.join(
        sandbox.swarmDir,
        'courier',
        'outbox',
        `deliverable_openclaw_${petition.petition_id}.json`
      );
      const exists = await fs.access(outboxPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  // =========================================================================
  // 4. PATH TRAVERSAL DEFENSES IN verifyPathAccess
  // =========================================================================
  describe('4. Path Traversal Defenses in verifyPathAccess', () => {
    beforeEach(async () => {
      await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: ['src/server/**', '.env*', 'secrets/**'],
        memory_scopes: ['preferences'],
      });
    });

    it('blocks classic relative path traversal (src/client/../../src/server/index.ts)', () => {
      const check = consularEngine.verifyPathAccess('cubicle-01', 'src/client/../../src/server/index.ts');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Path traversal detected');
    });

    it('blocks Windows backslash path traversal (src\\client\\..\\..\\src\\server\\index.ts)', () => {
      const check = consularEngine.verifyPathAccess('cubicle-01', 'src\\client\\..\\..\\src\\server\\index.ts');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Path traversal detected');
    });

    it('blocks root-escaping traversal (../../etc/passwd)', () => {
      const check = consularEngine.verifyPathAccess('cubicle-01', '../../etc/passwd');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Path traversal detected');
    });

    it('blocks standalone parent directory indicator (..)', () => {
      const check = consularEngine.verifyPathAccess('cubicle-01', '..');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Path traversal detected');
    });

    it('blocks internal relative retreat (src/client/../client/app.ts)', () => {
      const check = consularEngine.verifyPathAccess('cubicle-01', 'src/client/../client/app.ts');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Path traversal detected');
    });

    it('blocks access to paths explicitly listed in denied_paths (src/server/index.ts, .env.production)', () => {
      const check1 = consularEngine.verifyPathAccess('cubicle-01', 'src/server/index.ts');
      expect(check1.allowed).toBe(false);
      expect(check1.reason).toContain('denied by Consular ACL rule');

      const check2 = consularEngine.verifyPathAccess('cubicle-01', '.env.production');
      expect(check2.allowed).toBe(false);
      expect(check2.reason).toContain('denied by Consular ACL rule');
    });

    it('blocks access to paths outside authorized allowed_paths scope (scripts/deploy.sh)', () => {
      const check = consularEngine.verifyPathAccess('cubicle-01', 'scripts/deploy.sh');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('outside the authorized allowed_paths scope');
    });

    it('permits authorized legitimate access matching allowed_paths (src/client/app.ts, public/index.html)', () => {
      const check1 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/app.ts');
      expect(check1.allowed).toBe(true);
      expect(check1.reason).toBeUndefined();

      const check2 = consularEngine.verifyPathAccess('cubicle-01', 'public/index.html');
      expect(check2.allowed).toBe(true);
      expect(check2.reason).toBeUndefined();
    });
  });
});
