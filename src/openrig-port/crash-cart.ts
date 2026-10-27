/**
 * src/openrig-port/crash-cart.ts
 *
 * Ported directly from OpenRig (`packages/daemon/src/domain/crash-cart-detect.ts`
 * and `packages/daemon/src/domain/crash-cart-conductor.ts`).
 *
 * Implements:
 * - Contract C3: 3-State Daemon Detector (`'up' | 'down' | 'unverified'`)
 *   - Timeouts NEVER promote to `'down'` (positive predicate only: PID dead/absent + refused).
 * - Contract C2: Fail-Closed Crash-Cart Discovery (`readCrashCartDiscovery`)
 * - Contract B1: Async Fleet Restore Conductor (`RestoreConductor`) &
 *   Amendment 2 Surviving-Panes Live Adoption (`adoptLivePanesRig`, `aggregateFleetRollup`, `deriveFleetVerdict`)
 */

export type DaemonState = 'up' | 'down' | 'unverified';
export type HealthzProbeResult = 'answered' | 'refused' | 'timeout' | 'not-openrig';

export interface DaemonStateFile {
  pid: number;
  port: number;
  host?: string;
}

export interface ClassifyDaemonDeps {
  openrigHome: string;
  readDaemonJson: (openrigHome: string) => DaemonStateFile | undefined;
  isProcessAlive: (pid: number) => boolean;
  probeHealthz: (url: string) => Promise<HealthzProbeResult>;
  openrigUrl?: string;
}

export function formatDaemonHostForUrl(host: string): string {
  const trimmed = host.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  return trimmed.includes(':') ? `[${trimmed}]` : trimmed;
}

function healthzUrl(deps: ClassifyDaemonDeps, state: DaemonStateFile | undefined): string {
  if (deps.openrigUrl && deps.openrigUrl.trim().length > 0) {
    const base = deps.openrigUrl.trim();
    return `${base.endsWith('/') ? base.slice(0, -1) : base}/api/health`;
  }
  const host = state?.host ?? '127.0.0.1';
  const port = state?.port ?? 3820;
  return `http://${formatDaemonHostForUrl(host)}:${port}/api/health`;
}

/**
 * Contract C3 Single-Shot Classification:
 * DOWN only on positive evidence (pid dead/absent AND connection refused).
 * UP on answered.
 * Everything else (timeout, wedged PID alive + refused, foreign occupant) -> UNVERIFIED.
 */
export async function classifyDaemonState(deps: ClassifyDaemonDeps): Promise<DaemonState> {
  const state = deps.readDaemonJson(deps.openrigHome);
  const pidDeadOrAbsent = !state || !deps.isProcessAlive(state.pid);
  const probe = await deps.probeHealthz(healthzUrl(deps, state));
  if (probe === 'answered') return 'up';
  if (probe === 'refused' && pidDeadOrAbsent) return 'down';
  return 'unverified';
}

export interface ResolveDaemonDeps extends ClassifyDaemonDeps {
  sleep: (ms: number) => Promise<void>;
  maxProbes?: number;
  retryDelayMs?: number;
}

export async function resolveDaemonState(deps: ResolveDaemonDeps): Promise<DaemonState> {
  const max = Math.max(1, deps.maxProbes ?? 3);
  const delay = deps.retryDelayMs ?? 400;
  for (let i = 0; i < max; i += 1) {
    const s = await classifyDaemonState(deps);
    if (s === 'up' || s === 'down') return s;
    if (i < max - 1) await deps.sleep(delay);
  }
  return 'unverified';
}

// ── Contract B1: RestoreConductor & Amendment 2 Live Adoption ──

export type PerRigOutcome = 'fully_restored' | 'partially_restored' | 'failed' | 'not_attempted';
export type FleetVerdict = 'all_fully_restored' | 'all_failed' | 'none_attempted' | 'mixed';

export interface AttentionRow {
  rigId: string;
  seat: string;
  need: string;
}

export interface ConductorRigResult {
  rigId: string;
  outcome: PerRigOutcome;
  receiptRef?: string | number;
  attention?: AttentionRow[];
  reason?: string;
  remediation?: string;
}

export interface RestoreNodeLite {
  logicalId: string;
  status: string;
  error?: string;
  attentionEvidence?: string | null;
}

export interface FleetRollup {
  counts: Record<PerRigOutcome, number>;
  sequence: ConductorRigResult[];
  attention_required: AttentionRow[];
  verdict: FleetVerdict;
}

export interface RestoreConductorDeps {
  listRigsInOrder: () => Array<{ rigId: string; isKernel: boolean }>;
  restoreRig: (rigId: string) => Promise<{
    outcome: PerRigOutcome;
    receiptRef?: string | number;
    attention?: AttentionRow[];
    reason?: string;
    remediation?: string;
  }>;
  isCancelled?: () => boolean;
}

export class RestoreConductor {
  constructor(private readonly deps: RestoreConductorDeps) {}

  public async restoreFleet(opts?: {
    onRigDone?: (result: ConductorRigResult) => void;
  }): Promise<ConductorRigResult[]> {
    const rigs = this.deps.listRigsInOrder();
    const results: ConductorRigResult[] = [];
    const record = (result: ConductorRigResult) => {
      results.push(result);
      opts?.onRigDone?.(result);
    };
    for (const rig of rigs) {
      if (this.deps.isCancelled?.()) {
        record({
          rigId: rig.rigId,
          outcome: 'not_attempted',
          reason: 'cancelled before this rig started (stop-before-next-rig)',
          remediation: 're-run the fleet restore to attempt this rig',
        });
        continue;
      }
      try {
        const r = await this.deps.restoreRig(rig.rigId);
        record({
          rigId: rig.rigId,
          outcome: r.outcome,
          receiptRef: r.receiptRef,
          attention: r.attention,
          reason: r.reason,
          remediation: r.remediation,
        });
      } catch {
        record({ rigId: rig.rigId, outcome: 'failed' });
      }
    }
    return results;
  }
}

export function listRigsInKernelFirstOrder(deps: {
  listRigs: () => Array<{ id: string; name: string }>;
}): Array<{ rigId: string; isKernel: boolean }> {
  const all = deps.listRigs();
  const kernel = all.filter((r) => r.name === 'kernel');
  const rest = all.filter((r) => r.name !== 'kernel');
  return [...kernel, ...rest].map((r) => ({ rigId: r.id, isKernel: r.name === 'kernel' }));
}

export function attentionRowsFromNodes(rigId: string, nodes: RestoreNodeLite[]): AttentionRow[] {
  const rows: AttentionRow[] = [];
  for (const n of nodes) {
    if (n.status === 'attention_required') {
      rows.push({
        rigId,
        seat: n.logicalId,
        need: n.attentionEvidence
          ? `live runtime prompt — ${n.attentionEvidence}`
          : n.error || 'live runtime prompt (resume selection / auth) — needs operator',
      });
    } else if (n.status === 'awaiting-decision') {
      rows.push({
        rigId,
        seat: n.logicalId,
        need: n.error ? n.error : 'original session not resumable and no --fresh — choose fresh-prime or skip',
      });
    } else if (n.status === 'failed') {
      rows.push({
        rigId,
        seat: n.logicalId,
        need: n.error ? `restore failed: ${n.error}` : 'restore failed',
      });
    }
  }
  return rows;
}

export function deriveFleetVerdict(counts: Record<PerRigOutcome, number>): FleetVerdict {
  const total =
    counts.fully_restored + counts.partially_restored + counts.failed + counts.not_attempted;
  if (total === 0 || counts.not_attempted === total) return 'none_attempted';
  if (counts.fully_restored === total) return 'all_fully_restored';
  if (counts.failed === total) return 'all_failed';
  return 'mixed';
}

export function aggregateFleetRollup(sequence: ConductorRigResult[]): FleetRollup {
  const counts: Record<PerRigOutcome, number> = {
    fully_restored: 0,
    partially_restored: 0,
    failed: 0,
    not_attempted: 0,
  };
  for (const r of sequence) counts[r.outcome] += 1;
  const attention_required = sequence.flatMap((r) => r.attention ?? []);
  return {
    counts,
    sequence,
    attention_required,
    verdict: deriveFleetVerdict(counts),
  };
}
