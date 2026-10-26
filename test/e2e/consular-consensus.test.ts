import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  createTestSandbox,
  evaluateConsularConsensus,
  ConsularVote,
  TaskRecord
} from './helpers';

describe('Roman Republic Dual-Consul Governance & Intercessio Consensus Suite', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('consul_suite');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Case A: Consular Veto (1 Approve + 1 Veto) -> Merge Blocked & Revised
  // =========================================================================
  describe('Consular Veto (Intercessio) Invariants', () => {
    it('Case A1: Consul I votes APPROVE, Consul II votes VETO -> Merge blocked, task returned to revision', async () => {
      // 1. Task currently in review/
      const taskId = 'task-consul-veto-01';
      const reviewTaskPath = path.join(sandbox.swarmDir, 'tasks', 'review', `${taskId}.json`);
      const taskData: TaskRecord = {
        id: taskId,
        title: 'Implement database connection pooling',
        assigned_cubicle: 'cubicle-01',
        branch: 'swarm/cubicle-01',
        progress_percent: 90,
        status: 'review',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await fs.writeFile(reviewTaskPath, JSON.stringify(taskData, null, 2), 'utf8');

      // 2. Voting deliberation
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Connection pool implementation is thread-safe and matches spec.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'INTERCESSIO VETO: Max connection pool size is unbound, risks resource exhaustion under load.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);

      // 3. Verify consensus contract: Not approved, action is VETO_BLOCKED_AND_REVISED
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.votes).toEqual([vote1, vote2]);

      // 4. Return task to in_progress/ for revision with veto rationale attached
      const revisionTaskPath = path.join(sandbox.swarmDir, 'tasks', 'in_progress', `${taskId}.json`);
      const updatedTask: TaskRecord = {
        ...taskData,
        status: 'in_progress',
        progress_percent: 75,
        updated_at: new Date().toISOString()
      };

      await fs.rename(reviewTaskPath, revisionTaskPath);
      await fs.writeFile(revisionTaskPath, JSON.stringify(updatedTask, null, 2), 'utf8');

      // 5. Log veto rationale to incidents.jsonl
      const incidentPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
      const vetoIncident = {
        timestamp: new Date().toISOString(),
        type: 'CONSULAR_VETO',
        task_id: taskId,
        dissenting_consul: 'Consul II',
        rationale: vote2.rationale,
        action: 'TASK_RETURNED_FOR_REVISION'
      };
      await fs.appendFile(incidentPath, JSON.stringify(vetoIncident) + '\n', 'utf8');

      // Assertions
      expect(await fs.access(revisionTaskPath).then(() => true)).toBe(true);
      expect(await fs.access(reviewTaskPath).then(() => true).catch(() => false)).toBe(false);

      const incidentLog = await fs.readFile(incidentPath, 'utf8');
      expect(incidentLog).toContain('CONSULAR_VETO');
      expect(incidentLog).toContain('Max connection pool size is unbound');
    });

    it('Case A2: Consul I votes VETO, Consul II votes APPROVE -> Merge blocked with Consul I rationale', async () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: 'INTERCESSIO VETO: Type narrowing missing in response parser.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Syntax and layout look solid.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.votes[0].rationale).toContain('Type narrowing missing');
    });

    it('Case A3: Both Consuls vote VETO (0/2 unanimous rejection) -> Merge strictly blocked', async () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: 'VETO: Missing error handling.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'VETO: Missing tests.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
    });
  });

  // =========================================================================
  // Case B: Unanimous Consensus (2/2 Approve) -> Merge Succeeds & Moved to Done
  // =========================================================================
  describe('Unanimous Consular Consensus Invariants', () => {
    it('Case B1: Both Consul I and Consul II vote APPROVE -> Merge authorized and moved to done/', async () => {
      // 1. Task currently in review/
      const taskId = 'task-consul-approve-01';
      const reviewTaskPath = path.join(sandbox.swarmDir, 'tasks', 'review', `${taskId}.json`);
      const taskData: TaskRecord = {
        id: taskId,
        title: 'Optimize bitmap raycasting shader',
        assigned_cubicle: 'cubicle-01',
        branch: 'swarm/cubicle-01',
        progress_percent: 100,
        status: 'review',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await fs.writeFile(reviewTaskPath, JSON.stringify(taskData, null, 2), 'utf8');

      // 2. Both Consuls review and approve
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Shader math verified, frame rate sustained at 60 FPS.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Unit tests passed with 100% line coverage.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);

      // 3. Verify unanimous approval
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');

      // 4. Move task from review/ to done/
      const doneTaskPath = path.join(sandbox.swarmDir, 'tasks', 'done', `${taskId}.json`);
      const completedTask: TaskRecord = {
        ...taskData,
        status: 'done',
        progress_percent: 100,
        updated_at: new Date().toISOString()
      };

      await fs.rename(reviewTaskPath, doneTaskPath);
      await fs.writeFile(doneTaskPath, JSON.stringify(completedTask, null, 2), 'utf8');

      // Assertions
      expect(await fs.access(doneTaskPath).then(() => true)).toBe(true);
      expect(await fs.access(reviewTaskPath).then(() => true).catch(() => false)).toBe(false);

      const doneContent = JSON.parse(await fs.readFile(doneTaskPath, 'utf8'));
      expect(doneContent.status).toBe('done');
      expect(doneContent.progress_percent).toBe(100);
    });

    it('Case B2: Audit trail records immutable consensus timestamp and rationales', async () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Approved.',
        timestamp: '2026-10-26T00:30:00.000Z'
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Approved.',
        timestamp: '2026-10-26T00:30:05.000Z'
      };

      const consensus = evaluateConsularConsensus(vote1, vote2);
      expect(consensus.votes[0].timestamp).toBe('2026-10-26T00:30:00.000Z');
      expect(consensus.votes[1].timestamp).toBe('2026-10-26T00:30:05.000Z');
    });
  });
});
