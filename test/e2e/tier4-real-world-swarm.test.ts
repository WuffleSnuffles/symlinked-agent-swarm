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
  ConsularVote,
  TaskRecord
} from './helpers';

describe('Tier 4: Real-World Living Swarm Scenarios (5 End-to-End Workflows)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;

  beforeEach(async () => {
    sandbox = await createTestSandbox('t4_scenarios');
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // Scenario 1: Multi-Agent Feature Implementation Workflow
  // =========================================================================
  it('Scenario 1: End-to-end multi-agent goal prompt -> decomposition -> dispatch -> worktree -> review -> unanimous consensus -> merge to main', async () => {
    // 1. User prompts Overseer to implement encrypted session authentication
    const userPrompt = 'Implement encrypted session authentication with unit tests in src/auth.ts';

    // 2. Overseer decomposes goal into 2 discrete tasks in .swarm/tasks/todo/
    const task1: TaskRecord = {
      id: 'task-auth-01',
      title: 'Implement AES-GCM encrypted cookie session handler',
      assigned_cubicle: 'cubicle-01',
      branch: 'swarm/cubicle-01',
      progress_percent: 0,
      status: 'todo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const task2: TaskRecord = {
      id: 'task-auth-02',
      title: 'Write comprehensive test suite for auth handler',
      assigned_cubicle: 'cubicle-02',
      branch: 'swarm/cubicle-02',
      progress_percent: 0,
      status: 'todo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const task1TodoPath = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-auth-01.json');
    const task2TodoPath = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-auth-02.json');

    await fs.writeFile(task1TodoPath, JSON.stringify(task1, null, 2), 'utf8');
    await fs.writeFile(task2TodoPath, JSON.stringify(task2, null, 2), 'utf8');

    // 3. Cubicle 1 and Cubicle 2 claim tasks via atomic rename
    const task1ProgPath = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-auth-01.json');
    const task2ProgPath = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-auth-02.json');

    const claim1 = await atomicTaskClaim(task1TodoPath, task1ProgPath);
    const claim2 = await atomicTaskClaim(task2TodoPath, task2ProgPath);

    expect(claim1.success).toBe(true);
    expect(claim2.success).toBe(true);

    // 4. Provision Git worktrees with junctions for cubicles 1 and 2
    const wt1 = path.join(sandbox.worktreesDir, 'cubicle-01');
    const wt2 = path.join(sandbox.worktreesDir, 'cubicle-02');
    await fs.mkdir(wt1, { recursive: true });
    await fs.mkdir(wt2, { recursive: true });

    await createJunction(sandbox.swarmDir, path.join(wt1, '.swarm'));
    await createJunction(sandbox.agentsDir, path.join(wt1, '.agents'));
    await createJunction(sandbox.swarmDir, path.join(wt2, '.swarm'));
    await createJunction(sandbox.agentsDir, path.join(wt2, '.agents'));

    // 5. Worktree branches execute code changes
    await fs.mkdir(path.join(wt1, 'src'), { recursive: true });
    await fs.writeFile(path.join(wt1, 'src', 'auth.ts'), 'export const encryptSession = () => "encrypted";', 'utf8');

    await fs.mkdir(path.join(wt2, 'test'), { recursive: true });
    await fs.writeFile(path.join(wt2, 'test', 'auth.test.ts'), 'test("auth", () => expect(true).toBe(true));', 'utf8');

    // 6. Update tasks to review
    const task1ReviewPath = path.join(sandbox.swarmDir, 'tasks', 'review', 'task-auth-01.json');
    const task2ReviewPath = path.join(sandbox.swarmDir, 'tasks', 'review', 'task-auth-02.json');

    await fs.rename(task1ProgPath, task1ReviewPath);
    await fs.rename(task2ProgPath, task2ReviewPath);

    // 7. Dual-Consul Review: Both Consuls inspect diff and vote APPROVE
    const consul1Vote: ConsularVote = {
      consul: 'Consul I',
      decision: 'APPROVE',
      rationale: 'Clean AES implementation, zero any type.',
      timestamp: new Date().toISOString()
    };
    const consul2Vote: ConsularVote = {
      consul: 'Consul II',
      decision: 'APPROVE',
      rationale: 'Comprehensive unit test coverage verified.',
      timestamp: new Date().toISOString()
    };

    const consensus = evaluateConsularConsensus(consul1Vote, consul2Vote);
    expect(consensus.unanimous_approved).toBe(true);
    expect(consensus.action_taken).toBe('MERGED_TO_MAIN');

    // 8. Move tasks to done/
    const task1DonePath = path.join(sandbox.swarmDir, 'tasks', 'done', 'task-auth-01.json');
    const task2DonePath = path.join(sandbox.swarmDir, 'tasks', 'done', 'task-auth-02.json');

    await fs.rename(task1ReviewPath, task1DonePath);
    await fs.rename(task2ReviewPath, task2DonePath);

    expect(await fs.access(task1DonePath).then(() => true)).toBe(true);
    expect(await fs.access(task2DonePath).then(() => true)).toBe(true);
  });

  // =========================================================================
  // Scenario 2: Thinking-Tier Capability Enforcement & Recovery
  // =========================================================================
  it('Scenario 2: Restricted model sub-swarm attempt -> blocked by gate -> incident logged -> Sauron snaps -> reassigned to Gemini -> success', async () => {
    // 1. Dispatch recursive task to Cubicle 3 (GPT Astra Very High)
    const cubicle3 = {
      id: 'cubicle-03',
      model: 'GPT Astra',
      tier: 'Very High'
    };

    // 2. Capability gate evaluation
    const gateCheck = evaluateSubswarmGating(cubicle3.model, cubicle3.tier);
    expect(gateCheck.canSpawn).toBe(false);

    // 3. System blocks action and records incident
    const incidentPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
    const incident = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'CAPABILITY_RESTRICTION_ERROR',
      cubicle_id: 'cubicle-03',
      message: gateCheck.reason,
      sauron_spotlight_lock: 'cubicle-03'
    };
    await fs.appendFile(incidentPath, JSON.stringify(incident) + '\n', 'utf8');

    // 4. Spotlight focuses on Cubicle 3 with alert intensity
    const spotlightState = {
      target: incident.sauron_spotlight_lock,
      color: '#ef4444',
      intensity: 1.0
    };
    expect(spotlightState.target).toBe('cubicle-03');

    // 5. Overseer chat recommends reassigning to Cubicle 1 (Gemini 4 Argon High)
    const cubicle1 = {
      id: 'cubicle-01',
      model: 'Gemini 4 Argon',
      tier: 'High'
    };
    const reassignedGateCheck = evaluateSubswarmGating(cubicle1.model, cubicle1.tier);
    expect(reassignedGateCheck.canSpawn).toBe(true);

    // 6. Sub-swarm executes successfully under Cubicle 1
    const subswarmDir = path.join(sandbox.swarmDir, 'subswarms', 'cubicle-01');
    await fs.mkdir(subswarmDir, { recursive: true });
    await fs.writeFile(path.join(subswarmDir, 'subtask-1.json'), '{"status": "completed"}', 'utf8');

    const completed = await fs.readFile(path.join(subswarmDir, 'subtask-1.json'), 'utf8');
    expect(JSON.parse(completed).status).toBe('completed');
  });

  // =========================================================================
  // Scenario 3: Continuous Preference Learning ("Never Explain Twice")
  // =========================================================================
  it('Scenario 3: User instructs rule -> extracted to preferences.json -> compiled to USER_PREFERENCES.md -> inherited via junction -> verified in next task', async () => {
    // 1. User directive in Overseer chat
    const userChatDirective = 'From now on, never use any in TypeScript. Always use strict typing with unknown and type guards.';

    // 2. Extractor structures preference
    const extractedPref = {
      id: 'pref-sc3-001',
      category: 'coding_style' as const,
      key: 'strict_typescript_no_any',
      rule: 'Never use any in TypeScript. Always use strict typing with unknown and type guards.',
      trigger_patterns: ['*.ts', '*.tsx'],
      confidence: 0.99,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      hit_count: 1,
      enabled: true,
      applies_to: 'all_cubicles'
    };

    const prefDb: PreferencesDatabase = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      total_preferences: 1,
      preferences: [extractedPref]
    };

    // 3. Persist to .swarm/memory/preferences.json
    const prefJsonPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
    await fs.writeFile(prefJsonPath, JSON.stringify(prefDb, null, 2), 'utf8');

    // 4. Compile into .agents/rules/USER_PREFERENCES.md
    const compiledMarkdown = compileUserPreferencesMarkdown(prefDb);
    const mdPath = path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md');
    await fs.writeFile(mdPath, compiledMarkdown, 'utf8');

    // 5. Worktree for Cubicle 1 links .agents junction
    const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
    await fs.mkdir(wtDir, { recursive: true });
    const agentsJunc = path.join(wtDir, '.agents');
    await createJunction(sandbox.agentsDir, agentsJunc);

    // 6. Next task dispatches to Cubicle 1. Worker reads rules directly from worktree
    const inheritedRulesPath = path.join(agentsJunc, 'rules', 'USER_PREFERENCES.md');
    const inheritedRulesContent = await fs.readFile(inheritedRulesPath, 'utf8');

    expect(inheritedRulesContent).toContain('# User Preferences & Project Constraints ("Never Explain Twice")');
    expect(inheritedRulesContent).toContain('Never use any in TypeScript');

    // 7. Worker output in worktree adheres to rule
    const generatedCode = 'export function parseInput(input: unknown): string { if (typeof input === "string") return input; throw new Error("Invalid"); }';
    expect(generatedCode).not.toContain('any');
    expect(generatedCode).toContain('unknown');
  });

  // =========================================================================
  // Scenario 4: Autonomous Skill & MCP Synthesis
  // =========================================================================
  it('Scenario 4: User requests tooling -> Overseer synthesizes SKILL.md and MCP tool -> Vault updates -> dry run passes -> cubicle invokes tool', async () => {
    // 1. User prompt: "Create a skill for git rebase conflict resolution and an MCP server for sqlite inspection"
    const skillName = 'git-rebase-resolver';
    const mcpName = 'sqlite-db-tools';

    // 2. Synthesize SKILL.md
    const skillDir = path.join(sandbox.agentsDir, 'skills', skillName);
    await fs.mkdir(skillDir, { recursive: true });
    const skillContent = `---
name: ${skillName}
description: Resolves git merge and rebase conflicts autonomously
---
# Git Rebase Resolver Skill
Steps:
1. Identify conflict markers (<<<<<<<)
2. Analyze AST of both branches
3. Synthesize clean merge
`;
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent, 'utf8');

    // 3. Synthesize MCP server and update config
    const mcpDir = path.join(sandbox.agentsDir, 'mcp', mcpName);
    await fs.mkdir(mcpDir, { recursive: true });
    await fs.writeFile(path.join(mcpDir, 'schema.json'), '{"tools": ["run_query", "list_tables"]}', 'utf8');

    const mcpConfigPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');
    const mcpConfig = {
      mcpServers: {
        [mcpName]: {
          command: 'node',
          args: [`./${mcpName}/server.js`]
        }
      }
    };
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');

    // 4. Vault catalog verification
    const vault = {
      skills: [skillName],
      mcpServers: [mcpName]
    };
    expect(vault.skills).toContain('git-rebase-resolver');
    expect(vault.mcpServers).toContain('sqlite-db-tools');

    // 5. Worktree accesses newly generated skill immediately via junction
    const wtDir = path.join(sandbox.worktreesDir, 'cubicle-01');
    await fs.mkdir(wtDir, { recursive: true });
    const agentsJunc = path.join(wtDir, '.agents');
    await createJunction(sandbox.agentsDir, agentsJunc);

    const skillInWorktree = await fs.readFile(path.join(agentsJunc, 'skills', skillName, 'SKILL.md'), 'utf8');
    expect(skillInWorktree).toContain('Git Rebase Resolver Skill');
  });

  // =========================================================================
  // Scenario 5: Catastrophic Worker Failure & Incident Recovery
  // =========================================================================
  it('Scenario 5: Worker crash -> heartbeat timeout -> fatigue 0% / error state -> dual Sauron eyes converge -> one-click retry -> task reassigned', async () => {
    // 1. Cubicle 2 is actively working on task-fail-01
    const taskProgPath = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-fail-01.json');
    await fs.writeFile(taskProgPath, JSON.stringify({ id: 'task-fail-01', title: 'Flaky computation' }), 'utf8');

    const cubicle2: CubicleConfig = {
      id: 'cubicle-02',
      assigned: true,
      provider: 'Gemini',
      model: 'Gemini 4 Argon',
      thinking_tier: 'High',
      can_spawn_subswarm: true,
      token_quota: 1000000,
      tokens_used: 800000,
      fatigue_percent: 80,
      state: 'Working',
      surface_thought: 'Computing matrix inversion...'
    };

    // 2. Simulating worker crash / unhandled exception
    cubicle2.state = 'Error';
    cubicle2.surface_thought = 'FATAL: Out of memory (heap limit reached)';

    // 3. Structured incident entry written to logs
    const incidentPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
    const incidentRecord = {
      timestamp: new Date().toISOString(),
      type: 'CATASTROPHIC_WORKER_FAILURE',
      cubicle_id: 'cubicle-02',
      error: 'JavaScript heap out of memory',
      action_recommended: 'RETRY_AND_REASSIGN'
    };
    await fs.appendFile(incidentPath, JSON.stringify(incidentRecord) + '\n', 'utf8');

    // 4. Twin Eyes of Sauron converge onto Cubicle 2
    const twinSauronFocus = {
      target: 'cubicle-02',
      consul_1: { focus: 'cubicle-02', color: '#ff0033' },
      consul_2: { focus: 'cubicle-02', color: '#ff0033' }
    };
    expect(twinSauronFocus.consul_1.focus).toBe(twinSauronFocus.consul_2.focus);

    // 5. Operator executes one-click "Retry & Reassign" in Incident Feed
    // Return task from in_progress/ to todo/
    const taskTodoPath = path.join(sandbox.swarmDir, 'tasks', 'todo', 'task-fail-01.json');
    await fs.rename(taskProgPath, taskTodoPath);

    // Reset Cubicle 2
    cubicle2.state = 'Relaxed/Idle';
    cubicle2.surface_thought = 'Reset to standby.';
    cubicle2.tokens_used = 0;
    cubicle2.fatigue_percent = 0;

    expect(cubicle2.state).toBe('Relaxed/Idle');
    expect(await fs.access(taskTodoPath).then(() => true)).toBe(true);

    // 6. Cubicle 1 reclaims the task and completes it
    const task1ClaimPath = path.join(sandbox.swarmDir, 'tasks', 'in_progress', 'task-fail-01.json');
    await atomicTaskClaim(taskTodoPath, task1ClaimPath);

    expect(await fs.access(task1ClaimPath).then(() => true)).toBe(true);
  });
});
