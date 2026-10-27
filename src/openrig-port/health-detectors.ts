/**
 * src/openrig-port/health-detectors.ts
 *
 * Ported directly from OpenRig (`packages/daemon/src/domain/health-detectors.ts`,
 * `health-projection.ts`, and `health-policy.ts`).
 *
 * Implements all 6 formal OpenRig health detectors:
 * 1. `process.ceremony-amplification`
 * 2. `process.review-carousel`
 * 3. `process.redundant-wake-storm`
 * 4. `governance.stale-directive`
 * 5. `governance.scope-admission-drift`
 * 6. `context.pressure`
 */

import { createHash } from 'node:crypto';

export const HEALTH_RECORD_SCHEMA = 'openrig.health/v0alpha1' as const;
export const HEALTH_LIST_SCHEMA = 'openrig.health-list/v0alpha1' as const;
export const HEALTH_DETECTORS = [
  'process.ceremony-amplification',
  'process.review-carousel',
  'process.redundant-wake-storm',
  'governance.stale-directive',
  'governance.scope-admission-drift',
  'context.pressure',
] as const;

export type HealthDetectorName = (typeof HEALTH_DETECTORS)[number];
export type HealthCategory = 'behavioral' | 'process' | 'governance' | 'epistemic' | 'context';
export type HealthSeverity = 'info' | 'warning' | 'critical';
export type HealthConfidence = 'high' | 'medium';
export type HealthStatus = 'active' | 'cleared' | 'indeterminate';

export type HealthScope =
  | { type: 'instance'; instanceId: string }
  | { type: 'rig'; rigId: string }
  | { type: 'seat'; rigId: string; seatId: string }
  | { type: 'mission'; projectId: string; missionId: string }
  | { type: 'slice'; projectId: string; missionId: string; sliceId: string };

export interface HealthThresholds {
  ceremonyTransitions: number;
  ceremonyRatio: number;
  reviewReturns: number;
  redundantWakes: number;
  contextWarningPercent: number;
  contextCriticalPercent: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  ceremonyTransitions: 6,
  ceremonyRatio: 3,
  reviewReturns: 3,
  redundantWakes: 3,
  contextWarningPercent: 95,
  contextCriticalPercent: 99,
};

export type HealthDetectorObservation =
  | {
      kind: 'coordination-lineage';
      lineageId: string;
      scope: HealthScope;
      coordinationTransitions: number;
      productStateChanges: number;
      reviewReturns: number;
      candidateChanges: number;
      newRiskClasses: number;
      observedAt: string;
    }
  | {
      kind: 'wake-lineage';
      lineageId: string;
      scope: HealthScope;
      wakeCount: number;
      rescueWakeCount: number;
      existingNextAction: boolean;
      observedAt: string;
    }
  | {
      kind: 'directive';
      directiveId: string;
      scope: HealthScope;
      declaredPhase: string | null;
      currentPhase: string | null;
      declaredRigor: string | null;
      currentRigor: string | null;
      conflictSourceAddress: string | null;
      observedAt: string;
    }
  | {
      kind: 'scope-admission';
      sliceId: string;
      scope: HealthScope;
      missionActive: boolean;
      buildable: boolean;
      admissionState: 'present' | 'missing' | 'contradictory' | 'unavailable';
      observedAt: string;
    }
  | {
      kind: 'context-pressure';
      seatId: string;
      scope: HealthScope;
      usedTokens: number;
      maxTokens: number;
      percentUsed: number;
      observedAt: string;
    };

export interface HealthRecord {
  schema: typeof HEALTH_RECORD_SCHEMA;
  id: string;
  detector: HealthDetectorName;
  category: HealthCategory;
  scope: HealthScope;
  severity: HealthSeverity;
  confidence: HealthConfidence;
  status: HealthStatus;
  startedAt: string;
  lastObservedAt: string;
  summary: string;
  threshold: string;
  explanation: string;
  suggestedInspection: string;
}

export interface HealthListProjection {
  schema: typeof HEALTH_LIST_SCHEMA;
  evaluatedAt: string;
  total: number;
  limit: number;
  truncated: boolean;
  records: HealthRecord[];
}

function makeRecordId(detector: string, key: string): string {
  return createHash('sha256').update(`${detector}:${key}`).digest('hex').slice(0, 16);
}

export function evaluateHealthObservation(
  obs: HealthDetectorObservation,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): HealthRecord[] {
  const out: HealthRecord[] = [];

  if (obs.kind === 'coordination-lineage') {
    const ratio = obs.coordinationTransitions / Math.max(1, obs.productStateChanges);
    if (obs.coordinationTransitions >= thresholds.ceremonyTransitions && ratio >= thresholds.ceremonyRatio) {
      const severity: HealthSeverity = ratio >= thresholds.ceremonyRatio * 2 ? 'critical' : 'warning';
      out.push({
        schema: HEALTH_RECORD_SCHEMA,
        id: makeRecordId('process.ceremony-amplification', obs.lineageId),
        detector: 'process.ceremony-amplification',
        category: 'process',
        scope: obs.scope,
        severity,
        confidence: 'high',
        status: 'active',
        startedAt: obs.observedAt,
        lastObservedAt: obs.observedAt,
        summary: `Coordination transitions (${obs.coordinationTransitions}) exceed product state changes (${obs.productStateChanges}) at ratio ${ratio.toFixed(1)}x`,
        threshold: `transitions>=${thresholds.ceremonyTransitions}, ratio>=${thresholds.ceremonyRatio}`,
        explanation:
          'Consular/seat coordination turns are amplifying without corresponding Kanban or worktree product state changes.',
        suggestedInspection: `Inspect lineage ${obs.lineageId} in consular_dialogue.jsonl`,
      });
    }

    if (obs.reviewReturns >= thresholds.reviewReturns && obs.candidateChanges === 0 && obs.newRiskClasses === 0) {
      const severity: HealthSeverity = obs.reviewReturns >= thresholds.reviewReturns + 1 ? 'critical' : 'warning';
      out.push({
        schema: HEALTH_RECORD_SCHEMA,
        id: makeRecordId('process.review-carousel', obs.lineageId),
        detector: 'process.review-carousel',
        category: 'process',
        scope: obs.scope,
        severity,
        confidence: 'high',
        status: 'active',
        startedAt: obs.observedAt,
        lastObservedAt: obs.observedAt,
        summary: `Review carousel detected on ${obs.lineageId}: ${obs.reviewReturns} review returns with 0 candidate diff changes`,
        threshold: `reviewReturns>=${thresholds.reviewReturns}, candidateChanges=0`,
        explanation:
          'Task is bouncing between worker submission and Consular Gate 2 veto without code modifications.',
        suggestedInspection: `Inspect veto_history on task ${obs.lineageId}`,
      });
    }
  } else if (obs.kind === 'wake-lineage') {
    const nonRescue = obs.wakeCount - obs.rescueWakeCount;
    if (obs.existingNextAction && nonRescue >= thresholds.redundantWakes) {
      const severity: HealthSeverity = nonRescue >= thresholds.redundantWakes + 2 ? 'critical' : 'warning';
      out.push({
        schema: HEALTH_RECORD_SCHEMA,
        id: makeRecordId('process.redundant-wake-storm', obs.lineageId),
        detector: 'process.redundant-wake-storm',
        category: 'process',
        scope: obs.scope,
        severity,
        confidence: 'high',
        status: 'active',
        startedAt: obs.observedAt,
        lastObservedAt: obs.observedAt,
        summary: `Redundant wake storm on ${obs.lineageId} (${nonRescue} non-rescue wakes while next action exists)`,
        threshold: `nonRescueWakes>=${thresholds.redundantWakes}`,
        explanation: 'Seat is receiving repeated wake reminders while an action is already queued.',
        suggestedInspection: `Check watchdog schedule for ${obs.lineageId}`,
      });
    }
  } else if (obs.kind === 'directive') {
    const phaseConflict = obs.declaredPhase && obs.currentPhase && obs.declaredPhase !== obs.currentPhase;
    const rigorConflict = obs.declaredRigor && obs.currentRigor && obs.declaredRigor !== obs.currentRigor;
    if (phaseConflict || rigorConflict) {
      out.push({
        schema: HEALTH_RECORD_SCHEMA,
        id: makeRecordId('governance.stale-directive', obs.directiveId),
        detector: 'governance.stale-directive',
        category: 'governance',
        scope: obs.scope,
        severity: 'warning',
        confidence: 'high',
        status: 'active',
        startedAt: obs.observedAt,
        lastObservedAt: obs.observedAt,
        summary: `Directive ${obs.directiveId} conflicts with current phase/rigor (${obs.conflictSourceAddress ?? 'board'})`,
        threshold: 'declaredPhase !== currentPhase || declaredRigor !== currentRigor',
        explanation: 'An active directive references a superseded governance phase or rigor posture.',
        suggestedInspection: `Inspect directive ${obs.directiveId}`,
      });
    }
  } else if (obs.kind === 'scope-admission') {
    if (obs.missionActive && obs.buildable && obs.admissionState !== 'present') {
      out.push({
        schema: HEALTH_RECORD_SCHEMA,
        id: makeRecordId('governance.scope-admission-drift', obs.sliceId),
        detector: 'governance.scope-admission-drift',
        category: 'governance',
        scope: obs.scope,
        severity: obs.admissionState === 'contradictory' ? 'critical' : 'warning',
        confidence: 'high',
        status: 'active',
        startedAt: obs.observedAt,
        lastObservedAt: obs.observedAt,
        summary: `Buildable slice ${obs.sliceId} lacks verified Gate 1 admission (${obs.admissionState})`,
        threshold: 'missionActive && buildable && admissionState !== present',
        explanation: 'Active slice is marked buildable without verified Gate 1 Consular admission authority.',
        suggestedInspection: `Inspect task card ${obs.sliceId}`,
      });
    }
  } else if (obs.kind === 'context-pressure') {
    if (obs.percentUsed >= thresholds.contextWarningPercent) {
      const severity: HealthSeverity =
        obs.percentUsed >= thresholds.contextCriticalPercent ? 'critical' : 'warning';
      out.push({
        schema: HEALTH_RECORD_SCHEMA,
        id: makeRecordId('context.pressure', obs.seatId),
        detector: 'context.pressure',
        category: 'context',
        scope: obs.scope,
        severity,
        confidence: 'high',
        status: 'active',
        startedAt: obs.observedAt,
        lastObservedAt: obs.observedAt,
        summary: `Seat ${obs.seatId} context window at ${obs.percentUsed.toFixed(1)}% (${obs.usedTokens}/${obs.maxTokens} tokens)`,
        threshold: `warning>=${thresholds.contextWarningPercent}%, critical>=${thresholds.contextCriticalPercent}%`,
        explanation: 'Seat token consumption has crossed the OpenRig context-pressure threshold; handover recap recommended.',
        suggestedInspection: `Check stamina/quota on ${obs.seatId}`,
      });
    }
  }

  return out;
}

export class HealthProjectionEngine {
  private readonly observations = new Map<string, HealthDetectorObservation>();
  private thresholds: HealthThresholds = { ...DEFAULT_HEALTH_THRESHOLDS };

  public recordObservation(key: string, obs: HealthDetectorObservation): void {
    this.observations.set(key, obs);
  }

  public recordTaskReviewLineage(params: {
    taskId: string;
    vetoCount: number;
    hasDiffChanges: boolean;
    coordinationTransitions?: number;
    productStateChanges?: number;
  }): void {
    this.observations.set(`lineage:${params.taskId}`, {
      kind: 'coordination-lineage',
      lineageId: params.taskId,
      scope: { type: 'slice', projectId: 'panopticon', missionId: 'swarm', sliceId: params.taskId },
      coordinationTransitions: params.coordinationTransitions ?? params.vetoCount * 2,
      productStateChanges: params.productStateChanges ?? (params.hasDiffChanges ? 1 : 0),
      reviewReturns: params.vetoCount,
      candidateChanges: params.hasDiffChanges ? 1 : 0,
      newRiskClasses: 0,
      observedAt: new Date().toISOString(),
    });
  }

  public recordSeatContextUsage(params: {
    seatId: string;
    usedTokens: number;
    maxTokens: number;
  }): void {
    const percentUsed = params.maxTokens > 0 ? (params.usedTokens / params.maxTokens) * 100 : 0;
    this.observations.set(`context:${params.seatId}`, {
      kind: 'context-pressure',
      seatId: params.seatId,
      scope: { type: 'seat', rigId: 'panopticon', seatId: params.seatId },
      usedTokens: params.usedTokens,
      maxTokens: params.maxTokens,
      percentUsed,
      observedAt: new Date().toISOString(),
    });
  }

  public project(limit = 50): HealthListProjection {
    const allRecords = [...this.observations.values()]
      .flatMap((obs) => evaluateHealthObservation(obs, this.thresholds))
      .sort((a, b) => a.detector.localeCompare(b.detector) || a.id.localeCompare(b.id));

    return {
      schema: HEALTH_LIST_SCHEMA,
      evaluatedAt: new Date().toISOString(),
      total: allRecords.length,
      limit,
      truncated: allRecords.length > limit,
      records: allRecords.slice(0, limit),
    };
  }
}
