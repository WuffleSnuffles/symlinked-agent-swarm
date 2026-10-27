import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConsularEngine } from '../../src/server/consular-engine.js';
import { CubicleManager } from '../../src/server/cubicle-manager.js';
import { TaskboardManager } from '../../src/server/taskboard-manager.js';
import { CapabilityMatrix } from '../../src/server/capability-matrix.js';
import express from 'express';
import { createGovernanceRouter } from '../../src/server/routes/governance-routes.js';

let root: string, engine: ConsularEngine;
const makeEngine = () => new ConsularEngine(root, new CubicleManager(root), new TaskboardManager(root), new CapabilityMatrix());
const question = (asking_consul = 'Ferric') => engine.createQuestion({ asking_consul, prompt: 'Choose a direction', context: 'Task original-context', options: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }] });
const settled = async (id: string) => vi.waitFor(() => expect(['COMPLETED', 'FAILED']).toContain(engine.getQuestion(id)?.resume_status));
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'consular-questions-'));
  engine = makeEngine(); await engine.initialize();
  vi.spyOn(engine, 'invokeConsulCli').mockResolvedValue('Resumed with the answer.');
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

it('routes the question ID, answer and saved context only to its origin', async () => {
  const q = await question();
  await engine.answerQuestion(q.question_id, { selected_option_ids: ['a'] });
  await settled(q.question_id);
  expect(engine.invokeConsulCli).toHaveBeenCalledTimes(1);
  expect(engine.invokeConsulCli).toHaveBeenCalledWith('ferric', expect.stringContaining(q.question_id));
  const prompt = vi.mocked(engine.invokeConsulCli).mock.calls[0][1];
  expect(prompt).toContain('Task original-context'); expect(prompt).toContain('a: First');
});
it('serializes concurrent answers and rejects double submission without a second continuation', async () => {
  const [a, b] = await Promise.all([question('Nia'), question()]);
  const result = await Promise.allSettled([engine.answerQuestion(a.question_id, { custom_write_in: 'Custom' }), engine.answerQuestion(a.question_id, { selected_option_ids: ['b'] }), engine.answerQuestion(b.question_id, { selected_option_ids: ['b'] })]);
  expect(result.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  await settled(a.question_id); await settled(b.question_id);
  expect(engine.invokeConsulCli).toHaveBeenCalledTimes(2);
  const restored = makeEngine(); await restored.initialize();
  expect(restored.getQuestions().map(q => q.status)).toEqual(['ANSWERED', 'ANSWERED']);
  await expect(restored.answerQuestion(a.question_id, { custom_write_in: 'again' })).rejects.toThrow('already answered');
});
it('rejects invalid, empty and conflicting answers without changing pending state', async () => {
  const q = await question();
  for (const answer of [{}, { selected_option_ids: ['unknown'] }, { selected_option_ids: ['a', 'b'] }])
    await expect(engine.answerQuestion(q.question_id, answer)).rejects.toThrow();
  expect(engine.getQuestion(q.question_id)?.status).toBe('PENDING');
  expect(engine.invokeConsulCli).not.toHaveBeenCalled();
});
it('honors disabled custom input and supports multi-select', async () => {
  const q = await engine.createQuestion({ asking_consul: 'Nia', prompt: 'Several', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], is_multi_select: true, allow_custom_write_in: false });
  await expect(engine.answerQuestion(q.question_id, { custom_write_in: 'No' })).rejects.toThrow();
  await engine.answerQuestion(q.question_id, { selected_option_ids: ['a', 'b'] }); await settled(q.question_id);
});
it('keeps an accepted answer after continuation failure without claiming completion', async () => {
  vi.mocked(engine.invokeConsulCli).mockResolvedValue('[Ferric Lunaux]: My CLI execution timed out after 600s');
  const q = await question(); await engine.answerQuestion(q.question_id, { custom_write_in: 'Keep it' }); await settled(q.question_id);
  expect(engine.getQuestion(q.question_id)).toMatchObject({ status: 'ANSWERED', resume_status: 'FAILED', user_response: { custom_write_in: 'Keep it' } });
});
it('preserves pending questions across restart and rejects malformed origins/options', async () => {
  const q = await question(); const restored = makeEngine(); await restored.initialize();
  expect(restored.getQuestion(q.question_id)).toEqual(q);
  await expect(question('Someone')).rejects.toThrow();
  await expect(engine.createQuestion({ prompt: 'Bad', options: [{ id: 'x', label: 'A' }, { id: 'x', label: 'B' }] })).rejects.toThrow();
});

it('serves persisted questions and protects duplicate HTTP submissions', async () => {
  const app = express(); app.use(express.json());
  app.use('/api', createGovernanceRouter(engine, {} as any, {} as any, {} as any));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/governance/questions`;
  try {
    const created = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asking_consul: 'Ferric', prompt: 'API question', options: [] }) });
    expect(created.status).toBe(201); const { question: q } = await created.json();
    const submit = () => fetch(`${base}/${q.question_id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_write_in: 'API answer' }) });
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    await settled(q.question_id);
    const listed = await (await fetch(base)).json();
    expect(listed.questions[0]).toMatchObject({ status: 'ANSWERED', user_response: { custom_write_in: 'API answer' } });
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

it('does not acknowledge or resume an answer when durable persistence fails', async () => {
  const q = await question();
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(engine.answerQuestion(q.question_id, { custom_write_in: 'Retry' })).rejects.toThrow('disk unavailable');
  expect(engine.getQuestion(q.question_id)?.status).toBe('PENDING');
  expect(engine.invokeConsulCli).not.toHaveBeenCalled();
  await engine.answerQuestion(q.question_id, { custom_write_in: 'Retry' }); await settled(q.question_id);
});
