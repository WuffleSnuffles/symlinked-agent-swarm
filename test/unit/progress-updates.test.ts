import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { WorktreeManager } from '../../src/server/worktree-manager.js';
import { ConsularProgressUpdater } from '../../src/server/progress-updates.js';

describe('ConsularProgressUpdater & Live Activity Snapshot', () => {
  let root: string;
  let swarmDir: string;
  let board: TaskboardManager;
  let cubicles: CubicleManager;
  let engine: ConsularEngine;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'progress-updates-test-'));
    swarmDir = path.join(root, '.swarm');
    board = new TaskboardManager(swarmDir);
    cubicles = new CubicleManager(swarmDir);
    await board.initialize();
    await cubicles.initialize();
    const manager = new WorktreeManager(root);
    engine = new ConsularEngine(swarmDir, cubicles, board, new CapabilityMatrix(), manager, root);
    await engine.initialize();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reports idle state when no tasks are in_progress or review', async () => {
    const events: Array<{ type: string; payload: any }> = [];
    const updater = new ConsularProgressUpdater(
      engine,
      board,
      cubicles,
      (type, payload) => events.push({ type, payload }),
      { enabledInTest: true }
    );

    await board.createTask({ title: 'Queued item', description: 'desc', priority: 'HIGH' });
    const snap = await updater.tick();
    expect(snap?.state).toBe('idle');
    expect(snap?.todoCount).toBe(1);
    expect(snap?.summary).toContain('1 task(s) queued in Todo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SWARM_ACTIVITY_HEARTBEAT');

    // Deduplicated when idle state does not change
    await updater.tick();
    expect(events).toHaveLength(1);
  });

  it('detects stalled state when in_progress task has an idle cubicle and working state when active', async () => {
    const events: Array<{ type: string; payload: any }> = [];
    const updater = new ConsularProgressUpdater(
      engine,
      board,
      cubicles,
      (type, payload) => events.push({ type, payload }),
      { enabledInTest: true, emitDialogueOnTransitions: true, emitDialogueOnStalled: true }
    );

    const task = await board.createTask({
      title: 'Background worker task',
      description: 'desc',
      priority: 'HIGH',
    });
    await board.claimTask('cubicle-01', task.id);

    // Cubicle-01 is still idle -> should report stalled
    const stalledSnap = await updater.tick();
    expect(stalledSnap?.state).toBe('stalled');
    expect(stalledSnap?.orphanedTasks).toHaveLength(1);
    expect(stalledSnap?.summary).toContain('no active worker process');

    // Transition cubicle-01 to working -> should report working
    const c1 = cubicles.getCubicle('cubicle-01');
    c1.current_task_id = task.id;
    await cubicles.transitionStatus('cubicle-01', 'working', 'Implementing background feature');
    await cubicles.updateSurfaceThoughts('cubicle-01', 'Editing overseer-console.js');

    const workingSnap = await updater.tick();
    expect(workingSnap?.state).toBe('working');
    expect(workingSnap?.workingCubicles).toHaveLength(1);
    expect(workingSnap?.workingCubicles[0].latestThought).toContain('Editing overseer-console.js');
  });

  it('delivers a plain-English <35-word console progress report every 10 minutes even when signature is unchanged or stalled, and stays silent when no work remains', async () => {
    const dialogues: any[] = [];
    engine.onEvent((type, payload) => {
      if (type === 'CONSULAR_DIALOGUE') {
        dialogues.push(payload?.entry || payload);
      }
    });

    const t0 = 1_700_000_000_000;
    const updater = new ConsularProgressUpdater(
      engine,
      board,
      cubicles,
      () => {},
      { enabledInTest: true, periodicReportIntervalMs: 10 * 60 * 1000 },
      t0
    );

    // 1. Completely empty board -> even after 10 minutes, stays silent
    await updater.tick(false, t0 + 10 * 60 * 1000);
    expect(dialogues).toHaveLength(0);

    // 2. Create a stalled in-progress task -> emits initial stalled transition dialogue at t1
    const t1 = t0 + 11 * 60 * 1000;
    const task = await board.createTask({
      title: 'Long running migration task-mvps9tyc-9mp6',
      description: 'desc',
      priority: 'HIGH',
    });
    await board.claimTask('cubicle-02', task.id);

    await updater.tick(false, t1);
    expect(dialogues).toHaveLength(1);
    const msg0 = String(dialogues[0].content || '');
    expect(msg0.split(/\s+/).length).toBeLessThan(35);
    expect(msg0).not.toContain('`');
    expect(msg0).not.toMatch(/task-[a-z0-9-]+/i);

    // 3. Before 10 minutes elapse with identical signature -> no duplicate dialogue
    await updater.tick(false, t1 + 5 * 60 * 1000);
    expect(dialogues).toHaveLength(1);

    // 4. At 10 minutes with IDENTICAL stalled signature -> MUST deliver periodic progress report
    await updater.tick(false, t1 + 10 * 60 * 1000);
    expect(dialogues).toHaveLength(2);
    const msg1 = String(dialogues[1].content || '');
    expect(msg1).toContain('Progress report:');
    expect(msg1.split(/\s+/).length).toBeLessThan(35);
  });
});
