import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { CourierGateway } from '../../src/server/courier-gateway';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { ConsularVote } from '../../src/server/types/governance';

describe('External Agent Courier Gateway Unit Tests (OpenClaw, Hermes, GPT Dot)', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let consularEngine: ConsularEngine;
  let taskboardManager: TaskboardManager;
  let courierGateway: CourierGateway;

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_courier');
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

  describe('1. Default Connectors & Envoys', () => {
    it('provisions ready connectors for OpenClaw, Hermes, and GPT Dot in .agents/courier/', async () => {
      const envoys = courierGateway.getEnvoys();
      expect(envoys).toHaveLength(3);

      const agentNames = envoys.map((e) => e.agent);
      expect(agentNames).toContain('openclaw');
      expect(agentNames).toContain('hermes');
      expect(agentNames).toContain('gpt-dot');

      for (const envoy of envoys) {
        const raw = await fs.readFile(envoy.connectorPath, 'utf8');
        const connector = JSON.parse(raw);
        expect(connector.agent).toBe(envoy.agent);
        expect(connector.gateway_url).toContain('/api/courier');
      }
    });

    it('returns ratified Consular Wisdom plan and guidance', () => {
      const wisdom = courierGateway.getConsularWisdom('Optimize Database Indexing', 'openclaw');
      expect(wisdom.guidance).toContain('CONSULAR WISDOM RATIFIED');
      expect(wisdom.plan.length).toBeGreaterThanOrEqual(3);
      expect(wisdom.approved_by).toEqual(['Consul I', 'Consul II']);
    });
  });

  describe('2. Petition Submission & Consular Seal Execution Loop', () => {
    it('accepts OpenClaw petition, receives Consular Wisdom + Swarm Task + 2/2 Consular Seal', async () => {
      let sealedEvent = false;
      courierGateway.onEvent((type) => {
        if (type === 'COURIER_SEALED') sealedEvent = true;
      });

      const petition = await courierGateway.submitPetition({
        external_agent: 'openclaw',
        task_description: 'Audit and refactor memory leak in WebSocket connection pool',
        context: { priority: 'high', urgency: 'immediate' },
        requested_type: 'BOTH',
      });

      expect(petition.id).toContain('courier-pet-openclaw');
      expect(petition.status).toBe('SEALED');
      expect(petition.consular_wisdom?.approved_by).toEqual(['Consul I', 'Consul II']);
      expect(petition.swarm_task_id).toBeDefined();

      // Consular votes must both approve (2/2)
      expect(petition.consular_votes).toHaveLength(2);
      expect(petition.consular_votes?.[0].decision).toBe('APPROVE');
      expect(petition.consular_votes?.[1].decision).toBe('APPROVE');

      // Sealed deliverable must bear the Consular seal
      expect(petition.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
      expect(petition.sealed_deliverable?.result).toContain('openclaw petition');
      expect(petition.consular_seal?.approved_by).toEqual(['Consul I', 'Consul II']);
      expect(sealedEvent).toBe(true);

      // Verify authentic artifact file exists on disk
      const artifactFile = path.join(
        sandbox.swarmDir,
        'courier',
        'outbox',
        `deliverable_openclaw_${petition.petition_id}.json`
      );
      const artifactExists = await fs.access(artifactFile).then(() => true).catch(() => false);
      expect(artifactExists).toBe(true);

      // Verify task exists on Taskboard
      const allTasks = await taskboardManager.listAllTasks();
      const task = allTasks.todo.find((t) => t.id === petition.swarm_task_id);
      expect(task).toBeDefined();
      expect(task?.title).toContain('[Courier: openclaw]');
    });

    it('processes Hermes and GPT Dot petitions successfully', async () => {
      const hermesPet = await courierGateway.submitPetition({
        external_agent: 'hermes',
        task_description: 'Send broadcast update to remote subscribers',
      });
      expect(hermesPet.status).toBe('SEALED');
      expect(hermesPet.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');

      const gptDotPet = await courierGateway.submitPetition({
        external_agent: 'gpt-dot',
        task_description: 'Summarize weekly commit logs',
      });
      expect(gptDotPet.status).toBe('SEALED');
      expect(gptDotPet.sealed_deliverable?.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
    });

    it('handles requested_type: WISDOM without creating tasks on taskboard', async () => {
      const wisdomPetition = await courierGateway.submitPetition({
        sender_agent: 'openclaw',
        prompt: 'Architectural evaluation of event-driven message bus',
        requested_type: 'WISDOM',
      });

      expect(wisdomPetition.status).toBe('SEALED');
      expect(wisdomPetition.wisdom_response).toContain('CONSULAR WISDOM RATIFIED');
      expect(wisdomPetition.swarm_task_id).toBeUndefined();
      expect(wisdomPetition.tasks_spawned).toBeUndefined();
      expect(wisdomPetition.consular_seal?.approved_by).toEqual(['Consul I', 'Consul II']);

      const allTasks = await taskboardManager.listAllTasks();
      expect(allTasks.todo).toHaveLength(0);
    });

    it('vetoes petition when Consular dissent occurs (1/2 Veto) without granting seal', async () => {
      let vetoEvent = false;
      courierGateway.onEvent((type) => {
        if (type === 'COURIER_VETOED') vetoEvent = true;
      });

      const dissentingVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Looks acceptable from high level.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'INTERCESSIO VETO: Security risk — unchecked file execution.',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'openclaw',
          prompt: 'Execute unverified shell payload',
          requested_type: 'POWER',
        },
        dissentingVotes
      );

      expect(petition.status).toBe('VETOED');
      expect(petition.consular_seal).toBeUndefined();
      expect(petition.sealed_deliverable).toBeUndefined();
      expect(petition.veto_rationale).toContain('unchecked file execution');
      expect(vetoEvent).toBe(true);
    });

    it('executes taskboard lifecycle and moves task to done upon 2/2 Consular approval when execute_work is true', async () => {
      const petition = await courierGateway.submitPetition({
        external_agent: 'openclaw',
        task_description: 'Fix race condition in atomic counter',
        requested_type: 'POWER',
        execute_work: true,
      });

      expect(petition.status).toBe('SEALED');
      expect(petition.consular_seal?.approved_by).toEqual(['Consul I', 'Consul II']);

      const allTasks = await taskboardManager.listAllTasks();
      const doneTask = allTasks.done.find((t) => t.id === petition.swarm_task_id);
      expect(doneTask).toBeDefined();
      expect(doneTask?.column).toBe('done');
      expect(doneTask?.progress_percent).toBe(100);
    });

    it('returns task to revision on taskboard upon Consular Veto when execute_work is true', async () => {
      const dissentingVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Acceptable code.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'VETO',
          rationale: 'Missing atomic tests.',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'openclaw',
          prompt: 'Unreviewed patch',
          requested_type: 'POWER',
          execute_work: true,
        },
        dissentingVotes
      );

      expect(petition.status).toBe('VETOED');
      const allTasks = await taskboardManager.listAllTasks();
      const revisedTask = allTasks.todo.find((t) => t.id === petition.swarm_task_id);
      expect(revisedTask).toBeDefined();
      expect(revisedTask?.veto_history.length).toBeGreaterThan(0);
      expect(revisedTask?.veto_history[0].rationale).toContain('Missing atomic tests');
    });

    it('rejects self-voting where both votes originate from the same Consul', async () => {
      const selfVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Self-approval 1',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Self-approval 2',
          timestamp: new Date().toISOString(),
        },
      ];

      const petition = await courierGateway.submitPetition(
        {
          sender_agent: 'hermes',
          prompt: 'Unilateral policy bypass',
        },
        selfVotes
      );

      expect(petition.status).toBe('VETOED');
      expect(petition.consular_seal).toBeUndefined();
      expect(petition.veto_rationale).toContain('two distinct Consuls');
    });

    it('allows external callers to review an existing petition via reviewPetition', async () => {
      const petition = await courierGateway.submitPetition({
        sender_agent: 'gpt-dot',
        prompt: 'Refactor database models',
        requested_type: 'BOTH',
      });

      const reviewVotes: [ConsularVote, ConsularVote] = [
        {
          consul: 'Consul I',
          decision: 'APPROVE',
          rationale: 'Refactor plan looks solid.',
          timestamp: new Date().toISOString(),
        },
        {
          consul: 'Consul II',
          decision: 'APPROVE',
          rationale: 'Database indexes verified.',
          timestamp: new Date().toISOString(),
        },
      ];

      const reviewed = await courierGateway.reviewPetition(petition.petition_id, reviewVotes);
      expect(reviewed.status).toBe('SEALED');
      expect(reviewed.consular_seal?.approved_by).toEqual(['Consul I', 'Consul II']);
    });
  });

  describe('3. File Drop Courier Support', () => {
    it('processes dropped inbox petition file and writes sealed deliverable to outbox', async () => {
      const inboxFile = path.join(sandbox.swarmDir, 'courier', 'inbox', 'petition_bot_01.json');
      const payload = {
        external_agent: 'openclaw',
        task_description: 'Automated file drop security audit',
        context: { source: 'local_file_drop' },
      };
      await fs.writeFile(inboxFile, JSON.stringify(payload, null, 2), 'utf8');

      const processed = await courierGateway.processFileDrop('petition_bot_01.json');
      expect(processed).not.toBeNull();
      expect(processed?.status).toBe('SEALED');

      // Verify inbox file was cleaned up
      const inboxExists = await fs.access(inboxFile).then(() => true).catch(() => false);
      expect(inboxExists).toBe(false);

      // Verify outbox file contains sealed result
      const outboxFile = path.join(sandbox.swarmDir, 'courier', 'outbox', 'petition_bot_01.json');
      const outboxRaw = await fs.readFile(outboxFile, 'utf8');
      const outboxData = JSON.parse(outboxRaw);

      expect(outboxData.status).toBe('SEALED');
      expect(outboxData.sealed_deliverable.consular_seal).toBe('RATIFIED_BY_TWIN_CONSULS');
    });
  });
});
