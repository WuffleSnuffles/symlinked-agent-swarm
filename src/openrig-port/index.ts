/**
 * src/openrig-port/index.ts
 *
 * OpenRig Daemon & Consular Governance Port Module.
 * Ports OpenRig's 4-Rung Seat Activity Evidence Ladder, 3-State Crash-Cart Daemon
 * Liveness Detector (up | down | unverified), Review Carousel Health Detector,
 * and Dual-Consul (Nia Nova & Ferric Lunaux) 2/2 Gate Consensus Bridge.
 */

export type OpenRigEvidenceRung =
  | 'lifecycle-hooks'
  | 'self-report'
  | 'needs-input-chrome'
  | 'window-sampling';

export type OpenRigSeatState = 'working' | 'idle' | 'needs-input' | 'unverified' | 'stopped';

export interface SeatEvidenceObservation {
  rung: OpenRigEvidenceRung;
  state: OpenRigSeatState;
  observedAtMs: number;
}

export const EVIDENCE_RUNG_RANK: Record<OpenRigEvidenceRung, number> = {
  'lifecycle-hooks': 3,
  'self-report': 2,
  'needs-input-chrome': 1,
  'window-sampling': 0,
};

export const HOOK_AUTHORITY_WINDOW_MS = 30_000;
export const CROSS_RUNG_CONTRADICTION_WINDOW_MS = 5_000;

/**
 * Arbitrates a seat/cubicle's live state across the 4-rung OpenRig evidence ladder,
 * including cross-rung contradiction degradation when window-sampling sees idle
 * for >= 5,000ms while a stale lifecycle hook still reports working.
 */
export function arbitrateSeatActivityState(
  observations: SeatEvidenceObservation[],
  nowMs: number = Date.now(),
  continuousSamplingIdleMs: number = 0
): { state: OpenRigSeatState; winningRung: OpenRigEvidenceRung | null; degradedHook: boolean } {
  if (!observations || observations.length === 0) {
    return { state: 'unverified', winningRung: null, degradedHook: false };
  }

  let degradedHook = false;
  const eligible = observations.filter((obs) => {
    if (obs.rung === 'lifecycle-hooks') {
      if (nowMs - obs.observedAtMs > HOOK_AUTHORITY_WINDOW_MS) {
        return false;
      }
      if (obs.state === 'working' && continuousSamplingIdleMs >= CROSS_RUNG_CONTRADICTION_WINDOW_MS) {
        degradedHook = true;
        return false;
      }
    }
    return true;
  });

  if (eligible.length === 0) {
    return { state: 'unverified', winningRung: null, degradedHook };
  }

  const sorted = [...eligible].sort((a, b) => EVIDENCE_RUNG_RANK[b.rung] - EVIDENCE_RUNG_RANK[a.rung]);
  return {
    state: sorted[0].state,
    winningRung: sorted[0].rung,
    degradedHook,
  };
}

/**
 * Contract C3: OpenRig 3-State Crash-Cart Daemon Liveness Classification.
 * Timeouts or foreign ports never promote to 'down' (always 'unverified').
 * 'down' requires missing daemon record OR dead PID + unanimous ECONNREFUSED.
 */
export type CrashCartDaemonState = 'up' | 'down' | 'unverified';

export interface CrashCartProbeInput {
  daemonRecordExists: boolean;
  pidAlive: boolean;
  healthStatus?: number;
  timedOut?: boolean;
  allConnectionRefused?: boolean;
}

export function classifyCrashCartDaemonState(input: CrashCartProbeInput): CrashCartDaemonState {
  if (input.healthStatus && input.healthStatus >= 200 && input.healthStatus < 300) {
    return 'up';
  }
  if (!input.daemonRecordExists) {
    return 'down';
  }
  if (input.timedOut) {
    return 'unverified';
  }
  if (!input.pidAlive && input.allConnectionRefused) {
    return 'down';
  }
  return 'unverified';
}

/**
 * OpenRig Health Detector: process.review-carousel
 * Detects when a task bounces between worker and Gate 2 Consular Veto >= 3 times
 * without candidate diff changes, escalating to an Overseer clarification card.
 */
export function evaluateReviewCarouselDetector(params: {
  reviewReturns: number;
  candidateChanges: number;
  newRiskClasses?: number;
  threshold?: number;
}): { triggered: boolean; severity: 'none' | 'warning' | 'critical' } {
  const threshold = params.threshold ?? 3;
  if (
    params.reviewReturns >= threshold &&
    params.candidateChanges === 0 &&
    (params.newRiskClasses ?? 0) === 0
  ) {
    return {
      triggered: true,
      severity: params.reviewReturns >= threshold + 1 ? 'critical' : 'warning',
    };
  }
  return { triggered: false, severity: 'none' };
}
