import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { PreferenceEngine } from '../../src/server/preference-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';

describe('live preference and Consul evolution', () => {
  let root: string;
  let board: TaskboardManager;
  let engine: ConsularEngine;
  let preferences: PreferenceEngine;
  let previousVitest: string | undefined;

  beforeEach(async () => {
    previousVitest = process.env.VITEST;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'live-evolution-'));
    const swarm = path.join(root, '.swarm');
    const cubicles = new CubicleManager(swarm);
    board = new TaskboardManager(swarm);
    await cubicles.initialize();
    await board.initialize();
    engine = new ConsularEngine(swarm, cubicles, board, new CapabilityMatrix(), undefined, root);
    await engine.initialize();
    preferences = new PreferenceEngine(swarm, path.join(root, '.agents'));
    await preferences.initialize();
    engine.setPreferenceEngine(preferences);
  });

  afterEach(async () => {
    if (previousVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = previousVitest;
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function readGrowth(name: string) {
    return JSON.parse(await fs.readFile(path.join(root, '.swarm', 'memory', `${name}_growth.json`), 'utf8'));
  }

  it('persists chat directives with provenance and injects current preferences and growth into both Consuls', async () => {
    const invoke = vi.spyOn(engine, 'invokeConsulCli').mockResolvedValue('[PASS]');
    await engine.chatWithConsuls('Always use vitest for tests');
    const db = JSON.parse(await fs.readFile(path.join(root, '.swarm/memory/preferences.json'), 'utf8'));
    expect(db.preferences).toHaveLength(1);
    expect(db.preferences[0].source_message_id).toBe(engine.getDialogue().find(m => m.sender === 'Overseer')?.id);
    expect(await fs.readFile(path.join(root, '.agents/rules/USER_PREFERENCES.md'), 'utf8')).toContain('Always use vitest');
    expect((await readGrowth('nia')).total_artistic_rules_championed).toBe(1);
    expect((await readGrowth('ferric')).efficiency_heuristics).toContain('Learned preference: Always use vitest for tests');
    expect(invoke).toHaveBeenCalledTimes(2);
    for (const [, prompt] of invoke.mock.calls) {
      expect(prompt).toContain('<user_learned_preferences>');
      expect(prompt).toContain('<consul_growth>');
      expect(prompt).toContain('Learned preference: Always use vitest for tests');
    }
  });

  it('ignores ordinary text, deduplicates repeated directives, and detaches replaced listeners', async () => {
    expect(await preferences.ingestText('Hello there', 'plain')).toEqual([]);
    engine.setPreferenceEngine(preferences);
    await preferences.ingestText('Never commit secrets', 'first');
    await preferences.ingestText('Never commit secrets', 'second');
    expect(preferences.getPreferences()).toHaveLength(1);
    expect(preferences.getPreferences()[0]).toMatchObject({ hit_count: 2, source_message_id: 'second' });
    expect((await readGrowth('nia')).total_artistic_rules_championed).toBe(1);
    expect((await readGrowth('ferric')).cubicle_performance).toEqual({});
  });

  it('evolves on task creation and dispatch before any review, preserving concurrent disk updates', async () => {
    const tasks = await Promise.all(['First task', 'Second task'].map(title => board.createTask({ title, description: title, priority: 'HIGH' })));
    await engine.dispatchTaskToCubicle(tasks[0].id, 'cubicle-01');
    const nia = await readGrowth('nia');
    const ferric = await readGrowth('ferric');
    for (const task of tasks) {
      expect(nia.advocated_goals).toContain(`Task created: ${task.title}`);
      expect(ferric.efficiency_heuristics).toContain(`Task created: ${task.title}`);
    }
    expect(nia.advocated_goals).toContain('Task dispatched to cubicle-01: First task');
    expect(ferric.cubicle_performance['cubicle-01'].tasks_completed).toBe(0);
  });

  it.each(['success', 'timeout', 'exception'])('evolves on worker %s and injects learned context without granting approval', async outcome => {
    await preferences.ingestText('Always use vitest for tests', 'source');
    const task = await board.createTask({ title: `Worker ${outcome}`, description: 'Exercise execution', priority: 'HIGH' });
    const invoke = vi.spyOn(engine, 'invokeConsulCli');
    if (outcome === 'exception') invoke.mockRejectedValue(new Error('spawn failed'));
    else invoke.mockResolvedValue(outcome === 'success' ? 'Implemented changes and verified tests.' : '[Nia Nova // CLI Timeout after 1200s]: stalled');
    const settled = new Promise<void>(resolve => engine.onEvent((type, payload) => {
      if (type === 'TASK_UPDATED' && payload.task?.id === task.id &&
          (payload.task.column === 'review' || payload.task.column === 'todo')) resolve();
    }));
    delete process.env.VITEST;
    await engine.dispatchTaskToCubicle(task.id, 'cubicle-01');
    await settled;
    const prompt = invoke.mock.calls[0][1];
    expect(prompt).toContain('<user_learned_preferences>');
    expect(prompt).toContain('<consul_growth>');
    expect(prompt).toContain(`Task dispatched to cubicle-01: Worker ${outcome}`);
    const event = outcome === 'success' ? `Worker execution completed; awaiting review: ${task.title}` : `Worker execution failed: ${task.title}`;
    expect((await readGrowth('nia')).advocated_goals).toContain(event);
    const ferric = await readGrowth('ferric');
    expect(ferric.efficiency_heuristics).toContain(event);
    expect(ferric.cubicle_performance['cubicle-01']).toEqual({ tasks_completed: 0, bugs_caught: 0 });
    expect((await board.listAllTasks()).done).toHaveLength(0);
  });
});
