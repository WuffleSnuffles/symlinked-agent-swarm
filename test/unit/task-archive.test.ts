import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import http from 'node:http';
import { TaskboardManager, isTaskArchived, DONE_ARCHIVE_AFTER_MS, type SwarmTask } from '../../src/server/taskboard-manager.js';
import { createTaskArchiveRouter, startTaskArchiveRefresh } from '../../src/server/task-archive.js';

describe('ten-minute Done archive', () => {
  let directory: string;
  let manager: TaskboardManager;
  const now = Date.parse('2026-10-26T21:00:00Z');
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'task-archive-'));
    manager = new TaskboardManager(directory);
    await manager.initialize();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function seed(id: string, column: SwarmTask['column'] = 'done', completed: any = new Date(now - DONE_ARCHIVE_AFTER_MS).toISOString()) {
    const task = await manager.createTask({ id, title: 'Searchable Needle', description: 'Preserve evidence', priority: 'HIGH', column });
    task.completed_at = arguments.length >= 3 ? arguments[2] : completed;
    await fs.writeFile(path.join(directory, 'tasks', column, id + '.json'), JSON.stringify(task));
    return task;
  }
  it('archives exactly at ten minutes, never earlier', async () => {
    const task = await seed('boundary');
    expect(isTaskArchived(task, now - 1)).toBe(false);
    expect(isTaskArchived(task, now)).toBe(true);
    expect(isTaskArchived(task, now + 1)).toBe(true);
    expect((await manager.listAllTasks()).done).toEqual([]);
  });
  it('keeps missing, invalid and future completion timestamps visible', async () => {
    for (const [i, value] of [null, undefined, '', 'invalid', 0, new Date(now + 1).toISOString()].entries()) {
      await seed('unsafe-' + i, 'done', value);
    }
    expect((await manager.listAllTasks()).done).toHaveLength(6);
    expect(await manager.searchArchivedTasks()).toEqual([]);
  });
  it('excludes active tasks even if they contain old completion timestamps', async () => {
    for (const column of ['todo', 'in_progress', 'review'] as const) await seed(column, column);
    expect(await manager.searchArchivedTasks()).toEqual([]);
    const board = await manager.listAllTasks();
    expect([board.todo.length, board.in_progress.length, board.review.length]).toEqual([1, 1, 1]);
  });
  it('preserves bytes, searchable evidence and lifetime progress across restart', async () => {
    const task = await seed('historic');
    const file = path.join(directory, 'tasks/done/historic.json');
    const before = await fs.readFile(file, 'utf8');
    manager = new TaskboardManager(directory);
    await manager.initialize();
    expect((await manager.listAllTasks()).done).toEqual([]);
    expect(await manager.searchArchivedTasks('NEEDLE')).toEqual([task]);
    expect(await manager.searchArchivedTasks('absent')).toEqual([]);
    expect(manager.getTask(task.id)).toEqual(task);
    expect(manager.getAllTasks()).toEqual([task]);
    expect((await manager.listAllTasks(true)).done).toEqual([task]);
    expect(await manager.calculateOverallProgress()).toMatchObject({ done: 1, total: 1, percentage: 100 });
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await fs.readFile(path.join(directory, 'TASKBOARD.md'), 'utf8')).not.toContain('historic');
  });
  it('applies to future completions without resetting their completion time', async () => {
    await manager.createTask({ id: 'future', title: 'Future', description: '', priority: 'LOW' });
    const completed = await manager.completeTask('future');
    vi.mocked(Date.now).mockReturnValue(Date.parse(completed.completed_at!) + DONE_ARCHIVE_AFTER_MS - 1);
    expect((await manager.listAllTasks()).done).toHaveLength(1);
    vi.mocked(Date.now).mockReturnValue(Date.parse(completed.completed_at!) + DONE_ARCHIVE_AFTER_MS);
    expect((await manager.listAllTasks()).done).toHaveLength(0);
    expect(manager.getTask('future')?.completed_at).toBe(completed.completed_at);
  });
  it('retrieves archived history through the searchable HTTP endpoint', async () => {
    await seed('http-history');
    const app = express();
    app.use('/api', createTaskArchiveRouter(manager));
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as any).port;
      const response = await fetch(`http://127.0.0.1:${port}/api/tasks/history?q=needle`);
      expect(response.status).toBe(200);
      expect((await response.json() as any).tasks[0].id).toBe('http-history');
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it('automatically broadcasts expiry once, refreshes markdown, and stops on shutdown', async () => {
    vi.useFakeTimers();
    const task = { id: 'expired' } as SwarmTask;
    const search = vi.spyOn(manager, 'searchArchivedTasks').mockResolvedValue([]);
    const sync = vi.spyOn(manager, 'syncTaskboardMarkdown').mockResolvedValue();
    const broadcast = vi.fn();
    const stop = startTaskArchiveRefresh(manager, broadcast);
    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).not.toHaveBeenCalled();
    search.mockResolvedValue([task]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenCalledWith('TASK_ARCHIVED', { count: 1 });
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(broadcast).toHaveBeenCalledTimes(1);
    stop();
    search.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});
