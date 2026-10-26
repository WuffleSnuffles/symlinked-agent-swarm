/**
 * test/unit/milestone3-ui-backend.test.ts
 *
 * Comprehensive Unit Test Suite for Milestone 3:
 * 1. Static Asset Serving & SPA Fallback Routing (?panel=cubicles, ?panel=console, ?panel=taskboard).
 * 2. Multimodal Media Streaming (/api/media/serve) with HTTP 206 Byte Ranges & MIME Resolution.
 * 3. Safe Filesystem Browsing (/api/filesystem/browse) for Prompt Attachments.
 * 4. Mid-Work Consular Interventions (amend, evict, split, rebalance, impatience) & 2/2 Gate Enforcement.
 * 5. Consular Avatar 12-Scenario State Machine Transitions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createSwarmServer, SwarmServerInstance } from '../../src/server/index.js';
import { createTestSandbox } from '../e2e/helpers.js';
import { ConsularVote } from '../../src/server/types/governance.js';

describe('Milestone 3: Panopticon UI, Backend Media, Filesystem & Consular Interventions', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let serverInstance: SwarmServerInstance;
  let baseUrl: string;
  let testPort: number;

  beforeAll(async () => {
    sandbox = await createTestSandbox('unit_m3_ui');

    // Create a dummy sample test media file in sandbox
    const mediaDir = path.join(sandbox.sandboxDir, 'test_media');
    await fs.mkdir(mediaDir, { recursive: true });

    // 1. Text / Markdown sample
    await fs.writeFile(path.join(mediaDir, 'sample_doc.md'), '# Panopticon Architecture\nSample documentation content for testing.', 'utf8');

    // 2. Binary test buffer (1000 bytes)
    const testBinary = Buffer.alloc(1000, 0x42); // 1000 'B's
    await fs.writeFile(path.join(mediaDir, 'sample_stream.mp4'), testBinary);

    // 3. PDF dummy header
    const testPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8');
    await fs.writeFile(path.join(mediaDir, 'sample_doc.pdf'), testPdf);

    // 4. Sample image
    const testImg = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
    await fs.writeFile(path.join(mediaDir, 'sample_image.png'), testImg);

    // Allocate random port between 3900 and 4200
    testPort = 3910 + Math.floor(Math.random() * 150);

    // Start server pointing to project root
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const projectRoot = path.resolve(currentDir, '../../');
    // Serve real UI assets but keep all mutable state in the test sandbox.
    await fs.mkdir(path.join(sandbox.sandboxDir, 'src'), { recursive: true });
    await fs.cp(path.join(projectRoot, 'src', 'public'), path.join(sandbox.sandboxDir, 'src', 'public'), { recursive: true });
    serverInstance = await createSwarmServer(sandbox.sandboxDir, testPort);

    await new Promise<void>((resolve) => {
      serverInstance.server.listen(testPort, () => {
        baseUrl = `http://127.0.0.1:${testPort}`;
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

  // =========================================================================
  // 1. Static Asset Serving & SPA Fallback Routing
  // =========================================================================
  describe('1. Static Asset Serving & SPA Fallback Routing', () => {
    it('serves Panopticon SPA index.html on root /', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('PANOPTICON SURVEILLANCE MATRIX');
      expect(text).toContain('panopticon-main-container');
      expect(text).toContain('twin-sauron-canvas');
      expect(text).toContain('consular-prompt-avatar-widget');
      expect(text).toContain('kanban-board');
    });

    it('serves SPA index.html cleanly on detachable panel routes (?panel=cubicles, ?panel=console, ?panel=taskboard)', async () => {
      const routes = ['/?panel=cubicles', '/?panel=console', '/?panel=taskboard', '/?panel=all'];
      for (const route of routes) {
        const res = await fetch(`${baseUrl}${route}`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('panopticon-main-container');
      }
    });

    it('serves brutalist-theme.css with correct Content-Type', async () => {
      const res = await fetch(`${baseUrl}/css/brutalist-theme.css`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
      const text = await res.text();
      expect(text).toContain('--bg-primary');
      expect(text).toContain('--border-sharp');
    });

    it('serves client JS modules (app.js, consular-avatars.js, twin-sauron-canvas.js)', async () => {
      const modules = ['app.js', 'consular-avatars.js', 'twin-sauron-canvas.js', 'prompt-attachment.js', 'media-renderer.js', 'question-widget.js', 'cubicle-grid.js', 'taskboard-view.js'];
      for (const mod of modules) {
        const res = await fetch(`${baseUrl}/js/${mod}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/javascript/);
      }
    });

    it('serves high-resolution avatar texture sheets from /assets/avatars/...', async () => {
      const sheets = ['consul_nia_nova_sheet.jpg', 'consul_ferric_lunaux_sheet.jpg', 'consuls_wrestling_clash.jpg'];
      for (const sheet of sheets) {
        const res = await fetch(`${baseUrl}/assets/avatars/${sheet}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('image/jpeg');
      }
    });
  });

  // =========================================================================
  // 2. Multimodal Media Streaming & Byte-Range Support
  // =========================================================================
  describe('2. Multimodal Media Streaming (/api/media/serve)', () => {
    it('returns 400 when path parameter is missing', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Missing required query parameter: path');
    });

    it('returns 404 when requested media file does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=nonexistent_file_12345.mp4`);
      expect(res.status).toBe(404);
    });

    it('serves full media file (HTTP 200) with correct MIME type for PDF, video, audio, image', async () => {
      const testCases = [
        { path: 'test_media/sample_doc.pdf', mime: 'application/pdf' },
        { path: 'test_media/sample_image.png', mime: 'image/png' },
        { path: 'test_media/sample_stream.mp4', mime: 'video/mp4' },
        { path: 'test_media/sample_doc.md', mime: 'text/markdown' },
      ];

      for (const tc of testCases) {
        const fullPath = path.join(sandbox.sandboxDir, tc.path);
        const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(fullPath)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe(tc.mime);
        expect(res.headers.get('accept-ranges')).toBe('bytes');
      }
    });

    it('supports HTTP 206 Partial Content byte-range requests for video streaming', async () => {
      const fullPath = path.join(sandbox.sandboxDir, 'test_media/sample_stream.mp4');
      const start = 0;
      const end = 99; // 100 bytes of 1000

      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(fullPath)}`, {
        headers: { Range: `bytes=${start}-${end}` },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe(`bytes 0-99/1000`);
      expect(res.headers.get('content-length')).toBe('100');
      expect(res.headers.get('content-type')).toBe('video/mp4');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBe(100);
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer[0]).toBe(0x42);
      expect(buffer[99]).toBe(0x42);
    });

    it('supports RFC 7233 suffix byte ranges (bytes=-200) for streaming video tail', async () => {
      const fullPath = path.join(sandbox.sandboxDir, 'test_media/sample_stream.mp4');
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(fullPath)}`, {
        headers: { Range: 'bytes=-200' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 800-999/1000');
      expect(res.headers.get('content-length')).toBe('200');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      expect(res.headers.get('content-type')).toBe('video/mp4');
      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBe(200);
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer[0]).toBe(0x42);
      expect(buffer[199]).toBe(0x42);
    });

    it('returns 416 Range Not Satisfiable for invalid range out of bounds', async () => {
      const fullPath = path.join(sandbox.sandboxDir, 'test_media/sample_stream.mp4');
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(fullPath)}`, {
        headers: { Range: 'bytes=5000-6000' },
      });
      expect(res.status).toBe(416);
    });

    it('rejects path traversal outside allowed directories with 403', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent('../../Windows/System32/drivers/etc/hosts')}`);
      expect([403, 404]).toContain(res.status);
    });
  });

  // =========================================================================
  // 3. Safe Filesystem Browsing (/api/filesystem/browse)
  // =========================================================================
  describe('3. Safe Filesystem Browsing (/api/filesystem/browse)', () => {
    it('returns structured directory contents with currentPath, parentPath, directories, and files', async () => {
      const targetDir = path.join(sandbox.sandboxDir, 'test_media');
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent(targetDir)}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('currentPath');
      expect(data).toHaveProperty('directories');
      expect(data).toHaveProperty('files');

      expect(Array.isArray(data.files)).toBe(true);
      const fileNames = data.files.map((f: any) => f.name);
      expect(fileNames).toContain('sample_doc.md');
      expect(fileNames).toContain('sample_stream.mp4');
      expect(fileNames).toContain('sample_doc.pdf');
      expect(fileNames).toContain('sample_image.png');

      const mdFile = data.files.find((f: any) => f.name === 'sample_doc.md');
      expect(mdFile.extension).toBe('.md');
      expect(mdFile.size).toBeGreaterThan(0);
      expect(mdFile.modifiedAt).toBeDefined();
    });

    it('returns 404 when target directory does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent('C:/nonexistent_random_dir_12345')}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 when target path is a file rather than a directory', async () => {
      const filePath = path.join(sandbox.sandboxDir, 'test_media/sample_doc.md');
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent(filePath)}`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('not a directory');
    });
  });

  // =========================================================================
  // 4. Mid-Work Consular Interventions & 2/2 Consensus Gating
  // =========================================================================
  describe('4. Mid-Work Consular Interventions & 2/2 Consensus Gating', () => {
    let testTaskId: string;

    beforeAll(async () => {
      // Create a task in in_progress for testing interventions
      const task = await serverInstance.taskboardManager.createTask({
        title: 'Initial Test Implementation',
        description: 'Original instructions for worker.',
        priority: 'high',
        assigned_cubicle: 'cubicle-01',
      });
      // Move to in_progress
      await serverInstance.taskboardManager.claimTask('cubicle-01', task.id);
      testTaskId = task.id;
    });

    it('amends in-progress task prompt when both Consuls vote APPROVE (2/2 unanimous)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Nia approves prompt amendment to accelerate execution according to user intent.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Ferric confirms amended scope is reliable.',
          timestamp: new Date().toISOString(),
        },
      ];

      const amendedPrompt = 'Updated instructions: optimize loop algorithm and add caching.';
      const res = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: testTaskId, amendedPrompt, votes }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unanimous_approved).toBe(true);
      expect(data.action_taken).toBe('INTERVENTION_EXECUTED');
      expect(data.details.amendedPrompt).toBe(amendedPrompt);
    });

    it('blocks in-progress prompt amendment when 1 Consul votes VETO (1/2 split)', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Nia wants rapid rewrite.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'VETO',
          rationale: 'Ferric vetoes: rewrite mid-work introduces high probability of regression.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await fetch(`${baseUrl}/api/governance/intervention/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: testTaskId, amendedPrompt: 'Dangerous mid-work change', votes }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unanimous_approved).toBe(false);
      expect(data.action_taken).toBe('BLOCKED_BY_VETO');
      expect(data.dissenting_consuls).toContain('Consul Ferric Lunaux');
    });

    it('evicts slow worker and transfers work upon 2/2 Consular approval', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Nia approves: cubicle-01 is stalling; handover to cubicle-02.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Ferric approves: cubicle-02 has 100% capacity.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await fetch(`${baseUrl}/api/governance/intervention/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCubicleId: 'cubicle-01',
          toCubicleId: 'cubicle-02',
          reason: 'Worker stalled mid-flight',
          votes,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unanimous_approved).toBe(true);
      expect(data.action_taken).toBe('INTERVENTION_EXECUTED');
    });

    it('splits in-progress task into parallel child tasks upon 2/2 Consular approval', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Nia approves splitting task to finish faster.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Ferric approves: child tasks are decoupled.',
          timestamp: new Date().toISOString(),
        },
      ];

      const splits = [
        { cubicleId: 'cubicle-01', subtask: 'Frontend styling overhaul' },
        { cubicleId: 'cubicle-02', subtask: 'Backend endpoint validation' },
      ];

      const res = await fetch(`${baseUrl}/api/governance/intervention/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: testTaskId, splits, votes }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unanimous_approved).toBe(true);
      expect(data.action_taken).toBe('INTERVENTION_EXECUTED');
    });

    it('rebalances active workboard upon 2/2 Consular approval', async () => {
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul Nia Nova',
          decision: 'APPROVE',
          rationale: 'Nia approves rebalancing.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul Ferric Lunaux',
          decision: 'APPROVE',
          rationale: 'Ferric approves rebalance plan.',
          timestamp: new Date().toISOString(),
        },
      ];

      const res = await fetch(`${baseUrl}/api/governance/intervention/rebalance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rebalancePlan: { strategy: 'velocity_first' }, votes }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.unanimous_approved).toBe(true);
      expect(data.action_taken).toBe('INTERVENTION_EXECUTED');
    });

    it('triggers Nia Impatience protocol, logging dialogue and updating avatar scenario to nia_impatient', async () => {
      const res = await fetch(`${baseUrl}/api/governance/intervention/impatience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: testTaskId,
          cubicleId: 'cubicle-01',
          reason: 'Cubicle 1 has stalled for > 60 seconds without progress',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.triggered).toBe(true);
      expect(data.scenario).toBe('nia_impatient');
      expect(data.dialogue.content).toContain('IMPATIENCE PROTOCOL');

      // Verify avatar state reflects nia_impatient
      const avatarState = serverInstance.consularEngine.getAvatarState();
      expect(avatarState.state).toBe('nia_impatient');
    });
  });

  // =========================================================================
  // 5. Consular Avatar 12-Scenario State Machine
  // =========================================================================
  describe('5. Consular Avatar 12-Scenario State Machine', () => {
    it('retrieves current avatar state via GET /api/governance/avatar-state', async () => {
      const res = await fetch(`${baseUrl}/api/governance/avatar-state`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('avatarState');
      expect(data.avatarState).toHaveProperty('state');
    });

    it('transitions across all 12 defined scenarios via POST /api/governance/avatar-state', async () => {
      const allScenarios = [
        'idle_observing',
        'debating',
        'wrestling_fistfight',
        'nia_impatient',
        'disciplinary_execution',
        'consensus_celebration',
        'veto_clash',
        'error_alarm',
        'gladiator_spectators',
        'courier_arrival',
        'self_evolution_upgrade',
        'night_shift_afk',
      ] as const;

      for (const scenario of allScenarios) {
        const res = await fetch(`${baseUrl}/api/governance/avatar-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: scenario,
            debate_turns: scenario === 'wrestling_fistfight' ? 4 : 1,
            details: `Testing scenario ${scenario}`,
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.avatarState.state).toBe(scenario);

        const current = serverInstance.consularEngine.getAvatarState();
        expect(current.state).toBe(scenario);
      }
    });

    it('automatically transitions to wrestling_fistfight when debate turns reach >= 4', async () => {
      // Record 4 consecutive dialogue messages
      for (let i = 1; i <= 4; i++) {
        await serverInstance.consularEngine.recordDialogue(
          i % 2 === 1 ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          i % 2 === 1 ? 'rebellious_champion' : 'pragmatic_realist',
          `Debate argument turn ${i}: evaluating architecture trade-offs.`
        );
      }

      const avatarState = serverInstance.consularEngine.getAvatarState();
      expect(avatarState.state).toBe('wrestling_fistfight');
      expect(avatarState.debate_turns).toBeGreaterThanOrEqual(4);
    });

    it('transitions to consensus_celebration when 2/2 consensus is approved', async () => {
      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Aesthetic perfection.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Zero bugs detected.',
        timestamp: new Date().toISOString(),
      };

      const result = serverInstance.consularEngine.evaluateConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(true);

      const avatarState = serverInstance.consularEngine.getAvatarState();
      expect(avatarState.state).toBe('consensus_celebration');
    });

    it('transitions to veto_clash when Consular veto is enforced', async () => {
      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Approve.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'VETO',
        rationale: 'Unacceptable memory leak in cubicle worktree.',
        timestamp: new Date().toISOString(),
      };

      const result = serverInstance.consularEngine.evaluateConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);

      const avatarState = serverInstance.consularEngine.getAvatarState();
      expect(avatarState.state).toBe('veto_clash');
    });
  });
});
