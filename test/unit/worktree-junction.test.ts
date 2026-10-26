/**
 * test/unit/worktree-junction.test.ts
 *
 * Unit tests for Git Worktree Isolation, Windows NTFS Directory Junctions,
 * Dual Junction Linking (.swarm and .agents), and Safe Unlinking (Feature 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { WorktreeManager } from '../../src/server/worktree-manager.js';

describe('Feature 3: Git Worktrees & Windows NTFS Directory Junctions', () => {
  let tempRoot: string;
  let worktreeManager: WorktreeManager;

  beforeEach(async () => {
    tempRoot = path.join(os.tmpdir(), `worktree_unit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    await fs.mkdir(tempRoot, { recursive: true });
    worktreeManager = new WorktreeManager(tempRoot);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  describe('NTFS Directory Junction Creation & Zero-Copy Sharing', () => {
    it('creates an NTFS directory junction with zero administrative elevation', async () => {
      const targetDir = path.join(tempRoot, '.swarm');
      const linkPath = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');

      await fs.mkdir(targetDir, { recursive: true });
      await fs.mkdir(path.dirname(linkPath), { recursive: true });

      await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);

      const isActive = await worktreeManager.verifyJunction(linkPath);
      expect(isActive).toBe(true);

      const lstat = await fs.lstat(linkPath);
      expect(lstat.isSymbolicLink() || lstat.isDirectory()).toBe(true);
    });

    it('demonstrates zero-copy instant bi-directional file visibility across junction', async () => {
      const targetDir = path.join(tempRoot, '.swarm');
      const linkPath = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');

      await fs.mkdir(targetDir, { recursive: true });
      await fs.mkdir(path.dirname(linkPath), { recursive: true });
      await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);

      // Write to target, read from junction
      const testFileInTarget = path.join(targetDir, 'shared-state.txt');
      await fs.writeFile(testFileInTarget, 'SHARED_TELEMETRY_DATA_123', 'utf8');

      const testFileInJunction = path.join(linkPath, 'shared-state.txt');
      const readContent = await fs.readFile(testFileInJunction, 'utf8');
      expect(readContent).toBe('SHARED_TELEMETRY_DATA_123');

      // Write to junction, read from target
      const testFileFromJunction = path.join(linkPath, 'cubicle-heartbeat.json');
      await fs.writeFile(testFileFromJunction, JSON.stringify({ alive: true }), 'utf8');

      const testFileFromTarget = path.join(targetDir, 'cubicle-heartbeat.json');
      const readHeartbeat = await fs.readFile(testFileFromTarget, 'utf8');
      expect(JSON.parse(readHeartbeat)).toEqual({ alive: true });
    });
  });

  describe('Safe Junction Removal via rmdir (Target Invariant Protection)', () => {
    it('safely removes junction link without deleting or modifying target contents', async () => {
      const targetDir = path.join(tempRoot, '.swarm');
      const linkPath = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');

      await fs.mkdir(targetDir, { recursive: true });
      await fs.mkdir(path.dirname(linkPath), { recursive: true });
      await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);

      // Write important master file to target
      const masterTaskboard = path.join(targetDir, 'TASKBOARD.md');
      await fs.writeFile(masterTaskboard, '# Master Swarm Taskboard Data', 'utf8');

      // Safely unlink the junction
      await worktreeManager.safeRemoveJunction(linkPath);

      // Link path should no longer exist
      const linkStillExists = await worktreeManager.verifyJunction(linkPath);
      expect(linkStillExists).toBe(false);

      // CRITICAL INVARIANT: Master target directory and file MUST remain completely intact!
      const targetStillExists = await fs.stat(targetDir).then(() => true).catch(() => false);
      expect(targetStillExists).toBe(true);

      const masterContent = await fs.readFile(masterTaskboard, 'utf8');
      expect(masterContent).toBe('# Master Swarm Taskboard Data');
    });
  });

  describe('Dual Junction Linking (.swarm and .agents)', () => {
    it('links both .swarm and .agents inside cubicle worktree simultaneously', async () => {
      const worktreePath = path.join(tempRoot, 'worktrees', 'cubicle-02');
      await fs.mkdir(worktreePath, { recursive: true });

      const junctions = await worktreeManager.linkSharedDirectories(worktreePath);
      expect(junctions.swarmActive).toBe(true);
      expect(junctions.agentsActive).toBe(true);

      // Verify .agents junction transmits learned preferences
      const preferencesFile = path.join(tempRoot, '.agents', 'rules', 'USER_PREFERENCES.md');
      await fs.mkdir(path.dirname(preferencesFile), { recursive: true });
      await fs.writeFile(preferencesFile, '# Rule: Always use TypeScript strict mode', 'utf8');

      const inheritedPrefFile = path.join(worktreePath, '.agents', 'rules', 'USER_PREFERENCES.md');
      const inherited = await fs.readFile(inheritedPrefFile, 'utf8');
      expect(inherited).toBe('# Rule: Always use TypeScript strict mode');
    });
  });

  describe('Root .gitignore Maintenance', () => {
    it('appends /worktrees/ and /.swarm/ to root .gitignore idempotently', async () => {
      const initialGitignore = '# Existing project ignores\nnode_modules/\ndist/\n';
      const gitignorePath = path.join(tempRoot, '.gitignore');
      await fs.writeFile(gitignorePath, initialGitignore, 'utf8');

      const updated = await worktreeManager.ensureGitIgnore();
      expect(updated).toBe(true);

      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toContain('/worktrees/');
      expect(content).toContain('/.swarm/');

      // Subsequent call does not duplicate entries
      const secondUpdate = await worktreeManager.ensureGitIgnore();
      expect(secondUpdate).toBe(false);
    });
  });
});
