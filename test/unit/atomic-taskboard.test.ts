/**
 * test/unit/atomic-taskboard.test.ts
 *
 * Unit tests for Lock-Free Atomic Taskboard, High-Concurrency Race Handling,
 * Task Lifecycle Columns, Progress Metrics, and TASKBOARD.md Sync (Feature 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';

describe('Feature 3: Atomic Lock-Free Taskboard & Kanban Manager', () => {
  let tempRoot: string;
  let swarmDir: string;
  let taskboardManager: TaskboardManager;

  beforeEach(async () => {
    tempRoot = path.join(os.tmpdir(), `taskboard_unit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    swarmDir = path.join(tempRoot, '.swarm');
    await fs.mkdir(swarmDir, { recursive: true });
    taskboardManager = new TaskboardManager(swarmDir);
    await taskboardManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  describe('Task Creation & Column Initialization', () => {
    it('initializes all Kanban column directories (todo, in_progress, review, done)', async () => {
      for (const col of ['todo', 'in_progress', 'review', 'done']) {
        const dirStat = await fs.stat(path.join(swarmDir, 'tasks', col));
        expect(dirStat.isDirectory()).toBe(true);
      }
    });

    it('creates a task and writes structured JSON to tasks/todo/', async () => {
      const task = await taskboardManager.createTask({
        id: 'task-test-001',
        title: 'Implement authentication middleware',
        description: 'Add JWT verification and unit tests',
        priority: 'HIGH',
      });

      expect(task.id).toBe('task-test-001');
      expect(task.column).toBe('todo');
      expect(task.assigned_cubicle).toBeNull();
      expect(task.progress_percent).toBe(0);

      const filePath = path.join(swarmDir, 'tasks', 'todo', 'task-test-001.json');
      const diskContent = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(diskContent);
      expect(parsed.id).toBe('task-test-001');
      expect(parsed.title).toBe('Implement authentication middleware');
    });
  });

  describe('High-Concurrency Atomic Task Claiming (Lock-Free Mutual Exclusion)', () => {
    it('guarantees exactly 1 winner and 0 duplicates under 16 concurrent worker claims', async () => {
      // Seed a single task in todo
      const task = await taskboardManager.createTask({
        id: 'task-contested-01',
        title: 'Contested critical bugfix',
        description: 'Single task contested by 16 cubicle workers simultaneously',
        priority: 'CRITICAL',
      });

      // 16 workers simultaneously race to claim the exact same task
      const workerIds = Array.from({ length: 16 }, (_, i) => `cubicle-${String(i + 1).padStart(2, '0')}`);

      const claimResults = await Promise.all(
        workerIds.map((workerId) => taskboardManager.claimTask(workerId, 'task-contested-01'))
      );

      // Exactly ONE claim must succeed; remaining 15 must return null
      const winners = claimResults.filter((r) => r !== null);
      const losers = claimResults.filter((r) => r === null);

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(15);

      const winningTask = winners[0]!;
      expect(winningTask.id).toBe('task-contested-01');
      expect(winningTask.column).toBe('in_progress');
      expect(winningTask.assigned_cubicle).toBeDefined();
      expect(workerIds).toContain(winningTask.assigned_cubicle);

      // Verify filesystem state: 0 files in todo, 1 file in in_progress
      const todoFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'todo'));
      const inProgressFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'in_progress'));

      expect(todoFiles.filter((f) => f.endsWith('.json'))).toHaveLength(0);
      expect(inProgressFiles.filter((f) => f.endsWith('.json'))).toHaveLength(1);
      expect(inProgressFiles).toContain('task-contested-01.json');
    });

    it('returns null gracefully when claiming from an empty todo queue', async () => {
      const claimResult = await taskboardManager.claimTask('cubicle-01');
      expect(claimResult).toBeNull();
    });
  });

  describe('Task Progress Updates & Diff Telemetry', () => {
    it('updates progress percentage and diff summary on in_progress task', async () => {
      await taskboardManager.createTask({
        id: 'task-progress-01',
        title: 'Progress tracking test',
        description: 'Track ongoing execution',
        priority: 'MEDIUM',
      });

      await taskboardManager.claimTask('cubicle-01', 'task-progress-01');

      const updated = await taskboardManager.updateTaskProgress('task-progress-01', {
        progress_percent: 65,
        subswarm_active: true,
        git_diff_summary: { filesChanged: 3, insertions: 42, deletions: 12 },
      });

      expect(updated.progress_percent).toBe(65);
      expect(updated.subswarm_active).toBe(true);
      expect(updated.git_diff_summary?.filesChanged).toBe(3);
    });
  });

  describe('Consular Review & Unanimous Consensus Workflow', () => {
    it('atomically moves task from in_progress to review upon submission', async () => {
      await taskboardManager.createTask({
        id: 'task-review-01',
        title: 'Ready for review',
        description: 'Code completed',
        priority: 'HIGH',
      });
      await taskboardManager.claimTask('cubicle-02', 'task-review-01');

      const inReview = await taskboardManager.submitForReview('task-review-01', {
        diffSummary: { filesChanged: 2, insertions: 15, deletions: 5 },
        verificationPassed: true,
      });

      expect(inReview.column).toBe('review');
      expect(inReview.progress_percent).toBe(95);

      const reviewFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'review'));
      expect(reviewFiles).toContain('task-review-01.json');
    });

    it('handles Consular Veto: atomically rolls task back to in_progress with recorded rationale', async () => {
      await taskboardManager.createTask({
        id: 'task-veto-01',
        title: 'Task facing veto',
        description: 'Contains a style issue',
        priority: 'HIGH',
      });
      await taskboardManager.claimTask('cubicle-01', 'task-veto-01');
      await taskboardManager.submitForReview('task-veto-01');

      const revised = await taskboardManager.returnToRevision('task-veto-01', {
        consul: 'Consul II',
        rationale: 'Missing error boundary unit tests in authentication module.',
        returnToTodo: false,
      });

      expect(revised.column).toBe('in_progress');
      expect(revised.veto_history).toHaveLength(1);
      expect(revised.veto_history[0].consul).toBe('Consul II');
      expect(revised.veto_history[0].rationale).toContain('Missing error boundary');

      const inProgressFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'in_progress'));
      expect(inProgressFiles).toContain('task-veto-01.json');
    });

    it('completes task upon unanimous consensus: atomically moves from review to done', async () => {
      await taskboardManager.createTask({
        id: 'task-done-01',
        title: 'Unanimously approved feature',
        description: 'Both Consuls voted APPROVE',
        priority: 'MEDIUM',
      });
      await taskboardManager.claimTask('cubicle-01', 'task-done-01');
      await taskboardManager.submitForReview('task-done-01');

      const completed = await taskboardManager.completeTask('task-done-01');

      expect(completed.column).toBe('done');
      expect(completed.progress_percent).toBe(100);
      expect(completed.completed_at).toBeDefined();

      const doneFiles = await fs.readdir(path.join(swarmDir, 'tasks', 'done'));
      expect(doneFiles).toContain('task-done-01.json');
    });
  });

  describe('Overall Mission Progress & TASKBOARD.md Synchronization', () => {
    it('calculates weighted swarm mission progress across all columns', async () => {
      // 1 done (100%), 1 review (95%), 1 in_progress at 50%, 1 todo (0%)
      const t1 = await taskboardManager.createTask({ title: 'Task 1', description: '', priority: 'LOW' });
      const t2 = await taskboardManager.createTask({ title: 'Task 2', description: '', priority: 'LOW' });
      const t3 = await taskboardManager.createTask({ title: 'Task 3', description: '', priority: 'LOW' });
      const t4 = await taskboardManager.createTask({ title: 'Task 4', description: '', priority: 'LOW' });

      // Claim and complete t1
      await taskboardManager.claimTask('cubicle-01', t1.id);
      await taskboardManager.submitForReview(t1.id);
      await taskboardManager.completeTask(t1.id);

      // Claim and submit t2 to review
      await taskboardManager.claimTask('cubicle-02', t2.id);
      await taskboardManager.submitForReview(t2.id);

      // Claim t3 and set progress 50%
      await taskboardManager.claimTask('cubicle-03', t3.id);
      await taskboardManager.updateTaskProgress(t3.id, { progress_percent: 50 });

      // t4 remains in todo (0%)

      const progress = await taskboardManager.calculateOverallProgress();
      expect(progress.total).toBe(4);
      expect(progress.done).toBe(1);
      expect(progress.review).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.todo).toBe(1);

      // Expected calculation: (100 + 95 + 50 + 0) / 4 = 245 / 4 = 61%
      expect(progress.percentage).toBe(61);
    });

    it('generates and synchronizes human-readable .swarm/TASKBOARD.md markdown summary', async () => {
      await taskboardManager.createTask({
        id: 'task-doc-01',
        title: 'Documentation task',
        description: 'Verify markdown generation',
        priority: 'HIGH',
      });

      const mdPath = path.join(swarmDir, 'TASKBOARD.md');
      const mdExists = await fs.stat(mdPath).then(() => true).catch(() => false);
      expect(mdExists).toBe(true);

      const content = await fs.readFile(mdPath, 'utf8');
      expect(content).toContain('# PANOPTICON SWARM TASKBOARD');
      expect(content).toContain('Overall Mission Progress');
      expect(content).toContain('To Do');
      expect(content).toContain('Documentation task');
    });
  });
});
