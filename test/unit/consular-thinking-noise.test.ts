import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawn } from 'node:child_process';
import { ConsularEngine } from '../../src/server/consular-engine.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const noise = [
  '25,841', '310', ' +12.5% : - ', 'tokens used', 'tokens used: 25,841',
  'Total tokens: 310', 'input_tokens: 310', '310 tokens',
  '{"type":"turn.completed","usage":{"input_tokens":310}}',
  '[{"type":"item.completed"}]', '{', '}', '[', '],', '"type": "item.started",',
  'OpenAI Codex v1.0', '--------', 'workdir: C:\\swarm', 'model: gpt-6-astra',
  'reasoning effort: medium', 'session id: abc', 'mcp: browser ready',
  'exec', 'thinking', 'codex', 'user', '```json', 'succeeded in 50ms:',
  '\x1b[32m25,841\x1b[0m', '[DELIBERATE: "310"]',
  '[DELIBERATE: "tokens used: 310"]',
  'Respond directly to the Overseer in 1 to 3 sharp sentences as Consul Ferric Lunaux (or output [PASS] if only Nia was addressed and you have nothing unique to add).',
];
const thought = 'Review 310 tasks; 25,841 tokens were used in the previous run.';

afterEach(() => vi.restoreAllMocks());

describe('Consular CLI thinking stream', () => {
  for (const consul of ['nia', 'ferric'] as const) {
    for (const callbackMode of [true, false]) {
      it(`${consul} filters noise in ${callbackMode ? 'callback' : 'event'} mode`, async () => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(), stderr: new EventEmitter(),
          stdin: { write: vi.fn(), end: vi.fn() }, kill: vi.fn(),
        });
        vi.mocked(spawn).mockReturnValue(child as any);
        let now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now += 500);
        const engine = new ConsularEngine('.', {} as any, {} as any, {} as any);
        const snippets: string[] = [];
        engine.onEvent((type, payload) => {
          if (type === 'CONSULAR_THINKING') snippets.push(payload.text);
        });
        const result = engine.invokeConsulCli(consul, 'Review', 5000,
          callbackMode ? (snippet) => snippets.push(snippet) : undefined);
        try {
          // Separate chunks reproduce the Codex footer label/count boundary.
          for (const line of noise) child.stderr.emit('data', Buffer.from(line + '\n'));
          expect(snippets).toEqual([]);
          child.stdout.emit('data', Buffer.from(`[DELIBERATE: "${thought}"]\ntokens used\n25,841\n`));
          expect(snippets).toEqual([thought]);
        } finally {
          child.emit('close', 0);
          await result;
        }
      });
    }
  }
});

for (const file of ['src/public/js/overseer-console.js', 'public/js/overseer-console.js']) {
  describe(file, () => {
    // Evaluate the real controller without loading unrelated browser singletons.
    const source = readFileSync(file, 'utf8')
      .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    function controller() {
      const document = { createElement: () => ({
        dataset: {}, style: {}, appendChild: vi.fn(), textContent: '',
      }) };
      const Controller = runInNewContext(source + '\nOverseerConsoleController;', { document });
      return Object.assign(Object.create(Controller.prototype), {
        dialogueFeed: {}, deliberationPanel: {},
        deliberationFeed: { querySelector: () => null, appendChild: vi.fn(), children: [] },
        lastLiveThinkingTimestamp: 123,
      });
    }

    it.each(noise)('rejects raw and speaker-prefixed noise: %s', (line) => {
      const ui = controller();
      for (const prefix of ['', 'Nia → Ferric: ', 'Ferric -> Nia: ', 'Nia: ']) {
        ui.appendDeliberation(prefix + line);
      }
      ui.handleConsularThinking({ consul: 'ferric', text: line });
      expect(ui.deliberationFeed.appendChild).not.toHaveBeenCalled();
      expect(ui.lastLiveThinkingTimestamp).toBe(123);
    });

    it('preserves readable text and removes a multiline token footer', () => {
      const ui = controller();
      ui.handleConsularThinking({ consul: 'nia', text: `${thought}\ntokens used\n25,841` });
      const entry = ui.deliberationFeed.appendChild.mock.calls[0][0];
      expect(entry.dataset.rawText).toBe(`Nia → Ferric: ${thought}`);
      expect(ui.lastLiveThinkingTimestamp).toBeGreaterThan(123);
      ui.appendDeliberation(`Ferric -> Nia: ${thought}\n{"type":"turn.completed"}`);
      expect(ui.deliberationFeed.appendChild.mock.calls[1][0].dataset.rawText)
        .toBe(`Ferric -> Nia: ${thought}`);
    });

    it('builds descriptive Nia vs Ferric debate summaries for the grey prompt indicator', () => {
      const ui = controller();
      const summary = ui.buildDescriptiveDebateSummary(
        'remove the debate chamber underneath your avatars',
        'remove the avatar deliberation panel and keep the inline prompt debate summary',
        'preserving existing console unit tests while updating the snippet text',
        0
      );
      expect(summary).toContain('Nia wants');
      expect(summary).toContain('Ferric is concerned about');
      expect(summary).toContain('Nia is trying to convince Ferric');
      expect(summary.split('\n')).toHaveLength(2);
    });
  });
}
