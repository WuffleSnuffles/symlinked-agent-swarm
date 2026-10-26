/**
 * test/unit/cubicle-roster.test.ts
 *
 * Unit tests for 16-Cubicle Grid Roster, Lifecycle State Machine,
 * Stamina/Fatigue Math, and Pluggable CLI Engine (Feature 1).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { CubicleManager, InvalidTransitionError } from '../../src/server/cubicle-manager.js';
import { QuotaTracker } from '../../src/server/quota-tracker.js';
import { CLIEngine } from '../../src/server/cli-engine.js';
import { DEFAULT_CUBICLE_ROSTER } from '../../src/server/types/cubicle-defaults.js';

describe('Feature 1: 16-Cubicle Grid Roster & CLI Engine', () => {
  let tempDir: string;
  let swarmDir: string;
  let cubicleManager: CubicleManager;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `swarm_roster_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
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

  describe('16-Slot 4x4 Grid Topology & Default Roster', () => {
    it('initializes exactly 16 cubicle slots arranged in 4x4 spatial coordinates', () => {
      const all = cubicleManager.getAllCubicles();
      expect(all).toHaveLength(16);

      for (let i = 0; i < 16; i++) {
        const cubicle = all[i];
        const num = String(i + 1).padStart(2, '0');
        expect(cubicle.id).toBe(`cubicle-${num}`);
        expect(cubicle.config.slot_index).toBe(i);
        expect(cubicle.config.row).toBe(Math.floor(i / 4));
        expect(cubicle.config.col).toBe(i % 4);
      }
    });

    it('pre-configures Cubicle 1 and 2 as Gemini 4 Argon (High) with sub-swarm authorized', () => {
      const c1 = cubicleManager.getCubicle('cubicle-01');
      const c2 = cubicleManager.getCubicle('cubicle-02');

      expect(c1.config.enabled).toBe(true);
      expect(c1.config.brand).toBe('Gemini');
      expect(c1.config.model).toBe('gemini-4-argon');
      expect(c1.config.thinking_level).toBe('High');
      expect(c1.config.can_spawn_subswarm).toBe(true);
      expect(c1.status).toBe('idle');

      expect(c2.config.enabled).toBe(true);
      expect(c2.config.brand).toBe('Gemini');
      expect(c2.config.model).toBe('gemini-4-argon');
      expect(c2.config.thinking_level).toBe('High');
      expect(c2.config.can_spawn_subswarm).toBe(true);
      expect(c2.status).toBe('idle');
    });

    it('pre-configures Cubicle 3 as GPT Astra (Very High) with sub-swarm strictly RESTRICTED', () => {
      const c3 = cubicleManager.getCubicle('cubicle-03');

      expect(c3.config.enabled).toBe(true);
      expect(c3.config.brand).toBe('GPT / OpenAI');
      expect(c3.config.model).toBe('gpt-astra');
      expect(c3.config.thinking_level).toBe('Very High');
      expect(c3.config.can_spawn_subswarm).toBe(false); // CRITICAL INVARIANT
      expect(c3.status).toBe('idle');
    });

    it('initializes Cubicles 4 through 16 as vacant and unassigned', () => {
      const all = cubicleManager.getAllCubicles();
      const vacantSlots = all.slice(3);

      expect(vacantSlots).toHaveLength(13);
      for (const slot of vacantSlots) {
        expect(slot.config.enabled).toBe(false);
        expect(slot.status).toBe('vacant');
        expect(slot.config.brand).toBeNull();
        expect(slot.config.model).toBeNull();
        expect(slot.config.can_spawn_subswarm).toBe(false);
      }
    });
  });

  describe('Lifecycle State Transitions & Validation', () => {
    it('allows valid lifecycle transitions (idle -> working -> under_inspection -> idle)', async () => {
      let c1 = cubicleManager.getCubicle('cubicle-01');
      expect(c1.status).toBe('idle');

      c1 = await cubicleManager.transitionStatus('cubicle-01', 'working', 'Task claimed');
      expect(c1.status).toBe('working');

      c1 = await cubicleManager.transitionStatus('cubicle-01', 'under_inspection', 'Submitted for review');
      expect(c1.status).toBe('under_inspection');

      c1 = await cubicleManager.transitionStatus('cubicle-01', 'idle', 'Consular approval');
      expect(c1.status).toBe('idle');
    });

    it('rejects invalid state transition from vacant directly to working', async () => {
      await expect(
        cubicleManager.transitionStatus('cubicle-04', 'working')
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('rejects invalid state transition from idle directly to under_inspection', async () => {
      await expect(
        cubicleManager.transitionStatus('cubicle-01', 'under_inspection')
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('supports error state and recovery back to idle', async () => {
      let c1 = cubicleManager.getCubicle('cubicle-01');
      await cubicleManager.transitionStatus('cubicle-01', 'working');
      c1 = await cubicleManager.transitionStatus('cubicle-01', 'error', 'Child process crashed');
      expect(c1.status).toBe('error');

      c1 = await cubicleManager.transitionStatus('cubicle-01', 'idle', 'Reset error');
      expect(c1.status).toBe('idle');
    });
  });

  describe('Quota Accounting, Fatigue Mathematics & Stamina Tiers', () => {
    it('calculates 100% stamina and energized tier at zero token consumption', () => {
      const stamina = QuotaTracker.calculateStamina(2000000, 0);
      const fatigue = QuotaTracker.calculateFatigue(2000000, 0);
      const tier = QuotaTracker.getStaminaTier(stamina);

      expect(stamina).toBe(100);
      expect(fatigue).toBe(0);
      expect(tier).toBe('energized');
    });

    it('calculates 50% stamina and fatigued tier at half token consumption', () => {
      const stamina = QuotaTracker.calculateStamina(2000000, 1000000);
      const fatigue = QuotaTracker.calculateFatigue(2000000, 1000000);
      const tier = QuotaTracker.getStaminaTier(stamina);

      expect(stamina).toBe(50);
      expect(fatigue).toBe(50);
      expect(tier).toBe('fatigued');
    });

    it('calculates critical strain tier between 1% and 34% stamina', () => {
      const stamina = QuotaTracker.calculateStamina(2000000, 1800000); // 10%
      const tier = QuotaTracker.getStaminaTier(stamina);

      expect(stamina).toBe(10);
      expect(tier).toBe('critical_strain');
    });

    it('triggers exhausted status when all quota is consumed', async () => {
      const c1 = cubicleManager.getCubicle('cubicle-01');
      await cubicleManager.transitionStatus('cubicle-01', 'working');

      const max = c1.config.quota.max_tokens;
      const updated = await cubicleManager.recordTokenConsumption('cubicle-01', max);

      expect(updated.stamina_percentage).toBe(0);
      expect(updated.fatigue_percentage).toBe(100);
      expect(updated.stamina_tier).toBe('exhausted');
      expect(updated.status).toBe('exhausted');
    });

    it('recharges quota and restores idle status from exhausted', async () => {
      const max = cubicleManager.getCubicle('cubicle-01').config.quota.max_tokens;
      await cubicleManager.recordTokenConsumption('cubicle-01', max);
      expect(cubicleManager.getCubicle('cubicle-01').status).toBe('exhausted');

      const recharged = await cubicleManager.rechargeQuota('cubicle-01');
      expect(recharged.status).toBe('idle');
      expect(recharged.stamina_percentage).toBe(100);
      expect(recharged.stamina_tier).toBe('energized');
    });
  });

  describe('CLI Parameter Interpolation & Masking', () => {
    it('correctly interpolates template placeholders {{model}}, {{worktree_dir}}, etc.', () => {
      const template = 'gemini run --model {{model}} --dir "{{worktree_dir}}" --budget {{thinking_budget}}';
      const context = {
        model: 'gemini-4-argon',
        worktree_dir: 'C:\\test\\worktree',
        thinking_budget: 16000,
      };

      const result = CLIEngine.interpolateTemplate(template, context);
      expect(result).toBe('gemini run --model gemini-4-argon --dir "C:\\test\\worktree" --budget 16000');
    });

    it('leaves unmatched placeholders intact', () => {
      const template = 'echo {{existing}} and {{missing}}';
      const result = CLIEngine.interpolateTemplate(template, { existing: 'foo' });
      expect(result).toBe('echo foo and {{missing}}');
    });

    it('masks credentials securely for logs and telemetry', () => {
      expect(CLIEngine.maskCredential('sk-proj-1234567890abcdef')).toBe('sk-p...cdef');
      expect(CLIEngine.maskCredential('short')).toBe('********');
      expect(CLIEngine.maskCredential('')).toBe('********');
    });
  });

  describe('Roster & Status Filesystem Persistence', () => {
    it('persists configuration to .swarm/roster.json upon configuration change', async () => {
      await cubicleManager.configureCubicle('cubicle-04', {
        enabled: true,
        brand: 'Claude / Anthropic',
        model: 'claude-3-7-sonnet',
        display_name: 'Claude Sonnet Unit',
      });

      const rosterRaw = await fs.readFile(path.join(swarmDir, 'roster.json'), 'utf8');
      const roster = JSON.parse(rosterRaw);
      const c4 = roster.find((c: any) => c.id === 'cubicle-04');

      expect(c4.enabled).toBe(true);
      expect(c4.brand).toBe('Claude / Anthropic');
      expect(c4.model).toBe('claude-3-7-sonnet');
      expect(c4.display_name).toBe('Claude Sonnet Unit');
    });

    it('updates per-cubicle status file on state transition', async () => {
      await cubicleManager.transitionStatus('cubicle-02', 'working');
      const statusRaw = await fs.readFile(path.join(swarmDir, 'status', 'cubicle-02.json'), 'utf8');
      const statusObj = JSON.parse(statusRaw);

      expect(statusObj.id).toBe('cubicle-02');
      expect(statusObj.status).toBe('working');
    });
  });
});
