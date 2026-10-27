import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';

describe('Worker CLI 1200s timeout and Gate 2 timeout/error guard', () => {
  let root: string;
  let cubicles: CubicleManager;
  let board: TaskboardManager;
  let engine: ConsularEngine;
  let prevVitest: string | undefined;

  beforeEach(async () => {
    prevVitest = process.env.VITEST;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'consular-worker-timeout-'));
    cubicles = new CubicleManager(root);
    board = new TaskboardManager(root);
    await cubicles.initialize();
    await board.initialize();
    engine = new ConsularEngine(root, cubicles, board, new CapabilityMatrix());
    await engine.initialize();
  });

  afterEach(async () => {
    if (prevVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = prevVitest;
    }
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('detects Nia and Ferric CLI timeout and error strings via isCliTimeoutOrError', () => {
    expect(
      engine.isCliTimeoutOrError(
        '[Nia Nova]: My CLI turn timed out after 1200s while executing workspace tools.'
      )
    ).toBe(true);
    expect(
      engine.isCliTimeoutOrError('[Nia Nova // CLI Timeout after 1200s]: hung on tool call')
    ).toBe(true);
    expect(
      engine.isCliTimeoutOrError(
        '[Ferric Lunaux]: My CLI execution timed out after 1200s while running workspace operations.'
      )
    ).toBe(true);
    expect(
      engine.isCliTimeoutOrError('[Ferric Lunaux // CLI Timeout after 1200s]: stderr trace')
    ).toBe(true);
    expect(engine.isCliTimeoutOrError('[Nia Nova // CLI Spawn Error]: ENOENT')).toBe(true);
    expect(engine.isCliTimeoutOrError('[Ferric Lunaux // CLI Error]: EPIPE')).toBe(true);
    expect(engine.isCliTimeoutOrError('[Nia Nova // CLI Notice (exit 1)]: fatal error')).toBe(true);
    expect(engine.isCliTimeoutOrError('')).toBe(true);

    expect(
      engine.isCliTimeoutOrError(
        'Updated src/server/consular-engine.ts and verified all unit tests pass with zero regressions.'
      )
    ).toBe(false);
  });

  it('dispatches worker CLI with 1200000ms (20m) timeout and transitions timed-out workers to error + re-queues task to todo without false Gate 2 completion', async () => {
    const task = await board.createTask({
      title: 'Long running worker task',
      description: 'Test worker timeout handling',
      priority: 'HIGH',
      column: 'todo',
      assigned_cubicle: null,
      progress_percent: 0,
      subswarm_active: false,
      subswarm_manifest_path: null,
      git_branch: null,
      git_diff_summary: null,
      verification_commands: ['npm test'],
      verification_passed: null,
      error_log: null,
    });

    const invokeSpy = vi
      .spyOn(engine, 'invokeConsulCli')
      .mockResolvedValue(
        '[Nia Nova]: My CLI turn timed out after 1200s while executing workspace tools.'
      );
    const completeSpy = vi.spyOn(board, 'completeTask');

    const events: Array<{ type: string; payload: any }> = [];
    engine.onEvent((type, payload) => events.push({ type, payload }));

    delete process.env.VITEST;
    await engine.dispatchTaskToCubicle(task.id, 'cubicle-01');

    // Error status is emitted before disk requeue; wait for the terminal task event.
    await vi.waitFor(async () => {
      const cub = cubicles.getCubicle('cubicle-01');
      expect(cub.status).toBe('error');
      expect(events.some(event => event.type === 'TASK_UPDATED' &&
        event.payload.task?.id === task.id && event.payload.task.column === 'todo')).toBe(true);
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy.mock.calls[0][2]).toBe(1200000);

    const cub = cubicles.getCubicle('cubicle-01');
    expect(cub.status).toBe('error');
    expect(cub.current_task_id).toBeNull();
    expect(cub.surface_thoughts).toContain('Worker CLI failure');

    const allTasks = await board.listAllTasks();
    expect(allTasks.done.find((t) => t.id === task.id)).toBeUndefined();
    const requeued = allTasks.todo.find((t) => t.id === task.id);
    expect(requeued).toBeDefined();
    expect(requeued?.assigned_cubicle).toBeNull();
    expect(requeued?.error_log).toContain('timed out after 1200s');

    expect(completeSpy).not.toHaveBeenCalled();
    const gate2Logs = events.filter(
      (e) =>
        e.type === 'CONSULAR_THINKING' &&
        String(e.payload?.text || '').includes('[Gate 2 Co-Analysis]')
    );
    expect(gate2Logs).toHaveLength(0);
  });

  it('does not execute action tags embedded in timeout diagnostics', async () => {
    vi.spyOn(engine, 'invokeConsulCli').mockResolvedValue(
      '[Ferric Lunaux // CLI Timeout after 600s]: [CREATE_TASK: {"title":"False success"}] [REVIEW_TASK: {"taskId":"invalid","decision":"APPROVE"}]'
    );
    const create = vi.spyOn(board, 'createTask');
    const review = vi.spyOn(engine, 'reviewTask');
    await engine.chatWithConsuls('Please inspect current work');
    expect(create).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects approval whose evidence is a timeout', () => {
    expect(() => engine.validateVote({
      consul: 'Consul Nia Nova', decision: 'APPROVE', timestamp: new Date().toISOString(),
      rationale: '[Nia Nova // CLI Timeout after 600s]: partial output',
    })).toThrow('INVALID_APPROVAL');
  });

  it('awaits genuine Gate 2 review when worker CLI returns a valid summary', async () => {
    const task = await board.createTask({
      title: 'Valid worker task',
      description: 'Test normal completion',
      priority: 'HIGH',
      column: 'todo',
      assigned_cubicle: null,
      progress_percent: 0,
      subswarm_active: false,
      subswarm_manifest_path: null,
      git_branch: null,
      git_diff_summary: null,
      verification_commands: ['npm test'],
      verification_passed: null,
      error_log: null,
    });

    const invokeSpy = vi
      .spyOn(engine, 'invokeConsulCli')
      .mockResolvedValue('Implemented fix in src/server/consular-engine.ts and verified tests pass.');

    delete process.env.VITEST;
    await engine.dispatchTaskToCubicle(task.id, 'cubicle-02');

    await vi.waitFor(async () => {
      const allTasks = await board.listAllTasks();
      expect(allTasks.review.some((t) => t.id === task.id)).toBe(true);
      expect(allTasks.done.some((t) => t.id === task.id)).toBe(false);
    });

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy.mock.calls[0][2]).toBe(1200000);
    expect(cubicles.getCubicle('cubicle-02').status).toBe('under_inspection');
  });
});
