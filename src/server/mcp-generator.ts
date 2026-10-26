/**
 * src/server/mcp-generator.ts
 *
 * Overseer Skill & MCP Server Generator & Vault Aggregator.
 * Synthesizes reusable Skills (.agents/skills/<name>/SKILL.md) and
 * MCP Server definitions (.agents/mcp/<name>/ + mcp_config.json)
 * and aggregates them for the Panopticon Vault tab.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PreferenceEngine, PreferenceEntry } from './preference-engine.js';

export interface SkillDefinition {
  name: string;
  description: string;
  instructions?: string;
  scripts?: Record<string, string>;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  handlerScript?: string;
}

export interface McpServerDefinition {
  name: string;
  description?: string;
  tools: McpToolDefinition[];
}

export interface VaultCatalog {
  preferences: PreferenceEntry[];
  skills: Array<{ name: string; description: string; path: string }>;
  mcpServers: Array<{ name: string; command: string; args: string[]; tools: string[] }>;
  totalItems: number;
  timestamp: string;
}

export type SkillMcpEventCallback = (type: string, payload: any) => void;

export class SkillMcpManager {
  private agentsDir: string;
  private skillsDir: string;
  private mcpDir: string;
  private mcpConfigPath: string;
  private preferenceEngine?: PreferenceEngine;
  private eventListeners: Set<SkillMcpEventCallback> = new Set();

  constructor(agentsDir: string, preferenceEngine?: PreferenceEngine) {
    this.agentsDir = path.resolve(agentsDir);
    this.skillsDir = path.join(this.agentsDir, 'skills');
    this.mcpDir = path.join(this.agentsDir, 'mcp');
    this.mcpConfigPath = path.join(this.mcpDir, 'mcp_config.json');
    this.preferenceEngine = preferenceEngine;
  }

  public onEvent(callback: SkillMcpEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  private emit(type: string, payload: any): void {
    for (const listener of this.eventListeners) {
      try {
        listener(type, payload);
      } catch (err) {
        console.error(`[SkillMcpManager] Event error for ${type}:`, err);
      }
    }
  }

  public async initialize(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.mkdir(this.mcpDir, { recursive: true });

    if (!existsSync(this.mcpConfigPath)) {
      await fs.writeFile(
        this.mcpConfigPath,
        JSON.stringify({ mcpServers: {} }, null, 2),
        'utf8'
      );
    }
  }

  // =========================================================================
  // Skill Synthesis & Frontmatter Validation
  // =========================================================================

  public validateFrontmatter(content: string): { valid: boolean; error?: string; metadata?: Record<string, string> } {
    if (!content.startsWith('---')) {
      return { valid: false, error: 'MALFORMED_FRONTMATTER: Frontmatter must start with ---' };
    }

    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    if (!match) {
      return { valid: false, error: 'MALFORMED_FRONTMATTER: Missing closing ---' };
    }

    const lines = match[1].split(/\r?\n/);
    const metadata: Record<string, string> = {};

    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        metadata[key] = val;
      }
    }

    if (!metadata.name) {
      return { valid: false, error: 'MALFORMED_FRONTMATTER: Missing mandatory "name:" field in frontmatter.' };
    }
    if (!metadata.description) {
      return { valid: false, error: 'MALFORMED_FRONTMATTER: Missing mandatory "description:" field in frontmatter.' };
    }

    return { valid: true, metadata };
  }

  public async generateSkill(def: SkillDefinition): Promise<{ skillPath: string; skillName: string }> {
    // Path traversal check
    if (def.name.includes('..') || def.name.includes('/') || def.name.includes('\\')) {
      throw new Error('SECURITY_VIOLATION: Skill name contains illegal path traversal characters.');
    }

    const cleanName = def.name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const skillFolder = path.join(this.skillsDir, cleanName);
    await fs.mkdir(skillFolder, { recursive: true });

    const instructions = def.instructions || `# ${def.name}\n\n${def.description}\n\n## Instructions\nFollow these guidelines when executing this skill.\n`;
    const skillContent = `---\nname: ${cleanName}\ndescription: ${def.description}\n---\n\n${instructions}`;

    const skillPath = path.join(skillFolder, 'SKILL.md');
    await fs.writeFile(skillPath, skillContent, 'utf8');

    // Write helper scripts if provided
    if (def.scripts) {
      const scriptsDir = path.join(skillFolder, 'scripts');
      await fs.mkdir(scriptsDir, { recursive: true });
      for (const [filename, scriptBody] of Object.entries(def.scripts)) {
        await fs.writeFile(path.join(scriptsDir, filename), scriptBody, 'utf8');
      }
    }

    this.emit('SKILL_GENERATED', { skillName: cleanName, skillPath, description: def.description });
    return { skillPath, skillName: cleanName };
  }

  public async listSkills(): Promise<Array<{ name: string; description: string; path: string }>> {
    if (!existsSync(this.skillsDir)) return [];
    const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    const skills: Array<{ name: string; description: string; path: string }> = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const skillPath = path.join(this.skillsDir, ent.name, 'SKILL.md');
        if (existsSync(skillPath)) {
          try {
            const raw = await fs.readFile(skillPath, 'utf8');
            const validation = this.validateFrontmatter(raw);
            skills.push({
              name: ent.name,
              description: validation.metadata?.description || '',
              path: skillPath,
            });
          } catch {}
        }
      }
    }
    return skills;
  }

  public async getSkill(name: string): Promise<{ name: string; description: string; content: string } | null> {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const skillPath = path.join(this.skillsDir, cleanName, 'SKILL.md');
    if (!existsSync(skillPath)) return null;

    const raw = await fs.readFile(skillPath, 'utf8');
    const validation = this.validateFrontmatter(raw);
    return {
      name: cleanName,
      description: validation.metadata?.description || '',
      content: raw,
    };
  }

  public async deleteSkill(name: string): Promise<boolean> {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const skillFolder = path.join(this.skillsDir, cleanName);
    if (!existsSync(skillFolder)) return false;

    await fs.rm(skillFolder, { recursive: true, force: true });
    this.emit('SKILL_DELETED', { skillName: cleanName });
    return true;
  }

  // =========================================================================
  // MCP Server Generation & mcp_config.json Registration
  // =========================================================================

  public async generateMcpServer(
    def: McpServerDefinition
  ): Promise<{ serverPath: string; serverName: string; toolsCount: number }> {
    // Path traversal check
    if (def.name.includes('..') || def.name.includes('/') || def.name.includes('\\')) {
      throw new Error('SECURITY_VIOLATION: MCP server name contains illegal path traversal characters.');
    }

    const cleanName = def.name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const serverFolder = path.join(this.mcpDir, cleanName);
    const toolsFolder = path.join(serverFolder, 'tools');
    await fs.mkdir(toolsFolder, { recursive: true });

    // 1. Write tool schemas
    for (const tool of def.tools) {
      const cleanToolName = tool.name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
      const toolSchema = {
        name: cleanToolName,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
      };
      await fs.writeFile(
        path.join(toolsFolder, `${cleanToolName}.json`),
        JSON.stringify(toolSchema, null, 2),
        'utf8'
      );
    }

    // 2. Generate standard stdio JSON-RPC index.mjs script
    const indexScript = `/**
 * Auto-generated MCP Server: ${cleanName}
 * Stdio JSON-RPC 2.0 Interface
 */
import readline from 'node:readline';

const tools = ${JSON.stringify(
      def.tools.map((t) => ({
        name: t.name.toLowerCase().replace(/[^a-z0-9-_]/g, ''),
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
      })),
      null,
      2
    )};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      const res = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: '${cleanName}', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(res) + '\\n');
    } else if (req.method === 'notifications/initialized') {
      // No response needed
    } else if (req.method === 'tools/list') {
      const res = { jsonrpc: '2.0', id: req.id, result: { tools } };
      process.stdout.write(JSON.stringify(res) + '\\n');
    } else if (req.method === 'tools/call') {
      const toolName = req.params?.name;
      const args = req.params?.arguments || {};
      const res = {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ executed: true, tool: toolName, args, status: 'SUCCESS' }) }]
        }
      };
      process.stdout.write(JSON.stringify(res) + '\\n');
    } else {
      const res = { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } };
      process.stdout.write(JSON.stringify(res) + '\\n');
    }
  } catch (err) {
    const res = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: ' + err.message } };
    process.stdout.write(JSON.stringify(res) + '\\n');
  }
});
`;

    const indexPath = path.join(serverFolder, 'index.mjs');
    await fs.writeFile(indexPath, indexScript, 'utf8');

    // 3. Register in mcp_config.json (idempotent, crash-safe)
    await this.registerMcpServerInConfig(cleanName, {
      command: 'node',
      args: [indexPath],
    });

    this.emit('MCP_REGISTERED', {
      serverName: cleanName,
      serverPath: serverFolder,
      toolsCount: def.tools.length,
    });

    return {
      serverPath: serverFolder,
      serverName: cleanName,
      toolsCount: def.tools.length,
    };
  }

  private async readMcpConfig(): Promise<{ mcpServers: Record<string, { command: string; args: string[] }> }> {
    try {
      if (existsSync(this.mcpConfigPath)) {
        const raw = await fs.readFile(this.mcpConfigPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.mcpServers) {
          return parsed;
        }
      }
    } catch {
      console.warn(`[SkillMcpManager] Corrupted mcp_config.json detected. Recovering to default.`);
    }
    return { mcpServers: {} };
  }

  private async registerMcpServerInConfig(
    name: string,
    serverConfig: { command: string; args: string[] }
  ): Promise<void> {
    const config = await this.readMcpConfig();
    config.mcpServers[name] = serverConfig; // Update or register without duplicating keys

    const tmpPath = `${this.mcpConfigPath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    await fs.rename(tmpPath, this.mcpConfigPath);
  }

  public async listMcpServers(): Promise<
    Array<{ name: string; config: { command: string; args: string[] }; tools: string[] }>
  > {
    const config = await this.readMcpConfig();
    const result: Array<{ name: string; config: { command: string; args: string[] }; tools: string[] }> = [];

    for (const [name, srvConfig] of Object.entries(config.mcpServers)) {
      const toolsDir = path.join(this.mcpDir, name, 'tools');
      let tools: string[] = [];
      if (existsSync(toolsDir)) {
        try {
          const files = await fs.readdir(toolsDir);
          tools = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
        } catch {}
      }
      result.push({
        name,
        config: srvConfig,
        tools,
      });
    }
    return result;
  }

  public async getMcpServer(
    name: string
  ): Promise<{ name: string; config: { command: string; args: string[] }; tools: any[] } | null> {
    const config = await this.readMcpConfig();
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const srvConfig = config.mcpServers[cleanName];
    if (!srvConfig) return null;

    const toolsDir = path.join(this.mcpDir, cleanName, 'tools');
    const tools: any[] = [];
    if (existsSync(toolsDir)) {
      try {
        const files = await fs.readdir(toolsDir);
        for (const file of files.filter((f) => f.endsWith('.json'))) {
          const raw = await fs.readFile(path.join(toolsDir, file), 'utf8');
          tools.push(JSON.parse(raw));
        }
      } catch {}
    }

    return {
      name: cleanName,
      config: srvConfig,
      tools,
    };
  }

  public async deleteMcpServer(name: string): Promise<boolean> {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    const config = await this.readMcpConfig();
    if (!config.mcpServers[cleanName]) return false;

    delete config.mcpServers[cleanName];

    const tmpPath = `${this.mcpConfigPath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    await fs.rename(tmpPath, this.mcpConfigPath);

    const serverFolder = path.join(this.mcpDir, cleanName);
    if (existsSync(serverFolder)) {
      await fs.rm(serverFolder, { recursive: true, force: true });
    }

    this.emit('MCP_UNREGISTERED', { serverName: cleanName });
    return true;
  }

  /**
   * Dry-run stdio JSON-RPC tool invocation.
   */
  public async testMcpTool(
    serverName: string,
    toolName: string,
    args: Record<string, any> = {},
    timeoutMs: number = 5000
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const server = await this.getMcpServer(serverName);
    if (!server) {
      return { success: false, error: `MCP server '${serverName}' not found.` };
    }

    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            proc.kill();
          } catch {}
          resolve({ success: false, error: `Tool execution timed out after ${timeoutMs}ms.` });
        }
      }, timeoutMs);

      const proc = spawn(server.config.command, server.config.args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = '';
      let initialized = false;

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id === 1 && !initialized) {
              initialized = true;
              // Send initialized notification and tool call
              proc.stdin.write(
                JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
              );
              proc.stdin.write(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: 2,
                  method: 'tools/call',
                  params: { name: toolName, arguments: args },
                }) + '\n'
              );
            } else if (msg.id === 2) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                proc.kill();
                if (msg.error) {
                  resolve({ success: false, error: msg.error.message || JSON.stringify(msg.error) });
                } else {
                  resolve({ success: true, result: msg.result });
                }
              }
            }
          } catch {}
        }
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ success: false, error: `Failed to spawn MCP process: ${err.message}` });
        }
      });

      // Send initial initialize request
      proc.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05', capabilities: {} },
        }) + '\n'
      );
    });
  }

  // =========================================================================
  // Vault Catalog Aggregator
  // =========================================================================

  public async getVaultCatalog(): Promise<VaultCatalog> {
    const preferences = this.preferenceEngine ? this.preferenceEngine.getPreferences() : [];
    const skills = await this.listSkills();
    const mcpServers = (await this.listMcpServers()).map((s) => ({
      name: s.name,
      command: s.config.command,
      args: s.config.args,
      tools: s.tools,
    }));

    const totalItems = preferences.length + skills.length + mcpServers.length;

    return {
      preferences,
      skills,
      mcpServers,
      totalItems,
      timestamp: new Date().toISOString(),
    };
  }
}
