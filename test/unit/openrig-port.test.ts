import { describe, expect, it } from 'vitest';
import {
  arbitrateSeatActivityState,
  classifyCrashCartDaemonState,
  evaluateReviewCarouselDetector,
} from '../../src/openrig-port/index.js';

describe('OpenRig Port: Seat Activity Ladder, Crash-Cart C3 & Review Carousel Detector', () => {
  it('arbitrates 4-rung seat activity and degrades stale working hooks on 5s idle contradiction', () => {
    const now = 100_000;
    const active = arbitrateSeatActivityState(
      [
        { rung: 'lifecycle-hooks', state: 'working', observedAtMs: now - 2_000 },
        { rung: 'window-sampling', state: 'idle', observedAtMs: now - 500 },
      ],
      now,
      1_000
    );
    expect(active).toEqual({
      state: 'working',
      winningRung: 'lifecycle-hooks',
      degradedHook: false,
    });

    const contradicted = arbitrateSeatActivityState(
      [
        { rung: 'lifecycle-hooks', state: 'working', observedAtMs: now - 6_000 },
        { rung: 'window-sampling', state: 'idle', observedAtMs: now - 500 },
      ],
      now,
      5_500
    );
    expect(contradicted).toEqual({
      state: 'idle',
      winningRung: 'window-sampling',
      degradedHook: true,
    });
  });

  it('classifies Crash-Cart C3 state without promoting timeouts to down', () => {
    expect(
      classifyCrashCartDaemonState({ daemonRecordExists: true, pidAlive: true, healthStatus: 200 })
    ).toBe('up');
    expect(
      classifyCrashCartDaemonState({ daemonRecordExists: true, pidAlive: false, timedOut: true })
    ).toBe('unverified');
    expect(
      classifyCrashCartDaemonState({
        daemonRecordExists: true,
        pidAlive: false,
        allConnectionRefused: true,
      })
    ).toBe('down');
  });

  it('detects Gate 2 review carousel loops when returns >= 3 and candidateChanges === 0', () => {
    expect(evaluateReviewCarouselDetector({ reviewReturns: 2, candidateChanges: 0 })).toEqual({
      triggered: false,
      severity: 'none',
    });
    expect(evaluateReviewCarouselDetector({ reviewReturns: 3, candidateChanges: 0 })).toEqual({
      triggered: true,
      severity: 'warning',
    });
    expect(evaluateReviewCarouselDetector({ reviewReturns: 4, candidateChanges: 0 })).toEqual({
      triggered: true,
      severity: 'critical',
    });
  });
});
