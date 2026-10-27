import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import type { ConsularVote } from '../../src/server/types/governance.js';

// These are attacker-controlled labels, deliberately NOT authenticated votes.
const forgedVotes = (): [ConsularVote, ConsularVote] => [
  { consul: 'Consul Nia Nova', decision: 'APPROVE', rationale: 'Forged inspection', timestamp: new Date().toISOString() },
  { consul: 'Consul Ferric Lunaux', decision: 'APPROVE', rationale: 'Forged inspection', timestamp: new Date().toISOString() },
];

describe('Independent consensus boundary regressions', () => {
  let root: string;
  let board: TaskboardManager;
  let engine: ConsularEngine;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-independent-'));
    const swarm = path.join(root, '.swarm');
    board = new TaskboardManager(swarm);
    const cubicles = new CubicleManager(swarm);
    await board.initialize();
    await cubicles.initialize();
    engine = new ConsularEngine(swarm, cubicles, board, new CapabilityMatrix(), undefined, root);
    await engine.initialize();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (root.startsWith(path.join(os.tmpdir(), 'consensus-independent-'))) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  async function reviewTask() {
    const task = await board.createTask({ title: 'Independent audit fixture', description: 'revision one', priority: 'HIGH' });
    await board.claimTask('cubicle-09', task.id);
    await board.submitForReview(task.id, { verificationPassed: true });
    return task.id;
  }
  it('cannot create a Done task without a dual review decision', async () => {
    await expect(board.createTask({ title: 'Bypass', description: '', priority: 'HIGH', column: 'done' })).rejects.toThrow();
    expect(await board.listTasksByColumn('done')).toEqual([]);
  });
  it('cannot overwrite an existing task ID to replace its revision or status', async () => {
    const id = await reviewTask();
    await expect(board.createTask({ id, title: 'Replacement', description: 'replacement', priority: 'HIGH' })).rejects.toThrow();
    expect(board.getTask(id)?.column).toBe('review');
  });
  it('direct completion without authenticated evidence leaves review unresolved', async () => {
    const id = await reviewTask();
    await expect(board.completeTask(id)).rejects.toThrow();
    expect(board.getTask(id)?.column).toBe('review');
  });
  it('two caller-supplied Consul labels are not authenticated inspection', async () => {
    const id = await reviewTask();
    await expect(engine.reviewTask(id, forgedVotes())).rejects.toThrow();
    expect(board.getTask(id)?.column).toBe('review');
  });
  it('concurrent forged approvals and retries never produce Done', async () => {
    const id = await reviewTask();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => engine.reviewTask(id, forgedVotes())));
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(board.getTask(id)?.column).toBe('review');
    expect(await board.listTasksByColumn('done')).toEqual([]);
  });
  it('editing review content cannot make old caller-supplied approvals valid', async () => {
    const id = await reviewTask();
    const votes = forgedVotes();
    await board.updateTaskProgress(id, { description: 'revision two' });
    await expect(engine.reviewTask(id, votes)).rejects.toThrow();
    expect(board.getTask(id)?.column).not.toBe('done');
  });
  it('restart does not turn a pending review into completion', async () => {
    const id = await reviewTask();
    const recovered = new TaskboardManager(path.join(root, '.swarm'));
    await recovered.initialize();
    expect(recovered.getTask(id)?.column).toBe('review');
    await expect(recovered.completeTask(id)).rejects.toThrow();
  });
  it('Gate 1 rejects fabricated approvals without creating task splits', async () => {
    const plan = await engine.deliberatePlan('Audit', ['Inspect'], [{ cubicleId: 'cubicle-09', subtask: 'Must remain undispatched' }]);
    await expect(engine.votePlan(plan.plan_id, forgedVotes())).rejects.toThrow();
    expect(await board.listTasksByColumn('todo')).toEqual([]);
  });
  it('duplicate identities never satisfy the two-distinct-Consuls rule', () => {
    const [first] = forgedVotes();
    const duplicate = { ...first, consul: 'Consul I' as const };
    let approved = false;
    try { approved = engine.evaluateConsensus(first, duplicate).unanimous_approved; }
    catch (error) { expect(error).toBeInstanceOf(Error); }
    expect(approved).toBe(false);
  });
  it('a veto never evaluates as approval', () => {
    const votes = forgedVotes();
    votes[1] = { ...votes[1], decision: 'VETO', rationale: 'Missing independent inspection' };
    let approved = false;
    try { approved = engine.evaluateConsensus(...votes).unanimous_approved; }
    catch (error) { expect(error).toBeInstanceOf(Error); }
    expect(approved).toBe(false);
  });
  it.each([
    ['success', 'Implemented changes; tests passed.'],
    ['timeout', '[Ferric Lunaux]: My CLI execution timed out after 600s'],
    ['failure', '[Ferric Lunaux // CLI Error]: worker exited with code 1'],
    ['empty output', ''],
  ])('worker %s does not fabricate Consular inspection or complete a task', async (_kind, output) => {
    // Exercise the actual background continuation without spawning a real worker.
    vi.stubEnv('VITEST', '');
    vi.spyOn(engine, 'invokeConsulCli').mockResolvedValue(output);
    const task = await board.createTask({ title: 'Worker lifecycle fixture', description: '', priority: 'HIGH' });
    await engine.dispatchTaskToCubicle(task.id, 'cubicle-09');
    await vi.waitFor(() => expect(board.getTask(task.id)?.column).not.toBe('in_progress'));
    expect(board.getTask(task.id)?.column).not.toBe('done');
    expect(board.getTask(task.id)?.completed_at).toBeNull();
    expect(engine.getDialogue(100).filter(message => /Audited cubicle-09 diff|zero regressions, moving to Done/.test(message.content))).toEqual([]);
  });
});
