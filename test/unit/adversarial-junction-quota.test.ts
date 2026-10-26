/**
 * test/unit/adversarial-junction-quota.test.ts
 *
 * Empirical Adversarial Challenge Test Suite:
 * 1. Windows NTFS Directory Junctions (Zero-copy visibility, safe unlinking, target preservation).
 * 2. Stamina & Quota Exhaustion (0 tokens, negative tokens, 100% boundary, 0% exhausted transition).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { WorktreeManager } from '../../src/server/worktree-manager.js';
import { QuotaTracker } from '../../src/server/quota-tracker.js';
import { CubicleManager, InvalidTransitionError } from '../../src/server/cubicle-manager.js';

describe('Adversarial Challenge: NTFS Directory Junctions', () => {
  let tempRoot: string;
  let worktreeManager: WorktreeManager;

  beforeEach(async () => {
    tempRoot = path.join(os.tmpdir(), `adv_junction_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    await fs.mkdir(tempRoot, { recursive: true });
    worktreeManager = new WorktreeManager(tempRoot);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it('verifies unprivileged NTFS directory junction creation and verifyJunction returns true', async () => {
    const targetDir = path.join(tempRoot, '.swarm');
    const linkPath = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');

    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(path.dirname(linkPath), { recursive: true });

    await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);

    const isJunctionActive = await worktreeManager.verifyJunction(linkPath);
    expect(isJunctionActive).toBe(true);

    const lstat = await fs.lstat(linkPath);
    expect(lstat.isSymbolicLink() || lstat.isDirectory()).toBe(true);
  });

  it('demonstrates bi-directional zero-copy file visibility across worktrees', async () => {
    const targetDir = path.join(tempRoot, '.swarm');
    const link1 = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');
    const link2 = path.join(tempRoot, 'worktrees', 'cubicle-02', '.swarm');

    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(path.dirname(link1), { recursive: true });
    await fs.mkdir(path.dirname(link2), { recursive: true });

    await worktreeManager.createJunctionOrSymlink(targetDir, link1);
    await worktreeManager.createJunctionOrSymlink(targetDir, link2);

    // 1. Root writes -> both cubicles immediately see without copy
    const rootTaskFile = path.join(targetDir, 'tasks', 'todo', 'task-99.json');
    await fs.mkdir(path.dirname(rootTaskFile), { recursive: true });
    const payload = JSON.stringify({ id: 'task-99', title: 'Adversarial Verification Task' });
    await fs.writeFile(rootTaskFile, payload, 'utf8');

    const readFromC1 = await fs.readFile(path.join(link1, 'tasks', 'todo', 'task-99.json'), 'utf8');
    const readFromC2 = await fs.readFile(path.join(link2, 'tasks', 'todo', 'task-99.json'), 'utf8');
    expect(readFromC1).toBe(payload);
    expect(readFromC2).toBe(payload);

    // 2. Cubicle 1 updates file -> Root and Cubicle 2 instantly reflect modification
    const updatedPayload = JSON.stringify({ id: 'task-99', title: 'Modified by Cubicle 01' });
    await fs.writeFile(path.join(link1, 'tasks', 'todo', 'task-99.json'), updatedPayload, 'utf8');

    const readRootAfterMod = await fs.readFile(rootTaskFile, 'utf8');
    const readC2AfterMod = await fs.readFile(path.join(link2, 'tasks', 'todo', 'task-99.json'), 'utf8');
    expect(readRootAfterMod).toBe(updatedPayload);
    expect(readC2AfterMod).toBe(updatedPayload);

    // 3. Nested subdirectory creation in junction reflects in root
    const nestedSubdir = path.join(link2, 'subswarms', 'cubicle-02', 'child-01');
    await fs.mkdir(nestedSubdir, { recursive: true });
    await fs.writeFile(path.join(nestedSubdir, 'patch.diff'), 'DIFF_DATA', 'utf8');

    const rootSubdirFile = path.join(targetDir, 'subswarms', 'cubicle-02', 'child-01', 'patch.diff');
    expect(await fs.readFile(rootSubdirFile, 'utf8')).toBe('DIFF_DATA');
  });

  it('proves safe unlinking via safeRemoveJunction leaves target directory and contents 100% intact', async () => {
    const targetDir = path.join(tempRoot, '.swarm');
    const linkPath = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');

    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);

    // Populate target with critical data files
    const masterTaskboard = path.join(targetDir, 'TASKBOARD.md');
    const incidentLog = path.join(targetDir, 'logs', 'incidents.jsonl');
    await fs.mkdir(path.dirname(incidentLog), { recursive: true });

    await fs.writeFile(masterTaskboard, '# Master Swarm Taskboard\nActive: 16', 'utf8');
    await fs.writeFile(incidentLog, '{"event":"TEST_INCIDENT","code":500}\n', 'utf8');

    // Execute safe unlinking
    await worktreeManager.safeRemoveJunction(linkPath);

    // Link must no longer exist
    expect(await worktreeManager.verifyJunction(linkPath)).toBe(false);

    // Target directory and all files inside must exist completely intact!
    const targetStat = await fs.stat(targetDir);
    expect(targetStat.isDirectory()).toBe(true);

    const taskboardContent = await fs.readFile(masterTaskboard, 'utf8');
    expect(taskboardContent).toBe('# Master Swarm Taskboard\nActive: 16');

    const incidentContent = await fs.readFile(incidentLog, 'utf8');
    expect(incidentContent).toBe('{"event":"TEST_INCIDENT","code":500}\n');
  });

  it('handles safeRemoveJunction idempotently when junction path does not exist', async () => {
    const nonExistentPath = path.join(tempRoot, 'worktrees', 'non-existent-junction');
    await expect(worktreeManager.safeRemoveJunction(nonExistentPath)).resolves.not.toThrow();
  });

  it('re-links cleanly when createJunctionOrSymlink is called repeatedly on an existing junction', async () => {
    const targetDir = path.join(tempRoot, '.swarm');
    const linkPath = path.join(tempRoot, 'worktrees', 'cubicle-01', '.swarm');

    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(path.dirname(linkPath), { recursive: true });

    // First creation
    await worktreeManager.createJunctionOrSymlink(targetDir, linkPath);
    expect(await worktreeManager.verifyJunction(linkPath)).toBe(true);

    // Second creation (re-link overwrite)
    await expect(worktreeManager.createJunctionOrSymlink(targetDir, linkPath)).resolves.not.toThrow();
    expect(await worktreeManager.verifyJunction(linkPath)).toBe(true);
  });
});

describe('Adversarial Challenge: QuotaTracker & Stamina Boundary Math', () => {
  it('handles 0 maxTokens edge case: returns 0 stamina, 100 fatigue, and exhausted tier', () => {
    expect(QuotaTracker.calculateStamina(0, 0)).toBe(0);
    expect(QuotaTracker.calculateFatigue(0, 0)).toBe(100);
    expect(QuotaTracker.getStaminaTier(0)).toBe('exhausted');

    // With tokensUsed > 0
    expect(QuotaTracker.calculateStamina(0, 1000)).toBe(0);
    expect(QuotaTracker.calculateFatigue(0, 1000)).toBe(100);

    // With negative maxTokens
    expect(QuotaTracker.calculateStamina(-500, 0)).toBe(0);
  });

  it('handles negative tokens consumed in recordUsage without corrupting tokens_used', () => {
    const quota = {
      max_tokens: 1000000,
      tokens_used: 100000,
      max_cost_usd: 10,
      cost_usd_accumulated: 1.0,
    };

    const res = QuotaTracker.recordUsage(quota, -50000, -2.0);

    // tokens_used and cost should NOT decrease
    expect(quota.tokens_used).toBe(100000);
    expect(quota.cost_usd_accumulated).toBe(1.0);
    expect(res.staminaPercentage).toBe(90);
    expect(res.isExhausted).toBe(false);
  });

  it('clamps stamina to 100% when tokensUsed is negative in calculateStamina', () => {
    const stamina = QuotaTracker.calculateStamina(1000, -500);
    expect(stamina).toBe(100);
    expect(QuotaTracker.calculateFatigue(1000, -500)).toBe(0);
  });

  it('rigorously tests exact boundary percentages and tier thresholds', () => {
    // 100% boundary
    expect(QuotaTracker.calculateStamina(100000, 0)).toBe(100);
    expect(QuotaTracker.calculateFatigue(100000, 0)).toBe(0);
    expect(QuotaTracker.getStaminaTier(100)).toBe('energized');

    // 70% boundary (Tier 1 Energized lower bound)
    expect(QuotaTracker.getStaminaTier(70)).toBe('energized');

    // 69% boundary (Tier 2 Fatigued upper bound)
    expect(QuotaTracker.getStaminaTier(69)).toBe('fatigued');

    // 35% boundary (Tier 2 Fatigued lower bound)
    expect(QuotaTracker.getStaminaTier(35)).toBe('fatigued');

    // 34% boundary (Tier 3 Critical Strain upper bound)
    expect(QuotaTracker.getStaminaTier(34)).toBe('critical_strain');

    // 1% boundary (Tier 3 Critical Strain lower bound)
    expect(QuotaTracker.getStaminaTier(1)).toBe('critical_strain');

    // 0% boundary (Tier 4 Exhausted)
    expect(QuotaTracker.getStaminaTier(0)).toBe('exhausted');

    // Negative percentage fallback
    expect(QuotaTracker.getStaminaTier(-10)).toBe('exhausted');
  });

  it('correctly handles exact 100% quota consumption leading to 0% stamina', () => {
    const quota = {
      max_tokens: 500000,
      tokens_used: 0,
      max_cost_usd: 5,
      cost_usd_accumulated: 0,
    };

    const res = QuotaTracker.recordUsage(quota, 500000);
    expect(res.staminaPercentage).toBe(0);
    expect(res.fatiguePercentage).toBe(100);
    expect(res.staminaTier).toBe('exhausted');
    expect(res.isExhausted).toBe(true);
  });

  it('correctly handles overshoot (>100% consumption)', () => {
    const quota = {
      max_tokens: 500000,
      tokens_used: 400000,
      max_cost_usd: 5,
      cost_usd_accumulated: 4,
    };

    const res = QuotaTracker.recordUsage(quota, 200000); // 600,000 / 500,000 = 120%
    expect(quota.tokens_used).toBe(600000);
    expect(res.staminaPercentage).toBe(0);
    expect(res.fatiguePercentage).toBe(100);
    expect(res.staminaTier).toBe('exhausted');
    expect(res.isExhausted).toBe(true);
  });
});

describe('Adversarial Challenge: CubicleManager Lifecycle & Exhaustion State Transitions', () => {
  let tempDir: string;
  let swarmDir: string;
  let cubicleManager: CubicleManager;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `adv_cubicle_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    swarmDir = path.join(tempDir, '.swarm');
    await fs.mkdir(swarmDir, { recursive: true });
    cubicleManager = new CubicleManager(swarmDir);
    await cubicleManager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('transitions from working to exhausted when recordTokenConsumption consumes remaining quota', async () => {
    await cubicleManager.transitionStatus('cubicle-01', 'working', 'Task active');
    const c1 = cubicleManager.getCubicle('cubicle-01');
    expect(c1.status).toBe('working');

    const max = c1.config.quota.max_tokens;
    const updated = await cubicleManager.recordTokenConsumption('cubicle-01', max);

    expect(updated.status).toBe('exhausted');
    expect(updated.stamina_percentage).toBe(0);
    expect(updated.stamina_tier).toBe('exhausted');
    expect(updated.surface_thoughts).toContain('FLATLINED');
  });

  it('prevents transitioning from exhausted directly to working', async () => {
    await cubicleManager.transitionStatus('cubicle-01', 'working');
    const max = cubicleManager.getCubicle('cubicle-01').config.quota.max_tokens;
    await cubicleManager.recordTokenConsumption('cubicle-01', max);
    expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');

    // Attempt invalid transition directly to working
    await expect(
      cubicleManager.transitionStatus('cubicle-01', 'working')
    ).rejects.toThrow(InvalidTransitionError);
  });

  it('prevents any cubicle with 0% stamina from transitioning to working', async () => {
    const c1 = cubicleManager.getCubicle('cubicle-01');
    // Deplete quota while in idle
    await cubicleManager.recordTokenConsumption('cubicle-01', c1.config.quota.max_tokens);
    expect(c1.stamina_percentage).toBe(0);

    await expect(
      cubicleManager.transitionStatus('cubicle-01', 'working')
    ).rejects.toThrow(InvalidTransitionError);
  });

  it('recharges quota and restores cubicle status to idle from exhausted', async () => {
    await cubicleManager.transitionStatus('cubicle-01', 'working');
    const max = cubicleManager.getCubicle('cubicle-01').config.quota.max_tokens;
    await cubicleManager.recordTokenConsumption('cubicle-01', max);
    expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');

    // Recharge by resetting tokens used
    const recharged = await cubicleManager.rechargeQuota('cubicle-01');
    expect(recharged.status).toBe('idle');
    expect(recharged.stamina_percentage).toBe(100);
    expect(recharged.stamina_tier).toBe('energized');
    expect(recharged.surface_thoughts).toContain('Quota replenished');
  });

  it('recharges quota by adding additionalTokens to max_tokens and restores idle if stamina becomes > 0', async () => {
    const max = cubicleManager.getCubicle('cubicle-01').config.quota.max_tokens;
    await cubicleManager.recordTokenConsumption('cubicle-01', max);
    expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');

    // Add additional max tokens so remaining / newMax = 50%
    const recharged = await cubicleManager.rechargeQuota('cubicle-01', max);
    expect(recharged.config.quota.max_tokens).toBe(max + max);
    expect(recharged.stamina_percentage).toBe(50); // max / 2*max = 50%
    expect(recharged.status).toBe('idle');
    expect(recharged.stamina_tier).toBe('fatigued');
  });

  it('documents recharge with 0 or negative tokens behaving as full tokens_used reset', async () => {
    const max = cubicleManager.getCubicle('cubicle-01').config.quota.max_tokens;
    await cubicleManager.recordTokenConsumption('cubicle-01', max);
    expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');

    // Passing 0 tokens
    const rechargedWithZero = await cubicleManager.rechargeQuota('cubicle-01', 0);
    expect(rechargedWithZero.config.quota.tokens_used).toBe(0); // Full reset
    expect(rechargedWithZero.stamina_percentage).toBe(100);
  });
});
