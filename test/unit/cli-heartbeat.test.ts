import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachChildActivityHeartbeat,
  buildLightweightVerificationInstruction,
  canProceedToGate2Review,
  createActivityHeartbeatTimer,
  DEFAULT_CLI_MAX_CEILING_MS,
  formatConsulCliTimeoutOutput,
  HeartbeatTimeoutInfo,
  isCliTimeoutOrError,
  isFullSuiteTestCommand,
  resolveHeartbeatTimeouts,
  selectTargetedVerificationCommands,
} from '../../src/server/cli-heartbeat.js';

describe('Activity-Heartbeat CLI Timer, Lightweight Worker Verification & Gate 2 Timeout Guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createActivityHeartbeatTimer & attachChildActivityHeartbeat', () => {
    it('resets the idle timer on stdout/stderr data chunks so active runs survive past a single idleTimeoutMs window', () => {
      const timeouts: HeartbeatTimeoutInfo[] = [];
      let currentTime = 1_000;

      const heartbeat = createActivityHeartbeatTimer({
        idleTimeoutMs: 100,
        maxCeilingMs: 500,
        now: () => currentTime,
        onTimeout: (info) => timeouts.push(info),
      });

      // Advance 70ms (under 100ms idle limit) and emit activity chunk 1
      currentTime += 70;
      vi.advanceTimersByTime(70);
      expect(heartbeat.recordActivity('chunk-1')).toBe(true);
      expect(timeouts).toHaveLength(0);

      // Advance another 70ms (total 140ms > 100ms initial window, but only 70ms since chunk-1)
      currentTime += 70;
      vi.advanceTimersByTime(70);
      expect(timeouts).toHaveLength(0);
      expect(heartbeat.recordActivity('chunk-2')).toBe(true);

      // Advance another 70ms (total 210ms elapsed) and finish cleanly
      currentTime += 70;
      vi.advanceTimersByTime(70);
      expect(timeouts).toHaveLength(0);
      expect(heartbeat.getState().resetCount).toBe(2);

      heartbeat.clear();
      currentTime += 500;
      vi.advanceTimersByTime(500);
      expect(timeouts).toHaveLength(0);
    });

    it('fires onTimeout with reason="idle_timeout" when stdout/stderr remains silent for idleTimeoutMs', () => {
      const timeouts: HeartbeatTimeoutInfo[] = [];
      let currentTime = 10_000;

      const heartbeat = createActivityHeartbeatTimer({
        idleTimeoutMs: 120,
        maxCeilingMs: 600,
        now: () => currentTime,
        onTimeout: (info) => timeouts.push(info),
      });

      // Emit one chunk at +50ms, then go silent
      currentTime += 50;
      vi.advanceTimersByTime(50);
      heartbeat.recordActivity('working...');
      expect(timeouts).toHaveLength(0);

      // Silence for 119ms -> not yet timed out
      currentTime += 119;
      vi.advanceTimersByTime(119);
      expect(timeouts).toHaveLength(0);

      // Reach 120ms of silence -> idle_timeout fires
      currentTime += 1;
      vi.advanceTimersByTime(1);
      expect(timeouts).toHaveLength(1);
      expect(timeouts[0].reason).toBe('idle_timeout');
      expect(timeouts[0].idleMs).toBe(120);
      expect(timeouts[0].elapsedMs).toBe(170);
      expect(timeouts[0].resetCount).toBe(1);
    });

    it('enforces maxCeilingMs with reason="max_ceiling" even when stdout/stderr data chunks keep arriving', () => {
      const timeouts: HeartbeatTimeoutInfo[] = [];
      let currentTime = 0;

      const heartbeat = createActivityHeartbeatTimer({
        idleTimeoutMs: 100,
        maxCeilingMs: 250,
        now: () => currentTime,
        onTimeout: (info) => timeouts.push(info),
      });

      // Keep sending chunks every 60ms so idle timer never reaches 100ms
      for (const step of [60, 60, 60, 60]) {
        currentTime += step;
        vi.advanceTimersByTime(step);
        heartbeat.recordActivity(`heartbeat at ${currentTime}ms`);
      }
      expect(currentTime).toBe(240);
      expect(timeouts).toHaveLength(0);

      // Final 10ms hits the 250ms max ceiling
      currentTime += 10;
      vi.advanceTimersByTime(10);
      expect(timeouts).toHaveLength(1);
      expect(timeouts[0].reason).toBe('max_ceiling');
      expect(timeouts[0].elapsedMs).toBe(250);
      expect(timeouts[0].resetCount).toBe(4);
    });

    it('attaches to child stdout/stderr streams, ignores empty chunks, and clears timers on child close', () => {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const child = Object.assign(new EventEmitter(), {
        pid: 4242,
        stdout,
        stderr,
      });

      const observed: Array<{ text: string; stream: 'stdout' | 'stderr' }> = [];
      const timeouts: HeartbeatTimeoutInfo[] = [];
      let currentTime = 5_000;

      const controller = attachChildActivityHeartbeat(child, {
        idleTimeoutMs: 100,
        maxCeilingMs: 400,
        now: () => currentTime,
        onActivity: (text, stream) => observed.push({ text, stream }),
        onTimeout: (info) => timeouts.push(info),
      });

      // Empty chunk does not reset timer
      currentTime += 40;
      vi.advanceTimersByTime(40);
      stdout.emit('data', Buffer.from(''));
      expect(controller.getState().resetCount).toBe(0);

      // Non-empty stdout & stderr chunks reset timer and trigger onActivity
      currentTime += 40;
      vi.advanceTimersByTime(40);
      stdout.emit('data', Buffer.from('Inspecting file...'));
      expect(controller.getState().resetCount).toBe(1);

      currentTime += 70;
      vi.advanceTimersByTime(70);
      stderr.emit('data', Buffer.from('Compiling types...'));
      expect(controller.getState().resetCount).toBe(2);
      expect(observed).toEqual([
        { text: 'Inspecting file...', stream: 'stdout' },
        { text: 'Compiling types...', stream: 'stderr' },
      ]);

      // Process closes cleanly -> timers cleared
      child.emit('close', 0);
      expect(controller.getState().settled).toBe(true);

      currentTime += 500;
      vi.advanceTimersByTime(500);
      expect(timeouts).toHaveLength(0);
    });

    it('resolves generous default maxCeilingMs for production CLI idle timeouts', () => {
      const resolved = resolveHeartbeatTimeouts(600_000);
      expect(resolved.idleTimeoutMs).toBe(600_000);
      expect(resolved.maxCeilingMs).toBe(Math.max(1_200_000, DEFAULT_CLI_MAX_CEILING_MS));
    });
  });

  describe('Lightweight Single-File Worker Verification Helpers', () => {
    it('identifies full-suite test commands vs targeted single-file verification commands', () => {
      expect(isFullSuiteTestCommand('npm test')).toBe(true);
      expect(isFullSuiteTestCommand('npm run test')).toBe(true);
      expect(isFullSuiteTestCommand('npx vitest run')).toBe(true);
      expect(isFullSuiteTestCommand('node node_modules/vitest/vitest.mjs run')).toBe(true);

      expect(
        isFullSuiteTestCommand('node node_modules/vitest/vitest.mjs run test/unit/cli-heartbeat.test.ts')
      ).toBe(false);
      expect(isFullSuiteTestCommand('npx vitest run test/unit/cli-heartbeat.test.ts')).toBe(false);
      expect(isFullSuiteTestCommand('node --check src/public/js/cubicle-grid.js')).toBe(false);
    });

    it('replaces npm test with targeted single-file verification derived from file_scope', () => {
      const commands = selectTargetedVerificationCommands({
        fileScope: ['src/server/cli-heartbeat.ts', 'test/unit/cli-heartbeat.test.ts'],
        verificationCommands: ['npm test'],
      });

      expect(commands).toEqual([
        'node node_modules/vitest/vitest.mjs run test/unit/cli-heartbeat.test.ts',
      ]);
      expect(commands.some((c) => c === 'npm test')).toBe(false);

      const instruction = buildLightweightVerificationInstruction({
        fileScope: ['src/server/cli-heartbeat.ts', 'test/unit/cli-heartbeat.test.ts'],
        verificationCommands: ['npm test'],
      });
      expect(instruction).toContain('test/unit/cli-heartbeat.test.ts');
      expect(instruction).toContain('rather than full test suites');
      expect(instruction).toContain('Google Drive I/O stalls');
    });

    it('infers unit test path from src/server/<module>.ts when no explicit test path is in file_scope', () => {
      const commands = selectTargetedVerificationCommands({
        fileScope: ['src/server/consular-engine.ts'],
        verificationCommands: ['npm test'],
      });
      expect(commands).toEqual([
        'node node_modules/vitest/vitest.mjs run test/unit/consular-engine.test.ts',
      ]);
    });
  });

  describe('isCliTimeoutOrError & Gate 2 Review Guard', () => {
    it('blocks formatted idle_timeout and max_ceiling Consul CLI outputs and all error variants from reaching Gate 2', () => {
      const niaIdleTimeout = formatConsulCliTimeoutOutput({
        consul: 'nia',
        pid: 1234,
        info: {
          reason: 'idle_timeout',
          idleTimeoutMs: 180_000,
          maxCeilingMs: 1_800_000,
          elapsedMs: 240_000,
          idleMs: 180_000,
          resetCount: 3,
          startedAt: 0,
          lastActivityAt: 60_000,
        },
        cleanupSummary: 'process tree terminated',
        diagnosticTail: 'stalled on tool call',
      });

      const ferricCeilingTimeout = formatConsulCliTimeoutOutput({
        consul: 'ferric',
        pid: 5678,
        info: {
          reason: 'max_ceiling',
          idleTimeoutMs: 180_000,
          maxCeilingMs: 1_800_000,
          elapsedMs: 1_800_000,
          idleMs: 5_000,
          resetCount: 42,
          startedAt: 0,
          lastActivityAt: 1_795_000,
        },
      });

      expect(isCliTimeoutOrError(niaIdleTimeout)).toBe(true);
      expect(isCliTimeoutOrError(ferricCeilingTimeout)).toBe(true);
      expect(canProceedToGate2Review(niaIdleTimeout)).toEqual({
        allowed: false,
        reason: niaIdleTimeout,
      });
      expect(canProceedToGate2Review(ferricCeilingTimeout)).toEqual({
        allowed: false,
        reason: ferricCeilingTimeout,
      });

      // Legacy timeout, spawn error, non-zero exit notice, empty, and [PASS] outputs
      expect(
        isCliTimeoutOrError('[Nia Nova]: My CLI turn timed out after 1200s while executing workspace tools.')
      ).toBe(true);
      expect(isCliTimeoutOrError('[Ferric Lunaux // CLI Spawn Error]: ENOENT')).toBe(true);
      expect(isCliTimeoutOrError('[Nia Nova // CLI Error (exit 1)]: trace')).toBe(true);
      expect(isCliTimeoutOrError('[Nia Nova // CLI Notice (exit 1)]: fatal')).toBe(true);
      expect(isCliTimeoutOrError('')).toBe(true);
      expect(canProceedToGate2Review('[PASS]').allowed).toBe(false);

      // Valid worker completion summary (including prose discussing CLI Timeout/Error) is allowed to proceed to Gate 2
      const validSummary =
        'Created src/server/cli-heartbeat.ts and test/unit/cli-heartbeat.test.ts to prevent false CLI Timeout or CLI Error rejections; all targeted single-file verification checks passed.';
      expect(isCliTimeoutOrError(validSummary)).toBe(false);
      expect(canProceedToGate2Review(validSummary)).toEqual({ allowed: true });
    });
  });
});
