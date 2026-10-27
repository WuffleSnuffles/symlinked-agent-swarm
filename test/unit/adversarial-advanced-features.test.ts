/**
 * test/unit/adversarial-advanced-features.test.ts
 *
 * Comprehensive Empirical Adversarial Stress Test Suite:
 * 1. Merge-Conflict Shield (.swarm/locks/)
 * 2. Gladiator Tournament Mode
 * 3. Infinite-Loop Circuit Breaker & Automatic Cubicle Failover
 * 4. Git Time-Machine Checkpoints (.swarm/checkpoints/)
 * 5. Inter-Cubicle Shared Contracts (.swarm/contracts/)
 * 6. Night-Shift AFK Mode & Consular Briefing Digest
 * 7. Consular Q&A Engine & Autonomous Preference Learning
 * 8. Preference Engine High-Concurrency Writes & Disaster Corruption Recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { PreferenceEngine } from '../../src/server/preference-engine';

describe('Empirical Adversarial Test Suite: 7 Advanced Swarm Features, Q&A & Preference Engine', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let preferenceEngine: PreferenceEngine;
  let consularEngine: ConsularEngine;

  beforeEach(async () => {
    sandbox = await createTestSandbox('adv_features');
    cubicleManager = new CubicleManager(sandbox.swarmDir);
    taskboardManager = new TaskboardManager(sandbox.swarmDir);
    capabilityMatrix = new CapabilityMatrix();
    preferenceEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);

    await cubicleManager.initialize();
    await taskboardManager.initialize();
    await preferenceEngine.initialize();

    consularEngine = new ConsularEngine(
      sandbox.swarmDir,
      cubicleManager,
      taskboardManager,
      capabilityMatrix,
      undefined,
      sandbox.sandboxDir
    );
    await consularEngine.initialize();
    consularEngine.setPreferenceEngine(preferenceEngine);
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  // =========================================================================
  // 1. Merge-Conflict Shield (.swarm/locks/)
  // =========================================================================
  describe('1. Merge-Conflict Shield (.swarm/locks/)', () => {
    it('acquires lock, blocks conflicting duplicate acquire from another cubicle, prevents unauthorized release, and re-acquires upon release', async () => {
      const targetFile = 'src/server/routes/api.ts';

      // 1. Cubicle 1 acquires lock
      const lock1 = await consularEngine.acquireLock(targetFile, 'cubicle-01');
      expect(lock1.acquired).toBe(true);
      expect(existsSync(lock1.lockPath)).toBe(true);

      const lockContent = JSON.parse(await fs.readFile(lock1.lockPath, 'utf8'));
      expect(lockContent.cubicleId).toBe('cubicle-01');
      expect(lockContent.filePath).toBe(targetFile);

      // 2. Duplicate acquire attempt by cubicle-02 must fail
      const lock2 = await consularEngine.acquireLock(targetFile, 'cubicle-02');
      expect(lock2.acquired).toBe(false);
      expect(lock2.currentOwner).toBe('cubicle-01');

      // 3. Unauthorized release attempt by cubicle-02 must be rejected
      const rogueRelease = await consularEngine.releaseLock(targetFile, 'cubicle-02');
      expect(rogueRelease.released).toBe(false);
      expect(existsSync(lock1.lockPath)).toBe(true);

      // 4. Authorized owner (cubicle-01) releases lock
      const authRelease = await consularEngine.releaseLock(targetFile, 'cubicle-01');
      expect(authRelease.released).toBe(true);
      expect(existsSync(lock1.lockPath)).toBe(false);

      // 5. Cubicle 2 can now acquire the freed lock
      const lock3 = await consularEngine.acquireLock(targetFile, 'cubicle-02');
      expect(lock3.acquired).toBe(true);

      // 6. Idempotent re-acquisition by same owner (cubicle-02) succeeds
      const lock3Again = await consularEngine.acquireLock(targetFile, 'cubicle-02');
      expect(lock3Again.acquired).toBe(true);
    });

    it('sanitizes special characters and traversal paths in lock filenames', async () => {
      const traversalPath = '../../secrets/api_keys.json';
      const lock = await consularEngine.acquireLock(traversalPath, 'cubicle-03');
      expect(lock.acquired).toBe(true);

      // Verify the lock file is strictly within the locks directory, not escaped
      const locksDir = path.join(sandbox.swarmDir, 'locks');
      expect(path.dirname(lock.lockPath)).toBe(locksDir);
      expect(path.basename(lock.lockPath)).not.toContain('/');
      expect(path.basename(lock.lockPath)).not.toContain('\\');
      expect(path.basename(lock.lockPath)).toContain('.lock.json');
    });

    it('lists all active locks accurately and ignores foreign non-lock files', async () => {
      await consularEngine.acquireLock('src/module-a.ts', 'cubicle-01');
      await consularEngine.acquireLock('src/module-b.ts', 'cubicle-02');

      // Introduce foreign non-lock file
      const foreignFile = path.join(sandbox.swarmDir, 'locks', 'stray_file.txt');
      await fs.writeFile(foreignFile, 'non-lock garbage content', 'utf8');

      const locks = await consularEngine.listLocks();
      expect(locks).toHaveLength(2);
      expect(locks.some((l) => l.filePath === 'src/module-a.ts')).toBe(true);
      expect(locks.some((l) => l.filePath === 'src/module-b.ts')).toBe(true);
    });
  });

  // =========================================================================
  // 2. Gladiator Tournament Mode
  // =========================================================================
  describe('2. Gladiator Tournament Mode', () => {
    it('evaluates competing branches, logs distinct Nia and Ferric critiques, and ratifies consensus', async () => {
      let resolvedEvent: any = null;
      consularEngine.onEvent((type, payload) => {
        if (type === 'GLADIATOR_CONTEST_RESOLVED') resolvedEvent = payload;
      });

      const contest = await consularEngine.evaluateGladiatorContest('task-gladiator-01', [
        {
          branch: 'swarm/cubicle-01',
          cubicleId: 'cubicle-01',
          diffSummary: '+150 lines: elegant reactive styling and responsive mobile HUD',
        },
        {
          branch: 'swarm/cubicle-02',
          cubicleId: 'cubicle-02',
          diffSummary: '+80 lines: raw buffered terminal without animations',
        },
      ]);

      expect(contest.winnerBranch).toBe('swarm/cubicle-01');
      expect(contest.winnerCubicle).toBe('cubicle-01');
      expect(contest.consensusRatified).toBe(true);

      // Verify Nia's aesthetic / design fluidity critique
      expect(contest.niaCritique).toContain('Nia on Tournament');
      expect(contest.niaCritique).toContain('design fluidity and user intent alignment');

      // Verify Ferric's stability / efficiency critique
      expect(contest.ferricCritique).toContain('Ferric on Tournament');
      expect(contest.ferricCritique).toContain('structural stability, least regressions, and lean resource footprint');

      // Verify WebSocket broadcast event
      expect(resolvedEvent).not.toBeNull();
      expect(resolvedEvent.winnerBranch).toBe('swarm/cubicle-01');

      // Verify dialogue logged into .swarm/logs/consular_dialogue.jsonl
      const dialogueLogPath = path.join(sandbox.swarmDir, 'logs', 'consular_dialogue.jsonl');
      const dialogueRaw = await fs.readFile(dialogueLogPath, 'utf8');
      expect(dialogueRaw).toContain('Consul Nia Nova');
      expect(dialogueRaw).toContain('Consul Ferric Lunaux');
      expect(dialogueRaw).toContain('REVIEW_GATE');
    });

    it('rejects tournament evaluation if branches list is empty', async () => {
      await expect(consularEngine.evaluateGladiatorContest('task-empty', [])).rejects.toThrow(
        'Gladiator Tournament requires at least 1 competing branch.'
      );
    });
  });

  // =========================================================================
  // 3. Infinite-Loop Circuit Breaker & Automatic Cubicle Failover
  // =========================================================================
  describe('3. Infinite-Loop Circuit Breaker & Automatic Cubicle Failover', () => {
    it('tracks consecutive errors, trips circuit breaker at 3 errors, transitions status to error, and fails over stalled task', async () => {
      let circuitBreakerTrippedEvent = false;
      cubicleManager.onStateChange((state, reason) => {
        if (reason === 'CIRCUIT_BREAKER_TRIPPED') circuitBreakerTrippedEvent = true;
      });

      // Error 1
      const e1 = cubicleManager.recordError('cubicle-04', 'Stuck in infinite loop on AST parse');
      expect(e1.trippedCircuitBreaker).toBe(false);
      expect(e1.count).toBe(1);
      expect(cubicleManager.getCubicle('cubicle-04').status).not.toBe('error');

      // Error 2
      const e2 = cubicleManager.recordError('cubicle-04', 'Timeout waiting for child worker IPC');
      expect(e2.trippedCircuitBreaker).toBe(false);
      expect(e2.count).toBe(2);

      // Error 3 -> Circuit breaker trips!
      const e3 = cubicleManager.recordError('cubicle-04', 'Repeated failure: same error hash 3 times');
      expect(e3.trippedCircuitBreaker).toBe(true);
      expect(e3.count).toBe(3);
      expect(circuitBreakerTrippedEvent).toBe(true);

      const cubicle4 = cubicleManager.getCubicle('cubicle-04');
      expect(cubicle4.status).toBe('error');
      expect(cubicle4.surface_thoughts).toContain('Circuit breaker tripped');

      // Reset count verification
      cubicleManager.resetErrorCount('cubicle-04');
      const eReset = cubicleManager.recordError('cubicle-04', 'First error after reset');
      expect(eReset.count).toBe(1);
      expect(eReset.trippedCircuitBreaker).toBe(false);

      // Failover testing:
      // Case A: Failover when no task is active
      cubicle4.current_task_id = null;
      const noTaskFailover = await consularEngine.failoverTask('cubicle-04', 'cubicle-02', 'Manual test failover');
      expect(noTaskFailover.success).toBe(false);

      // Case B: Failover with active task
      cubicle4.current_task_id = 'task-critical-101';
      const taskFailover = await consularEngine.failoverTask(
        'cubicle-04',
        'cubicle-02',
        'Circuit breaker tripped: stalled worker'
      );
      expect(taskFailover.success).toBe(true);
      expect(taskFailover.task_id).toBe('task-critical-101');
      expect(taskFailover.from).toBe('cubicle-04');
      expect(taskFailover.to).toBe('cubicle-02');

      // Assert state changes on source and target cubicles
      expect(cubicleManager.getCubicle('cubicle-04').current_task_id).toBeNull();
      expect(cubicleManager.getCubicle('cubicle-04').status).toBe('error');
      expect(cubicleManager.getCubicle('cubicle-02').current_task_id).toBe('task-critical-101');
      expect(cubicleManager.getCubicle('cubicle-02').status).toBe('working');

      // Assert disk state persistence in .swarm/status/
      const c4StatusRaw = await fs.readFile(path.join(sandbox.swarmDir, 'status', 'cubicle-04.json'), 'utf8');
      const c2StatusRaw = await fs.readFile(path.join(sandbox.swarmDir, 'status', 'cubicle-02.json'), 'utf8');
      expect(JSON.parse(c4StatusRaw).current_task_id).toBeNull();
      expect(JSON.parse(c2StatusRaw).current_task_id).toBe('task-critical-101');
    });
  });

  // =========================================================================
  // 4. Git Time-Machine Checkpoints (.swarm/checkpoints/)
  // =========================================================================
  describe('4. Git Time-Machine Checkpoints (.swarm/checkpoints/)', () => {
    it('creates snapshots, lists them in reverse chronological order, and executes 1-click rollback', async () => {
      let rollbackEvent: any = null;
      consularEngine.onEvent((type, payload) => {
        if (type === 'CHECKPOINT_ROLLED_BACK') rollbackEvent = payload;
      });

      // 1. Create first checkpoint
      const chk1 = await consularEngine.createCheckpoint('Pre-consular merge commit 9a8f2');
      expect(chk1.checkpoint_id).toMatch(/^chk-\d+-[a-z0-9]+$/);
      expect(chk1.label).toBe('Pre-consular merge commit 9a8f2');

      // Small delay to ensure timestamp separation
      await new Promise((r) => setTimeout(r, 20));

      // 2. Create second checkpoint
      const chk2 = await consularEngine.createCheckpoint('Post-self-update build v1.1.0');
      expect(chk2.checkpoint_id).toBeDefined();

      // 3. List checkpoints
      const list = await consularEngine.listCheckpoints();
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0].checkpoint_id).toBe(chk2.checkpoint_id); // Newer first
      expect(list[1].checkpoint_id).toBe(chk1.checkpoint_id);

      // 4. Verify file persistence on disk
      const chk1Disk = path.join(sandbox.swarmDir, 'checkpoints', `${chk1.checkpoint_id}.json`);
      expect(existsSync(chk1Disk)).toBe(true);

      // 5. Rollback to chk1
      const rollback = await consularEngine.rollbackCheckpoint(chk1.checkpoint_id);
      expect(rollback.success).toBe(true);
      expect(rollback.rolled_back_to).toBe(chk1.checkpoint_id);
      expect(rollbackEvent?.id).toBe(chk1.checkpoint_id);

      // 6. Rollback to non-existent checkpoint must fail
      await expect(consularEngine.rollbackCheckpoint('chk-does-not-exist')).rejects.toThrow(
        'Checkpoint not found: chk-does-not-exist'
      );
    });
  });

  // =========================================================================
  // 5. Inter-Cubicle Shared Contracts (.swarm/contracts/)
  // =========================================================================
  describe('5. Inter-Cubicle Shared Contracts (.swarm/contracts/)', () => {
    it('registers shared schema contract, cleanses name, persists to disk, and retrieves by name', async () => {
      const authSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          token: { type: 'string' },
          expires_in: { type: 'number' },
          roles: { type: 'array', items: { type: 'string' } },
        },
        required: ['token', 'expires_in'],
      };

      // 1. Register with complex/special characters
      const reg = await consularEngine.registerContract('auth/v1.0/session-token', authSchema, 'cubicle-01');
      expect(reg.name).toBe('auth_v1_0_session-token');

      // 2. Verify disk persistence
      const contractPath = path.join(sandbox.swarmDir, 'contracts', 'auth_v1_0_session-token.json');
      expect(existsSync(contractPath)).toBe(true);

      // 3. Retrieve contract
      const retrieved = await consularEngine.getContract('auth/v1.0/session-token');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.providerCubicle).toBe('cubicle-01');
      expect(retrieved?.schema.required).toContain('token');

      // 4. Validate conforming vs non-conforming payload against retrieved contract schema
      const conformingPayload = { token: 'jwt-xyz-123', expires_in: 3600, roles: ['admin'] };
      const nonConformingPayload = { roles: ['guest'] }; // Missing required token & expires_in

      const hasRequired = (schema: any, data: any) =>
        schema.required.every((field: string) => field in data && typeof data[field] === schema.properties[field].type);

      expect(hasRequired(retrieved?.schema, conformingPayload)).toBe(true);
      expect(hasRequired(retrieved?.schema, nonConformingPayload)).toBe(false);

      // 5. Retrieve non-existent contract returns null
      const nonExistent = await consularEngine.getContract('unregistered-service');
      expect(nonExistent).toBeNull();

      // 6. List contracts returns all entries
      const allContracts = await consularEngine.listContracts();
      expect(allContracts.some((c) => c.name === 'auth_v1_0_session-token')).toBe(true);
    });
  });

  // =========================================================================
  // 6. Night-Shift AFK Autonomous Mode & Briefing Digest
  // =========================================================================
  describe('6. Night-Shift AFK Autonomous Mode & Briefing Digest', () => {
    it('activates AFK mode, compiles completed tasks from done/ and telemetry from incidents.jsonl, and enforces token budget cap', async () => {
      // 1. Enable AFK mode with 40,000 token cap
      const afk = consularEngine.setAfkMode(true, 40000);
      expect(afk.afk_mode).toBe(true);
      expect(afk.token_cap).toBe(40000);

      // 2. Place 3 completed tasks in done/
      const doneDir = path.join(sandbox.swarmDir, 'tasks', 'done');
      await fs.writeFile(
        path.join(doneDir, 'task-done-1.json'),
        JSON.stringify({ id: 'task-done-1', title: 'DB Optimization', status: 'done' })
      );
      await fs.writeFile(
        path.join(doneDir, 'task-done-2.json'),
        JSON.stringify({ id: 'task-done-2', title: 'Auth Unit Tests', status: 'done' })
      );
      await fs.writeFile(
        path.join(doneDir, 'task-done-3.json'),
        JSON.stringify({ id: 'task-done-3', title: 'CSS Cyberpunk HUD', status: 'done' })
      );

      // 3. Write mock incidents into incidents.jsonl (2 telemetry events + 2 Consular vetos)
      const incidentsPath = path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl');
      const lines = [
        JSON.stringify({ type: 'TELEMETRY', event: 'Cubicle 1 completed subtask' }),
        JSON.stringify({ type: 'INCIDENT', event: 'CONSULAR_VETO on branch swarm/cubicle-04 due to style mismatch' }),
        JSON.stringify({ type: 'TELEMETRY', event: 'Cubicle 2 reclaimed task' }),
        JSON.stringify({ type: 'INCIDENT', event: 'INTERCESSIO VETO: Second veto on invalid test suite' }),
      ].join('\n');
      await fs.writeFile(incidentsPath, lines + '\n', 'utf8');

      // 4. Generate Briefing Digest
      const digest = await consularEngine.generateBriefingDigest();
      expect(digest.completed_tasks).toBe(3);
      expect(digest.incidents_count).toBe(4);
      expect(digest.veto_count).toBe(2);
      expect(digest.tokens_consumed).toBe(3 * 4500); // 13,500 < 40,000 cap
      expect(digest.summary).toContain('AFK NIGHT-SHIFT DIGEST: 3 tasks finalized in done/.');
      expect(digest.summary).toContain('2 Consular Intercessio vetos enforced');
    });
  });

  // =========================================================================
  // 7. Consular Q&A Engine & Autonomous Preference Learning
  // =========================================================================
  describe('7. Consular Q&A Engine & Autonomous Preference Learning', () => {
    it('creates questions, supports skip without learning, and answers with custom write-in propagating to nia_growth and preference rules', async () => {
      vi.spyOn(consularEngine as any, 'resumeQuestion').mockResolvedValue(undefined);
      // 1. Create Question 1 (To be skipped)
      const q1 = await consularEngine.createQuestion({
        asking_consul: 'Nia',
        prompt: 'Do you want high-contrast scanlines enabled?',
        options: [
          { id: 'opt-scan-on', label: 'Enable Scanlines', is_recommended: true },
          { id: 'opt-scan-off', label: 'Disable Scanlines' },
        ],
        is_multi_select: false,
        allow_custom_write_in: true,
      });

      expect(q1.question_id).toBeDefined();
      expect(q1.status).toBe('PENDING');

      // Skip Question 1
      const skippedQ1 = await consularEngine.answerQuestion(q1.question_id, { skipped: true });
      expect(skippedQ1.status).toBe('SKIPPED');

      // Nia growth rules should NOT be modified on skip
      const niaGrowthBefore = consularEngine.getNiaGrowth();
      const rulesChampionedBefore = niaGrowthBefore.total_artistic_rules_championed;

      // 2. Create Question 2 (To be answered with options and custom write-in)
      const q2 = await consularEngine.createQuestion({
        asking_consul: 'Consul Nia Nova',
        prompt: 'Select primary dark UI theme accent palette',
        options: [
          { id: 'opt-crimson', label: 'Obsidian & Crimson', is_recommended: true },
          { id: 'opt-amber', label: 'Industrial Amber' },
        ],
        is_multi_select: false,
        allow_custom_write_in: true,
      });

      const answeredQ2 = await consularEngine.answerQuestion(q2.question_id, {
        selected_option_ids: ['opt-crimson'],
        custom_write_in: 'Phosphor green highlights for terminal status',
      });

      expect(answeredQ2.status).toBe('ANSWERED');
      expect(answeredQ2.user_response?.selected_option_ids).toContain('opt-crimson');
      expect(answeredQ2.user_response?.custom_write_in).toContain('Phosphor green');

      // 3. Verify Nia Growth State incremented and stored to disk
      const niaGrowthAfter = consularEngine.getNiaGrowth();
      expect(niaGrowthAfter.total_artistic_rules_championed).toBe(rulesChampionedBefore + 1);
      expect(
        niaGrowthAfter.advocated_goals.some(
          (g) => g.includes('primary dark UI theme') && g.includes('Phosphor green')
        )
      ).toBe(true);

      const niaDiskRaw = await fs.readFile(path.join(sandbox.swarmDir, 'memory', 'nia_growth.json'), 'utf8');
      expect(JSON.parse(niaDiskRaw).total_artistic_rules_championed).toBe(rulesChampionedBefore + 1);

      // 4. Verify PreferenceEngine learned and compiled the rule into USER_PREFERENCES.md
      const prefs = preferenceEngine.getPreferences();
      const learnedPref = prefs.find((p) => p.rule.includes('primary dark UI theme'));
      expect(learnedPref).toBeDefined();
      expect(learnedPref?.rule).toContain('opt-crimson');
      expect(learnedPref?.rule).toContain('Phosphor green');

      const userPrefsMd = await fs.readFile(
        path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md'),
        'utf8'
      );
      expect(userPrefsMd).toContain('primary dark UI theme');

      // 5. Answering non-existent question throws error
      await expect(
        consularEngine.answerQuestion('non-existent-q', { selected_option_ids: ['opt-1'] })
      ).rejects.toThrow('Question not found: non-existent-q');
    });
  });

  // =========================================================================
  // 8. Preference Engine High-Concurrency Writes & Corruption Recovery
  // =========================================================================
  describe('8. Preference Engine High-Concurrency Writes & Corruption Recovery', () => {
    it('executes 25 concurrent atomic writes without race condition or collision, preserving valid JSON', async () => {
      const writePromises = Array.from({ length: 25 }, (_, i) => {
        return preferenceEngine.savePreference({
          category: 'coding_style',
          key: `concurrent_rule_${String(i).padStart(2, '0')}`,
          rule: `Enforce invariant rule ${i} across all worktrees.`,
          trigger_patterns: [`src/rule_${i}/**`],
          confidence: 0.9,
          enabled: true,
          applies_to: 'all_cubicles',
        });
      });

      // Fire all 25 simultaneously
      const results = await Promise.all(writePromises);
      expect(results).toHaveLength(25);

      // Verify in-memory database
      expect(preferenceEngine.getPreferences().length).toBeGreaterThanOrEqual(25);

      // Verify physical disk file is strictly valid JSON
      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      const rawDisk = await fs.readFile(dbPath, 'utf8');
      const parsedDisk = JSON.parse(rawDisk);
      expect(parsedDisk.preferences.length).toBeGreaterThanOrEqual(25);

      // Verify compiled USER_PREFERENCES.md exists and contains the rules
      const mdPath = path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md');
      const mdRaw = await fs.readFile(mdPath, 'utf8');
      expect(mdRaw).toContain('concurrent_rule_00');
      expect(mdRaw).toContain('concurrent_rule_24');
    });

    it('safeguards backup file from being overwritten when primary is corrupted, and recovers seamlessly upon restart', async () => {
      // 1. Establish valid state with backup
      await preferenceEngine.savePreference({
        category: 'architecture',
        key: 'resilient_backup_rule',
        rule: 'Must preserve backups at all costs.',
        trigger_patterns: ['**/*.ts'],
        confidence: 0.99,
        enabled: true,
        applies_to: 'all',
      });
      // Second save to rotate backup
      await preferenceEngine.savePreference({
        category: 'testing',
        key: 'verification_rule',
        rule: 'Always verify before concluding.',
        trigger_patterns: ['test/**'],
        confidence: 0.95,
        enabled: true,
        applies_to: 'all',
      });

      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      const bakPath = path.join(sandbox.swarmDir, 'memory', '.preferences.json.bak');

      // Verify backup exists and is valid JSON
      expect(existsSync(bakPath)).toBe(true);
      const initialBak = await fs.readFile(bakPath, 'utf8');
      expect(() => JSON.parse(initialBak)).not.toThrow();

      // 2. Corrupt the primary file intentionally with unparseable garbage
      const corruptPayload = '<<CORRUPTED_RAW_UNCLOSED_PAYLOAD_{{{{[[[[!@#$%^';
      await fs.writeFile(dbPath, corruptPayload, 'utf8');

      // 3. Trigger another savePreference on the running engine
      // Because dbPath is corrupt, atomicWriteDb's JSON.parse guard must catch it
      // and PRESERVE the existing backup rather than copying the garbage into the backup!
      await preferenceEngine.savePreference({
        category: 'workflow',
        key: 'emergency_save',
        rule: 'Save during partial outage.',
        trigger_patterns: [],
        confidence: 0.8,
        enabled: true,
        applies_to: 'all',
      });

      // The backup must still be valid JSON and NOT the corrupt payload
      const bakAfterCorruptAttempt = await fs.readFile(bakPath, 'utf8');
      expect(bakAfterCorruptAttempt).not.toBe(corruptPayload);
      expect(() => JSON.parse(bakAfterCorruptAttempt)).not.toThrow();

      // 4. Now simulate disaster restart:
      // Re-corrupt primary again and initialize a new PreferenceEngine instance
      await fs.writeFile(dbPath, corruptPayload, 'utf8');
      const freshEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
      await freshEngine.initialize();

      // freshEngine should have recovered cleanly from the backup!
      const recoveredPrefs = freshEngine.getPreferences();
      expect(recoveredPrefs.length).toBeGreaterThanOrEqual(1);
      expect(recoveredPrefs.some((p) => p.key === 'resilient_backup_rule')).toBe(true);

      // And primary preferences.json on disk must be restored to clean valid JSON
      const restoredRaw = await fs.readFile(dbPath, 'utf8');
      expect(() => JSON.parse(restoredRaw)).not.toThrow();
      expect(restoredRaw).toContain('resilient_backup_rule');
    });
  });
});
