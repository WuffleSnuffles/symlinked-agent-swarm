/**
 * Proposed Unit Tests for Milestone 4 Remediation:
 * - courier submit missing argument validation
 * - status 4x4 spatial matrix grid & roster loading
 * - /api/health active cubicles contract
 *
 * Designed for insertion into test/unit/milestone4-packaging-cli.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createTestSandbox } from '../e2e/helpers.js';
import { parseCliArgs, executeCliCommand } from '../../src/server/cli-dispatcher.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { createSwarmServer } from '../../src/server/index.js';

describe('Milestone 4 Remediation Tests (Explorer M4.6)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_m4_remediation');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // 1. courier submit missing argument rejection & parsing
  // =========================================================================
  describe('1. courier submit Argument Validation & Rejection', () => {
    it('parses --prompt flag or positional argument in parseCliArgs', () => {
      // Positional prompt
      const pos = parseCliArgs(['node', 'exe', 'courier', 'submit', '--agent', 'openclaw', 'Audit authentication flow']);
      expect(pos.command).toBe('courier_submit');
      expect(pos.agent).toBe('openclaw');
      expect(pos.prompt).toBe('Audit authentication flow');

      // --prompt flag
      const flagged = parseCliArgs(['node', 'exe', 'courier', 'submit', '--agent', 'hermes', '--prompt', 'Deploy canary release']);
      expect(flagged.command).toBe('courier_submit');
      expect(flagged.agent).toBe('hermes');
      expect(flagged.prompt).toBe('Deploy canary release');

      // Missing prompt
      const missing = parseCliArgs(['node', 'exe', 'courier', 'submit', '--agent', 'gpt-dot']);
      expect(missing.command).toBe('courier_submit');
      expect(missing.agent).toBe('gpt-dot');
      expect(missing.prompt).toBeUndefined();

      // Bare invocation
      const bare = parseCliArgs(['node', 'exe', 'courier', 'submit']);
      expect(bare.command).toBe('courier_submit');
      expect(bare.prompt).toBeUndefined();
    });

    it('rejects courier submit when prompt is omitted (undefined) and returns exitCode 1', async () => {
      const result = await executeCliCommand(
        { command: 'courier_submit', agent: 'openclaw', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output.some((l) => l.includes('Error: task prompt is required. Usage: SymlinkedAgentSwarm.exe courier submit --agent <name> "<task>"'))).toBe(true);
    });

    it('rejects courier submit when prompt is empty string and returns exitCode 1', async () => {
      const result = await executeCliCommand(
        { command: 'courier_submit', prompt: '', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);
    });

    it('rejects courier submit when prompt is whitespace-only and returns exitCode 1', async () => {
      const result = await executeCliCommand(
        { command: 'courier_submit', prompt: '   \t\n  ', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);
    });

    it('executes courier submit successfully when valid prompt is provided', async () => {
      const result = await executeCliCommand(
        {
          command: 'courier_submit',
          agent: 'openclaw',
          prompt: 'Execute integration test suite',
          requestedType: 'BOTH',
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
      expect(result.data.status).toBe('SEALED');
      expect(result.data.consular_seal.approved_by).toEqual(['Consul I', 'Consul II']);
    });
  });

  // =========================================================================
  // 2. status / grid status 4x4 matrix rendering & roster loading
  // =========================================================================
  describe('2. status / grid status 4x4 Spatial Matrix & Roster Loading', () => {
    it('loads cubicle roster from .swarm/roster.json and enriches with .swarm/status/*.json into 4x4 matrix', async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      await cubicleManager.initialize();

      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
      expect(result.data).toHaveLength(16);

      // Verify header
      expect(result.output.some((l) => l.includes('PANOPTICON 4x4 CUBICLE SURVEILLANCE ROSTER MATRIX'))).toBe(true);

      // Verify 4x4 spatial matrix grid representation
      expect(result.output.some((l) => l.includes('[cubicle-01: idle]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-02: idle]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-03: idle]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-04: vacant]'))).toBe(true);

      // Verify detailed status table rows
      expect(result.output.some((l) => l.includes('cubicle-01') && l.includes('YES') && l.includes('gemini-4-argon'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-03') && l.includes('YES') && l.includes('gpt-astra'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-16') && l.includes('NO') && l.includes('vacant'))).toBe(true);
    });

    it('falls back to .swarm/status/cubicles.json when .swarm/roster.json is absent', async () => {
      const statusDir = path.join(sandbox.swarmDir, 'status');
      await fs.mkdir(statusDir, { recursive: true });
      await fs.writeFile(
        path.join(statusDir, 'cubicles.json'),
        JSON.stringify([
          {
            id: 'cubicle-01',
            assigned: true,
            model: 'gemini-4-argon',
            thinking_tier: 'High',
            state: 'Working',
            fatigue_percent: 15,
          },
          {
            id: 'cubicle-02',
            assigned: true,
            model: 'gemini-4-argon',
            thinking_tier: 'High',
            state: 'Relaxed/Idle',
            fatigue_percent: 5,
          },
        ]),
        'utf8'
      );

      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toHaveLength(2);
      expect(result.output.some((l) => l.includes('[cubicle-01: Working]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-02: Relaxed/Idle]'))).toBe(true);
    });

    it('reports offline status cleanly when no roster or status files exist', async () => {
      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output.some((l) => l.includes('Swarm is offline or uninitialized'))).toBe(true);
    });
  });

  // =========================================================================
  // 3. /api/health active cubicles contract
  // =========================================================================
  describe('3. /api/health Server Health Contract', () => {
    it('returns cubicles_active: 3 and active_cubicles: 3 on default pre-populated swarm', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3999);

      // Simulate GET /api/health
      const req = {} as any;
      let payload: any = null;
      const res = {
        json: (p: any) => {
          payload = p;
          return res;
        },
      } as any;

      const routes = (serverInstance.app as any)._router.stack;
      const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
      expect(healthLayer).toBeDefined();

      healthLayer.route.stack[0].handle(req, res);

      expect(payload).toBeDefined();
      expect(payload.status).toBe('ok');
      expect(payload.version).toBe('1.0.0');
      expect(payload.cubicles_active).toBe(3);
      expect(payload.active_cubicles).toBe(3);
      expect(payload.governance.mode).toBe('ROMAN_DUAL_CONSUL');
      expect(payload.governance.consuls).toEqual(['Consul I', 'Consul II']);
      expect(payload.governance.named_consuls).toEqual(['Consul Nia Nova', 'Consul Ferric Lunaux']);
    });

    it('dynamically tracks cubicle state transitions in /api/health active count', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3999);
      const cubicleManager = serverInstance.cubicleManager;

      const getActiveCount = (): number => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload.cubicles_active;
      };

      // Initial pre-populated count is 3
      expect(getActiveCount()).toBe(3);

      // Decommission cubicle-01 back to vacant
      await cubicleManager.clearCubicle('cubicle-01');
      expect(getActiveCount()).toBe(2);

      // Enable and configure cubicle-04
      await cubicleManager.configureCubicle('cubicle-04', {
        enabled: true,
        brand: 'Claude',
        model: 'claude-3-opus',
        display_name: 'Claude 3 Opus (High)',
      });
      expect(getActiveCount()).toBe(3);

      // Transition cubicle-02 to error status
      const c2 = cubicleManager.getCubicle('cubicle-02');
      c2.status = 'error';
      expect(getActiveCount()).toBe(2);
    });
  });
});
