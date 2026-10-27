import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ConsularEngine } from '../../src/server/consular-engine.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn(), exec: vi.fn(), execFile: vi.fn() }));

describe('CLI lifecycle deadlines and fail-closed results', () => {
  let engine: ConsularEngine;
  let child: any;
  let killer: any;
  beforeEach(() => {
    vi.useFakeTimers();
    child = Object.assign(new EventEmitter(), {
      pid: 999999, stdout: new EventEmitter(), stderr: new EventEmitter(),
      stdin: { write: vi.fn(), end: vi.fn() }, kill: vi.fn(),
    });
    killer = Object.assign(new EventEmitter(), { kill: vi.fn() });
    vi.mocked(spawn).mockImplementation(((command: string) => {
      if (command === 'taskkill') {
        queueMicrotask(() => killer.emit('close', 0));
        return killer;
      }
      return child;
    }) as any);
    engine = Object.create(ConsularEngine.prototype);
    Object.assign(engine, { projectRoot: process.cwd(), emit: vi.fn(), resolveConsulBinary: () => 'fake-cli' });
    vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    vi.spyOn(fs, 'readFile').mockResolvedValue('Partial success [REVIEW_TASK: {"decision":"APPROVE"}]');
    if (process.platform !== 'win32') vi.spyOn(process, 'kill').mockReturnValue(true);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.mocked(spawn).mockReset(); });

  it('allows active worker execution beyond both historical 420s and Consul 600s limits', async () => {
    let settled = false;
    const result = engine.invokeConsulCli('nia', 'work', 1200000).then(x => { settled = true; return x; });
    for (let i = 0; i < 11; i++) {
      await vi.advanceTimersByTimeAsync(60000);
      child.stdout.emit('data', Buffer.from('Working on verification\n'));
    }
    expect(settled).toBe(false);
    expect(child.kill).not.toHaveBeenCalled();
    child.emit('close', 0);
    expect(await result).toContain('Working on verification');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['nia', 'ferric'] as const)('terminates a hung %s process tree and returns actionable failure', async consul => {
    const result = engine.invokeConsulCli(consul, 'work', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const output = await result;
    expect(output).toContain('CLI Timeout');
    expect(output).toContain('deadline=1000ms');
    expect(output).toContain('pid=999999');
    expect(engine.isCliTimeoutOrError(output)).toBe(true);
    if (process.platform === 'win32') {
      expect(spawn).toHaveBeenCalledWith('taskkill', ['/F', '/T', '/PID', '999999'], expect.any(Object));
      expect(child.kill).not.toHaveBeenCalled();
    } else expect(process.kill).toHaveBeenCalledWith(-999999, 'SIGKILL');
    child.emit('close', 0); // A late close cannot replace the failure.
    expect(await result).toBe(output);
  });

  it('never accepts Ferric last-message file as success after a timeout', async () => {
    const result = engine.invokeConsulCli('ferric', 'work', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toContain('CLI Timeout');
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalled();
  });

  it.each(['nia', 'ferric'] as const)('rejects %s nonzero exit despite success-looking output', async consul => {
    const result = engine.invokeConsulCli(consul, 'work');
    child.stdout.emit('data', Buffer.from('All tests passed'));
    child.emit('close', 1);
    expect(await result).toContain('CLI Error (exit 1)');
  });

  it('rejects an empty successful Nia exit', async () => {
    const result = engine.invokeConsulCli('nia', 'work');
    child.emit('close', 0);
    expect(await result).toContain('CLI Error');
  });

  it('enforces a hard upper bound even when output continues', async () => {
    const result = engine.invokeConsulCli('nia', 'work', 1000);
    await vi.advanceTimersByTimeAsync(900);
    child.stdout.emit('data', Buffer.from('still active'));
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toContain('CLI Timeout');
  });

  it.skipIf(process.platform !== 'win32')('bounds a hung taskkill and reports incomplete cleanup', async () => {
    vi.mocked(spawn).mockImplementation(((command: string) => command === 'taskkill' ? killer : child) as any);
    const result = engine.invokeConsulCli('nia', 'work', 1000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toContain('tree cleanup timed out; verify descendants before retry');
    expect(child.kill).toHaveBeenCalled();
  });
});
