import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CubicleMessages } from '../../src/server/cubicle-messages.js';

describe('durable cubicle collaboration', () => {
  it('preserves concurrent sends across restart and isolates recipient history', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-messages-'));
    try {
      const mailbox = new CubicleMessages(directory);
      await Promise.all(Array.from({ length: 20 }, (_, index) => mailbox.send({
        from: 'cubicle-01', to: 'cubicle-02', topic: 'shared interface', text: `finding ${index}`,
      })));
      const restored = new CubicleMessages(directory);
      const messages = await restored.history('cubicle-02');
      expect(messages).toHaveLength(20);
      expect(new Set(messages.map(m => m.id)).size).toBe(20);
      expect(await restored.history('cubicle-01')).toHaveLength(20);
      expect(await restored.history('cubicle-03')).toEqual([]);
      await expect(mailbox.send({ from: '../escape', to: 'cubicle-02', topic: 'x', text: 'x' })).rejects.toThrow();
      await expect(mailbox.send({ from: 'cubicle-01', to: 'cubicle-02', topic: 'x', text: ' ' })).rejects.toThrow();
      await expect(mailbox.send({ from: 'cubicle-01', to: 'cubicle-01', topic: 'x', text: 'x' })).rejects.toThrow();
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
