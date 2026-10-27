import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { createSwarmServer } from '../../src/server/index.js';
// @ts-ignore Browser module is exercised without a browser dependency.
import { TaskboardViewController } from '../../src/public/js/taskboard-view.js';

describe('Started work and assignment lifecycle', () => {
  let root: string;
  let board: TaskboardManager;
  const seed = { title: 'Consul inspection', description: 'Lifecycle regression', priority: 'HIGH' as const };
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'started-work-'));
    board = new TaskboardManager(path.join(root, '.swarm'));
    await board.initialize();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each(['Consul Ferric & Nia', 'cubicle-06'])('assignment alone stays queued; progress persists for %s', async owner => {
    const task = await board.createTask({ ...seed, assigned_cubicle: owner });
    expect(task.column).toBe('todo');
    expect(task.claimed_at).toBeNull();
    expect((await board.updateTaskProgress(task.id, { assigned_cubicle: owner })).column).toBe('todo');
    const listener = vi.fn();
    board.onTaskUpdated(listener);
    const started = await board.updateTaskProgress(task.id, { progress_percent: 90 });
    expect(started).toMatchObject({ column: 'in_progress', assigned_cubicle: owner, progress_percent: 90 });
    expect(started.claimed_at).toBeTruthy();
    expect(listener).toHaveBeenCalledWith(started);
    await expect(fs.stat(path.join(root, '.swarm/tasks/todo', `${task.id}.json`))).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(path.join(root, '.swarm/tasks/in_progress', `${task.id}.json`), 'utf8'))).toEqual(started);
    const reloaded = new TaskboardManager(path.join(root, '.swarm'));
    await reloaded.initialize();
    expect((await reloaded.listAllTasks()).in_progress).toContainEqual(started);
    expect(await fs.readFile(path.join(root, '.swarm/TASKBOARD.md'), 'utf8')).toContain(task.title);
  });

  it('repairs legacy todo/90 cards and honors explicit requeue across reload', async () => {
    const task = await board.createTask(seed);
    const file = path.join(root, '.swarm/tasks/todo', `${task.id}.json`);
    await fs.writeFile(file, JSON.stringify({ ...task, progress_percent: 90, assigned_cubicle: 'Consul Ferric & Nia' }));
    await board.initialize();
    expect(board.getTask(task.id)?.column).toBe('in_progress');
    await board.releaseTask(task.id, 'Retry later');
    await board.initialize();
    expect(board.getTask(task.id)).toMatchObject({ column: 'todo', progress_percent: 0, claimed_at: null });
  });

  it('starts active creation/subswarms without reopening review or done', async () => {
    expect((await board.createTask({ ...seed, progress_percent: 90 })).column).toBe('in_progress');
    const task = await board.createTask(seed);
    expect((await board.updateTaskProgress(task.id, { subswarm_active: true })).column).toBe('in_progress');
    await board.submitForReview(task.id);
    expect((await board.updateTaskProgress(task.id, { progress_percent: 90 })).column).toBe('review');
    await board.returnToRevision(task.id, { consul: 'nia', rationale: 'requeue', returnToTodo: true });
    await board.initialize();
    expect(board.getTask(task.id)?.column).toBe('todo');
    await board.completeTask(task.id);
    expect((await board.updateTaskProgress(task.id, { progress_percent: 90 })).column).toBe('done');
  });

  it.each(['Consul Ferric & Nia', 'cubicle-06', '<script>'])('renders escaped owner without corrupting entities: %s', owner => {
    const cards: any[] = [];
    vi.stubGlobal('document', { createElement: () => ({ style: {} }) });
    const controller = Object.create(TaskboardViewController.prototype);
    controller.cols = { todo: { appendChild: (card: any) => cards.push(card) } };
    controller.renderTasks({ todo: [{ ...seed, assigned_cubicle: owner }] });
    const escaped = owner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(cards[0].innerHTML).toContain(`<strong>${escaped}</strong>`);
  });

  it('returns matching API, WebSocket and reload snapshots using the real routes', async () => {
    const instance = await createSwarmServer(root, 0);
    let socket: WebSocket | undefined;
    try {
      await new Promise<void>(resolve => instance.server.listen(0, '127.0.0.1', resolve));
      const port = (instance.server.address() as any).port;
      const base = `http://127.0.0.1:${port}`;
      socket = new WebSocket(`ws://127.0.0.1:${port}/events`);
      await new Promise<void>(resolve => socket!.once('open', resolve));
      const created = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...seed, assigned_cubicle: 'Consul Ferric & Nia' }) }).then(r => r.json()) as any;
      expect(created.task.column).toBe('todo');
      const event = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Missing TASK_UPDATED')), 3000);
        socket!.on('message', data => {
          const message = JSON.parse(data.toString());
          if (message.type === 'TASK_UPDATED' && message.payload.task?.id === created.task.id) {
            clearTimeout(timer); resolve(message.payload.task);
          }
        });
      });
      const response = await fetch(`${base}/api/tasks/${created.task.id}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progress_percent: 90 }) });
      expect(response.status).toBe(200);
      const updated = (await response.json() as any).task;
      expect(updated.column).toBe('in_progress');
      expect(await event).toEqual(updated);
      const snapshot = await fetch(`${base}/api/tasks`).then(r => r.json()) as any;
      expect(snapshot.tasks.todo).toEqual([]);
      expect(snapshot.tasks.in_progress).toContainEqual(updated);
      await board.initialize();
      expect(board.getTask(updated.id)).toEqual(updated);
    } finally {
      socket?.terminate();
      await instance.close();
    }
  }, 15000);
});
