/**
 * src/server/progress-updates.ts
 *
 * Server-Owned Activity Reconciler & Proactive Progress Update Scheduler.
 * Reconciles actual worker cubicle state against Kanban task columns (Working, Review,
 * Stalled/Orphaned, Idle) and broadcasts deduplicated SWARM_ACTIVITY_HEARTBEAT telemetry
 * and optional concise Consular progress updates without requiring an Overseer prompt.
 */

import { ConsularEngine } from './consular-engine.js';
import { TaskboardManager } from './taskboard-manager.js';
import { CubicleManager } from './cubicle-manager.js';

export type SwarmActivityState = 'working' | 'review' | 'stalled' | 'idle';

export interface SwarmActivitySnapshot {
  state: SwarmActivityState;
  workingCubicles: Array<{
    id: string;
    displayName: string;
    taskId: string | null;
    taskTitle: string | null;
    latestThought: string;
    lastHeartbeat: string | null;
  }>;
  inProgressCount: number;
  reviewCount: number;
  todoCount: number;
  doneCount: number;
  orphanedTasks: Array<{
    id: string;
    title: string;
    assignedCubicle: string | null;
    reason: string;
  }>;
  lastActivityAt: string | null;
  summary: string;
  signature: string;
  timestamp: string;
}

export interface ProgressUpdaterOptions {
  intervalMs?: number;
  periodicReportIntervalMs?: number;
  emitDialogueOnTransitions?: boolean;
  emitDialogueOnStalled?: boolean;
  enabledInTest?: boolean;
}

export class ConsularProgressUpdater {
  private consularEngine: ConsularEngine;
  private taskboardManager: TaskboardManager;
  private cubicleManager: CubicleManager;
  private broadcast: (type: string, payload: any) => void;
  private options: Required<ProgressUpdaterOptions>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastSignature: string | null = null;
  private lastDialogueSignature: string | null = null;
  private lastDialogueAtMs: number;
  private lastSnapshot: SwarmActivitySnapshot | null = null;

  constructor(
    consularEngine: ConsularEngine,
    taskboardManager: TaskboardManager,
    cubicleManager: CubicleManager,
    broadcast: (type: string, payload: any) => void,
    options: ProgressUpdaterOptions = {},
    initialNowMs: number = Date.now()
  ) {
    this.consularEngine = consularEngine;
    this.taskboardManager = taskboardManager;
    this.cubicleManager = cubicleManager;
    this.broadcast = broadcast;
    this.lastDialogueAtMs = initialNowMs;
    this.options = {
      intervalMs: options.intervalMs ?? 15000,
      periodicReportIntervalMs: options.periodicReportIntervalMs ?? 10 * 60 * 1000,
      emitDialogueOnTransitions: options.emitDialogueOnTransitions ?? true,
      emitDialogueOnStalled: options.emitDialogueOnStalled ?? true,
      enabledInTest: options.enabledInTest ?? false,
    };
  }

  public hasOutstandingWork(snapshot: SwarmActivitySnapshot): boolean {
    return (
      snapshot.workingCubicles.length > 0 ||
      snapshot.inProgressCount > 0 ||
      snapshot.reviewCount > 0 ||
      snapshot.todoCount > 0
    );
  }

  public formatConsoleProgressReport(snapshot: SwarmActivitySnapshot): string {
    let raw = '';
    if (snapshot.state === 'working') {
      if (snapshot.workingCubicles.length > 0) {
        raw = `Progress report: ${snapshot.workingCubicles.length} active cubicle(s) are executing ${snapshot.inProgressCount} in-progress task(s), with ${snapshot.reviewCount} in review and ${snapshot.doneCount} completed on the Kanban board.`;
      } else {
        raw = `Progress report: Consular work continues on ${snapshot.inProgressCount} in-progress task(s), with ${snapshot.reviewCount} in review and ${snapshot.doneCount} completed on the Kanban board.`;
      }
    } else if (snapshot.state === 'review') {
      raw = `Progress report: ${snapshot.reviewCount} item(s) are awaiting Gate 2 Consular inspection, with ${snapshot.inProgressCount} in progress and ${snapshot.doneCount} completed on the Kanban board.`;
    } else if (snapshot.state === 'stalled') {
      raw = `Progress report: ${snapshot.orphanedTasks.length} in-progress item(s) are currently stalled without an active worker process, while ${snapshot.todoCount} remain queued and ${snapshot.doneCount} are completed.`;
    } else if (snapshot.todoCount > 0) {
      raw = `Progress report: all worker cubicles are currently idle with ${snapshot.todoCount} item(s) queued in Todo and ${snapshot.doneCount} completed on the Kanban board.`;
    } else {
      raw = `Progress report: all ${snapshot.doneCount} task(s) are completed and the swarm is standing by.`;
    }

    const cleaned = raw
      .replace(/`/g, '')
      .replace(/file:\/\/\S+/gi, '')
      .replace(/\btask-[a-z0-9-]+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned.split(/\s+/);
    return words.length > 34 ? `${words.slice(0, 34).join(' ')}.` : cleaned;
  }

  public async computeSnapshot(): Promise<SwarmActivitySnapshot> {
    const cubicles = this.cubicleManager.getAllCubicles();
    const allTasks = await this.taskboardManager.listAllTasks();
    const tasksById = new Map<string, any>();
    for (const t of [...allTasks.todo, ...allTasks.in_progress, ...allTasks.review, ...allTasks.done]) {
      tasksById.set(t.id, t);
    }

    const genericThoughts = new Set([
      'Standing by.',
      'Slot unassigned.',
      'Slot vacant.',
      'Initialized. Standing by for instructions.',
    ]);

    const workingCubicles = cubicles
      .filter((c: any) => c.config?.enabled && (c.status === 'working' || c.status === 'under_inspection'))
      .map((c: any) => {
        const matchedTask =
          (c.current_task_id && tasksById.get(c.current_task_id)) ||
          allTasks.in_progress.find((t: any) => t.assigned_cubicle === c.id) ||
          allTasks.review.find((t: any) => t.assigned_cubicle === c.id) ||
          null;
        const stream = Array.isArray(c.thought_stream) ? c.thought_stream : [];
        const lastEntry = stream.length > 0 ? stream[stream.length - 1] : null;
        const rawThought = String(lastEntry?.text || c.surface_thoughts || '').trim();
        return {
          id: String(c.id),
          displayName: String(c.config?.display_name || c.id),
          taskId: matchedTask?.id || c.current_task_id || null,
          taskTitle: matchedTask?.title || null,
          latestThought: genericThoughts.has(rawThought) ? '' : rawThought,
          lastHeartbeat: lastEntry?.timestamp || c.last_heartbeat || null,
        };
      });

    const orphanEval = this.consularEngine.evaluateOrphanedInProgressTasks(allTasks.in_progress, cubicles);
    const orphanedTasks = orphanEval.orphans.map((o) => ({
      id: o.id,
      title: o.title,
      assignedCubicle: o.assigned_cubicle,
      reason: o.reason,
    }));

    // Compute latest real activity timestamp across cubicles and tasks
    let latestMs = 0;
    for (const c of cubicles) {
      const stream = Array.isArray((c as any).thought_stream) ? (c as any).thought_stream : [];
      const lastEntry = stream.length > 0 ? stream[stream.length - 1] : null;
      for (const candidate of [lastEntry?.timestamp, (c as any).last_heartbeat]) {
        if (candidate) {
          const ms = Date.parse(String(candidate));
          if (!Number.isNaN(ms) && ms > latestMs) latestMs = ms;
        }
      }
    }
    for (const t of [...allTasks.in_progress, ...allTasks.review, ...allTasks.done]) {
      for (const candidate of [t.completed_at, t.claimed_at, t.created_at]) {
        if (candidate) {
          const ms = Date.parse(String(candidate));
          if (!Number.isNaN(ms) && ms > latestMs) latestMs = ms;
        }
      }
    }

    let state: SwarmActivityState = 'idle';
    if (workingCubicles.some((wc) => cubicles.find((c) => c.id === wc.id)?.status === 'working')) {
      state = 'working';
    } else if (allTasks.review.length > 0 || workingCubicles.length > 0) {
      state = 'review';
    } else if (allTasks.in_progress.length > 0 && orphanedTasks.length > 0) {
      state = 'stalled';
    } else if (allTasks.in_progress.length > 0) {
      state = 'working';
    } else {
      state = 'idle';
    }

    let summary = '';
    if (state === 'working') {
      if (workingCubicles.length > 0) {
        const activeList = workingCubicles
          .slice(0, 2)
          .map((w) => {
            const label = w.taskTitle ? `${w.id} on "${w.taskTitle}"` : w.id;
            return w.latestThought ? `${label} (${w.latestThought.slice(0, 90)})` : label;
          })
          .join(' · ');
        summary = `Active work in progress: ${activeList}`;
      } else {
        const titles = allTasks.in_progress.slice(0, 2).map((t: any) => `"${t.title}"`).join(', ');
        summary = `Consular work in progress on ${titles}.`;
      }
    } else if (state === 'review') {
      const titles = allTasks.review.slice(0, 2).map((t: any) => `"${t.title}"`).join(', ');
      summary = `Awaiting Gate 2 Consular inspection for ${allTasks.review.length} task(s)${titles ? `: ${titles}` : ''}.`;
    } else if (state === 'stalled') {
      const titles = orphanedTasks.slice(0, 2).map((o) => `"${o.title}"`).join(', ');
      summary = `${orphanedTasks.length} in-progress task(s) have no active worker process (${titles}). Ready to resume or redispatch.`;
    } else {
      if (allTasks.todo.length > 0) {
        summary = `No workers currently running. ${allTasks.todo.length} task(s) queued in Todo and ${allTasks.done.length} completed.`;
      } else {
        summary = `Swarm idle. All ${allTasks.done.length} task(s) completed; standing by for Overseer directives.`;
      }
    }

    const signature = [
      state,
      workingCubicles.map((w) => `${w.id}:${w.taskId || ''}:${w.latestThought.slice(0, 40)}`).join('|'),
      `in_prog=${allTasks.in_progress.length}`,
      `orphans=${orphanedTasks.map((o) => o.id).join(',')}`,
      `review=${allTasks.review.length}`,
      `todo=${allTasks.todo.length}`,
      `done=${allTasks.done.length}`,
    ].join('::');

    const snapshot: SwarmActivitySnapshot = {
      state,
      workingCubicles,
      inProgressCount: allTasks.in_progress.length,
      reviewCount: allTasks.review.length,
      todoCount: allTasks.todo.length,
      doneCount: allTasks.done.length,
      orphanedTasks,
      lastActivityAt: latestMs > 0 ? new Date(latestMs).toISOString() : null,
      summary,
      signature,
      timestamp: new Date().toISOString(),
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  public async tick(forceBroadcast = false, nowMs = Date.now()): Promise<SwarmActivitySnapshot | null> {
    if (this.running) return this.lastSnapshot;
    this.running = true;
    try {
      const snapshot = await this.computeSnapshot();
      const changed = snapshot.signature !== this.lastSignature;

      if (changed || forceBroadcast || snapshot.state === 'working') {
        this.lastSignature = snapshot.signature;
        this.broadcast('SWARM_ACTIVITY_HEARTBEAT', snapshot);
      }

      const reportText = this.formatConsoleProgressReport(snapshot);
      const dialogueSignature = [
        snapshot.state,
        `working=${snapshot.workingCubicles.length}`,
        `in_prog=${snapshot.inProgressCount}`,
        `orphans=${snapshot.orphanedTasks.length}`,
        `review=${snapshot.reviewCount}`,
        `todo=${snapshot.todoCount}`,
        `done=${snapshot.doneCount}`,
        reportText,
      ].join('::');

      const transitionDue =
        changed &&
        dialogueSignature !== this.lastDialogueSignature &&
        ((this.options.emitDialogueOnTransitions && (snapshot.state === 'working' || snapshot.state === 'review')) ||
          (this.options.emitDialogueOnStalled && snapshot.state === 'stalled'));

      const periodicDue =
        this.options.periodicReportIntervalMs > 0 &&
        nowMs - this.lastDialogueAtMs >= this.options.periodicReportIntervalMs &&
        this.hasOutstandingWork(snapshot);

      if (transitionDue || periodicDue) {
        this.lastDialogueSignature = dialogueSignature;
        this.lastDialogueAtMs = nowMs;
        await this.consularEngine.recordDialogue(
          'Consul Nia Nova',
          'rebellious_champion',
          reportText,
          'USER_CHAT'
        );
      }

      return snapshot;
    } finally {
      this.running = false;
    }
  }

  public start(): void {
    if (process.env.VITEST && !this.options.enabledInTest) {
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick(false).catch(() => {});
    }, this.options.intervalMs);
    if (typeof (this.timer as any).unref === 'function') {
      (this.timer as any).unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getLastSnapshot(): SwarmActivitySnapshot | null {
    return this.lastSnapshot;
  }
}

export function startConsularProgressUpdates(
  consularEngine: ConsularEngine,
  taskboardManager: TaskboardManager,
  cubicleManager: CubicleManager,
  broadcast: (type: string, payload: any) => void,
  options?: ProgressUpdaterOptions
): ConsularProgressUpdater {
  const updater = new ConsularProgressUpdater(
    consularEngine,
    taskboardManager,
    cubicleManager,
    broadcast,
    options
  );
  updater.start();
  return updater;
}
