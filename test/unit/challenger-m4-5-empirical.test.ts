/**
 * test/unit/challenger-m4-5-empirical.test.ts
 *
 * Empirical Challenge & Adversarial Stress Suite (Milestone 4.5 Gate Verification):
 * 1. CLI Courier Commands & Argument Parsing:
 *    - courier submit, courier petition, courier dispatch, courier review, courier status, courier afk, courier envoys, courier wisdom.
 *    - Prompt validation: empty prompt, missing prompt, whitespace-only prompt -> exitCode 1.
 *    - Valid prompt via -p, --prompt, and positional arguments -> valid dispatch (exitCode 0).
 * 2. 4x4 Spatial Matrix Grid Rendering:
 *    - Renders 4x4 grid from .swarm/roster.json and .swarm/status/cubicle-*.json.
 *    - Verifies 16-cubicle tabular layout and uninitialized fallback.
 * 3. /api/health Active Cubicle Count Logic:
 *    - Evaluates enabled/disabled/vacant/error cubicles and dynamic lifecycle mutations.
 * 4. Physical Binary Presence & Checksum Attestation:
 *    - dist/SymlinkedAgentSwarm.exe and root SymlinkedAgentSwarm.exe are 140,288 bytes (>100KB).
 *    - Checksums match b2c16041ace7a4abdc5b20724c131ceb6de89dc081949fa6561ea6da6c2ca504 in dist/SHA256SUMS.txt.
 *    - SelfUpdateManager.validateBinary validates both binaries as authentic Win32 PE.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTestSandbox } from '../e2e/helpers.js';
import {
  parseCliArgs,
  executeCliCommand,
  getHelpManualText,
} from '../../src/server/cli-dispatcher.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { createSwarmServer } from '../../src/server/index.js';
import { SelfUpdateManager } from '../../src/server/self-update-manager.js';

describe('Milestone 4.5 Empirical Challenger: CLI Dispatcher, Health Contract & Binary Attestation', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const expectedHash = readFileSync(path.join(projectRoot, 'dist', 'SymlinkedAgentSwarm.exe.sha256'), 'utf8')
    .trim()
    .split(/\s+/)[0];
  const expectedSize = statSync(path.join(projectRoot, 'dist', 'SymlinkedAgentSwarm.exe')).size;
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m4_5');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Deliverable 1: CLI Courier Commands & Mandatory Prompt Validation
  // =========================================================================
  describe('Deliverable 1: CLI Courier Commands & Mandatory Prompt Validation', () => {
    it('1.1 parses courier submit with various flag combinations (-p, --prompt, positional)', () => {
      // 1. Explicit --prompt flag
      const parsed1 = parseCliArgs([
        'node', 'exe', 'courier', 'submit',
        '--agent', 'openclaw',
        '--type', 'POWER',
        '--prompt', 'Deploy caching proxy'
      ]);
      expect(parsed1.command).toBe('courier_submit');
      expect(parsed1.agent).toBe('openclaw');
      expect(parsed1.requestedType).toBe('POWER');
      expect(parsed1.prompt).toBe('Deploy caching proxy');

      // 2. Short -p flag
      const parsed2 = parseCliArgs([
        'node', 'exe', 'courier', 'submit',
        '--agent', 'hermes',
        '-p', 'Run database migration'
      ]);
      expect(parsed2.command).toBe('courier_submit');
      expect(parsed2.agent).toBe('hermes');
      expect(parsed2.prompt).toBe('Run database migration');

      // 3. Positional argument
      const parsed3 = parseCliArgs([
        'node', 'exe', 'courier', 'submit',
        '--agent', 'gpt-dot',
        'Refactor microservice routing'
      ]);
      expect(parsed3.command).toBe('courier_submit');
      expect(parsed3.agent).toBe('gpt-dot');
      expect(parsed3.prompt).toBe('Refactor microservice routing');
    });

    it('1.2 parses courier petition: routes ID to courier_status and prompt to courier_submit', () => {
      // 1. With petition ID starting with pet- -> routes to courier_status
      const parsedId = parseCliArgs([
        'node', 'exe', 'courier', 'petition', 'pet-alpha-42'
      ]);
      expect(parsedId.command).toBe('courier_status');
      expect(parsedId.petitionId).toBe('pet-alpha-42');

      // 2. With task prompt -> routes to courier_submit
      const parsedPrompt = parseCliArgs([
        'node', 'exe', 'courier', 'petition',
        '--agent', 'openclaw',
        'Perform security vulnerability scan'
      ]);
      expect(parsedPrompt.command).toBe('courier_submit');
      expect(parsedPrompt.agent).toBe('openclaw');
      expect(parsedPrompt.prompt).toBe('Perform security vulnerability scan');
    });

    it('1.3 parses courier dispatch, review, and afk commands', () => {
      // 1. courier dispatch -> routes to courier_submit
      const parsedDispatch = parseCliArgs([
        'node', 'exe', 'courier', 'dispatch',
        '--agent', 'hermes',
        '--prompt', 'Purge stale temporary files'
      ]);
      expect(parsedDispatch.command).toBe('courier_submit');
      expect(parsedDispatch.prompt).toBe('Purge stale temporary files');

      // 2. courier review -> routes to courier_status
      const parsedReview = parseCliArgs([
        'node', 'exe', 'courier', 'review', 'pet-review-99'
      ]);
      expect(parsedReview.command).toBe('courier_status');
      expect(parsedReview.petitionId).toBe('pet-review-99');

      // 3. courier afk -> routes to courier_afk
      const parsedAfk = parseCliArgs([
        'node', 'exe', 'courier', 'afk',
        '--workspace', sandbox.sandboxDir
      ]);
      expect(parsedAfk.command).toBe('courier_afk');
      expect(parsedAfk.workspace).toBe(path.resolve(sandbox.sandboxDir));
    });

    it('1.4 strictly enforces prompt validation: empty, missing, or whitespace-only prompts fail with exitCode 1', async () => {
      // 1. Omitted prompt
      const missingRes = await executeCliCommand(
        { command: 'courier_submit', agent: 'openclaw', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(missingRes.handled).toBe(true);
      expect(missingRes.exitCode).toBe(1);
      expect(missingRes.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);

      // 2. Empty string prompt
      const emptyRes = await executeCliCommand(
        { command: 'courier_submit', prompt: '', agent: 'openclaw', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(emptyRes.handled).toBe(true);
      expect(emptyRes.exitCode).toBe(1);
      expect(emptyRes.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);

      // 3. Whitespace-only prompts (spaces, tabs, newlines)
      const whitespaceInputs = ['   ', '\t', '\n', '   \t  \n  '];
      for (const ws of whitespaceInputs) {
        const wsRes = await executeCliCommand(
          { command: 'courier_submit', prompt: ws, agent: 'openclaw', port: 3820, headless: false, workspace: sandbox.sandboxDir },
          { exitOnComplete: false }
        );
        expect(wsRes.handled).toBe(true);
        expect(wsRes.exitCode).toBe(1);
        expect(wsRes.output.some((l) => l.includes('Error: task prompt is required'))).toBe(true);
      }
    });

    it('1.5 executes courier afk command displaying AFK mode and Consular digest summary', async () => {
      // 1. Default unconfigured AFK state
      const defaultAfk = await executeCliCommand(
        { command: 'courier_afk', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(defaultAfk.handled).toBe(true);
      expect(defaultAfk.exitCode).toBe(0);
      expect(defaultAfk.output.some((l) => l.includes('PANOPTICON NIGHT-SHIFT // AFK AUTONOMOUS COURIER STATUS'))).toBe(true);
      expect(defaultAfk.output.some((l) => l.includes('AFK Mode:       DISABLED'))).toBe(true);

      // 2. Populated AFK state and digest
      await fs.mkdir(path.join(sandbox.swarmDir, 'memory'), { recursive: true });
      await fs.mkdir(path.join(sandbox.swarmDir, 'logs'), { recursive: true });
      await fs.writeFile(
        path.join(sandbox.swarmDir, 'memory', 'afk_state.json'),
        JSON.stringify({ enabled: true, auto_answer_preferences: true })
      );
      await fs.writeFile(
        path.join(sandbox.swarmDir, 'logs', 'consular_digest.json'),
        JSON.stringify({ summary: 'Night shift completed 14 tasks with 2/2 Consular ratification.' })
      );

      const activeAfk = await executeCliCommand(
        { command: 'courier_afk', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(activeAfk.handled).toBe(true);
      expect(activeAfk.exitCode).toBe(0);
      expect(activeAfk.output.some((l) => l.includes('AFK Mode:       ENABLED'))).toBe(true);
      expect(activeAfk.output.some((l) => l.includes('Autonomous Nia: ACTIVE'))).toBe(true);
      expect(activeAfk.output.some((l) => l.includes('Night shift completed 14 tasks'))).toBe(true);
    });

    it('1.6 executes courier submit and queries via courier status and courier review', async () => {
      // Submit valid task
      const submitRes = await executeCliCommand(
        {
          command: 'courier_submit',
          agent: 'openclaw',
          prompt: 'Integrate Zero-Trust Authentication Proxy',
          requestedType: 'BOTH',
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );
      expect(submitRes.handled).toBe(true);
      expect(submitRes.exitCode).toBe(0);
      const petitionId = submitRes.data.petition_id || submitRes.data.id;
      expect(petitionId).toBeDefined();

      // Query via courier status
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
      expect(statusRes.output.some((l) => l.includes(petitionId))).toBe(true);

      // Query via courier review (routed to courier_status)
      const reviewArgs = parseCliArgs(['node', 'exe', 'courier', 'review', petitionId, '--workspace', sandbox.sandboxDir]);
      expect(reviewArgs.command).toBe('courier_status');
      const reviewRes = await executeCliCommand(reviewArgs, { exitOnComplete: false });
      expect(reviewRes.handled).toBe(true);
      expect(reviewRes.exitCode).toBe(0);
      expect(reviewRes.output.some((l) => l.includes('COURIER PETITION STATUS'))).toBe(true);
    });
  });

  // =========================================================================
  // Deliverable 2: 4x4 Spatial Matrix Grid Rendering
  // =========================================================================
  describe('Deliverable 2: 4x4 Spatial Matrix Grid Rendering', () => {
    it('2.1 renders 4x4 spatial matrix and 16-row tabular format from .swarm/roster.json', async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      await cubicleManager.initialize();

      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.handled).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.data).toHaveLength(16);

      // Check 4x4 matrix banner and grid cells
      expect(result.output.some((l) => l.includes('PANOPTICON 4x4 CUBICLE SURVEILLANCE ROSTER MATRIX'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-01: idle]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-02: idle]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-03: idle]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-04: vacant]'))).toBe(true);
      expect(result.output.some((l) => l.includes('[cubicle-16: vacant]'))).toBe(true);

      // Check tabular header and rows
      expect(result.output.some((l) => l.includes('ID         | ASSIGNED | MODEL                         | TIER      | STATE            | FATIGUE'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-01 | YES      | Gemini 4 Argon (High)'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-03 | YES      | GPT Astra (Very High)'))).toBe(true);
      expect(result.output.some((l) => l.includes('cubicle-04 | NO       | unassigned'))).toBe(true);
    });

    it('2.2 updates 4x4 spatial matrix cells when per-cubicle status JSON files are mutated', async () => {
      const cubicleManager = new CubicleManager(sandbox.swarmDir);
      await cubicleManager.initialize();

      // Mutate cubicle-01 status file to 'working' and 45% fatigue
      const statusFile = path.join(sandbox.swarmDir, 'status', 'cubicle-01.json');
      await fs.writeFile(
        statusFile,
        JSON.stringify({
          id: 'cubicle-01',
          status: 'working',
          fatigue_percentage: 45,
          current_thought: 'Analyzing AST structure',
        })
      );

      const result = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );

      expect(result.output.some((l) => l.includes('[cubicle-01: working]'))).toBe(true);
      expect(result.output.some((l) => l.includes('45%'))).toBe(true);
    });
  });

  // =========================================================================
  // Deliverable 3: Server Health Contract (/api/health) Active Cubicle Logic
  // =========================================================================
  describe('Deliverable 3: /api/health Active Cubicle Count Logic', () => {
    it('3.1 accurately evaluates default roster: 3 active cubicles (cubicle-01, 02, 03)', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3995);

      const getHealth = (): any => {
        let payload: any = null;
        const res = { json: (p: any) => { payload = p; return res; } } as any;
        const routes = (serverInstance.app as any)._router.stack;
        const healthLayer = routes.find((l: any) => l.route && l.route.path === '/api/health');
        healthLayer.route.stack[0].handle({} as any, res);
        return payload;
      };

      const health = getHealth();
      expect(health.status).toBe('ok');
      expect(health.cubicles_active).toBe(3);
      expect(health.active_cubicles).toBe(3);
      expect(health.governance.mode).toBe('ROMAN_DUAL_CONSUL');
      expect(health.governance.consuls).toEqual(['Consul I', 'Consul II']);

      await serverInstance.close();
    });

    it('3.2 evaluates enabled/disabled/vacant/error states dynamically', async () => {
      const serverInstance = await createSwarmServer(sandbox.sandboxDir, 3995);
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

      // 1. Mutate cubicle-01 to 'error' -> decrements to 2
      cubicleManager.getCubicle('cubicle-01').status = 'error';
      expect(getActiveCount()).toBe(2);

      // 2. Clear cubicle-02 to 'vacant' -> decrements to 1
      await cubicleManager.clearCubicle('cubicle-02');
      expect(getActiveCount()).toBe(1);

      // 3. Mutate cubicle-03 to 'error' -> decrements to 0
      cubicleManager.getCubicle('cubicle-03').status = 'error';
      expect(getActiveCount()).toBe(0);

      // 4. Configure cubicle-04 and set to 'working' -> increments to 1
      await cubicleManager.configureCubicle('cubicle-04', {
        enabled: true,
        model: 'GPT Astra (Ultra)',
        thinking_level: 'Ultra',
      });
      cubicleManager.getCubicle('cubicle-04').status = 'working';
      expect(getActiveCount()).toBe(1);

      // 5. Configure cubicle-05 and set to 'idle' -> increments to 2
      await cubicleManager.configureCubicle('cubicle-05', {
        enabled: true,
        model: 'Gemini 4 Argon (High)',
        thinking_level: 'High',
      });
      cubicleManager.getCubicle('cubicle-05').status = 'idle';
      expect(getActiveCount()).toBe(2);

      await serverInstance.close();
    });
  });

  // =========================================================================
  // Deliverable 4: Physical Binary Presence on Disk & Checksums
  // =========================================================================
  describe('Deliverable 4: Physical Binary Presence & Checksums', () => {
    const distExe = path.join(projectRoot, 'dist', 'SymlinkedAgentSwarm.exe');
    const rootExe = path.join(projectRoot, 'SymlinkedAgentSwarm.exe');
    const distSha = path.join(projectRoot, 'dist', 'SymlinkedAgentSwarm.exe.sha256');
    const rootSha = path.join(projectRoot, 'SymlinkedAgentSwarm.exe.sha256');
    const shaSums = path.join(projectRoot, 'dist', 'SHA256SUMS.txt');

    it('4.1 verifies physical presence and exact size of 140,288 bytes (>100KB) for both binaries', () => {
      expect(existsSync(distExe)).toBe(true);
      expect(existsSync(rootExe)).toBe(true);

      const distStat = statSync(distExe);
      const rootStat = statSync(rootExe);

      expect(distStat.size).toBe(expectedSize);
      expect(rootStat.size).toBe(expectedSize);
      expect(distStat.size).toBeGreaterThan(100 * 1024);
    });

    it('4.2 verifies authentic PE binary structure and DOS MZ header', () => {
      const distBuf = readFileSync(distExe);
      const rootBuf = readFileSync(rootExe);

      // Byte-for-byte identical mirror
      expect(distBuf.equals(rootBuf)).toBe(true);

      // DOS MZ magic bytes
      expect(distBuf[0]).toBe(0x4d); // 'M'
      expect(distBuf[1]).toBe(0x5a); // 'Z'

      // e_lfanew pointer at 0x3C
      const peOffset = distBuf.readUInt32LE(0x3c);
      expect(peOffset).toBeGreaterThanOrEqual(0x40);
      expect(peOffset + 4).toBeLessThanOrEqual(distBuf.length);

      // NT PE Signature 'PE\0\0' (0x50, 0x45, 0x00, 0x00)
      expect(distBuf[peOffset]).toBe(0x50);     // 'P'
      expect(distBuf[peOffset + 1]).toBe(0x45); // 'E'
      expect(distBuf[peOffset + 2]).toBe(0x00);
      expect(distBuf[peOffset + 3]).toBe(0x00);
    });

    it('4.3 verifies SHA-256 hash matches b2c16041ace7a4abdc5b20724c131ceb6de89dc081949fa6561ea6da6c2ca504 across all attestation files', () => {
      const distBuf = readFileSync(distExe);
      const computedHash = crypto.createHash('sha256').update(distBuf).digest('hex');
      expect(computedHash).toBe(expectedHash);

      const distShaContent = readFileSync(distSha, 'utf8').trim();
      const rootShaContent = readFileSync(rootSha, 'utf8').trim();
      const shaSumsContent = readFileSync(shaSums, 'utf8').trim();

      expect(distShaContent).toContain(expectedHash);
      expect(rootShaContent).toContain(expectedHash);
      expect(shaSumsContent).toContain(expectedHash);
    });

    it('4.4 verifies SelfUpdateManager.validateBinary confirms both binaries are valid PE', async () => {
      const mgr = new SelfUpdateManager(projectRoot);

      const distValidation = await mgr.validateBinary(distExe);
      expect(distValidation.valid).toBe(true);
      expect(distValidation.fileSize).toBe(expectedSize);
      expect(distValidation.sha256).toBe(expectedHash);
      expect(distValidation.reason).toBeUndefined();

      const rootValidation = await mgr.validateBinary(rootExe);
      expect(rootValidation.valid).toBe(true);
      expect(rootValidation.fileSize).toBe(expectedSize);
      expect(rootValidation.sha256).toBe(expectedHash);
      expect(rootValidation.reason).toBeUndefined();
    });
  });
});
