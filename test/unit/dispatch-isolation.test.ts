import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { WorktreeManager } from '../../src/server/worktree-manager.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { normalizeFileScope, scopesOverlap } from '../../src/server/dispatch-isolation.js';

describe('Gate 1 isolated dispatch', () => {
  let root: string;
  let board: TaskboardManager;
  let engine: ConsularEngine;
  let manager: WorktreeManager;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-isolation-'));
    const swarm = path.join(root, '.swarm');
    board = new TaskboardManager(swarm);
    const cubicles = new CubicleManager(swarm);
    await board.initialize();
    await cubicles.initialize();
    manager = new WorktreeManager(root);
    vi.spyOn(manager, 'provisionWorktree').mockImplementation(async id => ({
      cubicleId: id, worktreePath: path.join(root, 'worktrees', id), branch: `swarm/${id}`,
      headSha: 'fixture', isLocked: false, swarmJunctionActive: true, agentsJunctionActive: true,
    }));
    engine = new ConsularEngine(swarm, cubicles, board, new CapabilityMatrix(), manager, root);
    await engine.initialize();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });
  const create = (board: TaskboardManager, scope?: string[]) => board.createTask({
    title: 'Isolation fixture', description: '', priority: 'HIGH', file_scope: scope,
  });

  it('normalizes aliases, detects directory overlap, rejects escapes and globs', () => {
    expect(normalizeFileScope(['SRC\\a.ts', './src/a.ts'])).toEqual(['src/a.ts']);
    expect(scopesOverlap(['src'], ['src/a.ts'])).toBe(true);
    expect(scopesOverlap(['src/a'], ['src/ab'])).toBe(false);
    for (const scope of ['../outside', 'C:\\outside', '/outside', 'src/**']) {
      expect(() => normalizeFileScope([scope])).toThrow();
    }
  });
  it('provisions before claiming and passes worktree to worker prompt and CLI', async () => {
    vi.stubEnv('VITEST', '');
    const invoke = vi.spyOn(engine, 'invokeConsulCli').mockResolvedValue('Implemented fixture and verified focused tests.');
    const task = await create(board, ['src/a.ts']);
    await engine.dispatchTaskToCubicle(task.id, 'cubicle-09');
    await vi.waitFor(() => expect(board.getTask(task.id)?.column).toBe('review'));
    expect(manager.provisionWorktree).toHaveBeenCalledWith('cubicle-09');
    expect(invoke.mock.calls[0][4]).toBe(path.join(root, 'worktrees', 'cubicle-09'));
    expect(invoke.mock.calls[0][1]).toContain(`Workspace Root: "${path.join(root, 'worktrees', 'cubicle-09')}"`);
  });
  it('rejects overlaps through Gate 2 and allows independent scopes', async () => {
    const first = await create(board, ['src']);
    await engine.dispatchTaskToCubicle(first.id, 'cubicle-01');
    await board.submitForReview(first.id);
    const second = await create(board, ['SRC/a.ts']);
    await expect(engine.dispatchTaskToCubicle(second.id, 'cubicle-02')).rejects.toThrow('file lock conflict');
    expect(board.getTask(second.id)?.column).toBe('todo');
    const third = await create(board, ['test/a.ts']);
    await expect(engine.dispatchTaskToCubicle(third.id, 'cubicle-02')).resolves.toMatchObject({ status: 'working' });
  });
  it('fails closed without a scope and respects explicit file locks', async () => {
    await engine.acquireLock('src/a.ts', 'cubicle-03');
    const task = await create(board);
    await expect(engine.dispatchTaskToCubicle(task.id, 'cubicle-01')).rejects.toThrow('file lock conflict');
  });
  it('leaves the task unclaimed on provisioning failure and permits retry', async () => {
    vi.mocked(manager.provisionWorktree).mockRejectedValueOnce(new Error('Git unavailable'));
    const task = await create(board);
    await expect(engine.dispatchTaskToCubicle(task.id, 'cubicle-01')).rejects.toThrow('Git unavailable');
    expect(board.getTask(task.id)?.column).toBe('todo');
    await expect(engine.dispatchTaskToCubicle(task.id, 'cubicle-01')).resolves.toMatchObject({ status: 'working' });
  });
  it('serializes concurrent dispatch before provisioning and claiming', async () => {
    const first = await create(board);
    const second = await create(board);
    const results = await Promise.allSettled([
      engine.dispatchTaskToCubicle(first.id, 'cubicle-01'),
      engine.dispatchTaskToCubicle(second.id, 'cubicle-02'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await board.listTasksByColumn('in_progress')).toHaveLength(1);
  });
  it('blocks overlapping Gate 1 splits before authorization', async () => {
    const plan = await engine.deliberatePlan('Scope fixture', [], [
      { cubicleId: 'cubicle-01', subtask: 'Parent', file_scope: ['src'] },
      { cubicleId: 'cubicle-02', subtask: 'Child', file_scope: ['src/a.ts'] },
    ]);
    await expect(engine.votePlan(plan.plan_id, [
      { consul: 'Consul Nia Nova', decision: 'APPROVE', rationale: 'Reviewed plan', timestamp: new Date().toISOString() },
      { consul: 'Consul Ferric Lunaux', decision: 'APPROVE', rationale: 'Reviewed plan', timestamp: new Date().toISOString() },
    ])).rejects.toThrow('overlapping');
    expect(engine.getPlanGate(plan.plan_id)?.status).toBe('PENDING_PLAN_VOTE');
    expect(await board.listTasksByColumn('todo')).toHaveLength(0);
  });
});

describe('Real Git worktree provisioning', () => {
  it('links all three shared directories, preserves tracked copies, and reuses safely', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-worktree-'));
    const manager = new WorktreeManager(root);
    try {
      await manager.execGit(['init']);
      await fs.mkdir(path.join(root, '.agents'));
      await fs.writeFile(path.join(root, '.agents', 'rules.md'), 'tracked rules');
      await fs.writeFile(path.join(root, 'source.txt'), 'original');
      await manager.execGit(['add', '.']);
      await manager.execGit(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
      const info = await manager.provisionWorktree('cubicle-01');
      for (const shared of ['.swarm', '.agents', 'node_modules']) {
        expect(await fs.realpath(path.join(info.worktreePath, shared))).toBe(await fs.realpath(path.join(root, shared)));
      }
      await fs.writeFile(path.join(info.worktreePath, 'source.txt'), 'isolated edit');
      expect(await fs.readFile(path.join(root, 'source.txt'), 'utf8')).toBe('original');
      await manager.provisionWorktree('cubicle-01');
      expect(await fs.readFile(path.join(info.worktreePath, 'source.txt'), 'utf8')).toBe('isolated edit');
      await manager.removeWorktree('cubicle-01');
      expect(await fs.readFile(path.join(root, '.agents', 'rules.md'), 'utf8')).toBe('tracked rules');
      await expect(manager.provisionWorktree('../escape')).rejects.toThrow('Invalid cubicle');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20000);
});
