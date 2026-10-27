/**
 * src/openrig-port/seat-lifecycle.ts
 *
 * Ported from OpenRig (`packages/daemon/src/domain/seat-lifecycle-service.ts`,
 * `node-launcher.ts`, `startup-orchestrator.ts`, and `delivery-guard.ts`).
 *
 * Provides:
 * 1. Occupant Generation UUID Fencing (`reserveOccupantGeneration`, `verifyGeneration`)
 * 2. Exclusive Per-Seat Lifecycle Serialization (`DeliveryGuard`)
 * 3. 3-State Classified Liveness Probing (`'present' | 'absent' | 'transport_unavailable'`)
 * 4. 10-Stage Non-Blocking Startup State Machine (`StartupPhase`)
 */

import { randomUUID } from 'node:crypto';

export type LivenessClassification = 'present' | 'absent' | 'transport_unavailable';

export type StartupPhase =
  | 'pending'
  | 'project'
  | 'pre_launch_files'
  | 'launch_harness'
  | 'check_ready'
  | 'post_launch_files'
  | 'after_files'
  | 'after_ready'
  | 'ready'
  | 'failed';

export class SeatLifecycleError extends Error {
  constructor(
    public readonly code: 'transport_unavailable' | 'generation_mismatch' | 'seat_not_found' | 'startup_failed',
    message: string
  ) {
    super(message);
    this.name = 'SeatLifecycleError';
  }
}

export interface SeatOccupantRecord {
  seatId: string;
  rigId: string;
  occupantGeneration: string;
  sessionId: string | null;
  pid: number | null;
  runtime: string;
  model: string | null;
  cwd: string;
  status: 'running' | 'stopped' | 'unverified';
  startupPhase: StartupPhase;
  launchedAt: string;
  updatedAt: string;
}

/**
 * Exclusive per-seat lock manager (`DeliveryGuard`) preventing message delivery,
 * watchdog wakes, and lifecycle restarts from colliding on the same seat.
 */
export class DeliveryGuard {
  private readonly queues = new Map<string, Promise<void>>();

  public async lifecycle<T>(seatIds: readonly string[], fn: () => Promise<T>): Promise<T> {
    const sorted = [...new Set(seatIds)].sort();
    const releases: Array<() => void> = [];

    for (const seatId of sorted) {
      const prev = this.queues.get(seatId) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      this.queues.set(
        seatId,
        prev.then(() => next)
      );
      await prev;
      releases.push(release);
    }

    try {
      return await fn();
    } finally {
      for (const release of releases.reverse()) {
        release();
      }
    }
  }
}

export class SeatLifecycleEngine {
  private readonly seats = new Map<string, SeatOccupantRecord>();
  public readonly deliveryGuard = new DeliveryGuard();

  /**
   * Reserves a fresh `occupantGeneration` UUID before launching a seat session
   * and returns the OpenRig environment variables to inject into the harness.
   */
  public reserveOccupantGeneration(params: {
    seatId: string;
    rigId?: string;
    runtime?: string;
    model?: string | null;
    cwd?: string;
    pid?: number | null;
  }): {
    occupantGeneration: string;
    sessionId: string;
    env: Record<string, string>;
    record: SeatOccupantRecord;
  } {
    const occupantGeneration = randomUUID();
    const rigId = params.rigId ?? 'panopticon';
    const sessionId = `session-${params.seatId}-${occupantGeneration.slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: SeatOccupantRecord = {
      seatId: params.seatId,
      rigId,
      occupantGeneration,
      sessionId,
      pid: params.pid ?? null,
      runtime: params.runtime ?? 'codex',
      model: params.model ?? null,
      cwd: params.cwd ?? process.cwd(),
      status: 'running',
      startupPhase: 'ready',
      launchedAt: now,
      updatedAt: now,
    };

    this.seats.set(params.seatId, record);

    const env: Record<string, string> = {
      OPENRIG_OCCUPANT_GENERATION: occupantGeneration,
      OPENRIG_RIG: rigId,
      OPENRIG_SEAT: params.seatId,
      OPENRIG_HARNESS: record.runtime,
      OPENRIG_SESSION_ID: sessionId,
    };

    return { occupantGeneration, sessionId, env, record };
  }

  public bindPid(seatId: string, occupantGeneration: string, pid: number | null): boolean {
    const seat = this.seats.get(seatId);
    if (!seat || seat.occupantGeneration !== occupantGeneration) return false;
    seat.pid = pid;
    seat.updatedAt = new Date().toISOString();
    return true;
  }

  public advanceStartupPhase(seatId: string, occupantGeneration: string, phase: StartupPhase): boolean {
    const seat = this.seats.get(seatId);
    if (!seat || seat.occupantGeneration !== occupantGeneration) return false;
    seat.startupPhase = phase;
    seat.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Verifies that a completion callback, watchdog reminder, or state transition
   * belongs to the currently active `occupantGeneration`.
   */
  public verifyGeneration(seatId: string, targetGeneration: string): boolean {
    const seat = this.seats.get(seatId);
    if (!seat) return false;
    return seat.occupantGeneration === targetGeneration;
  }

  /**
   * 3-state Liveness Classification (`'present' | 'absent' | 'transport_unavailable'`).
   * Critical OpenRig invariant: `'transport_unavailable'` NEVER mutates seat state to `'stopped'`.
   */
  public probeLiveness(
    seatId: string,
    customProbe?: (pid: number) => LivenessClassification
  ): LivenessClassification {
    const seat = this.seats.get(seatId);
    if (!seat || seat.status === 'stopped') return 'absent';
    if (!seat.pid) {
      return seat.status === 'running' ? 'present' : 'absent';
    }
    if (customProbe) {
      const verdict = customProbe(seat.pid);
      if (verdict === 'absent') {
        seat.status = 'stopped';
        seat.updatedAt = new Date().toISOString();
      } else if (verdict === 'transport_unavailable') {
        // Never mutate to stopped on transport_unavailable!
        seat.status = 'unverified';
        seat.updatedAt = new Date().toISOString();
      }
      return verdict;
    }
    try {
      process.kill(seat.pid, 0);
      return 'present';
    } catch (err: any) {
      if (err?.code === 'ESRCH') {
        seat.status = 'stopped';
        seat.updatedAt = new Date().toISOString();
        return 'absent';
      }
      if (err?.code === 'EPERM') {
        return 'present';
      }
      seat.status = 'unverified';
      seat.updatedAt = new Date().toISOString();
      return 'transport_unavailable';
    }
  }

  public stopSeat(seatId: string, expectedGeneration?: string): boolean {
    const seat = this.seats.get(seatId);
    if (!seat) return false;
    if (expectedGeneration && seat.occupantGeneration !== expectedGeneration) {
      return false;
    }
    seat.status = 'stopped';
    seat.pid = null;
    seat.updatedAt = new Date().toISOString();
    return true;
  }

  public getSeat(seatId: string): SeatOccupantRecord | undefined {
    return this.seats.get(seatId);
  }

  public getAllSeats(): SeatOccupantRecord[] {
    return [...this.seats.values()];
  }
}
