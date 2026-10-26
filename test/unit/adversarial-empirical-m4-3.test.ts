/**
 * test/unit/adversarial-empirical-m4-3.test.ts
 *
 * Empirical Challenge & Adversarial Verification Suite for Milestone 4.2:
 * 1. CLI Subcommands (cli-dispatcher.ts):
 *    - courier submit without prompt or with whitespace-only prompts (spaces, tabs, newlines, empty string):
 *      verifies strict rejection with exitCode 1 and descriptive error message.
 *    - courier submit with --prompt flag, -p short flag, and positional task arguments:
 *      verifies successful execution with exitCode 0 and 2/2 Consular Ratification.
 *    - status & grid status subcommands:
 *      verifies parsing, reading of .swarm/roster.json and .swarm/status/*.json,
 *      and formatting of a 4x4 spatial matrix grid in ASCII alongside the 16-row detailed status table.
 *    - live status telemetry file mutation:
 *      verifies that mutations in .swarm/status/cubicle-*.json dynamically update the 4x4 grid and table.
 * 2. Panopticon Server Health Contract (index.ts):
 *    - /api/health with default seeded cubicle roster:
 *      verifies status 200, cubicles_active: 3, and governance mode ROMAN_DUAL_CONSUL.
 *    - dynamic mutation of cubicle states to 'error', 'vacant', and 'working':
 *      verifies active cubicle count responds dynamically.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createTestSandbox } from '../e2e/helpers.js';
import {
  parseCliArgs,
  executeCliCommand,
} from '../../src/server/cli-dispatcher.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { createSwarmServer } from '../../src/server/index.js';

describe('Milestone 4.3 Challenger Verification: CLI Dispatcher & Server Health Contract', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('adversarial_m4_3');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Challenge 1: CLI Dispatcher courier submit Subcommand Verification
  // =========================================================================
  describe('Challenge 1: CLI courier submit Prompt Validation & Execution', () => {
    it('1.1 rejects courier submit when prompt is completely omitted', async () => {
      const parsed = parseCliArgs(['node', 'SymlinkedAgentSwarm.exe', 'courier', 'submit']);
      expect(parsed.command).toBe('courier_submit');
      expect(parsed.prompt).toBeUndefined();

      const result = await executeCliCommand(
        { ...parsed, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output.some((line) => line.includes('Error: task prompt is required'))).toBe(true);
      expect(result.output.some((line) => line.includes('Usage: SymlinkedAgentSwarm.exe courier submit'))).toBe(true);
    });

    it('1.2 rejects courier submit with agent specified but no prompt', async () => {
      const parsed = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '--agent',
        'openclaw',
      ]);
      expect(parsed.command).toBe('courier_submit');
      expect(parsed.agent).toBe('openclaw');
      expect(parsed.prompt).toBeUndefined();

      const result = await executeCliCommand(
        { ...parsed, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output.some((line) => line.includes('Error: task prompt is required'))).toBe(true);
    });

    it('1.3 rejects courier submit with whitespace-only prompts (spaces, tabs, newlines)', async () => {
      const whitespaceCases = [
        '   ',
        '\t\t\t',
        '\n\r\n',
        '  \t  \n  ',
      ];

      for (const ws of whitespaceCases) {
        // Direct execution check
        const result = await executeCliCommand(
          {
            command: 'courier_submit',
            prompt: ws,
            port: 3820,
            headless: false,
            workspace: sandbox.sandboxDir,
          },
          { exitOnComplete: false }
        );

        expect(result.handled).toBe(true);
        expect(result.exitCode).toBe(1);
        expect(result.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);
      }
    });

    it('1.4 rejects courier submit with explicit empty string --prompt ""', async () => {
      const parsed = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '--prompt',
        '',
      ]);
      expect(parsed.command).toBe('courier_submit');

      const result = await executeCliCommand(
        { ...parsed, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);
    });

    it('1.5 rejects courier submit when --prompt or -p flag has no argument following it', async () => {
      const parsedFlagOnly = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '--prompt',
      ]);
      expect(parsedFlagOnly.prompt).toBeUndefined();

      const resFlagOnly = await executeCliCommand(
        { ...parsedFlagOnly, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(resFlagOnly.exitCode).toBe(1);

      const parsedShortOnly = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '-p',
      ]);
      expect(parsedShortOnly.prompt).toBeUndefined();

      const resShortOnly = await executeCliCommand(
        { ...parsedShortOnly, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(resShortOnly.exitCode).toBe(1);
    });

    it('1.6 executes courier submit with --prompt "Hello" successfully with exitCode 0', async () => {
      const parsed = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '--agent',
        'openclaw',
        '--prompt',
        'Hello',
        '--workspace',
        sandbox.sandboxDir,
      ]);

      expect(parsed.command).toBe('courier_submit');
      expect(parsed.agent).toBe('openclaw');
      expect(parsed.prompt).toBe('Hello');

      const result = await executeCliCommand(parsed, { exitOnComplete: false });

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
      expect(result.data.status).toBe('SEALED');
      expect(result.data.consular_seal.approved_by).toEqual(['Consul I', 'Consul II']);
      expect(result.output.some((l) => l.includes('[CONSULAR VERDICT]: UNANIMOUS 2/2 CONSULAR RATIFICATION'))).toBe(true);
    });

    it('1.7 executes courier submit with -p short flag successfully with exitCode 0', async () => {
      const parsed = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '-p',
        'Hello from short flag',
        '-w',
        sandbox.sandboxDir,
      ]);

      expect(parsed.command).toBe('courier_submit');
      expect(parsed.prompt).toBe('Hello from short flag');

      const result = await executeCliCommand(parsed, { exitOnComplete: false });

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.status).toBe('SEALED');
    });

    it('1.8 executes courier submit with positional task argument successfully with exitCode 0', async () => {
      const parsed = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        'Autonomous indexing verification',
        '--workspace',
        sandbox.sandboxDir,
      ]);

      expect(parsed.command).toBe('courier_submit');
      expect(parsed.prompt).toBe('Autonomous indexing verification');

      const result = await executeCliCommand(parsed, { exitOnComplete: false });

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.status).toBe('SEALED');
      expect(result.output.some((l) => l.includes('Autonomous indexing verification'))).toBe(true);
    });

    it('1.9 executes courier submit with custom agent and positional argument', async () => {
      const parsed = parseCliArgs([
        'node',
        'SymlinkedAgentSwarm.exe',
        'courier',
        'submit',
        '--agent',
        'hermes',
        'Audit worktree directory junctions',
        '--workspace',
        sandbox.sandboxDir,
      ]);

      expect(parsed.command).toBe('courier_submit');
      expect(parsed.agent).toBe('hermes');
      expect(parsed.prompt).toBe('Audit worktree directory junctions');

      const result = await executeCliCommand(parsed, { exitOnComplete: false });

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.sender_agent).toBe('hermes');
      expect(result.output.some((l) => l.includes('HERMES'))).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 2: CLI status & grid status 4x4 Spatial Matrix Verification
  // =========================================================================
  describe('Challenge 2: CLI status / grid status 4x4 Spatial Matrix & Live Telemetry', () => {
    it('2.1 reports offline when swarm is uninitialized (.swarm/roster.json missing)', async () => {
      const statusRes = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(statusRes.handled).toBe(true);
      expect(statusRes.exitCode).toBe(0);
      expect(statusRes.output.some((l) => l.includes('Swarm is offline or uninitialized'))).toBe(true);
    });

    it('2.2 parses both "status" and "grid status" subcommands identically', () => {
      const p1 = parseCliArgs(['node', 'SymlinkedAgentSwarm.exe', 'status']);
      const p2 = parseCliArgs(['node', 'SymlinkedAgentSwarm.exe', 'grid', 'status']);

      expect(p1.command).toBe('status');
      expect(p2.command).toBe('status');

      const p3 = parseCliArgs(['node', 'SymlinkedAgentSwarm.exe', 'grid', 'status', '-w', sandbox.sandboxDir]);
      expect(p3.command).toBe('status');
      expect(p3.workspace).toBe(path.resolve(sandbox.sandboxDir));
    });

    it('2.3 reads .swarm/roster.json and renders a 4x4 spatial matrix grid in ASCII', async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      await cubicleManager.initialize();

      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toHaveLength(16);

      // Verify ASCII header
      expect(result.output.some((l) => l.includes('PANOPTICON 4x4 CUBICLE SURVEILLANCE ROSTER MATRIX'))).toBe(true);

      // Verify 4x4 grid lines (Row 1 to Row 4)
      const gridRow1 = result.output.find((l) => l.includes('[cubicle-01:') && l.includes('[cubicle-04:'));
      expect(gridRow1).toBeDefined();
      expect(gridRow1).toContain('[cubicle-01: idle]');
      expect(gridRow1).toContain('[cubicle-02: idle]');
      expect(gridRow1).toContain('[cubicle-03: idle]');
      expect(gridRow1).toContain('[cubicle-04: vacant]');

      const gridRow2 = result.output.find((l) => l.includes('[cubicle-05:') && l.includes('[cubicle-08:'));
      expect(gridRow2).toBeDefined();
      expect(gridRow2).toContain('[cubicle-05: vacant]');
      expect(gridRow2).toContain('[cubicle-08: vacant]');

      const gridRow3 = result.output.find((l) => l.includes('[cubicle-09:') && l.includes('[cubicle-12:'));
      expect(gridRow3).toBeDefined();
      expect(gridRow3).toContain('[cubicle-09: vacant]');
      expect(gridRow3).toContain('[cubicle-12: vacant]');

      const gridRow4 = result.output.find((l) => l.includes('[cubicle-13:') && l.includes('[cubicle-16:'));
      expect(gridRow4).toBeDefined();
      expect(gridRow4).toContain('[cubicle-13: vacant]');
      expect(gridRow4).toContain('[cubicle-16: vacant]');

      // Verify 16-row status table
      expect(result.output.some((l) => l.includes('ID         | ASSIGNED | MODEL                         | TIER      | STATE            | FATIGUE'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-01 | YES      | Gemini 4 Argon (High)         | High      | idle             |     0%'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-03 | YES      | GPT Astra (Very High)         | Very High | idle             |     0%'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-16 | NO       | unassigned                    | Low       | vacant           |     0%'))).toBe(true);
    });

    it('2.4 dynamically enriches 4x4 matrix and status table from .swarm/status/*.json live files', async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      await cubicleManager.initialize();

      // Write mock live telemetry to .swarm/status/cubicle-01.json and cubicle-02.json
      const statusDir = path.join(sandbox.swarmDir, 'status');
      await fs.writeFile(
        path.join(statusDir, 'cubicle-01.json'),
        JSON.stringify({
          id: 'cubicle-01',
          status: 'working',
          fatigue_percentage: 65,
          last_heartbeat: new Date().toISOString(),
        }),
        'utf8'
      );

      await fs.writeFile(
        path.join(statusDir, 'cubicle-02.json'),
        JSON.stringify({
          id: 'cubicle-02',
          status: 'under_inspection',
          fatigue_percentage: 82,
          last_heartbeat: new Date().toISOString(),
        }),
        'utf8'
      );

      await fs.writeFile(
        path.join(statusDir, 'cubicle-03.json'),
        JSON.stringify({
          id: 'cubicle-03',
          status: 'error',
          fatigue_percentage: 95,
          last_heartbeat: new Date().toISOString(),
        }),
        'utf8'
      );

      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);

      // Verify that 4x4 matrix displays the live updated status
      const gridRow1 = result.output.find((l) => l.includes('[cubicle-01:') && l.includes('[cubicle-04:'));
      expect(gridRow1).toBeDefined();
      expect(gridRow1).toContain('[cubicle-01: working]');
      expect(gridRow1).toContain('[cubicle-02: under_inspection]');
      expect(gridRow1).toContain('[cubicle-03: error]');

      // Verify table displays updated fatigue percentages
      expect(result.output.some((l) => l.includes('cubicle-01') && l.includes('working') && l.includes('65%'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-02') && l.includes('under_inspection') && l.includes('82%'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-03') && l.includes('error') && l.includes('95%'))).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 3: Server Health Contract (/api/health) Verification
  // =========================================================================
  describe('Challenge 3: Server Health Contract & Dynamic State Mutations', () => {
    it('3.1 returns cubicles_active: 3 and ROMAN_DUAL_CONSUL governance mode for default roster', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3998);

      const getHealthResponse = (): any => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload;
      };

      const health = getHealthResponse();

      expect(health).toBeDefined();
      expect(health.status).toBe('ok');
      expect(health.version).toBe('1.0.0');
      expect(typeof health.uptime).toBe('number');
      expect(typeof health.uptime_seconds).toBe('number');
      expect(health.cubicles_active).toBe(3);
      expect(health.active_cubicles).toBe(3);
      expect(health.governance).toEqual({
        mode: 'ROMAN_DUAL_CONSUL',
        consuls: ['Consul I', 'Consul II'],
        named_consuls: ['Consul Nia Nova', 'Consul Ferric Lunaux'],
      });
      expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');

      await serverInstance.close();
    });

    it('3.2 mutates cubicle state to "error" and verifies active count decrements to 2', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3998);
      const cubicleManager = serverInstance.cubicleManager;

      const getActiveCount = (): number => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload.cubicles_active;
      };

      expect(getActiveCount()).toBe(3);

      // Mutate cubicle-01 status to 'error'
      const c1 = cubicleManager.getCubicle('cubicle-01');
      c1.status = 'error';

      expect(getActiveCount()).toBe(2);

      await serverInstance.close();
    });

    it('3.3 mutates cubicle state to "vacant" and verifies active count decrements to 1', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3998);
      const cubicleManager = serverInstance.cubicleManager;

      const getActiveCount = (): number => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload.cubicles_active;
      };

      expect(getActiveCount()).toBe(3);

      // Mutate cubicle-01 to 'error'
      cubicleManager.getCubicle('cubicle-01').status = 'error';
      expect(getActiveCount()).toBe(2);

      // Decommission cubicle-02 to 'vacant'
      await cubicleManager.clearCubicle('cubicle-02');
      expect(cubicleManager.getCubicle('cubicle-02').status).toBe('vacant');
      expect(getActiveCount()).toBe(1);

      await serverInstance.close();
    });

    it('3.4 mutates an unassigned cubicle to "working" and verifies active count increments dynamically', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3998);
      const cubicleManager = serverInstance.cubicleManager;

      const getActiveCount = (): number => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload.cubicles_active;
      };

      expect(getActiveCount()).toBe(3);

      // Configure previously vacant cubicle-04 and set to 'working'
      await cubicleManager.configureCubicle('cubicle-04', {
        enabled: true,
        model: 'GPT Astra (Ultra)',
        thinking_level: 'Ultra',
      });
      cubicleManager.getCubicle('cubicle-04').status = 'working';

      expect(getActiveCount()).toBe(4);

      // Configure cubicle-05 and set to 'working'
      await cubicleManager.configureCubicle('cubicle-05', {
        enabled: true,
        model: 'Gemini 4 Argon (High)',
        thinking_level: 'High',
      });
      cubicleManager.getCubicle('cubicle-05').status = 'working';

      expect(getActiveCount()).toBe(5);

      await serverInstance.close();
    });

    it('3.5 verifies active count reaches 0 when all active cubicles fail or are cleared', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3998);
      const cubicleManager = serverInstance.cubicleManager;

      const getActiveCount = (): number => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload.cubicles_active;
      };

      expect(getActiveCount()).toBe(3);

      cubicleManager.getCubicle('cubicle-01').status = 'error';
      await cubicleManager.clearCubicle('cubicle-02');
      cubicleManager.getCubicle('cubicle-03').status = 'error';

      expect(getActiveCount()).toBe(0);

      await serverInstance.close();
    });
  });
});
