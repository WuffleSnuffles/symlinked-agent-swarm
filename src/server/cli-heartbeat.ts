/**
 * src/server/cli-heartbeat.ts
 *
 * Activity-Heartbeat Timer, Lightweight Single-File Worker Verification,
 * and Gate 2 CLI Timeout/Error Guard for Consular & Worker CLI Execution.
 *
 * Replaces rigid wall-clock CLI timeouts with an activity-resetting idle timer
 * bounded by a generous maximum wall-clock ceiling, prevents Google Drive I/O
 * stalls by instructing dispatched workers to run only targeted single-file
 * verification rather than full test suites, and blocks any timed-out or errored
 * CLI run from reaching Gate 2 Consular Review.
 */

import path from 'node:path';

export const DEFAULT_CLI_IDLE_TIMEOUT_MS = 180_000; // 3 minutes of silence before idle timeout
export const DEFAULT_CLI_MAX_CEILING_MS = 1_800_000; // 30 minutes generous max wall-clock ceiling

export type HeartbeatTimeoutReason = 'idle_timeout' | 'max_ceiling';

export interface HeartbeatTimeoutInfo {
  reason: HeartbeatTimeoutReason;
  idleTimeoutMs: number;
  maxCeilingMs: number;
  elapsedMs: number;
  idleMs: number;
  resetCount: number;
  startedAt: number;
  lastActivityAt: number;
}

export interface ActivityHeartbeatOptions {
  /**
   * Maximum allowed idle duration (ms) without stdout/stderr data before timing out.
   */
  idleTimeoutMs: number;
  /**
   * Maximum total wall-clock ceiling (ms) regardless of ongoing stdout/stderr activity.
   * Defaults to Math.max(idleTimeoutMs * 2, DEFAULT_CLI_MAX_CEILING_MS) for production
   * timeouts, or idleTimeoutMs * 3 when idleTimeoutMs is small in tests.
   */
  maxCeilingMs?: number;
  /**
   * Invoked at most once when either the idle timer or max ceiling expires.
   */
  onTimeout: (info: HeartbeatTimeoutInfo) => void | Promise<void>;
  /**
   * Optional clock source for deterministic testing.
   */
  now?: () => number;
  /**
   * When true (default), empty 0-byte chunks do not reset the idle timer.
   */
  ignoreEmptyChunks?: boolean;
}

export interface ActivityHeartbeatState {
  settled: boolean;
  timedOut: boolean;
  reason: HeartbeatTimeoutReason | null;
  idleTimeoutMs: number;
  maxCeilingMs: number;
  startedAt: number;
  lastActivityAt: number;
  elapsedMs: number;
  idleMs: number;
  resetCount: number;
}

export interface ActivityHeartbeatController {
  /**
   * Resets the idle timer upon receiving stdout/stderr output activity,
   * bounded by maxCeilingMs.
   */
  recordActivity: (chunk?: Buffer | string) => boolean;
  /**
   * Alias for recordActivity.
   */
  touch: (chunk?: Buffer | string) => boolean;
  /**
   * Disarms both idle and max-ceiling timers (call on child close/error).
   */
  clear: () => void;
  /**
   * Returns a snapshot of current heartbeat timing telemetry.
   */
  getState: () => ActivityHeartbeatState;
  /**
   * Formats diagnostic string with PID, reason, idle deadline, max ceiling, elapsed, and last output age.
   */
  formatDiagnostic: (pid?: number) => string;
}

export interface ChildLikeProcess {
  pid?: number;
  stdout?: { on(event: 'data', listener: (chunk: Buffer | string) => void): any } | null;
  stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): any } | null;
  once?: (event: 'close' | 'error', listener: (...args: any[]) => void) => any;
}

export interface AttachChildHeartbeatOptions extends ActivityHeartbeatOptions {
  onActivity?: (text: string, stream: 'stdout' | 'stderr') => void;
}

/**
 * Resolves effective idleTimeoutMs and maxCeilingMs from a caller's timeoutMs argument.
 * Preserves short test timeouts while ensuring production CLI invocations use an
 * activity-resetting idle window up to a generous max wall-clock ceiling.
 */
export function resolveHeartbeatTimeouts(
  timeoutMs: number = 600_000,
  explicitMaxCeilingMs?: number
): { idleTimeoutMs: number; maxCeilingMs: number } {
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_CLI_IDLE_TIMEOUT_MS;
  const idleTimeoutMs = safeTimeout;
  const defaultCeiling =
    safeTimeout >= 60_000
      ? Math.max(safeTimeout * 2, DEFAULT_CLI_MAX_CEILING_MS)
      : safeTimeout * 3;
  const maxCeilingMs =
    explicitMaxCeilingMs !== undefined && Number.isFinite(explicitMaxCeilingMs) && explicitMaxCeilingMs > 0
      ? Math.max(explicitMaxCeilingMs, idleTimeoutMs)
      : defaultCeiling;
  return { idleTimeoutMs, maxCeilingMs };
}

/**
 * Creates an activity-resetting idle timer bounded by a maximum wall-clock ceiling.
 */
export function createActivityHeartbeatTimer(
  options: ActivityHeartbeatOptions
): ActivityHeartbeatController {
  const now = options.now ?? (() => Date.now());
  const ignoreEmpty = options.ignoreEmptyChunks ?? true;
  const { idleTimeoutMs, maxCeilingMs } = resolveHeartbeatTimeouts(
    options.idleTimeoutMs,
    options.maxCeilingMs
  );

  const startedAt = now();
  let lastActivityAt = startedAt;
  let resetCount = 0;
  let settled = false;
  let timedOut = false;
  let timeoutReason: HeartbeatTimeoutReason | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let ceilingTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (ceilingTimer !== null) {
      clearTimeout(ceilingTimer);
      ceilingTimer = null;
    }
  };

  const triggerTimeout = (reason: HeartbeatTimeoutReason) => {
    if (settled) return;
    settled = true;
    timedOut = true;
    timeoutReason = reason;
    clearTimers();

    const currentNow = now();
    const info: HeartbeatTimeoutInfo = {
      reason,
      idleTimeoutMs,
      maxCeilingMs,
      elapsedMs: Math.max(0, currentNow - startedAt),
      idleMs: Math.max(0, currentNow - lastActivityAt),
      resetCount,
      startedAt,
      lastActivityAt,
    };

    void options.onTimeout(info);
  };

  const armIdleTimer = () => {
    if (settled) return;
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const currentNow = now();
    const elapsedMs = Math.max(0, currentNow - startedAt);
    const remainingCeilingMs = maxCeilingMs - elapsedMs;
    if (remainingCeilingMs <= 0) {
      triggerTimeout('max_ceiling');
      return;
    }

    const nextDelayMs = Math.min(idleTimeoutMs, remainingCeilingMs);
    const nextReason: HeartbeatTimeoutReason =
      remainingCeilingMs <= idleTimeoutMs ? 'max_ceiling' : 'idle_timeout';

    idleTimer = setTimeout(() => {
      triggerTimeout(nextReason);
    }, nextDelayMs);
  };

  // Arm overall maximum wall-clock ceiling timer
  ceilingTimer = setTimeout(() => {
    triggerTimeout('max_ceiling');
  }, maxCeilingMs);

  // Arm initial idle timer
  armIdleTimer();

  const recordActivity = (chunk?: Buffer | string): boolean => {
    if (settled) return false;
    if (ignoreEmpty && chunk !== undefined) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (text.length === 0) {
        return false;
      }
    }

    const currentNow = now();
    const elapsedMs = Math.max(0, currentNow - startedAt);
    if (elapsedMs >= maxCeilingMs) {
      triggerTimeout('max_ceiling');
      return false;
    }

    lastActivityAt = currentNow;
    resetCount += 1;
    armIdleTimer();
    return true;
  };

  const clear = () => {
    if (settled) return;
    settled = true;
    clearTimers();
  };

  const getState = (): ActivityHeartbeatState => {
    const currentNow = now();
    return {
      settled,
      timedOut,
      reason: timeoutReason,
      idleTimeoutMs,
      maxCeilingMs,
      startedAt,
      lastActivityAt,
      elapsedMs: Math.max(0, currentNow - startedAt),
      idleMs: Math.max(0, currentNow - lastActivityAt),
      resetCount,
    };
  };

  const formatDiagnostic = (pid?: number): string => {
    const state = getState();
    const reasonLabel = state.reason ?? 'idle_timeout';
    return `pid=${pid ?? 'unknown'}, reason=${reasonLabel}, deadline=${state.idleTimeoutMs}ms, maxCeiling=${state.maxCeilingMs}ms, elapsed=${state.elapsedMs}ms, last output ${state.idleMs}ms ago (resets=${state.resetCount}). Execution incomplete; inspect diagnostics before retry.`;
  };

  return {
    recordActivity,
    touch: recordActivity,
    clear,
    getState,
    formatDiagnostic,
  };
}

/**
 * Attaches an activity-resetting heartbeat timer directly to a spawned child process's
 * stdout and stderr streams and cleans up automatically when the process closes or errors.
 */
export function attachChildActivityHeartbeat(
  child: ChildLikeProcess,
  options: AttachChildHeartbeatOptions
): ActivityHeartbeatController {
  const controller = createActivityHeartbeatTimer(options);

  child.stdout?.on('data', (chunk: Buffer | string) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (controller.recordActivity(str)) {
      options.onActivity?.(str, 'stdout');
    }
  });

  child.stderr?.on('data', (chunk: Buffer | string) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (controller.recordActivity(str)) {
      options.onActivity?.(str, 'stderr');
    }
  });

  child.once?.('close', () => {
    controller.clear();
  });

  child.once?.('error', () => {
    controller.clear();
  });

  return controller;
}

/**
 * Formats a Consul CLI timeout string for Nia Nova or Ferric Lunaux that is guaranteed
 * to be recognized by isCliTimeoutOrError and blocked from reaching Gate 2.
 */
export function formatConsulCliTimeoutOutput(params: {
  consul: 'nia' | 'ferric';
  info: HeartbeatTimeoutInfo;
  pid?: number;
  cleanupSummary?: string;
  diagnosticTail?: string;
}): string {
  const consulName = params.consul === 'nia' ? 'Nia Nova' : 'Ferric Lunaux';
  const effectiveMs =
    params.info.reason === 'max_ceiling' ? params.info.maxCeilingMs : params.info.idleTimeoutMs;
  const seconds = Math.max(1, Math.round(effectiveMs / 1000));
  const cleanTail = (params.diagnosticTail || '')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .trim()
    .slice(-300);
  const cleanup = (params.cleanupSummary || 'process tree terminated').trim();
  const detail = [
    `pid=${params.pid ?? 'unknown'}, reason=${params.info.reason}, deadline=${params.info.idleTimeoutMs}ms, maxCeiling=${params.info.maxCeilingMs}ms, elapsed=${params.info.elapsedMs}ms, last output ${params.info.idleMs}ms ago (resets=${params.info.resetCount}). Execution incomplete; inspect diagnostics before retry.`,
    `${cleanup}.`,
    cleanTail,
  ]
    .filter(Boolean)
    .join(' ');

  return `[${consulName} // CLI Timeout after ${seconds}s]: ${detail}`;
}

/**
 * Determines whether a verification command runs the entire test suite rather than
 * a single targeted test file (which causes Google Drive I/O stalls).
 */
export function isFullSuiteTestCommand(command: string): boolean {
  const trimmed = String(command || '').trim();
  if (!trimmed) return true;

  // Explicit single-file test target (.test. or .spec.) is allowed
  if (/\b[\w./\\-]+\.(?:test|spec)\.[cm]?[jt]sx?\b/i.test(trimmed)) {
    return false;
  }

  // Fast single-file syntax check (e.g. node --check file.js) is allowed
  if (/^node\s+--check\s+\S+/i.test(trimmed)) {
    return false;
  }

  // Unfiltered npm test / vitest runs execute the full test suite and stall Google Drive I/O
  if (
    /^(?:npm\s+(?:run\s+)?test|npx\s+vitest(?:\s+run)?|vitest(?:\s+run)?|node\s+[\w./\\-]*vitest\.mjs(?:\s+run)?)\s*$/i.test(
      trimmed
    )
  ) {
    return true;
  }

  return /\b(?:npm\s+test|npm\s+run\s+test)\b/i.test(trimmed);
}

/**
 * Derives targeted single-file verification commands from a task's file_scope and
 * existing verification_commands, stripping full-suite `npm test` commands to avoid
 * Google Drive I/O stalls.
 */
export function selectTargetedVerificationCommands(options?: {
  fileScope?: string[];
  verificationCommands?: string[];
}): string[] {
  const scope = (options?.fileScope || [])
    .map((entry) => String(entry || '').replace(/\\/g, '/').trim())
    .filter((entry) => entry && entry !== '.');
  const rawCommands = (options?.verificationCommands || [])
    .map((cmd) => String(cmd || '').trim())
    .filter(Boolean);

  const targeted: string[] = [];

  // 1. Keep any already-targeted verification commands (e.g., single test file or node --check)
  for (const cmd of rawCommands) {
    if (!isFullSuiteTestCommand(cmd) && !targeted.includes(cmd)) {
      targeted.push(cmd);
    }
  }

  // 2. Include any explicit test files from file_scope as single-file vitest commands
  for (const file of scope) {
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file)) {
      const cmd = `node node_modules/vitest/vitest.mjs run ${file}`;
      if (!targeted.some((existing) => existing.includes(file))) {
        targeted.push(cmd);
      }
    }
  }

  // 3. If no test file was in scope, infer the matching unit test or syntax check from source files
  if (targeted.length === 0) {
    for (const file of scope) {
      if (/^src\/.+\.ts$/i.test(file)) {
        const base = path.posix.basename(file, '.ts');
        const inferredTest = `test/unit/${base}.test.ts`;
        const cmd = `node node_modules/vitest/vitest.mjs run ${inferredTest}`;
        if (!targeted.includes(cmd)) {
          targeted.push(cmd);
        }
      } else if (/\.js$/i.test(file)) {
        const cmd = `node --check ${file}`;
        if (!targeted.includes(cmd)) {
          targeted.push(cmd);
        }
      }
    }
  }

  // 4. Final fallback if scope was empty or generic
  if (targeted.length === 0) {
    targeted.push('node node_modules/vitest/vitest.mjs run <targeted-test-file>');
  }

  return targeted;
}

/**
 * Builds the worker prompt instruction directing dispatched workers to run ONLY
 * targeted single-file verification rather than full test suites to avoid Google Drive I/O stalls.
 */
export function buildLightweightVerificationInstruction(options?: {
  fileScope?: string[];
  verificationCommands?: string[];
}): string {
  const commands = selectTargetedVerificationCommands(options);
  return `Run ONLY targeted single-file verification (${commands.join(' ; ')}) rather than full test suites (NEVER run unfiltered "npm test" or full-repo vitest) to avoid Google Drive I/O stalls.`;
}

/**
 * Detects whether an invokeConsulCli return string represents a CLI timeout (idle or max ceiling),
 * spawn failure, non-zero exit notice, or execution error.
 */
export function isCliTimeoutOrError(output: string): boolean {
  const trimmed = String(output || '').trim();
  if (!trimmed) return true;
  return (
    /^\[(Nia Nova|Ferric Lunaux)\s*\/\/\s*CLI (Spawn Error|Timeout|Idle Timeout|Max-Ceiling Timeout|Heartbeat Timeout|Error|Notice)/i.test(
      trimmed
    ) ||
    /^\[(Nia Nova|Ferric Lunaux)\]:\s*My CLI (turn|execution) timed out after\b/i.test(trimmed) ||
    /^CLI (Spawn Error|Timeout|Idle Timeout|Max-Ceiling Timeout|Heartbeat Timeout|Error)\s*:/i.test(
      trimmed
    ) ||
    /^\[?(?:CLI )?(?:Spawn Error|Timeout|Idle Timeout|Max-Ceiling Timeout|Heartbeat Timeout|Error)(?:\s+after\s+\d+(?:\.\d+)?s)?\]?\s*:/i.test(
      trimmed
    ) ||
    /\bpid=(?:\d+|unknown),\s*(?:reason=(?:idle_timeout|max_ceiling),\s*)?deadline=\d+ms\b/i.test(
      trimmed
    )
  );
}

/**
 * Gate 2 guard verifying that a worker CLI run output is eligible for Gate 2 Consular Review.
 * Blocks any timed-out, errored, empty, or [PASS] output from reaching Gate 2.
 */
export function canProceedToGate2Review(workerOutput: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmed = String(workerOutput || '').trim();
  if (isCliTimeoutOrError(trimmed)) {
    return {
      allowed: false,
      reason: trimmed || 'Worker CLI execution timed out or returned an empty/error response.',
    };
  }
  if (/^\[PASS\]/i.test(trimmed)) {
    return {
      allowed: false,
      reason: 'Worker CLI returned [PASS] without completion evidence.',
    };
  }
  return { allowed: true };
}
