/**
 * test/unit/adversarial-empirical-m2-5.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE (Milestone 2 Iteration 4)
 * Author: Challenger M2-5 (teamwork_preview_challenger)
 *
 * Empirical Challenge Focus:
 * 1. Roman Numeral Normalization & Anti-Collusion Invariants:
 *    - Unanimous 2/2 Consensus passes with distinct canonical titles (Consul I + Consul II).
 *    - Unanimous 2/2 Consensus passes with distinct named personas (Consul Nia Nova + Consul Ferric Lunaux).
 *    - Unanimous 2/2 Consensus passes with mixed canonical and persona titles (Consul I + Consul Ferric Lunaux).
 *    - Anti-collusion Intercessio veto strictly triggered for duplicate voters (Consul I + Consul I, Consul II + Consul II).
 *    - Anti-collusion Intercessio veto strictly triggered for alias pairs (Consul I + Consul Nia Nova, Consul II + Consul Ferric Lunaux).
 * 2. Path Traversal & ACL Boundary Evasion (verifyPathAccess):
 *    - URL-encoded traversal evasion (%2e%2e/, %2e%2e%2f, src/client/%2e%2e/%2e%2e/etc/passwd).
 *    - Multi-dot evasion (.../etc/passwd, src/client/.../hidden).
 *    - Prefix boundary evasion (src/client_archive/keys.pem, src/client-secret/data.json, src/client.ts).
 *    - Directory nesting & substring evasion (unauthorized/src/client/secret.txt, fake_prefix/src/client).
 *    - Denied path overrides (src/client/.env.local, .swarm/secrets/vault.key).
 *    - Legitimate authorized path access (src/client/main.ts, public/assets/logo.svg).
 * 3. Courier Gateway Execution Lifecycle (execute_work):
 *    - execute_work: true with 2/2 Consular approval transitions task from review/ to done/ with progress 100%.
 *    - execute_work: true with Consular Veto transitions task from review/ back to todo/ (revision) with veto history.
 *    - execute_work: true with Duplicate Voter Anti-Collusion Veto transitions task back to revision.
 *    - execute_work: false leaves task in todo/ waiting for cubicle claim.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { CourierGateway } from '../../src/server/courier-gateway';
import { ConsularVote } from '../../src/server/types/governance';

describe('Challenger M2-5: Empirical Adversarial Verification Suite', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let cubicleManager: CubicleManager;
  let taskboardManager: TaskboardManager;
  let capabilityMatrix: CapabilityMatrix;
  let consularEngine: ConsularEngine;
  let courierGateway: CourierGateway;

  beforeEach(async () => {
    sandbox = await createTestSandbox('challenger_m2_5');

    cubicleManager = new CubicleManager(sandbox.swarmDir);
    taskboardManager = new TaskboardManager(sandbox.swarmDir);
    capabilityMatrix = new CapabilityMatrix();

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
  // 1. ROMAN NUMERAL NORMALIZATION & ANTI-COLLUSION INVARIANTS
  // =========================================================================
  describe('1. Roman Numeral Normalization & Anti-Collusion Invariants', () => {
    it('normalizes titles correctly without Roman numeral substring collision', () => {
      expect(consularEngine.normalizeConsulTitle('Consul I')).toBe('consul-1');
      expect(consularEngine.normalizeConsulTitle('Consul II')).toBe('consul-2');
      expect(consularEngine.normalizeConsulTitle('Consul 1')).toBe('consul-1');
      expect(consularEngine.normalizeConsulTitle('Consul 2')).toBe('consul-2');
      expect(consularEngine.normalizeConsulTitle('Consul Nia Nova')).toBe('consul-1');
      expect(consularEngine.normalizeConsulTitle('Consul Ferric Lunaux')).toBe('consul-2');
      expect(consularEngine.normalizeConsulTitle('Unknown Consul')).toBe('unknown');
    });

    it('approves unanimous 2/2 consensus for canonical pair Consul I + Consul II', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Aesthetic and user preference standards satisfied.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Zero resource leaks and type boundaries verified.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-roman-canonical');
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');
      expect(result.dissenting_consuls).toBeUndefined();
    });

    it('approves unanimous 2/2 consensus for named persona pair Consul Nia Nova + Consul Ferric Lunaux', () => {
      const vote1: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Nia approves implementation aesthetics.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Ferric confirms zero regressions and tight memory profile.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-named-personas');
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');
    });

    it('approves unanimous 2/2 consensus for mixed pair Consul I + Consul Ferric Lunaux', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Consul I confirms UX flow.',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Ferric confirms performance benchmarks.',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-mixed-pair');
      expect(result.unanimous_approved).toBe(true);
      expect(result.action_taken).toBe('MERGED_TO_MAIN');
    });

    it('triggers anti-collusion veto when duplicate voters vote (Consul I + Consul I)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Vote 1 from Consul I',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Duplicate vote 2 from Consul I',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-dup-consul-1');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
      expect(result.dissenting_consuls).toEqual(['Consul I']);
    });

    it('triggers anti-collusion veto when duplicate voters vote (Consul II + Consul II)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Vote 1 from Consul II',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Duplicate vote 2 from Consul II',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-dup-consul-2');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('triggers anti-collusion veto when alias pairs vote (Consul I + Consul Nia Nova)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Vote from title Consul I',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Vote from persona Consul Nia Nova',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-alias-nia');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });

    it('triggers anti-collusion veto when alias pairs vote (Consul II + Consul Ferric Lunaux)', () => {
      const vote1: ConsularVote = {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Vote from title Consul II',
        timestamp: new Date().toISOString(),
      };
      const vote2: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Vote from persona Consul Ferric Lunaux',
        timestamp: new Date().toISOString(),
      };

      const result = consularEngine.evaluateConsensus(vote1, vote2, 'task-alias-ferric');
      expect(result.unanimous_approved).toBe(false);
      expect(result.action_taken).toBe('VETO_BLOCKED_AND_REVISED');
      expect(result.reason).toContain('two distinct Consuls');
    });
  });

  // =========================================================================
  // 2. PATH TRAVERSAL & ACL BOUNDARY EVASION (verifyPathAccess)
  // =========================================================================
  describe('2. Path Traversal & ACL Boundary Evasion (verifyPathAccess)', () => {
    beforeEach(async () => {
      await consularEngine.setAccessScope('cubicle-01', {
        allowed_paths: ['src/client/**', 'public/**'],
        denied_paths: ['src/server/**', '.env*', '.swarm/secrets/**'],
        memory_scopes: ['preferences'],
      });
    });

    it('blocks URL-encoded directory traversal (%2e%2e/ and %2e%2e%2f)', () => {
      const attack1 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/%2e%2e/%2e%2e/etc/passwd');
      expect(attack1.allowed).toBe(false);
      expect(attack1.reason).toContain('SECURITY_VIOLATION');

      const attack2 = consularEngine.verifyPathAccess('cubicle-01', '%2e%2e%2f%2e%2e%2fetc%2fpasswd');
      expect(attack2.allowed).toBe(false);
      expect(attack2.reason).toContain('SECURITY_VIOLATION');

      const attack3 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/%2e%2e/server/index.ts');
      expect(attack3.allowed).toBe(false);
      expect(attack3.reason).toContain('SECURITY_VIOLATION');
    });

    it('blocks multi-dot evasion attempts (.../ and ..../)', () => {
      const attack1 = consularEngine.verifyPathAccess('cubicle-01', '.../etc/passwd');
      expect(attack1.allowed).toBe(false);
      expect(attack1.reason).toContain('SECURITY_VIOLATION');

      const attack2 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/.../hidden');
      // Even if interpreted as a subpath, does not escape, but if evaluated against allowed_paths, must stay within bounds
      // And unauthorized multi-dot parent retreat outside allowed_paths is blocked:
      const attack3 = consularEngine.verifyPathAccess('cubicle-01', '..../secrets');
      expect(attack3.allowed).toBe(false);
      expect(attack3.reason).toContain('SECURITY_VIOLATION');
    });

    it('blocks prefix boundary evasion attacks (e.g. src/client_archive, src/client-secret)', () => {
      const attack1 = consularEngine.verifyPathAccess('cubicle-01', 'src/client_archive/keys.pem');
      expect(attack1.allowed).toBe(false);
      expect(attack1.reason).toContain('outside the authorized allowed_paths scope');

      const attack2 = consularEngine.verifyPathAccess('cubicle-01', 'src/client-secret/data.json');
      expect(attack2.allowed).toBe(false);
      expect(attack2.reason).toContain('outside the authorized allowed_paths scope');

      const attack3 = consularEngine.verifyPathAccess('cubicle-01', 'src/client.ts');
      expect(attack3.allowed).toBe(false);
      expect(attack3.reason).toContain('outside the authorized allowed_paths scope');
    });

    it('blocks directory nesting and substring evasion (e.g. unauthorized/src/client/secret.txt)', () => {
      const attack1 = consularEngine.verifyPathAccess('cubicle-01', 'unauthorized/src/client/secret.txt');
      expect(attack1.allowed).toBe(false);
      expect(attack1.reason).toContain('outside the authorized allowed_paths scope');

      const attack2 = consularEngine.verifyPathAccess('cubicle-01', 'build/cache/src/client/bundle.js');
      expect(attack2.allowed).toBe(false);
      expect(attack2.reason).toContain('outside the authorized allowed_paths scope');
    });

    it('strictly enforces denied_paths even if located inside an authorized prefix', () => {
      const check1 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/.env.local');
      expect(check1.allowed).toBe(false);
      expect(check1.reason).toContain('denied by Consular ACL rule');

      const check2 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/.swarm/secrets/vault.key');
      expect(check2.allowed).toBe(false);
      expect(check2.reason).toContain('denied by Consular ACL rule');
    });

    it('permits valid paths strictly conforming to authorized scope', () => {
      const valid1 = consularEngine.verifyPathAccess('cubicle-01', 'src/client/components/Avatar.tsx');
      expect(valid1.allowed).toBe(true);

      const valid2 = consularEngine.verifyPathAccess('cubicle-01', 'public/assets/logo.svg');
      expect(valid2.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 3. COURIER GATEWAY LIFECYCLE (execute_work APPROVAL & VETO)
  // =========================================================================
  describe('3. Courier Gateway Lifecycle (execute_work Approval & Veto)', () => {
    it('moves task to done/ on taskboard upon 2/2 Consular approval when execute_work is true', async () => {
      const approvalVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Clean architecture and compliant interfaces.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Unit tests passed with zero memory leaks.',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'openclaw',
          prompt: 'Implement zero-alloc message parser',
          requested_type: 'POWER',
          execute_work: true,
        },
        approvalVotes
      );

      // Verify petition state
      expect(petition.status).toBe('SEALED');
      expect(petition.consular_seal?.approved_by).toEqual(['Consul I', 'Consul II']);
      expect(petition.swarm_task_id).toBeDefined();

      // Verify deliverable artifact in outbox
      const artifactPath = path.join(
        sandbox.swarmDir,
        'courier',
        'outbox',
        `deliverable_openclaw_${petition.petition_id}.json`
      );
      const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
      expect(artifactExists).toBe(true);

      // Verify Taskboard state: task MUST be in done/ with 100% progress
      const allTasks = await taskboardManager.listAllTasks();
      const doneTask = allTasks.done.find((t) => t.id === petition.swarm_task_id);
      expect(doneTask).toBeDefined();
      expect(doneTask?.column).toBe('done');
      expect(doneTask?.progress_percent).toBe(100);
      expect(doneTask?.completed_at).toBeDefined();

      // Ensure it is NOT in review/ or todo/ or in_progress/
      expect(allTasks.review.some((t) => t.id === petition.swarm_task_id)).toBe(false);
      expect(allTasks.todo.some((t) => t.id === petition.swarm_task_id)).toBe(false);
      expect(allTasks.in_progress.some((t) => t.id === petition.swarm_task_id)).toBe(false);
    });

    it('returns task to revision (todo/) on taskboard upon Consular Veto when execute_work is true', async () => {
      const dissentingVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Good functionality.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: Missing integration stress test harness.',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'hermes',
          prompt: 'Deploy high-throughput event pipe',
          requested_type: 'POWER',
          execute_work: true,
        },
        dissentingVotes
      );

      // Verify petition state
      expect(petition.status).toBe('VETOED');
      expect(petition.consular_seal).toBeUndefined();
      expect(petition.sealed_deliverable).toBeUndefined();
      expect(petition.veto_rationale).toContain('Missing integration stress test harness');

      // Verify outbox deliverable is NOT created
      const artifactPath = path.join(
        sandbox.swarmDir,
        'courier',
        'outbox',
        `deliverable_hermes_${petition.petition_id}.json`
      );
      const artifactExists = await fs.access(artifactPath).then(() => true).catch(() => false);
      expect(artifactExists).toBe(false);

      // Verify Taskboard state: task MUST return to todo/ for revision
      const allTasks = await taskboardManager.listAllTasks();
      const revisedTask = allTasks.todo.find((t) => t.id === petition.swarm_task_id);
      expect(revisedTask).toBeDefined();
      expect(revisedTask?.column).toBe('todo');
      expect(revisedTask?.veto_history.length).toBeGreaterThan(0);
      expect(revisedTask?.veto_history[0].consul).toBe('Consul II');
      expect(revisedTask?.veto_history[0].rationale).toContain('Missing integration stress test harness');

      // Ensure task is NOT in review/ or done/
      expect(allTasks.review.some((t) => t.id === petition.swarm_task_id)).toBe(false);
      expect(allTasks.done.some((t) => t.id === petition.swarm_task_id)).toBe(false);
    });

    it('returns task to revision upon Duplicate Voter Anti-Collusion Veto when execute_work is true', async () => {
      const duplicateVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Self vote 1',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Self vote 2',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'gpt-dot',
          prompt: 'Attempt unilateral approval',
          requested_type: 'POWER',
          execute_work: true,
        },
        duplicateVotes
      );

      expect(petition.status).toBe('VETOED');
      expect(petition.veto_rationale).toContain('two distinct Consuls');

      const allTasks = await taskboardManager.listAllTasks();
      const revisedTask = allTasks.todo.find((t) => t.id === petition.swarm_task_id);
      expect(revisedTask).toBeDefined();
      expect(revisedTask?.column).toBe('todo');
      expect(revisedTask?.veto_history.length).toBeGreaterThan(0);
    });

    it('leaves task in todo/ waiting for worker claim when execute_work is false', async () => {
      const petition = await courierGateway.submitPetition({
        sender_agent: 'openclaw',
        prompt: 'Task queued without auto-execution',
        requested_type: 'POWER',
        execute_work: false,
      });

      expect(petition.status).toBe('SEALED');
      expect(petition.swarm_task_id).toBeDefined();

      const allTasks = await taskboardManager.listAllTasks();
      const todoTask = allTasks.todo.find((t) => t.id === petition.swarm_task_id);
      expect(todoTask).toBeDefined();
      expect(todoTask?.column).toBe('todo');
      expect(todoTask?.assigned_cubicle).toBeNull();
      expect(allTasks.done.some((t) => t.id === petition.swarm_task_id)).toBe(false);
    });
  });
});
