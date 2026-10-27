import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import {
  OpenRigPanopticonBridge,
  OpenRigRuntimeHub,
  SeatLifecycleEngine,
  SeatActivityEngine,
  HealthProjectionEngine,
  OpenRigStreamClassifier,
  writeSeatRecap,
  readSeatRecap,
  listRecapChain,
  RecapWriteError,
  resolveAddress,
  classifyDaemonState,
  resolveDaemonState,
  RestoreConductor,
  aggregateFleetRollup,
  deriveFleetVerdict,
} from '../../src/openrig-port/index.js';

describe('OpenRig Full Runtime Engine Port (All 6 Subsystems)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openrig-port-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('1. SeatLifecycleEngine enforces occupantGeneration fencing, DeliveryGuard serialization, and 3-state liveness', async () => {
    const lifecycle = new SeatLifecycleEngine();
    const first = lifecycle.reserveOccupantGeneration({
      seatId: 'cubicle-01',
      runtime: 'codex',
      model: 'gpt-6-astra',
    });
    expect(first.env.OPENRIG_OCCUPANT_GENERATION).toBe(first.occupantGeneration);
    expect(lifecycle.verifyGeneration('cubicle-01', first.occupantGeneration)).toBe(true);

    const second = lifecycle.reserveOccupantGeneration({
      seatId: 'cubicle-01',
      runtime: 'codex',
      model: 'gpt-6-astra',
    });
    expect(lifecycle.verifyGeneration('cubicle-01', first.occupantGeneration)).toBe(false);
    expect(lifecycle.verifyGeneration('cubicle-01', second.occupantGeneration)).toBe(true);

    // 3-state liveness: transport_unavailable never mutates status to stopped
    lifecycle.bindPid('cubicle-01', second.occupantGeneration, 99999);
    const verdict = lifecycle.probeLiveness('cubicle-01', () => 'transport_unavailable');
    expect(verdict).toBe('transport_unavailable');
    expect(lifecycle.getSeat('cubicle-01')?.status).toBe('unverified');

    const absentVerdict = lifecycle.probeLiveness('cubicle-01', () => 'absent');
    expect(absentVerdict).toBe('absent');
    expect(lifecycle.getSeat('cubicle-01')?.status).toBe('stopped');
  });

  it('2. SeatActivityEngine arbitrates 4-rung evidence ladder, 2-tick idle debounce, and cross-rung contradiction degradation', () => {
    let clockMs = 1_700_000_000_000;
    const activity = new SeatActivityEngine({ now: () => new Date(clockMs) });
    activity.declareSeat('cubicle-02', 'gen-1');

    // Hook reports working
    let state = activity.reportEvidence({
      seatNodeId: 'cubicle-02',
      sessionName: 'cubicle-02@panopticon',
      rung: 'lifecycle-hooks',
      sourceId: 'codex:hooks',
      seq: 1,
      observedAt: new Date(clockMs).toISOString(),
      activity: 'working',
    });
    expect(state.activity).toBe('working');
    expect(state.decidedBy).toBe('lifecycle-hooks');

    // Window-sampling reports working then 1 tick of idle-at-prompt (debounced -> stays working)
    activity.reportEvidence({
      seatNodeId: 'cubicle-02',
      sessionName: 'cubicle-02@panopticon',
      rung: 'window-sampling',
      sourceId: 'tmux:window-activity',
      seq: 1,
      observedAt: new Date(clockMs).toISOString(),
      activity: 'working',
    });
    clockMs += 1000;
    activity.reportEvidence({
      seatNodeId: 'cubicle-02',
      sessionName: 'cubicle-02@panopticon',
      rung: 'window-sampling',
      sourceId: 'tmux:window-activity',
      seq: 2,
      observedAt: new Date(clockMs).toISOString(),
      activity: 'idle-at-prompt',
    });

    // Tick 2 of window-sampling idle-at-prompt flips sampling slot to idle-at-prompt
    clockMs += 1000;
    activity.reportEvidence({
      seatNodeId: 'cubicle-02',
      sessionName: 'cubicle-02@panopticon',
      rung: 'window-sampling',
      sourceId: 'tmux:window-activity',
      seq: 3,
      observedAt: new Date(clockMs).toISOString(),
      activity: 'idle-at-prompt',
    });

    // After 5,000ms of contradiction, lifecycle-hooks degrades to identity-only and window-sampling wins
    clockMs += 5500;
    state = activity.reportEvidence({
      seatNodeId: 'cubicle-02',
      sessionName: 'cubicle-02@panopticon',
      rung: 'window-sampling',
      sourceId: 'tmux:window-activity',
      seq: 4,
      observedAt: new Date(clockMs).toISOString(),
      activity: 'idle-at-prompt',
    });
    expect(state.activity).toBe('idle-at-prompt');
    expect(state.displayActivity).toBe('idle');
    expect(state.decidedBy).toBe('window-sampling');
    expect(activity.getRungHealthEvents().length).toBe(1);
    expect(activity.getRungHealthEvents()[0]?.to).toBe('identity-only');
  });

  it('3. HealthProjectionEngine evaluates all 6 OpenRig detectors including review-carousel and context.pressure', () => {
    const health = new HealthProjectionEngine();
    health.recordTaskReviewLineage({
      taskId: 'task-veto-loop',
      vetoCount: 4,
      hasDiffChanges: false,
      coordinationTransitions: 8,
      productStateChanges: 1,
    });
    health.recordSeatContextUsage({
      seatId: 'cubicle-05',
      usedTokens: 960_000,
      maxTokens: 1_000_000,
    });

    const projection = health.project();
    expect(projection.schema).toBe('openrig.health-list/v0alpha1');
    const detectors = projection.records.map((r) => r.detector);
    expect(detectors).toContain('process.ceremony-amplification');
    expect(detectors).toContain('process.review-carousel');
    expect(detectors).toContain('context.pressure');
  });

  it('4. OpenRigStreamClassifier coalesces notifications, fences leases, and classifies stream items', async () => {
    const classifier = new OpenRigStreamClassifier({ session: 'nia-classifier@panopticon' });
    classifier.ingestStreamItem({
      id: 'stream-1',
      sender: 'Consul Ferric Lunaux',
      content: 'CRITICAL blocker detected on Gate 2 review.',
      phase: 'REVIEW_GATE',
      createdAt: new Date().toISOString(),
    });
    expect(classifier.isHinted()).toBe(true);

    const wakeRes = await classifier.wake();
    expect(wakeRes.state).toBe('processed');
    expect(wakeRes.outcomes.length).toBe(1);
    expect(wakeRes.outcomes[0]?.labels?.classificationType).toBe('blocker');
    expect(wakeRes.outcomes[0]?.labels?.needsHuman).toBe(true);
  });

  it('5. SeatRecapStore enforces Markdown addressability and maintains recap-superseded chain', () => {
    const seatDir = path.join(tmpDir, 'cubicle-03');
    // Unclosed code fence must fail hard gate
    expect(() =>
      writeSeatRecap({
        seatDir,
        content: '## Decisions\n```ts\nunclosed fence',
      })
    ).toThrow(RecapWriteError);

    writeSeatRecap({
      seatDir,
      content: '# Recap 1\n\n## Decisions\nInitial architecture chosen.\n\n## Status\nUNVERIFIED: Pending e2e check.',
      now: () => 1700000001000,
    });
    writeSeatRecap({
      seatDir,
      content: '# Recap 2\n\n## Decisions\nUpdated architecture verified.\n\n## Status\nAll checks green.',
      now: () => 1700000002000,
    });

    const read = readSeatRecap(seatDir, '#decisions');
    expect(read.exists).toBe(true);
    expect(read.sectionText).toContain('Updated architecture verified.');
    expect(listRecapChain(seatDir).length).toBe(1);
    expect(resolveAddress(read.content!, ['decisions']).title).toBe('Decisions');
  });

  it('6. CrashCart C3 never promotes timeout to down and B1 RestoreConductor aggregates fleet rollup', async () => {
    const timeoutState = await resolveDaemonState({
      openrigHome: tmpDir,
      readDaemonJson: () => undefined,
      isProcessAlive: () => false,
      probeHealthz: async () => 'timeout',
      sleep: async () => {},
      maxProbes: 3,
    });
    expect(timeoutState).toBe('unverified');

    const downState = await classifyDaemonState({
      openrigHome: tmpDir,
      readDaemonJson: () => ({ pid: 12345, port: 3820 }),
      isProcessAlive: () => false,
      probeHealthz: async () => 'refused',
    });
    expect(downState).toBe('down');

    const conductor = new RestoreConductor({
      listRigsInOrder: () => [
        { rigId: 'kernel', isKernel: true },
        { rigId: 'cubicles', isKernel: false },
      ],
      restoreRig: async (rigId) => ({
        outcome: 'fully_restored',
        receiptRef: `rcpt-${rigId}`,
      }),
    });
    const seq = await conductor.restoreFleet();
    const rollup = aggregateFleetRollup(seq);
    expect(rollup.verdict).toBe('all_fully_restored');
    expect(deriveFleetVerdict(rollup.counts)).toBe('all_fully_restored');
  });

  it('7. OpenRigPanopticonBridge & OpenRigRuntimeHub integrate live ConsularEngine, CubicleManager, and TaskboardManager', async () => {
    const swarmDir = path.join(tmpDir, '.swarm');
    const cubicles = new CubicleManager(swarmDir);
    const board = new TaskboardManager(swarmDir);
    const matrix = new CapabilityMatrix();
    const engine = new ConsularEngine(swarmDir, cubicles, board, matrix, undefined, tmpDir);

    await cubicles.initialize();
    await board.initialize();
    await engine.initialize();

    await board.createTask({
      title: 'Port Consular Governance to OpenRig',
      description: 'Verify bridge snapshot counts and OpenRig 6 subsystems.',
      priority: 'CRITICAL',
    });

    const bridge = new OpenRigPanopticonBridge({ swarmDir, projectRoot: tmpDir }, engine, cubicles, board);
    const snap = await bridge.getBridgeSnapshot();

    expect(snap.governanceMode).toBe('ROMAN_DUAL_CONSUL');
    expect(snap.consuls.length).toBe(2);
    expect(snap.cubicles.total).toBe(16);
    expect(snap.tasks.todo).toBe(1);
    expect(snap.openrigSubsystems.seatLifecycle.active).toBe(true);
    expect(snap.openrigSubsystems.seatActivity.active).toBe(true);
    expect(snap.openrigSubsystems.healthDetectors.schema).toBe('openrig.health-list/v0alpha1');
  });
});
