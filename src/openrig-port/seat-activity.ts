/**
 * src/openrig-port/seat-activity.ts
 *
 * Ported directly from OpenRig (`packages/daemon/src/domain/activity-taxonomy.ts`
 * and `packages/daemon/src/domain/seat-activity-service.ts`).
 *
 * Implements:
 * - OPR.0.5.5.19 Formal Activity Taxonomy (`working | idle-at-prompt | unknown`)
 * - 4-Rung Ranked Evidence Ladder (`self-report` -> `lifecycle-hooks` -> `needs-input-chrome` -> `window-sampling`)
 * - Cross-Rung Contradiction Detection (`CROSS_RUNG_CONTRADICTION_WINDOW_MS = 5,000 ms`)
 * - 2-Tick Idle Debounce (`SAMPLING_IDLE_DEBOUNCE_TICKS = 2`)
 * - Event-driven `waitForSeatState` on monotonic `seq`
 */

export type ActivityValue = 'working' | 'idle-at-prompt' | 'unknown';
export const ACTIVITY_VALUES: ReadonlySet<string> = new Set<ActivityValue>([
  'working',
  'idle-at-prompt',
  'unknown',
]);

export type DisplayActivityValue = 'working' | 'idle' | 'needs-input' | 'unknown';

export interface NeedsInput {
  count: number;
  reason: string | null;
}

export function deriveDisplayActivity(activity: string, needsInput: NeedsInput): DisplayActivityValue {
  if (!ACTIVITY_VALUES.has(activity)) {
    throw new Error(
      `"${activity}" is not a taxonomy activity value (working | idle-at-prompt | unknown) — surface-local vocabulary must be mapped at its adapter`
    );
  }
  if (needsInput.count > 0) return 'needs-input';
  if (activity === 'idle-at-prompt') return 'idle';
  return activity as 'working' | 'unknown';
}

export type EvidenceRungId = 'self-report' | 'lifecycle-hooks' | 'needs-input-chrome' | 'window-sampling';

export const EVIDENCE_RUNG_RANK: readonly EvidenceRungId[] = [
  'self-report',
  'lifecycle-hooks',
  'window-sampling',
];

export type RungTrust = 'authoritative' | 'trial' | 'identity-only' | 'positive-only' | 'absent';

export const HOOK_AUTHORITY_WINDOW_MS = 30_000;
export const CROSS_RUNG_CONTRADICTION_WINDOW_MS = 5_000;
export const SAMPLING_IDLE_DEBOUNCE_TICKS = 2;

export interface ActivityEvidence {
  seatNodeId: string;
  sessionName: string;
  rung: EvidenceRungId;
  sourceId: string;
  seq: number;
  observedAt: string;
  activity?: ActivityValue;
  needsInput?: NeedsInput;
}

export interface RungHealthEvent {
  seatNodeId: string;
  rung: EvidenceRungId;
  sourceId: string;
  from: RungTrust;
  to: RungTrust;
  reason: string;
  at: string;
}

export interface ArbitratedSeatState {
  seatNodeId: string;
  activity: ActivityValue;
  displayActivity: DisplayActivityValue;
  needsInput: NeedsInput;
  needsInputEvidence: { rung: EvidenceRungId; observedAt: string } | null;
  decidedBy: EvidenceRungId | null;
  seq: number;
  changedAt: string;
  rungs: Array<{
    rung: EvidenceRungId;
    sourceId: string;
    trust: RungTrust;
    lastEvidenceAt: string | null;
    lastActivity: ActivityValue | null;
  }>;
  lastSwap: { generation: string; at: string } | null;
}

interface InternalRungSlot {
  rung: EvidenceRungId;
  sourceId: string;
  trust: RungTrust;
  lastSeq: number;
  lastEvidenceAt: string | null;
  lastActivity: ActivityValue | null;
  needsInput: NeedsInput | null;
  idleDebounceTicks: number;
  idleContradictionSinceMs: number | null;
}

interface InternalSeatLadder {
  seatNodeId: string;
  rungs: Map<EvidenceRungId, InternalRungSlot>;
  seq: number;
  changedAt: string;
  lastSwap: { generation: string; at: string } | null;
  arbitrated: ArbitratedSeatState;
}

export class SeatActivityEngine {
  private readonly seats = new Map<string, InternalSeatLadder>();
  private readonly rungEvents: RungHealthEvent[] = [];
  private readonly waiters = new Map<string, Set<(state: ArbitratedSeatState) => void>>();
  private readonly now: () => Date;

  constructor(opts?: { now?: () => Date }) {
    this.now = opts?.now ?? (() => new Date());
  }

  public declareSeat(seatNodeId: string, generation?: string): ArbitratedSeatState {
    const nowIso = this.now().toISOString();
    const rungs = new Map<EvidenceRungId, InternalRungSlot>([
      [
        'self-report',
        {
          rung: 'self-report',
          sourceId: `${seatNodeId}:self-report`,
          trust: 'authoritative',
          lastSeq: 0,
          lastEvidenceAt: null,
          lastActivity: null,
          needsInput: null,
          idleDebounceTicks: 0,
          idleContradictionSinceMs: null,
        },
      ],
      [
        'lifecycle-hooks',
        {
          rung: 'lifecycle-hooks',
          sourceId: `${seatNodeId}:hooks`,
          trust: 'authoritative',
          lastSeq: 0,
          lastEvidenceAt: null,
          lastActivity: null,
          needsInput: null,
          idleDebounceTicks: 0,
          idleContradictionSinceMs: null,
        },
      ],
      [
        'needs-input-chrome',
        {
          rung: 'needs-input-chrome',
          sourceId: `${seatNodeId}:chrome`,
          trust: 'authoritative',
          lastSeq: 0,
          lastEvidenceAt: null,
          lastActivity: null,
          needsInput: null,
          idleDebounceTicks: 0,
          idleContradictionSinceMs: null,
        },
      ],
      [
        'window-sampling',
        {
          rung: 'window-sampling',
          sourceId: `${seatNodeId}:sampling`,
          trust: 'authoritative',
          lastSeq: 0,
          lastEvidenceAt: null,
          lastActivity: null,
          needsInput: null,
          idleDebounceTicks: 0,
          idleContradictionSinceMs: null,
        },
      ],
    ]);

    const prev = this.seats.get(seatNodeId);
    const seq = (prev?.seq ?? 0) + 1;
    const lastSwap = generation ? { generation, at: nowIso } : prev?.lastSwap ?? null;

    const entry: InternalSeatLadder = {
      seatNodeId,
      rungs,
      seq,
      changedAt: nowIso,
      lastSwap,
      arbitrated: {
        seatNodeId,
        activity: 'unknown',
        displayActivity: 'unknown',
        needsInput: { count: 0, reason: null },
        needsInputEvidence: null,
        decidedBy: null,
        seq,
        changedAt: nowIso,
        rungs: [...rungs.values()].map((r) => ({
          rung: r.rung,
          sourceId: r.sourceId,
          trust: r.trust,
          lastEvidenceAt: r.lastEvidenceAt,
          lastActivity: r.lastActivity,
        })),
        lastSwap,
      },
    };
    this.seats.set(seatNodeId, entry);
    this.notifyWaiters(seatNodeId, entry.arbitrated);
    return entry.arbitrated;
  }

  public reportEvidence(evidence: ActivityEvidence): ArbitratedSeatState {
    let entry = this.seats.get(evidence.seatNodeId);
    if (!entry) {
      this.declareSeat(evidence.seatNodeId);
      entry = this.seats.get(evidence.seatNodeId)!;
    }

    const slot = entry.rungs.get(evidence.rung);
    if (!slot) return entry.arbitrated;

    // Monotonic per-source sequence check
    if (evidence.seq > 0 && evidence.seq < slot.lastSeq) {
      return entry.arbitrated;
    }
    slot.lastSeq = Math.max(slot.lastSeq, evidence.seq);
    slot.sourceId = evidence.sourceId || slot.sourceId;
    slot.lastEvidenceAt = evidence.observedAt;

    if (evidence.needsInput !== undefined) {
      slot.needsInput = evidence.needsInput;
    }

    if (evidence.activity !== undefined) {
      if (evidence.rung === 'window-sampling') {
        if (evidence.activity === 'idle-at-prompt' && slot.lastActivity === 'working') {
          slot.idleDebounceTicks += 1;
          if (slot.idleDebounceTicks >= SAMPLING_IDLE_DEBOUNCE_TICKS) {
            slot.lastActivity = 'idle-at-prompt';
          }
        } else {
          slot.idleDebounceTicks = 0;
          slot.lastActivity = evidence.activity;
        }
      } else {
        slot.lastActivity = evidence.activity;
        if (evidence.rung === 'lifecycle-hooks' && slot.trust === 'identity-only' && evidence.activity === 'working') {
          slot.trust = 'authoritative';
          slot.idleContradictionSinceMs = null;
        }
      }
    }

    return this.arbitrate(entry, Date.parse(evidence.observedAt) || this.now().getTime());
  }

  private arbitrate(entry: InternalSeatLadder, nowMs: number): ArbitratedSeatState {
    const hookSlot = entry.rungs.get('lifecycle-hooks')!;
    const samplingSlot = entry.rungs.get('window-sampling')!;

    // Cross-rung contradiction detection: if hooks claim working while window-sampling
    // observes idle-at-prompt for >= CROSS_RUNG_CONTRADICTION_WINDOW_MS (5,000 ms), degrade hooks to identity-only
    if (
      hookSlot.trust === 'authoritative' &&
      hookSlot.lastActivity === 'working' &&
      samplingSlot.lastActivity === 'idle-at-prompt'
    ) {
      if (samplingSlot.idleContradictionSinceMs === null) {
        samplingSlot.idleContradictionSinceMs = nowMs;
      } else if (nowMs - samplingSlot.idleContradictionSinceMs >= CROSS_RUNG_CONTRADICTION_WINDOW_MS) {
        const from = hookSlot.trust;
        hookSlot.trust = 'identity-only';
        this.rungEvents.push({
          seatNodeId: entry.seatNodeId,
          rung: 'lifecycle-hooks',
          sourceId: hookSlot.sourceId,
          from,
          to: 'identity-only',
          reason: 'cross-rung-contradiction-with-window-sampling',
          at: new Date(nowMs).toISOString(),
        });
      }
    } else {
      samplingSlot.idleContradictionSinceMs = null;
    }

    // Expire working hook authority if older than HOOK_AUTHORITY_WINDOW_MS
    if (
      hookSlot.trust === 'authoritative' &&
      hookSlot.lastActivity === 'working' &&
      hookSlot.lastEvidenceAt &&
      nowMs - Date.parse(hookSlot.lastEvidenceAt) > HOOK_AUTHORITY_WINDOW_MS
    ) {
      hookSlot.lastActivity = 'unknown';
    }

    // Arbitrate activity across ranked rungs
    let decidedActivity: ActivityValue = 'unknown';
    let decidedBy: EvidenceRungId | null = null;

    for (const rungId of EVIDENCE_RUNG_RANK) {
      const s = entry.rungs.get(rungId);
      if (!s || s.trust !== 'authoritative') continue;
      if (s.lastActivity && s.lastActivity !== 'unknown') {
        decidedActivity = s.lastActivity;
        decidedBy = rungId;
        break;
      }
    }

    // Arbitrate needs-input (needs-input-chrome outranks self-report for needs-input signal)
    let needsInput: NeedsInput = { count: 0, reason: null };
    let needsInputEvidence: { rung: EvidenceRungId; observedAt: string } | null = null;
    for (const rungId of ['needs-input-chrome', 'lifecycle-hooks', 'self-report'] as const) {
      const s = entry.rungs.get(rungId);
      if (s && s.needsInput && s.needsInput.count > 0 && s.lastEvidenceAt) {
        needsInput = s.needsInput;
        needsInputEvidence = { rung: rungId, observedAt: s.lastEvidenceAt };
        break;
      }
    }

    const displayActivity = deriveDisplayActivity(decidedActivity, needsInput);
    const prev = entry.arbitrated;
    const changed =
      prev.activity !== decidedActivity ||
      prev.displayActivity !== displayActivity ||
      prev.decidedBy !== decidedBy ||
      prev.needsInput.count !== needsInput.count;

    if (changed) {
      entry.seq += 1;
      entry.changedAt = new Date(nowMs).toISOString();
    }

    entry.arbitrated = {
      seatNodeId: entry.seatNodeId,
      activity: decidedActivity,
      displayActivity,
      needsInput,
      needsInputEvidence,
      decidedBy,
      seq: entry.seq,
      changedAt: entry.changedAt,
      rungs: [...entry.rungs.values()].map((r) => ({
        rung: r.rung,
        sourceId: r.sourceId,
        trust: r.trust,
        lastEvidenceAt: r.lastEvidenceAt,
        lastActivity: r.lastActivity,
      })),
      lastSwap: entry.lastSwap,
    };

    if (changed) {
      this.notifyWaiters(entry.seatNodeId, entry.arbitrated);
    }

    return entry.arbitrated;
  }

  public getSeatState(seatNodeId: string): ArbitratedSeatState | undefined {
    return this.seats.get(seatNodeId)?.arbitrated;
  }

  public getAllSeatStates(): ArbitratedSeatState[] {
    return [...this.seats.values()].map((s) => s.arbitrated);
  }

  public getRungHealthEvents(): RungHealthEvent[] {
    return [...this.rungEvents];
  }

  public async waitForSeatState(
    seatNodeId: string,
    opts: { afterSeq: number; timeoutMs?: number }
  ): Promise<ArbitratedSeatState | null> {
    const current = this.seats.get(seatNodeId)?.arbitrated;
    if (current && current.seq > opts.afterSeq) {
      return current;
    }
    const timeoutMs = opts.timeoutMs ?? 5000;
    return new Promise<ArbitratedSeatState | null>((resolve) => {
      let set = this.waiters.get(seatNodeId);
      if (!set) {
        set = new Set();
        this.waiters.set(seatNodeId, set);
      }
      const timer = setTimeout(() => {
        set?.delete(onState);
        resolve(this.seats.get(seatNodeId)?.arbitrated ?? null);
      }, timeoutMs);
      const onState = (state: ArbitratedSeatState) => {
        if (state.seq > opts.afterSeq) {
          clearTimeout(timer);
          set?.delete(onState);
          resolve(state);
        }
      };
      set.add(onState);
    });
  }

  private notifyWaiters(seatNodeId: string, state: ArbitratedSeatState): void {
    const set = this.waiters.get(seatNodeId);
    if (!set) return;
    for (const fn of [...set]) {
      fn(state);
    }
  }
}
