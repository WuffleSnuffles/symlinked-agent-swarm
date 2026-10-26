import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { CubicleManager } from './cubicle-manager.js';

export interface CubicleMessage {
  id: string; from: string; to: string; topic: string; text: string; created_at: string;
}

// One atomic file per message: concurrent senders cannot overwrite one another.
export class CubicleMessages {
  constructor(private directory: string) {}
  async send(input: Omit<CubicleMessage, 'id' | 'created_at'>): Promise<CubicleMessage> {
    if (![input.from, input.to].every(id => /^cubicle-\d{2}$/.test(id)) || input.from === input.to)
      throw new Error('Specify two different cubicle addresses');
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 8000)
      throw new Error('Message must contain 1–8000 characters');
    if (typeof input.topic !== 'string' || !input.topic.trim() || input.topic.length > 120)
      throw new Error('A topic of 1–120 characters is required');
    const message = { ...input, id: randomUUID(), created_at: new Date().toISOString() };
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, message.id + '.json');
    await fs.writeFile(target + '.tmp', JSON.stringify(message), { flag: 'wx' });
    await fs.rename(target + '.tmp', target);
    return message;
  }
  async history(cubicle?: string): Promise<CubicleMessage[]> {
    await fs.mkdir(this.directory, { recursive: true });
    const files = await fs.readdir(this.directory);
    const messages = await Promise.all(files.filter(f => f.endsWith('.json')).map(async f =>
      JSON.parse(await fs.readFile(path.join(this.directory, f), 'utf8')) as CubicleMessage));
    return messages.filter(m => !cubicle || m.to === cubicle || m.from === cubicle)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }
}

export function createCubicleMessageRouter(directory: string, cubicles: CubicleManager,
  broadcast: (type: string, payload: any) => void) {
  const router = Router();
  const mailbox = new CubicleMessages(directory);
  router.get('/messages', async (req, res) => {
    try {
      const cubicle = typeof req.query.cubicle === 'string' ? req.query.cubicle : undefined;
      if (cubicle) cubicles.getCubicle(cubicle);
      res.json({ messages: await mailbox.history(cubicle) });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  });
  router.post('/messages', async (req, res) => {
    try {
      const { from, to, topic, text } = req.body;
      for (const id of [from, to]) {
        if (!cubicles.getCubicle(id).config.enabled) throw new Error('Cubicle is disabled');
      }
      const message = await mailbox.send({ from, to, topic, text });
      broadcast('CUBICLE_MESSAGE', { message });
      res.status(201).json({ message, delivery: 'stored' });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  });
  return router;
}
