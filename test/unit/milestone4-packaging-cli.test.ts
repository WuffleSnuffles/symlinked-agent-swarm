/**
 * test/unit/milestone4-packaging-cli.test.ts
 *
 * Comprehensive Milestone 4 Test Suite:
 * 1. CLI Dispatcher: argument parsing, subcommands (version, help, status, courier envoys, courier wisdom, courier submit, courier status)
 * 2. Panopticon Server Health Contract: cubicles_active, governance mode ROMAN_DUAL_CONSUL, consuls
 * 3. SelfUpdateManager: PE header validation, 7-stage atomic swap, rollback recovery, stale executable cleanup
 * 4. Consular Engine Self-Update Integration: pre-swap Git checkpoint, vote & rollback routes
 * 5. Standalone Build Scripts, CI/CD Workflow & Repository Hygiene
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTestSandbox, createPeTestBuffer } from '../e2e/helpers.js';
import { stageBinaries } from '../../scripts/stage-binaries.mjs';
import {
  parseCliArgs,
  executeCliCommand,
  getHelpManualText,
} from '../../src/server/cli-dispatcher.js';
import { SelfUpdateManager } from '../../src/server/self-update-manager.js';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import { CourierGateway } from '../../src/server/courier-gateway.js';
import { ConsularVote } from '../../src/server/types/governance.js';
import { createSwarmServer } from '../../src/server/index.js';

async function stageExecutableFiles(root: string): Promise<string> {
  const result = stageBinaries(root);
  return result.hash;
}

describe('Milestone 4: Standalone Executable Packaging, CLI Dispatcher & Self-Update', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeAll(async () => {
    await stageExecutableFiles(projectRoot);
  });

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_m4_packaging');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // 1. CLI Dispatcher: Argument Parsing
  // =========================================================================
  describe('1. CLI Argument Parsing (parseCliArgs)', () => {
    it('defaults to daemon start with default port 3820 and current cwd', () => {
      const parsed = parseCliArgs(['node', 'SymlinkedAgentSwarm.exe']);
      expect(parsed.command).toBe('start');
      expect(parsed.port).toBe(3820);
      expect(parsed.headless).toBe(false);
      expect(parsed.workspace).toBe(process.cwd());
    });

    it('parses version subcommand and flags', () => {
      expect(parseCliArgs(['node', 'exe', 'version']).command).toBe('version');
      expect(parseCliArgs(['node', 'exe', '-v']).command).toBe('version');
      expect(parseCliArgs(['node', 'exe', '--version']).command).toBe('version');
    });

    it('parses help subcommand and flags', () => {
      expect(parseCliArgs(['node', 'exe', 'help']).command).toBe('help');
      expect(parseCliArgs(['node', 'exe', '-h']).command).toBe('help');
      expect(parseCliArgs(['node', 'exe', '--help']).command).toBe('help');
    });

    it('parses status and grid status subcommands', () => {
      expect(parseCliArgs(['node', 'exe', 'status']).command).toBe('status');
      expect(parseCliArgs(['node', 'exe', 'grid', 'status']).command).toBe('status');
    });

    it('parses courier submit with options and prompt', () => {
      const argv = [
        'node',
        'exe',
        'courier',
        'submit',
        '--agent',
        'openclaw',
        '--type',
        'POWER',
        'Optimize database indexes',
      ];
      const parsed = parseCliArgs(argv);
      expect(parsed.command).toBe('courier_submit');
      expect(parsed.agent).toBe('openclaw');
      expect(parsed.requestedType).toBe('POWER');
      expect(parsed.prompt).toBe('Optimize database indexes');

      // Test explicit --prompt flag
      const flagged = parseCliArgs(['node', 'exe', 'courier', 'submit', '--agent', 'hermes', '--prompt', 'Deploy canary release']);
      expect(flagged.command).toBe('courier_submit');
      expect(flagged.agent).toBe('hermes');
      expect(flagged.prompt).toBe('Deploy canary release');

      // Test missing prompt returns undefined
      const missing = parseCliArgs(['node', 'exe', 'courier', 'submit', '--agent', 'gpt-dot']);
      expect(missing.command).toBe('courier_submit');
      expect(missing.prompt).toBeUndefined();
    });

    it('parses courier status with petition id', () => {
      const parsed = parseCliArgs(['node', 'exe', 'courier', 'status', 'pet-omega-99']);
      expect(parsed.command).toBe('courier_status');
      expect(parsed.petitionId).toBe('pet-omega-99');
    });

    it('parses courier envoys subcommand', () => {
      const parsed = parseCliArgs(['node', 'exe', 'courier', 'envoys']);
      expect(parsed.command).toBe('courier_envoys');
    });

    it('parses courier wisdom subcommand with topic and agent', () => {
      const argv = ['node', 'exe', 'courier', 'wisdom', '--topic', 'Consular Diplomacy', '--agent', 'hermes'];
      const parsed = parseCliArgs(argv);
      expect(parsed.command).toBe('courier_wisdom');
      expect(parsed.topic).toBe('Consular Diplomacy');
      expect(parsed.agent).toBe('hermes');
    });

    it('parses daemon options (--port, --headless, --workspace)', () => {
      const argv = ['node', 'exe', 'start', '--port', '4100', '--headless', '--workspace', sandbox.sandboxDir];
      const parsed = parseCliArgs(argv);
      expect(parsed.command).toBe('start');
      expect(parsed.port).toBe(4100);
      expect(parsed.headless).toBe(true);
      expect(parsed.workspace).toBe(path.resolve(sandbox.sandboxDir));
    });
  });

  // =========================================================================
  // 2. CLI Dispatcher: Subcommand Execution
  // =========================================================================
  describe('2. CLI Subcommand Execution (executeCliCommand)', () => {
    it('executes version command and outputs version banner', async () => {
      const result = await executeCliCommand(
        { command: 'version', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output.some((l) => l.includes('Symlinked Agent Swarm v1.0.0'))).toBe(true);
    });

    it('executes help command and outputs usage manual text', async () => {
      const result = await executeCliCommand(
        { command: 'help', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      const helpText = getHelpManualText();
      expect(helpText).toContain('courier submit');
      expect(helpText).toContain('--headless');
    });

    it('executes status command and displays 4x4 spatial matrix and cubicles table', async () => {
      // 1. Uninitialized
      const uninit = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(uninit.handled).toBe(true);
      expect(uninit.output.some((l) => l.includes('Swarm is offline or uninitialized'))).toBe(true);

      // 2. Initialized via CubicleManager (.swarm/roster.json)
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      await cubicleManager.initialize();

      const initResult = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(initResult.handled).toBe(true);
      expect(initResult.exitCode).toBe(0);
      expect(initResult.data).toHaveLength(16);

      // Verify 4x4 matrix header and row cells
      expect(initResult.output.some((l) => l.includes('PANOPTICON 4x4 CUBICLE SURVEILLANCE ROSTER MATRIX'))).toBe(true);
      expect(initResult.output.some((l) => l.includes('[cubicle-01: idle]'))).toBe(true);
      expect(initResult.output.some((l) => l.includes('[cubicle-04: vacant]'))).toBe(true);
    });

    it('executes courier envoys command and lists registered connectors', async () => {
      const result = await executeCliCommand(
        { command: 'courier_envoys', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThanOrEqual(3);
      expect(result.data.some((e: any) => e.agent === 'openclaw')).toBe(true);
    });

    it('executes courier wisdom command and outputs ratified guidance and plan', async () => {
      const result = await executeCliCommand(
        {
          command: 'courier_wisdom',
          topic: 'Database Sharding Architecture',
          agent: 'openclaw',
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );
      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.approved_by).toHaveLength(2);
      expect(result.data.plan.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects courier submit when prompt is omitted, empty, or whitespace-only', async () => {
      // 1. Omitted prompt
      const omitted = await executeCliCommand(
        { command: 'courier_submit', agent: 'openclaw', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(omitted.handled).toBe(true);
      expect(omitted.exitCode).toBe(1);
      expect(omitted.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);

      // 2. Empty string
      const empty = await executeCliCommand(
        { command: 'courier_submit', prompt: '', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(empty.handled).toBe(true);
      expect(empty.exitCode).toBe(1);

      // 3. Whitespace string
      const ws = await executeCliCommand(
        { command: 'courier_submit', prompt: '   \t  ', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(ws.handled).toBe(true);
      expect(ws.exitCode).toBe(1);
    });

    it('executes courier submit command end-to-end to 2/2 Consular Ratification', async () => {
      const result = await executeCliCommand(
        {
          command: 'courier_submit',
          agent: 'openclaw',
          prompt: 'Refactor WebSocket subscription routing',
          requestedType: 'BOTH',
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data.status).toBe('SEALED');
      expect(result.data.consular_seal.approved_by).toEqual(['Consul I', 'Consul II']);

      // Verify sealed deliverable placed in outbox
      const outboxDir = path.join(sandbox.swarmDir, 'courier', 'outbox');
      const outboxFiles = await fs.readdir(outboxDir);
      expect(outboxFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('executes courier status command to query a submitted petition', async () => {
      // First submit a petition
      const submitRes = await executeCliCommand(
        {
          command: 'courier_submit',
          agent: 'hermes',
          prompt: 'Verify disk quota thresholds',
          requestedType: 'WISDOM',
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );
      const petitionId = submitRes.data.petition_id;

      // Now query status via CLI
      const statusRes = await executeCliCommand(
        {
          command: 'courier_status',
          petitionId,
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );

      expect(statusRes.handled).toBe(true);
      expect(statusRes.exitCode).toBe(0);
      expect(statusRes.data.status).toBe('SEALED');
      expect(statusRes.output.some((l) => l.includes(petitionId))).toBe(true);
    });
  });

  // =========================================================================
  // 3. Health Check Contract
  // =========================================================================
  describe('3. Panopticon Server Health Check Contract', () => {
    it('returns valid JSON with cubicles_active and Roman Dual-Consul governance mode', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3999);
      const cubicleManager = serverInstance.cubicleManager;

      // Pre-fill 3 active cubicles
      await cubicleManager.configureCubicle('cubicle-01', { assigned: true, state: 'Working' });
      await cubicleManager.configureCubicle('cubicle-02', { assigned: true, state: 'Relaxed/Idle' });
      await cubicleManager.configureCubicle('cubicle-03', { assigned: true, state: 'Working' });

      // Simulate GET /api/health directly
      const req = {} as any;
      let responsePayload: any = null;
      const res = {
        json: (payload: any) => {
          responsePayload = payload;
          return res;
        },
      } as any;

      // Extract registered /api/health route handler from app
      const routes = (serverInstance.app as any)._router.stack;
      const healthLayer = routes.find(
        (layer: any) => layer.route && layer.route.path === '/api/health'
      );
      expect(healthLayer).toBeDefined();

      healthLayer.route.stack[0].handle(req, res);

      expect(responsePayload).toBeDefined();
      expect(responsePayload.status).toBe('ok');
      expect(responsePayload.version).toBe('1.0.0');
      expect(responsePayload.cubicles_active).toBe(3);
      expect(responsePayload.active_cubicles).toBe(3);
      expect(responsePayload.governance.mode).toBe('ROMAN_DUAL_CONSUL');
      expect(responsePayload.governance.consuls).toEqual(['Consul I', 'Consul II']);
      expect(responsePayload.governance.named_consuls).toEqual([
        'Consul Nia Nova',
        'Consul Ferric Lunaux',
      ]);

      await serverInstance.close();
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

      // Transition cubicle-02 to error status
      const c2 = cubicleManager.getCubicle('cubicle-02');
      c2.status = 'error';
      expect(getActiveCount()).toBe(1);

      await serverInstance.close();
    });
  });

  // =========================================================================
  // 4. Windows Atomic Hot-Swap Self-Update Engine (SelfUpdateManager)
  // =========================================================================
  describe('4. SelfUpdateManager: PE Validation & 7-Stage Atomic Swap', () => {
    let updateManager: SelfUpdateManager;

    beforeEach(() => {
      updateManager = new SelfUpdateManager(sandbox.sandboxDir);
    });

    it('rejects mock plaintext strings and enforces genuine PE headers', async () => {
      const mockFile = path.join(sandbox.sandboxDir, 'test-mock.exe');
      await fs.writeFile(mockFile, 'MZ_MOCK_WIN_PE_BINARY_TEST_V1', 'utf8');

      const result = await updateManager.validateBinary(mockFile);
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('validates genuine Win32 PE binary headers (MZ signature, PE offset, PE\\0\\0)', async () => {
      const peFile = path.join(sandbox.sandboxDir, 'genuine-test.exe');

      // Construct authentic Win32 PE binary header buffer
      const buf = Buffer.alloc(512);
      // Byte 0..1: 'MZ'
      buf[0] = 0x4d;
      buf[1] = 0x5a;
      // Offset 0x3C: PE header offset (0x40 = 64)
      buf.writeUInt32LE(0x40, 0x3c);
      // Offset 0x40: 'PE\0\0'
      buf[0x40] = 0x50; // 'P'
      buf[0x41] = 0x45; // 'E'
      buf[0x42] = 0x00;
      buf[0x43] = 0x00;

      await fs.writeFile(peFile, buf);

      const result = await updateManager.validateBinary(peFile);
      expect(result.valid).toBe(true);
      expect(result.fileSize).toBe(512);
      expect(result.sha256).toBeDefined();
    });

    it('rejects corrupt, truncated, or invalid PE files', async () => {
      // 1. Missing file
      const missing = await updateManager.validateBinary(path.join(sandbox.sandboxDir, 'nonexistent.exe'));
      expect(missing.valid).toBe(false);

      // 2. File too small (<16 bytes)
      const tiny = path.join(sandbox.sandboxDir, 'tiny.exe');
      await fs.writeFile(tiny, 'SHORT');
      const tinyRes = await updateManager.validateBinary(tiny);
      expect(tinyRes.valid).toBe(false);

      // 3. Invalid DOS signature (missing MZ)
      const invalidDos = path.join(sandbox.sandboxDir, 'invalid-dos.exe');
      const badBuf = Buffer.alloc(128);
      badBuf[0] = 0x00;
      badBuf[1] = 0x00;
      await fs.writeFile(invalidDos, badBuf);
      const dosRes = await updateManager.validateBinary(invalidDos);
      expect(dosRes.valid).toBe(false);
      expect(dosRes.reason).toContain('missing MZ');
    });

    it('executes 7-stage atomic swap (.exe -> .old.exe -> .new.exe -> .exe) and increments version', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();
      const newExe = updateManager.getNewExePath();

      // Stage active binary and new compiled binary
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_VERSION_1.0.0'));
      await fs.writeFile(newExe, createPeTestBuffer('STAGED_COMPILED_VERSION_1.0.1'));

      const swapResult = await updateManager.executeAtomicSwap('1.0.0');

      expect(swapResult.success).toBe(true);
      expect(swapResult.version_after).toBe('1.0.1');

      // 1. rootExe now contains new binary
      expect(await fs.readFile(rootExe, 'utf8')).toContain('STAGED_COMPILED_VERSION_1.0.1');
      // 2. oldExe now contains previous running binary
      expect(await fs.readFile(oldExe, 'utf8')).toContain('RUNNING_VERSION_1.0.0');
      // 3. newExe was renamed and is gone
      expect(existsSync(newExe)).toBe(false);
    });

    it('rolls back swap if new binary crashes or fails stability watch', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();

      await fs.writeFile(rootExe, createPeTestBuffer('CRASHING_NEW_BINARY'));
      await fs.writeFile(oldExe, createPeTestBuffer('PREVIOUS_HEALTHY_BINARY'));

      // Trigger rollback
      await updateManager.rollbackSwap(oldExe);

      // rootExe is restored to previous healthy binary
      expect(await fs.readFile(rootExe, 'utf8')).toContain('PREVIOUS_HEALTHY_BINARY');
    });

    it('aborts rollback and preserves active binary when backup does not exist', async () => {
      const rootExe = updateManager.getRootExePath();
      const fakeOld = path.join(sandbox.sandboxDir, 'NonExistent.old.exe');

      const activeBuf = createPeTestBuffer('RUNNING_ACTIVE_BINARY');
      await fs.writeFile(rootExe, activeBuf);

      await expect(updateManager.rollbackSwap(fakeOld)).rejects.toThrow(
        /Rollback aborted: Backup binary not found/
      );

      expect(existsSync(rootExe)).toBe(true);
      const curContent = await fs.readFile(rootExe);
      expect(curContent.equals(activeBuf)).toBe(true);
    });

    it('relaunchDetached attaches error handler and unrefs spawned child', () => {
      const child = updateManager.relaunchDetached(['--version']);
      expect(child).toBeDefined();
      expect(child.pid).toBeDefined();
      expect(child.listenerCount('error')).toBeGreaterThanOrEqual(1);
      try {
        child.kill();
      } catch {}
    });

    it('cleans up stale .old.exe and .failed.exe files on startup', async () => {
      const staleOld = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.1234.exe');
      const staleFailed = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.failed.5678.exe');
      const regularFile = path.join(sandbox.sandboxDir, 'regular.txt');

      await fs.writeFile(staleOld, 'STALE_OLD', 'utf8');
      await fs.writeFile(staleFailed, 'STALE_FAILED', 'utf8');
      await fs.writeFile(regularFile, 'KEEP_ME', 'utf8');

      const removed = await updateManager.cleanupStaleExecutables();
      expect(removed).toContain('SymlinkedAgentSwarm.old.1234.exe');
      expect(removed).toContain('SymlinkedAgentSwarm.failed.5678.exe');
      expect(existsSync(staleOld)).toBe(false);
      expect(existsSync(staleFailed)).toBe(false);
      expect(existsSync(regularFile)).toBe(true);
    });
  });

  // =========================================================================
  // 5. Consular Governance Self-Update Integration
  // =========================================================================
  describe('5. Consular Governance Self-Update Pipeline Integration', () => {
    let consularEngine: ConsularEngine;

    beforeEach(async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      const taskboardManager = new TaskboardManager(sandbox.swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      await cubicleManager.initialize();
      await taskboardManager.initialize();

      consularEngine = new ConsularEngine(
        sandbox.swarmDir,
        cubicleManager,
        taskboardManager,
        capabilityMatrix,
        undefined,
        sandbox.sandboxDir
      );
      await consularEngine.initialize();

      // Pre-stage authentic executables in sandbox so self-update review and rollback succeed
      const rootExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.exe');
      const newExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.new.exe');
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_V1'));
      await fs.writeFile(newExe, createPeTestBuffer('COMPILED_V2'));
    });

    it('creates pre-swap Git time-machine checkpoint before atomic binary swap', async () => {
      const req = await consularEngine.initiateSelfUpdate('Upgrade Panopticon Multi-Monitor Raycasting');

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Performance and raycasting verified.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Zero type errors or security regressions.',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await consularEngine.reviewSelfUpdate(req.request_id, votes);
      expect(result.status).toBe('SWAP_COMPLETED');
      expect(result.checkpoint_id).toBeDefined();

      // Verify checkpoint snapshot persisted on disk
      const chkPath = path.join(sandbox.swarmDir, 'checkpoints', `${result.checkpoint_id}.json`);
      expect(existsSync(chkPath)).toBe(true);
    });

    it('executes rollbackSelfUpdate restoring previous binary and git checkpoint', async () => {
      const req = await consularEngine.initiateSelfUpdate('Experimental feature');

      const votes: [ConsularVote, ConsularVote] = [
        { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
        { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
      ];

      const updated = await consularEngine.reviewSelfUpdate(req.request_id, votes);
      expect(updated.status).toBe('SWAP_COMPLETED');

      // Trigger rollback
      const rolledBack = await consularEngine.rollbackSelfUpdate(req.request_id);
      expect(rolledBack.status).toBe('ROLLED_BACK');
    });

    it('tracks dynamic old_exe_path in SelfUpdateRequest and uses it on rollback', async () => {
      const rootExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.exe');
      const newExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.new.exe');
      const oldExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.exe');

      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_DYNAMIC_V1'));
      await fs.writeFile(newExe, createPeTestBuffer('COMPILED_DYNAMIC_V2'));
      await fs.writeFile(oldExe, createPeTestBuffer('OCCUPIED_DEFAULT_OLD'));

      const req = await consularEngine.initiateSelfUpdate('Upgrade to dynamic rollback');
      const votes: [ConsularVote, ConsularVote] = [
        { consul: 'Consul I', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
        { consul: 'Consul II', decision: 'APPROVE', rationale: 'OK', timestamp: new Date().toISOString() },
      ];

      const completed = await consularEngine.reviewSelfUpdate(req.request_id, votes);
      expect(completed.status).toBe('SWAP_COMPLETED');
      expect(completed.old_exe_path).toBeDefined();

      const diskStatus = await consularEngine.getSelfUpdateStatus(req.request_id);
      expect(diskStatus.old_exe_path).toBe(completed.old_exe_path);

      const rolledBack = await consularEngine.rollbackSelfUpdate(req.request_id);
      expect(rolledBack.status).toBe('ROLLED_BACK');
      expect(existsSync(rootExe)).toBe(true);
    });
  });

  // =========================================================================
  // 6. Build Scripts, GitHub CI/CD & Repository Hygiene
  // =========================================================================
  describe('6. Packaging Scripts, GitHub CI/CD & Repository Files', () => {
    it('scripts/build-exe.ps1 defines single-binary packaging and target paths', async () => {
      const buildScriptPath = path.join(projectRoot, 'scripts', 'build-exe.ps1');
      expect(existsSync(buildScriptPath)).toBe(true);

      const content = await fs.readFile(buildScriptPath, 'utf8');
      expect(content).toContain('SymlinkedAgentSwarm.exe');
      expect(content).toMatch(/dist[/\\]SymlinkedAgentSwarm\.exe/);
      expect(content).toContain('SHA256');
    });

    it('.github/workflows/release-exe.yml targets holdenliu1 repo and includes release artifacts', async () => {
      const workflowPath = path.join(projectRoot, '.github', 'workflows', 'release-exe.yml');
      expect(existsSync(workflowPath)).toBe(true);

      const content = await fs.readFile(workflowPath, 'utf8');
      expect(content).toContain('SymlinkedAgentSwarm.exe');
      expect(content).toContain('release');
      expect(content).toContain('holdenliu1/symlinked-agent-swarm');
      expect(content).toContain('windows-latest');
    });

    it('scripts/publish-github.ps1 is configured for holdenliu1 and main branch', async () => {
      const publishScriptPath = path.join(projectRoot, 'scripts', 'publish-github.ps1');
      expect(existsSync(publishScriptPath)).toBe(true);

      const content = await fs.readFile(publishScriptPath, 'utf8');
      expect(content).toContain('https://github.com/holdenliu1/symlinked-agent-swarm.git');
      expect(content).toContain('holdenliu1');
      expect(content).toContain('main');
    });

    it('.gitignore protects secrets and builds while preserving essential swarm folders', async () => {
      const gitignorePath = path.join(projectRoot, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);

      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      expect(content).toContain('*.old.exe');
      expect(content).toContain('*.new.exe');
      expect(content).toContain('!/.agents/');
      expect(content).toContain('!/.swarm/');
      expect(content).toContain('!/public/');
      expect(content).toContain('!/src/');
      expect(content).toContain('!/scripts/');
      expect(content).toContain('!/.github/');
    });

    it('package.json includes build:exe packaging script', async () => {
      const pkgPath = path.join(projectRoot, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      expect(pkg.scripts['build:exe']).toBeDefined();
      expect(pkg.scripts['build:exe']).toContain('build-exe.ps1');
    });

    it('README.md contains brutalist cyberpunk manual and complete 25-feature matrix', async () => {
      const readmePath = path.join(projectRoot, 'README.md');
      expect(existsSync(readmePath)).toBe(true);

      const readme = await fs.readFile(readmePath, 'utf8');
      expect(readme).toContain('PANOPTICON');
      expect(readme).toContain('Consul Nia Nova');
      expect(readme).toContain('Consul Ferric Lunaux');
      expect(readme).toContain('Twin Eyes of Sauron');
      expect(readme).toContain('Courier Gateway');
      expect(readme).toContain('SymlinkedAgentSwarm.exe');
      expect(readme).toContain('25-Feature Inventory Matrix');
    });

    it('staged standalone executable files exist and validate SHA256 checksums', async () => {
      const distExe = path.join(projectRoot, 'dist', 'SymlinkedAgentSwarm.exe');
      const rootExe = path.join(projectRoot, 'SymlinkedAgentSwarm.exe');
      const distSha = path.join(projectRoot, 'dist', 'SymlinkedAgentSwarm.exe.sha256');
      const rootSha = path.join(projectRoot, 'SymlinkedAgentSwarm.exe.sha256');
      const shaSums = path.join(projectRoot, 'dist', 'SHA256SUMS.txt');

      expect(existsSync(distExe)).toBe(true);
      expect(existsSync(rootExe)).toBe(true);
      expect(existsSync(distSha)).toBe(true);
      expect(existsSync(rootSha)).toBe(true);
      expect(existsSync(shaSums)).toBe(true);

      const content = await fs.readFile(distExe);
      const computedHash = crypto.createHash('sha256').update(content).digest('hex');
      const shaContent = await fs.readFile(distSha, 'utf8');
      expect(shaContent).toContain(computedHash);

      const rootShaContent = await fs.readFile(rootSha, 'utf8');
      expect(rootShaContent).toContain(computedHash);

      const shaSumsContent = await fs.readFile(shaSums, 'utf8');
      expect(shaSumsContent).toContain(computedHash);
    });
  });
});
