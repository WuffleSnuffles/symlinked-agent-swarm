/**
 * test/unit/adversarial-vault-selfupdate-courier.test.ts
 *
 * Empirical Adversarial Challenge Test Suite (Milestone 2):
 * 1. Preference Learning Under Rapid Concurrent Directives & Backup Corruption Recovery
 * 2. Skill & MCP Generator Invariants (Frontmatter validation, Path Traversal, Config Recovery)
 * 3. Consular Self-Update Pipeline (Veto Gating & Safe Windows Atomic Binary Swap)
 * 4. Courier Gateway Multi-Transport Invariants (OpenClaw, Hermes, GPT Dot, REST & File Drop)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox, createPeTestBuffer } from '../e2e/helpers';
import { PreferenceEngine, PreferenceEntry } from '../../src/server/preference-engine';
import { SkillMcpManager } from '../../src/server/mcp-generator';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { CourierGateway } from '../../src/server/courier-gateway';
import { ConsularVote } from '../../src/server/types/governance';

describe('Adversarial Challenge: Preference Learning, Vault, Self-Update & Courier Gateway', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let preferenceEngine: PreferenceEngine;
  let skillMcpManager: SkillMcpManager;
  let consularEngine: ConsularEngine;
  let taskboardManager: TaskboardManager;
  let courierGateway: CourierGateway;

  beforeEach(async () => {
    sandbox = await createTestSandbox('adv_m2_challenge');

    const cubicleManager = new CubicleManager(sandbox.swarmDir);
    taskboardManager = new TaskboardManager(sandbox.swarmDir);
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

    preferenceEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
    await preferenceEngine.initialize();

    skillMcpManager = new SkillMcpManager(sandbox.agentsDir, preferenceEngine);
    await skillMcpManager.initialize();

    courierGateway = new CourierGateway(
      sandbox.swarmDir,
      consularEngine,
      taskboardManager,
      sandbox.agentsDir
    );
    await courierGateway.initialize();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // 1. Preference Learning Under Rapid Concurrent Directives & Backup Recovery
  // =========================================================================
  describe('1. Preference Learning Under Rapid Concurrent Directives', () => {
    it('extracts structured preferences across all 5 categories under varied imperative styles', () => {
      const directives = [
        {
          text: 'Always write tests before implementing any feature code.',
          expectedCategory: 'testing',
          pattern: 'test/**',
        },
        {
          text: 'From now on, strictly maintain zero circular dependencies between modules.',
          expectedCategory: 'architecture',
          pattern: 'src/**',
        },
        {
          text: 'Never commit .env secrets or hardcode sensitive tokens.',
          expectedCategory: 'safety',
          pattern: '**/*.env*',
        },
        {
          text: 'Must create isolated git branch before merging tasks.',
          expectedCategory: 'workflow',
          pattern: '.git/**',
        },
        {
          text: 'Prefer functional immutable patterns over mutable global state.',
          expectedCategory: 'coding_style',
          pattern: 'src/**/*.ts',
        },
      ];

      for (const d of directives) {
        const extracted = preferenceEngine.extractPreferences(d.text);
        expect(extracted.length).toBeGreaterThanOrEqual(1);
        const pref = extracted[0];
        expect(pref.category).toBe(d.expectedCategory);
        expect(pref.trigger_patterns).toContain(d.pattern);
        expect(pref.confidence).toBeGreaterThanOrEqual(0.85);
        expect(pref.rule).toBe(d.text);
        expect(pref.key.length).toBeGreaterThan(0);
      }
    });

    it('handles rapid concurrent updates on the same key with semantic deduplication', async () => {
      // Seed initial preference
      const initial = await preferenceEngine.savePreference({
        category: 'testing',
        key: 'enforce_vitest_runner',
        rule: 'Always use Vitest for unit testing.',
        trigger_patterns: ['test/**'],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      expect(initial.hit_count).toBe(1);
      expect(preferenceEngine.getPreferences()).toHaveLength(1);

      // Fire 15 sequential updates with varying rules on the exact same key
      const updateCount = 15;
      for (let i = 1; i <= updateCount; i++) {
        await preferenceEngine.savePreference({
          category: 'testing',
          key: 'enforce_vitest_runner',
          rule: `Always use Vitest with coverage report v${i}.`,
          trigger_patterns: ['test/**', `test/v${i}/**`],
          confidence: 0.95,
          enabled: true,
          applies_to: 'all_cubicles',
        });
      }

      const allPrefs = preferenceEngine.getPreferences();
      // Must maintain exactly 1 deduplicated entry
      expect(allPrefs).toHaveLength(1);
      const updated = allPrefs[0];
      expect(updated.id).toBe(initial.id);
      expect(updated.key).toBe('enforce_vitest_runner');
      expect(updated.hit_count).toBe(1 + updateCount);
      expect(updated.rule).toBe(`Always use Vitest with coverage report v${updateCount}.`);

      // Verify physical disk file preferences.json has no duplicated keys
      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      const diskContent = JSON.parse(await fs.readFile(dbPath, 'utf8'));
      expect(diskContent.total_preferences).toBe(1);
      expect(diskContent.preferences).toHaveLength(1);
    });

    it('recovers seamlessly from backup when primary preferences.json suffers syntax corruption', async () => {
      // 1. Establish valid preference entries
      await preferenceEngine.savePreference({
        category: 'safety',
        key: 'strict_acl_enforcement',
        rule: 'Enforce strict path-level ACL on all cubicle operations.',
        trigger_patterns: ['src/**'],
        confidence: 0.95,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      // Second save creates .preferences.json.bak
      await preferenceEngine.savePreference({
        category: 'workflow',
        key: 'consular_two_gate',
        rule: 'All pull requests must pass Gate 1 and Gate 2 Consular consensus.',
        trigger_patterns: ['.swarm/**'],
        confidence: 0.98,
        enabled: true,
        applies_to: 'all_cubicles',
      });

      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      const bakPath = path.join(sandbox.swarmDir, 'memory', '.preferences.json.bak');

      // Verify backup exists
      const bakExists = await fs.access(bakPath).then(() => true).catch(() => false);
      expect(bakExists).toBe(true);

      // 2. Corrupt the primary JSON file with truncated/invalid syntax
      await fs.writeFile(dbPath, '{"version":"1.0.0", "total_preferences": 2, "preferences": [TRUNCATED_CORRUPT_PAYLOAD...', 'utf8');

      // 3. New PreferenceEngine instance initializes against the corrupted file
      const recoveryEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
      await recoveryEngine.initialize();

      // 4. Verify recovery restored both rules from backup without crash
      const recoveredPrefs = recoveryEngine.getPreferences();
      expect(recoveredPrefs.length).toBe(2);
      expect(recoveredPrefs.some((p) => p.key === 'strict_acl_enforcement')).toBe(true);
      expect(recoveredPrefs.some((p) => p.key === 'consular_two_gate')).toBe(true);

      // Primary file must have been automatically repaired on disk
      const repairedContent = JSON.parse(await fs.readFile(dbPath, 'utf8'));
      expect(repairedContent.preferences).toHaveLength(2);
    });

    it('falls back safely to clean database when BOTH primary and backup files are corrupt', async () => {
      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      const bakPath = path.join(sandbox.swarmDir, 'memory', '.preferences.json.bak');

      await fs.writeFile(dbPath, '<<<CORRUPTED_PRIMARY_FILE>>>', 'utf8');
      await fs.writeFile(bakPath, '<<<CORRUPTED_BACKUP_FILE>>>', 'utf8');

      const recoveryEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
      await recoveryEngine.initialize();

      expect(recoveryEngine.getPreferences()).toEqual([]);
      expect(recoveryEngine.getDatabase().total_preferences).toBe(0);

      // Must be able to save new preferences cleanly after double-corruption reset
      const newPref = await recoveryEngine.savePreference({
        category: 'testing',
        key: 'reset_recovery_test',
        rule: 'Ensure clean reset on unrecoverable syntax error.',
        trigger_patterns: [],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });

      expect(newPref.key).toBe('reset_recovery_test');
      expect(recoveryEngine.getPreferences()).toHaveLength(1);
    });

    it('compiles canonical USER_PREFERENCES.md and respects enabled/disabled filtering', async () => {
      await preferenceEngine.savePreference({
        category: 'coding_style',
        key: 'early_exit',
        rule: 'Always use early returns to avoid nesting.',
        trigger_patterns: ['**/*.ts'],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });

      await preferenceEngine.savePreference({
        category: 'testing',
        key: 'integration_specs',
        rule: 'Write integration specs for public APIs.',
        trigger_patterns: ['test/e2e/**'],
        confidence: 0.88,
        enabled: false, // Disabled! Must not appear in markdown
        applies_to: 'all',
      });

      const mdPath = path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md');
      const md = await fs.readFile(mdPath, 'utf8');

      expect(md).toContain('Total Active Rules: 1');
      expect(md).toContain('## 1. Coding Style & Quality');
      expect(md).toContain('- **[early_exit]**: Always use early returns to avoid nesting.');
      expect(md).not.toContain('integration_specs');

      // Test delete operation updates compiled markdown immediately
      await preferenceEngine.deletePreference('early_exit');
      const mdAfterDelete = await fs.readFile(mdPath, 'utf8');
      expect(mdAfterDelete).toContain('Total Active Rules: 0');
      expect(mdAfterDelete).not.toContain('early_exit');
    });

    it('injects learned preferences into LLM prompt filtered by filesTouched with fallback', async () => {
      await preferenceEngine.savePreference({
        category: 'safety',
        key: 'no_secrets',
        rule: 'Never commit secret API credentials.',
        trigger_patterns: ['**/*.env*', 'secrets/**'],
        confidence: 0.99,
        enabled: true,
        applies_to: 'all',
      });

      await preferenceEngine.savePreference({
        category: 'testing',
        key: 'unit_first',
        rule: 'Always run unit tests before submitting review.',
        trigger_patterns: ['test/**', '**/*.test.ts'],
        confidence: 0.95,
        enabled: true,
        applies_to: 'all',
      });

      // 1. Matched filesTouched: should only inject matching rule
      const promptTesting = preferenceEngine.injectLearnedPreferences({
        filesTouched: ['test/unit/runner.test.ts'],
      });
      expect(promptTesting).toContain('<user_learned_preferences>');
      expect(promptTesting).toContain('[unit_first]');
      expect(promptTesting).not.toContain('[no_secrets]');

      // 2. Unmatched filesTouched: fallback to all active preferences
      const promptGeneral = preferenceEngine.injectLearnedPreferences({
        filesTouched: ['docs/README.md'],
      });
      expect(promptGeneral).toContain('[unit_first]');
      expect(promptGeneral).toContain('[no_secrets]');
    });
  });

  // =========================================================================
  // 2. Skill & MCP Generator Invariants
  // =========================================================================
  describe('2. Skill & MCP Generator Invariants', () => {
    it('verifies frontmatter rejection on malformed inputs and acceptance on valid YAML', () => {
      // 1. Missing opening delimiter
      const noOpening = 'name: bad-skill\ndescription: missing opening\n---\nBody';
      const res1 = skillMcpManager.validateFrontmatter(noOpening);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Frontmatter must start with ---');

      // 2. Missing closing delimiter
      const noClosing = '---\nname: bad-skill\ndescription: missing closing';
      const res2 = skillMcpManager.validateFrontmatter(noClosing);
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Missing closing ---');

      // 3. Missing name field
      const noName = '---\ndescription: Has description but no name\n---\nBody';
      const res3 = skillMcpManager.validateFrontmatter(noName);
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain('Missing mandatory "name:" field');

      // 4. Missing description field
      const noDesc = '---\nname: valid-name\n---\nBody';
      const res4 = skillMcpManager.validateFrontmatter(noDesc);
      expect(res4.valid).toBe(false);
      expect(res4.error).toContain('Missing mandatory "description:" field');

      // 5. Valid CRLF formatted YAML frontmatter
      const validCrlf = '---\r\nname: crlf-skill\r\ndescription: Windows line endings\r\n---\r\nBody';
      const res5 = skillMcpManager.validateFrontmatter(validCrlf);
      expect(res5.valid).toBe(true);
      expect(res5.metadata?.name).toBe('crlf-skill');
      expect(res5.metadata?.description).toBe('Windows line endings');
    });

    it('rejects path traversal attacks in skill names with SECURITY_VIOLATION', async () => {
      const maliciousNames = [
        '../../etc/passwd',
        '..\\..\\windows\\system32',
        'sub/folder',
        'sub\\folder',
        'foo/../../bar',
        '..',
      ];

      for (const badName of maliciousNames) {
        await expect(
          skillMcpManager.generateSkill({
            name: badName,
            description: 'Path traversal attempt',
          })
        ).rejects.toThrowError(/SECURITY_VIOLATION/);
      }
    });

    it('rejects path traversal attacks in MCP server names with SECURITY_VIOLATION', async () => {
      const maliciousMcpNames = [
        '../../root_mcp',
        '..\\..\\root_mcp',
        'nested/server',
        'nested\\server',
      ];

      for (const badName of maliciousMcpNames) {
        await expect(
          skillMcpManager.generateMcpServer({
            name: badName,
            tools: [{ name: 'probe', description: 'Attack probe' }],
          })
        ).rejects.toThrowError(/SECURITY_VIOLATION/);
      }
    });

    it('safely recovers to default empty config when mcp_config.json contains corrupt syntax', async () => {
      const mcpConfigPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');

      // Corrupt mcp_config.json
      await fs.writeFile(mcpConfigPath, '{CORRUPTED_JSON_CONFIG_FILE:::', 'utf8');

      // Calling generateMcpServer should not crash, must recover and register
      const result = await skillMcpManager.generateMcpServer({
        name: 'recovery-server',
        description: 'Server registered after corrupt config recovery',
        tools: [
          {
            name: 'health_check',
            description: 'Returns health status',
          },
        ],
      });

      expect(result.serverName).toBe('recovery-server');
      expect(result.toolsCount).toBe(1);

      // Verify mcp_config.json is now valid JSON containing the new server
      const recoveredConfig = JSON.parse(await fs.readFile(mcpConfigPath, 'utf8'));
      expect(recoveredConfig.mcpServers['recovery-server']).toBeDefined();
      expect(recoveredConfig.mcpServers['recovery-server'].command).toBe('node');

      // Tool schema parameter defaults to object schema when omitted
      const toolSchemaPath = path.join(result.serverPath, 'tools', 'health_check.json');
      const toolSchema = JSON.parse(await fs.readFile(toolSchemaPath, 'utf8'));
      expect(toolSchema.parameters).toEqual({ type: 'object', properties: {} });
    });

    it('aggregates skills, MCP servers, and learned preferences into Panopticon Vault Catalog', async () => {
      // 1. Add preference
      await preferenceEngine.savePreference({
        category: 'architecture',
        key: 'hexagonal_architecture',
        rule: 'Ports and adapters architecture required for server core.',
        trigger_patterns: ['src/server/**'],
        confidence: 0.92,
        enabled: true,
        applies_to: 'all',
      });

      // 2. Add skill
      await skillMcpManager.generateSkill({
        name: 'security-scanner',
        description: 'Scans for path traversal and command injection vulnerabilities.',
        instructions: 'Check all input parameters against path sanitizers.',
      });

      // 3. Add MCP server
      await skillMcpManager.generateMcpServer({
        name: 'git-sentinel',
        tools: [{ name: 'diff_checker', description: 'Checks staged diffs' }],
      });

      const catalog = await skillMcpManager.getVaultCatalog();
      expect(catalog.preferences.length).toBeGreaterThanOrEqual(1);
      expect(catalog.skills.some((s) => s.name === 'security-scanner')).toBe(true);
      expect(catalog.mcpServers.some((s) => s.name === 'git-sentinel')).toBe(true);
      expect(catalog.totalItems).toBe(catalog.preferences.length + catalog.skills.length + catalog.mcpServers.length);

      // Deleting skill updates catalog
      await skillMcpManager.deleteSkill('security-scanner');
      const catalogAfter = await skillMcpManager.getVaultCatalog();
      expect(catalogAfter.skills.some((s) => s.name === 'security-scanner')).toBe(false);
    });
  });

  // =========================================================================
  // 3. Consular Self-Update Pipeline Invariants
  // =========================================================================
  describe('3. Consular Self-Update Pipeline Invariants', () => {
    it('blocks binary compilation and swap when a Consular Veto (1/2 or 0/2) is cast', async () => {
      // 1. Stage existing running binary
      const rootExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.exe');
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_UNTOUCHED_BINARY_V1'));

      // 2. Initiate self-update
      const req = await consularEngine.initiateSelfUpdate('Upgrade to WebGPU raytracing');
      expect(req.status).toBe('PENDING_REVIEW');
      expect(req.branch).toContain('self-update/');

      // 3. Consul II vetoes (1/2 split)
      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Performance gain is promising.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: WebGPU driver instabilities risk crashing production nodes.',
          timestamp: new Date().toISOString(),
        },
      ];

      let vetoEventFired = false;
      consularEngine.onEvent((type) => {
        if (type === 'SELF_UPDATE_VETOED') vetoEventFired = true;
      });

      const result = await consularEngine.reviewSelfUpdate(req.request_id, votes);
      expect(result.status).toBe('VETOED');
      expect(vetoEventFired).toBe(true);

      // Verify running binary was NOT swapped or altered
      const currentBinary = await fs.readFile(rootExe, 'utf8');
      expect(currentBinary).toContain('RUNNING_UNTOUCHED_BINARY_V1');

      // Verify no .old.exe or .new.exe was created
      const oldExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.exe');
      const oldExists = await fs.access(oldExe).then(() => true).catch(() => false);
      expect(oldExists).toBe(false);

      // Verify incident logged in incidents.jsonl
      const incidents = await fs.readFile(path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
      expect(incidents).toContain('SELF_UPDATE_VETO_BLOCKED');
      expect(incidents).toContain(req.request_id);
    });

    it('executes safe Windows atomic binary swap upon unanimous 2/2 Consular approval', async () => {
      const rootExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.exe');
      const oldExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.exe');
      const newExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.new.exe');

      // Stage active binary, new compiled binary, and a stale leftover .old.exe from a previous update
      await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_VERSION_1.0.0'));
      await fs.writeFile(newExe, createPeTestBuffer('STAGED_COMPILED_VERSION_1.0.1'));
      await fs.writeFile(oldExe, createPeTestBuffer('STALE_OLD_BACKUP_TO_OVERWRITE'));

      const req = await consularEngine.initiateSelfUpdate('Integrate courier gateway multi-transport');

      const votes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'All integration tests pass and architecture verified.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Zero type errors, zero regressions, and zero resource leaks.',
          timestamp: new Date().toISOString(),
        },
      ];

      let readyEventFired = false;
      consularEngine.onEvent((type) => {
        if (type === 'SELF_UPDATE_READY') readyEventFired = true;
      });

      const updated = await consularEngine.reviewSelfUpdate(req.request_id, votes);

      expect(updated.status).toBe('SWAP_COMPLETED');
      expect(updated.version_before).toBe('1.0.0');
      expect(updated.version_after).toBe('1.0.1');
      expect(readyEventFired).toBe(true);

      // Verify atomic swap sequence:
      // 1. rootExe now contains the new binary
      expect(await fs.readFile(rootExe, 'utf8')).toContain('STAGED_COMPILED_VERSION_1.0.1');
      // 2. oldExe now contains the previous running binary (stale backup was safely unlinked first)
      expect(await fs.readFile(oldExe, 'utf8')).toContain('RUNNING_VERSION_1.0.0');
      // 3. newExe was renamed and no longer exists
      expect(await fs.access(newExe).then(() => true).catch(() => false)).toBe(false);

      // Verify persistent disk record
      const diskRecord = await consularEngine.getSelfUpdateStatus(req.request_id);
      expect(diskRecord.status).toBe('SWAP_COMPLETED');
      expect(diskRecord.version_after).toBe('1.0.1');
    });
  });

  // =========================================================================
  // 4. Courier Gateway Multi-Transport Invariants
  // =========================================================================
  describe('4. Courier Gateway Multi-Transport Invariants', () => {
    it('initializes ready-to-plug connector configurations for OpenClaw, Hermes, and GPT Dot', async () => {
      const envoys = courierGateway.getEnvoys();
      expect(envoys).toHaveLength(3);

      const agentMap = new Map(envoys.map((e) => [e.agent, e]));
      expect(agentMap.has('openclaw')).toBe(true);
      expect(agentMap.has('hermes')).toBe(true);
      expect(agentMap.has('gpt-dot')).toBe(true);

      for (const [agent, envoy] of agentMap.entries()) {
        const raw = await fs.readFile(envoy.connectorPath, 'utf8');
        const cfg = JSON.parse(raw);
        expect(cfg.agent).toBe(agent);
        expect(cfg.protocol).toBe('HTTP_REST_AND_FILE_DROP');
        expect(cfg.gateway_url).toContain('/api/courier');
        expect(cfg.capabilities).toContain('petition_submit');
        expect(cfg.capabilities).toContain('sealed_deliverable');
      }
    });

    it('processes petition with Consular Wisdom, Swarm task creation, and 2/2 Consular Seal', async () => {
      let sealedPayload: any = null;
      courierGateway.onEvent((type, payload) => {
        if (type === 'COURIER_SEALED') sealedPayload = payload;
      });

      const petition = await courierGateway.submitPetition({
        external_agent: 'openclaw',
        task_description: 'Audit WebSocket memory leak under 10k connections',
        context: { client_version: '2.4.0', cluster: 'us-east' },
      });

      expect(petition.id).toContain('courier-pet-openclaw');
      expect(petition.status).toBe('SEALED');

      // Consular Wisdom attached
      expect(petition.consular_wisdom?.approved_by).toEqual(['Consul I', 'Consul II']);
      expect(petition.consular_wisdom?.guidance).toContain('CONSULAR WISDOM RATIFIED');

      // Swarm task queued on taskboard
      expect(petition.swarm_task_id).toBeDefined();
      const allTasks = await taskboardManager.listAllTasks();
      const queuedTask = allTasks.todo.find((t) => t.id === petition.swarm_task_id);
      expect(queuedTask).toBeDefined();
      expect(queuedTask?.title).toContain('[Courier: openclaw]');

      // 2/2 Consular consensus votes
      expect(petition.consular_votes).toHaveLength(2);
      expect(petition.consular_votes?.[0].decision).toBe('APPROVE');
      expect(petition.consular_votes?.[1].decision).toBe('APPROVE');

      // Consular Seal
      expect(petition.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
      expect(petition.sealed_deliverable?.result).toContain('Consular ratification successfully granted');

      // Event emitted
      expect(sealedPayload).not.toBeNull();
      expect(sealedPayload.petition.id).toBe(petition.id);

      // Persisted to disk
      const persisted = courierGateway.getPetition(petition.id);
      expect(persisted).toBeDefined();
      expect(persisted?.status).toBe('SEALED');
    });

    it('processes multi-transport petitions across Hermes and GPT Dot sequentially', async () => {
      const petHermes = await courierGateway.submitPetition({
        external_agent: 'hermes',
        task_description: 'Dispatch encrypted message packet to federation',
      });
      expect(petHermes.status).toBe('SEALED');
      expect(petHermes.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');

      const petGptDot = await courierGateway.submitPetition({
        external_agent: 'gpt-dot',
        task_description: 'Generate weekly executive summary of taskboard throughput',
      });
      expect(petGptDot.status).toBe('SEALED');
      expect(petGptDot.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');

      const allPetitions = courierGateway.listPetitions();
      expect(allPetitions.length).toBeGreaterThanOrEqual(2);
    });

    it('processes dropped file petition in inbox, generates sealed outbox, and cleans inbox', async () => {
      const inboxFile = path.join(sandbox.swarmDir, 'courier', 'inbox', 'adv_petition_01.json');
      const outboxFile = path.join(sandbox.swarmDir, 'courier', 'outbox', 'adv_petition_01.json');

      const payload = {
        external_agent: 'openclaw',
        task_description: 'Verify file-drop transport delivery',
        context: { transport: 'file_drop_system' },
      };

      await fs.writeFile(inboxFile, JSON.stringify(payload, null, 2), 'utf8');

      const result = await courierGateway.processFileDrop('adv_petition_01.json');
      expect(result).not.toBeNull();
      expect(result?.status).toBe('SEALED');

      // Inbox file must be cleaned up (unlinked)
      const inboxExists = await fs.access(inboxFile).then(() => true).catch(() => false);
      expect(inboxExists).toBe(false);

      // Outbox file must exist and contain sealed deliverable
      const outboxExists = await fs.access(outboxFile).then(() => true).catch(() => false);
      expect(outboxExists).toBe(true);

      const outboxData = JSON.parse(await fs.readFile(outboxFile, 'utf8'));
      expect(outboxData.status).toBe('SEALED');
      expect(outboxData.sealed_deliverable.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
      expect(outboxData.consular_wisdom.approved_by).toEqual(['Consul I', 'Consul II']);

      // Non-existent file drop returns null safely
      const missing = await courierGateway.processFileDrop('non_existent.json');
      expect(missing).toBeNull();

      // Corrupted JSON file in inbox returns null without unhandled throw
      const corruptInbox = path.join(sandbox.swarmDir, 'courier', 'inbox', 'corrupt.json');
      await fs.writeFile(corruptInbox, '{NOT_VALID_JSON...', 'utf8');
      const corruptResult = await courierGateway.processFileDrop('corrupt.json');
      expect(corruptResult).toBeNull();
    });
  });
});
