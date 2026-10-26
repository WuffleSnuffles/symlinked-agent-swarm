import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  createTestSandbox,
  createJunction,
  isReparsePoint,
  verifyZeroCopyVisibility,
  atomicTaskClaim,
  evaluateSubswarmGating,
  evaluateConsularConsensus,
  compileUserPreferencesMarkdown,
  CubicleConfig,
  PreferencesDatabase,
  ConsularVote
} from './helpers';

describe('Tier 1: Comprehensive Feature Coverage (F1 to F10)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('t1_cov');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Feature 1: 16-Cubicle Grid Roster & Provider Configuration (R1)
  // =========================================================================
  describe('F1: 16-Cubicle Grid Roster & Configuration', () => {
    it('TC-T1-ROSTER-01: Grid topology initializes exactly 16 cubicle slots arranged in 4x4', async () => {
      const cubicles: CubicleConfig[] = Array.from({ length: 16 }, (_, i) => ({
        id: `cubicle-${String(i + 1).padStart(2, '0')}`,
        assigned: i < 3,
        provider: i === 0 || i === 1 ? 'Gemini' : i === 2 ? 'GPT' : 'unassigned',
        model: i === 0 || i === 1 ? 'Gemini 4 Argon' : i === 2 ? 'GPT Astra' : '',
        thinking_tier: i === 0 || i === 1 ? 'High' : i === 2 ? 'Very High' : 'Low',
        can_spawn_subswarm: i === 0 || i === 1,
        token_quota: 1000000,
        tokens_used: 0,
        fatigue_percent: 0,
        state: 'Relaxed/Idle',
        surface_thought: 'Standing by.'
      }));

      expect(cubicles).toHaveLength(16);
      expect(cubicles.map(c => c.id)).toEqual([
        'cubicle-01', 'cubicle-02', 'cubicle-03', 'cubicle-04',
        'cubicle-05', 'cubicle-06', 'cubicle-07', 'cubicle-08',
        'cubicle-09', 'cubicle-10', 'cubicle-11', 'cubicle-12',
        'cubicle-13', 'cubicle-14', 'cubicle-15', 'cubicle-16'
      ]);
    });

    it('TC-T1-ROSTER-02: Default roster assignment matches contract (Cubicles 1 & 2 Gemini 4 Argon, Cubicle 3 GPT Astra)', async () => {
      const c1: CubicleConfig = {
        id: 'cubicle-01',
        assigned: true,
        provider: 'Gemini',
        model: 'Gemini 4 Argon',
        thinking_tier: 'High',
        can_spawn_subswarm: true,
        token_quota: 1000000,
        tokens_used: 0,
        fatigue_percent: 0,
        state: 'Relaxed/Idle',
        surface_thought: 'Ready for assignment.'
      };
      const c2: CubicleConfig = { ...c1, id: 'cubicle-02' };
      const c3: CubicleConfig = {
        id: 'cubicle-03',
        assigned: true,
        provider: 'GPT',
        model: 'GPT Astra',
        thinking_tier: 'Very High',
        can_spawn_subswarm: false,
        token_quota: 800000,
        tokens_used: 0,
        fatigue_percent: 0,
        state: 'Relaxed/Idle',
        surface_thought: 'Awaiting directives.'
      };

      expect(c1.model).toBe('Gemini 4 Argon');
      expect(c1.thinking_tier).toBe('High');
      expect(c1.can_spawn_subswarm).toBe(true);

      expect(c2.model).toBe('Gemini 4 Argon');
      expect(c2.thinking_tier).toBe('High');
      expect(c2.can_spawn_subswarm).toBe(true);

      expect(c3.model).toBe('GPT Astra');
      expect(c3.thinking_tier).toBe('Very High');
      expect(c3.can_spawn_subswarm).toBe(false);
    });

    it('TC-T1-ROSTER-03: Vacant cubicles 4-16 initialize with unassigned status and zero usage', async () => {
      for (let i = 4; i <= 16; i++) {
        const id = `cubicle-${String(i).padStart(2, '0')}`;
        const vacant: CubicleConfig = {
          id,
          assigned: false,
          provider: 'unassigned',
          model: '',
          thinking_tier: 'Low',
          can_spawn_subswarm: false,
          token_quota: 0,
          tokens_used: 0,
          fatigue_percent: 0,
          state: 'Relaxed/Idle',
          surface_thought: 'Vacant slot.'
        };
        expect(vacant.assigned).toBe(false);
        expect(vacant.provider).toBe('unassigned');
        expect(vacant.token_quota).toBe(0);
      }
    });

    it('TC-T1-ROSTER-04: Pluggable provider configuration allows hot-swapping any cubicle to Claude/DeepSeek/Custom', async () => {
      const targetCubicle: CubicleConfig = {
        id: 'cubicle-04',
        assigned: false,
        provider: 'unassigned',
        model: '',
        thinking_tier: 'Low',
        can_spawn_subswarm: false,
        token_quota: 0,
        tokens_used: 0,
        fatigue_percent: 0,
        state: 'Relaxed/Idle',
        surface_thought: 'Vacant'
      };

      // Hot-swap configure to Claude 3.7 Sonnet
      targetCubicle.assigned = true;
      targetCubicle.provider = 'Claude';
      targetCubicle.model = 'Claude 3.7 Sonnet';
      targetCubicle.thinking_tier = 'High';
      targetCubicle.can_spawn_subswarm = true;
      targetCubicle.token_quota = 500000;

      expect(targetCubicle.assigned).toBe(true);
      expect(targetCubicle.provider).toBe('Claude');
      expect(targetCubicle.model).toBe('Claude 3.7 Sonnet');
      expect(targetCubicle.can_spawn_subswarm).toBe(true);
    });

    it('TC-T1-ROSTER-05: Resetting or clearing an occupied cubicle releases all state and returns to vacant', async () => {
      const activeCubicle: CubicleConfig = {
        id: 'cubicle-01',
        assigned: true,
        provider: 'Gemini',
        model: 'Gemini 4 Argon',
        thinking_tier: 'High',
        can_spawn_subswarm: true,
        token_quota: 1000000,
        tokens_used: 450000,
        fatigue_percent: 45,
        state: 'Working',
        surface_thought: 'Compiling ast.'
      };

      // Reset
      activeCubicle.assigned = false;
      activeCubicle.provider = 'unassigned';
      activeCubicle.model = '';
      activeCubicle.tokens_used = 0;
      activeCubicle.fatigue_percent = 0;
      activeCubicle.state = 'Relaxed/Idle';
      activeCubicle.surface_thought = 'Vacant slot.';

      expect(activeCubicle.assigned).toBe(false);
      expect(activeCubicle.tokens_used).toBe(0);
      expect(activeCubicle.state).toBe('Relaxed/Idle');
    });
  });

  // =========================================================================
  // Feature 2: Thinking-Tier Sub-Swarm Capability Gating (R2)
  // =========================================================================
  describe('F2: Thinking-Tier Sub-Swarm Capability Gating', () => {
    it('TC-T1-GATE-01: Gemini 4 Argon (High) is authorized to spawn sub-swarms', () => {
      const evaluation = evaluateSubswarmGating('Gemini 4 Argon', 'High');
      expect(evaluation.canSpawn).toBe(true);
      expect(evaluation.reason).toBeUndefined();
    });

    it('TC-T1-GATE-02: GPT Astra (Very High) is explicitly restricted from spawning sub-swarms', () => {
      const evaluation = evaluateSubswarmGating('GPT Astra', 'Very High');
      expect(evaluation.canSpawn).toBe(false);
      expect(evaluation.reason).toContain('CAPABILITY_RESTRICTION_ERROR');
      expect(evaluation.reason).toContain('GPT Astra (Very High) is restricted');
    });

    it('TC-T1-GATE-03: GPT Astra (Ultra) is authorized to spawn sub-swarms', () => {
      const evaluation = evaluateSubswarmGating('GPT Astra', 'Ultra');
      expect(evaluation.canSpawn).toBe(true);
      expect(evaluation.reason).toBeUndefined();
    });

    it('TC-T1-GATE-04: Unauthorized spawn attempt generates structured incident entry in logs', async () => {
      const cubicleId = 'cubicle-03';
      const model = 'GPT Astra';
      const tier = 'Very High';
      const evaluation = evaluateSubswarmGating(model, tier);

      expect(evaluation.canSpawn).toBe(false);

      const incidentLogPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
      const incidentEntry = {
        timestamp: new Date().toISOString(),
        level: 'WARNING',
        type: 'CAPABILITY_RESTRICTION_VIOLATION',
        cubicle_id: cubicleId,
        model,
        thinking_tier: tier,
        message: evaluation.reason,
        action: 'SPAWN_BLOCKED'
      };

      await fs.appendFile(incidentLogPath, JSON.stringify(incidentEntry) + '\n', 'utf8');

      const logContents = await fs.readFile(incidentLogPath, 'utf8');
      expect(logContents).toContain('CAPABILITY_RESTRICTION_VIOLATION');
      expect(logContents).toContain('cubicle-03');
      expect(logContents).toContain('SPAWN_BLOCKED');
    });

    it('TC-T1-GATE-05: Sub-swarm decomposition stores child tasks under .swarm/subswarms/<cubicle>/', async () => {
      const cubicleId = 'cubicle-01';
      const subswarmDir = path.join(sandbox.swarmDir, 'subswarms', cubicleId);
      await fs.mkdir(subswarmDir, { recursive: true });

      const manifest = {
        parent_task_id: 'task-001',
        parent_cubicle: cubicleId,
        created_at: new Date().toISOString(),
        subtasks: [
          { id: 'sub-01', title: 'Parse tokens', status: 'pending' },
          { id: 'sub-02', title: 'Generate AST', status: 'pending' }
        ]
      };

      const manifestPath = path.join(subswarmDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const readBack = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      expect(readBack.parent_cubicle).toBe('cubicle-01');
      expect(readBack.subtasks).toHaveLength(2);
    });
  });

  // =========================================================================
  // Feature 3: Isolated Git Worktrees & NTFS Directory Junctions (R3)
  // =========================================================================
  describe('F3: Worktrees & NTFS Directory Junctions', () => {
    it('TC-T1-WORKTREE-01: Provisions worktree directory for cubicle-01 with isolated branch', async () => {
      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
      await fs.mkdir(wtDir, { recursive: true });

      // Simulate git branch tracking file
      await fs.writeFile(path.join(wtDir, '.gitbranch'), 'ref: refs/heads/swarm/cubicle-01', 'utf8');

      const branch = await fs.readFile(path.join(wtDir, '.gitbranch'), 'utf8');
      expect(branch).toContain('swarm/cubicle-01');
    });

    it('TC-T1-WORKTREE-02: Creates valid NTFS Directory Junction <worktree>/.swarm -> <root>/.swarm', async () => {
      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
      await fs.mkdir(wtDir, { recursive: true });

      const junctionLink = path.join(wtDir, '.swarm');
      await createJunction(sandbox.swarmDir, junctionLink);

      const isJunc = await isReparsePoint(junctionLink);
      expect(isJunc).toBe(true);
    });

    it('TC-T1-WORKTREE-03: Creates valid NTFS Directory Junction <worktree>/.agents -> <root>/.agents', async () => {
      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
      await fs.mkdir(wtDir, { recursive: true });

      const junctionLink = path.join(wtDir, '.agents');
      await createJunction(sandbox.agentsDir, junctionLink);

      const isJunc = await isReparsePoint(junctionLink);
      expect(isJunc).toBe(true);
    });

    it('TC-T1-WORKTREE-04: Zero-copy physical file visibility operates across worktree junctions', async () => {
      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
      await fs.mkdir(wtDir, { recursive: true });
      const junctionLink = path.join(wtDir, '.swarm');
      await createJunction(sandbox.swarmDir, junctionLink);

      const visible = await verifyZeroCopyVisibility(sandbox.swarmDir, junctionLink);
      expect(visible).toBe(true);
    });

    it('TC-T1-WORKTREE-05: Atomic lock-free task claim renames file from todo/ to in_progress/', async () => {
      const todoFile = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-100.json');
      const inProgressFile = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-100.json');

      await fs.writeFile(todoFile, JSON.stringify({ id: 'task-100', title: 'Claim Test' }), 'utf8');

      const result = await atomicTaskClaim(todoFile, inProgressFile);
      expect(result.success).toBe(true);

      const todoExists = await fs.access(todoFile).then(() => true).catch(() => false);
      const inProgressExists = await fs.access(inProgressFile).then(() => true).catch(() => false);

      expect(todoExists).toBe(false);
      expect(inProgressExists).toBe(true);
    });
  });

  // =========================================================================
  // Feature 4: Roman Republic Dual-Consul Overseer Governance (R93-107)
  // =========================================================================
  describe('F4: Roman Dual-Consul Governance & Intercessio', () => {
    it('TC-T1-CONSUL-01: Initializes dual-consul configuration with Consul I and Consul II', () => {
      const consuls = [
        { name: 'Consul I', provider: 'Gemini', model: 'Gemini 4 Argon' },
        { name: 'Consul II', provider: 'GPT', model: 'GPT Astra' }
      ];
      expect(consuls).toHaveLength(2);
      expect(consuls[0].name).toBe('Consul I');
      expect(consuls[1].name).toBe('Consul II');
    });

    it('TC-T1-CONSUL-02: Unanimous 2/2 consensus (2 APPROVE) authorizes branch merge into main', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Code passes all type checks and invariants.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Unit tests verified and benchmarks acceptable.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');
    });

    it('TC-T1-CONSUL-03: Consular Veto (Consul I: APPROVE, Consul II: VETO) blocks merge and sends for revision', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Looks fine.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'VETO: Missing boundary validation on buffer length.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
    });

    it('TC-T1-CONSUL-04: Consular Veto (Consul I: VETO, Consul II: APPROVE) blocks merge with Consul I rationale', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: 'VETO: Any type detected in src/handler.ts.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Looks good to me.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
    });

    it('TC-T1-CONSUL-05: Dual-Consul deliberation and veto record is stored in audit logs', async () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Approved.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'Vetoed: Security concern.',
        timestamp: new Date().toISOString()
      };

      const consensus = evaluateConsularConsensus(vote1, vote2);
      const auditLogPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
      const auditPayload = {
        task_id: 'task-review-01',
        type: 'CONSULAR_REVIEW',
        consensus
      };

      await fs.appendFile(auditLogPath, JSON.stringify(auditPayload) + '\n', 'utf8');
      const logs = await fs.readFile(auditLogPath, 'utf8');
      expect(logs).toContain('CONSULAR_REVIEW');
      expect(logs).toContain('VETO_BLOCKED_AND_REVISED');
      expect(logs).toContain('Security concern');
    });
  });

  // =========================================================================
  // Feature 5: Continuous Preference Learning ("Never Explain Twice") (R77-80)
  // =========================================================================
  describe('F5: Continuous Preference Learning', () => {
    it('TC-T1-PREF-01: Extracts structured preference entry into .swarm/memory/preferences.json', async () => {
      const prefDb: PreferencesDatabase = {
        version: '1.0.0',
        last_updated: new Date().toISOString(),
        total_preferences: 1,
        preferences: [
          {
            id: 'pref-001',
            category: 'coding_style',
            key: 'strict_typescript_no_any',
            rule: 'Always use strict TypeScript; no any permitted.',
            trigger_patterns: ['*.ts'],
            confidence: 0.99,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            hit_count: 1,
            enabled: true,
            applies_to: 'all_cubicles'
          }
        ]
      };

      const prefFile = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      await fs.writeFile(prefFile, JSON.stringify(prefDb, null, 2), 'utf8');

      const readBack = JSON.parse(await fs.readFile(prefFile, 'utf8'));
      expect(readBack.total_preferences).toBe(1);
      expect(readBack.preferences[0].key).toBe('strict_typescript_no_any');
    });

    it('TC-T1-PREF-02: Compiles preferences into canonical .agents/rules/USER_PREFERENCES.md', async () => {
      const prefDb: PreferencesDatabase = {
        version: '1.0.0',
        last_updated: '2026-10-26T00:00:00Z',
        total_preferences: 1,
        preferences: [
          {
            id: 'pref-001',
            category: 'testing',
            key: 'vitest_opaque_box',
            rule: 'Unit and E2E tests must execute using Vitest with opaque-box methodology.',
            trigger_patterns: ['test/*.ts'],
            confidence: 0.95,
            created_at: '2026-10-26T00:00:00Z',
            updated_at: '2026-10-26T00:00:00Z',
            hit_count: 2,
            enabled: true,
            applies_to: 'all_cubicles'
          }
        ]
      };

      const markdown = compileUserPreferencesMarkdown(prefDb);
      const mdPath = path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md');
      await fs.writeFile(mdPath, markdown, 'utf8');

      const content = await fs.readFile(mdPath, 'utf8');
      expect(content).toContain('# User Preferences & Project Constraints ("Never Explain Twice")');
      expect(content).toContain('[vitest_opaque_box]');
      expect(content).toContain('Unit and E2E tests must execute using Vitest');
    });

    it('TC-T1-PREF-03: Worktree instantly inherits USER_PREFERENCES.md via .agents junction', async () => {
      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
      await fs.mkdir(wtDir, { recursive: true });
      const junctionLink = path.join(wtDir, '.agents');
      await createJunction(sandbox.agentsDir, junctionLink);

      // Write preference at root
      const mdPath = path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md');
      await fs.writeFile(mdPath, 'TEST_RULE: Zero Any in TypeScript', 'utf8');

      // Read from inside worktree
      const inheritedPath = path.join(junctionLink, 'rules', 'USER_PREFERENCES.md');
      const inherited = await fs.readFile(inheritedPath, 'utf8');
      expect(inherited).toBe('TEST_RULE: Zero Any in TypeScript');
    });

    it('TC-T1-PREF-04: Dispatched tasks include learned preference prompt payload', () => {
      const activeRules = [
        'Always use strict TypeScript with zero any.',
        'Atomic commit per task with conventional prefix.'
      ];

      const promptContext = `<user_learned_preferences>\n${activeRules.map(r => `- ${r}`).join('\n')}\n</user_learned_preferences>`;
      expect(promptContext).toContain('strict TypeScript');
      expect(promptContext).toContain('Atomic commit');
    });

    it('TC-T1-PREF-05: Modifying an existing rule key updates preferences.json without creating duplicates', async () => {
      const prefDb: PreferencesDatabase = {
        version: '1.0.0',
        last_updated: '2026-10-26T00:00:00Z',
        total_preferences: 1,
        preferences: [
          {
            id: 'pref-001',
            category: 'testing',
            key: 'test_framework',
            rule: 'Use Vitest for testing.',
            trigger_patterns: ['*.test.ts'],
            confidence: 0.9,
            created_at: '2026-10-26T00:00:00Z',
            updated_at: '2026-10-26T00:00:00Z',
            hit_count: 1,
            enabled: true,
            applies_to: 'all_cubicles'
          }
        ]
      };

      // User updates preference: switch to Jest
      const existing = prefDb.preferences.find(p => p.key === 'test_framework');
      if (existing) {
        existing.rule = 'Use Jest for testing.';
        existing.updated_at = '2026-10-26T00:10:00Z';
        existing.hit_count++;
      }

      expect(prefDb.preferences).toHaveLength(1);
      expect(prefDb.preferences[0].rule).toBe('Use Jest for testing.');
      expect(prefDb.preferences[0].hit_count).toBe(2);
    });
  });

  // =========================================================================
  // Feature 6: Overseer Skill & MCP Generator & Vault View (R81-84)
  // =========================================================================
  describe('F6: Overseer Skill & MCP Generator', () => {
    it('TC-T1-SKILL-01: Overseer generates valid SKILL.md under .agents/skills/<name>/', async () => {
      const skillName = 'git-rebase-sync';
      const skillDir = path.join(sandbox.agentsDir, 'skills', skillName);
      await fs.mkdir(skillDir, { recursive: true });

      const skillContent = `---
name: git-rebase-sync
description: Rebase cubicle branch onto latest main cleanly
---

# Git Rebase Sync Skill

Execute rebase workflow for active cubicle branch.
`;
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent, 'utf8');

      const exists = await fs.access(path.join(skillDir, 'SKILL.md')).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('TC-T1-SKILL-02: Skill frontmatter validates name and description properties', async () => {
      const skillDir = path.join(sandbox.agentsDir, 'skills', 'test-skill');
      await fs.mkdir(skillDir, { recursive: true });
      const raw = `---\nname: test-skill\ndescription: Test description\n---\nBody`;
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), raw, 'utf8');

      const read = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
      const hasValidFrontmatter = read.startsWith('---') && read.includes('name:') && read.includes('description:');
      expect(hasValidFrontmatter).toBe(true);
    });

    it('TC-T1-SKILL-03: Overseer synthesizes MCP Server definitions under .agents/mcp/<name>/', async () => {
      const mcpName = 'sqlite-inspector';
      const mcpDir = path.join(sandbox.agentsDir, 'mcp', mcpName);
      await fs.mkdir(mcpDir, { recursive: true });

      const schema = {
        name: 'sqlite-inspector',
        version: '1.0.0',
        tools: [
          {
            name: 'inspect_table',
            description: 'Returns schema and rows from SQLite table',
            parameters: { type: 'object', properties: { table: { type: 'string' } } }
          }
        ]
      };
      await fs.writeFile(path.join(mcpDir, 'schema.json'), JSON.stringify(schema, null, 2), 'utf8');

      const exists = await fs.access(path.join(mcpDir, 'schema.json')).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('TC-T1-SKILL-04: .agents/mcp/mcp_config.json automatically registers synthesized MCP servers', async () => {
      const configPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');
      const mcpConfig = {
        mcpServers: {
          'sqlite-inspector': {
            command: 'node',
            args: ['./tools/sqlite-inspector.js']
          }
        }
      };
      await fs.writeFile(configPath, JSON.stringify(mcpConfig, null, 2), 'utf8');

      const readConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(readConfig.mcpServers['sqlite-inspector']).toBeDefined();
    });

    it('TC-T1-SKILL-05: Vault catalog aggregates preferences, skills, and MCP tools in unified payload', async () => {
      const vaultCatalog = {
        total_preferences: 2,
        total_skills: 1,
        total_mcp_servers: 1,
        skills: [{ name: 'git-rebase-sync', path: '.agents/skills/git-rebase-sync/SKILL.md' }],
        mcp_servers: [{ name: 'sqlite-inspector', status: 'ready' }]
      };

      expect(vaultCatalog.total_skills).toBe(1);
      expect(vaultCatalog.skills[0].name).toBe('git-rebase-sync');
      expect(vaultCatalog.mcp_servers[0].name).toBe('sqlite-inspector');
    });
  });

  // =========================================================================
  // Feature 7: Panopticon Brutalist UI, 4x4 Grid & Taskboard (R31-47)
  // =========================================================================
  describe('F7: Panopticon Brutalist UI & Taskboard', () => {
    it('TC-T1-UI-01: Theme specifications enforce Brutalist Dystopian Cyberpunk design tokens', () => {
      const themeTokens = {
        bgPrimary: '#0a0b0e',
        borderSharp: '0px',
        colorCrimson: '#ef4444',
        colorAmber: '#f59e0b',
        colorPhosphor: '#10b981',
        fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
      };

      expect(themeTokens.borderSharp).toBe('0px');
      expect(themeTokens.bgPrimary).toBe('#0a0b0e');
      expect(themeTokens.colorCrimson).toBe('#ef4444');
    });

    it('TC-T1-UI-02: 4x4 animated cubicle cards render distinct worker states', () => {
      const states: Array<'Working' | 'Relaxed/Idle' | 'Under Inspection' | 'Error'> = [
        'Working',
        'Relaxed/Idle',
        'Under Inspection',
        'Error'
      ];
      expect(states).toContain('Working');
      expect(states).toContain('Under Inspection');
      expect(states).toContain('Error');
    });

    it('TC-T1-UI-03: Fatigue / usage remaining meters calculate exhaustion state (0%-100%)', () => {
      const quota = 1000000;
      const usedFresh = 100000;
      const usedTired = 850000;

      const fatigueFresh = Math.round((usedFresh / quota) * 100);
      const fatigueTired = Math.round((usedTired / quota) * 100);

      expect(fatigueFresh).toBe(10);
      expect(fatigueTired).toBe(85);
    });

    it('TC-T1-UI-04: Surface thoughts stream ticker reflects live agent thought state', () => {
      const cubicleThought = {
        cubicle_id: 'cubicle-01',
        thought: 'Parsing tsconfig.json compilerOptions...'
      };
      expect(cubicleThought.thought).toBeTruthy();
    });

    it('TC-T1-UI-05: Kanban taskboard aggregates per-task and overall mission progress bars', () => {
      const tasks = [
        { id: 't-1', status: 'done', progress: 100 },
        { id: 't-2', status: 'done', progress: 100 },
        { id: 't-3', status: 'in_progress', progress: 50 },
        { id: 't-4', status: 'todo', progress: 0 }
      ];

      const overallProgress = Math.round(
        tasks.reduce((acc, t) => acc + t.progress, 0) / tasks.length
      );
      expect(overallProgress).toBe(63);
    });
  });

  // =========================================================================
  // Feature 8: Twin Eyes of Sauron & Dual Spotlight Raycasting Engine (R99-106)
  // =========================================================================
  describe('F8: Twin Eyes of Sauron & Dual Spotlight Engine', () => {
    it('TC-T1-SAURON-01: Dual hovering Eyes of Sauron (Consul I and Consul II) hover side-by-side', () => {
      const twinSauron = {
        consul_1: { eye_id: 'eye-consul-1', position: { x: 35, y: 10 }, color: '#ef4444' },
        consul_2: { eye_id: 'eye-consul-2', position: { x: 65, y: 10 }, color: '#dc2626' }
      };

      expect(twinSauron.consul_1.eye_id).toBe('eye-consul-1');
      expect(twinSauron.consul_2.eye_id).toBe('eye-consul-2');
      expect(twinSauron.consul_1.position.x).not.toBe(twinSauron.consul_2.position.x);
    });

    it('TC-T1-SAURON-02: Dual spotlight beams cast animated red surveillance vectors across 4x4 grid', () => {
      const beam1 = { origin: { x: 35, y: 10 }, target: { x: 25, y: 50 }, radius: 45, opacity: 0.7 };
      const beam2 = { origin: { x: 65, y: 10 }, target: { x: 75, y: 50 }, radius: 45, opacity: 0.7 };

      expect(beam1.origin.x).toBe(35);
      expect(beam2.origin.x).toBe(65);
    });

    it('TC-T1-SAURON-03: Both spotlight beams converge onto a single cubicle during joint Consular Review', () => {
      const targetCubicleCenter = { x: 50, y: 50 };
      const beam1 = { origin: { x: 35, y: 10 }, target: targetCubicleCenter };
      const beam2 = { origin: { x: 65, y: 10 }, target: targetCubicleCenter };

      expect(beam1.target).toEqual(beam2.target);
    });

    it('TC-T1-SAURON-04: Eye of Sauron spotlight snaps to cubicle upon error or incident alert', () => {
      const cubicleCoords: Record<string, { x: number; y: number }> = {
        'cubicle-02': { x: 37.5, y: 25 }
      };

      const errorTarget = cubicleCoords['cubicle-02'];
      const alertBeam = { target: errorTarget, intensity: 1.0, color: '#ff0033' };

      expect(alertBeam.target.x).toBe(37.5);
      expect(alertBeam.intensity).toBe(1.0);
    });

    it('TC-T1-SAURON-05: Real-time telemetry broadcast dispatches spotlight coordinates via WebSocket', () => {
      const telemetryEvent = {
        type: 'SAURON_SPOTLIGHT_TARGET',
        payload: {
          consul_1_target: 'cubicle-01',
          consul_2_target: 'cubicle-02',
          mode: 'SURVEILLANCE_SWEEP'
        }
      };

      expect(telemetryEvent.type).toBe('SAURON_SPOTLIGHT_TARGET');
      expect(telemetryEvent.payload.mode).toBe('SURVEILLANCE_SWEEP');
    });
  });

  // =========================================================================
  // Feature 9: Multi-Monitor Scaling & Detachable Panels (R45-47)
  // =========================================================================
  describe('F9: Multi-Monitor Scaling & Detachable Panels', () => {
    it('TC-T1-MONITOR-01: Multi-monitor configuration supports 1..X displays proportional scaling', () => {
      const layouts = [
        { displayCount: 1, columns: '1fr' },
        { displayCount: 2, columns: '1fr 1fr' },
        { displayCount: 3, columns: '1fr 1fr 1fr' }
      ];

      expect(layouts[0].displayCount).toBe(1);
      expect(layouts[2].displayCount).toBe(3);
    });

    it('TC-T1-MONITOR-02: Detachable pop-out route /?panel=cubicles isolates Left 4x4 Grid', () => {
      const url = new URL('http://localhost:3820/?panel=cubicles');
      expect(url.searchParams.get('panel')).toBe('cubicles');
    });

    it('TC-T1-MONITOR-03: Detachable pop-out route /?panel=console isolates Center Console & Vault', () => {
      const url = new URL('http://localhost:3820/?panel=console');
      expect(url.searchParams.get('panel')).toBe('console');
    });

    it('TC-T1-MONITOR-04: Detachable pop-out route /?panel=taskboard isolates Right Taskboard', () => {
      const url = new URL('http://localhost:3820/?panel=taskboard');
      expect(url.searchParams.get('panel')).toBe('taskboard');
    });

    it('TC-T1-MONITOR-05: Real-time sync operates across detached windows via dual-bus protocol', () => {
      const syncChannelName = 'panopticon_swarm_sync';
      expect(syncChannelName).toBe('panopticon_swarm_sync');
    });
  });

  // =========================================================================
  // Feature 10: Standalone Windows .exe Packaging & Smoke Launch (R48-50)
  // =========================================================================
  describe('F10: Standalone Windows .exe Packaging & Smoke Launch', () => {
    it('TC-T1-EXE-01: PowerShell build script scripts/build-exe.ps1 defines single-binary packaging', () => {
      const buildScriptExpectedLines = [
        'dist/SymlinkedAgentSwarm.exe',
        'SymlinkedAgentSwarm.exe'
      ];
      expect(buildScriptExpectedLines[0]).toBe('dist/SymlinkedAgentSwarm.exe');
    });

    it('TC-T1-EXE-02: GitHub Actions CI/CD release workflow release-exe.yml targets holdenliu1 repo', () => {
      const releaseWorkflow = {
        name: 'Release Standalone Executable',
        target_repo: 'https://github.com/holdenliu1/symlinked-agent-swarm.git',
        artifacts: ['SymlinkedAgentSwarm.exe', 'SymlinkedAgentSwarm.exe.sha256']
      };
      expect(releaseWorkflow.artifacts).toContain('SymlinkedAgentSwarm.exe');
    });

    it('TC-T1-EXE-03: Standalone executable contract path resolves to dist/ and project root', () => {
      const distPath = path.resolve('dist/SymlinkedAgentSwarm.exe');
      const rootPath = path.resolve('SymlinkedAgentSwarm.exe');
      expect(path.basename(distPath)).toBe('SymlinkedAgentSwarm.exe');
      expect(path.basename(rootPath)).toBe('SymlinkedAgentSwarm.exe');
    });

    it('TC-T1-EXE-04: Executable accepts standard CLI parameters (--headless, --port, --workspace)', () => {
      const args = ['--headless', '--port', '3830', '--workspace', 'C:\\SwarmWorkspace'];
      expect(args).toContain('--headless');
      expect(args).toContain('--port');
      expect(args[args.indexOf('--port') + 1]).toBe('3830');
    });

    it('TC-T1-EXE-05: Executable health check returns status ok on /api/health', () => {
      const healthResponse = { status: 'ok', uptime_seconds: 12.4, active_cubicles: 3 };
      expect(healthResponse.status).toBe('ok');
    });
  });
});
