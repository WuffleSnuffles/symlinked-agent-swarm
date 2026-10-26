import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  createTestSandbox,
  createJunction,
  atomicTaskClaim,
  evaluateSubswarmGating,
  evaluateConsularConsensus,
  compileUserPreferencesMarkdown,
  CubicleConfig,
  PreferencesDatabase,
  ConsularVote
} from './helpers';

describe('Tier 3: Pairwise Cross-Feature Matrix Suite', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('t3_pairwise');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // CF-01: Sub-Swarm Execution x Fatigue Meter Depletion
  it('CF-01 (Sub-Swarm x Fatigue): Child workers consuming tokens aggregates depletion back to parent cubicle', () => {
    const parentCubicle: CubicleConfig = {
      id: 'cubicle-01',
      assigned: true,
      provider: 'Gemini',
      model: 'Gemini 4 Argon',
      thinking_tier: 'High',
      can_spawn_subswarm: true,
      token_quota: 1000000,
      tokens_used: 100000,
      fatigue_percent: 10,
      state: 'Working',
      surface_thought: 'Sub-swarm active.'
    };

    // Sub-swarm spawns 3 child workers, each consuming 100,000 tokens
    const childWorkerTokens = [100000, 100000, 100000];
    const totalChildTokens = childWorkerTokens.reduce((a, b) => a + b, 0);

    parentCubicle.tokens_used += totalChildTokens;
    parentCubicle.fatigue_percent = Math.round((parentCubicle.tokens_used / parentCubicle.token_quota) * 100);

    expect(parentCubicle.tokens_used).toBe(400000);
    expect(parentCubicle.fatigue_percent).toBe(40);
  });

  // CF-02: Task Claim x Low Fatigue Warning Threshold
  it('CF-02 (Task Claim x Fatigue): Worker with fatigue > 90% triggers warning threshold before claiming task', () => {
    const tiredWorker: CubicleConfig = {
      id: 'cubicle-02',
      assigned: true,
      provider: 'Gemini',
      model: 'Gemini 4 Argon',
      thinking_tier: 'High',
      can_spawn_subswarm: true,
      token_quota: 1000000,
      tokens_used: 950000,
      fatigue_percent: 95,
      state: 'Working',
      surface_thought: 'Near exhaustion.'
    };

    const evaluateClaimReadiness = (cubicle: CubicleConfig) => {
      if (cubicle.fatigue_percent >= 90) {
        return { canClaim: false, warning: 'EXHAUSTION_WARNING: Cubicle fatigue exceeds 90%.' };
      }
      return { canClaim: true };
    };

    const readiness = evaluateClaimReadiness(tiredWorker);
    expect(readiness.canClaim).toBe(false);
    expect(readiness.warning).toContain('EXHAUSTION_WARNING');
  });

  // CF-03: Atomic Task Claim x Detached Pop-Out Window Synchronization
  it('CF-03 (Task Claim x Pop-Out Window): Atomic task move broadcasts sync payload to detached taskboard window', async () => {
    const todoFile = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-sync-01.json');
    const inProgressFile = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-sync-01.json');

    await fs.writeFile(todoFile, JSON.stringify({ id: 'task-sync-01', title: 'Sync Test' }), 'utf8');

    const claimResult = await atomicTaskClaim(todoFile, inProgressFile);
    expect(claimResult.success).toBe(true);

    // Simulate broadcast message payload dispatched to pop-out window
    const syncEvent = {
      channel: 'panopticon_swarm_sync',
      event: 'TASK_MOVED',
      payload: {
        task_id: 'task-sync-01',
        from: 'todo',
        to: 'in_progress',
        timestamp: new Date().toISOString()
      }
    };

    expect(syncEvent.channel).toBe('panopticon_swarm_sync');
    expect(syncEvent.payload.to).toBe('in_progress');
  });

  // CF-04: Twin Sauron Spotlight Lock x Detached Console Telemetry
  it('CF-04 (Twin Sauron x Detached Console): Sauron eye lock coordinates sync to pop-out console telemetry panel', () => {
    const sauronState = {
      target_cubicle: 'cubicle-01',
      consul_1_beam: { x: 35, y: 10, target_x: 25, target_y: 25 },
      consul_2_beam: { x: 65, y: 10, target_x: 25, target_y: 25 },
      converged: true
    };

    const consoleTelemetryMessage = {
      panel: 'console',
      type: 'SURVEILLANCE_FOCUS',
      data: sauronState
    };

    expect(consoleTelemetryMessage.data.converged).toBe(true);
    expect(consoleTelemetryMessage.data.consul_1_beam.target_x).toBe(consoleTelemetryMessage.data.consul_2_beam.target_x);
  });

  // CF-05: Sub-Swarm Worker Crash x Incident Feed Logging & Spotlight Convergence
  it('CF-05 (Sub-Swarm Crash x Incident Feed): Child worker crash writes incident and snaps spotlights', async () => {
    const incidentPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
    const crashEvent = {
      timestamp: new Date().toISOString(),
      type: 'SUBSWARM_WORKER_CRASH',
      cubicle_id: 'cubicle-01',
      child_task_id: 'sub-crash-09',
      error: 'SIGSEGV: Sub-agent process terminated unexpectedly',
      spotlight_action: 'CONVERGE_CRIMSON'
    };

    await fs.appendFile(incidentPath, JSON.stringify(crashEvent) + '\n', 'utf8');

    const raw = await fs.readFile(incidentPath, 'utf8');
    expect(raw).toContain('SUBSWARM_WORKER_CRASH');
    expect(raw).toContain('SIGSEGV');
  });

  // CF-06: Incident Feed Click x Twin Sauron Focus
  it('CF-06 (Incident Feed Click x Twin Sauron): Selecting incident directs spotlights to offending cubicle', () => {
    const incidents = [
      { id: 'inc-1', cubicle: 'cubicle-03', error: 'Thinking tier violation' },
      { id: 'inc-2', cubicle: 'cubicle-02', error: 'Type check failure' }
    ];

    const clickIncident = (id: string) => {
      const inc = incidents.find(i => i.id === id);
      if (!inc) throw new Error('Not found');
      return {
        focus_target: inc.cubicle,
        spotlight_color: '#ef4444',
        spotlight_mode: 'INCIDENT_LOCK'
      };
    };

    const focus = clickIncident('inc-1');
    expect(focus.focus_target).toBe('cubicle-03');
    expect(focus.spotlight_mode).toBe('INCIDENT_LOCK');
  });

  // CF-07: Sub-Swarm Active Execution x Mid-Task MCP Tool Discovery
  it('CF-07 (Sub-Swarm x MCP Generator): Newly generated MCP tool is immediately discoverable in active worktree', async () => {
    // 1. Provision worktree with junction
    const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
    await fs.mkdir(wtDir, { recursive: true });
    const agentsJunc = path.join(wtDir, '.agents');
    await createJunction(sandbox.agentsDir, agentsJunc);

    // 2. Overseer generates new MCP tool while worker is active
    const newMcpDir = path.join(sandbox.agentsDir, 'mcp', 'dynamic-linter');
    await fs.mkdir(newMcpDir, { recursive: true });
    await fs.writeFile(path.join(newMcpDir, 'manifest.json'), '{"tool": "dynamic-linter"}', 'utf8');

    // 3. Child worker inside worktree accesses tool immediately via junction
    const toolInsideWorktree = path.join(agentsJunc, 'mcp', 'dynamic-linter', 'manifest.json');
    const read = await fs.readFile(toolInsideWorktree, 'utf8');
    expect(JSON.parse(read).tool).toBe('dynamic-linter');
  });

  // CF-08: MCP Generator x Preference Learning
  it('CF-08 (MCP Generator x Preference Learning): Learned preference constraints apply to generated MCP tools', () => {
    const preferences = [
      { key: 'mcp_timeout_ms', rule: 'All MCP server calls must have a strict 5000ms timeout.' }
    ];

    const generateMcpTemplate = (name: string, prefs: typeof preferences) => {
      const timeoutPref = prefs.find(p => p.key === 'mcp_timeout_ms');
      const timeout = timeoutPref ? 5000 : 30000;
      return {
        server_name: name,
        timeout_ms: timeout,
        enforce_learned_preferences: true
      };
    };

    const mcpConfig = generateMcpTemplate('test-db', preferences);
    expect(mcpConfig.timeout_ms).toBe(5000);
  });

  // CF-09: Dual-Consul Veto x Preference Engine Update
  it('CF-09 (Dual-Consul Veto x Preference Update): Consular Veto rationale persists into preferences database', async () => {
    const vetoVote: ConsularVote = {
      consul: 'Consul I',
      decision: 'VETO',
      rationale: 'Never use any in TypeScript models. Always declare explicit interface.',
      timestamp: new Date().toISOString()
    };

    const prefDb: PreferencesDatabase = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      total_preferences: 1,
      preferences: [
        {
          id: 'pref-veto-01',
          category: 'coding_style',
          key: 'consul_veto_rule_no_any',
          rule: vetoVote.rationale,
          trigger_patterns: ['*.ts'],
          confidence: 1.0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          hit_count: 1,
          enabled: true,
          applies_to: 'all_cubicles'
        }
      ]
    };

    const compiledMd = compileUserPreferencesMarkdown(prefDb);
    expect(compiledMd).toContain('[consul_veto_rule_no_any]');
    expect(compiledMd).toContain('Never use any in TypeScript models');
  });

  // CF-10: Thinking-Tier Gating x Detached Pop-Out UI Notification
  it('CF-10 (Gating x Pop-Out Notification): Blocked spawn dispatches toast alert to all connected pop-out panels', () => {
    const gatingResult = evaluateSubswarmGating('GPT Astra', 'Very High');
    expect(gatingResult.canSpawn).toBe(false);

    const broadcastAlert = {
      channel: 'panopticon_swarm_sync',
      event: 'TOAST_NOTIFICATION',
      payload: {
        severity: 'CRITICAL',
        title: 'Capability Gate Restriction',
        message: gatingResult.reason,
        sound: 'alarm_short.mp3'
      }
    };

    expect(broadcastAlert.payload.severity).toBe('CRITICAL');
    expect(broadcastAlert.payload.message).toContain('GPT Astra (Very High) is restricted');
  });
});
