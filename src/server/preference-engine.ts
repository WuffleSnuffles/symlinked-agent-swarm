/**
 * src/server/preference-engine.ts
 *
 * Self-Learning Preference Repository & Rule Compiler ("Never Explain Twice").
 * Continuously extracts structured preferences from user directives, persists them to
 * .swarm/memory/preferences.json, compiles them to .agents/rules/USER_PREFERENCES.md,
 * and injects them into LLM system prompts.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type PreferenceCategory =
  | 'coding_style'
  | 'workflow'
  | 'testing'
  | 'safety'
  | 'architecture';

export interface PreferenceEntry {
  id: string;
  category: PreferenceCategory;
  key: string;
  rule: string;
  trigger_patterns: string[];
  confidence: number;
  source_message_id?: string;
  created_at: string;
  updated_at: string;
  hit_count: number;
  enabled: boolean;
  applies_to: string;
}

export interface PreferencesDatabase {
  version: string;
  last_updated: string;
  total_preferences: number;
  preferences: PreferenceEntry[];
}

export type PreferenceEventCallback = (type: string, payload: any) => void | Promise<void>;

export class PreferenceEngine {
  private swarmDir: string;
  private agentsDir: string;
  private dbPath: string;
  private bakPath: string;
  private markdownPath: string;
  private db: PreferencesDatabase;
  private eventListeners: Set<PreferenceEventCallback> = new Set();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(swarmDir: string, agentsDir: string) {
    this.swarmDir = path.resolve(swarmDir);
    this.agentsDir = path.resolve(agentsDir);
    this.dbPath = path.join(this.swarmDir, 'memory', 'preferences.json');
    this.bakPath = path.join(this.swarmDir, 'memory', '.preferences.json.bak');
    this.markdownPath = path.join(this.agentsDir, 'rules', 'USER_PREFERENCES.md');
    this.db = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      total_preferences: 0,
      preferences: [],
    };
  }

  public onEvent(callback: PreferenceEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  private async emit(type: string, payload: any): Promise<void> {
    for (const listener of this.eventListeners) {
      try {
        await listener(type, payload);
      } catch (err) {
        console.error(`[PreferenceEngine] Event callback error for ${type}:`, err);
      }
    }
  }

  /**
   * Initializes the preference database, loading from disk with syntax corruption recovery.
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    await fs.mkdir(path.dirname(this.markdownPath), { recursive: true });

    let loaded = false;

    // 1. Attempt primary load
    if (existsSync(this.dbPath)) {
      try {
        const raw = await fs.readFile(this.dbPath, 'utf8');
        this.db = JSON.parse(raw);
        loaded = true;
      } catch (err) {
        console.warn(`[PreferenceEngine] Primary preferences.json corrupted. Attempting backup recovery...`);
      }
    }

    // 2. Fallback to backup on corruption
    if (!loaded && existsSync(this.bakPath)) {
      try {
        const raw = await fs.readFile(this.bakPath, 'utf8');
        this.db = JSON.parse(raw);
        loaded = true;
        // Restore backup to primary
        await this.atomicWriteDb();
      } catch (err) {
        console.warn(`[PreferenceEngine] Backup corrupted or unreadable. Initializing clean database.`);
      }
    }

    // 3. Fallback to default
    if (!loaded) {
      this.db = {
        version: '1.0.0',
        last_updated: new Date().toISOString(),
        total_preferences: 0,
        preferences: [],
      };
      await this.atomicWriteDb();
    }

    // Compile markdown on startup
    await this.compileMarkdown();
  }

  public getDatabase(): PreferencesDatabase {
    return this.db;
  }

  public async ingestText(message: string, sourceMessageId?: string): Promise<PreferenceEntry[]> {
    const saved: PreferenceEntry[] = [];
    for (const preference of this.extractPreferences(message, sourceMessageId)) {
      saved.push(await this.savePreference(preference));
    }
    return saved;
  }

  public getPreferences(): PreferenceEntry[] {
    return this.db.preferences;
  }

  public getPreference(idOrKey: string): PreferenceEntry | undefined {
    return this.db.preferences.find((p) => p.id === idOrKey || p.key === idOrKey);
  }

  /**
   * Continuous Extraction Pipeline:
   * Regex fast-path extraction of user imperatives into structured rules.
   */
  public extractPreferences(message: string, sourceMessageId?: string): PreferenceEntry[] {
    const extracted: PreferenceEntry[] = [];
    const text = message.trim();

    // Fast-path imperative patterns:
    // e.g., "always use vitest", "never commit secrets", "prefer pnpm over npm", "must ensure typescript strict mode"
    const regexes = [
      /(?:always|must|ensure|strictly|from now on)\s+(?:use|write|follow|apply|maintain)\s+([^\n.,;]+)/gi,
      /(?:never|do not|don't|prohibit)\s+([^\n.,;]+)/gi,
      /(?:prefer)\s+([^\n.,;]+)/gi,
    ];

    const lower = text.toLowerCase();
    let matchedRule: string | null = null;
    let category: PreferenceCategory = 'coding_style';
    let key = '';
    let triggerPatterns: string[] = [];
    let confidence = 0.85;

    // Detect category (safety checked first so "never commit secrets" or "never log API keys" classifies as safety)
    if (/secret|security|token|api_key|api\s*key|credential|password|vulnerability|leak|acl|eval/i.test(lower)) {
      category = 'safety';
      triggerPatterns = ['**/*.env*', 'secrets/**'];
    } else if (/test|vitest|jest|spec|coverage|assert|mock/i.test(lower)) {
      category = 'testing';
      triggerPatterns = ['test/**', '**/*.test.ts', '**/*.spec.ts'];
    } else if (/git|branch|commit|rebase|merge|worktree|taskboard/i.test(lower)) {
      category = 'workflow';
      triggerPatterns = ['.git/**', '.swarm/tasks/**'];
    } else if (/architecture|module|component|decoupling|junction|mcp|circular\s+dependenc/i.test(lower)) {
      category = 'architecture';
      triggerPatterns = ['src/**'];
    } else {
      category = 'coding_style';
      triggerPatterns = ['src/**/*.ts', 'src/**/*.js'];
    }

    // Extract rule text
    for (const rx of regexes) {
      const match = rx.exec(text);
      if (match && match[0]) {
        matchedRule = text;
        break;
      }
    }

    if (!matchedRule && /(?:always|never|must|prefer|ensure)/i.test(text)) {
      matchedRule = text;
    }

    if (matchedRule) {
      // Derive key
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => !['the', 'a', 'an', 'is', 'in', 'on', 'for', 'to', 'of'].includes(w))
        .slice(0, 4);

      key = words.join('_');
      if (!key) key = `pref_${Date.now().toString(36)}`;

      const entry: PreferenceEntry = {
        id: `pref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        category,
        key,
        rule: text,
        trigger_patterns: triggerPatterns,
        confidence: /always|never|must/i.test(text) ? 0.95 : 0.85,
        source_message_id: sourceMessageId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        hit_count: 1,
        enabled: true,
        applies_to: 'all_cubicles',
      };
      extracted.push(entry);
    }

    return extracted;
  }

  /**
   * Persists a preference entry with semantic deduplication on key match.
   */
  public async savePreference(
    pref: Omit<PreferenceEntry, 'id' | 'created_at' | 'updated_at' | 'hit_count'> & {
      id?: string;
      hit_count?: number;
    }
  ): Promise<PreferenceEntry> {
    const existingIndex = this.db.preferences.findIndex((p) => p.key === pref.key);
    let result: PreferenceEntry;

    if (existingIndex >= 0) {
      // Update existing entry (Deduplication)
      const existing = this.db.preferences[existingIndex];
      result = {
        ...existing,
        ...pref,
        id: existing.id,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
        hit_count: (existing.hit_count || 1) + 1,
      };
      this.db.preferences[existingIndex] = result;
    } else {
      // Create new entry
      result = {
        ...pref,
        id: pref.id || `pref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        hit_count: pref.hit_count || 1,
      };
      this.db.preferences.push(result);
    }

    this.db.total_preferences = this.db.preferences.length;
    this.db.last_updated = new Date().toISOString();

    await this.atomicWriteDb();
    await this.compileMarkdown();
    await this.emit(existingIndex >= 0 ? 'PREFERENCE_UPDATED' : 'PREFERENCE_LEARNED', { preference: result });
    return result;
  }

  public async deletePreference(idOrKey: string): Promise<boolean> {
    const initialLen = this.db.preferences.length;
    this.db.preferences = this.db.preferences.filter((p) => p.id !== idOrKey && p.key !== idOrKey);

    if (this.db.preferences.length !== initialLen) {
      this.db.total_preferences = this.db.preferences.length;
      this.db.last_updated = new Date().toISOString();
      await this.atomicWriteDb();
      await this.compileMarkdown();
      await this.emit('PREFERENCE_DELETED', { idOrKey });
      return true;
    }
    return false;
  }

  /**
   * Compiles preferences database into canonical USER_PREFERENCES.md markdown.
   */
  public async compileMarkdown(): Promise<string> {
    const activePrefs = this.db.preferences.filter((p) => p.enabled);

    const header = `<!-- AUTO-GENERATED BY OVERSEER PREFERENCE ENGINE - DO NOT EDIT MANUALLY -->\n<!-- Last Updated: ${this.db.last_updated} | Total Active Rules: ${activePrefs.length} -->\n\n# User Preferences & Project Constraints ("Never Explain Twice")\n\n> [!IMPORTANT]\n> The following rules were extracted directly from user directives. All worker agents\n> operating in this repository must strictly adhere to these rules without exception.\n\n`;

    const categories: Record<string, PreferenceEntry[]> = {
      coding_style: [],
      testing: [],
      workflow: [],
      safety: [],
      architecture: [],
    };

    for (const pref of activePrefs) {
      if (!categories[pref.category]) {
        categories[pref.category] = [];
      }
      categories[pref.category].push(pref);
    }

    const titles: Record<string, string> = {
      coding_style: 'Coding Style & Quality',
      testing: 'Testing & Verification',
      workflow: 'Workflow & Git Operations',
      safety: 'Architectural & Safety Constraints',
      architecture: 'Architecture & System Design',
    };

    let body = '';
    let idx = 1;
    for (const [cat, entries] of Object.entries(categories)) {
      if (entries.length === 0) continue;
      body += `## ${idx++}. ${titles[cat] || cat.toUpperCase()}\n`;
      for (const e of entries) {
        const patterns =
          e.trigger_patterns && e.trigger_patterns.length > 0
            ? ` *(Pattern: \`${e.trigger_patterns.join('`, `')}\`)*`
            : '';
        body += `- **[${e.key}]**: ${e.rule}${patterns}\n`;
      }
      body += '\n';
    }

    const fullMarkdown = header + body;
    await fs.mkdir(path.dirname(this.markdownPath), { recursive: true });
    await fs.writeFile(this.markdownPath, fullMarkdown, 'utf8');
    return fullMarkdown;
  }

  /**
   * Generates LLM prompt injection block for active preferences.
   */
  public injectLearnedPreferences(taskContext?: {
    filesTouched?: string[];
    description?: string;
  }): string {
    const activePrefs = this.db.preferences.filter((p) => p.enabled);
    if (activePrefs.length === 0) {
      return '';
    }

    // Filter matching rules if filesTouched or description provided
    let matched = activePrefs;
    if (taskContext?.filesTouched && taskContext.filesTouched.length > 0) {
      const touched = taskContext.filesTouched;
      matched = activePrefs.filter((p) => {
        if (!p.trigger_patterns || p.trigger_patterns.length === 0) return true;
        return p.trigger_patterns.some((pattern) => {
          const cleanPattern = pattern.replace(/\*+/g, '');
          return touched.some((f) => f.includes(cleanPattern));
        });
      });
      if (matched.length === 0) matched = activePrefs;
    }

    const lines = matched.map((p) => `- [${p.key}]: ${p.rule}`);
    return `<user_learned_preferences>\nThe following project-wide rules and constraints have been learned and MUST be respected:\n${lines.join(
      '\n'
    )}\n</user_learned_preferences>`;
  }

  /**
   * Atomic write to preferences.json with serialized queue and backup rotation.
   */
  private async atomicWriteDb(): Promise<void> {
    const jsonStr = JSON.stringify(this.db, null, 2);
    const next = this.writeQueue.then(async () => {
      const tmpPath = `${this.dbPath}.tmp.${process.pid}.${Date.now()}.${crypto.randomUUID()}`;
      await fs.writeFile(tmpPath, jsonStr, 'utf8');
      await fs.rename(tmpPath, this.dbPath);
      await fs.copyFile(this.dbPath, this.bakPath);
    });
    this.writeQueue = next.catch(() => {});
    await next;
  }
}
