import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorktreeManager } from '../../src/server/worktree-manager.js';

describe('Dispatch isolation with real Git and shared directory junctions', () => {
  it('preserves tracked shared files, reuses worktrees, isolates source edits and safely removes links', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-junction-integration-'));
    const manager = new WorktreeManager(root);
    try {
      await manager.execGit(['init']);
      for (const name of ['.swarm', '.agents', 'node_modules']) {
        await fs.mkdir(path.join(root, name));
        await fs.writeFile(path.join(root, name, 'sentinel.txt'), name);
      }
      await fs.writeFile(path.join(root, 'source.txt'), 'base');
      await manager.execGit(['add', '.swarm', '.agents', 'source.txt']);
      await manager.execGit(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
      const first = await manager.provisionWorktree('cubicle-01');
      const second = await manager.provisionWorktree('cubicle-02');
      expect(first.worktreePath).toBe(path.join(root, 'worktrees', 'cubicle-01'));
      for (const name of ['.swarm', '.agents', 'node_modules']) {
        expect((await fs.lstat(path.join(first.worktreePath, name))).isSymbolicLink()).toBe(true);
        expect(await fs.realpath(path.join(first.worktreePath, name))).toBe(await fs.realpath(path.join(root, name)));
      }
      await fs.writeFile(path.join(first.worktreePath, 'source.txt'), 'worker one');
      await fs.writeFile(path.join(first.worktreePath, '.swarm', 'shared.txt'), 'visible');
      expect(await fs.readFile(path.join(second.worktreePath, '.swarm', 'shared.txt'), 'utf8')).toBe('visible');
      expect(await fs.readFile(path.join(root, 'source.txt'), 'utf8')).toBe('base');
      expect(await fs.readFile(path.join(second.worktreePath, 'source.txt'), 'utf8')).toBe('base');
      await manager.provisionWorktree('cubicle-01');
      expect(await fs.readFile(path.join(first.worktreePath, 'source.txt'), 'utf8')).toBe('worker one');
      await manager.removeWorktree('cubicle-01');
      for (const name of ['.swarm', '.agents', 'node_modules']) {
        expect(await fs.readFile(path.join(root, name, 'sentinel.txt'), 'utf8')).toBe(name);
      }
    } finally {
      // Unlink shared directories before removing this test's verified temp root.
      for (const id of ['cubicle-01', 'cubicle-02']) {
        for (const name of ['.swarm', '.agents', 'node_modules']) {
          await manager.safeRemoveJunction(path.join(root, 'worktrees', id, name));
        }
      }
      if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('dispatch-junction-integration-')) {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  }, 30000);
});
