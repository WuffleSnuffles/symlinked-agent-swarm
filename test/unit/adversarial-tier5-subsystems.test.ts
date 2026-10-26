/**
 * test/unit/adversarial-tier5-subsystems.test.ts
 *
 * Tier 5 Adversarial Coverage Hardening:
 * White-Box Code Coverage & Stress Testing Across Subsystems:
 * 1. CLI Dispatcher (src/server/cli-dispatcher.ts):
 *    - Subcommand routing (courier petition/dispatch/review/afk/wisdom/envoys, status/grid status, version, help, start).
 *    - Corrupted/uninitialized roster, cubicles, and status directory handling.
 *    - Courier status query: missing ID, non-existent petition, vetoed petition, ratified petition.
 *    - Courier AFK: missing file fallback, corrupted JSON recovery, active night-shift and digest summary reporting.
 *    - Courier Wisdom: default topic/agent fallback, custom topic/agent ratification.
 * 2. Self-Update Engine (src/server/self-update-manager.ts):
 *    - Win32 PE validation edge cases: missing file, tiny buffer (<16B), invalid DOS signature (no MZ),
 *      truncated before PE pointer (<64B), PE offset pointer out of bounds, invalid PE signature (no PE\0\0).
 *    - Atomic swap: rejection of invalid staged binary, eviction of pre-existing .old.exe backup,
 *      semver component auto-increment (1.0.0 -> 1.0.1, 2.9.9 -> 2.9.10, 5 -> 6).
 *    - Rollback swap: missing backup abort, isolation to .failed.<ts>.exe and restore of healthy backup.
 *    - Stale binary cleanup: removal of multiple .old.*.exe and .failed.*.exe while preserving active binary.
 * 3. Real-Time WebSocket Bus (src/server/index.ts wss):
 *    - Client connection lifecycle on ws://127.0.0.1:<port>/events.
 *    - Multi-subscriber broadcast reception across concurrent connected clients.
 *    - Broadcasts for cubicle state changes, task creation, claim, review, completion, and veto.
 *    - Abrupt client disconnect resilience (remaining subscribers receive events cleanly).
 *    - High-frequency burst broadcast stress (25 rapid sequential events).
 * 4. Rich Multimodal Media Streaming & RFC 7233 Ranges (src/server/routes/media-routes.ts):
 *    - Path traversal defenses: system directory escape, URL encoded traversal, outside workspace rejection.
 *    - Missing path parameter, directory path request, non-existent file handling.
 *    - RFC 7233 Byte-Range parser: standard ranges, open-ended ranges, suffix ranges, oversized suffix,
 *      single-byte ranges, inverted ranges, out-of-bounds start, non-numeric ranges, empty parts,
 *      0-byte file range rejection (HTTP 416 bytes * / 0) vs 0-byte file full request (HTTP 200).
 *    - Full MIME_MAP coverage: documents (.pdf, .json, .md, .txt, .ts, .js, .html, .css),
 *      images (.png, .jpg, .jpeg, .webp, .gif, .svg), audio (.mp3, .wav, .ogg, .m4a),
 *      video (.mp4, .webm, .mov), and unknown extension fallback (application/octet-stream).
 * 5. Panopticon Server REST Lifecycle & SPA Fallback (src/server/index.ts):
 *    - /api/health contract validation and dynamic active cubicle calculation under lifecycle transitions.
 *    - Taskboard and cubicle REST management routes with error handling.
 *    - CORS preflight and SPA fallback routing (?panel=cubicles, ?panel=console, ?panel=taskboard).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createTestSandbox, createPeTestBuffer } from '../e2e/helpers.js';
import {
  parseCliArgs,
  executeCliCommand,
  getHelpManualText,
} from '../../src/server/cli-dispatcher.js';
import { SelfUpdateManager } from '../../src/server/self-update-manager.js';
import { createSwarmServer, SwarmServerInstance } from '../../src/server/index.js';
import { MIME_MAP } from '../../src/server/routes/media-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Tier 5 Adversarial Coverage Hardening: System Subsystems', () => {

  // =========================================================================
  // Subsystem 1: CLI Dispatcher Edge Cases & Error Branches (cli-dispatcher.ts)
  // =========================================================================
  describe('Subsystem 1: CLI Dispatcher White-Box Coverage (cli-dispatcher.ts)', () => {
    let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

    beforeEach(async () => {
      sandbox = await createTestSandbox('t5_cli');
    });

    afterEach(async () => {
      await sandbox.cleanup();
    });

    it('1.1 parses edge-case argv combinations: empty, single-element, and courier aliases', () => {
      // 1. Empty argv array
      const emptyParsed = parseCliArgs([]);
      expect(emptyParsed.command).toBe('start');
      expect(emptyParsed.port).toBe(3820);
      expect(emptyParsed.headless).toBe(false);

      // 2. Single-element argv
      const singleParsed = parseCliArgs(['node']);
      expect(singleParsed.command).toBe('start');

      // 3. courier dispatch alias -> routes to courier_submit
      const dispatchParsed = parseCliArgs([
        'node', 'exe', 'courier', 'dispatch',
        '--agent', 'hermes',
        'Sync worktree submodules',
      ]);
      expect(dispatchParsed.command).toBe('courier_submit');
      expect(dispatchParsed.agent).toBe('hermes');
      expect(dispatchParsed.prompt).toBe('Sync worktree submodules');

      // 4. courier review alias -> routes to courier_status
      const reviewParsed = parseCliArgs([
        'node', 'exe', 'courier', 'review', 'pet-review-123',
      ]);
      expect(reviewParsed.command).toBe('courier_status');
      expect(reviewParsed.petitionId).toBe('pet-review-123');

      // 5. courier petition with courier-pet- prefix -> routes to courier_status
      const petPrefixParsed = parseCliArgs([
        'node', 'exe', 'courier', 'petition', 'courier-pet-gamma-99',
      ]);
      expect(petPrefixParsed.command).toBe('courier_status');
      expect(petPrefixParsed.petitionId).toBe('courier-pet-gamma-99');

      // 6. courier afk with -w workspace flag
      const afkParsed = parseCliArgs([
        'node', 'exe', 'courier', 'afk',
        '-w', sandbox.sandboxDir,
      ]);
      expect(afkParsed.command).toBe('courier_afk');
      expect(afkParsed.workspace).toBe(path.resolve(sandbox.sandboxDir));
    });

    it('1.2 handles courier status with missing, non-existent, vetoed, and ratified petitions', async () => {
      // 1. Missing petition ID argument
      const missingResult = await executeCliCommand(
        { command: 'courier_status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(missingResult.handled).toBe(true);
      expect(missingResult.exitCode).toBe(1);
      expect(missingResult.output.some((l) => l.includes('Error: petition_id is required'))).toBe(true);

      // 2. Non-existent petition ID
      const notFoundResult = await executeCliCommand(
        { command: 'courier_status', petitionId: 'pet-ghost-404', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(notFoundResult.handled).toBe(true);
      expect(notFoundResult.exitCode).toBe(0);
      expect(notFoundResult.output.some((l) => l.includes('[COURIER] Petition not found: pet-ghost-404'))).toBe(true);

      // 3. Existing petition with Veto Rationale
      const petDir = path.join(sandbox.swarmDir, 'courier', 'petitions');
      await fs.mkdir(petDir, { recursive: true });
      const vetoPet = {
        sender_agent: 'openclaw',
        status: 'VETOED',
        prompt: 'Unrestricted database truncate',
        created_at: new Date().toISOString(),
        veto_rationale: 'Consular Ferric Intercessio: Destructive command rejected.',
      };
      await fs.writeFile(path.join(petDir, 'pet-vetoed-01.json'), JSON.stringify(vetoPet, null, 2), 'utf8');

      const vetoResult = await executeCliCommand(
        { command: 'courier_status', petitionId: 'pet-vetoed-01', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(vetoResult.handled).toBe(true);
      expect(vetoResult.exitCode).toBe(0);
      expect(vetoResult.output.some((l) => l.includes('Veto Reason:   Consular Ferric Intercessio: Destructive command rejected.'))).toBe(true);
      expect(vetoResult.output.some((l) => l.includes('Status:       VETOED'))).toBe(true);

      // 4. Existing petition with Consular Seal (Ratified)
      const sealedPet = {
        sender_agent: 'hermes',
        status: 'SEALED',
        prompt: 'Generate API schema',
        created_at: new Date().toISOString(),
        consular_seal: {
          approved_by: ['Consul Nia Nova', 'Consul Ferric Lunaux'],
          ratified_at: new Date().toISOString(),
        },
      };
      await fs.writeFile(path.join(petDir, 'pet-sealed-02.json'), JSON.stringify(sealedPet, null, 2), 'utf8');

      const sealedResult = await executeCliCommand(
        { command: 'courier_status', petitionId: 'pet-sealed-02', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(sealedResult.handled).toBe(true);
      expect(sealedResult.exitCode).toBe(0);
      expect(sealedResult.output.some((l) => l.includes('Consular Seal: RATIFIED (Consul Nia Nova & Consul Ferric Lunaux)'))).toBe(true);
    });

    it('1.3 executes courier afk under missing, corrupted, and active night-shift states', async () => {
      // 1. Missing afk_state.json and missing consular_digest.json -> defaults to DISABLED / STANDBY
      const defaultAfk = await executeCliCommand(
        { command: 'courier_afk', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(defaultAfk.handled).toBe(true);
      expect(defaultAfk.exitCode).toBe(0);
      expect(defaultAfk.data?.afk_mode).toBe(false);
      expect(defaultAfk.data?.autonomous_nia).toBe(false);
      expect(defaultAfk.output.some((l) => l.includes('AFK Mode:       DISABLED'))).toBe(true);
      expect(defaultAfk.output.some((l) => l.includes('Autonomous Nia: STANDBY'))).toBe(true);
      expect(defaultAfk.output.some((l) => l.includes('Digest Summary: All tasks processed cleanly.'))).toBe(true);

      // 2. Corrupted afk_state.json and consular_digest.json -> resilient recovery
      const memDir = path.join(sandbox.swarmDir, 'memory');
      const logDir = path.join(sandbox.swarmDir, 'logs');
      await fs.mkdir(memDir, { recursive: true });
      await fs.mkdir(logDir, { recursive: true });
      await fs.writeFile(path.join(memDir, 'afk_state.json'), '{ MALFORMED_JSON_CONTENT ...', 'utf8');
      await fs.writeFile(path.join(logDir, 'consular_digest.json'), 'INVALID_JSON_LOG', 'utf8');

      const corruptAfk = await executeCliCommand(
        { command: 'courier_afk', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(corruptAfk.handled).toBe(true);
      expect(corruptAfk.exitCode).toBe(0);
      expect(corruptAfk.data?.afk_mode).toBe(false);
      expect(corruptAfk.output.some((l) => l.includes('AFK Mode:       DISABLED (Default)'))).toBe(true);

      // 3. Active AFK mode with valid digest
      await fs.writeFile(
        path.join(memDir, 'afk_state.json'),
        JSON.stringify({ enabled: true, auto_answer_preferences: true }),
        'utf8'
      );
      await fs.writeFile(
        path.join(logDir, 'consular_digest.json'),
        JSON.stringify({ summary: 'Night shift autonomous mode resolved 8 routine tasks cleanly.' }),
        'utf8'
      );

      const activeAfk = await executeCliCommand(
        { command: 'courier_afk', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(activeAfk.handled).toBe(true);
      expect(activeAfk.exitCode).toBe(0);
      expect(activeAfk.data?.afk_mode).toBe(true);
      expect(activeAfk.data?.autonomous_nia).toBe(true);
      expect(activeAfk.output.some((l) => l.includes('AFK Mode:       ENABLED'))).toBe(true);
      expect(activeAfk.output.some((l) => l.includes('Autonomous Nia: ACTIVE'))).toBe(true);
      expect(activeAfk.output.some((l) => l.includes('Digest Summary: Night shift autonomous mode resolved 8 routine tasks cleanly.'))).toBe(true);
    });

    it('1.4 executes courier wisdom with default and custom topic/agent', async () => {
      // 1. Default invocation (Swarm Architecture / openclaw)
      const defWisdom = await executeCliCommand(
        { command: 'courier_wisdom', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(defWisdom.handled).toBe(true);
      expect(defWisdom.exitCode).toBe(0);
      expect(defWisdom.data).toBeDefined();
      expect(defWisdom.data.guidance).toBeDefined();
      expect(Array.isArray(defWisdom.data.plan)).toBe(true);
      expect(defWisdom.output.some((l) => l.includes('CONSULAR WISDOM RATIFIED FOR OPENCLAW: Swarm Architecture'))).toBe(true);

      // 2. Custom topic and agent
      const customWisdom = await executeCliCommand(
        {
          command: 'courier_wisdom',
          topic: 'High-Concurrency Task Claims',
          agent: 'hermes',
          port: 3820,
          headless: false,
          workspace: sandbox.sandboxDir,
        },
        { exitOnComplete: false }
      );
      expect(customWisdom.handled).toBe(true);
      expect(customWisdom.exitCode).toBe(0);
      expect(customWisdom.output.some((l) => l.includes('CONSULAR WISDOM RATIFIED FOR HERMES: High-Concurrency Task Claims'))).toBe(true);
      expect(customWisdom.output.some((l) => l.includes('Ratified By: Consul Nia Nova & Consul Ferric Lunaux'))).toBe(true);
    });

    it('1.5 executes courier envoys and lists all registered external agents', async () => {
      const envoysResult = await executeCliCommand(
        { command: 'courier_envoys', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(envoysResult.handled).toBe(true);
      expect(envoysResult.exitCode).toBe(0);
      expect(Array.isArray(envoysResult.data)).toBe(true);
      expect(envoysResult.data.length).toBeGreaterThanOrEqual(3);
      expect(envoysResult.output.some((l) => l.includes('OPENCLAW'))).toBe(true);
      expect(envoysResult.output.some((l) => l.includes('HERMES'))).toBe(true);
      expect(envoysResult.output.some((l) => l.includes('GPT-DOT'))).toBe(true);
    });

    it('1.6 handles status command under corrupted roster.json, corrupted cubicles.json, and uninitialized swarm', async () => {
      // 1. Uninitialized swarm (no roster.json, no cubicles.json)
      const uninitResult = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(uninitResult.handled).toBe(true);
      expect(uninitResult.exitCode).toBe(0);
      expect(uninitResult.output.some((l) => l.includes('[PANOPTICON] Swarm is offline or uninitialized'))).toBe(true);

      // 2. Corrupted roster.json -> logs error and returns exitCode 1
      await fs.writeFile(path.join(sandbox.swarmDir, 'roster.json'), '{{{ INVALID_JSON', 'utf8');
      const corruptRoster = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(corruptRoster.handled).toBe(true);
      expect(corruptRoster.exitCode).toBe(1);
      expect(corruptRoster.output.some((l) => l.includes('Failed to parse roster.json'))).toBe(true);
      await fs.unlink(path.join(sandbox.swarmDir, 'roster.json'));

      // 3. Missing roster.json, but corrupted cubicles.json -> logs error and returns exitCode 1
      await fs.writeFile(path.join(sandbox.swarmDir, 'status', 'cubicles.json'), 'NOT_A_VALID_JSON', 'utf8');
      const corruptCubicles = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(corruptCubicles.handled).toBe(true);
      expect(corruptCubicles.exitCode).toBe(1);
      expect(corruptCubicles.output.some((l) => l.includes('Failed to parse cubicles.json'))).toBe(true);
      await fs.unlink(path.join(sandbox.swarmDir, 'status', 'cubicles.json'));

      // 4. Valid cubicles.json fallback -> formats 4x4 matrix and 16 rows
      const mockCubicles = Array.from({ length: 16 }, (_, i) => ({
        id: `cubicle-${String(i + 1).padStart(2, '0')}`,
        slot_index: i,
        assigned: i < 3,
        model: i === 0 || i === 1 ? 'Gemini 4 Argon (High)' : i === 2 ? 'GPT Astra (Very High)' : 'unassigned',
        thinking_tier: i < 2 ? 'High' : i === 2 ? 'Very High' : 'Low',
        state: i < 3 ? 'idle' : 'vacant',
        fatigue_percentage: i === 0 ? 15 : 0,
      }));
      await fs.writeFile(path.join(sandbox.swarmDir, 'status', 'cubicles.json'), JSON.stringify(mockCubicles), 'utf8');

      const validCubicles = await executeCliCommand(
        { command: 'status', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(validCubicles.handled).toBe(true);
      expect(validCubicles.exitCode).toBe(0);
      expect(validCubicles.output.some((l) => l.includes('PANOPTICON 4x4 CUBICLE SURVEILLANCE ROSTER MATRIX'))).toBe(true);
      expect(validCubicles.output.some((l) => l.includes('[cubicle-01: idle]'))).toBe(true);
      expect(validCubicles.output.some((l) => l.includes('cubicle-01 | YES      | Gemini 4 Argon (High)'))).toBe(true);
    });

    it('1.7 executes version, help, and start (daemon signal) cleanly', async () => {
      // 1. Version
      const versionRes = await executeCliCommand(
        { command: 'version', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(versionRes.handled).toBe(true);
      expect(versionRes.exitCode).toBe(0);
      expect(versionRes.output.some((l) => l.includes('Symlinked Agent Swarm v1.0.0'))).toBe(true);

      // 2. Help manual text
      const helpRes = await executeCliCommand(
        { command: 'help', port: 3820, headless: false, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(helpRes.handled).toBe(true);
      expect(helpRes.exitCode).toBe(0);
      expect(helpRes.output.some((l) => l.includes('SYMLINKED AGENT SWARM // PANOPTICON CLI USAGE MANUAL'))).toBe(true);

      // 3. Start (daemon default) -> handled: false
      const startRes = await executeCliCommand(
        { command: 'start', port: 3820, headless: true, workspace: sandbox.sandboxDir },
        { exitOnComplete: false }
      );
      expect(startRes.handled).toBe(false);
      expect(startRes.exitCode).toBe(0);
    });
  });

  // =========================================================================
  // Subsystem 2: Self-Update Engine (self-update-manager.ts)
  // =========================================================================
  describe('Subsystem 2: Win32 PE Validation & Atomic Hot-Swap (self-update-manager.ts)', () => {
    let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
    let updateManager: SelfUpdateManager;

    beforeEach(async () => {
      sandbox = await createTestSandbox('t5_self_update');
      updateManager = new SelfUpdateManager(sandbox.sandboxDir);
    });

    afterEach(async () => {
      await sandbox.cleanup();
    });

    it('2.1 exercises all PE validation failure branches (<16B, invalid MZ, truncated <64B, bad PE offset, missing PE\\0\\0)', async () => {
      // Branch 1: File does not exist
      const nonExistent = await updateManager.validateBinary(path.join(sandbox.sandboxDir, 'missing.exe'));
      expect(nonExistent.valid).toBe(false);
      expect(nonExistent.reason).toContain('Binary not found');

      // Branch 2: File size < 16 bytes (e.g. 8 bytes)
      const tinyPath = path.join(sandbox.sandboxDir, 'tiny.exe');
      await fs.writeFile(tinyPath, Buffer.from([0x4d, 0x5a, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
      const tinyRes = await updateManager.validateBinary(tinyPath);
      expect(tinyRes.valid).toBe(false);
      expect(tinyRes.fileSize).toBe(8);
      expect(tinyRes.reason).toContain('Binary file too small (8 bytes)');

      // Branch 3: Invalid DOS signature (missing MZ)
      const badMzPath = path.join(sandbox.sandboxDir, 'bad_mz.exe');
      const badMzBuf = Buffer.alloc(128, 0x00);
      badMzBuf[0] = 0x5a; // 'Z'
      badMzBuf[1] = 0x4d; // 'M' (reversed)
      await fs.writeFile(badMzPath, badMzBuf);
      const badMzRes = await updateManager.validateBinary(badMzPath);
      expect(badMzRes.valid).toBe(false);
      expect(badMzRes.reason).toContain('Invalid DOS signature: missing MZ');

      // Branch 4: Truncated before PE pointer (size < 0x40 = 64 bytes)
      const truncPath = path.join(sandbox.sandboxDir, 'truncated.exe');
      const truncBuf = Buffer.alloc(48);
      truncBuf[0] = 0x4d;
      truncBuf[1] = 0x5a;
      await fs.writeFile(truncPath, truncBuf);
      const truncRes = await updateManager.validateBinary(truncPath);
      expect(truncRes.valid).toBe(false);
      expect(truncRes.reason).toContain('File truncated before PE pointer');

      // Branch 5: PE offset pointer out of bounds (offset < 0x40, e.g. 0x20)
      const badOffsetPath1 = path.join(sandbox.sandboxDir, 'bad_offset1.exe');
      const badOffsetBuf1 = Buffer.alloc(256);
      badOffsetBuf1[0] = 0x4d;
      badOffsetBuf1[1] = 0x5a;
      badOffsetBuf1.writeUInt32LE(0x20, 0x3c); // offset 0x20 < 0x40
      await fs.writeFile(badOffsetPath1, badOffsetBuf1);
      const badOffsetRes1 = await updateManager.validateBinary(badOffsetPath1);
      expect(badOffsetRes1.valid).toBe(false);
      expect(badOffsetRes1.reason).toContain('PE header pointer out of bounds');

      // Branch 6: PE offset pointer out of bounds (offset + 4 > stat.size)
      const badOffsetPath2 = path.join(sandbox.sandboxDir, 'bad_offset2.exe');
      const badOffsetBuf2 = Buffer.alloc(128);
      badOffsetBuf2[0] = 0x4d;
      badOffsetBuf2[1] = 0x5a;
      badOffsetBuf2.writeUInt32LE(0x100, 0x3c); // offset 256 > file size 128
      await fs.writeFile(badOffsetPath2, badOffsetBuf2);
      const badOffsetRes2 = await updateManager.validateBinary(badOffsetPath2);
      expect(badOffsetRes2.valid).toBe(false);
      expect(badOffsetRes2.reason).toContain('PE header pointer out of bounds');

      // Branch 7: Invalid PE signature at peOffset (missing PE\0\0)
      const badPeSigPath = path.join(sandbox.sandboxDir, 'bad_pe_sig.exe');
      const badPeSigBuf = Buffer.alloc(256);
      badPeSigBuf[0] = 0x4d;
      badPeSigBuf[1] = 0x5a;
      badPeSigBuf.writeUInt32LE(0x80, 0x3c); // valid offset 0x80
      badPeSigBuf[0x80] = 0x4e; // 'N'
      badPeSigBuf[0x81] = 0x45; // 'E' (New Executable, not PE)
      badPeSigBuf[0x82] = 0x00;
      badPeSigBuf[0x83] = 0x00;
      await fs.writeFile(badPeSigPath, badPeSigBuf);
      const badPeSigRes = await updateManager.validateBinary(badPeSigPath);
      expect(badPeSigRes.valid).toBe(false);
      expect(badPeSigRes.reason).toContain('Invalid PE signature: missing PE\\0\\0');

      // Branch 8: Valid Win32 PE
      const validPeBuf = createPeTestBuffer('VALID_PE_SUB_2', 512, 0x80);
      const validPePath = path.join(sandbox.sandboxDir, 'valid.exe');
      await fs.writeFile(validPePath, validPeBuf);
      const validRes = await updateManager.validateBinary(validPePath);
      expect(validRes.valid).toBe(true);
      expect(validRes.fileSize).toBe(512);
      expect(validRes.sha256).toBe(crypto.createHash('sha256').update(validPeBuf).digest('hex'));
    });

    it('2.2 aborts atomic swap if staged binary fails PE validation and increments varied version strings', async () => {
      const rootExe = updateManager.getRootExePath();
      const newExe = updateManager.getNewExePath();

      // Active binary is valid PE
      await fs.writeFile(rootExe, createPeTestBuffer('ACTIVE_ORIGINAL_BINARY'));
      // Staged binary is corrupt (not PE)
      await fs.writeFile(newExe, Buffer.from('NOT_A_PE_BINARY_STAGED_PAYLOAD'));

      // Must throw validation error without touching active binary
      await expect(updateManager.executeAtomicSwap('1.0.0')).rejects.toThrow(
        /Staged binary validation failed/
      );
      expect(existsSync(rootExe)).toBe(true);
      expect((await fs.readFile(rootExe)).toString()).toContain('ACTIVE_ORIGINAL_BINARY');

      // Now stage a valid PE binary
      await fs.writeFile(newExe, createPeTestBuffer('STAGED_VALID_BINARY_V1'));

      // Test version string increment logic: 1.0.0 -> 1.0.1
      const res1 = await updateManager.executeAtomicSwap('1.0.0');
      expect(res1.success).toBe(true);
      expect(res1.version_after).toBe('1.0.1');

      // Stage another valid binary and test multi-digit increment: 2.9.9 -> 2.9.10
      await fs.writeFile(newExe, createPeTestBuffer('STAGED_VALID_BINARY_V2'));
      const res2 = await updateManager.executeAtomicSwap('2.9.9');
      expect(res2.version_after).toBe('2.9.10');

      // Stage another valid binary and test single-digit version: 5 -> 6
      await fs.writeFile(newExe, createPeTestBuffer('STAGED_VALID_BINARY_V3'));
      const res3 = await updateManager.executeAtomicSwap('5');
      expect(res3.version_after).toBe('6');
    });

    it('2.3 performs rollback and stale executable cleanup under adversarial conditions', async () => {
      const rootExe = updateManager.getRootExePath();
      const oldExe = updateManager.getOldExePath();

      // 1. Rollback when backup does not exist -> throws error
      await expect(updateManager.rollbackSwap(path.join(sandbox.sandboxDir, 'phantom.old.exe'))).rejects.toThrow(
        /Rollback aborted: Backup binary not found/
      );

      // 2. Successful rollback restores oldExe to rootExe and isolates crashing binary to .failed.<ts>.exe
      await fs.writeFile(rootExe, createPeTestBuffer('CRASHING_PROMOTED_BINARY'));
      await fs.writeFile(oldExe, createPeTestBuffer('PREVIOUS_KNOWN_GOOD_BACKUP'));

      await updateManager.rollbackSwap(oldExe);
      expect(existsSync(rootExe)).toBe(true);
      expect((await fs.readFile(rootExe)).toString()).toContain('PREVIOUS_KNOWN_GOOD_BACKUP');

      // Check that a .failed.*.exe file was created
      const dirFiles = await fs.readdir(sandbox.sandboxDir);
      const failedFiles = dirFiles.filter((f) => f.startsWith('SymlinkedAgentSwarm.failed.') && f.endsWith('.exe'));
      expect(failedFiles.length).toBe(1);

      // 3. Stale executable cleanup removes .old.*.exe and .failed.*.exe but preserves rootExe and newExe
      const staleOld1 = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.111.exe');
      const staleOld2 = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.222.exe');
      const unrelated = path.join(sandbox.sandboxDir, 'config.json');
      await fs.writeFile(staleOld1, createPeTestBuffer('STALE_OLD_1'));
      await fs.writeFile(staleOld2, createPeTestBuffer('STALE_OLD_2'));
      await fs.writeFile(unrelated, JSON.stringify({ keep: true }));

      const cleaned = await updateManager.cleanupStaleExecutables();
      expect(cleaned.length).toBeGreaterThanOrEqual(3); // staleOld1, staleOld2, and failedFile
      expect(existsSync(rootExe)).toBe(true);
      expect(existsSync(unrelated)).toBe(true);
      expect(existsSync(staleOld1)).toBe(false);
      expect(existsSync(staleOld2)).toBe(false);
    });
  });

  // =========================================================================
  // Subsystem 3: Real-Time WebSocket Bus (src/server/index.ts wss)
  // =========================================================================
  describe('Subsystem 3: Real-Time WebSocket Bus Multi-Subscriber Broadcast & Resilience', () => {
    let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
    let serverInstance: SwarmServerInstance;
    let wsUrl: string;
    let httpUrl: string;
    let port: number;

    beforeAll(async () => {
      sandbox = await createTestSandbox('t5_ws');
      port = 4500 + Math.floor(Math.random() * 200);
      serverInstance = await createSwarmServer(sandbox.sandboxDir, port);
      await new Promise<void>((resolve) => {
        serverInstance.server.listen(port, () => {
          wsUrl = `ws://127.0.0.1:${port}/events`;
          httpUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (serverInstance) {
        await serverInstance.close();
      }
      if (sandbox) {
        await sandbox.cleanup();
      }
    });

    it('3.1 establishes WebSocket connection on /events and verifies handshake', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
      });

      expect(client.readyState).toBe(WebSocket.OPEN);
      client.close();
    });

    it('3.2 broadcasts domain events to multiple concurrent subscribers simultaneously', async () => {
      // Connect 3 concurrent WebSocket clients
      const client1 = new WebSocket(wsUrl);
      const client2 = new WebSocket(wsUrl);
      const client3 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise((res) => client1.on('open', res)),
        new Promise((res) => client2.on('open', res)),
        new Promise((res) => client3.on('open', res)),
      ]);

      const messages1: any[] = [];
      const messages2: any[] = [];
      const messages3: any[] = [];

      client1.on('message', (data) => messages1.push(JSON.parse(data.toString())));
      client2.on('message', (data) => messages2.push(JSON.parse(data.toString())));
      client3.on('message', (data) => messages3.push(JSON.parse(data.toString())));

      // Trigger cubicle status transition on server
      await serverInstance.cubicleManager.transitionStatus('cubicle-01', 'working', 'Executing benchmark suite');

      // Wait briefly for broadcast propagation
      await new Promise((r) => setTimeout(r, 100));

      expect(messages1.some((m) => m.type === 'CUBICLE_UPDATED' && m.payload.cubicle.id === 'cubicle-01')).toBe(true);
      expect(messages2.some((m) => m.type === 'CUBICLE_UPDATED' && m.payload.cubicle.id === 'cubicle-01')).toBe(true);
      expect(messages3.some((m) => m.type === 'CUBICLE_UPDATED' && m.payload.cubicle.id === 'cubicle-01')).toBe(true);

      // Verify payload structure (type, payload, timestamp)
      const sampleMsg = messages1.find((m) => m.type === 'CUBICLE_UPDATED');
      expect(sampleMsg.timestamp).toBeDefined();
      expect(new Date(sampleMsg.timestamp).getTime()).not.toBeNaN();
      expect(sampleMsg.payload.reason).toBe('Executing benchmark suite');

      client1.close();
      client2.close();
      client3.close();
    });

    it('3.3 broadcasts taskboard lifecycle events (CREATED, CLAIMED, REVIEW, COMPLETED, VETOED)', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((res) => client.on('open', res));
      const receivedEvents: Array<{ type: string; payload: any }> = [];
      client.on('message', (data) => receivedEvents.push(JSON.parse(data.toString())));

      // 1. Create Task via REST
      const createRes = await fetch(`${httpUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Adversarial Subsystem Audit', description: 'Stress-test tier 5' }),
      });
      const created = await createRes.json();
      const taskId = created.task.id;

      // 2. Claim Task via REST
      await fetch(`${httpUrl}/api/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cubicleId: 'cubicle-01', taskId }),
      });

      // 3. Submit for Review via REST
      await fetch(`${httpUrl}/api/tasks/${taskId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diff: '+ audit complete' }),
      });

      // 4. Complete Task via REST
      await fetch(`${httpUrl}/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      // 5. Create another task, claim it, submit to review, and veto it
      const vetoTaskRes = await fetch(`${httpUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Task to be vetoed' }),
      });
      const vetoTask = await vetoTaskRes.json();
      const vetoId = vetoTask.task.id;

      await fetch(`${httpUrl}/api/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cubicleId: 'cubicle-01', taskId: vetoId }),
      });

      await fetch(`${httpUrl}/api/tasks/${vetoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diff: 'staged for review' }),
      });

      await fetch(`${httpUrl}/api/tasks/${vetoId}/veto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consul: 'Consul Ferric Lunaux', rationale: 'Consular Veto Test' }),
      });

      await new Promise((r) => setTimeout(r, 150));

      const types = receivedEvents.map((e) => e.type);
      expect(types).toContain('TASK_CREATED');
      expect(types).toContain('TASK_CLAIMED');
      expect(types).toContain('TASK_SUBMITTED_REVIEW');
      expect(types).toContain('TASK_COMPLETED');
      expect(types).toContain('TASK_VETOED');

      client.close();
    });

    it('3.4 remains resilient when a subscriber terminates abruptly and handles burst broadcasts', async () => {
      const healthyClient = new WebSocket(wsUrl);
      const doomedClient = new WebSocket(wsUrl);

      await Promise.all([
        new Promise((res) => healthyClient.on('open', res)),
        new Promise((res) => doomedClient.on('open', res)),
      ]);

      const healthyMessages: any[] = [];
      healthyClient.on('message', (d) => healthyMessages.push(JSON.parse(d.toString())));

      // Abruptly terminate doomedClient without clean close
      doomedClient.terminate();

      // Dispatch a burst of 25 rapid status transitions
      for (let i = 0; i < 25; i++) {
        await serverInstance.cubicleManager.transitionStatus('cubicle-02', 'working', `Burst event ${i}`);
      }

      await new Promise((r) => setTimeout(r, 200));

      // Healthy client received all 25 burst events cleanly
      const burstEvents = healthyMessages.filter((m) => m.type === 'CUBICLE_UPDATED' && m.payload.cubicle.id === 'cubicle-02');
      expect(burstEvents.length).toBeGreaterThanOrEqual(25);

      healthyClient.close();
    });
  });

  // =========================================================================
  // Subsystem 4: Rich Multimodal Media Streaming & RFC 7233 (media-routes.ts)
  // =========================================================================
  describe('Subsystem 4: Media Streaming & RFC 7233 Ranges (media-routes.ts)', () => {
    let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
    let serverInstance: SwarmServerInstance;
    let baseUrl: string;
    let port: number;
    let mediaDir: string;
    let test1000Path: string;
    let emptyFilePath: string;

    beforeAll(async () => {
      sandbox = await createTestSandbox('t5_media');
      mediaDir = path.join(sandbox.sandboxDir, 'media_store');
      await fs.mkdir(mediaDir, { recursive: true });

      // Create 1000-byte test file with predictable byte values: buf[i] = i % 256
      const buf1000 = Buffer.alloc(1000);
      for (let i = 0; i < 1000; i++) {
        buf1000[i] = i % 256;
      }
      test1000Path = path.join(mediaDir, 'video_stream.mp4');
      await fs.writeFile(test1000Path, buf1000);

      // Create 0-byte empty file
      emptyFilePath = path.join(mediaDir, 'empty.txt');
      await fs.writeFile(emptyFilePath, Buffer.alloc(0));

      port = 4700 + Math.floor(Math.random() * 200);
      serverInstance = await createSwarmServer(projectRoot, port);
      await new Promise<void>((resolve) => {
        serverInstance.server.listen(port, () => {
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (serverInstance) {
        await serverInstance.close();
      }
      if (sandbox) {
        await sandbox.cleanup();
      }
    });

    it('4.1 enforces path traversal security and query parameter validation', async () => {
      // 1. Missing query param ?path
      const missingParam = await fetch(`${baseUrl}/api/media/serve`);
      expect(missingParam.status).toBe(400);
      const missingBody = await missingParam.json();
      expect(missingBody.error).toContain('Missing required query parameter: path');

      // 2. Directory path request
      const dirReq = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(mediaDir)}`);
      expect(dirReq.status).toBe(400);
      const dirBody = await dirReq.json();
      expect(dirBody.error).toContain('Requested path is a directory');

      // 3. Non-existent file
      const ghostReq = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(path.join(mediaDir, 'phantom.pdf'))}`);
      expect(ghostReq.status).toBe(404);
      const ghostBody = await ghostReq.json();
      expect(ghostBody.error).toContain('Media file not found');

      // 4. Windows System32 path traversal escape
      const sysReq = await fetch(`${baseUrl}/api/media/serve?path=C%3A%5CWindows%5CSystem32%5Ccmd.exe`);
      expect(sysReq.status).toBe(403);
      const sysBody = await sysReq.json();
      expect(sysBody.error).toContain('FORBIDDEN: Path traversal outside allowed workspace');

      // 5. Unix /etc/ traversal escape
      const etcReq = await fetch(`${baseUrl}/api/media/serve?path=%2Fetc%2Fpasswd`);
      expect(etcReq.status).toBe(403);
    });

    it('4.2 parses RFC 7233 range headers across edge cases (suffix, oversized, single-byte, open-ended)', async () => {
      // 1. Standard prefix range: bytes=0-99 (100 bytes)
      const res0_99 = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=0-99' },
      });
      expect(res0_99.status).toBe(206);
      expect(res0_99.headers.get('Content-Range')).toBe('bytes 0-99/1000');
      expect(res0_99.headers.get('Content-Length')).toBe('100');
      expect(res0_99.headers.get('Content-Type')).toBe('video/mp4');
      const buf0_99 = Buffer.from(await res0_99.arrayBuffer());
      expect(buf0_99.length).toBe(100);
      expect(buf0_99[0]).toBe(0);
      expect(buf0_99[99]).toBe(99);

      // 2. Open-ended range: bytes=950- (50 bytes: 950..999)
      const resOpen = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=950-' },
      });
      expect(resOpen.status).toBe(206);
      expect(resOpen.headers.get('Content-Range')).toBe('bytes 950-999/1000');
      expect(resOpen.headers.get('Content-Length')).toBe('50');
      const bufOpen = Buffer.from(await resOpen.arrayBuffer());
      expect(bufOpen.length).toBe(50);
      expect(bufOpen[0]).toBe(950 % 256);
      expect(bufOpen[49]).toBe(999 % 256);

      // 3. Suffix range: bytes=-50 (last 50 bytes: 950..999)
      const resSuffix = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=-50' },
      });
      expect(resSuffix.status).toBe(206);
      expect(resSuffix.headers.get('Content-Range')).toBe('bytes 950-999/1000');
      expect(resSuffix.headers.get('Content-Length')).toBe('50');

      // 4. Oversized suffix range: bytes=-5000 (suffix > fileSize -> clamps to 0..999)
      const resOverSuffix = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=-5000' },
      });
      expect(resOverSuffix.status).toBe(206);
      expect(resOverSuffix.headers.get('Content-Range')).toBe('bytes 0-999/1000');
      expect(resOverSuffix.headers.get('Content-Length')).toBe('1000');

      // 5. Single-byte range at start: bytes=0-0 (1 byte)
      const res0_0 = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=0-0' },
      });
      expect(res0_0.status).toBe(206);
      expect(res0_0.headers.get('Content-Range')).toBe('bytes 0-0/1000');
      expect(res0_0.headers.get('Content-Length')).toBe('1');
      const buf0_0 = Buffer.from(await res0_0.arrayBuffer());
      expect(buf0_0.length).toBe(1);
      expect(buf0_0[0]).toBe(0);

      // 6. Single-byte range at end: bytes=999-999 (1 byte)
      const resLast = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=999-999' },
      });
      expect(resLast.status).toBe(206);
      expect(resLast.headers.get('Content-Range')).toBe('bytes 999-999/1000');
      expect(resLast.headers.get('Content-Length')).toBe('1');
      const bufLast = Buffer.from(await resLast.arrayBuffer());
      expect(bufLast.length).toBe(1);
      expect(bufLast[0]).toBe(999 % 256);
    });

    it('4.3 rejects invalid, inverted, and out-of-bounds ranges with HTTP 416', async () => {
      // 1. Inverted range: start > end
      const invRes = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=500-200' },
      });
      expect(invRes.status).toBe(416);
      expect(invRes.headers.get('Content-Range')).toBe('bytes */1000');

      // 2. Out of bounds start >= fileSize
      const oobRes = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=1500-2000' },
      });
      expect(oobRes.status).toBe(416);
      expect(oobRes.headers.get('Content-Range')).toBe('bytes */1000');

      // 3. Start exactly at fileSize (1000-1050 on 1000-byte file)
      const edgeOob = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=1000-1050' },
      });
      expect(edgeOob.status).toBe(416);

      // 4. Non-numeric range: bytes=alpha-beta
      const nonNum = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=alpha-beta' },
      });
      expect(nonNum.status).toBe(416);

      // 5. Invalid suffix: bytes=-invalid
      const badSuffix = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=-invalid' },
      });
      expect(badSuffix.status).toBe(416);

      // 6. Multi-hyphen range: bytes=1-2-3
      const multiHyphen = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=1-2-3' },
      });
      expect(multiHyphen.status).toBe(416);

      // 7. Empty range: bytes=-
      const emptyHyphen = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(test1000Path)}`, {
        headers: { Range: 'bytes=-' },
      });
      expect(emptyHyphen.status).toBe(416);

      // 8. 0-byte file with range header -> HTTP 416 bytes */0
      const emptyRange = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(emptyFilePath)}`, {
        headers: { Range: 'bytes=0-0' },
      });
      expect(emptyRange.status).toBe(416);
      expect(emptyRange.headers.get('Content-Range')).toBe('bytes */0');

      // 9. 0-byte file without range header -> HTTP 200, Content-Length: 0
      const emptyFull = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(emptyFilePath)}`);
      expect(emptyFull.status).toBe(200);
      expect(emptyFull.headers.get('Content-Length')).toBe('0');
    });

    it('4.4 resolves MIME types across all MIME_MAP extensions and handles fallback', async () => {
      const extensions = Object.keys(MIME_MAP);

      for (const ext of extensions) {
        const filePath = path.join(mediaDir, `sample${ext}`);
        await fs.writeFile(filePath, Buffer.from(`MIME test for ${ext}`, 'utf8'));

        const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(filePath)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe(MIME_MAP[ext]);
      }

      // Fallback for unmapped extension .dat -> application/octet-stream
      const unmappedPath = path.join(mediaDir, 'unknown.dat');
      await fs.writeFile(unmappedPath, Buffer.from('unmapped payload'));
      const unmappedRes = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(unmappedPath)}`);
      expect(unmappedRes.status).toBe(200);
      expect(unmappedRes.headers.get('Content-Type')).toBe('application/octet-stream');
    });
  });

  // =========================================================================
  // Subsystem 5: Panopticon Server REST Lifecycle & SPA Fallback (index.ts)
  // =========================================================================
  describe('Subsystem 5: Panopticon Server REST Lifecycle & Health Contract (index.ts)', () => {
    let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
    let serverInstance: SwarmServerInstance;
    let baseUrl: string;
    let port: number;

    beforeAll(async () => {
      sandbox = await createTestSandbox('t5_rest');
      port = 4900 + Math.floor(Math.random() * 200);
      serverInstance = await createSwarmServer(projectRoot, port);
      await new Promise<void>((resolve) => {
        serverInstance.server.listen(port, () => {
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (serverInstance) {
        await serverInstance.close();
      }
      if (sandbox) {
        await sandbox.cleanup();
      }
    });

    it('5.1 satisfies /api/health contract and dynamically computes active cubicles', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe('ok');
      expect(data.version).toBe('1.0.0');
      expect(typeof data.uptime).toBe('number');
      expect(data.governance.mode).toBe('ROMAN_DUAL_CONSUL');
      expect(data.governance.consuls).toEqual(['Consul I', 'Consul II']);
      expect(data.governance.named_consuls).toEqual(['Consul Nia Nova', 'Consul Ferric Lunaux']);

      const initialActive = data.cubicles_active;
      expect(initialActive).toBeGreaterThanOrEqual(1);

      // Mutate cubicle state to 'error'
      await serverInstance.cubicleManager.transitionStatus('cubicle-01', 'error', 'Injected failure');
      const errHealth = await (await fetch(`${baseUrl}/api/health`)).json();
      expect(errHealth.cubicles_active).toBe(initialActive - 1);

      // Restore cubicle state to 'idle'
      await serverInstance.cubicleManager.transitionStatus('cubicle-01', 'idle', 'Restored to service');
      const restoredHealth = await (await fetch(`${baseUrl}/api/health`)).json();
      expect(restoredHealth.cubicles_active).toBe(initialActive);
    });

    it('5.2 handles cubicle REST management routes (/api/cubicles/:id)', async () => {
      // 1. GET all cubicles
      const allRes = await fetch(`${baseUrl}/api/cubicles`);
      expect(allRes.status).toBe(200);
      const allData = await allRes.json();
      expect(allData.cubicles.length).toBe(16);

      // 2. GET valid cubicle
      const c1Res = await fetch(`${baseUrl}/api/cubicles/cubicle-01`);
      expect(c1Res.status).toBe(200);
      const c1Data = await c1Res.json();
      expect(c1Data.cubicle.id).toBe('cubicle-01');

      // 3. GET non-existent cubicle -> 404
      const cGhostRes = await fetch(`${baseUrl}/api/cubicles/cubicle-99`);
      expect(cGhostRes.status).toBe(404);

      // 4. Configure cubicle
      const cfgRes = await fetch(`${baseUrl}/api/cubicles/cubicle-04/configure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          model: 'Claude 3.7 Sonnet',
          thinking_level: 'High',
        }),
      });
      expect(cfgRes.status).toBe(200);
      const cfgData = await cfgRes.json();
      expect(cfgData.cubicle.config.model).toBe('Claude 3.7 Sonnet');

      // 5. Recharge cubicle quota
      const rchgRes = await fetch(`${baseUrl}/api/cubicles/cubicle-04/recharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: 100000 }),
      });
      expect(rchgRes.status).toBe(200);

      // 6. Clear cubicle
      const clrRes = await fetch(`${baseUrl}/api/cubicles/cubicle-04/clear`, {
        method: 'POST',
      });
      expect(clrRes.status).toBe(200);
      const clrData = await clrRes.json();
      expect(clrData.cubicle.config.enabled).toBe(false);
    });

    it('5.3 handles task claiming validation and CORS preflight', async () => {
      // 1. Missing cubicleId on claim -> 400
      const badClaim = await fetch(`${baseUrl}/api/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-fake' }),
      });
      expect(badClaim.status).toBe(400);
      const badBody = await badClaim.json();
      expect(badBody.error).toContain('cubicleId is required');

      // 2. CORS preflight OPTIONS request
      const optRes = await fetch(`${baseUrl}/api/tasks`, {
        method: 'OPTIONS',
      });
      expect(optRes.status).toBe(200);
      expect(optRes.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(optRes.headers.get('Access-Control-Allow-Methods')).toContain('GET, POST');
    });

    it('5.4 handles SPA fallback for pop-out multi-monitor panels (?panel=*) while preserving 404 for unknown /api/', async () => {
      // 1. Root route -> 200 text/html
      const rootRes = await fetch(`${baseUrl}/`);
      expect(rootRes.status).toBe(200);
      expect(rootRes.headers.get('Content-Type')).toContain('text/html');

      // 2. Pop-out cubicles route -> 200 text/html
      const cubiclesPanel = await fetch(`${baseUrl}/?panel=cubicles`);
      expect(cubiclesPanel.status).toBe(200);
      expect(cubiclesPanel.headers.get('Content-Type')).toContain('text/html');

      // 3. Pop-out console route -> 200 text/html
      const consolePanel = await fetch(`${baseUrl}/?panel=console`);
      expect(consolePanel.status).toBe(200);
      expect(consolePanel.headers.get('Content-Type')).toContain('text/html');

      // 4. Pop-out taskboard route -> 200 text/html
      const taskboardPanel = await fetch(`${baseUrl}/?panel=taskboard`);
      expect(taskboardPanel.status).toBe(200);
      expect(taskboardPanel.headers.get('Content-Type')).toContain('text/html');

      // 5. Unknown API route -> does NOT fall back to HTML, returns 404
      const unknownApi = await fetch(`${baseUrl}/api/unknown/endpoint/route`);
      expect(unknownApi.status).toBe(404);
      expect(unknownApi.headers.get('Content-Type')).not.toContain('text/html');
    });
  });
});
