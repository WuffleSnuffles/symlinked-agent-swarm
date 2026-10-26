import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { createTestSandbox } from '../e2e/helpers';
import { SkillMcpManager } from '../../src/server/mcp-generator';
import { PreferenceEngine } from '../../src/server/preference-engine';

describe('Overseer Skill & MCP Server Generator & Vault Unit Tests', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let preferenceEngine: PreferenceEngine;
  let skillMcpManager: SkillMcpManager;

  beforeEach(async () => {
    sandbox = await createTestSandbox('unit_skill_mcp');
    preferenceEngine = new PreferenceEngine(sandbox.swarmDir, sandbox.agentsDir);
    await preferenceEngine.initialize();

    skillMcpManager = new SkillMcpManager(sandbox.agentsDir, preferenceEngine);
    await skillMcpManager.initialize();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  describe('1. Skill Generation & Frontmatter Invariants', () => {
    it('synthesizes valid SKILL.md with YAML frontmatter bounded by ---', async () => {
      const result = await skillMcpManager.generateSkill({
        name: 'code-auditor',
        description: 'Audits TypeScript codebase for type soundness and invariant violations.',
        instructions: 'Check all interfaces and ensure exhaustive switch cases.',
      });

      expect(result.skillName).toBe('code-auditor');
      const content = await fs.readFile(result.skillPath, 'utf8');

      expect(content.startsWith('---')).toBe(true);
      expect(content).toContain('name: code-auditor');
      expect(content).toContain('description: Audits TypeScript codebase');
      expect(content).toContain('Check all interfaces');

      const validation = skillMcpManager.validateFrontmatter(content);
      expect(validation.valid).toBe(true);
      expect(validation.metadata?.name).toBe('code-auditor');
    });

    it('rejects path traversal attacks in skill name', async () => {
      await expect(
        skillMcpManager.generateSkill({
          name: '../../etc/cron',
          description: 'Malicious traversal',
        })
      ).rejects.toThrowError(/SECURITY_VIOLATION: Skill name contains illegal path traversal/);

      await expect(
        skillMcpManager.generateSkill({
          name: 'bad/name',
          description: 'Slash traversal',
        })
      ).rejects.toThrowError(/SECURITY_VIOLATION/);
    });

    it('detects malformed frontmatter when closing delimiter is missing', () => {
      const malformed = `---
name: broken-skill
description: Missing ending triple dashes
# Instructions Body
`;
      const validation = skillMcpManager.validateFrontmatter(malformed);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('MALFORMED_FRONTMATTER: Missing closing ---');
    });

    it('lists and deletes synthesized skills', async () => {
      await skillMcpManager.generateSkill({
        name: 'test-runner',
        description: 'Executes vitest runner',
      });

      const list = await skillMcpManager.listSkills();
      expect(list.some((s) => s.name === 'test-runner')).toBe(true);

      const deleted = await skillMcpManager.deleteSkill('test-runner');
      expect(deleted).toBe(true);

      const listAfter = await skillMcpManager.listSkills();
      expect(listAfter.some((s) => s.name === 'test-runner')).toBe(false);
    });
  });

  describe('2. MCP Server Generation & mcp_config.json Invariants', () => {
    it('synthesizes MCP server definitions with tools and registers in mcp_config.json', async () => {
      const result = await skillMcpManager.generateMcpServer({
        name: 'database-inspector',
        description: 'Inspects sqlite and postgres schemas',
        tools: [
          {
            name: 'list_tables',
            description: 'Returns all table names',
          },
          {
            name: 'describe_table',
            description: 'Returns table schema',
            parameters: {
              type: 'object',
              properties: {
                tableName: { type: 'string' },
              },
              required: ['tableName'],
            },
          },
        ],
      });

      expect(result.serverName).toBe('database-inspector');
      expect(result.toolsCount).toBe(2);

      // Verify files created
      const indexPath = path.join(result.serverPath, 'index.mjs');
      expect(await fs.access(indexPath).then(() => true)).toBe(true);

      const tool1Path = path.join(result.serverPath, 'tools', 'list_tables.json');
      const tool1Content = JSON.parse(await fs.readFile(tool1Path, 'utf8'));
      expect(tool1Content.name).toBe('list_tables');
      // Must default missing parameters to object
      expect(tool1Content.parameters).toEqual({ type: 'object', properties: {} });

      // Verify mcp_config.json registration
      const configPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(config.mcpServers['database-inspector']).toBeDefined();
      expect(config.mcpServers['database-inspector'].command).toBe('node');
    });

    it('updates existing server registration in place without duplicating keys', async () => {
      await skillMcpManager.generateMcpServer({
        name: 'git-tools',
        tools: [{ name: 'git_status', description: 'Checks status' }],
      });

      // Update definition
      await skillMcpManager.generateMcpServer({
        name: 'git-tools',
        tools: [
          { name: 'git_status', description: 'Checks status' },
          { name: 'git_diff', description: 'Returns diff' },
        ],
      });

      const configPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(Object.keys(config.mcpServers).filter((k) => k === 'git-tools')).toHaveLength(1);
    });

    it('safely recovers when mcp_config.json contains corrupted JSON', async () => {
      const configPath = path.join(sandbox.agentsDir, 'mcp', 'mcp_config.json');
      await fs.writeFile(configPath, '{MALFORMED_JSON_STRING', 'utf8');

      // Should not throw, should safely recover and register new server
      const result = await skillMcpManager.generateMcpServer({
        name: 'clean-server',
        tools: [{ name: 'ping', description: 'Ping tool' }],
      });

      expect(result.serverName).toBe('clean-server');
      const recoveredConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(recoveredConfig.mcpServers['clean-server']).toBeDefined();
    });
  });

  describe('3. Vault Catalog Aggregator', () => {
    it('aggregates learned preferences, skills, and MCP tools in unified vault payload', async () => {
      // 1. Add preference
      await preferenceEngine.savePreference({
        category: 'architecture',
        key: 'modular_design',
        rule: 'Keep all modules decoupled.',
        trigger_patterns: [],
        confidence: 0.9,
        enabled: true,
        applies_to: 'all',
      });

      // 2. Add skill
      await skillMcpManager.generateSkill({
        name: 'perf-audit',
        description: 'Performance benchmarking skill',
      });

      // 3. Add MCP server
      await skillMcpManager.generateMcpServer({
        name: 'metrics-srv',
        tools: [{ name: 'get_cpu', description: 'Gets cpu load' }],
      });

      const catalog = await skillMcpManager.getVaultCatalog();
      expect(catalog.preferences.length).toBeGreaterThanOrEqual(1);
      expect(catalog.skills.some((s) => s.name === 'perf-audit')).toBe(true);
      expect(catalog.mcpServers.some((s) => s.name === 'metrics-srv')).toBe(true);
      expect(catalog.totalItems).toBe(catalog.preferences.length + catalog.skills.length + catalog.mcpServers.length);
    });
  });
});
