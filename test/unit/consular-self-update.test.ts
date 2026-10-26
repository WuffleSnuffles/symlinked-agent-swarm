import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox, createPeTestBuffer } from '../e2e/helpers';
import { ConsularEngine } from '../../src/server/consular-engine';
import { CubicleManager } from '../../src/server/cubicle-manager';
import { TaskboardManager } from '../../src/server/taskboard-manager';
import { CapabilityMatrix } from '../../src/server/capability-matrix';
import { ConsularVote } from '../../src/server/types/governance';

describe('Consular-Gated Self-Update & Windows Atomic Binary Swap Unit Tests', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let consularEngine: ConsularEngine;

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_self_update');
    const cubicleManager = new CubicleManager(sandbox.swarmDir);
    const taskboardManager = new TaskboardManager(sandbox.swarmDir);
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
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  it('initiates self-update request in PENDING_REVIEW status', async () => {
    const request = await consularEngine.initiateSelfUpdate('Implement real-time courier gateway');
    expect(request.request_id).toBeDefined();
    expect(request.status).toBe('PENDING_REVIEW');
    expect(request.user_prompt).toBe('Implement real-time courier gateway');

    const status = await consularEngine.getSelfUpdateStatus(request.request_id);
    expect(status.status).toBe('PENDING_REVIEW');
  });

  it('blocks self-update and prevents binary rebuild when Consular Veto is cast (1/2)', async () => {
    const request = await consularEngine.initiateSelfUpdate('Upgrade core dependencies');

    const votes: [ConsularVote, ConsularVote] = [
      {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Dependencies look compatible.',
        timestamp: new Date().toISOString(),
      },
      {
        consul: 'Consul II',
        decision: 'VETO',
        rationale: 'INTERCESSIO VETO: Node 22 breaking changes will destabilize native bindings.',
        timestamp: new Date().toISOString(),
      },
    ];

    const result = await consularEngine.reviewSelfUpdate(request.request_id, votes);
    expect(result.status).toBe('VETOED');

    const status = await consularEngine.getSelfUpdateStatus(request.request_id);
    expect(status.status).toBe('VETOED');

    // Ensure no binary swap took place
    const rootExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.exe');
    const exeExists = await fs.access(rootExe).then(() => true).catch(() => false);
    expect(exeExists).toBe(false);

    // Verify incident logged
    const incidents = await fs.readFile(path.join(sandbox.swarmDir, 'logs', 'incidents.jsonl'), 'utf8');
    expect(incidents).toContain('SELF_UPDATE_VETO_BLOCKED');
  });

  it('authorizes self-update upon 2/2 Consular Approval and executes Windows safe atomic binary swap', async () => {
    // 1. Stage existing running SymlinkedAgentSwarm.exe
    const rootExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.exe');
    const oldExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.old.exe');
    const newExe = path.join(sandbox.sandboxDir, 'SymlinkedAgentSwarm.new.exe');

    await fs.writeFile(rootExe, createPeTestBuffer('RUNNING_BINARY_V1.0.0'));
    await fs.writeFile(newExe, createPeTestBuffer('COMPILED_UPDATED_BINARY_V1.0.1'));

    // 2. Initiate self-update
    const request = await consularEngine.initiateSelfUpdate('Add twin Sauron spotlight raycasting');

    // 3. Both Consuls approve (2/2)
    const votes: [ConsularVote, ConsularVote] = [
      {
        consul: 'Consul I',
        decision: 'APPROVE',
        rationale: 'Full test pass and high performance verified.',
        timestamp: new Date().toISOString(),
      },
      {
        consul: 'Consul II',
        decision: 'APPROVE',
        rationale: 'Zero type errors or security regressions.',
        timestamp: new Date().toISOString(),
      },
    ];

    let eventFired = false;
    consularEngine.onEvent((type) => {
      if (type === 'SELF_UPDATE_READY') eventFired = true;
    });

    const result = await consularEngine.reviewSelfUpdate(request.request_id, votes);

    expect(result.status).toBe('SWAP_COMPLETED');
    expect(result.version_after).toBe('1.0.1');
    expect(eventFired).toBe(true);

    // 4. Verify Windows-safe atomic swap sequence:
    // rootExe must now contain the updated binary
    const updatedContent = await fs.readFile(rootExe, 'utf8');
    expect(updatedContent).toContain('COMPILED_UPDATED_BINARY_V1.0.1');

    // oldExe must contain the previous running binary
    const backupContent = await fs.readFile(oldExe, 'utf8');
    expect(backupContent).toContain('RUNNING_BINARY_V1.0.0');

    // newExe must have been atomically moved
    const newExeExists = await fs.access(newExe).then(() => true).catch(() => false);
    expect(newExeExists).toBe(false);
  });
});
