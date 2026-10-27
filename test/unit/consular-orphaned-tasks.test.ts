import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';

describe('Consular orphaned-task alerts', () => {
  let root: string;
  let engine: ConsularEngine;
  let board: TaskboardManager;
  let invoke: ReturnType<typeof vi.spyOn>;
  let events: Array<{ type: string; payload: any }>;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'consular-orphans-'));
    const cubicles = new CubicleManager(root);
    board = new TaskboardManager(root);
    vi.spyOn(cubicles, 'getAllCubicles').mockReturnValue([
      { id: 'idle-worker', status: 'idle', config: { enabled: false } },
      { id: 'busy-worker', status: 'working', config: { enabled: true } },
      { id: 'inspected-worker', status: 'under_inspection', config: { enabled: true } },
    ] as any);
    engine = new ConsularEngine(root, cubicles, board, new CapabilityMatrix());
    await engine.initialize();
    invoke = vi.spyOn(engine as any, 'invokeConsulCli').mockResolvedValue('[PASS]');
    events = [];
    engine.onEvent((type, payload) => events.push({ type, payload }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('alerts both Consuls and the live stream about every orphan, including beyond the summary limit', async () => {
    const healthy = Array.from({ length: 5 }, (_, i) => ({ id: `healthy-${i}`, title: 'Busy', assigned_cubicle: 'busy-worker' }));
    vi.spyOn(board, 'listAllTasks').mockResolvedValue({
      todo: [], review: [], done: [],
      in_progress: [...healthy,
        { id: 'unassigned', title: 'Unassigned task', assigned_cubicle: null },
        { id: 'stalled', title: 'Idle task', assigned_cubicle: 'idle-worker' },
      ],
    } as any);
    await engine.chatWithConsuls('Check progress');
    expect(invoke).toHaveBeenCalledTimes(2);
    for (const call of invoke.mock.calls) {
      expect(call[1]).toMatch(/^HIGH-PRIORITY ANOMALY ALERT/);
      expect(call[1]).toContain('unassigned ("Unassigned task"): assigned_cubicle is null');
      expect(call[1]).toContain('stalled ("Idle task"): assigned cubicle idle-worker is idle');
      expect(call[1]).toContain('Gate 1 dispatch workflow');
    }
    const warnings = events.filter((event) => event.payload.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('CONSULAR_THINKING');
    expect(warnings[0].payload.task_ids).toEqual(['unassigned', 'stalled']);
  });

  it('does not flag other columns or workers that are working or under inspection', async () => {
    vi.spyOn(board, 'listAllTasks').mockResolvedValue({
      todo: [{ id: 'todo', assigned_cubicle: null }],
      review: [{ id: 'review', assigned_cubicle: 'idle-worker' }],
      done: [{ id: 'done', assigned_cubicle: null }],
      in_progress: [
        { id: 'busy', assigned_cubicle: 'busy-worker' },
        { id: 'inspection', assigned_cubicle: 'inspected-worker' },
      ],
    } as any);
    await engine.chatWithConsuls('Check progress');
    for (const call of invoke.mock.calls) expect(call[1]).not.toContain('HIGH-PRIORITY ANOMALY ALERT');
    expect(events.some((event) => event.payload.severity === 'warning')).toBe(false);
  });

  it('still invokes both Consuls when the task snapshot is unavailable', async () => {
    vi.spyOn(board, 'listAllTasks').mockRejectedValue(new Error('Snapshot unavailable'));
    await engine.chatWithConsuls('Check progress');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(events.some((event) => event.payload.severity === 'warning')).toBe(false);
  });
});
