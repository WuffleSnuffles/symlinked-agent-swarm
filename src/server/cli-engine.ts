/**
 * src/server/cli-engine.ts
 *
 * Pluggable CLI & API Engine.
 * Provides template interpolation ({{prompt_file}}, {{model}}, etc.), credential masking,
 * prompt staging for Windows character limit safety, and child process execution.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { CLITemplateContext } from './types/cubicle.js';

export interface CLIExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  tokensConsumedEstimate: number;
}

export class CLIEngine {
  private baseDir: string;
  private tmpPromptDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = path.resolve(baseDir);
    this.tmpPromptDir = path.join(this.baseDir, '.swarm', 'tasks', 'tmp');
  }

  /**
   * Initializes prompt staging directory.
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(this.tmpPromptDir, { recursive: true });
  }

  /**
   * Interpolates template variables {{key}} against provided context.
   */
  public static interpolateTemplate(
    template: string,
    context: Record<string, string | number>
  ): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      if (key in context) {
        return String(context[key]);
      }
      return match;
    });
  }

  /**
   * Masks sensitive API credentials for logging and UI telemetry.
   */
  public static maskCredential(key: string): string {
    if (!key || key.length <= 8) return '********';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  /**
   * Stages prompt text to a file to prevent Windows command line length truncation (8,191 chars).
   */
  public async stagePromptFile(taskId: string, promptText: string): Promise<string> {
    await this.initialize();
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const promptFilePath = path.join(this.tmpPromptDir, `prompt-${safeTaskId}.txt`);
    await fs.writeFile(promptFilePath, promptText, 'utf8');
    return promptFilePath;
  }

  /**
   * Cleans up staged prompt file.
   */
  public async cleanupPromptFile(promptFilePath: string): Promise<void> {
    try {
      await fs.unlink(promptFilePath);
    } catch {
      // Ignore if absent
    }
  }

  /**
   * Resolves API credential from process environment or config.
   */
  public static resolveApiKey(envVarName: string): string {
    if (!envVarName) return '';
    return process.env[envVarName] || '';
  }

  /**
   * Prepares the full interpolated command string and context.
   */
  public async prepareCommand(
    template: string,
    params: {
      prompt: string;
      model: string;
      thinkingLevel: CLITemplateContext['thinking_level'];
      thinkingBudget: number;
      worktreeDir: string;
      taskId: string;
      cubicleId: string;
      apiKeyEnvVar: string;
    }
  ): Promise<{ command: string; promptFilePath: string }> {
    const helper = path.join(this.baseDir, 'scripts', 'cubicle-message.mjs');
    const collaboration = `\n\nCubicle collaboration: your address is ${params.cubicleId}. Discover peers and their current tasks with GET /api/cubicles on the local Swarm server. For related work, exchange findings or ask focused questions using: node "${helper}" send ${params.cubicleId} <peer> <topic> "message". Read your durable inbox and sent history using: node "${helper}" list ${params.cubicleId}. Check at task start, before editing shared interfaces, and before submission. Messages are advisory, not task assignments or approvals; do not wait indefinitely for replies. Stored does not mean read. Keep task details on the right taskboard.`;
    const workerPrompt = params.prompt + collaboration;
    const promptFilePath = await this.stagePromptFile(params.taskId, workerPrompt);
    const apiKey = CLIEngine.resolveApiKey(params.apiKeyEnvVar);

    const context: Record<string, string | number> = {
      prompt: workerPrompt.replace(/"/g, '\\"'),
      prompt_file: promptFilePath,
      model: params.model,
      thinking_level: params.thinkingLevel,
      thinking_budget: params.thinkingBudget,
      worktree_dir: params.worktreeDir,
      task_id: params.taskId,
      cubicle_id: params.cubicleId,
      api_key: apiKey,
    };

    const command = CLIEngine.interpolateTemplate(template, context);
    return { command, promptFilePath };
  }

  /**
   * Spawns command in isolated working directory with stream observation.
   */
  public executeCommand(
    commandLine: string,
    cwd: string,
    onStdoutChunk?: (chunk: string) => void,
    onStderrChunk?: (chunk: string) => void
  ): { childProcess: ChildProcess; promise: Promise<CLIExecutionResult> } {
    let childProcess: ChildProcess;

    const promise = new Promise<CLIExecutionResult>((resolve, reject) => {
      // In Windows, run via cmd.exe /s /c or shell
      childProcess = spawn(commandLine, {
        cwd,
        shell: true,
        windowsHide: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (onStdoutChunk) onStdoutChunk(text);
      });

      childProcess.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (onStderrChunk) onStderrChunk(text);
      });

      childProcess.on('close', (exitCode) => {
        // Heuristic token estimation (~4 chars per token)
        const combinedLength = stdout.length + stderr.length;
        const tokensConsumedEstimate = Math.max(1, Math.round(combinedLength / 4));

        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
          tokensConsumedEstimate,
        });
      });

      childProcess.on('error', (err) => {
        reject(new Error(`Failed to execute command '${commandLine}': ${err.message}`));
      });
    });

    return { childProcess: childProcess!, promise };
  }

  /**
   * Safely terminates a process tree.
   */
  public static killProcess(child: ChildProcess): void {
    if (!child || child.killed) return;
    try {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      // Best-effort kill
    }
  }
}
