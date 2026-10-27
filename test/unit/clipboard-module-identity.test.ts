import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('console shared module identity', () => {
  const app = readFileSync('src/public/js/app.js', 'utf8');
  const consoleSource = readFileSync('src/public/js/overseer-console.js', 'utf8');
  for (const module of ['prompt-attachment', 'media-renderer', 'consular-avatars']) {
    it(`uses the same ${module} singleton when initializing and sending`, () => {
      const specifier = new RegExp(`from ['"]([^'"]*/${module}\\.js[^'"]*)['"]`);
      const initialized = app.match(specifier)?.[1];
      expect(initialized).toBeTruthy();
      expect(consoleSource.match(specifier)?.[1]).toBe(initialized);
    });
  }
});
