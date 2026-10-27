/**
 * src/openrig-port/index.ts
 *
 * Unified OpenRig Runtime Hub for the Symlinked Agent Swarm Panopticon.
 * Integrates all 6 OpenRig baseline subsystems directly into the live server:
 * 1. `SeatLifecycleEngine` (`occupantGeneration` UUID fencing, `DeliveryGuard`, 3-state liveness)
 * 2. `SeatActivityEngine` (4-rung evidence ladder, 2-tick idle debounce, cross-rung contradiction detection)
 * 3. `HealthProjectionEngine` (6 formal detectors: `process.ceremony-amplification`, `process.review-carousel`,
 *    `process.redundant-wake-storm`, `governance.stale-directive`, `governance.scope-admission-drift`, `context.pressure`)
 * 4. `OpenRigStreamClassifier` (wake-driven, lease-fenced stream classifier with `AbortController` deadlines)
 * 5. `SeatRecapStore` & `MarkdownAddress` (`RECAP.md` + `recap-superseded/` handover chain per cubicle worktree)
 * 6. `CrashCart` C3/C2/B1 (`classifyDaemonState`, `resolveDaemonState`, `RestoreConductor`, Amendment 2 live adoption)
 */

import path from 'node:path';
import fs from 'node:fs';
import { Router, Request, Response } from 'express';
import { ConsularEngine } from '../server/consular-engine.js';
import { CubicleManager } from '../server/cubicle-manager.js';
import { TaskboardManager } from '../server/taskboard-manager.js';
import { SeatLifecycleEngine } from './seat-lifecycle.js';
import { SeatActivityEngine } from './seat-activity.js';
import { HealthProjectionEngine } from './health-detectors.js';
import { OpenRigStreamClassifier } from './stream-classifier.js';
import {
  formatCubicleHandoverRecap,
  listRecapChain,
  readSeatRecap,
  writeSeatRecap,
} from './seat-recap-store.js';
import {
  aggregateFleetRollup,
  classifyDaemonState,
  FleetRollup,
  listRigsInKernelFirstOrder,
   resolveDaemonState,
  RestoreConductor,
} from './crash-cart.js';

export * from './markdown-address.js';
export * from './seat-recap-store.js';
export * from './seat-lifecycle.js';
export * from './seat-activity.js';
export * from './health-detectors.js';
export * from './stream-classifier.js';
export * from './crash-cart.js';

export interface OpenRigPortConfig {
  swarmDir: string;
  projectRoot?: string;
  openrigWorkspacePath?: string;
}

export class OpenRigRuntimeHub {
  public readonly lifecycle = new SeatLifecycleEngine();
  public readonly activity = new SeatActivityEngine();
  public readonly health = new HealthProjectionEngine();
  public readonly classifier = new OpenRigStreamClassifier();
  public readonly swarmDir: string;
  public readonly projectRoot: string;
  public readonly openrigWorkspacePath: string;
  private evidenceSeq = 0;
  private lastFleetRestoreRollup: FleetRollup | null = null;
  private fleetRestoreAttempts = new Map<
    string,
    { attemptId: string; status: 'started' | 'completed'; startedAt: string; rollup: FleetRollup | null }
  >();

  constructor(config: OpenRigPortConfig) {
    this.swarmDir = path.resolve(config.swarmDir);
    this.projectRoot = path.resolve(config.projectRoot ?? path.dirname(this.swarmDir));
    this.openrigWorkspacePath = path.resolve(
      config.openrigWorkspacePath ??
        path.join(path.dirname(this.projectRoot), 'openrig_panopticon')
    );

    // Declare initial seats for Consuls and 16 Cubicles
    this.activity.declareSeat('consul-1');
    this.activity.declareSeat('consul-2');
    for (let i = 1; i <= 16; i++) {
      const id = `cubicle-${String(i).padStart(2, '0')}`;
      this.activity.declareSeat(id);
    }
  }

  public nextSeq(): number {
    this.evidenceSeq += 1;
    return this.evidenceSeq;
  }

  /**
   * Reserves an OpenRig `occupantGeneration` for a seat (`cubicle-XX` or `consul-X`)
   * and declares its fresh evidence ladder.
   */
  public beginSeatOccupation(params: {
    seatId: string;
    runtime?: string;
    model?: string | null;
    cwd?: string;
    pid?: number | null;
  }) {
    const reserved = this.lifecycle.reserveOccupantGeneration({
      seatId: params.seatId,
      rigId: 'panopticon',
      runtime: params.runtime,
      model: params.model,
      cwd: params.cwd,
      pid: params.pid,
    });
    this.activity.declareSeat(params.seatId, reserved.occupantGeneration);
    this.reportSeatWorking(params.seatId, 'lifecycle-hooks', `${params.seatId}:spawn`);
    return reserved;
  }

  public reportSeatWorking(
    seatId: string,
    rung: 'self-report' | 'lifecycle-hooks' | 'window-sampling' = 'self-report',
    sourceId = `${seatId}:${rung}`
  ) {
    return this.activity.reportEvidence({
      seatNodeId: seatId,
      sessionName: `${seatId}@panopticon`,
      rung,
      sourceId,
      seq: this.nextSeq(),
      observedAt: new Date().toISOString(),
      activity: 'working',
    });
  }

  public reportSeatIdle(
    seatId: string,
    rung: 'self-report' | 'lifecycle-hooks' | 'window-sampling' = 'lifecycle-hooks',
    sourceId = `${seatId}:${rung}`
  ) {
    return this.activity.reportEvidence({
      seatNodeId: seatId,
      sessionName: `${seatId}@panopticon`,
      rung,
      sourceId,
      seq: this.nextSeq(),
      observedAt: new Date().toISOString(),
      activity: 'idle-at-prompt',
    });
  }

  public writeCubicleRecap(params: {
    cubicleId: string;
    worktreePath: string;
    occupantGeneration: string;
    taskId: string;
    taskTitle: string;
    verificationPassed: boolean;
    filesChanged: string[];
    summary: string;
  }): { recapPath: string; chainLength: number } {
    const content = formatCubicleHandoverRecap(params);
    writeSeatRecap({ seatDir: params.worktreePath, content });
    const chain = listRecapChain(params.worktreePath);
    return {
      recapPath: path.join(params.worktreePath, 'RECAP.md'),
      chainLength: chain.length,
    };
  }

  /**
   * Synchronizes live telemetry from CubicleManager & TaskboardManager into OpenRig's
   * HealthProjectionEngine and SeatActivityEngine.
   */
  public syncFromSwarm(cubicleManager: CubicleManager, taskboardManager: TaskboardManager): void {
    for (const cub of cubicleManager.getAllCubicles()) {
      const usedTokens = cub.config.quota?.tokens_used ?? 0;
      const maxTokens = cub.config.quota?.max_tokens ?? 1_000_000;
      this.health.recordSeatContextUsage({
        seatId: cub.id,
        usedTokens,
        maxTokens,
      });

      const currentActivity = this.activity.getSeatState(cub.id);
      if (cub.status === 'working' && currentActivity?.activity !== 'working') {
        this.reportSeatWorking(cub.id, 'window-sampling', `${cub.id}:cubicle-status`);
      } else if (cub.status === 'idle' && currentActivity?.activity === 'working') {
        // Feed 2 ticks so idle debounce settles cleanly when cubicle transitions to idle
        this.reportSeatIdle(cub.id, 'window-sampling', `${cub.id}:cubicle-status`);
        this.reportSeatIdle(cub.id, 'lifecycle-hooks', `${cub.id}:cubicle-status`);
      }
    }

    for (const task of taskboardManager.getAllTasks()) {
      const vetoCount = Array.isArray(task.veto_history) ? task.veto_history.length : 0;
      if (vetoCount > 0) {
        const hasDiffChanges = Boolean(task.git_diff_summary && task.git_diff_summary.filesChanged > 0);
        this.health.recordTaskReviewLineage({
          taskId: task.id,
          vetoCount,
          hasDiffChanges,
        });
      }
    }
  }

  /**
   * Runs OpenRig Amendment 2 Live Adoption & Fleet Restore across all enabled cubicles.
   */
  public async runCrashCartFleetRestore(
    cubicleManager: CubicleManager,
    taskboardManager: TaskboardManager
  ): Promise<FleetRollup> {
    const conductor = new RestoreConductor({
      listRigsInOrder: () =>
        listRigsInKernelFirstOrder({
          listRigs: () => [
            { id: 'kernel-consuls', name: 'kernel' },
            { id: 'panopticon-cubicles', name: 'panopticon-cubicles' },
          ],
        }),
      restoreRig: async (rigId) => {
        if (rigId === 'kernel-consuls') {
          this.reportSeatIdle('consul-1', 'lifecycle-hooks', 'crash-cart:adopt');
          this.reportSeatIdle('consul-2', 'lifecycle-hooks', 'crash-cart:adopt');
          return {
            outcome: 'fully_restored',
            receiptRef: `adopt-${Date.now()}`,
            attention: [],
          };
        }

        // Amendment 2 Live Adoption: inspect cubicle seats and reconcile any live PIDs
        const enabledCubicles = cubicleManager.getAllCubicles().filter((c) => c.config.enabled);
        for (const cub of enabledCubicles) {
          const seat = this.lifecycle.getSeat(cub.id);
          if (seat && seat.pid) {
            const liveness = this.lifecycle.probeLiveness(cub.id);
            if (liveness === 'present') {
              this.reportSeatWorking(cub.id, 'lifecycle-hooks', 'crash-cart:reconcile-live');
              continue;
            }
          }
          if (cub.status === 'idle') {
            this.reportSeatIdle(cub.id, 'lifecycle-hooks', 'crash-cart:ready');
          }
        }
        this.syncFromSwarm(cubicleManager, taskboardManager);
        return {
          outcome: 'fully_restored',
          receiptRef: `restore-${Date.now()}`,
          attention: [],
        };
      },
    });

    const sequence = await conductor.restoreFleet();
    const rollup = aggregateFleetRollup(sequence);
    this.lastFleetRestoreRollup = rollup;
    return rollup;
  }

  public getOverview(cubicleManager: CubicleManager, taskboardManager: TaskboardManager) {
    this.syncFromSwarm(cubicleManager, taskboardManager);
    const worktreesDir = path.join(this.projectRoot, 'worktrees');
    const recaps: Array<{ seatId: string; exists: boolean; chainLength: number }> = [];
    for (let i = 1; i <= 16; i++) {
      const seatId = `cubicle-${String(i).padStart(2, '0')}`;
      const wtPath = path.join(worktreesDir, seatId);
      if (fs.existsSync(wtPath)) {
        const r = readSeatRecap(wtPath);
        if (r.exists || r.chain.length > 0) {
          recaps.push({ seatId, exists: r.exists, chainLength: r.chain.length });
        }
      }
    }

    return {
      engine: 'openrig-panopticon-v1',
      openrigWorkspacePath: this.openrigWorkspacePath,
      openrigWorkspacePresent: fs.existsSync(this.openrigWorkspacePath),
      subsystems: {
        seatLifecycle: {
          active: true,
          trackedSeats: this.lifecycle.getAllSeats().length,
          seats: this.lifecycle.getAllSeats(),
        },
        seatActivity: {
          active: true,
          rungs: ['self-report', 'lifecycle-hooks', 'needs-input-chrome', 'window-sampling'],
          seats: this.activity.getAllSeatStates(),
          rungHealthEvents: this.activity.getRungHealthEvents(),
        },
        healthDetectors: this.health.project(),
        streamClassifier: this.classifier.getStatus(),
        seatRecapStore: {
          active: true,
          recaps,
        },
        crashCart: {
          active: true,
          daemonState: 'up' as const,
          lastFleetRestoreRollup: this.lastFleetRestoreRollup,
        },
      },
    };
  }
}

export function createOpenRigRouter(
  hub: OpenRigRuntimeHub,
  cubicleManager: CubicleManager,
  taskboardManager: TaskboardManager
): Router {
  const router = Router();

  router.get('/openrig/status', (_req: Request, res: Response) => {
    res.json(hub.getOverview(cubicleManager, taskboardManager));
  });

  router.get('/openrig/seats', (_req: Request, res: Response) => {
    hub.syncFromSwarm(cubicleManager, taskboardManager);
    res.json({
      occupants: hub.lifecycle.getAllSeats(),
      activity: hub.activity.getAllSeatStates(),
    });
  });

  router.get('/openrig/activity', (_req: Request, res: Response) => {
    hub.syncFromSwarm(cubicleManager, taskboardManager);
    res.json({
      seats: hub.activity.getAllSeatStates(),
      rungHealthEvents: hub.activity.getRungHealthEvents(),
    });
  });

  router.get('/openrig/health', (req: Request, res: Response) => {
    hub.syncFromSwarm(cubicleManager, taskboardManager);
    const limit = Number(req.query.limit) || 50;
    res.json(hub.health.project(limit));
  });

  router.get('/openrig/recap/:seatId', (req: Request, res: Response) => {
    const seatId = String(req.params.seatId);
    const section = typeof req.query.section === 'string' ? req.query.section : undefined;
    const wtPath = path.join(hub.projectRoot, 'worktrees', seatId);
    try {
      const recap = readSeatRecap(wtPath, section);
      res.json({ seatId, worktreePath: wtPath, ...recap });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/openrig/recap/:seatId', (req: Request, res: Response) => {
    const seatId = String(req.params.seatId);
    const content = String(req.body?.content || '');
    const wtPath = path.join(hub.projectRoot, 'worktrees', seatId);
    try {
      writeSeatRecap({ seatDir: wtPath, content });
      res.json({
        ok: true,
        seatId,
        chainLength: listRecapChain(wtPath).length,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/openrig/stream-classifier', (_req: Request, res: Response) => {
    res.json(hub.classifier.getStatus());
  });

  router.post('/openrig/stream-classifier/wake', async (_req: Request, res: Response) => {
    const wakeResult = await hub.classifier.wake();
    res.json(wakeResult);
  });

  // Crash-Cart C3: 3-state daemon detector
  router.get('/crash-cart/detect', async (_req: Request, res: Response) => {
    const state = await resolveDaemonState({
      openrigHome: hub.swarmDir,
      readDaemonJson: () => ({ pid: process.pid, port: 3820, host: '127.0.0.1' }),
      isProcessAlive: (pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      },
      probeHealthz: async () => 'answered',
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
    res.json({ state, pid: process.pid, timestamp: new Date().toISOString() });
  });

  // Crash-Cart C2: Discovery snapshot
  router.get('/crash-cart/discovery', async (_req: Request, res: Response) => {
    const cubicles = cubicleManager.getAllCubicles();
    const tasks = await taskboardManager.listAllTasks();
    res.json({
      header: {
        inspectedAt: new Date().toISOString(),
        daemonPid: process.pid,
      },
      foundOnHost: {
        seatCount: cubicles.length,
        runningCount: cubicles.filter((c) => c.status === 'working').length,
        resumableCount: cubicles.filter((c) => c.config.enabled).length,
      },
      whereWorkStopped: tasks.in_progress.map((t) => ({
        qitemId: t.id,
        title: t.title,
        assignedSeat: t.assigned_cubicle,
        progressPercent: t.progress_percent,
      })),
    });
  });

  // Crash-Cart B1: On-Commit HTTP 202 Fleet Restore Conductor
  router.post('/crash-cart/restore-fleet', async (_req: Request, res: Response) => {
    const rollup = await hub.runCrashCartFleetRestore(cubicleManager, taskboardManager);
    res.status(202).json({
      fleetAttemptId: `fleet-${Date.now()}`,
      status: 'started',
      rollup,
    });
  });

  return router;
}

export class OpenRigPanopticonBridge {
  public readonly hub: OpenRigRuntimeHub;
  private consularEngine: ConsularEngine;
  private cubicleManager: CubicleManager;
  private taskboardManager: TaskboardManager;

  constructor(
    config: OpenRigPortConfig,
    consularEngine: ConsularEngine,
    cubicleManager: CubicleManager,
    taskboardManager: TaskboardManager
  ) {
    this.hub = new OpenRigRuntimeHub(config);
    this.consularEngine = consularEngine;
    this.cubicleManager = cubicleManager;
    this.taskboardManager = taskboardManager;
  }

  public async getBridgeSnapshot() {
    const tasks = await this.taskboardManager.listAllTasks();
    const cubicles = this.cubicleManager.getAllCubicles();
    const consuls = this.consularEngine.getConsuls();
    const overview = this.hub.getOverview(this.cubicleManager, this.taskboardManager);

    return {
      governanceMode: 'ROMAN_DUAL_CONSUL' as const,
      consuls: consuls.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        model: c.model,
      })),
      cubicles: {
        total: cubicles.length,
        enabled: cubicles.filter((c) => c.config.enabled).length,
        working: cubicles.filter((c) => c.status === 'working').length,
        idle: cubicles.filter((c) => c.status === 'idle').length,
      },
      tasks: {
        todo: tasks.todo.length,
        in_progress: tasks.in_progress.length,
        review: tasks.review.length,
        done: tasks.done.length,
      },
      openrigWorkspacePath: this.hub.openrigWorkspacePath,
      openrigSubsystems: overview.subsystems,
      timestamp: new Date().toISOString(),
    };
  }
}
