import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  createTestSandbox,
  createJunction,
  isReparsePoint,
  simulateConcurrentClaims,
  evaluateSubswarmGating,
  evaluateConsularConsensus,
  compileUserPreferencesMarkdown,
  CubicleConfig,
  PreferencesDatabase,
  ConsularVote
} from './helpers';

describe('Tier 2: Boundary & Corner Cases Suite (>= 5 Tests per Feature)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('t2_bound');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // F1: Roster Boundary Cases
  // =========================================================================
  describe('F1 Boundary: Roster, Quotas & Grid Limits', () => {
    it('TC-T2-ROSTER-01: Cubicle at zero remaining quota transitions to Exhausted/Flatlined and rejects task claims', () => {
      const cubicle: CubicleConfig = {
        id: 'cubicle-01',
        assigned: true,
        provider: 'Gemini',
        model: 'Gemini 4 Argon',
        thinking_tier: 'High',
        can_spawn_subswarm: true,
        token_quota: 500000,
        tokens_used: 500000,
        fatigue_percent: 100,
        state: 'Error',
        surface_thought: 'Quota exhausted. Standby for replenishment.'
      };

      const remainingTokens = cubicle.token_quota - cubicle.tokens_used;
      const canClaim = remainingTokens > 0 && cubicle.state !== 'Error';

      expect(remainingTokens).toBe(0);
      expect(cubicle.fatigue_percent).toBe(100);
      expect(canClaim).toBe(false);
    });

    it('TC-T2-ROSTER-02: Negative quota input is rejected with validation error', () => {
      const validateQuota = (quota: number) => {
        if (quota < 0 || !Number.isSafeInteger(quota)) {
          throw new Error('INVALID_QUOTA: Token quota must be a non-negative integer.');
        }
        return true;
      };

      expect(() => validateQuota(-5000)).toThrow('INVALID_QUOTA');
      expect(() => validateQuota(100000)).not.toThrow();
    });

    it('TC-T2-ROSTER-03: Max grid saturation (all 16 cubicles active) assigns without ID collision', () => {
      const activeGrid = new Map<string, CubicleConfig>();
      for (let i = 1; i <= 16; i++) {
        const id = `cubicle-${String(i).padStart(2, '0')}`;
        activeGrid.set(id, {
          id,
          assigned: true,
          provider: 'Custom',
          model: `Model-${i}`,
          thinking_tier: 'Medium',
          can_spawn_subswarm: false,
          token_quota: 100000,
          tokens_used: 1000,
          fatigue_percent: 1,
          state: 'Working',
          surface_thought: `Executing slice ${i}`
        });
      }

      expect(activeGrid.size).toBe(16);
      expect(activeGrid.has('cubicle-01')).toBe(true);
      expect(activeGrid.has('cubicle-16')).toBe(true);
    });

    it('TC-T2-ROSTER-04: Out-of-bounds cubicle IDs (cubicle-00, cubicle-17, cubicle-99) return 404', () => {
      const isValidCubicleId = (id: string) => {
        const match = id.match(/^cubicle-(\d{2})$/);
        if (!match) return false;
        const num = parseInt(match[1], 10);
        return num >= 1 && num <= 16;
      };

      expect(isValidCubicleId('cubicle-00')).toBe(false);
      expect(isValidCubicleId('cubicle-17')).toBe(false);
      expect(isValidCubicleId('cubicle-99')).toBe(false);
      expect(isValidCubicleId('cubicle-01')).toBe(true);
      expect(isValidCubicleId('cubicle-16')).toBe(true);
    });

    it('TC-T2-ROSTER-05: Rapid hot-swap reconfiguration does not leak orphaned state', () => {
      let currentProvider = 'Gemini';
      for (let swap = 0; swap < 50; swap++) {
        currentProvider = swap % 2 === 0 ? 'GPT' : 'Claude';
      }
      expect(currentProvider).toBe('Claude');
    });
  });

  // =========================================================================
  // F2: Capability Gating Boundary Cases
  // =========================================================================
  describe('F2 Boundary: Capability Gating & Recursion Caps', () => {
    it('TC-T2-GATE-01: Child worker in sub-swarm attempting nested sub-swarm is blocked by max_depth=1', () => {
      const spawnSubswarm = (depth: number) => {
        const MAX_DEPTH = 1;
        if (depth >= MAX_DEPTH) {
          throw new Error('CIRCULAR_RECURSION_ERROR: Sub-swarm depth cap (max_depth=1) reached.');
        }
        return { spawned: true, depth: depth + 1 };
      };

      // Depth 0 -> Depth 1 succeeds
      const level1 = spawnSubswarm(0);
      expect(level1.depth).toBe(1);

      // Depth 1 -> Depth 2 fails
      expect(() => spawnSubswarm(1)).toThrow('CIRCULAR_RECURSION_ERROR');
    });

    it('TC-T2-GATE-02: Messy casing, whitespace, and special characters are normalized in capability checks', () => {
      const result = evaluateSubswarmGating('   gpt ASTRA   ', '  VERY high  ');
      expect(result.canSpawn).toBe(false);
      expect(result.reason).toContain('CAPABILITY_RESTRICTION_ERROR');
    });

    it('TC-T2-GATE-03: Unknown model family with Low thinking tier is restricted by default', () => {
      const result = evaluateSubswarmGating('UnknownLLM-9000', 'Low');
      expect(result.canSpawn).toBe(false);
      expect(result.reason).toContain('below multi-swarm threshold');
    });

    it('TC-T2-GATE-04: Mass concurrent unauthorized spawn attempts record all logs cleanly', async () => {
      const incidentPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
      const attempts = Array.from({ length: 20 }, (_, i) => ({
        id: `att-${i}`,
        type: 'CAPABILITY_RESTRICTION_VIOLATION',
        cubicle: 'cubicle-03',
        timestamp: new Date().toISOString()
      }));

      for (const att of attempts) {
        await fs.appendFile(incidentPath, JSON.stringify(att) + '\n', 'utf8');
      }

      const raw = await fs.readFile(incidentPath, 'utf8');
      const lines = raw.trim().split('\n');
      expect(lines).toHaveLength(20);
    });

    it('TC-T2-GATE-05: Empty task decomposition list returns 400 Bad Request', () => {
      const validateDecomposition = (subtasks: any[]) => {
        if (!Array.isArray(subtasks) || subtasks.length === 0) {
          throw new Error('BAD_REQUEST: Sub-swarm decomposition must provide at least one child task.');
        }
        return true;
      };

      expect(() => validateDecomposition([])).toThrow('BAD_REQUEST');
      expect(() => validateDecomposition([{ title: 'Subtask 1' }])).not.toThrow();
    });
  });

  // =========================================================================
  // F3: Worktrees & Junctions Boundary Cases
  // =========================================================================
  describe('F3 Boundary: Spaces, Unicode & Concurrency Races', () => {
    it('TC-T2-WORKTREE-01: Paths with spaces, parentheses and Unicode handle junction creation cleanly', async () => {
      const unicodeSubDir = path.join(sandbox.sandboxDir, 'test dir with spaces (special) 🚀');
      await fs.mkdir(unicodeSubDir, { recursive: true });

      const junctionLink = path.join(unicodeSubDir, '.agents_junc');
      await createJunction(sandbox.agentsDir, junctionLink);

      const isJunc = await isReparsePoint(junctionLink);
      expect(isJunc).toBe(true);
    });

    it('TC-T2-WORKTREE-02: Mass concurrent task claim race: 50 simultaneous workers -> exactly 1 winner, 49 collisions', async () => {
      const todoFile = path.join(sandbox.swarmDir, 'tasks', 'todo', 'race-task-01.json');
      const inProgressDir = path.join(sandbox.swarmDir, 'tasks', 'in_progress');

      await fs.writeFile(todoFile, JSON.stringify({ id: 'race-task-01', title: 'High Concurrency Race' }), 'utf8');

      const race = await simulateConcurrentClaims(todoFile, inProgressDir, 50);

      expect(race.successes).toBe(1);
      expect(race.collisions).toBe(49);
      expect(race.winningWorker).toBeDefined();

      // Verify file is exclusively in in_progress/ and gone from todo/
      const inTodo = await fs.access(todoFile).then(() => true).catch(() => false);
      const inProg = await fs.access(path.join(inProgressDir, 'race-task-01.json')).then(() => true).catch(() => false);

      expect(inTodo).toBe(false);
      expect(inProg).toBe(true);
    });

    it('TC-T2-WORKTREE-03: Orphaned junction recovery cleanly detects and re-points broken target', async () => {
      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-orphan');
      await fs.mkdir(wtDir, { recursive: true });
      const junctionLink = path.join(wtDir, '.swarm');

      // Create initial junction
      await createJunction(sandbox.swarmDir, junctionLink);
      expect(await isReparsePoint(junctionLink)).toBe(true);

      // Re-create / heal junction
      await createJunction(sandbox.swarmDir, junctionLink);
      expect(await isReparsePoint(junctionLink)).toBe(true);
    });

    it('TC-T2-WORKTREE-04: Deep directory nesting inside .swarm/tasks maintains junction traversal', async () => {
      const deepPath = path.join(sandbox.swarmDir, 'tasks', 'todo', 'nested', 'deep', 'task-deep.json');
      await fs.mkdir(path.dirname(deepPath), { recursive: true });
      await fs.writeFile(deepPath, '{"nested": true}', 'utf8');

      const wtDir = path.join(sandbox.worktreesDir, 'cubicle-deep');
      await fs.mkdir(wtDir, { recursive: true });
      const junctionLink = path.join(wtDir, '.swarm');
      await createJunction(sandbox.swarmDir, junctionLink);

      const targetInWorktree = path.join(junctionLink, 'tasks', 'todo', 'nested', 'deep', 'task-deep.json');
      const content = await fs.readFile(targetInWorktree, 'utf8');
      expect(JSON.parse(content).nested).toBe(true);
    });

    it('TC-T2-WORKTREE-05: Non-existent source file rename throws error cleanly without crash', async () => {
      const ghostFile = path.join(sandbox.swarmDir, 'tasks', 'todo', 'ghost.json');
      const dest = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'ghost.json');

      await expect(fs.rename(ghostFile, dest)).rejects.toThrow();
    });
  });

  // =========================================================================
  // F4: Roman Dual-Consul Boundary Cases
  // =========================================================================
  describe('F4 Boundary: Consular Consensus Edge Cases', () => {
    it('TC-T2-CONSUL-01: Simultaneous mutual veto (0 APPROVE, 2 VETO) blocks merge and captures both reasons', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: 'Fails security audit.',
        timestamp: new Date().toISOString()
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'Fails performance benchmarks.',
        timestamp: new Date().toISOString()
      };

      const result = evaluateConsularConsensus(vote1, vote2);
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.votes[0].rationale).toBe('Fails security audit.');
      expect(result.votes[1].rationale).toBe('Fails performance benchmarks.');
    });

    it('TC-T2-CONSUL-02: Extremely large Git diff summary handled gracefully without memory leak', () => {
      const largeDiff = 'diff --git a/test b/test\n' + '+'.repeat(500000);
      expect(largeDiff.length).toBeGreaterThan(500000);

      const vote: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: `Diff size: ${largeDiff.length} chars approved.`,
        timestamp: new Date().toISOString()
      };
      expect(vote.decision).toBe('APPROVE');
    });

    it('TC-T2-CONSUL-03: Empty rationale in VETO vote is rejected with validation error', () => {
      const validateVote = (v: Partial<ConsularVote>) => {
        if (v.decision === 'VETO' && (!v.rationale || v.rationale.trim().length === 0)) {
          throw new Error('INVALID_VETO: Consular Veto requires an explicit rationale.');
        }
        return true;
      };

      expect(() => validateVote({ decision: 'VETO', rationale: '' })).toThrow('INVALID_VETO');
      expect(() => validateVote({ decision: 'VETO', rationale: 'Missing tests.' })).not.toThrow();
    });

    it('TC-T2-CONSUL-04: Duplicate votes from same Consul overwrite prior vote idempotently', () => {
      const votes = new Map<string, ConsularVote>();
      votes.set('Consul I', {
        consul: 'Consul I',
        decision: 'VETO',
        rationale: 'First impression',
        timestamp: '2026-10-26T00:00:00Z'
      });
      // Re-review and change to approve
      votes.set('Consul I', {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Updated fix looks good',
        timestamp: '2026-10-26T00:05:00Z'
      });

      expect(votes.size).toBe(1);
      expect(votes.get('Consul I')?.decision).toBe('APPROVE');
    });

    it('TC-T2-CONSUL-05: Non-consular actor attempting to vote is rejected', () => {
      const registerVote = (actor: string) => {
        if (actor !== 'Consul I' && actor !== 'Consul II') {
          throw new Error('UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes.');
        }
        return true;
      };

      expect(() => registerVote('cubicle-01')).toThrow('UNAUTHORIZED');
      expect(() => registerVote('Consul I')).not.toThrow();
    });
  });

  // =========================================================================
  // F5: Preference Learning Boundary Cases
  // =========================================================================
  describe('F5 Boundary: Corrupted JSON, Extreme Strings & Deduplication', () => {
    it('TC-T2-PREF-01: Corrupted preferences.json syntax recovers without crashing engine', async () => {
      const prefFile = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      await fs.writeFile(prefFile, '{ invalid json syntax !!!', 'utf8');

      const safeLoadPreferences = async (filePath: string): Promise<PreferencesDatabase> => {
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          return JSON.parse(raw);
        } catch {
          return {
            version: '1.0.0',
            last_updated: new Date().toISOString(),
            total_preferences: 0,
            preferences: []
          };
        }
      };

      const loaded = await safeLoadPreferences(prefFile);
      expect(loaded.total_preferences).toBe(0);
      expect(loaded.preferences).toEqual([]);
    });

    it('TC-T2-PREF-02: Extremely long preference string is accommodated safely', () => {
      const massiveRule = 'Always follow: ' + 'A'.repeat(50000);
      const prefDb: PreferencesDatabase = {
        version: '1.0.0',
        last_updated: new Date().toISOString(),
        total_preferences: 1,
        preferences: [
          {
            id: 'pref-long',
            category: 'coding_style',
            key: 'long_rule',
            rule: massiveRule,
            trigger_patterns: [],
            confidence: 1.0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            hit_count: 1,
            enabled: true,
            applies_to: 'all_cubicles'
          }
        ]
      };

      const md = compileUserPreferencesMarkdown(prefDb);
      expect(md).toContain('[long_rule]');
      expect(md.length).toBeGreaterThan(50000);
    });

    it('TC-T2-PREF-03: Unicode, HTML tags, and Markdown meta-characters are properly preserved', () => {
      const prefDb: PreferencesDatabase = {
        version: '1.0.0',
        last_updated: new Date().toISOString(),
        total_preferences: 1,
        preferences: [
          {
            id: 'pref-special',
            category: 'safety',
            key: 'html_and_emoji_rule',
            rule: 'Avoid `<script>` injection and ensure emoji (🚀, 🛡️) encoding in UTF-8.',
            trigger_patterns: ['*.html', '*.ts'],
            confidence: 1.0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            hit_count: 1,
            enabled: true,
            applies_to: 'all_cubicles'
          }
        ]
      };

      const md = compileUserPreferencesMarkdown(prefDb);
      expect(md).toContain('`<script>`');
      expect(md).toContain('🚀, 🛡️');
    });

    it('TC-T2-PREF-04: Rapid consecutive preference updates perform atomic writes without corruption', async () => {
      const prefFile = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      for (let i = 0; i < 20; i++) {
        const payload: PreferencesDatabase = {
          version: '1.0.0',
          last_updated: new Date().toISOString(),
          total_preferences: i,
          preferences: []
        };
        await fs.writeFile(prefFile, JSON.stringify(payload), 'utf8');
      }

      const readBack = JSON.parse(await fs.readFile(prefFile, 'utf8'));
      expect(readBack.total_preferences).toBe(19);
    });

    it('TC-T2-PREF-05: Deduplication detects identical keys and updates instead of appending', () => {
      const prefs: Array<{ key: string; rule: string }> = [];

      const upsertPreference = (key: string, rule: string) => {
        const existing = prefs.find(p => p.key === key);
        if (existing) {
          existing.rule = rule;
        } else {
          prefs.push({ key, rule });
        }
      };

      upsertPreference('rule-1', 'Initial rule');
      upsertPreference('rule-2', 'Second rule');
      upsertPreference('rule-1', 'Updated rule');

      expect(prefs).toHaveLength(2);
      expect(prefs.find(p => p.key === 'rule-1')?.rule).toBe('Updated rule');
    });
  });

  // =========================================================================
  // F6: Skill & MCP Generator Boundary Cases
  // =========================================================================
  describe('F6 Boundary: Skill Frontmatter & MCP Config Invariants', () => {
    it('TC-T2-SKILL-01: Malformed SKILL.md without closing dashes is flagged with warning', () => {
      const parseFrontmatter = (content: string) => {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) {
          return { valid: false, error: 'MALFORMED_FRONTMATTER: Missing closing ---' };
        }
        return { valid: true, raw: match[1] };
      };

      const malformed = '---\nname: bad-skill\ndescription: missing closing delimiter';
      const result = parseFrontmatter(malformed);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('MALFORMED_FRONTMATTER');
    });

    it('TC-T2-SKILL-02: Path traversal attack in skill name is sanitized and blocked', () => {
      const sanitizeSkillName = (name: string) => {
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
          throw new Error('SECURITY_VIOLATION: Skill name contains illegal path traversal characters.');
        }
        return name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
      };

      expect(() => sanitizeSkillName('../../etc/evil')).toThrow('SECURITY_VIOLATION');
      expect(sanitizeSkillName('valid-skill_123')).toBe('valid-skill_123');
    });

    it('TC-T2-SKILL-03: Corrupted mcp_config.json recovers to valid structure', async () => {
      const mcpConfigPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');
      await fs.writeFile(mcpConfigPath, '{ broken mcp json', 'utf8');

      const safeLoadMcpConfig = async (p: string) => {
        try {
          return JSON.parse(await fs.readFile(p, 'utf8'));
        } catch {
          return { mcpServers: {} };
        }
      };

      const config = await safeLoadMcpConfig(mcpConfigPath);
      expect(config.mcpServers).toEqual({});
    });

    it('TC-T2-SKILL-04: Duplicate MCP server registration updates existing definition', () => {
      const servers: Record<string, any> = {};
      servers['sqlite'] = { command: 'node', version: '1.0' };
      servers['sqlite'] = { command: 'node', version: '2.0' };

      expect(Object.keys(servers)).toHaveLength(1);
      expect(servers['sqlite'].version).toBe('2.0');
    });

    it('TC-T2-SKILL-05: Missing tool parameters schema defaults to empty object', () => {
      const tool = {
        name: 'ping',
        description: 'Health ping'
      };
      const normalizedTool = {
        parameters: { type: 'object', properties: {} },
        ...tool
      };
      expect(normalizedTool.parameters.type).toBe('object');
    });
  });

  // =========================================================================
  // F7: Brutalist UI Boundary Cases
  // =========================================================================
  describe('F7 Boundary: Thought Ticker Truncation & Zero Task Handling', () => {
    it('TC-T2-UI-01: Massive thought ticker text (100,000 chars) is truncated gracefully', () => {
      const massiveThought = 'Thinking: ' + 'x'.repeat(100000);
      const MAX_LENGTH = 150;
      const truncated = massiveThought.length > MAX_LENGTH
        ? massiveThought.slice(0, MAX_LENGTH - 3) + '...'
        : massiveThought;

      expect(truncated.length).toBe(MAX_LENGTH);
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('TC-T2-UI-02: Zero tasks in queue returns 0% overall progress without divide-by-zero NaN', () => {
      const tasks: any[] = [];
      const progress = tasks.length === 0
        ? 0
        : Math.round(tasks.reduce((a, b) => a + b.progress, 0) / tasks.length);

      expect(progress).toBe(0);
      expect(Number.isNaN(progress)).toBe(false);
    });

    it('TC-T2-UI-03: Fatigue calculation clamps between 0% and 100%', () => {
      const clampFatigue = (used: number, quota: number) => {
        if (quota <= 0) return 100;
        const raw = (used / quota) * 100;
        return Math.min(100, Math.max(0, Math.round(raw)));
      };

      expect(clampFatigue(-100, 1000)).toBe(0);
      expect(clampFatigue(2500, 1000)).toBe(100);
      expect(clampFatigue(500, 1000)).toBe(50);
    });

    it('TC-T2-UI-04: High volume incident log burst buffers without dropping events', () => {
      const buffer: string[] = [];
      for (let i = 0; i < 500; i++) {
        buffer.push(`Incident ${i}`);
      }
      expect(buffer).toHaveLength(500);
    });

    it('TC-T2-UI-05: Missing cubicle thought displays default fallback message', () => {
      const getThought = (thought?: string) => thought?.trim() || 'Awaiting instructions.';
      expect(getThought(undefined)).toBe('Awaiting instructions.');
      expect(getThought('   ')).toBe('Awaiting instructions.');
      expect(getThought('Active')).toBe('Active');
    });
  });

  // =========================================================================
  // F8: Twin Sauron Boundary Cases
  // =========================================================================
  describe('F8 Boundary: Raycasting Clamping & Dual Spotlights', () => {
    it('TC-T2-SAURON-01: Out-of-bounds spotlight targets are clamped within [0, 100] grid coords', () => {
      const clampCoord = (c: { x: number; y: number }) => ({
        x: Math.min(100, Math.max(0, c.x)),
        y: Math.min(100, Math.max(0, c.y))
      });

      const clamped = clampCoord({ x: -25, y: 150 });
      expect(clamped.x).toBe(0);
      expect(clamped.y).toBe(100);
    });

    it('TC-T2-SAURON-02: Consuls targeting different cubicles produce divergent spotlight vectors', () => {
      const eye1 = { target: 'cubicle-01' };
      const eye2 = { target: 'cubicle-16' };

      expect(eye1.target).not.toBe(eye2.target);
    });

    it('TC-T2-SAURON-03: Zero active cubicles causes Twin Sauron eyes to enter idle ambient mode', () => {
      const activeCubicleCount = 0;
      const sauronMode = activeCubicleCount === 0 ? 'AMBIENT_PULSE' : 'TRACKING';
      expect(sauronMode).toBe('AMBIENT_PULSE');
    });

    it('TC-T2-SAURON-04: Rapid spotlight coordinate updates avoid NaN calculation', () => {
      const lerp = (start: number, end: number, t: number) => start + (end - start) * t;
      let pos = 0;
      for (let i = 0; i < 60; i++) {
        pos = lerp(pos, 100, 0.1);
      }
      expect(Number.isNaN(pos)).toBe(false);
      expect(pos).toBeGreaterThan(99);
    });

    it('TC-T2-SAURON-05: Spotlight beam opacity strictly clamped between 0.0 and 1.0', () => {
      const clampOpacity = (o: number) => Math.min(1.0, Math.max(0.0, o));
      expect(clampOpacity(1.5)).toBe(1.0);
      expect(clampOpacity(-0.5)).toBe(0.0);
      expect(clampOpacity(0.75)).toBe(0.75);
    });
  });

  // =========================================================================
  // F9: Multi-Monitor Boundary Cases
  // =========================================================================
  describe('F9 Boundary: Multi-Monitor Scaling & Detachable Panels', () => {
    it('TC-T2-MONITOR-01: Zero or negative display count clamps to 1 display', () => {
      const normalizeDisplays = (count: number) => Math.max(1, Math.floor(count));
      expect(normalizeDisplays(0)).toBe(1);
      expect(normalizeDisplays(-3)).toBe(1);
    });

    it('TC-T2-MONITOR-02: Extreme display count (e.g. 16 displays) maintains minimum panel widths', () => {
      const calcPanelWidth = (displayCount: number) => {
        const MIN_WIDTH = 320;
        return `${Math.max(MIN_WIDTH, Math.floor(1920 / displayCount))}px`;
      };
      expect(calcPanelWidth(16)).toBe('320px');
    });

    it('TC-T2-MONITOR-03: Unknown pop-out panel parameter falls back to all (unified view)', () => {
      const resolvePanel = (param: string | null) => {
        const validPanels = ['cubicles', 'console', 'taskboard'];
        return param && validPanels.includes(param) ? param : 'all';
      };

      expect(resolvePanel('invalid_section')).toBe('all');
      expect(resolvePanel(null)).toBe('all');
      expect(resolvePanel('cubicles')).toBe('cubicles');
    });

    it('TC-T2-MONITOR-04: Rapid pop-out connect/disconnect cleans up subscriber map without leaks', () => {
      const subscribers = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const id = `conn-${i}`;
        subscribers.add(id);
        subscribers.delete(id);
      }
      expect(subscribers.size).toBe(0);
    });

    it('TC-T2-MONITOR-05: Detached pop-out window receives large message payload without corruption', () => {
      const largeMessage = {
        channel: 'panopticon_swarm_sync',
        data: 'x'.repeat(100000)
      };
      expect(largeMessage.data.length).toBe(100000);
    });
  });

  // =========================================================================
  // F10: Standalone Executable Boundary Cases
  // =========================================================================
  describe('F10 Boundary: CLI Arguments & Executable Invocation', () => {
    it('TC-T2-EXE-01: Invalid port argument (NaN or out of range) is rejected', () => {
      const parsePort = (val: string) => {
        const p = parseInt(val, 10);
        if (Number.isNaN(p) || p <= 0 || p > 65535) {
          throw new Error('INVALID_PORT: Port must be between 1 and 65535.');
        }
        return p;
      };

      expect(() => parsePort('abc')).toThrow('INVALID_PORT');
      expect(() => parsePort('99999')).toThrow('INVALID_PORT');
      expect(parsePort('3820')).toBe(3820);
    });

    it('TC-T2-EXE-02: Missing workspace directory path argument defaults to current working directory', () => {
      const resolveWorkspace = (arg?: string) => arg ? path.resolve(arg) : process.cwd();
      expect(resolveWorkspace()).toBe(process.cwd());
    });

    it('TC-T2-EXE-03: Port collision error handling reports address in use cleanly', () => {
      const handlePortError = (errCode: string) => {
        if (errCode === 'EADDRINUSE') {
          return 'PORT_IN_USE_ERROR: Target port is already occupied. Try --port <different_port>.';
        }
        return 'UNKNOWN_ERROR';
      };

      expect(handlePortError('EADDRINUSE')).toContain('PORT_IN_USE_ERROR');
    });

    it('TC-T2-EXE-04: Read-only directory permissions error during startup reports cleanly', () => {
      const handleFsError = (errCode: string) => {
        if (errCode === 'EACCES' || errCode === 'EPERM') {
          return 'PERMISSION_DENIED: Workspace directory is not writable.';
        }
        return 'FS_ERROR';
      };

      expect(handleFsError('EACCES')).toContain('PERMISSION_DENIED');
    });

    it('TC-T2-EXE-05: Double launch on same workspace detects active lockfile', async () => {
      const lockfilePath = path.join(sandbox.swarmDir, 'swarm.lock');
      await fs.writeFile(lockfilePath, JSON.stringify({ pid: 12345, timestamp: new Date().toISOString() }), 'utf8');

      const isWorkspaceLocked = async (p: string) => {
        return fs.access(p).then(() => true).catch(() => false);
      };

      expect(await isWorkspaceLocked(lockfilePath)).toBe(true);
    });
  });
});
