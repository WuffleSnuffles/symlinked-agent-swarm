import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { ConsularEngine } from '../../src/server/consular-engine.js';

it('cleans up a real hung CLI and its descendant', async () => {
  const engine = Object.create(ConsularEngine.prototype) as any;
  const child = spawn(process.execPath, ['-e', `
    const {spawn} = require('node:child_process');
    const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'ignore'});
    console.log(nested.pid);
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  let nestedPid: number | undefined;
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    nestedPid = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture did not start')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
    });
    expect(alive(child.pid!)).toBe(true);
    expect(alive(nestedPid)).toBe(true);
    const result = await engine.killProcessTree(child);
    expect(result).toMatch(/process (tree|group) terminated/);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(alive(child.pid!)).toBe(false);
    expect(alive(nestedPid)).toBe(false);
  } finally {
    if (child.pid && alive(child.pid)) await engine.killProcessTree(child);
    if (nestedPid && alive(nestedPid)) process.kill(nestedPid, 'SIGKILL');
  }
}, 15000);
