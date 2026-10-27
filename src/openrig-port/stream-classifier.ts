/**
 * src/openrig-port/stream-classifier.ts
 *
 * Ported directly from OpenRig (`packages/daemon/src/domain/stream-classification-worker.ts`).
 *
 * Implements:
 * - Wake-Driven, Coalesced Boolean Notification (`notify()`, `O(1)` memory overhead)
 * - Lease-Fenced Single-Owner Execution (`InMemoryClassifierLeaseManager`)
 * - Bounded Pagination via `InMemoryClassificationAttemptLedger` (`MAX_ELIGIBLE_PAGE = 50`)
 * - Per-Item Deadline Capped by Lease Heartbeat (`Promise.race` + `AbortController`)
 * - Single-In-Flight Protection Against Ignored `AbortSignal` (`this.pending`)
 */

import { randomUUID } from 'node:crypto';

export const MAX_ELIGIBLE_PAGE = 50;

export const LABEL_FIELDS = [
  'classificationType',
  'classificationUrgency',
  'classificationMaturity',
  'classificationConfidence',
  'classificationDestination',
  'area',
  'scopeRef',
] as const;

export type LabelField = (typeof LABEL_FIELDS)[number];

export type WorkerLabels = Partial<Record<LabelField, string | null>> & {
  needsHuman?: boolean | null;
  duplicateOfStreamItemId?: string | null;
  duplicateEvidenceRef?: string | null;
};

export interface StreamItem {
  id: string;
  sender: string;
  content: string;
  phase?: string;
  createdAt: string;
  labels?: WorkerLabels | null;
}

export interface ClassifierLease {
  leaseId: string;
  holderSession: string;
  lastHeartbeat: string;
  ttlMs: number;
}

export interface ClassificationAttemptRecord {
  attemptId: string;
  executionId: string;
  streamItemId: string;
  leaseId: string;
  classifierSession: string;
  status: 'in_progress' | 'classified' | 'abstained' | 'failed';
  labels?: WorkerLabels;
  reason?: string;
  updatedAt: string;
}

export interface WakeResult {
  state:
    | 'processed'
    | 'busy'
    | 'classifier_pending'
    | 'lease_backoff'
    | 'lease_lost'
    | 'unavailable'
    | 'stopped';
  nextWakeAt: string;
  reason?: string;
  moreEligible: boolean;
  outcomes: Array<{ streamItemId: string; status: string; labels?: WorkerLabels; reason?: string }>;
}

export class OpenRigStreamClassifier {
  private readonly items = new Map<string, StreamItem>();
  private readonly attempts = new Map<string, ClassificationAttemptRecord>();
  private lease: ClassifierLease | null = null;
  private busy = false;
  private pending = false;
  private hinted = false;
  private readonly session: string;
  private readonly leaseTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly pageSize: number;

  constructor(opts?: {
    session?: string;
    leaseTtlMs?: number;
    requestTimeoutMs?: number;
    pageSize?: number;
  }) {
    this.session = opts?.session ?? 'consul-classifier@panopticon';
    this.leaseTtlMs = opts?.leaseTtlMs ?? 30_000;
    this.requestTimeoutMs = opts?.requestTimeoutMs ?? 5_000;
    this.pageSize = Math.min(Math.max(1, opts?.pageSize ?? 20), MAX_ELIGIBLE_PAGE);
  }

  /** Coalesced boolean wake hint — calling it a million times stores one boolean (`O(1)`). */
  public notify(): void {
    this.hinted = true;
  }

  public ingestStreamItem(item: StreamItem): void {
    this.items.set(item.id, item);
    this.notify();
  }

  public isHinted(): boolean {
    return this.hinted;
  }

  /**
   * Deterministic heuristic + rule classifier for Panopticon stream items,
   * supporting injected async classifier callbacks with AbortSignal deadline protection.
   */
  public async wake(
    customClassifier?: (item: StreamItem, signal: AbortSignal) => Promise<WorkerLabels>
  ): Promise<WakeResult> {
    const now = new Date();
    const result: WakeResult = {
      state: 'processed',
      nextWakeAt: new Date(now.getTime() + Math.floor(this.leaseTtlMs / 3)).toISOString(),
      moreEligible: false,
      outcomes: [],
    };

    if (this.busy) return { ...result, state: 'busy' };
    if (this.pending) return { ...result, state: 'classifier_pending' };

    this.busy = true;
    this.hinted = false;

    try {
      // Acquire or renew lease
      if (!this.lease || Date.now() - Date.parse(this.lease.lastHeartbeat) > this.lease.ttlMs) {
        this.lease = {
          leaseId: `lease-${randomUUID().slice(0, 8)}`,
          holderSession: this.session,
          lastHeartbeat: new Date().toISOString(),
          ttlMs: this.leaseTtlMs,
        };
      } else {
        this.lease.lastHeartbeat = new Date().toISOString();
      }

      const eligible: StreamItem[] = [];
      for (const item of this.items.values()) {
        const existing = this.attempts.get(item.id);
        if (!existing || existing.status === 'failed') {
          eligible.push(item);
        }
      }

      result.moreEligible = eligible.length > this.pageSize;
      const page = eligible.slice(0, this.pageSize);

      for (const item of page) {
        const attemptId = `att-${randomUUID().slice(0, 8)}`;
        const executionId = `exec-${randomUUID().slice(0, 8)}`;
        const attempt: ClassificationAttemptRecord = {
          attemptId,
          executionId,
          streamItemId: item.id,
          leaseId: this.lease.leaseId,
          classifierSession: this.session,
          status: 'in_progress',
          updatedAt: new Date().toISOString(),
        };
        this.attempts.set(item.id, attempt);

        const leaseDeadlineMs =
          Date.parse(this.lease.lastHeartbeat) + this.lease.ttlMs - Date.now();
        const budgetMs = Math.max(10, Math.min(this.requestTimeoutMs, leaseDeadlineMs));
        const controller = new AbortController();

        this.pending = true;
        const decidePromise = (
          customClassifier ? customClassifier(item, controller.signal) : this.defaultClassify(item)
        ).finally(() => {
          this.pending = false;
        });

        let timer: NodeJS.Timeout | undefined;
        try {
          const labels = await Promise.race([
            decidePromise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error('classification_timeout'));
              }, budgetMs);
            }),
          ]);
          if (timer) clearTimeout(timer);

          attempt.status = 'classified';
          attempt.labels = labels;
          attempt.updatedAt = new Date().toISOString();
          item.labels = labels;
          result.outcomes.push({ streamItemId: item.id, status: 'classified', labels });
        } catch (err: any) {
          if (timer) clearTimeout(timer);
          attempt.status = 'failed';
          attempt.reason = err?.message ?? 'classifier_error';
          attempt.updatedAt = new Date().toISOString();
          result.outcomes.push({
            streamItemId: item.id,
            status: 'failed',
            reason: attempt.reason,
          });
          if (this.pending) {
            result.moreEligible = true;
            break;
          }
        }
      }

      return result;
    } finally {
      this.busy = false;
    }
  }

  private async defaultClassify(item: StreamItem): Promise<WorkerLabels> {
    const text = item.content.toLowerCase();
    const isBlocker = /\b(blocker|error|failed|veto|crash|critical)\b/.test(text);
    const isQuestion = text.includes('?') || item.phase === 'QUESTION';
    const isDecision = /\b(approved|dispatched|completed|verified|merged)\b/.test(text);

    return {
      classificationType: isBlocker
        ? 'blocker'
        : isQuestion
        ? 'elicitation'
        : isDecision
        ? 'decision'
        : 'progress',
      classificationUrgency: isBlocker ? 'high' : isQuestion ? 'medium' : 'low',
      classificationMaturity: isDecision ? 'verified' : 'active',
      classificationConfidence: 'high',
      classificationDestination: isQuestion ? 'overseer-console' : 'kanban-taskboard',
      area: item.sender.toLowerCase().includes('consul') ? 'governance' : 'cubicle-execution',
      scopeRef: 'panopticon',
      needsHuman: isQuestion || isBlocker,
    };
  }

  public getStatus(): {
    session: string;
    lease: ClassifierLease | null;
    hinted: boolean;
    totalItems: number;
    classifiedCount: number;
    recentOutcomes: ClassificationAttemptRecord[];
  } {
    const allAttempts = [...this.attempts.values()];
    return {
      session: this.session,
      lease: this.lease,
      hinted: this.hinted,
      totalItems: this.items.size,
      classifiedCount: allAttempts.filter((a) => a.status === 'classified').length,
      recentOutcomes: allAttempts.slice(-15),
    };
  }
}
