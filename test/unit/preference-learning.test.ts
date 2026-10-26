import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { PreferenceEngine, PreferenceEntry } from '../../src/server/preference-engine';

describe('Self-Learning Preference Repository Unit Tests ("Never Explain Twice")', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let preferenceEngine: PreferenceEngine;

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_pref');
    preferenceEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
    await preferenceEngine.initialize();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  describe('1. Continuous Extraction Pipeline', () => {
    it('extracts testing rule from imperative statement', () => {
      const extracted = preferenceEngine.extractPreferences(
        'From now on, always use vitest for unit tests in all packages.'
      );
      expect(extracted).toHaveLength(1);
      const pref = extracted[0];
      expect(pref.category).toBe('testing');
      expect(pref.confidence).toBeGreaterThanOrEqual(0.85);
      expect(pref.rule).toContain('always use vitest');
      expect(pref.trigger_patterns).toContain('test/**');
    });

    it('extracts safety rule for secrets and credentials', () => {
      const extracted = preferenceEngine.extractPreferences(
        'Never commit .env files or hardcode API keys and tokens.'
      );
      expect(extracted).toHaveLength(1);
      const pref = extracted[0];
      expect(pref.category).toBe('safety');
      expect(pref.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('extracts workflow rule for git operations', () => {
      const extracted = preferenceEngine.extractPreferences(
        'Must create isolated git branch before starting any feature work.'
      );
      expect(extracted).toHaveLength(1);
      const pref = extracted[0];
      expect(pref.category).toBe('workflow');
    });
  });

  describe('2. Persistence, Backup Rotation & Corruption Recovery', () => {
    it('saves preference atomically and creates backup file', async () => {
      const pref: Omit<PreferenceEntry, 'id' | 'created_at' | 'updated_at' | 'hit_count'> = {
        category: 'coding_style',
        key: 'prefer_typescript_strict',
        rule: 'Always enable strict type checking in tsconfig.',
        trigger_patterns: ['tsconfig.json', '**/*.ts'],
        confidence: 0.95,
        enabled: true,
        applies_to: 'all_cubicles',
      };

      const saved = await preferenceEngine.savePreference(pref);
      expect(saved.id).toBeDefined();
      expect(saved.hit_count).toBe(1);

      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      const bakPath = path.join(sandbox.swarmDir, 'memory', '.preferences.json.bak');

      const raw = await fs.readFile(dbPath, 'utf8');
      expect(raw).toContain('prefer_typescript_strict');

      // Second write creates backup
      await preferenceEngine.savePreference({
        ...pref,
        key: 'prefer_esm_modules',
        rule: 'Always use ES modules in package.json.',
      });

      const bakExists = await fs.access(bakPath).then(() => true).catch(() => false);
      expect(bakExists).toBe(true);
    });

    it('recovers cleanly from backup when primary preferences.json has syntax corruption', async () => {
      // 1. Save valid initial state
      await preferenceEngine.savePreference({
        category: 'workflow',
        key: 'atomic_commits',
        rule: 'Make atomic single-responsibility commits.',
        trigger_patterns: [],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });
      // Second save to rotate backup
      await preferenceEngine.savePreference({
        category: 'testing',
        key: 'assert_truthy',
        rule: 'Always assert truthy values explicitly.',
        trigger_patterns: [],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });

      // 2. Corrupt primary file
      const dbPath = path.join(sandbox.swarmDir, 'memory', 'preferences.json');
      await fs.writeFile(dbPath, '{{{CORRUPTED_SYNTAX_ERROR:::', 'utf8');

      // 3. New engine instance initializing should recover from backup
      const newEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
      await newEngine.initialize();

      const prefs = newEngine.getPreferences();
      expect(prefs.length).toBeGreaterThanOrEqual(1);
      expect(prefs.some((p) => p.key === 'atomic_commits')).toBe(true);
    });
  });

  describe('3. Semantic Deduplication', () => {
    it('updates existing rule and increments hit_count without duplicate keys', async () => {
      const initial = await preferenceEngine.savePreference({
        category: 'testing',
        key: 'test_framework',
        rule: 'Use Jest for testing.',
        trigger_patterns: ['test/**'],
        confidence: 0.8,
        enabled: true,
        applies_to: 'all',
      });

      expect(initial.hit_count).toBe(1);
      expect(preferenceEngine.getPreferences()).toHaveLength(1);

      // User updates directive: switch to Vitest
      const updated = await preferenceEngine.savePreference({
        category: 'testing',
        key: 'test_framework',
        rule: 'Use Vitest instead of Jest for all testing.',
        trigger_patterns: ['test/**'],
        confidence: 0.95,
        enabled: true,
        applies_to: 'all',
      });

      expect(updated.id).toBe(initial.id);
      expect(updated.hit_count).toBe(2);
      expect(updated.rule).toContain('Use Vitest instead of Jest');
      expect(preferenceEngine.getPreferences()).toHaveLength(1); // No duplicate!
    });
  });

  describe('4. Canonical USER_PREFERENCES.md Markdown Compilation', () => {
    it('compiles rules into categorized markdown file in .agents/rules/', async () => {
      await preferenceEngine.savePreference({
        category: 'coding_style',
        key: 'use_early_return',
        rule: 'Prefer early returns over deep nesting.',
        trigger_patterns: ['**/*.ts'],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });

      await preferenceEngine.savePreference({
        category: 'testing',
        key: 'colocate_tests',
        rule: 'Colocate unit tests alongside source files.',
        trigger_patterns: ['test/**'],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });

      const mdPath = path.join(sandbox.agentsDir, 'rules', 'USER_PREFERENCES.md');
      const md = await fs.readFile(mdPath, 'utf8');

      expect(md).toContain('<!-- AUTO-GENERATED BY OVERSEER PREFERENCE ENGINE');
      expect(md).toContain('# User Preferences & Project Constraints ("Never Explain Twice")');
      expect(md).toContain('## 1. Coding Style & Quality');
      expect(md).toContain('- **[use_early_return]**: Prefer early returns over deep nesting.');
      expect(md).toContain('## 2. Testing & Verification');
      expect(md).toContain('- **[colocate_tests]**: Colocate unit tests alongside source files.');
    });
  });

  describe('5. LLM Prompt Injection', () => {
    it('formats active preferences as XML block for worker system prompts', async () => {
      await preferenceEngine.savePreference({
        category: 'safety',
        key: 'no_eval',
        rule: 'Never use eval() or Function constructor.',
        trigger_patterns: ['**/*.js', '**/*.ts'],
        confidence: 0.99,
        enabled: true,
        applies_to: 'all',
      });

      const xml = preferenceEngine.injectLearnedPreferences({
        filesTouched: ['src/server/eval-service.ts'],
      });

      expect(xml).toContain('<user_learned_preferences>');
      expect(xml).toContain('- [no_eval]: Never use eval() or Function constructor.');
      expect(xml).toContain('</user_learned_preferences>');
    });
  });
});
