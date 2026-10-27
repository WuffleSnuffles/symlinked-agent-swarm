/**
 * src/server/taskboard-manager.ts
 *
 * Production Lock-Free Atomic Taskboard & Kanban Engine.
 * Implements atomic filesystem renames (tasks/todo/ -> tasks/in_progress/),
 * sub-swarm progress tracking, consular review workflow, and TASKBOARD.md sync.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export type TaskColumn = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const DONE_ARCHIVE_AFTER_MS = 10 * 60 * 1000;

// Archival is a read-time view, so restarts need no migration and records are never deleted.
export function isTaskArchived(task: SwarmTask, now = Date.now()): boolean {
  if (task.column !== 'done' || typeof task.completed_at !== 'string') return false;
  const completed = Date.parse(task.completed_at);
  return Number.isFinite(completed) && now - completed >= DONE_ARCHIVE_AFTER_MS;
}

export interface GitDiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface SwarmTask {
  /** Gate 1 write reservation; omitted means the entire repository. */
  file_scope?: string[];
  id: string; // e.g. "task-2026-0001"
  title: string;
  description: string;
  priority: TaskPriority;
  column: TaskColumn;
  assigned_cubicle: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  progress_percent: number; // 0 to 100
  subswarm_active: boolean;
  subswarm_manifest_path: string | null;
  git_branch: string | null;
  git_diff_summary: GitDiffSummary | null;
  verification_commands: string[];
  verification_passed: boolean | null;
  veto_history: Array<{ consul: string; rationale: string; timestamp: string }>;
  error_log: string | null;
}

export interface OverallMissionProgress {
  total: number;
  todo: number;
  inProgress: number;
  review: number;
  done: number;
  percentage: number;
}

export class TaskboardManager {
  private swarmDir: string;
  private tasksDir: string;
  private columns: Record<TaskColumn, string>;
  private isSyncingMarkdown: boolean = false;
  private syncPending: boolean = false;
  private taskCreatedListeners = new Set<(task: SwarmTask) => Promise<void>>();
  private taskUpdatedListeners = new Set<(task: SwarmTask) => void>();

  public onTaskUpdated(listener: (task: SwarmTask) => void): () => void {
    this.taskUpdatedListeners.add(listener);
    return () => this.taskUpdatedListeners.delete(listener);
  }

  public onTaskCreated(listener: (task: SwarmTask) => Promise<void>): () => void {
    this.taskCreatedListeners.add(listener);
    return () => this.taskCreatedListeners.delete(listener);
  }

  constructor(swarmDir: string) {
    this.swarmDir = path.resolve(swarmDir);
    this.tasksDir = path.join(this.swarmDir, 'tasks');
    this.columns = {
      todo: path.join(this.tasksDir, 'todo'),
      in_progress: path.join(this.tasksDir, 'in_progress'),
      review: path.join(this.tasksDir, 'review'),
      done: path.join(this.tasksDir, 'done'),
    };
  }

  /**
   * Initializes all required task directories under .swarm/tasks/.
   */
  public async initialize(): Promise<void> {
    for (const colPath of Object.values(this.columns)) {
      await fs.mkdir(colPath, { recursive: true });
    }
    await fs.mkdir(path.join(this.swarmDir, 'logs'), { recursive: true });
    // Repair older cards whose reported execution never moved their directory.
    for (const task of await this.listTasksByColumn('todo')) {
      if (task.progress_percent > 0 || task.subswarm_active) {
        await this.updateTaskProgress(task.id, {});
      }
    }
    await this.syncTaskboardMarkdown();
  }

  /**
   * Creates a new task and writes it to .swarm/tasks/todo/<id>.json.
   */
  public async createTask(
    params: Pick<SwarmTask, 'title' | 'description' | 'priority'> &
      Partial<Omit<SwarmTask, 'title' | 'description' | 'priority' | 'created_at' | 'claimed_at' | 'completed_at' | 'veto_history'>>
  ): Promise<SwarmTask> {
    if (params.progress_percent !== undefined && !Number.isFinite(params.progress_percent)) {
      throw new Error('progress_percent must be a finite number');
    }
    if (!params.id && params.description?.startsWith('Spawned under approved plan ')) {
      const existingTodo = await this.listTasksByColumn('todo');
      const match = existingTodo.find((t) => t.title.endsWith(params.title));
      if (match) {
        return match;
      }
    }
    const id = params.id || `task-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    let targetCol: TaskColumn = params.column || 'todo';
    if (targetCol === 'todo' && ((params.progress_percent ?? 0) > 0 || params.subswarm_active)) {
      targetCol = 'in_progress';
    }
    const assignedOwner =
      params.assigned_cubicle ??
      (params as any).assigned_to ??
      (params as any).assignee ??
      (params as any).assigned_consul ??
      (params as any).owner ??
      null;
    const task: SwarmTask = {
      ...params,
      id,
      column: targetCol,
      assigned_cubicle: assignedOwner,
      created_at: new Date().toISOString(),
      claimed_at: targetCol === 'in_progress' ? new Date().toISOString() : null,
      completed_at: targetCol === 'done' ? new Date().toISOString() : null,
      progress_percent: Math.max(0, Math.min(100, params.progress_percent ?? 0)),
      subswarm_active: params.subswarm_active ?? false,
      subswarm_manifest_path: params.subswarm_manifest_path ?? null,
      git_branch: params.git_branch ?? (assignedOwner ? `swarm/${String(assignedOwner).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}` : null),
      git_diff_summary: params.git_diff_summary ?? null,
      verification_commands: params.verification_commands || [],
      verification_passed: params.verification_passed ?? null,
      veto_history: [],
      error_log: params.error_log ?? null,
    };

    const filePath = path.join(this.columns[targetCol], `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    for (const listener of this.taskCreatedListeners) {
      try {
        await listener(task);
      } catch (error) {
        console.error('[TaskboardManager] Task creation observer failed:', error);
      }
    }
    return task;
  }

  /**
   * Atomically claims a task from todo/ to in_progress/.
   * Uses OS exclusive creation gate + atomic rename. If contested, exactly one wins; losers receive null.
   */
  public async claimTask(cubicleId: string, specificTaskId?: string): Promise<SwarmTask | null> {
    let candidates: string[] = [];

    if (specificTaskId) {
      candidates = [`${specificTaskId}.json`];
    } else {
      const files = await fs.readdir(this.columns.todo);
      candidates = files.filter((f) => f.endsWith('.json')).sort();
    }

    if (candidates.length === 0) return null;

    await fs.mkdir(path.join(this.swarmDir, 'logs'), { recursive: true }).catch(() => {});

    for (const targetFileName of candidates) {
      const src = path.join(this.columns.todo, targetFileName);
      const dst = path.join(this.columns.in_progress, targetFileName);
      const claimGate = path.join(this.swarmDir, 'logs', `.claim-${targetFileName}`);

      // Clear stale claim lock files older than 5 seconds (e.g., from interrupted FS operations)
      try {
        const stat = await fs.stat(claimGate);
        if (Date.now() - stat.mtimeMs > 5000) {
          await fs.unlink(claimGate).catch(() => {});
        }
      } catch {}

      let gateHandle: fs.FileHandle | null = null;
      try {
        // Exclusive kernel-level CREATE_NEW gate ensures at most 1 contender claims targetFileName on Windows NTFS
        gateHandle = await fs.open(claimGate, 'wx');
        await gateHandle.close();
        gateHandle = null;
      } catch (err: any) {
        if (err.code === 'EEXIST' || err.code === 'ENOENT' || err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
          continue;
        }
        throw err;
      }

      try {
        await fs.rename(src, dst);
      } catch (err: any) {
        await fs.unlink(claimGate).catch(() => {});
        if (err.code === 'ENOENT' || err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
          continue;
        }
        throw err;
      }

      // Winner enriches task payload while holding claimGate
      try {
        const raw = (await fs.readFile(dst, 'utf8')).replace(/^\uFEFF/, '');
        const task: SwarmTask = JSON.parse(raw);
        task.column = 'in_progress';
        task.assigned_cubicle = cubicleId;
        task.claimed_at = new Date().toISOString();
        task.git_branch = `swarm/${cubicleId}`;
        await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
        await fs.unlink(claimGate).catch(() => {});
        await this.syncTaskboardMarkdown();
        return task;
      } catch (err: any) {
        await fs.unlink(claimGate).catch(() => {});
        throw new Error(`Failed to enrich claimed task at '${dst}': ${err.message}`);
      }
    }

    return null;
  }

  /**
   * Updates task progress, surface thoughts, or diff telemetry on active task.
   */
  public async updateTaskProgress(
    taskId: string,
    updates: Partial<
      Pick<
        SwarmTask,
        | 'progress_percent'
        | 'subswarm_active'
        | 'subswarm_manifest_path'
        | 'git_diff_summary'
        | 'error_log'
        | 'description'
        | 'title'
        | 'assigned_cubicle'
        | 'priority'
      >
    > & { notes?: string }
  ): Promise<SwarmTask> {
    let filePath = path.join(this.columns.in_progress, `${taskId}.json`);
    if (!fsSync.existsSync(filePath)) {
      for (const colDir of [this.columns.todo, this.columns.review, this.columns.done]) {
        const candidate = path.join(colDir, `${taskId}.json`);
        if (fsSync.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }
    }
    const raw = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
    const task: SwarmTask = JSON.parse(raw);

    if (updates.progress_percent !== undefined) {
      if (!Number.isFinite(updates.progress_percent)) throw new Error('progress_percent must be a finite number');
      task.progress_percent = Math.max(0, Math.min(100, updates.progress_percent));
    }
    if (updates.subswarm_active !== undefined) task.subswarm_active = updates.subswarm_active;
    if (updates.subswarm_manifest_path !== undefined) task.subswarm_manifest_path = updates.subswarm_manifest_path;
    if (updates.git_diff_summary !== undefined) task.git_diff_summary = updates.git_diff_summary;
    if (updates.error_log !== undefined) task.error_log = updates.error_log;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.assigned_cubicle !== undefined) task.assigned_cubicle = updates.assigned_cubicle;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.notes !== undefined) (task as any).notes = updates.notes;

    if (path.dirname(filePath) === this.columns.todo && (task.progress_percent > 0 || task.subswarm_active)) {
      const destination = path.join(this.columns.in_progress, `${taskId}.json`);
      await fs.rename(filePath, destination);
      filePath = destination;
      task.column = 'in_progress';
      task.claimed_at ??= new Date().toISOString();
    }
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    for (const listener of this.taskUpdatedListeners) listener(task);
    return task;
  }

  /**
   * Atomically transitions task from in_progress/ to review/ for Consular evaluation.
   */
  public async submitForReview(
    taskId: string,
    reviewData: { diffSummary?: GitDiffSummary; verificationPassed?: boolean } = {}
  ): Promise<SwarmTask> {
    const src = path.join(this.columns.in_progress, `${taskId}.json`);
    const dst = path.join(this.columns.review, `${taskId}.json`);

    await fs.rename(src, dst);

    const raw = (await fs.readFile(dst, 'utf8')).replace(/^\uFEFF/, '');
    const task: SwarmTask = JSON.parse(raw);
    task.column = 'review';
    task.progress_percent = 95;
    if (reviewData.diffSummary) task.git_diff_summary = reviewData.diffSummary;
    if (reviewData.verificationPassed !== undefined) task.verification_passed = reviewData.verificationPassed;

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Handles Consular Veto: atomically returns task from review/ back to in_progress/ (or todo/).
   */
  public async returnToRevision(
    taskId: string,
    vetoData: { consul: string; rationale: string; returnToTodo?: boolean }
  ): Promise<SwarmTask> {
    const src = path.join(this.columns.review, `${taskId}.json`);
    const targetCol = vetoData.returnToTodo ? 'todo' : 'in_progress';
    const dst = path.join(this.columns[targetCol], `${taskId}.json`);

    await fs.rename(src, dst);
    if (vetoData.returnToTodo) {
      await fs.unlink(path.join(this.swarmDir, 'logs', `.claim-${taskId}.json`)).catch(() => {});
    }

    const raw = (await fs.readFile(dst, 'utf8')).replace(/^\uFEFF/, '');
    const task: SwarmTask = JSON.parse(raw);
    task.column = targetCol;
    task.veto_history.push({
      consul: vetoData.consul,
      rationale: vetoData.rationale,
      timestamp: new Date().toISOString(),
    });
    if (vetoData.returnToTodo) {
      task.assigned_cubicle = null;
      task.progress_percent = 0;
      task.claimed_at = null;
      task.subswarm_active = false;
    } else {
      task.progress_percent = Math.max(10, task.progress_percent - 30);
    }

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Completes task upon completion or approval: atomically moves from review/ or in_progress/ to done/.
   */
  public async completeTask(taskId: string): Promise<SwarmTask> {
    let src = path.join(this.columns.review, `${taskId}.json`);
    if (!fsSync.existsSync(src)) {
      const inProgCandidate = path.join(this.columns.in_progress, `${taskId}.json`);
      const todoCandidate = path.join(this.columns.todo, `${taskId}.json`);
      if (fsSync.existsSync(inProgCandidate)) {
        src = inProgCandidate;
      } else if (fsSync.existsSync(todoCandidate)) {
        src = todoCandidate;
      }
    }
    const dst = path.join(this.columns.done, `${taskId}.json`);

    await fs.rename(src, dst);

    const raw = (await fs.readFile(dst, 'utf8')).replace(/^\uFEFF/, '');
    const task: SwarmTask = JSON.parse(raw);
    task.column = 'done';
    task.completed_at = new Date().toISOString();
    task.progress_percent = 100;

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Releases an in_progress task back to todo/ (e.g. on crash or quota exhaustion).
   */
  public async releaseTask(taskId: string, reason: string): Promise<SwarmTask> {
    const src = path.join(this.columns.in_progress, `${taskId}.json`);
    const dst = path.join(this.columns.todo, `${taskId}.json`);

    await fs.rename(src, dst);
    await fs.unlink(path.join(this.swarmDir, 'logs', `.claim-${taskId}.json`)).catch(() => {});

    const raw = (await fs.readFile(dst, 'utf8')).replace(/^\uFEFF/, '');
    const task: SwarmTask = JSON.parse(raw);
    task.column = 'todo';
    task.assigned_cubicle = null;
    task.error_log = `Task released back to todo: ${reason}`;
    task.progress_percent = 0;
    task.claimed_at = null;
    task.subswarm_active = false;

    await fs.writeFile(dst, JSON.stringify(task, null, 2), 'utf8');
    await this.syncTaskboardMarkdown();
    return task;
  }

  /**
   * Synchronously looks up a task by ID across all columns.
   */
  public getTask(taskId: string): SwarmTask | undefined {
    for (const colDir of Object.values(this.columns)) {
      const filePath = path.join(colDir, `${taskId}.json`);
      if (fsSync.existsSync(filePath)) {
        try {
          return JSON.parse(fsSync.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
        } catch {}
      }
    }
    return undefined;
  }

  /**
   * Synchronously returns a flat array of all tasks across all columns.
   */
  public getAllTasks(): SwarmTask[] {
    const results: SwarmTask[] = [];
    for (const colDir of Object.values(this.columns)) {
      if (!fsSync.existsSync(colDir)) continue;
      for (const file of fsSync.readdirSync(colDir).filter((f) => f.endsWith('.json'))) {
        try {
          results.push(JSON.parse(fsSync.readFileSync(path.join(colDir, file), 'utf8').replace(/^\uFEFF/, '')));
        } catch {}
      }
    }
    return results;
  }

  /**
   * Retrieves all tasks in a specific column.
   */
  public async listTasksByColumn(column: TaskColumn): Promise<SwarmTask[]> {
    const colDir = this.columns[column];
    const files = await fs.readdir(colDir);
    const tasks: SwarmTask[] = [];

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = (await fs.readFile(path.join(colDir, file), 'utf8')).replace(/^\uFEFF/, '');
        tasks.push(JSON.parse(raw));
      } catch {}
    }
    return tasks;
  }

  /**
   * Lists all tasks grouped by column.
   */
  public async listAllTasks(includeArchived = false): Promise<Record<TaskColumn, SwarmTask[]>> {
    const [todo, in_progress, review, done] = await Promise.all([
      this.listTasksByColumn('todo'),
      this.listTasksByColumn('in_progress'),
      this.listTasksByColumn('review'),
      this.listTasksByColumn('done'),
    ]);
    const now = Date.now();
    return { todo, in_progress, review, done: includeArchived ? done : done.filter(task => !isTaskArchived(task, now)) };
  }

  public async searchArchivedTasks(query = ''): Promise<SwarmTask[]> {
    const now = Date.now();
    const needle = query.trim().toLowerCase();
    return (await this.listTasksByColumn('done')).filter(task =>
      isTaskArchived(task, now) && JSON.stringify(task).toLowerCase().includes(needle));
  }

  /**
   * Calculates overall mission progress metrics across the swarm.
   */
  public async calculateOverallProgress(): Promise<OverallMissionProgress> {
    const all = await this.listAllTasks(true);
    const counts = {
      todo: all.todo.length,
      inProgress: all.in_progress.length,
      review: all.review.length,
      done: all.done.length,
      total: all.todo.length + all.in_progress.length + all.review.length + all.done.length,
    };

    if (counts.total === 0) {
      return { ...counts, percentage: 0 };
    }

    let totalProgressSum = 0;
    for (const t of all.in_progress) totalProgressSum += t.progress_percent;
    totalProgressSum += counts.review * 95;
    totalProgressSum += counts.done * 100;

    const percentage = Math.round(totalProgressSum / counts.total);
    return { ...counts, percentage };
  }

  /**
   * Synchronizes human-readable .swarm/TASKBOARD.md markdown summary.
   */
  public async syncTaskboardMarkdown(): Promise<void> {
    if (this.isSyncingMarkdown) {
      this.syncPending = true;
      return;
    }

    this.isSyncingMarkdown = true;
    try {
      const all = await this.listAllTasks();
      const progress = await this.calculateOverallProgress();

      let md = `# PANOPTICON SWARM TASKBOARD\n\n`;
      md += `**Overall Mission Progress**: \`[${progress.percentage}%]\` (${progress.done}/${progress.total} tasks completed)\n\n`;
      md += `| Column | Count | Details |\n`;
      md += `|---|---|---|\n`;
      md += `| **To Do** | ${all.todo.length} | Unclaimed queue |\n`;
      md += `| **In Progress** | ${all.in_progress.length} | Actively executing |\n`;
      md += `| **Review** | ${all.review.length} | Awaiting Consular Consensus |\n`;
      md += `| **Done** | ${all.done.length} | Merged to main |\n\n`;

      md += `## 1. To Do (${all.todo.length})\n`;
      if (all.todo.length === 0) md += `*No tasks waiting.*\n\n`;
      for (const t of all.todo) {
        md += `- **[${t.priority}]** \`${t.id}\`: **${t.title}**\n`;
      }
      md += `\n`;

      md += `## 2. In Progress (${all.in_progress.length})\n`;
      if (all.in_progress.length === 0) md += `*No active tasks.*\n\n`;
      for (const t of all.in_progress) {
        const droneBadge = t.subswarm_active ? ' *(Drones Active)*' : '';
        md += `- **[${t.assigned_cubicle}]** \`${t.id}\`: **${t.title}** - \`${t.progress_percent}%\`${droneBadge}\n`;
      }
      md += `\n`;

      md += `## 3. Review (${all.review.length})\n`;
      if (all.review.length === 0) md += `*No tasks in review.*\n\n`;
      for (const t of all.review) {
        md += `- **[${t.assigned_cubicle}]** \`${t.id}\`: **${t.title}** (Branch: \`${t.git_branch}\`)\n`;
      }
      md += `\n`;

      md += `## 4. Done (${all.done.length})\n`;
      if (all.done.length === 0) md += `*No completed tasks.*\n\n`;
      for (const t of all.done) {
        md += `- \`${t.id}\`: **${t.title}** (Completed at ${t.completed_at})\n`;
      }
      md += `\n`;

      await fs.writeFile(path.join(this.swarmDir, 'TASKBOARD.md'), md, 'utf8');
    } finally {
      this.isSyncingMarkdown = false;
      if (this.syncPending) {
        this.syncPending = false;
        await this.syncTaskboardMarkdown();
      }
    }
  }
}
