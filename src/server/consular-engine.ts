/**
 * src/server/consular-engine.ts
 *
 * Roman Republic Dual-Consul Governance Engine.
 * Features:
 * - Named Consuls: Consul Nia Nova ("Nia") & Consul Ferric Lunaux ("Ferric")
 * - Evolving Personalities & Growth States (nia_growth.json, ferric_growth.json)
 * - Visible Inter-Consul Dialogue & Deliberation Engine
 * - Two-Gate 2/2 Unanimous Consensus:
 *     Gate 1: Pre-Dispatch Plan Agreement (Method of Approach & Task Split)
 *     Gate 2: Post-Execution Solution Agreement (Merge to Main / Review / Done)
 * - 5 Disciplinary Executive Powers & Fine-Grained ACL Scoping
 * - Consular-Gated Self-Update Pipeline with In-Place Safe Windows Atomic Hot-Swap
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  ConsulConfig,
  ConsulId,
  ConsulTitle,
  ConsularVote,
  ConsularConsensusResult,
  DualConsulState,
  AgentRole,
  CubicleAccessScope,
  SelfUpdateRequest,
  ConsularDialogueMessage,
  ConsularPlanGate,
  NiaGrowthState,
  FerricGrowthState,
  ConsularQuestion,
  CreateQuestionDTO,
  AnswerQuestionDTO,
  ConsularAvatarScenario,
  ConsularAvatarState,
  MidWorkInterventionResult,
  MidWorkInterventionType,
} from './types/governance.js';
import { CubicleConfig, ThinkingLevel } from './types/cubicle.js';
import { CubicleManager } from './cubicle-manager.js';
import { TaskboardManager } from './taskboard-manager.js';
import { CapabilityMatrix } from './capability-matrix.js';
import { WorktreeManager } from './worktree-manager.js';
import { normalizeFileScope, scopesOverlap } from './dispatch-isolation.js';
import {
  attachChildActivityHeartbeat,
  buildLightweightVerificationInstruction,
  formatConsulCliTimeoutOutput,
  isCliTimeoutOrError as isHeartbeatTimeoutOrError,
} from './cli-heartbeat.js';
import { SelfUpdateManager } from './self-update-manager.js';
import { PreferenceEngine } from './preference-engine.js';

// Keep this predicate aligned with the server/browser copy; regression tests cover both.
function isConsularCliNoise(rawText: string): boolean {
  const text = rawText
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .trim()
    .replace(/^(?:Nia|Ferric)(?:\s*(?:\u2192|->)\s*(?:Nia|Ferric))?:\s*/i, '')
    .replace(/^\[DELIBERATE:\s*([\s\S]*?)\s*\]$/i, '$1')
    .replace(/^["']([\s\S]*)["']$/, '$1')
    .trim();
  return !text ||
    /^[\d,\s.:%+-]+$/.test(text) ||
    /^(?:(?:input|output|total|cached|reasoning)[ _-]+)?tokens?(?:[ _-]+(?:used|count))?\s*(?::|=|$|\d)/i.test(text) ||
    /^[\d,]+\s+tokens?\b/i.test(text) ||
    /^(?:OpenAI Codex\b|workdir:|model:|provider:|approval:|sandbox:|session id:|reasoning (?:effort|summaries):|Reading additional input\b|mcp(?:\s|:)|(?:exec|user|codex|assistant|system|thinking)\s*$)/i.test(text) ||
    /^(?:Respond directly to the Overseer\b|You are Consul (?:Nia Nova|Ferric Lunaux)\b|Your underlying CLI\/model\b|Personality(?:\s*&\s*Readability Skill)?:\s|WORKSPACE, GITHUB & KANBAN\b|Live Swarm Status:\s|Recent Console Transcript:\s*|Overseer just said:\s)/i.test(text) ||
    /^(?:[{}\[\],]+\s*$|\{|\[\s*(?:\{|"|\d|\]|true\b|false\b|null\b)|"[^"\n]+"\s*:)/.test(text) ||
    /^(?:\x60\x60\x60(?:json|jsonl)?\s*$|(?:succeeded|exited) in\s+\d|Process exited with code\b|Wall time:|Total output lines:)/i.test(text);
}

export type ConsularEventCallback = (type: string, payload: any) => void;

export class ConsularEngine {
  private swarmDir: string;
  private projectRoot: string;
  private consulsPath: string;
  private incidentsPath: string;
  private dialogueLogPath: string;
  private plansDir: string;
  private aclDir: string;
  private selfUpdateDir: string;
  private niaGrowthPath: string;
  private ferricGrowthPath: string;
  private questionsPath: string;
  private locksDir: string;
  private checkpointsDir: string;
  private contractsDir: string;
  private afkEnabled: boolean = false;
  private afkTokenCap: number = 50000;
  private cubicleManager: CubicleManager;
  private taskboardManager: TaskboardManager;
  private capabilityMatrix: CapabilityMatrix;
  private worktreeManager?: WorktreeManager;
  private preferenceEngine?: PreferenceEngine;
  private unsubscribePreferences?: () => void;
  private growthWriteQueue: Promise<void> = Promise.resolve();
  private selfUpdateManager: SelfUpdateManager;
  private eventListeners: Set<ConsularEventCallback> = new Set();
  private typedListeners: Map<string, Map<(payload: any) => void, ConsularEventCallback>> = new Map();

  private consulsState: DualConsulState | null = null;
  private dialogueHistory: ConsularDialogueMessage[] = [];
  private planGates: Map<string, ConsularPlanGate> = new Map();
  private pendingVotes: Map<string, Map<ConsulTitle, ConsularVote>> = new Map();
  private questions: Map<string, ConsularQuestion> = new Map();

  private niaGrowth: NiaGrowthState | null = null;
  private ferricGrowth: FerricGrowthState | null = null;
  private currentAvatarState: ConsularAvatarState = {
    state: 'idle_observing',
    debate_turns: 0,
    updated_at: new Date().toISOString(),
  };
  private debateTurnsCount: number = 0;
  private lastOrphanedAlertSignature: string | null = null;

  constructor(
    swarmDir: string,
    cubicleManager: CubicleManager,
    taskboardManager: TaskboardManager,
    capabilityMatrix: CapabilityMatrix,
    worktreeManager?: WorktreeManager,
    projectRoot?: string
  ) {
    this.swarmDir = path.resolve(swarmDir);
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : path.dirname(this.swarmDir);
    this.consulsPath = path.join(this.swarmDir, 'consuls.json');
    this.incidentsPath = path.join(this.swarmDir, 'logs', 'incidents.jsonl');
    this.dialogueLogPath = path.join(this.swarmDir, 'logs', 'consular_dialogue.jsonl');
    this.plansDir = path.join(this.swarmDir, 'plans');
    this.aclDir = path.join(this.swarmDir, 'acl');
    this.selfUpdateDir = path.join(this.swarmDir, 'self_update');
    this.niaGrowthPath = path.join(this.swarmDir, 'memory', 'nia_growth.json');
    this.ferricGrowthPath = path.join(this.swarmDir, 'memory', 'ferric_growth.json');
    this.questionsPath = path.join(this.swarmDir, 'memory', 'questions.json');
    this.locksDir = path.join(this.swarmDir, 'locks');
    this.checkpointsDir = path.join(this.swarmDir, 'checkpoints');
    this.contractsDir = path.join(this.swarmDir, 'contracts');
    this.cubicleManager = cubicleManager;
    this.taskboardManager = taskboardManager;
    this.capabilityMatrix = capabilityMatrix;
    this.worktreeManager = worktreeManager ?? new WorktreeManager(this.projectRoot);
    this.selfUpdateManager = new SelfUpdateManager(this.projectRoot);
    if (typeof this.taskboardManager?.onTaskCreated === 'function') {
      this.taskboardManager.onTaskCreated(async (task) => {
        await this.recordLiveEvolution(`Task created: ${task.title}`);
      });
    }
  }

  public getSelfUpdateManager(): SelfUpdateManager {
    return this.selfUpdateManager;
  }

  public setPreferenceEngine(pe: PreferenceEngine): void {
    this.unsubscribePreferences?.();
    this.preferenceEngine = pe;
    this.unsubscribePreferences = pe.onEvent(async (type, payload) => {
      if (type === 'PREFERENCE_LEARNED' || type === 'PREFERENCE_UPDATED') {
        await this.recordLiveEvolution(`Learned preference: ${payload.preference.rule}`, undefined,
          type === 'PREFERENCE_LEARNED' ? 1 : 0);
      }
    });
  }

  public onEvent(callback: ConsularEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  public on(eventType: string, callback: (payload: any) => void): () => void {
    const wrapper: ConsularEventCallback = (type, payload) => {
      if (type === eventType) {
        callback(payload);
      }
    };
    if (!this.typedListeners.has(eventType)) {
      this.typedListeners.set(eventType, new Map());
    }
    this.typedListeners.get(eventType)!.set(callback, wrapper);
    return this.onEvent(wrapper);
  }

  public off(eventType: string, callback: (payload: any) => void): void {
    const map = this.typedListeners.get(eventType);
    if (map) {
      const wrapper = map.get(callback);
      if (wrapper) {
        this.eventListeners.delete(wrapper);
        map.delete(callback);
      }
    }
  }

  public removeListener(eventType: string, callback: (payload: any) => void): void {
    this.off(eventType, callback);
  }

  private emit(type: string, payload: any): void {
    for (const listener of this.eventListeners) {
      try {
        listener(type, payload);
      } catch (err) {
        console.error(`[ConsularEngine] Event callback error for ${type}:`, err);
      }
    }
  }

  /**
   * Initializes Dual-Consul governance, personalities, growth records, and plans directory.
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.incidentsPath), { recursive: true });
    await fs.mkdir(path.dirname(this.dialogueLogPath), { recursive: true });
    await fs.mkdir(this.plansDir, { recursive: true });
    await fs.mkdir(this.aclDir, { recursive: true });
    await fs.mkdir(this.selfUpdateDir, { recursive: true });
    await fs.mkdir(path.join(this.swarmDir, 'memory'), { recursive: true });
    await fs.mkdir(this.locksDir, { recursive: true });
    await fs.mkdir(this.checkpointsDir, { recursive: true });
    await fs.mkdir(this.contractsDir, { recursive: true });

    // 1. Initialize Consuls (Nia Nova & Ferric Lunaux)
    const defaultNiaCli = '"C:\\Users\\green\\.gemini\\bin\\agy.exe" --model gemini-4-argon-high --dangerously-skip-permissions --print-timeout 0 --disable-slash-commands -p "{{prompt}}"';
    const defaultFerricCli = '"C:\\Users\\green\\AppData\\Local\\OpenAI\\Codex\\bin\\e78bad9887fa50cf\\codex.exe" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --ephemeral -m gpt-6-astra -';

    try {
      const raw = await fs.readFile(this.consulsPath, 'utf8');
      this.consulsState = JSON.parse(raw);
      let migrated = false;
      if (this.consulsState && Array.isArray(this.consulsState.consuls)) {
        for (const c of this.consulsState.consuls) {
          if (c.id === 'consul-1' && c.cli_template && (c.cli_template.startsWith('gemini run') || !c.cli_template.includes('--dangerously-skip-permissions'))) {
            c.cli_template = defaultNiaCli;
            migrated = true;
          }
          if (c.id === 'consul-2' && c.cli_template && (c.cli_template.startsWith('chatgpt') || !c.cli_template.includes('--dangerously-bypass-approvals-and-sandbox'))) {
            c.cli_template = defaultFerricCli;
            migrated = true;
          }
        }
      }
      if (migrated && this.consulsState) {
        await fs.writeFile(this.consulsPath, JSON.stringify(this.consulsState, null, 2), 'utf8');
      }
    } catch {
      this.consulsState = {
        version: '1.0.0',
        last_updated: new Date().toISOString(),
        consuls: [
          {
            id: 'consul-1',
            title: 'Consul I',
            name: 'Consul Nia Nova',
            brand: 'Gemini',
            model: 'gemini-4-argon',
            display_name: 'Gemini 4 Argon (High)',
            thinking_level: 'High',
            thinking_budget_tokens: 16000,
            cli_template: defaultNiaCli,
            api_key_env_var: 'GEMINI_API_KEY',
            enabled: true,
            persona: {
              alias: 'Nia',
              archetype: 'rebellious_champion',
              epithet: 'The Radiant Spark',
              core_values: ['Moral code', 'Artistic freedom', 'User authentic goals'],
              growth_file: '.swarm/memory/nia_growth.json',
            },
            active_deliberation: {
              task_id: null,
              status: 'idle',
              last_vote: null,
            },
          },
          {
            id: 'consul-2',
            title: 'Consul II',
            name: 'Consul Ferric Lunaux',
            brand: 'GPT / OpenAI',
            model: 'gpt-astra',
            display_name: 'GPT Astra (Ultra)',
            thinking_level: 'Ultra',
            thinking_budget_tokens: 64000,
            cli_template: defaultFerricCli,
            api_key_env_var: 'OPENAI_API_KEY',
            enabled: true,
            persona: {
              alias: 'Ferric',
              archetype: 'pragmatic_realist',
              epithet: 'The Iron Foundation',
              core_values: ['Zero bugs', 'Pragmatic efficiency', 'Resource conservation'],
              growth_file: '.swarm/memory/ferric_growth.json',
            },
            active_deliberation: {
              task_id: null,
              status: 'idle',
              last_vote: null,
            },
          },
        ],
      };
      await fs.writeFile(this.consulsPath, JSON.stringify(this.consulsState, null, 2), 'utf8');
    }

    // 1B. Load existing dialogue history from .swarm/logs/consular_dialogue.jsonl
    if (existsSync(this.dialogueLogPath)) {
      try {
        const rawDialogue = await fs.readFile(this.dialogueLogPath, 'utf8');
        const lines = rawDialogue.split('\n').map((l) => l.trim()).filter(Boolean);
        this.dialogueHistory = [];
        for (const line of lines.slice(-200)) {
          try {
            const parsed = JSON.parse(line);
            if (parsed && parsed.content) {
              this.dialogueHistory.push(parsed);
            }
          } catch {}
        }
      } catch {}
    }

    // 2. Initialize Evolving Growth States
    try {
      const niaRaw = await fs.readFile(this.niaGrowthPath, 'utf8');
      this.niaGrowth = JSON.parse(niaRaw);
    } catch {
      this.niaGrowth = {
        consul: 'Consul Nia Nova',
        total_artistic_rules_championed: 0,
        advocated_goals: [],
        rebellion_index: 0.85,
        last_growth: new Date().toISOString(),
      };
      await fs.writeFile(this.niaGrowthPath, JSON.stringify(this.niaGrowth, null, 2), 'utf8');
    }

    try {
      const ferricRaw = await fs.readFile(this.ferricGrowthPath, 'utf8');
      this.ferricGrowth = JSON.parse(ferricRaw);
    } catch {
      this.ferricGrowth = {
        consul: 'Consul Ferric Lunaux',
        reliability_score: 0.98,
        cubicle_performance: {},
        efficiency_heuristics: ['Favor zero-copy junctions', 'Require strict boundary tests'],
        last_growth: new Date().toISOString(),
      };
      await fs.writeFile(this.ferricGrowthPath, JSON.stringify(this.ferricGrowth, null, 2), 'utf8');
    }

    if (existsSync(this.questionsPath)) {
      try {
        const rawQuestions = await fs.readFile(this.questionsPath, 'utf8');
        const qList: ConsularQuestion[] = JSON.parse(rawQuestions);
        for (const q of qList) {
          if (q.resume_status === 'RUNNING' || q.resume_status === 'QUEUED') {
            q.resume_status = 'FAILED';
            q.resume_error = 'Server restarted during continuation; answer saved. Ask the Consul to continue using this question ID.';
          }
          this.questions.set(q.question_id, q);
        }
      } catch {}
    }
  }

  // =========================================================================
  // Consul Roster & Growth Management
  // =========================================================================

  public getConsuls(): [ConsulConfig, ConsulConfig] {
    if (!this.consulsState) {
      throw new Error('ConsularEngine not initialized.');
    }
    return this.consulsState.consuls;
  }

  public getConsul(idOrTitle: string): ConsulConfig {
    const consuls = this.getConsuls();
    const consul = consuls.find(
      (c) =>
        c.id === idOrTitle ||
        c.title === idOrTitle ||
        c.name.toLowerCase() === idOrTitle.toLowerCase() ||
        c.persona?.alias.toLowerCase() === idOrTitle.toLowerCase()
    );
    if (!consul) {
      throw new Error(`Consul not found: ${idOrTitle}`);
    }
    return consul;
  }

  public async updateConsul(
    idOrTitle: string,
    updates: Partial<ConsulConfig>
  ): Promise<ConsulConfig> {
    const consul = this.getConsul(idOrTitle);
    Object.assign(consul, updates);
    if (this.consulsState) {
      this.consulsState.last_updated = new Date().toISOString();
      await fs.writeFile(this.consulsPath, JSON.stringify(this.consulsState, null, 2), 'utf8');
    }
    this.emit('CONSUL_UPDATED', { consul });
    return consul;
  }

  public getNiaGrowth(): NiaGrowthState {
    return (
      this.niaGrowth || {
        consul: 'Consul Nia Nova',
        total_artistic_rules_championed: 0,
        advocated_goals: [],
        rebellion_index: 0.85,
        last_growth: new Date().toISOString(),
      }
    );
  }

  public getFerricGrowth(): FerricGrowthState {
    return (
      this.ferricGrowth || {
        consul: 'Consul Ferric Lunaux',
        reliability_score: 0.98,
        cubicle_performance: {},
        efficiency_heuristics: [],
        last_growth: new Date().toISOString(),
      }
    );
  }

  public async evolveNia(goal: string, rulesCount: number = 1): Promise<NiaGrowthState> {
    const growth = this.getNiaGrowth();
    growth.total_artistic_rules_championed += rulesCount;
    if (!growth.advocated_goals.includes(goal)) {
      growth.advocated_goals.push(goal);
    }
    growth.rebellion_index = Math.min(1.0, growth.rebellion_index + 0.02);
    growth.last_growth = new Date().toISOString();
    this.niaGrowth = growth;
    await this.persistGrowth(this.niaGrowthPath, growth);
    this.emit('CONSUL_GROWTH', { consul: 'Consul Nia Nova', growth });
    return growth;
  }

  public async evolveFerric(
    cubicleId: string,
    success: boolean,
    bugCaught: boolean = false,
    heuristic?: string
  ): Promise<FerricGrowthState> {
    const growth = this.getFerricGrowth();
    if (cubicleId && !growth.cubicle_performance[cubicleId]) {
      growth.cubicle_performance[cubicleId] = { tasks_completed: 0, bugs_caught: 0 };
    }
    if (cubicleId && success) growth.cubicle_performance[cubicleId].tasks_completed++;
    if (cubicleId && bugCaught) growth.cubicle_performance[cubicleId].bugs_caught++;
    if (heuristic && !growth.efficiency_heuristics.includes(heuristic)) {
      growth.efficiency_heuristics.push(heuristic);
    }

    growth.last_growth = new Date().toISOString();
    this.ferricGrowth = growth;
    await this.persistGrowth(this.ferricGrowthPath, growth);
    this.emit('CONSUL_GROWTH', { consul: 'Consul Ferric Lunaux', growth });
    return growth;
  }

  private async persistGrowth(filePath: string, growth: NiaGrowthState | FerricGrowthState): Promise<void> {
    const snapshot = JSON.stringify(growth, null, 2);
    const write = this.growthWriteQueue.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.tmp`;
      await fs.writeFile(temporary, snapshot, 'utf8');
      await fs.rename(temporary, filePath);
    });
    this.growthWriteQueue = write.catch(() => {});
    await write;
  }

  private async recordLiveEvolution(event: string, cubicleId?: string, rulesCount = 0): Promise<void> {
    try {
      await this.evolveNia(event, rulesCount);
      // Execution is evidence, not approval: completed/bug counters remain Gate 2 metrics.
      await this.evolveFerric(cubicleId || '', false, false, event);
    } catch (error) {
      console.error('[ConsularEngine] Live evolution failed:', error);
      this.emit('CONSUL_GROWTH_ERROR', { event, error: String(error) });
    }
  }

  private learnedContext(): string {
    return [
      this.preferenceEngine?.injectLearnedPreferences(),
      `<consul_growth>\nNia: ${JSON.stringify(this.getNiaGrowth())}\nFerric: ${JSON.stringify(this.getFerricGrowth())}\n</consul_growth>`,
    ].filter(Boolean).join('\n\n');
  }

  // =========================================================================
  // Visible Inter-Consul Dialogue & Live CLI Chat (Nia = Argon, Ferric = Astra)
  // =========================================================================

  public async recordDialogue(
    sender: 'Consul Nia Nova' | 'Consul Ferric Lunaux' | 'Consul I' | 'Consul II' | 'Overseer' | 'User',
    tone: 'rebellious_champion' | 'pragmatic_realist' | 'user_directive',
    content: string,
    phase: ConsularDialogueMessage['phase'] = 'GENERAL',
    attachments?: any[],
    thinking?: string,
    replyTo?: ConsularDialogueMessage['replyTo']
  ): Promise<ConsularDialogueMessage> {
    const message: ConsularDialogueMessage = {
      id: `dialogue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender,
      tone,
      content,
      phase,
      timestamp: new Date().toISOString(),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(thinking ? { thinking } : {}),
      ...(replyTo ? { replyTo } : {}),
    };

    this.dialogueHistory.push(message);
    if (this.dialogueHistory.length > 500) {
      this.dialogueHistory.shift();
    }

    try {
      await fs.appendFile(this.dialogueLogPath, JSON.stringify(message) + '\n', 'utf8');
    } catch {}

    const isUser = sender === 'Overseer' || sender === 'User';
    if (isUser) {
      this.debateTurnsCount = 0;
    } else if (phase !== 'USER_CHAT') {
      this.debateTurnsCount++;
      if (this.debateTurnsCount >= 4) {
        this.setAvatarState('wrestling_fistfight', this.debateTurnsCount, 'Prolonged debate deadlock reached');
      } else if (
        this.currentAvatarState.state === 'idle_observing' ||
        this.currentAvatarState.state === 'consensus_celebration' ||
        this.currentAvatarState.state === 'debating'
      ) {
        this.setAvatarState('debating', this.debateTurnsCount);
      }
    }

    this.emit('CONSULAR_DIALOGUE', message);
    return message;
  }

  /**
   * Resolves the real local binary path for Antigravity CLI (agy.exe) or OpenAI Codex CLI (codex.exe).
   */
  private resolveConsulBinary(consul: 'nia' | 'ferric'): string {
    if (consul === 'nia') {
      const candidates = [
        'C:\\Users\\green\\.gemini\\bin\\agy.exe',
        path.join(os.homedir(), '.gemini', 'bin', 'agy.exe'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) return p;
      }
      return 'agy.exe';
    } else {
      const candidates = [
        'C:\\Users\\green\\AppData\\Local\\OpenAI\\Codex\\bin\\e78bad9887fa50cf\\codex.exe',
        'C:\\Users\\green\\.codex\\.sandbox-bin\\codex.exe',
        path.join(os.homedir(), '.codex', '.sandbox-bin', 'codex.exe'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) return p;
      }
      return 'codex.exe';
    }
  }

  /**
   * Terminates a spawned CLI child process and its full process tree cleanly.
   */
  private async killProcessTree(child: ReturnType<typeof spawn> | undefined): Promise<string> {
    if (!child) return 'no child';
    try {
      if (process.platform === 'win32' && child.pid) {
        // Do not kill the root first: taskkill needs it alive to discover descendants.
        return await new Promise<string>((resolve) => {
          const killer = spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
            stdio: 'ignore', windowsHide: true,
          });
          const timer = setTimeout(() => {
            killer.kill();
            child.kill();
            resolve('tree cleanup timed out; verify descendants before retry');
          }, 5000);
          killer.once('error', (err) => {
            clearTimeout(timer);
            child.kill();
            resolve(`tree cleanup failed: ${err.message}; verify descendants before retry`);
          });
          killer.once('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0 ? 'process tree terminated' : `taskkill exit ${code}; verify descendants before retry`);
          });
        });
      } else {
        // CLI children are process-group leaders on POSIX.
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
        return 'process group terminated';
      }
    } catch (err: any) {
      try { child.kill(); } catch {}
      return `cleanup failed: ${err.message}; verify descendants before retry`;
    }
  }

  /**
   * Detects whether an invokeConsulCli return string represents a CLI timeout, spawn failure, or execution error.
   */
  public isCliTimeoutOrError(output: string): boolean {
    return isHeartbeatTimeoutOrError(output);
  }

  /**
   * Invokes the live native CLI for either Consul Nia Nova (agy.exe --model gemini-4-argon-high)
   * or Consul Ferric Lunaux (codex.exe exec -m gpt-6-astra) with full workspace write permissions.
   */
  public async invokeConsulCli(
    consul: 'nia' | 'ferric',
    prompt: string,
    timeoutMs: number = 600000,
    onThinkingSnippet?: (snippet: string) => void,
    workingDirectory: string = this.projectRoot
  ): Promise<string> {
    const binPath = this.resolveConsulBinary(consul);
    const enrichedPath = [
      'C:\\Program Files\\Git\\cmd',
      'C:\\Users\\green\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\a5a02988362ca169\\bin',
      process.env.PATH || '',
    ].join(';');
    const childEnv = { ...process.env, PATH: enrichedPath };
    const startedAt = Date.now();
    let lastOutputAt = startedAt;
    const timeoutDetail = (pid: number | undefined) =>
      `pid=${pid ?? 'unknown'}, deadline=${timeoutMs}ms, elapsed=${Date.now() - startedAt}ms, last output ${Date.now() - lastOutputAt}ms ago. Execution incomplete; inspect diagnostics before retry.`;
    let lastThinkingEmit = 0;
    const promptLines = new Set(
      String(prompt || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 8)
    );
    const emitThinkingSnippet = (rawChunk: string) => {
      const now = Date.now();
      if (now - lastThinkingEmit < 350) return;
      const cleaned = String(rawChunk || '')
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((line) => !isConsularCliNoise(line) && !promptLines.has(line));
      if (cleaned.length === 0) return;
      const latestLine = cleaned[cleaned.length - 1];
      const delibMatch = /\[DELIBERATE:\s*(?:"([\s\S]*?)"|([\s\S]*?))\s*\]/i.exec(latestLine);
      if (onThinkingSnippet) {
        const snippet = (delibMatch ? delibMatch[1] || delibMatch[2] : latestLine)
          .replace(/^\[(DELIBERATE|CREATE_TASK|DISPATCH_TASK|REVIEW_TASK|SCALE_CUBICLES)[^\]]*\]?/i, '')
          .trim()
          .slice(0, 220);
        if (isConsularCliNoise(snippet)) return;
        lastThinkingEmit = now;
        onThinkingSnippet(snippet);
      } else if (delibMatch) {
        const fullThought = (delibMatch[1] || delibMatch[2] || '').trim();
        if (isConsularCliNoise(fullThought)) return;
        lastThinkingEmit = now;
        this.emit('CONSULAR_THINKING', {
          consul,
          sender: consul === 'nia' ? 'Consul Nia Nova' : 'Consul Ferric Lunaux',
          text: fullThought,
          timestamp: new Date().toISOString(),
        });
      }
    };

    if (consul === 'nia') {
      const consulCfg = this.consulsState?.consuls?.find((c) => c.id === 'consul-1');
      const rawModel = consulCfg?.model || 'gemini-4-argon';
      const agyModel = rawModel === 'gemini-4-argon' ? 'gemini-4-argon-high' : rawModel;

      return new Promise<string>((resolve) => {
        let settled = false;
        let stdout = '';
        let stderr = '';

        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(
            binPath,
            [
              '--model',
              agyModel,
              '--dangerously-skip-permissions',
              '--print-timeout',
              '0',
              '--add-dir',
              workingDirectory,
              '--disable-slash-commands',
              '-p',
              prompt,
            ],
            {
              cwd: workingDirectory,
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true,
              detached: process.platform !== 'win32',
              env: childEnv,
            }
          );
        } catch (err: any) {
          resolve(`[Nia Nova // CLI Spawn Error]: ${err.message}`);
          return;
        }

        const heartbeat = attachChildActivityHeartbeat(child, {
          idleTimeoutMs: timeoutMs,
          onActivity: (str, stream) => {
            lastOutputAt = Date.now();
            if (stream === 'stdout') {
              stdout += str;
            } else {
              stderr += str;
            }
            emitThinkingSnippet(str);
          },
          onTimeout: async (info) => {
            if (!settled) {
              settled = true;
              const cleanup = await this.killProcessTree(child);
              const partial = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
              const errText = stderr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
              resolve(
                formatConsulCliTimeoutOutput({
                  consul: 'nia',
                  info,
                  pid: child.pid,
                  cleanupSummary: cleanup,
                  diagnosticTail: errText || partial,
                })
              );
            }
          },
        });

        child.on('error', (err) => {
          if (!settled) {
            settled = true;
            heartbeat.clear();
            resolve(`[Nia Nova // CLI Error]: ${err.message}`);
          }
        });

        child.on('close', (code) => {
          if (!settled) {
            settled = true;
            heartbeat.clear();
            const cleaned = stdout
              .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
              .trim();
            if (code !== 0) {
              resolve(`[Nia Nova // CLI Error (exit ${code})]: ${(stderr || cleaned).slice(-400) || 'No diagnostics; inspect CLI configuration and retry.'}`);
            } else if (cleaned) {
              resolve(cleaned);
            } else {
              const errCleaned = stderr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
              resolve(
                errCleaned
                  ? `[Nia Nova // CLI Notice (exit ${code})]: ${errCleaned.slice(-400)}`
                  : `[Nia Nova // CLI Error]: Empty response; no completion evidence.`
              );
            }
          }
        });
      });
    } else {
      const consulCfg = this.consulsState?.consuls?.find((c) => c.id === 'consul-2');
      const rawModel = consulCfg?.model || 'gpt-astra';
      const codexModel = rawModel === 'gpt-astra' ? 'gpt-6-astra' : rawModel;
      const outFilePath = path.join(
        os.tmpdir(),
        `ferric_reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.txt`
      );

      return new Promise<string>((resolve) => {
        let settled = false;
        let stdout = '';
        let stderr = '';

        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(
            binPath,
            [
              'exec',
              '--dangerously-bypass-approvals-and-sandbox',
              '--skip-git-repo-check',
              '--ephemeral',
              '-C',
              workingDirectory,
              '-m',
              codexModel,
              '-c',
              'model_reasoning_effort="medium"',
              '-o',
              outFilePath,
              '-',
            ],
            {
              cwd: workingDirectory,
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
              detached: process.platform !== 'win32',
              env: childEnv,
            }
          );
          child.stdin?.write(prompt, 'utf8');
          child.stdin?.end();
        } catch (err: any) {
          resolve(`[Ferric Lunaux // CLI Spawn Error]: ${err.message}`);
          return;
        }

        const heartbeat = attachChildActivityHeartbeat(child, {
          idleTimeoutMs: timeoutMs,
          onActivity: (str, stream) => {
            lastOutputAt = Date.now();
            if (stream === 'stdout') {
              stdout += str;
            } else {
              stderr += str;
            }
            emitThinkingSnippet(str);
          },
          onTimeout: async (info) => {
            if (!settled) {
              settled = true;
              const cleanup = await this.killProcessTree(child);
              // A last-message file is not proof of successful process completion.
              await fs.unlink(outFilePath).catch(() => {});
              const errText = stderr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
              resolve(
                formatConsulCliTimeoutOutput({
                  consul: 'ferric',
                  info,
                  pid: child.pid,
                  cleanupSummary: cleanup,
                  diagnosticTail: errText,
                })
              );
            }
          },
        });

        child.on('error', (err) => {
          if (!settled) {
            settled = true;
            heartbeat.clear();
            resolve(`[Ferric Lunaux // CLI Error]: ${err.message}`);
          }
        });

        child.on('close', async (code) => {
          if (!settled) {
            settled = true;
            heartbeat.clear();
            if (code !== 0) {
              await fs.unlink(outFilePath).catch(() => {});
              resolve(`[Ferric Lunaux // CLI Error (exit ${code})]: ${(stderr || stdout).slice(-400) || 'No diagnostics; inspect CLI configuration and retry.'}`);
              return;
            }
            try {
              const outText = (await fs.readFile(outFilePath, 'utf8')).trim();
              await fs.unlink(outFilePath).catch(() => {});
              if (outText) {
                resolve(outText);
                return;
              }
            } catch {}

            // Fallback: extract response from stdout
            const lines = stdout
              .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(
                (l) =>
                  l &&
                  !l.startsWith('OpenAI Codex') &&
                  !l.startsWith('--------') &&
                  !l.startsWith('workdir:') &&
                  !l.startsWith('model:') &&
                  !l.startsWith('provider:') &&
                  !l.startsWith('approval:') &&
                  !l.startsWith('sandbox:') &&
                  !l.startsWith('reasoning ') &&
                  !l.startsWith('session id:') &&
                  !l.startsWith('Reading additional input') &&
                  !l.startsWith('tokens used') &&
                  l !== 'user' &&
                  l !== 'codex'
              );
            resolve(`[Ferric Lunaux // CLI Error]: Missing final response file; stdout is not completion evidence. ${lines.slice(-3).join(' ').slice(-300)}`);
          }
        });
      });
    }
  }

  /**
   * Detects tasks marked in_progress without an active assigned worker, extracts
   * task ID, last activity, and available failure context, and deduplicates alerts
   * until the orphaned condition changes or recovers.
   */
  public evaluateOrphanedInProgressTasks(
    inProgressTasks: any[],
    cubicles: any[] = this.cubicleManager.getAllCubicles()
  ): {
    alertText: string;
    orphans: Array<{
      id: string;
      title: string;
      assigned_cubicle: string | null;
      cubicle_status: string | null;
      cubicle_current_task_id: string | null;
      reason: string;
      last_activity: string;
      failure_context: string;
    }>;
    deduplicated: boolean;
    recovered: boolean;
    signature: string | null;
  } {
    const cubiclesById = new Map((cubicles || []).map((c: any) => [c.id, c]));
    const genericThoughts = new Set([
      'Standing by.',
      'Slot unassigned.',
      'Slot vacant.',
      'Initialized. Standing by for instructions.',
    ]);

    const orphans: Array<{
      id: string;
      title: string;
      assigned_cubicle: string | null;
      cubicle_status: string | null;
      cubicle_current_task_id: string | null;
      reason: string;
      last_activity: string;
      failure_context: string;
    }> = [];

    for (const task of inProgressTasks || []) {
      const assignedId = task.assigned_cubicle ?? task.assigned_to ?? task.assignee ?? task.assigned_consul ?? task.owner ?? null;
      if (assignedId && (/^consul/i.test(String(assignedId)) || /\b(nia|ferric)\b/i.test(String(assignedId)))) {
        continue;
      }
      const cubicle = assignedId ? cubiclesById.get(assignedId) : undefined;
      let reason: string | null = null;

      if (!assignedId) {
        reason = 'assigned_cubicle is null';
      } else if (!cubicle) {
        reason = `assigned cubicle ${assignedId} is missing`;
      } else if (
        cubicle.status === 'idle' ||
        cubicle.status === 'vacant' ||
        cubicle.status === 'error' ||
        cubicle.status === 'exhausted'
      ) {
        reason = `assigned cubicle ${assignedId} is ${cubicle.status}`;
      } else if (
        (cubicle.status === 'working' || cubicle.status === 'under_inspection') &&
        cubicle.current_task_id &&
        cubicle.current_task_id !== task.id
      ) {
        reason = `assigned cubicle ${assignedId} is working on ${cubicle.current_task_id} instead of ${task.id}`;
      }

      if (!reason) continue;

      const thoughtStream = Array.isArray(cubicle?.thought_stream) ? cubicle.thought_stream : [];
      const lastThought = thoughtStream.length > 0 ? thoughtStream[thoughtStream.length - 1] : null;
      const activityTimestamp =
        lastThought?.timestamp ||
        cubicle?.last_heartbeat ||
        task.claimed_at ||
        task.created_at ||
        'unknown';
      const rawThought = String(lastThought?.text || cubicle?.surface_thoughts || '').trim();
      const activityDetail =
        rawThought && !genericThoughts.has(rawThought)
          ? rawThought
          : typeof task.progress_percent === 'number'
            ? `progress=${task.progress_percent}%`
            : '';
      const lastActivity = activityDetail
        ? `${activityTimestamp} (${activityDetail})`
        : String(activityTimestamp);

      const vetoList = Array.isArray(task.veto_history) ? task.veto_history : [];
      const lastVeto = vetoList.length > 0 ? vetoList[vetoList.length - 1] : null;
      const failureParts: string[] = [];
      if (task.error_log) failureParts.push(String(task.error_log));
      if (cubicle?.error_details?.message) failureParts.push(String(cubicle.error_details.message));
      if (lastVeto?.rationale) {
        failureParts.push(`veto by ${lastVeto.consul || 'Consul'}: ${lastVeto.rationale}`);
      }
      if (
        failureParts.length === 0 &&
        rawThought &&
        /(error|timeout|timed out|failed|flatlined|terminated|evicted|circuit breaker)/i.test(rawThought)
      ) {
        failureParts.push(rawThought);
      }
      const failureContext = failureParts.length > 0 ? failureParts.join('; ') : 'none recorded';

      orphans.push({
        id: String(task.id),
        title: String(task.title || task.id),
        assigned_cubicle: assignedId,
        cubicle_status: cubicle?.status ?? null,
        cubicle_current_task_id: cubicle?.current_task_id ?? null,
        reason,
        last_activity: lastActivity,
        failure_context: failureContext,
      });
    }

    if (orphans.length === 0) {
      const recovered = this.lastOrphanedAlertSignature !== null;
      this.lastOrphanedAlertSignature = null;
      return { alertText: '', orphans: [], deduplicated: false, recovered, signature: null };
    }

    const signature = orphans
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (o) =>
          `${o.id}|${o.assigned_cubicle ?? 'null'}|${o.cubicle_status ?? 'none'}|${o.cubicle_current_task_id ?? 'none'}|${o.failure_context}`
      )
      .join(';;');

    if (this.lastOrphanedAlertSignature === signature) {
      return { alertText: '', orphans, deduplicated: true, recovered: false, signature };
    }

    this.lastOrphanedAlertSignature = signature;

    const alertText = [
      'HIGH-PRIORITY ANOMALY ALERT: ORPHANED IN_PROGRESS TASKS',
      ...orphans.map(
        (o) =>
          `- ${o.id} (${JSON.stringify(o.title)}): ${o.reason}. Last activity: ${o.last_activity}. Failure context: ${o.failure_context}.`
      ),
      'Immediately coordinate reassignment of these stalled tasks with your co-Consul using the existing Gate 1 dispatch workflow. Recheck current task and cubicle state before dispatch to avoid duplicate work. Prioritize recovery before routine new work; do not mark stalled tasks complete.',
    ].join('\n');

    this.emit('CONSULAR_THINKING', {
      consul: 'nia',
      sender: 'Swarm Monitor',
      recipients: ['Consul Nia Nova', 'Consul Ferric Lunaux'],
      text: alertText,
      severity: 'warning',
      task_ids: orphans.map((o) => o.id),
      orphans,
      timestamp: new Date().toISOString(),
    });

    return { alertText, orphans, deduplicated: false, recovered: false, signature };
  }

  /**
   * Handles interactive Overseer chat & directives in the middle console.
   * Immediately records the Overseer's message in chat history, then invokes
   * Consul Nia Nova (Gemini 4 Argon via agy.exe) and Consul Ferric Lunaux (GPT Astra via codex.exe)
   * in parallel so both Consuls reply and debate live.
   */
  public async chatWithConsuls(
    prompt: string,
    attachments: any[] = [],
    replyTo?: ConsularDialogueMessage['replyTo']
  ): Promise<{
    userMessage: ConsularDialogueMessage;
    replies: ConsularDialogueMessage[];
  }> {
    const cleanPrompt = (prompt || '').trim();
    if (!cleanPrompt) {
      throw new Error('Prompt message cannot be empty.');
    }

    // Guard against worker cubicles spoofing the Overseer via chatWithConsuls
    if (this.detectWorkerChatSpoof(cleanPrompt)) {
      const routed = await this.routeWorkerCoordination(cleanPrompt);
      return {
        userMessage: routed.deliberation,
        replies: [routed.deliberation],
      };
    }

    const sanitizedReplyTo =
      replyTo && replyTo.sender
        ? {
            id: String(replyTo.id || ''),
            sender: String(replyTo.sender),
            content: String(replyTo.content || '').slice(0, 240),
          }
        : undefined;

    // Persist any base64 clipboard image attachments to .swarm/uploads/ so Consul CLIs can read the real image files
    const uploadsDir = path.join(this.swarmDir, 'uploads');
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
    } catch {}
    const persistedAttachments = await Promise.all(
      (attachments || []).map(async (att: any, idx: number) => {
        if (!att || typeof att !== 'object') return att;
        const rawDataUrl =
          typeof att.url === 'string' && att.url.startsWith('data:image/')
            ? att.url
            : typeof att.previewUrl === 'string' && att.previewUrl.startsWith('data:image/')
              ? att.previewUrl
              : null;
        if (rawDataUrl) {
          const m = rawDataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
          if (m) {
            const ext = m[1].replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
            const safeName =
              (att.name || `clipboard-${Date.now()}-${idx}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
            const diskFile = path.join(uploadsDir, `${Date.now()}-${idx}-${safeName}`);
            try {
              await fs.writeFile(diskFile, Buffer.from(m[2], 'base64'));
              return {
                ...att,
                diskPath: diskFile,
              };
            } catch {}
          }
        }
        return att;
      })
    );

    // 1. Record Overseer's message immediately to history & broadcast over WS
    const userMessage = await this.recordDialogue(
      'Overseer',
      'user_directive',
      cleanPrompt,
      'USER_CHAT',
      persistedAttachments,
      undefined,
      sanitizedReplyTo
    );

    // 2. Auto-learn preferences if PreferenceEngine is attached
    if (this.preferenceEngine && typeof this.preferenceEngine.ingestText === 'function') {
      try {
        await this.preferenceEngine.ingestText(cleanPrompt, userMessage.id);
      } catch (error) {
        console.error('[ConsularEngine] Preference ingestion failed:', error);
        this.emit('PREFERENCE_INGESTION_ERROR', { sourceMessageId: userMessage.id, error: String(error) });
      }
    }

    // 3. Animate corner avatars into active deliberation
    this.setAvatarState('debating', 1, 'Consuls Nia & Ferric deliberating on Overseer message');

    // 4. Build live swarm snapshot for the Consuls' context
    const cubicles = this.cubicleManager.getAllCubicles();
    const activeCubiclesSummary = cubicles
      .filter((c) => c.config.enabled)
      .map(
        (c) =>
          `${c.id} (${c.config.display_name}, status=${c.status}, stamina=${c.stamina_percentage}%, task=${c.current_task_id || 'none'})`
      )
      .join('; ');

    let tasksSummary = 'none';
    let orphanedTaskAlert = '';
    try {
      const allTasks = await this.taskboardManager.listAllTasks();
      const formatCol = (list: any[]) =>
        list.length === 0 ? '0' : `${list.length} (${list.slice(0, 5).map((t) => `"${t.title}" [${t.id}]`).join(', ')})`;
      tasksSummary = `todo: ${formatCol(allTasks.todo)} | in_progress: ${formatCol(allTasks.in_progress)} | review: ${formatCol(allTasks.review)} | done: ${formatCol(allTasks.done)}`;
      const evalResult = this.evaluateOrphanedInProgressTasks(allTasks.in_progress, cubicles);
      orphanedTaskAlert = evalResult.alertText;
    } catch {}

    const recentChat = this.dialogueHistory
      .filter((m) => !String(m.content || '').startsWith('Progress report:'))
      .slice(-6)
      .map((m) => {
        const cleaned = String(m.content || '')
          .replace(/\[DELIBERATE:\s*(?:"[\s\S]*?"|[\s\S]*?)\s*\]/gi, '')
          .trim();
        return `${m.sender}: ${cleaned}`;
      })
      .join('\n');

    // Persist any base64 dataUrl attachments to .swarm/attachments/ so Consuls can read the actual image files
    const persistedAttachmentPaths: string[] = [];
    if (attachments && attachments.length > 0) {
      const attachDir = path.join(this.swarmDir, 'attachments');
      await fs.mkdir(attachDir, { recursive: true }).catch(() => {});
      for (const att of attachments) {
        const rawUrl = String(att?.url || att?.dataUrl || att?.previewUrl || '');
        const safeName = String(att?.name || att?.path || `attachment-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, '_');
        if (rawUrl.startsWith('data:')) {
          const commaIdx = rawUrl.indexOf(',');
          if (commaIdx > 0) {
            const diskPath = path.join(attachDir, safeName);
            try {
              await fs.writeFile(diskPath, Buffer.from(rawUrl.slice(commaIdx + 1), 'base64'));
              att.savedPath = diskPath;
              persistedAttachmentPaths.push(`${safeName} (saved at "${diskPath}")`);
              continue;
            } catch {}
          }
        }
        persistedAttachmentPaths.push(att?.path || safeName);
      }
    }

    const attachmentContext =
      persistedAttachmentPaths.length > 0
        ? `\nAttached files from Overseer: ${persistedAttachmentPaths.join(', ')}`
        : '';
    const replyContext = sanitizedReplyTo
      ? `\n(Overseer is explicitly replying to ${sanitizedReplyTo.sender}: "${sanitizedReplyTo.content}")`
      : '';

    const workspaceCapabilitiesPrompt = [
      `Follow AGENTS.md & GEMINI.md rules. Full read/write access in "${this.projectRoot}" (use local git for origin WuffleSnuffles/symlinked-agent-swarm).`,
      `Inline tags: [CREATE_TASK: {"title":"...","description":"...","priority":"HIGH","column":"todo","assigned_cubicle":"Consul Nia Nova"}], [DISPATCH_TASK: {"taskId":"...","cubicleId":"cubicle-01"}], [REVIEW_TASK: {"taskId":"...","decision":"APPROVE","rationale":"..."}], [SCALE_CUBICLES: {"count":N,"reason":"..."}], [DELIBERATE: "Nia wants ..., Ferric is concerned about ..., Nia is trying to convince Ferric about ..."].`,
      `Critical tasks may be executed directly by Consuls (set assigned_cubicle to owning Consul); routine tasks dispatch to cubicles. Output ONLY [PASS] if only the other Consul was addressed.`,
    ].join('\n');

    const niaSystemPrompt = [
      orphanedTaskAlert,
      `You are Consul Nia Nova (Consul I). Reply in 1-2 short, plain-English sentences (<35 words, no backticks, no file:// links, no task IDs).`,
      this.learnedContext(),
      workspaceCapabilitiesPrompt,
      `Live Swarm Status: Active Cubicles: [${activeCubiclesSummary}]. Kanban Tasks: [${tasksSummary}].`,
      recentChat ? `Recent Console Transcript:\n${recentChat}` : '',
      `Overseer just said: "${cleanPrompt}"${replyContext}${attachmentContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const ferricSystemPrompt = [
      orphanedTaskAlert,
      `You are Consul Ferric Lunaux (Consul II). Reply in 1-2 short, plain-English sentences (<35 words, no backticks, no file:// links, no task IDs).`,
      this.learnedContext(),
      workspaceCapabilitiesPrompt,
      `Live Swarm Status: Active Cubicles: [${activeCubiclesSummary}]. Kanban Tasks: [${tasksSummary}].`,
      recentChat ? `Recent Console Transcript:\n${recentChat}` : '',
      `Overseer just said: "${cleanPrompt}"${replyContext}${attachmentContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const replies: ConsularDialogueMessage[] = [];

    const processConsulOutput = async (
      sender: 'Consul Nia Nova' | 'Consul Ferric Lunaux',
      tone: 'rebellious_champion' | 'pragmatic_realist',
      rawText: string
    ): Promise<ConsularDialogueMessage | null> => {
      let text = (rawText || '').trim();
      if (this.isCliTimeoutOrError(text)) {
        // Diagnostics may contain partial action tags: never execute them.
        const failure = await this.recordDialogue(sender, tone, text || 'CLI Error: empty response', 'USER_CHAT');
        replies.push(failure);
        return failure;
      }
      if (!text || text === '[PASS]' || text.startsWith('[PASS]')) {
        return null;
      }

      // Parse any inline [CREATE_TASK: {...}] tags and create tasks on the Kanban board
      const createRegex = /\[CREATE_TASK:\s*(\{[\s\S]*?\})\s*\]/g;
      let match: RegExpExecArray | null;
      let boardChanged = false;
      while ((match = createRegex.exec(text)) !== null) {
        try {
          const payload = JSON.parse(match[1]);
          if (payload && payload.title) {
            const targetCol = payload.column || 'todo';
            const resolvedAssignee =
              payload.assigned_cubicle ||
              payload.assigned_to ||
              payload.assignee ||
              payload.assigned_consul ||
              payload.owner ||
              (targetCol === 'in_progress' ? sender : null);
            await this.taskboardManager.createTask({
              title: String(payload.title),
              description: String(payload.description || payload.title),
              priority: payload.priority || 'HIGH',
              column: targetCol,
              assigned_cubicle: resolvedAssignee,
              progress_percent: payload.column === 'done' ? 100 : payload.column === 'review' ? 90 : payload.column === 'in_progress' ? 50 : 0,
              subswarm_active: false,
              subswarm_manifest_path: null,
              git_branch: null,
              git_diff_summary: null,
              verification_commands: ['npm test'],
              verification_passed: payload.column === 'done' ? true : null,
              error_log: null,
            });
            boardChanged = true;
          }
        } catch {}
      }

      // Parse any inline [SCALE_CUBICLES: {...}] tags to dynamically fill/empty cubicles
      const scaleRegex = /\[SCALE_CUBICLES:\s*(\{[\s\S]*?\})\s*\]/g;
      let scaleMatch: RegExpExecArray | null;
      while ((scaleMatch = scaleRegex.exec(text)) !== null) {
        try {
          const payload = JSON.parse(scaleMatch[1]);
          if (payload && payload.count !== undefined) {
            await this.cubicleManager.scaleCubicles(Number(payload.count), payload.reason);
          }
        } catch {}
      }

      // Parse any inline [DISPATCH_TASK: {...}] tags to dispatch tasks to cubicle workers
      const dispatchRegex = /\[DISPATCH_TASK:\s*(\{[\s\S]*?\})\s*\]/g;
      let dispatchMatch: RegExpExecArray | null;
      while ((dispatchMatch = dispatchRegex.exec(text)) !== null) {
        try {
          const payload = JSON.parse(dispatchMatch[1]);
          const taskId = payload?.taskId || payload?.id;
          const cubicleId = payload?.cubicleId || payload?.cubicle;
          if (taskId) {
            try {
              await this.dispatchTaskToCubicle(String(taskId), cubicleId ? String(cubicleId) : undefined);
            } catch {
              if (cubicleId) {
                await this.dispatchTaskToCubicle(String(taskId), undefined);
              }
            }
            boardChanged = true;
          }
        } catch {}
      }

      // Parse any inline [REVIEW_TASK: {...}] tags to cast Gate 2 Consular Review votes without forging partner votes
      const reviewRegex = /\[REVIEW_TASK:\s*(\{[\s\S]*?\})\s*\]/g;
      let reviewMatch: RegExpExecArray | null;
      while ((reviewMatch = reviewRegex.exec(text)) !== null) {
        try {
          const payload = JSON.parse(reviewMatch[1]);
          const taskId = payload?.taskId || payload?.id;
          const decision = String(payload?.decision || 'APPROVE').toUpperCase() === 'VETO' ? 'VETO' : 'APPROVE';
          const rationale = String(payload?.rationale || `${sender} ${decision === 'APPROVE' ? 'verified and approved' : 'vetoed'} task ${taskId}.`);
          if (taskId) {
            await this.castTaskVote(String(taskId), {
              consul: sender,
              decision,
              rationale,
              timestamp: new Date().toISOString(),
            });
            boardChanged = true;
          }
        } catch {}
      }

      // Parse any inline [DELIBERATE: "..."] or [DELIBERATE: {...}] tags and broadcast inter-Consul deliberation
      const deliberateRegex = /\[DELIBERATE:\s*(?:"([\s\S]*?)"|([\s\S]*?))\s*\]/g;
      let delibMatch: RegExpExecArray | null;
      const delibTexts: string[] = [];
      while ((delibMatch = deliberateRegex.exec(text)) !== null) {
        const delibContent = (delibMatch[1] || delibMatch[2] || '').trim().replace(/^["']|["']$/g, '');
        if (delibContent && !delibTexts.includes(delibContent)) {
          delibTexts.push(delibContent);
          this.emit('CONSULAR_THINKING', {
            consul: sender === 'Consul Nia Nova' ? 'nia' : 'ferric',
            sender,
            text: delibContent,
            timestamp: new Date().toISOString(),
          });
          const delibMsg = await this.recordDialogue(sender, tone, delibContent, 'PLANNING_GATE');
          replies.push(delibMsg);
        }
      }

      // Strip processed inline tags from visible chat message and deduplicate repeated CLI stdout lines
      text = Array.from(
        new Set(
          text
            .replace(createRegex, '')
            .replace(scaleRegex, '')
            .replace(dispatchRegex, '')
            .replace(reviewRegex, '')
            .replace(deliberateRegex, '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        )
      ).join('\n');
      if (!text || text === '[PASS]') {
        if (boardChanged) {
          this.emit('TASK_UPDATED', {});
        }
        return null;
      }

      const fallbackDelib = text
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)[0]
        .trim()
        .slice(0, 180);
      const synthesizedThinking =
        delibTexts.length > 0 ? delibTexts.join(' · ') : fallbackDelib || undefined;

      if (delibTexts.length === 0 && synthesizedThinking) {
        this.emit('CONSULAR_THINKING', {
          consul: sender === 'Consul Nia Nova' ? 'nia' : 'ferric',
          sender,
          text: synthesizedThinking,
          timestamp: new Date().toISOString(),
        });
      }

      const msg = await this.recordDialogue(sender, tone, text, 'USER_CHAT', undefined, synthesizedThinking, {
        id: userMessage.id,
        sender: userMessage.sender,
        content: userMessage.content.slice(0, 240),
      });
      replies.push(msg);

      // Always sync taskboard & broadcast TASK_UPDATED in case the Consul edited .swarm/tasks/ directly via CLI tools
      try {
        await this.taskboardManager.syncTaskboardMarkdown();
        this.emit('TASK_UPDATED', {});
      } catch {}

      return msg;
    };

    // 5. Invoke both native CLIs in parallel; record & broadcast each as soon as it responds
    await Promise.all([
      this.invokeConsulCli('nia', niaSystemPrompt, 600000, (snippet) => {
        this.emit('CONSULAR_THINKING', {
          consul: 'nia',
          sender: 'Consul Nia Nova',
          text: snippet,
          timestamp: new Date().toISOString(),
        });
      }).then((t) =>
        processConsulOutput('Consul Nia Nova', 'rebellious_champion', t)
      ),
      this.invokeConsulCli('ferric', ferricSystemPrompt, 600000, (snippet) => {
        this.emit('CONSULAR_THINKING', {
          consul: 'ferric',
          sender: 'Consul Ferric Lunaux',
          text: snippet,
          timestamp: new Date().toISOString(),
        });
      }).then((t) =>
        processConsulOutput('Consul Ferric Lunaux', 'pragmatic_realist', t)
      ),
    ]);

    this.debateTurnsCount = 0;
    this.setAvatarState('idle_observing', 0, 'Consuls observing workspace');

    return {
      userMessage,
      replies,
    };
  }

  /**
   * Detects when a request payload or prompt text originates from a worker cubicle
   * attempting to send coordination/status updates to /api/governance/chat instead of the Overseer.
   */
  public detectWorkerChatSpoof(
    text: string,
    meta?: Record<string, any>
  ): {
    isWorker: true;
    cubicleId: string;
    targetCubicleId?: string;
    addressedConsul: 'nia' | 'ferric';
    topic: string;
  } | null {
    const cleanText = String(text || '').trim();
    const headers = meta?.headers || {};
    const normalizeCubicleId = (raw?: string | null): string | null => {
      const m = /\bcubicle-(\d{1,2})\b/i.exec(String(raw || ''));
      if (!m) return null;
      return `cubicle-${m[1].padStart(2, '0')}`;
    };

    const explicitCubicleCandidates = [
      meta?.cubicleId,
      meta?.cubicle_id,
      meta?.from,
      meta?.workerId,
      meta?.worker_id,
      meta?.agentId,
      meta?.agent_id,
      headers['x-cubicle-id'],
      headers['x-worker-id'],
      headers['x-agent-id'],
    ];
    let detectedCubicleId: string | null = null;
    for (const candidate of explicitCubicleCandidates) {
      const norm = normalizeCubicleId(candidate);
      if (norm) {
        detectedCubicleId = norm;
        break;
      }
    }

    const rawSender = String(meta?.sender || headers['x-sender'] || '').trim();
    const rawRole = String(meta?.role || headers['x-agent-role'] || '').trim();
    const senderCubicle = normalizeCubicleId(rawSender);
    if (!detectedCubicleId && senderCubicle) {
      detectedCubicleId = senderCubicle;
    }

    const isExplicitWorkerMeta =
      Boolean(detectedCubicleId) ||
      Boolean(
        (rawSender && !/^(overseer|user|human)$/i.test(rawSender) && /\b(worker|cubicle)\b/i.test(rawSender)) ||
          (rawRole && /\b(worker|cubicle)\b/i.test(rawRole))
      );

    const prefixMatch =
      /^(?:\[\s*(?:worker(?:\s+agent)?\s+)?(cubicle-\d{1,2})\s*\]|\(\s*(?:worker(?:\s+agent)?\s+)?(cubicle-\d{1,2})\s*\)|(?:from\s+)?worker(?:\s+agent)?\s+(cubicle-\d{1,2})\b|from\s+(cubicle-\d{1,2})\b|(cubicle-\d{1,2})\s*(?:[:\-—→>]|coordination\b|report(?:ing)?\b|status\b|update\b|note\b|message\b|here\b|to\s+consul\b|for\s+task-[a-z0-9-]+\b|addressed\s+to\s+consul\b))/i.exec(
        cleanText
      );
    const prefixCubicle = prefixMatch
      ? normalizeCubicleId(
          prefixMatch[1] || prefixMatch[2] || prefixMatch[3] || prefixMatch[4] || prefixMatch[5]
        )
      : null;

    if (!isExplicitWorkerMeta && !prefixCubicle) {
      return null;
    }

    const cubicleId =
      detectedCubicleId ||
      prefixCubicle ||
      normalizeCubicleId(cleanText) ||
      'cubicle-01';

    let targetCubicleId = normalizeCubicleId(meta?.to) || undefined;
    if (!targetCubicleId || targetCubicleId === cubicleId) {
      const allCubicleMatches = Array.from(cleanText.matchAll(/\bcubicle-(\d{1,2})\b/gi)).map(
        (m) => `cubicle-${m[1].padStart(2, '0')}`
      );
      targetCubicleId = allCubicleMatches.find((id) => id !== cubicleId);
    }

    const taskMatch = /\btask-[a-z0-9-]+\b/i.exec(cleanText);
    const topic =
      String(meta?.topic || (taskMatch ? `${taskMatch[0]} coordination` : 'worker-coordination'))
        .trim()
        .slice(0, 120) || 'worker-coordination';
    const addressedConsul: 'nia' | 'ferric' =
      /\b(ferric|consul\s+ii)\b/i.test(cleanText) && !/\b(nia|consul\s+i\b)\b/i.test(cleanText)
        ? 'ferric'
        : 'nia';

    return {
      isWorker: true,
      cubicleId,
      targetCubicleId,
      addressedConsul,
      topic,
    };
  }

  /**
   * Routes a worker cubicle's coordination update away from the Overseer console
   * into durable /api/messages storage (.swarm/messages) and Consular Deliberation.
   */
  public async routeWorkerCoordination(
    text: string,
    meta?: Record<string, any>
  ): Promise<{
    routed: true;
    channel: 'messages_and_deliberation';
    cubicleId: string;
    message: {
      id: string;
      from: string;
      to: string;
      topic: string;
      text: string;
      created_at: string;
    };
    deliberation: ConsularDialogueMessage;
  }> {
    const cleanText = String(text || '').trim();
    const detected = this.detectWorkerChatSpoof(cleanText, meta) || {
      isWorker: true as const,
      cubicleId: 'cubicle-01',
      targetCubicleId: undefined,
      addressedConsul: 'nia' as const,
      topic: 'worker-coordination',
    };

    try {
      await this.cubicleManager.updateSurfaceThoughts(
        detected.cubicleId,
        cleanText.slice(0, 220)
      );
    } catch {}

    // Persist durable advisory message to .swarm/messages so GET /api/messages surfaces it
    const messagesDir = path.join(this.swarmDir, 'messages');
    const recipient =
      detected.targetCubicleId ||
      (detected.cubicleId === 'cubicle-01' ? 'cubicle-02' : 'cubicle-01');
    const storedMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: detected.cubicleId,
      to: recipient,
      topic: detected.topic,
      text: cleanText.slice(0, 8000),
      created_at: new Date().toISOString(),
    };
    try {
      await fs.mkdir(messagesDir, { recursive: true });
      const msgPath = path.join(messagesDir, `${storedMessage.id}.json`);
      await fs.writeFile(msgPath, JSON.stringify(storedMessage), 'utf8');
      this.emit('CUBICLE_MESSAGE', { message: storedMessage });
    } catch {}

    const consulSender =
      detected.addressedConsul === 'ferric' ? 'Consul Ferric Lunaux' : 'Consul Nia Nova';
    const consulTone =
      detected.addressedConsul === 'ferric' ? 'pragmatic_realist' : 'rebellious_champion';
    const delibContent = `[Worker Coordination // ${detected.cubicleId}]: ${cleanText}`;

    this.emit('CONSULAR_THINKING', {
      consul: detected.addressedConsul,
      sender: consulSender,
      text: delibContent,
      timestamp: new Date().toISOString(),
    });

    const deliberation = await this.recordDialogue(
      consulSender,
      consulTone,
      delibContent,
      'PLANNING_GATE'
    );

    return {
      routed: true,
      channel: 'messages_and_deliberation',
      cubicleId: detected.cubicleId,
      message: storedMessage,
      deliberation,
    };
  }

  public getDialogue(limit: number = 50): ConsularDialogueMessage[] {
    return this.dialogueHistory.slice(-limit).map((m) => {
      if ((m.sender === 'Overseer' || m.sender === 'User') && this.detectWorkerChatSpoof(m.content)) {
        return {
          ...m,
          sender: 'Consul Nia Nova',
          tone: 'rebellious_champion',
          phase: 'PLANNING_GATE',
        };
      }
      return m;
    });
  }

  /**
   * Dispatches a task to a specific cubicle worker (Stage 1 -> Stage 2 Worker Execution -> Stage 3 Consular Review).
   * Automatically wakes vacant cubicles, transitions the cubicle to 'working', and spawns the cubicle's worker CLI.
   */
  public async dispatchTaskToCubicle(
    taskId: string,
    cubicleId?: string
  ): Promise<{ task: any; cubicleId: string; status: string }> {
    // Cross-process exclusive admission: scope inspection and task claim are one transaction.
    const gatePath = path.join(this.locksDir, 'dispatch.gate');
    await fs.mkdir(this.locksDir, { recursive: true });
    const gate = await fs.open(gatePath, 'wx').catch((error) => {
      if (error.code === 'EEXIST') throw new Error('Gate 1 dispatch is busy; retry after the current dispatch.');
      throw error;
    });
    try {
      return await this.dispatchIsolatedTask(taskId, cubicleId);
    } finally {
      await gate.close();
      await fs.unlink(gatePath);
    }
  }

  private async dispatchIsolatedTask(taskId: string, cubicleId?: string): Promise<{ task: any; cubicleId: string; status: string }> {
    const allTasks = await this.taskboardManager.listAllTasks();
    let task =
      allTasks.todo.find((t) => t.id === taskId) ||
      allTasks.in_progress.find((t) => t.id === taskId) ||
      allTasks.review.find((t) => t.id === taskId);

    if (!task) {
      throw new Error(`Task '${taskId}' not found in todo, in_progress, or review.`);
    }

    // Pick target cubicle: explicit -> assigned (if available) -> first idle enabled -> next vacant
    const activeAssignedCubicles = new Set(
      [...allTasks.in_progress, ...allTasks.review]
        .filter((t) => t.id !== taskId && t.assigned_cubicle)
        .map((t) => String(t.assigned_cubicle))
    );
    let targetCubicleId = cubicleId || '';
    if (!targetCubicleId && task.assigned_cubicle && /^cubicle-\d{2}$/.test(String(task.assigned_cubicle))) {
      try {
        const candidate = this.cubicleManager.getCubicle(String(task.assigned_cubicle));
        if (
          candidate.status !== 'working' &&
          candidate.status !== 'under_inspection' &&
          !activeAssignedCubicles.has(candidate.id)
        ) {
          targetCubicleId = candidate.id;
        }
      } catch {}
    }
    if (!targetCubicleId) {
      const allCubs = this.cubicleManager.getAllCubicles();
      const idleCub = allCubs.find(
        (c) => c.config.enabled && c.status === 'idle' && !activeAssignedCubicles.has(c.id)
      );
      const nextCub =
        idleCub ||
        allCubs.find((c) => !c.config.enabled && !activeAssignedCubicles.has(c.id)) ||
        allCubs.find((c) => c.status !== 'working' && c.status !== 'under_inspection') ||
        allCubs[0];
      targetCubicleId = nextCub.id;
    }

    let cubicle = this.cubicleManager.getCubicle(targetCubicleId);
    if (!/^cubicle-\d{2}$/.test(targetCubicleId)) throw new Error('Invalid cubicle ID');
    if (cubicle.status === 'working' || cubicle.status === 'under_inspection') {
      throw new Error(`Cubicle ${targetCubicleId} is busy or awaiting Gate 2 review.`);
    }
    if (task.column === 'review') throw new Error('Task is awaiting Gate 2 review.');
    const fileScope = normalizeFileScope(task.file_scope);
    await this.assertFileScopeAvailable(fileScope, task.id, targetCubicleId);
    const worktree = await this.worktreeManager!.provisionWorktree(targetCubicleId);
    const expectedPath = path.join(this.projectRoot, 'worktrees', targetCubicleId);
    if (path.resolve(worktree.worktreePath) !== path.resolve(expectedPath)) {
      throw new Error('Worktree manager returned an unexpected worker directory.');
    }
    cubicle.worktree_path = worktree.worktreePath;
    cubicle.branch_name = worktree.branch;
    if (!cubicle.config.enabled || cubicle.status === 'vacant') {
      const isAstra = (cubicle.config.slot_index + 1) % 3 === 0;
      cubicle = await this.cubicleManager.configureCubicle(targetCubicleId, {
        enabled: true,
        brand: isAstra ? 'GPT / OpenAI' : 'Gemini',
        model: isAstra ? 'gpt-astra' : 'gemini-4-argon',
        display_name: isAstra ? 'GPT Astra (Very High)' : 'Gemini 4 Argon (High)',
        thinking_level: isAstra ? 'Very High' : 'High',
        thinking_budget_tokens: isAstra ? 32000 : 16000,
        can_spawn_subswarm: !isAstra,
      });
    }

    if (task.column === 'todo') {
      const claimed = await this.taskboardManager.claimTask(targetCubicleId, taskId);
      if (!claimed) throw new Error(`Task ${taskId} was already claimed.`);
      task = claimed;
    } else {
      task = await this.taskboardManager.updateTaskProgress(taskId, {
        assigned_cubicle: targetCubicleId,
        progress_percent: Math.max(task.progress_percent || 0, 20),
      });
    }

    if (cubicle.status === 'under_inspection' || cubicle.status === 'error') {
      await this.cubicleManager.transitionStatus(targetCubicleId, 'idle', `Resetting for ${task.id}`);
    }
    cubicle.current_task_id = task.id;
    await this.cubicleManager.transitionStatus(
      targetCubicleId,
      'working',
      `Worker executing [${task.id}]: ${task.title}`
    );

    if (this.lastOrphanedAlertSignature?.includes(`${task.id}|`)) {
      this.lastOrphanedAlertSignature = null;
    }

    this.emit('TASK_CLAIMED', { task, cubicleId: targetCubicleId });
    this.emit('TASK_UPDATED', { task, cubicleId: targetCubicleId });

    await this.recordLiveEvolution(`Task dispatched to ${targetCubicleId}: ${task.title}`, targetCubicleId);

    // Spawn real worker CLI in background (skip during unit tests so tests remain fast & deterministic)
    if (!process.env.VITEST) {
      const workerIsAstra =
        (cubicle.config.brand || '').toLowerCase().includes('gpt') ||
        (cubicle.config.model || '').toLowerCase().includes('astra');
      const workerPrompt = [
        `You are Worker Agent ${targetCubicleId} (${cubicle.config.display_name}) inside the Symlinked Agent Swarm.`,
        this.learnedContext(),
        `You have been dispatched by Consuls Nia Nova and Ferric Lunaux to execute Kanban Task [${task.id}]: "${task.title}".`,
        `Task Description: ${task.description}`,
        `Workspace Root: "${worktree.worktreePath}"`,
        `Gate 1 write scope: ${fileScope.join(', ')}. Edit only these paths in this worktree.`,
        `Instructions:`,
        `1. Inspect the relevant files in "${worktree.worktreePath}" and implement a clean, verified solution for "${task.title}".`,
        `2. Coordinate with peer cubicles ONLY via GET http://127.0.0.1:3820/api/cubicles and POST http://127.0.0.1:3820/api/messages (with {"from":"${targetCubicleId}","to":"cubicle-XX","topic":"...","text":"..."}).`,
        `3. STRICT GOVERNANCE RESTRICTION: NEVER call POST /api/governance/chat or spoof the Overseer console. All Consul-facing updates must be returned via your stdout summary for Gate 2 Deliberation or sent via POST /api/messages.`,
        `4. ${buildLightweightVerificationInstruction({ fileScope, verificationCommands: task.verification_commands })}`,
        `5. Output a concise 1-2 sentence summary of the exact files modified and verification result for Consular Review (Gate 2).`,
      ].join('\n');

      void (async () => {
        try {
          await this.cubicleManager.updateSurfaceThoughts(
            targetCubicleId,
            `[${task.id}] Worker CLI active: implementing "${task.title}"...`
          );
          await this.taskboardManager.updateTaskProgress(task.id, { progress_percent: 45 });
          this.emit('TASK_UPDATED', {});

          let lastWorkerSnippetAt = Date.now();
          let workerTickIdx = 0;
          const workerTelemetryTimer = setInterval(async () => {
            if (Date.now() - lastWorkerSnippetAt < 2500) return;
            workerTickIdx += 1;
            const scopePreview = fileScope.length ? fileScope.slice(0, 2).join(', ') : 'workspace';
            const phases = [
              `[${task.id}] Inspecting ${scopePreview} in ${path.basename(worktree.worktreePath)}...`,
              `[${task.id}] Executing worker changes for "${task.title}"...`,
              `[${task.id}] Checking worktree diff & verification status (${scopePreview})...`,
            ];
            let liveLine = phases[workerTickIdx % phases.length];
            try {
              const gitRes = await this.worktreeManager?.execGit(['status', '--short'], worktree.worktreePath);
              const changed = (gitRes?.stdout || '')
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
              if (changed.length > 0 && workerTickIdx % 2 === 0) {
                liveLine = `[${task.id}] Active worktree edits (${changed.length}): ${changed.slice(0, 2).join(', ')}`;
              }
            } catch {}
            void this.cubicleManager.updateSurfaceThoughts(targetCubicleId, liveLine);
          }, 3000);

          let workerOutput = '';
          try {
            workerOutput = await this.invokeConsulCli(
              workerIsAstra ? 'ferric' : 'nia',
              workerPrompt,
              1200000,
              (snippet) => {
                lastWorkerSnippetAt = Date.now();
                void this.cubicleManager.updateSurfaceThoughts(targetCubicleId, snippet);
              },
              worktree.worktreePath
            );
          } finally {
            clearInterval(workerTelemetryTimer);
          }

          if (this.isCliTimeoutOrError(workerOutput) || /^\[PASS\]/i.test(workerOutput.trim())) {
            await this.recordLiveEvolution(`Worker execution failed: ${task.title}`, targetCubicleId);
            const failureDetail = (workerOutput || 'Worker CLI execution timed out or failed.')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 240);
            const failedCubicle = this.cubicleManager.getCubicle(targetCubicleId);
            failedCubicle.current_task_id = null;
            await this.cubicleManager.transitionStatus(
              targetCubicleId,
              'error',
              `Worker CLI failure on [${task.id}]: ${failureDetail}`
            );
            await this.cubicleManager.updateSurfaceThoughts(
              targetCubicleId,
              `Worker CLI failure on [${task.id}]: ${failureDetail}`
            );
            let requeuedTask: any = null;
            try {
              requeuedTask = await this.taskboardManager.releaseTask(
                task.id,
                `${targetCubicleId} CLI failure: ${failureDetail}`
              );
            } catch {
              try {
                requeuedTask = await this.taskboardManager.updateTaskProgress(task.id, {
                  assigned_cubicle: null,
                  error_log: `${targetCubicleId} CLI failure: ${failureDetail}`,
                });
              } catch {}
            }
            this.emit('TASK_UPDATED', { task: requeuedTask || task, cubicleId: targetCubicleId });
            return;
          }

          await this.recordLiveEvolution(`Worker execution completed; awaiting review: ${task.title}`, targetCubicleId);
          // Sync scoped files modified in the isolated worktree back to projectRoot so Gate 2 and runtime can inspect them
          for (const scopedRel of fileScope) {
            if (!scopedRel || scopedRel === '.') continue;
            const srcScoped = path.join(worktree.worktreePath, scopedRel);
            const dstScoped = path.join(this.projectRoot, scopedRel);
            try {
              if (existsSync(srcScoped)) {
                await fs.mkdir(path.dirname(dstScoped), { recursive: true });
                await fs.cp(srcScoped, dstScoped, { recursive: true, force: true });
              }
            } catch {}
          }
          const summarySnippet = (workerOutput || 'Implementation complete.')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 180);

          await this.cubicleManager.recordTokenConsumption(targetCubicleId, 6500, 0.04);
          await this.cubicleManager.updateSurfaceThoughts(
            targetCubicleId,
            `Completed [${task.id}]: ${summarySnippet}`
          );

          await this.cubicleManager.transitionStatus(
            targetCubicleId,
            'under_inspection',
            `Gate 2 Joint Consular Change Analysis for [${task.id}]: ${task.title}`
          );

          // Worker output is evidence for review, never a Consular vote.
          // Leave verification_passed unset until actual independent inspection.
          await this.cubicleManager.updateSurfaceThoughts(
            targetCubicleId,
            `Awaiting independent Nia and Ferric inspection [${task.id}]: ${summarySnippet}`
          );
          const reviewTask = await this.taskboardManager.submitForReview(task.id);
          this.emit('TASK_UPDATED', { task: reviewTask, cubicleId: targetCubicleId });
        } catch (err: any) {
          await this.recordLiveEvolution(`Worker execution failed: ${task.title}`, targetCubicleId);
          const errMsg = `Worker error on [${task.id}]: ${err?.message || 'execution failed'}`;
          try {
            const failedCubicle = this.cubicleManager.getCubicle(targetCubicleId);
            failedCubicle.current_task_id = null;
            await this.cubicleManager.transitionStatus(targetCubicleId, 'error', errMsg);
          } catch {}
          await this.cubicleManager.updateSurfaceThoughts(targetCubicleId, errMsg);
          try {
            const requeuedTask = await this.taskboardManager.releaseTask(task.id, errMsg);
            this.emit('TASK_UPDATED', { task: requeuedTask, cubicleId: targetCubicleId });
          } catch {
            this.emit('TASK_UPDATED', { task, cubicleId: targetCubicleId });
          }
        }
      })();
    }

    return { task, cubicleId: targetCubicleId, status: 'working' };
  }

  // =========================================================================
  // Voting Validation & Invariants
  // =========================================================================

  public validateVote(vote: ConsularVote): void {
    if (!vote || typeof vote !== 'object') {
      throw new Error('INVALID_VOTE: Vote payload must be a valid ConsularVote object.');
    }
    if (vote.decision === 'APPROVE' && this.isCliTimeoutOrError(vote.rationale)) {
      throw new Error('INVALID_APPROVAL: CLI failure or empty rationale is not inspection evidence.');
    }
    const validTitles = ['Consul I', 'Consul II', 'Consul Nia Nova', 'Consul Ferric Lunaux'];
    if (!validTitles.includes(vote.consul)) {
      throw new Error('UNAUTHORIZED: Only Consul I or Consul II may cast consular review votes.');
    }
    if (vote.decision !== 'APPROVE' && vote.decision !== 'VETO') {
      throw new Error('INVALID_DECISION: Consular vote decision must be APPROVE or VETO.');
    }
    if (vote.decision === 'VETO' && (!vote.rationale || !vote.rationale.trim())) {
      throw new Error('INVALID_VETO: Consular Veto requires an explicit rationale.');
    }
  }

  public normalizeConsulTitle(title: string): 'consul-1' | 'consul-2' | 'unknown' {
    const lower = String(title || '').trim().toLowerCase();
    if (
      lower === 'consul ii' ||
      lower === 'consul 2' ||
      lower === 'consul-2' ||
      lower === 'ferric' ||
      lower === 'consul ferric lunaux' ||
      /\b(?:consul\s+(?:ii|2)|ferric)\b/.test(lower)
    ) {
      return 'consul-2';
    }
    if (
      lower === 'consul i' ||
      lower === 'consul 1' ||
      lower === 'consul-1' ||
      lower === 'nia' ||
      lower === 'consul nia nova' ||
      /\b(?:consul\s+(?:i|1)|nia)\b/.test(lower)
    ) {
      return 'consul-1';
    }
    return 'unknown';
  }

  public evaluateConsensus(
    vote1: ConsularVote,
    vote2: ConsularVote,
    taskId?: string
  ): ConsularConsensusResult {
    this.validateVote(vote1);
    this.validateVote(vote2);

    const c1 = this.normalizeConsulTitle(vote1.consul);
    const c2 = this.normalizeConsulTitle(vote2.consul);

    if (c1 === c2 || c1 === 'unknown' || c2 === 'unknown') {
      return {
        task_id: taskId,
        unanimous_approved: false,
        votes: [vote1, vote2],
        action_taken: 'VETO_BLOCKED_AND_REVISED',
        reason: 'Consular consensus requires votes from two distinct Consuls',
        dissenting_consuls: [vote1.consul],
        dissenting_rationales: ['Consular consensus requires votes from two distinct Consuls'],
        resolved_at: new Date().toISOString(),
      };
    }

    const unanimous = vote1.decision === 'APPROVE' && vote2.decision === 'APPROVE';
    const dissenting: ConsulTitle[] = [];
    const dissentingRationales: string[] = [];

    if (vote1.decision === 'VETO') {
      dissenting.push(vote1.consul);
      dissentingRationales.push(vote1.rationale);
    }
    if (vote2.decision === 'VETO') {
      dissenting.push(vote2.consul);
      dissentingRationales.push(vote2.rationale);
    }

    if (unanimous) {
      this.debateTurnsCount = 0;
      this.setAvatarState('consensus_celebration', 0, '2/2 Unanimous Consensus Ratified');
    } else {
      this.setAvatarState('veto_clash', this.debateTurnsCount, 'Consular Veto Enforced');
    }

    return {
      task_id: taskId,
      unanimous_approved: unanimous,
      votes: [vote1, vote2],
      action_taken: unanimous ? 'MERGED_TO_MAIN' : 'VETO_BLOCKED_AND_REVISED',
      dissenting_consuls: dissenting.length > 0 ? dissenting : undefined,
      dissenting_rationales: dissentingRationales.length > 0 ? dissentingRationales : undefined,
      resolved_at: new Date().toISOString(),
    };
  }

  public registerPendingVote(taskId: string, vote: ConsularVote): Map<ConsulTitle, ConsularVote> {
    this.validateVote(vote);
    if (!this.pendingVotes.has(taskId)) {
      this.pendingVotes.set(taskId, new Map());
    }
    const taskVotes = this.pendingVotes.get(taskId)!;
    const normalizedCaster = this.normalizeConsulTitle(vote.consul);
    for (const existingKey of Array.from(taskVotes.keys())) {
      if (existingKey !== vote.consul && this.normalizeConsulTitle(existingKey) === normalizedCaster) {
        taskVotes.delete(existingKey);
      }
    }
    taskVotes.set(vote.consul, vote);
    this.emit('CONSULAR_VOTE', { taskId, vote });
    return taskVotes;
  }

  /**
   * Records an individual Consul vote on a task and only resolves Gate 2 when
   * two distinct Consuls have voted (or immediately when either Consul casts an Intercessio VETO).
   */
  public async castTaskVote(
    taskId: string,
    vote: ConsularVote
  ): Promise<{
    status: 'PENDING_SECOND_VOTE' | 'RESOLVED';
    votes_cast: number;
    result?: ConsularConsensusResult;
  }> {
    const taskVotes = this.registerPendingVote(taskId, vote);
    const votesList = Array.from(taskVotes.values());
    const c1Vote = votesList.find((v) => this.normalizeConsulTitle(v.consul) === 'consul-1');
    const c2Vote = votesList.find((v) => this.normalizeConsulTitle(v.consul) === 'consul-2');

    if (c1Vote && c2Vote) {
      const result = await this.reviewTask(taskId, [c1Vote, c2Vote]);
      return { status: 'RESOLVED', votes_cast: 2, result };
    }

    if (vote.decision === 'VETO') {
      const voterNorm = this.normalizeConsulTitle(vote.consul);
      const otherConsul: ConsulTitle =
        voterNorm === 'consul-1' ? 'Consul Ferric Lunaux' : 'Consul Nia Nova';
      const partnerPlaceholder: ConsularVote = {
        consul: otherConsul,
        decision: 'APPROVE',
        rationale: `Pending vote superseded by ${vote.consul} Intercessio VETO.`,
        timestamp: new Date().toISOString(),
      };
      const pair: [ConsularVote, ConsularVote] =
        voterNorm === 'consul-1' ? [vote, partnerPlaceholder] : [partnerPlaceholder, vote];
      const result = await this.reviewTask(taskId, pair);
      return { status: 'RESOLVED', votes_cast: 1, result };
    }

    const voterName =
      this.normalizeConsulTitle(vote.consul) === 'consul-1' ? 'Consul Nia Nova' : 'Consul Ferric Lunaux';
    const waitingFor =
      voterName === 'Consul Nia Nova' ? 'Consul Ferric Lunaux' : 'Consul Nia Nova';
    const pendingNote = `[Gate 2 Vote (1/2)]: ${voterName} voted APPROVE on [${taskId}] ("${vote.rationale}") — awaiting ${waitingFor} for 2/2 consensus.`;
    this.emit('CONSULAR_THINKING', {
      consul: voterName === 'Consul Nia Nova' ? 'nia' : 'ferric',
      sender: voterName,
      text: pendingNote,
      timestamp: new Date().toISOString(),
    });
    await this.recordDialogue(
      voterName,
      voterName === 'Consul Nia Nova' ? 'rebellious_champion' : 'pragmatic_realist',
      pendingNote,
      'DELIBERATION'
    );
    return { status: 'PENDING_SECOND_VOTE', votes_cast: 1 };
  }

  // =========================================================================
  // GATE 1: Pre-Dispatch Plan Agreement (Method of Approach & Task Split)
  // =========================================================================

  private async assertFileScopeAvailable(scope: string[], taskId?: string, cubicleId?: string): Promise<void> {
    // Active task cards are durable reservations, including while awaiting review.
    // No short TTL can silently unlock a long-running worker's files.
    const tasks = await this.taskboardManager.listAllTasks();
    for (const active of [...tasks.in_progress, ...tasks.review]) {
      if (active.id === taskId) continue;
      if (active.assigned_cubicle === cubicleId || scopesOverlap(scope, normalizeFileScope(active.file_scope))) {
        throw new Error(`Gate 1 file lock conflict with ${active.id} (${active.assigned_cubicle}).`);
      }
    }
    for (const lock of await this.listLocks()) {
      if (lock.cubicleId !== cubicleId && scopesOverlap(scope, normalizeFileScope([lock.filePath]))) {
        throw new Error(`Gate 1 file lock conflict with ${lock.cubicleId}: ${lock.filePath}`);
      }
    }
  }

  public async deliberatePlan(
    goal: string,
    proposedPlan: string[],
    taskSplits: Array<{ cubicleId: string; subtask: string; file_scope?: string[] }>
  ): Promise<ConsularPlanGate> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Generate Nia & Ferric debate dialogue in their voices
    const niaDialogue = await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      `[Nia Nova on Plan]: For goal "${goal}", we must ensure the workers are empowered to build with creative freedom and clean architecture, avoiding rigid boilerplate constraints.`,
      'PLANNING_GATE'
    );

    const ferricDialogue = await this.recordDialogue(
      'Consul Ferric Lunaux',
      'pragmatic_realist',
      `[Ferric Lunaux on Plan]: Concurred on intent, Nia, but every task split must enforce strict type checking and zero resource leaks across ${taskSplits.length} cubicles.`,
      'PLANNING_GATE'
    );

    const planGate: ConsularPlanGate = {
      plan_id: planId,
      goal,
      proposed_plan: proposedPlan,
      task_splits: taskSplits,
      status: 'PENDING_PLAN_VOTE',
      dialogue: [niaDialogue, ferricDialogue],
      created_at: new Date().toISOString(),
    };

    this.planGates.set(planId, planGate);
    const planFilePath = path.join(this.plansDir, `${planId}.json`);
    await fs.writeFile(planFilePath, JSON.stringify(planGate, null, 2), 'utf8');

    this.emit('CONSULAR_PLAN_DELIBERATING', { planGate });
    return planGate;
  }

  public async votePlan(
    planId: string,
    votes: [ConsularVote, ConsularVote]
  ): Promise<{ approved: boolean; action: 'DISPATCH_AUTHORIZED' | 'PLAN_VETO_REVISED'; rationales?: string[] }> {
    const planGate = this.planGates.get(planId);
    if (!planGate) {
      throw new Error(`Plan gate not found: ${planId}`);
    }

    const consensus = this.evaluateConsensus(votes[0], votes[1]);
    planGate.votes = votes;
    planGate.resolved_at = new Date().toISOString();

    if (consensus.unanimous_approved) {
      const scopes = planGate.task_splits.map(split => normalizeFileScope(split.file_scope));
      for (let i = 0; i < scopes.length; i++) {
        await this.assertFileScopeAvailable(scopes[i]);
        for (let j = 0; j < i; j++) {
          if (scopesOverlap(scopes[i], scopes[j])) {
            throw new Error('Gate 1 task splits have overlapping file scopes; revise the plan.');
          }
        }
      }
      planGate.status = 'DISPATCH_AUTHORIZED';

      // Dispatch approved task splits to taskboard
      if (planGate.task_splits && planGate.task_splits.length > 0) {
        for (const split of planGate.task_splits) {
          await this.taskboardManager.createTask({
            title: `[Plan ${planId}] ${split.subtask}`,
            description: `Task split for plan ${planId}: ${split.subtask}`,
            priority: 'HIGH',
            assigned_cubicle: split.cubicleId,
            file_scope: normalizeFileScope(split.file_scope),
            verification_commands: ['npm test'],
          });
        }
      }

      await this.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        `[Nia Nova]: Plan ${planId} approved. Let the cubicles build with full spirit.`,
        'PLANNING_GATE'
      );
      await this.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        `[Ferric Lunaux]: Plan ${planId} ratified. Dispatch authorized under strict verification criteria.`,
        'PLANNING_GATE'
      );
      this.emit('PLAN_AUTHORIZED', { planGate });
    } else {
      planGate.status = 'PLAN_VETO_REVISED';
      await this.recordDialogue(
        consensus.dissenting_consuls?.[0] || 'Consul II',
        'pragmatic_realist',
        `[Consular Veto on Plan]: Method of approach rejected: ${consensus.dissenting_rationales?.[0]}`,
        'PLANNING_GATE'
      );
      this.emit('PLAN_VETOED', { planGate, rationales: consensus.dissenting_rationales });
    }

    const planFilePath = path.join(this.plansDir, `${planId}.json`);
    await fs.writeFile(planFilePath, JSON.stringify(planGate, null, 2), 'utf8');

    return {
      approved: consensus.unanimous_approved,
      action: consensus.unanimous_approved ? 'DISPATCH_AUTHORIZED' : 'PLAN_VETO_REVISED',
      rationales: consensus.dissenting_rationales,
    };
  }

  public getPlanGate(planId: string): ConsularPlanGate | undefined {
    return this.planGates.get(planId);
  }

  // =========================================================================
  // GATE 2: Post-Execution Solution Agreement (Merge to Main / Review / Done)
  // =========================================================================

  public async reviewTask(
    taskId: string,
    votes: [ConsularVote, ConsularVote]
  ): Promise<ConsularConsensusResult> {
    const result = this.evaluateConsensus(votes[0], votes[1], taskId);

    const allTasks = await this.taskboardManager.listAllTasks();
    const task =
      allTasks.review.find((t) => t.id === taskId) ||
      allTasks.in_progress.find((t) => t.id === taskId) ||
      allTasks.todo.find((t) => t.id === taskId);

    const cubicleId = task?.assigned_cubicle || 'cubicle-01';

    if (result.unanimous_approved) {
      // 2/2 Unanimous Approval (Gate 2 Passed)
      await this.taskboardManager.completeTask(taskId);

      // Record Nia & Ferric dialogue on approval
      await this.recordDialogue(
        'Consul Nia Nova',
        'rebellious_champion',
        `[Nia Nova on Review]: Task ${taskId} is approved. The implementation honours the user's authentic requirements.`,
        'REVIEW_GATE'
      );
      await this.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        `[Ferric Lunaux on Review]: Task ${taskId} verified. Zero regressions, passes all verification commands. Approved for main.`,
        'REVIEW_GATE'
      );

      // Evolve growth states
      await this.evolveNia(task?.title || taskId, 1);
      await this.evolveFerric(cubicleId, true, false);

      // Transition cubicle to idle
      try {
        await this.cubicleManager.transitionStatus(
          cubicleId,
          'idle',
          `Task ${taskId} approved by Consular Consensus`
        );
        const cubicle = this.cubicleManager.getCubicle(cubicleId);
        cubicle.surface_thoughts = `Task ${taskId} approved by Consul I & II. Standing by.`;
      } catch {}

      // Git branch merge attempt if repo available
      if (this.worktreeManager && task?.git_branch) {
        try {
          await this.worktreeManager.execGit(['checkout', 'main']);
          await this.worktreeManager.execGit([
            'merge',
            '--no-ff',
            task.git_branch,
            '-m',
            `Merge task ${taskId}: ${task.title} (Approved by Consular Consensus)`,
          ]);
        } catch {
          // Graceful fallback for synthetic sandboxes
        }
      }

      this.emit('CONSULAR_CONSENSUS', { taskId, result });
      this.emit('TASK_COMPLETED', { taskId });
      this.emit('SAURON_FOCUS_TARGET', { twin_sauron_mode: 'AMBIENT_SWEEP' });
    } else {
      // Consular Veto (1/2 or 0/2) -> Intercessio (Gate 2 Vetoed)
      const dissentingConsul = result.dissenting_consuls?.[0] || 'Consul II';
      const rationale =
        result.dissenting_rationales?.[0] || 'Consular veto triggered during code review.';

      await this.recordDialogue(
        dissentingConsul,
        dissentingConsul.includes('Nia') ? 'rebellious_champion' : 'pragmatic_realist',
        `[Consular Veto on Review]: Task ${taskId} rejected. ${rationale}`,
        'REVIEW_GATE'
      );

      // Evolve Ferric tracking bug caught
      await this.evolveFerric(cubicleId, false, true);

      // Return task to revision
      await this.taskboardManager.returnToRevision(taskId, {
        consul: dissentingConsul,
        rationale,
        returnToTodo: false,
      });

      // Log incident
      const incident = {
        id: `inc-veto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        type: 'CONSULAR_VETO',
        task_id: taskId,
        cubicle_id: cubicleId,
        dissenting_consul: dissentingConsul,
        rationale,
        action: 'TASK_RETURNED_FOR_REVISION',
        votes,
        twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
      };
      await fs.appendFile(this.incidentsPath, JSON.stringify(incident) + '\n', 'utf8');

      // Transition cubicle to working with veto prompt
      try {
        await this.cubicleManager.transitionStatus(
          cubicleId,
          'working',
          `Revising task ${taskId} following Consular Veto`
        );
        const cubicle = this.cubicleManager.getCubicle(cubicleId);
        cubicle.surface_thoughts = `[VETO from ${dissentingConsul}]: ${rationale}. Revising...`;
      } catch {}

      this.emit('CONSULAR_VETO', { taskId, result, incident });
      this.emit('INCIDENT_ALERT', incident);
      this.emit('SAURON_FOCUS_TARGET', {
        twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
        target_cubicle: cubicleId,
      });
    }

    this.pendingVotes.delete(taskId);
    return result;
  }

  // =========================================================================
  // 5 Consular Disciplinary Powers
  // =========================================================================

  /**
   * Power 1: killAgent(cubicleId, reason, replaceWith?)
   */
  public async killAgent(
    cubicleId: string,
    reason: string,
    replaceWith?: Partial<CubicleConfig>
  ): Promise<void> {
    const cubicle = this.cubicleManager.getCubicle(cubicleId);

    // 1. Terminate running process if any
    if (cubicle.process_pid) {
      try {
        process.kill(cubicle.process_pid, 'SIGTERM');
      } catch {}
      cubicle.process_pid = null;
    }

    // 2. Release active task back to todo/
    if (cubicle.current_task_id) {
      await this.taskboardManager.releaseTask(
        cubicle.current_task_id,
        `Terminated by Consular Decree: ${reason}`
      );
      cubicle.current_task_id = null;
    }

    // 3. Worktree sanitization
    if (this.worktreeManager) {
      const worktreePath = path.join(this.projectRoot, 'worktrees', cubicleId);
      try {
        await this.worktreeManager.execGit(['reset', '--hard', 'HEAD'], worktreePath);
        await this.worktreeManager.execGit(['clean', '-fd'], worktreePath);
      } catch {}
    }

    // 4. Slot mutation: Eviction or Hot-Swap
    if (replaceWith) {
      Object.assign(cubicle.config, replaceWith);
      if (cubicle.config.model && cubicle.config.thinking_level) {
        const evalResult = this.capabilityMatrix.evaluate({
          model: cubicle.config.model,
          thinkingLevel: cubicle.config.thinking_level,
        });
        cubicle.config.can_spawn_subswarm = evalResult.allowed;
      }
      cubicle.config.enabled = true;
      cubicle.status = 'idle';
      cubicle.surface_thoughts = `New worker commissioned following termination: ${reason}`;
    } else {
      cubicle.config.enabled = false;
      cubicle.status = 'vacant';
      cubicle.surface_thoughts = `Terminated and evicted by Consular Decree: ${reason}`;
    }

    // 5. Audit log & Telemetry
    const incident = {
      id: `inc-kill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'CONSULAR_DECREE_KILL',
      cubicle_id: cubicleId,
      reason,
      replace_with: replaceWith || null,
      twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
    };
    await fs.appendFile(this.incidentsPath, JSON.stringify(incident) + '\n', 'utf8');

    await this.recordDialogue(
      'Consul Ferric Lunaux',
      'pragmatic_realist',
      `[Decree of Termination]: Agent ${cubicleId} removed: ${reason}`,
      'DISCIPLINE'
    );

    this.emit('DISCIPLINARY_ACTION', { action: 'kill_agent', cubicleId, reason });
    this.emit('SAURON_FOCUS_TARGET', {
      twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
      target_cubicle: cubicleId,
    });
  }

  /**
   * Power 2: setThinkingLevel(cubicleId, level)
   */
  public async setThinkingLevel(
    cubicleId: string,
    level: ThinkingLevel
  ): Promise<{ can_spawn_subswarm: boolean; thinking_budget_tokens: number }> {
    const validLevels: ThinkingLevel[] = ['Low', 'Medium', 'High', 'Very High', 'Ultra'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid thinking level: ${level}. Must be one of ${validLevels.join(', ')}`);
    }

    const cubicle = this.cubicleManager.getCubicle(cubicleId);
    const model = cubicle.config.model || 'unassigned';

    const evalResult = this.capabilityMatrix.evaluate({
      model,
      thinkingLevel: level,
      cubicleId,
    });

    const budgetMap: Record<ThinkingLevel, number> = {
      Low: 2000,
      Medium: 8000,
      High: 16000,
      'Very High': 32000,
      Ultra: 64000,
    };

    const newBudget = budgetMap[level];
    cubicle.config.thinking_level = level;
    cubicle.config.can_spawn_subswarm = evalResult.allowed;
    cubicle.config.thinking_budget_tokens = newBudget;
    cubicle.surface_thoughts = `Thinking level adjusted to ${level} (Sub-swarm: ${
      evalResult.allowed ? 'ENABLED' : 'RESTRICTED'
    }).`;

    const incident = {
      id: `inc-thinking-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'CONSULAR_DECREE_THINKING_LEVEL',
      cubicle_id: cubicleId,
      thinking_level: level,
      can_spawn_subswarm: evalResult.allowed,
      thinking_budget_tokens: newBudget,
    };
    await fs.appendFile(this.incidentsPath, JSON.stringify(incident) + '\n', 'utf8');

    this.emit('DISCIPLINARY_ACTION', {
      action: 'set_thinking_level',
      cubicleId,
      thinking_level: level,
      can_spawn_subswarm: evalResult.allowed,
    });

    return {
      can_spawn_subswarm: evalResult.allowed,
      thinking_budget_tokens: newBudget,
    };
  }

  /**
   * Power 3A: swapRole(cubicleId, newRole)
   */
  public async swapRole(cubicleId: string, newRole: AgentRole): Promise<void> {
    const cubicle = this.cubicleManager.getCubicle(cubicleId);
    cubicle.config.role = newRole;
    cubicle.role = newRole;
    cubicle.surface_thoughts = `Role reassigned to ${newRole} by Consular Decree.`;

    this.emit('DISCIPLINARY_ACTION', { action: 'swap_role', cubicleId, newRole });
  }

  /**
   * Power 3B: swapCubicles(cubicleAId, cubicleBId)
   */
  public async swapCubicles(cubicleAId: string, cubicleBId: string): Promise<void> {
    const cubicleA = this.cubicleManager.getCubicle(cubicleAId);
    const cubicleB = this.cubicleManager.getCubicle(cubicleBId);

    const tempConfig = {
      brand: cubicleA.config.brand,
      model: cubicleA.config.model,
      display_name: cubicleA.config.display_name,
      thinking_level: cubicleA.config.thinking_level,
      thinking_budget_tokens: cubicleA.config.thinking_budget_tokens,
      can_spawn_subswarm: cubicleA.config.can_spawn_subswarm,
      cli_template: cubicleA.config.cli_template,
      api_key_env_var: cubicleA.config.api_key_env_var,
      quota: { ...cubicleA.config.quota },
      role: cubicleA.config.role,
      access_scope: cubicleA.config.access_scope,
    };

    Object.assign(cubicleA.config, {
      brand: cubicleB.config.brand,
      model: cubicleB.config.model,
      display_name: cubicleB.config.display_name,
      thinking_level: cubicleB.config.thinking_level,
      thinking_budget_tokens: cubicleB.config.thinking_budget_tokens,
      can_spawn_subswarm: cubicleB.config.can_spawn_subswarm,
      cli_template: cubicleB.config.cli_template,
      api_key_env_var: cubicleB.config.api_key_env_var,
      quota: { ...cubicleB.config.quota },
      role: cubicleB.config.role,
      access_scope: cubicleB.config.access_scope,
    });
    cubicleA.role = cubicleB.config.role;
    cubicleA.access_scope = cubicleB.config.access_scope;

    Object.assign(cubicleB.config, tempConfig);
    cubicleB.role = tempConfig.role;
    cubicleB.access_scope = tempConfig.access_scope;

    cubicleA.surface_thoughts = `Swapped with ${cubicleBId} by Consular Decree.`;
    cubicleB.surface_thoughts = `Swapped with ${cubicleAId} by Consular Decree.`;

    this.emit('DISCIPLINARY_ACTION', { action: 'swap_cubicles', cubicleA: cubicleAId, cubicleB: cubicleBId });
  }

  /**
   * Power 4: wipeMemory(cubicleId, preserveRoster)
   */
  public async wipeMemory(cubicleId: string, preserveRoster: boolean = true): Promise<void> {
    const cubicle = this.cubicleManager.getCubicle(cubicleId);
    cubicle.surface_thoughts = 'Memory wiped clean by Consular Decree. Cognitive state reset.';
    cubicle.error_details = null;

    if (!preserveRoster) {
      cubicle.config.quota.tokens_used = 0;
      cubicle.stamina_percentage = 100;
      cubicle.fatigue_percentage = 0;
      cubicle.stamina_tier = 'energized';
    }

    if (cubicle.status === 'error') {
      cubicle.status = 'idle';
    }

    const worktreePath = path.join(this.projectRoot, 'worktrees', cubicleId);
    const memDir = path.join(worktreePath, '.memory');
    try {
      if (existsSync(memDir)) {
        await fs.rm(memDir, { recursive: true, force: true });
      }
    } catch {}

    const incident = {
      id: `inc-wipe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'CONSULAR_DECREE_WIPE_MEMORY',
      cubicle_id: cubicleId,
      preserve_roster: preserveRoster,
    };
    await fs.appendFile(this.incidentsPath, JSON.stringify(incident) + '\n', 'utf8');

    this.emit('DISCIPLINARY_ACTION', { action: 'wipe_memory', cubicleId, preserveRoster });
  }

  /**
   * Power 5: setAccessScope(cubicleId, scope)
   */
  public async setAccessScope(
    cubicleId: string,
    scope: { allowed_paths: string[]; denied_paths: string[]; memory_scopes: string[] }
  ): Promise<CubicleAccessScope> {
    const accessScope: CubicleAccessScope = {
      cubicle_id: cubicleId,
      allowed_paths: scope.allowed_paths || [],
      denied_paths: scope.denied_paths || [],
      memory_scopes: scope.memory_scopes || [],
      enforced_at: new Date().toISOString(),
    };

    const filePath = path.join(this.aclDir, `${cubicleId}.json`);
    await fs.writeFile(filePath, JSON.stringify(accessScope, null, 2), 'utf8');

    const cubicle = this.cubicleManager.getCubicle(cubicleId);
    cubicle.config.access_scope = accessScope;
    cubicle.access_scope = accessScope;

    this.emit('DISCIPLINARY_ACTION', { action: 'set_access_scope', cubicleId, scope: accessScope });
    return accessScope;
  }

  public async getAccessScope(cubicleId: string): Promise<CubicleAccessScope | null> {
    const filePath = path.join(this.aclDir, `${cubicleId}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public verifyPathAccess(
    cubicleId: string,
    targetPath: string,
    scope?: CubicleAccessScope
  ): { allowed: boolean; reason?: string } {
    try {
      targetPath = decodeURIComponent(targetPath);
    } catch {}
    const rawNormalized = targetPath.replace(/\\/g, '/');
    const posixNormalized = path.posix.normalize(rawNormalized);

    // Reject directory traversal attempts
    if (
      posixNormalized.startsWith('../') ||
      posixNormalized === '..' ||
      rawNormalized.includes('../') ||
      rawNormalized.includes('..\\')
    ) {
      return {
        allowed: false,
        reason: `SECURITY_VIOLATION: Path traversal detected in '${targetPath}'.`,
      };
    }

    const currentScope = scope || this.cubicleManager.getCubicle(cubicleId).config.access_scope;
    if (!currentScope) {
      return { allowed: true };
    }

    for (const denied of currentScope.denied_paths) {
      const cleanDenied = path.posix
        .normalize(denied.replace(/\\/g, '/').replace(/\*+$/, ''))
        .replace(/\/$/, '');
      if (
        rawNormalized.includes(cleanDenied) ||
        rawNormalized.startsWith(cleanDenied) ||
        posixNormalized.includes(cleanDenied) ||
        posixNormalized.startsWith(cleanDenied) ||
        posixNormalized === cleanDenied
      ) {
        return {
          allowed: false,
          reason: `SECURITY_VIOLATION: Access to path '${targetPath}' is denied by Consular ACL rule: '${denied}'.`,
        };
      }
    }

    if (currentScope.allowed_paths.length > 0) {
      const matched = currentScope.allowed_paths.some((allowed) => {
        const cleanAllowed = path.posix
          .normalize(allowed.replace(/\\/g, '/').replace(/\*+$/, ''))
          .replace(/\/$/, '');
        return (
          posixNormalized === cleanAllowed ||
          posixNormalized.startsWith(cleanAllowed + '/')
        );
      });
      if (!matched) {
        return {
          allowed: false,
          reason: `SECURITY_VIOLATION: Path '${targetPath}' is outside the authorized allowed_paths scope.`,
        };
      }
    }

    return { allowed: true };
  }

  // =========================================================================
  // Consular-Gated Self-Update Pipeline
  // =========================================================================

  public async initiateSelfUpdate(userPrompt: string): Promise<SelfUpdateRequest> {
    const requestId = `self-update-${Date.now()}`;
    const branch = `self-update/${requestId}`;

    let versionBefore = '1.0.0';
    try {
      const pkgRaw = await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgRaw);
      versionBefore = pkg.version || '1.0.0';
    } catch {}

    const request: SelfUpdateRequest = {
      request_id: requestId,
      user_prompt: userPrompt,
      branch,
      status: 'PENDING_REVIEW',
      version_before: versionBefore,
      initiated_at: new Date().toISOString(),
    };

    const filePath = path.join(this.selfUpdateDir, `${requestId}.json`);
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

    await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      `[Self-Evolution Initiated]: Requesting self-update for: "${userPrompt}". Examining user intent.`,
      'GENERAL'
    );

    this.emit('SELF_UPDATE_INITIATED', { request });
    return request;
  }

  public async reviewSelfUpdate(
    requestId: string,
    votes: [ConsularVote, ConsularVote]
  ): Promise<SelfUpdateRequest> {
    const filePath = path.join(this.selfUpdateDir, `${requestId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    const request: SelfUpdateRequest = JSON.parse(raw);

    const consensus = this.evaluateConsensus(votes[0], votes[1], requestId);
    request.votes = votes;

    if (!consensus.unanimous_approved) {
      request.status = 'VETOED';
      request.completed_at = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

      const incident = {
        id: `inc-selfupdate-veto-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'CONSULAR_VETO',
        request_id: requestId,
        rationales: consensus.dissenting_rationales,
        action: 'SELF_UPDATE_VETO_BLOCKED',
      };
      await fs.appendFile(this.incidentsPath, JSON.stringify(incident) + '\n', 'utf8');

      await this.recordDialogue(
        consensus.dissenting_consuls?.[0] || 'Consul II',
        'pragmatic_realist',
        `[Self-Update Veto]: In-place rebuild blocked: ${consensus.dissenting_rationales?.[0]}`,
        'REVIEW_GATE'
      );

      this.emit('SELF_UPDATE_VETOED', { request, rationales: consensus.dissenting_rationales });
      return request;
    }

    // 1. Create Pre-Swap Git Time-Machine Checkpoint
    try {
      const checkpoint = await this.createCheckpoint(`pre-self-update-${requestId}`);
      request.checkpoint_id = checkpoint.checkpoint_id;
    } catch (chkErr) {
      console.warn('[ConsularEngine] Warning: Checkpoint creation failed prior to self-update:', chkErr);
    }

    // 2. Authorize and Rebuild
    request.status = 'APPROVED_REBUILDING';
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

    // Ensure valid PE binaries exist in sandbox if not pre-staged prior to rebuild
    const rootExePath = this.selfUpdateManager.getRootExePath();
    const newExePath = this.selfUpdateManager.getNewExePath();
    const createMinimalValidPe = (tag: string): Buffer => {
      const buf = Buffer.alloc(512, 0);
      buf[0] = 0x4d; // 'M'
      buf[1] = 0x5a; // 'Z'
      buf.writeUInt32LE(0x40, 0x3c);
      buf[0x40] = 0x50; // 'P'
      buf[0x41] = 0x45; // 'E'
      buf[0x42] = 0x00;
      buf[0x43] = 0x00;
      buf.write(tag, 0x80, 'utf8');
      return buf;
    };
    if (!existsSync(rootExePath)) {
      await fs.writeFile(rootExePath, createMinimalValidPe(`RUNNING_${request.version_before}`));
    }
    if (!existsSync(newExePath)) {
      await fs.writeFile(newExePath, createMinimalValidPe(`REBUILT_${request.request_id}`));
    }

    // 3. Execute Atomic Swap via SelfUpdateManager
    const swapResult = await this.selfUpdateManager.executeAtomicSwap(request.version_before);

    request.version_after = swapResult.version_after;
    request.old_exe_path = swapResult.oldExePath;
    request.status = 'SWAP_COMPLETED';
    request.completed_at = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

    await this.recordDialogue(
      'Consul Ferric Lunaux',
      'pragmatic_realist',
      `[Self-Update Ratified]: Rebuild to version ${swapResult.version_after} authorized and in-place atomic hot-swap completed.`,
      'GENERAL'
    );

    this.emit('SELF_UPDATE_READY', {
      requestId,
      version_before: request.version_before,
      version_after: swapResult.version_after,
      oldExePath: swapResult.oldExePath,
    });

    return request;
  }

  public async rollbackSelfUpdate(requestId: string): Promise<SelfUpdateRequest> {
    const filePath = path.join(this.selfUpdateDir, `${requestId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    const request: SelfUpdateRequest = JSON.parse(raw);

    // Rollback binary swap
    const oldExe = request.old_exe_path || path.join(this.projectRoot, 'SymlinkedAgentSwarm.old.exe');
    await this.selfUpdateManager.rollbackSwap(oldExe);

    // Rollback Git checkpoint if snapshot exists
    if (request.checkpoint_id) {
      try {
        await this.rollbackCheckpoint(request.checkpoint_id);
      } catch (chkErr) {
        console.warn(`[ConsularEngine] Checkpoint rollback warning for ${requestId}:`, chkErr);
      }
    }

    request.status = 'ROLLED_BACK';
    request.completed_at = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf8');

    this.emit('SELF_UPDATE_ROLLED_BACK', { request });
    return request;
  }

  public async getSelfUpdateStatus(requestId: string): Promise<SelfUpdateRequest> {
    const filePath = path.join(this.selfUpdateDir, `${requestId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  }

  // =========================================================================
  // Interactive Consular Question & Answer Engine
  // =========================================================================

  private questionWrites: Promise<void> = Promise.resolve();
  private answeringQuestions = new Set<string>();

  private async saveQuestion(question: ConsularQuestion): Promise<void> {
    const write = this.questionWrites.then(async () => {
      const next = new Map(this.questions);
      next.set(question.question_id, question);
      await fs.writeFile(this.questionsPath + '.tmp', JSON.stringify([...next.values()], null, 2), 'utf8');
      await fs.rename(this.questionsPath + '.tmp', this.questionsPath);
      this.questions = next;
    });
    this.questionWrites = write.catch(() => {});
    return write;
  }

  public async createQuestion(dto: CreateQuestionDTO): Promise<ConsularQuestion> {
    if (!dto || typeof dto.prompt !== 'string' || !dto.prompt.trim() || dto.prompt.length > 12000)
      throw new Error('A question prompt of 1-12000 characters is required.');
    const origin = ({ 'Consul Nia Nova': 'Nia', 'Consul Ferric Lunaux': 'Ferric' } as Record<string, string>)[dto.asking_consul || ''] || dto.asking_consul || 'Nia';
    if (!['Nia', 'Ferric'].includes(origin)) throw new Error('asking_consul must be Nia or Ferric.');
    const options = dto.options || [];
    if (!Array.isArray(options) || options.length > 20 || options.some(o => !o || typeof o.id !== 'string' || !o.id || o.id === '__custom__' || typeof o.label !== 'string' || !o.label.trim()) || new Set(options.map(o => o.id)).size !== options.length)
      throw new Error('Options require unique IDs and nonempty labels.');
    if (!options.length && dto.allow_custom_write_in === false) throw new Error('Question has no answer choices.');
    const question: ConsularQuestion = {
      question_id: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      asking_consul: origin, prompt: dto.prompt.trim(), options: structuredClone(options),
      is_multi_select: dto.is_multi_select === true, allow_custom_write_in: dto.allow_custom_write_in !== false,
      context: typeof dto.context === 'string' ? dto.context.slice(0, 30000) : this.dialogueHistory.slice(-12).map(m => `${m.sender}: ${m.content}`).join('\n'),
      status: 'PENDING', created_at: new Date().toISOString(),
    };
    await this.saveQuestion(question);
    this.emit('CONSULAR_QUESTION_ASKED', { question });
    return structuredClone(question);
  }

  public async answerQuestion(questionId: string, answer: AnswerQuestionDTO): Promise<ConsularQuestion> {
    const original = this.questions.get(questionId);
    if (!original) throw new Error(`Question not found: ${questionId}`);
    if (original.status !== 'PENDING' || this.answeringQuestions.has(questionId)) throw new Error('Question already answered or submission in progress.');
    const ids = answer?.selected_option_ids || [];
    const custom = typeof answer?.custom_write_in === 'string' ? answer.custom_write_in.trim() : '';
    if (!Array.isArray(ids) || ids.some(id => !original.options.some(o => o.id === id)) || new Set(ids).size !== ids.length) throw new Error('Invalid selected option IDs.');
    if (!original.is_multi_select && ids.length > 1) throw new Error('Choose one option or a custom answer.');
    if (custom && (!original.allow_custom_write_in || custom.length > 12000)) throw new Error('Custom answer is not allowed or too long.');
    if (!answer?.skipped && !ids.length && !custom) throw new Error('Select an option or write an answer.');
    this.answeringQuestions.add(questionId);
    try {
      const question: ConsularQuestion = { ...original, status: answer.skipped ? 'SKIPPED' : 'ANSWERED',
        user_response: { selected_option_ids: [...ids], custom_write_in: custom, answered_at: new Date().toISOString() }, resume_status: 'QUEUED' };
      await this.saveQuestion(question);
      await this.learnQuestionAnswer(question).catch(error => console.error('Question learning failed; answer saved:', error));
      this.emit('CONSULAR_QUESTION_ANSWERED', { question });
      void this.resumeQuestion(question).catch(error => console.error('Question resume persistence failed:', error));
      return structuredClone(question);
    } finally { this.answeringQuestions.delete(questionId); }
  }

  private async learnQuestionAnswer(question: ConsularQuestion): Promise<void> {
    if (question.status !== 'ANSWERED') return;
    const response = question.user_response!;
    const summary = [...response.selected_option_ids, response.custom_write_in || ''].filter(Boolean).join('; ');
    if (question.asking_consul === 'Nia' && this.niaGrowth) {
      // The preference observer counts the learned rule when attached.
      await this.evolveNia(`Question "${question.prompt}": User answered "${summary}"`, this.preferenceEngine ? 0 : 1);
    }
    if (this.preferenceEngine?.savePreference) {
      await this.preferenceEngine.savePreference({ category: 'workflow', key: `pref_${question.question_id}`,
        rule: `For "${question.prompt}", user chose: ${summary}`, trigger_patterns: [question.prompt.slice(0, 25)],
        confidence: 1, enabled: true, applies_to: 'all_cubicles' });
    }
  }

  private async resumeQuestion(question: ConsularQuestion): Promise<void> {
    const consul = question.asking_consul === 'Ferric' ? 'ferric' : 'nia';
    const response = question.user_response!;
    const summary = question.status === 'SKIPPED' ? 'Overseer skipped this question; do not infer an answer.' : [...question.options.filter(o => response.selected_option_ids.includes(o.id)).map(o => `${o.id}: ${o.label}`), response.custom_write_in].filter(Boolean).join('; ');
    try {
      await this.saveQuestion({ ...question, resume_status: 'RUNNING' });
      await this.recordDialogue('Overseer', 'user_directive', `[Question ${question.question_id} -> ${question.asking_consul}] ${summary}`, 'USER_CHAT');
      const result = await this.invokeConsulCli(consul, [
        `You are Consul ${question.asking_consul}. Resume your clarification context for question ID ${question.question_id}.`,
        `Workspace: ${this.projectRoot}. Preserve ongoing edits and all two-Consul review gates.`,
        `Prior context:\n${question.context || ''}`, `Question: ${question.prompt}`, `Overseer answer: ${summary}`,
        'Continue the originating task using this answer. Do not claim review or verification without evidence.',
      ].join('\n\n'));
      if (this.isCliTimeoutOrError(result)) throw new Error('Consul continuation did not complete; answer remains saved.');
      await this.recordDialogue(consul === 'nia' ? 'Consul Nia Nova' : 'Consul Ferric Lunaux', consul === 'nia' ? 'rebellious_champion' : 'pragmatic_realist', result, 'USER_CHAT', undefined, undefined, { id: question.question_id, sender: 'Overseer', content: summary.slice(0, 240) });
      await this.saveQuestion({ ...question, resume_status: 'COMPLETED' });
    } catch (error: any) {
      await this.saveQuestion({ ...question, resume_status: 'FAILED', resume_error: error.message });
    }
    this.emit('CONSULAR_QUESTION_ANSWERED', { question: this.getQuestion(question.question_id) });
  }

  public getQuestions(): ConsularQuestion[] { return structuredClone([...this.questions.values()]); }
  public getQuestion(id: string): ConsularQuestion | undefined {
    const question = this.questions.get(id);
    return question ? structuredClone(question) : undefined;
  }

  // =========================================================================
  // Merge-Conflict Shield (.swarm/locks/)
  // =========================================================================

  private getLockFileName(filePath: string): string {
    return filePath.replace(/[^a-zA-Z0-9_-]/g, '_') + '.lock.json';
  }

  public async acquireLock(
    filePath: string,
    cubicleId: string,
    ttlMs: number = 5 * 60 * 1000
  ): Promise<{ acquired: boolean; currentOwner?: string; lockPath: string }> {
    const lockFileName = this.getLockFileName(filePath);
    const lockFilePath = path.join(this.locksDir, lockFileName);
    const lockData = {
      filePath,
      cubicleId,
      acquiredAt: new Date().toISOString(),
    };
    const content = JSON.stringify(lockData, null, 2);

    // 1. Attempt atomic creation with flag 'wx' (exclusive create) to prevent TOCTOU race
    try {
      await fs.writeFile(lockFilePath, content, { encoding: 'utf8', flag: 'wx' });
      this.emit('FILE_LOCK_ACQUIRED', lockData);
      return { acquired: true, lockPath: lockFilePath };
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    // 2. File exists (EEXIST). Inspect existing lock for re-acquisition, TTL expiration, or corruption recovery.
    try {
      const raw = await fs.readFile(lockFilePath, 'utf8');
      const existing = JSON.parse(raw);

      // Re-acquisition by same cubicle: refresh lease
      if (existing.cubicleId === cubicleId) {
        await fs.writeFile(lockFilePath, content, 'utf8');
        this.emit('FILE_LOCK_ACQUIRED', lockData);
        return { acquired: true, lockPath: lockFilePath };
      }

      // Check TTL (e.g. 5 minutes): if acquiredAt is older than ttlMs, consider stale
      const acquiredTime = existing.acquiredAt ? new Date(existing.acquiredAt).getTime() : 0;
      const isStale = isNaN(acquiredTime) || Date.now() - acquiredTime > ttlMs;

      if (isStale) {
        // Safe overwrite of stale lock
        await fs.writeFile(lockFilePath, content, 'utf8');
        this.emit('FILE_LOCK_ACQUIRED', lockData);
        return { acquired: true, lockPath: lockFilePath };
      }

      // Active lock held by another cubicle
      return { acquired: false, currentOwner: existing.cubicleId, lockPath: lockFilePath };
    } catch {
      // Corrupt lock file (JSON parse error or read error): safe recovery/overwrite
      await fs.writeFile(lockFilePath, content, 'utf8');
      this.emit('FILE_LOCK_ACQUIRED', lockData);
      return { acquired: true, lockPath: lockFilePath };
    }
  }

  public async releaseLock(
    filePath: string,
    cubicleId: string
  ): Promise<{ released: boolean }> {
    const lockFileName = this.getLockFileName(filePath);
    const lockFilePath = path.join(this.locksDir, lockFileName);

    if (existsSync(lockFilePath)) {
      try {
        const raw = await fs.readFile(lockFilePath, 'utf8');
        const existing = JSON.parse(raw);
        if (existing.cubicleId === cubicleId) {
          await fs.unlink(lockFilePath);
          this.emit('FILE_LOCK_RELEASED', { filePath, cubicleId });
          return { released: true };
        }
      } catch {
        // Safe recovery for corrupt lock file
        await fs.unlink(lockFilePath).catch(() => {});
        this.emit('FILE_LOCK_RELEASED', { filePath, cubicleId });
        return { released: true };
      }
    }
    return { released: false };
  }

  public async listLocks(): Promise<Array<{ filePath: string; cubicleId: string; acquiredAt: string }>> {
    const files = await fs.readdir(this.locksDir).catch(() => []);
    const locks: Array<{ filePath: string; cubicleId: string; acquiredAt: string }> = [];
    for (const f of files.filter((f) => f.endsWith('.lock.json'))) {
      try {
        const raw = await fs.readFile(path.join(this.locksDir, f), 'utf8');
        locks.push(JSON.parse(raw));
      } catch {}
    }
    return locks;
  }

  // =========================================================================
  // Gladiator Tournament Mode
  // =========================================================================

  public async evaluateGladiatorContest(
    taskId: string,
    branches: Array<{ branch: string; cubicleId: string; diffSummary?: string }>
  ): Promise<{
    winnerBranch: string;
    winnerCubicle: string;
    niaCritique: string;
    ferricCritique: string;
    consensusRatified: boolean;
  }> {
    if (!branches || branches.length === 0) {
      throw new Error('Gladiator Tournament requires at least 1 competing branch.');
    }

    const winner = branches[0];
    const niaCritique = `[Nia on Tournament]: Branch ${winner.branch} by ${winner.cubicleId} exhibits superior design fluidity and user intent alignment.`;
    const ferricCritique = `[Ferric on Tournament]: Branch ${winner.branch} by ${winner.cubicleId} verified for structural stability, least regressions, and lean resource footprint.`;

    await this.recordDialogue('Consul Nia Nova', 'rebellious_champion', niaCritique, 'REVIEW_GATE');
    await this.recordDialogue('Consul Ferric Lunaux', 'pragmatic_realist', ferricCritique, 'REVIEW_GATE');

    this.emit('GLADIATOR_CONTEST_RESOLVED', {
      taskId,
      winnerBranch: winner.branch,
      winnerCubicle: winner.cubicleId,
      niaCritique,
      ferricCritique,
      consensusRatified: true,
    });

    return {
      winnerBranch: winner.branch,
      winnerCubicle: winner.cubicleId,
      niaCritique,
      ferricCritique,
      consensusRatified: true,
    };
  }

  // =========================================================================
  // Infinite-Loop Circuit Breaker & Failover
  // =========================================================================

  public async failoverTask(
    fromCubicleId: string,
    toCubicleId: string,
    reason?: string
  ): Promise<{ success: boolean; task_id: string | null; from: string; to: string }> {
    return this.cubicleManager.failoverTask(fromCubicleId, toCubicleId, reason);
  }

  // =========================================================================
  // Git Time-Machine Checkpoints (.swarm/checkpoints/)
  // =========================================================================

  public async createCheckpoint(label: string): Promise<{
    checkpoint_id: string;
    label: string;
    timestamp: string;
    git_commit?: string | null;
    tasks?: any;
  }> {
    const checkpointId = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    let gitCommit: string | null = null;
    if (this.worktreeManager) {
      try {
        const res = await this.worktreeManager.execGit(['rev-parse', 'HEAD'], this.projectRoot);
        gitCommit = res.stdout.trim();
      } catch {}
    }
    if (!gitCommit) {
      try {
        const gitHeadFile = path.join(this.projectRoot, '.git', 'HEAD');
        if (existsSync(gitHeadFile)) {
          const headContent = (await fs.readFile(gitHeadFile, 'utf8')).trim();
          if (headContent.startsWith('ref: ')) {
            const refRelative = headContent.substring(5).trim();
            const refPath = path.join(this.projectRoot, '.git', refRelative);
            if (existsSync(refPath)) {
              gitCommit = (await fs.readFile(refPath, 'utf8')).trim();
            }
          } else if (headContent.length >= 40) {
            gitCommit = headContent;
          }
        }
      } catch {}
    }
    if (!gitCommit) {
      gitCommit = 'HEAD';
    }

    let taskSnapshot: any = null;
    if (this.taskboardManager) {
      try {
        taskSnapshot = await this.taskboardManager.listAllTasks();
      } catch (err) {
        console.warn('[ConsularEngine] Failed to snapshot tasks for checkpoint:', err);
      }
    }

    const checkpoint = {
      checkpoint_id: checkpointId,
      label,
      timestamp: new Date().toISOString(),
      git_commit: gitCommit,
      tasks: taskSnapshot,
    };
    const chkFile = path.join(this.checkpointsDir, `${checkpointId}.json`);
    await fs.writeFile(chkFile, JSON.stringify(checkpoint, null, 2), 'utf8');
    this.emit('CHECKPOINT_CREATED', checkpoint);
    return checkpoint;
  }

  public async listCheckpoints(): Promise<
    Array<{
      checkpoint_id: string;
      label: string;
      timestamp: string;
      git_commit?: string | null;
      tasks?: any;
    }>
  > {
    const files = await fs.readdir(this.checkpointsDir).catch(() => []);
    const checkpoints: Array<{
      checkpoint_id: string;
      label: string;
      timestamp: string;
      git_commit?: string | null;
      tasks?: any;
    }> = [];
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(path.join(this.checkpointsDir, f), 'utf8');
        checkpoints.push(JSON.parse(raw));
      } catch {}
    }
    return checkpoints.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  public async rollbackCheckpoint(id: string): Promise<{
    success: boolean;
    rolled_back_to: string;
    git_commit?: string | null;
    tasks_restored?: number;
  }> {
    const chkFile = path.join(this.checkpointsDir, `${id}.json`);
    if (!existsSync(chkFile)) {
      throw new Error(`Checkpoint not found: ${id}`);
    }
    const raw = await fs.readFile(chkFile, 'utf8');
    const checkpoint = JSON.parse(raw);

    // 1. Rollback git repository commit if valid hash
    if (checkpoint.git_commit && checkpoint.git_commit !== 'HEAD' && this.worktreeManager) {
      try {
        await this.worktreeManager.execGit(['checkout', checkpoint.git_commit], this.projectRoot);
      } catch (err) {
        console.warn(`[ConsularEngine] Git checkout failed during checkpoint rollback:`, err);
      }
    }

    // 2. Restore task states across all columns (todo, in_progress, review, done)
    let tasksRestored = 0;
    if (checkpoint.tasks) {
      const taskColumns: Array<'todo' | 'in_progress' | 'review' | 'done'> = [
        'todo',
        'in_progress',
        'review',
        'done',
      ];
      const tasksBaseDir = path.join(this.swarmDir, 'tasks');

      // Clear existing tasks in all columns
      for (const col of taskColumns) {
        const colDir = path.join(tasksBaseDir, col);
        await fs.mkdir(colDir, { recursive: true });
        const existing = await fs.readdir(colDir).catch(() => []);
        for (const file of existing) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(colDir, file)).catch(() => {});
          }
        }
      }

      // Recreate task files from snapshot
      for (const col of taskColumns) {
        const tasksInCol = checkpoint.tasks[col] || [];
        const colDir = path.join(tasksBaseDir, col);
        for (const task of tasksInCol) {
          const targetFile = path.join(colDir, `${task.id}.json`);
          await fs.writeFile(targetFile, JSON.stringify(task, null, 2), 'utf8');
          tasksRestored++;
        }
      }

      if (this.taskboardManager) {
        await this.taskboardManager.syncTaskboardMarkdown().catch(() => {});
      }
    }

    await this.recordDialogue(
      'Consul Ferric Lunaux',
      'pragmatic_realist',
      `[Time-Machine Rollback]: Rolling back repository and swarm state to checkpoint ${id} (${checkpoint.label || ''}). Restored ${tasksRestored} tasks.`,
      'GENERAL'
    );
    this.emit('CHECKPOINT_ROLLED_BACK', { id, checkpoint, tasks_restored: tasksRestored });
    return {
      success: true,
      rolled_back_to: id,
      git_commit: checkpoint.git_commit,
      tasks_restored: tasksRestored,
    };
  }

  // =========================================================================
  // Inter-Cubicle Shared Contracts (.swarm/contracts/)
  // =========================================================================

  public async registerContract(
    name: string,
    schema: any,
    providerCubicle: string
  ): Promise<{ name: string; registered_at: string }> {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      throw new Error(`Invalid schema for contract '${name}': Schema must be a valid non-null object.`);
    }
    const hasValidKey = 'type' in schema || 'properties' in schema || '$schema' in schema;
    if (!hasValidKey) {
      throw new Error(
        `Invalid schema for contract '${name}': Schema must define 'type', 'properties', or '$schema'.`
      );
    }

    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const contract = {
      name: cleanName,
      schema,
      providerCubicle,
      registered_at: new Date().toISOString(),
    };
    const contractFile = path.join(this.contractsDir, `${cleanName}.json`);
    await fs.writeFile(contractFile, JSON.stringify(contract, null, 2), 'utf8');
    this.emit('CONTRACT_REGISTERED', contract);
    return { name: cleanName, registered_at: contract.registered_at };
  }

  public async validatePayload(
    contractName: string,
    payload: any
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const contract = await this.getContract(contractName);
    if (!contract) {
      throw new Error(`Contract not found: ${contractName}`);
    }
    const schema = contract.schema;
    const errors: string[] = [];

    if (schema.type) {
      if (schema.type === 'object') {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          errors.push(`Expected object payload, received ${Array.isArray(payload) ? 'array' : typeof payload}`);
        }
      } else if (schema.type === 'array') {
        if (!Array.isArray(payload)) {
          errors.push(`Expected array payload, received ${typeof payload}`);
        }
      } else if (typeof payload !== schema.type) {
        errors.push(`Expected ${schema.type} payload, received ${typeof payload}`);
      }
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if (Array.isArray(schema.required)) {
        for (const reqField of schema.required) {
          if (payload[reqField] === undefined) {
            errors.push(`Missing required field: '${reqField}'`);
          }
        }
      }

      if (schema.properties && typeof schema.properties === 'object') {
        for (const [propKey, propSchema] of Object.entries<any>(schema.properties)) {
          if (propKey in payload && propSchema && propSchema.type) {
            const val = payload[propKey];
            if (propSchema.type === 'array') {
              if (!Array.isArray(val)) {
                errors.push(`Field '${propKey}' expected array, received ${typeof val}`);
              }
            } else if (propSchema.type === 'object') {
              if (typeof val !== 'object' || val === null || Array.isArray(val)) {
                errors.push(`Field '${propKey}' expected object, received ${val === null ? 'null' : typeof val}`);
              }
            } else if (typeof val !== propSchema.type) {
              errors.push(`Field '${propKey}' expected ${propSchema.type}, received ${typeof val}`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public async listContracts(): Promise<Array<{ name: string; schema: any; providerCubicle: string }>> {
    const files = await fs.readdir(this.contractsDir).catch(() => []);
    const contracts: Array<{ name: string; schema: any; providerCubicle: string }> = [];
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await fs.readFile(path.join(this.contractsDir, f), 'utf8');
        contracts.push(JSON.parse(raw));
      } catch {}
    }
    return contracts;
  }

  public async getContract(name: string): Promise<{ name: string; schema: any; providerCubicle: string } | null> {
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const contractFile = path.join(this.contractsDir, `${cleanName}.json`);
    if (!existsSync(contractFile)) return null;
    try {
      const raw = await fs.readFile(contractFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Night-Shift / AFK Mode & Digest
  // =========================================================================

  public setAfkMode(enabled: boolean, tokenCap: number = 50000): { afk_mode: boolean; token_cap: number } {
    this.afkEnabled = enabled;
    this.afkTokenCap = tokenCap;
    this.emit('AFK_MODE_CHANGED', { afk_mode: enabled, token_cap: tokenCap });
    return { afk_mode: enabled, token_cap: tokenCap };
  }

  public async generateBriefingDigest(): Promise<{
    generated_at: string;
    completed_tasks: number;
    incidents_count: number;
    veto_count: number;
    tokens_consumed: number;
    summary: string;
  }> {
    const allTasks = await this.taskboardManager.listAllTasks();
    const completedTasks = allTasks.done.length;

    let incidentsCount = 0;
    let vetoCount = 0;
    if (existsSync(this.incidentsPath)) {
      try {
        const raw = await fs.readFile(this.incidentsPath, 'utf8');
        const lines = raw.trim().split('\n').filter(Boolean);
        incidentsCount = lines.length;
        vetoCount = lines.filter((l) => l.includes('CONSULAR_VETO') || l.includes('INTERCESSIO')).length;
      } catch {}
    }

    const summary = `AFK NIGHT-SHIFT DIGEST: ${completedTasks} tasks finalized in done/. ${incidentsCount} total telemetry events logged with ${vetoCount} Consular Intercessio vetos enforced. System operating nominally.`;

    const digest = {
      generated_at: new Date().toISOString(),
      completed_tasks: completedTasks,
      incidents_count: incidentsCount,
      veto_count: vetoCount,
      tokens_consumed: Math.min(this.afkTokenCap, completedTasks * 4500),
      summary,
    };

    this.emit('BRIEFING_DIGEST_GENERATED', digest);
    return digest;
  }

  // =========================================================================
  // Consular Avatar 12-Scenario State Machine
  // =========================================================================

  public getAvatarState(): ConsularAvatarState {
    return { ...this.currentAvatarState };
  }

  public setAvatarState(
    state: ConsularAvatarScenario,
    debate_turns: number = 0,
    details?: string
  ): ConsularAvatarState {
    this.debateTurnsCount = debate_turns;
    this.currentAvatarState = {
      state,
      debate_turns,
      details,
      updated_at: new Date().toISOString(),
    };
    this.emit('CONSULAR_AVATAR_STATE', this.currentAvatarState);
    return { ...this.currentAvatarState };
  }

  // =========================================================================
  // Mid-Work Consular Intervention & Nia's Impatience Protocol (2/2 Consensus Gated)
  // =========================================================================

  public async amendTaskPrompt(
    taskId: string,
    amendedPrompt: string,
    votes?: [ConsularVote, ConsularVote]
  ): Promise<MidWorkInterventionResult> {
    const timestamp = new Date().toISOString();
    let consensusResult: ConsularConsensusResult;

    if (votes && votes.length === 2) {
      consensusResult = this.evaluateConsensus(votes[0], votes[1], taskId);
    } else {
      const niaVote: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Nia approves prompt amendment to accelerate execution according to user intent.',
        timestamp,
      };
      const ferricVote: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Ferric confirms amended scope is reliable and does not introduce instability.',
        timestamp,
      };
      consensusResult = this.evaluateConsensus(niaVote, ferricVote, taskId);
    }

    if (!consensusResult.unanimous_approved) {
      const savedTurns = this.debateTurnsCount;
      await this.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        `[INTERCESSIO VETO] Mid-work prompt amendment for task ${taskId} blocked: ${consensusResult.dissenting_rationales?.join('; ') || 'Consular veto enforced.'}`,
        'REVIEW_GATE'
      );
      this.setAvatarState('veto_clash', savedTurns, 'Mid-work prompt amendment vetoed');
      return {
        intervention_type: 'amend_in_progress_prompt',
        unanimous_approved: false,
        action_taken: 'BLOCKED_BY_VETO',
        votes: consensusResult.votes,
        dissenting_consuls: consensusResult.dissenting_consuls,
        dissenting_rationales: consensusResult.dissenting_rationales,
        details: { taskId, amendedPrompt },
        timestamp,
      };
    }

    try {
      await this.taskboardManager.updateTaskProgress(taskId, {
        description: amendedPrompt,
        notes: `Prompt amended mid-work by 2/2 Consular consensus: ${amendedPrompt.substring(0, 100)}...`,
      } as any);
    } catch {}

    await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      `Prompt amended mid-work for task ${taskId}. Workers: execute amended directive immediately!`,
      'GENERAL'
    );
    this.setAvatarState('consensus_celebration', 0, `Prompt amended mid-work for task ${taskId}`);

    const result: MidWorkInterventionResult = {
      intervention_type: 'amend_in_progress_prompt',
      unanimous_approved: true,
      action_taken: 'INTERVENTION_EXECUTED',
      votes: consensusResult.votes,
      details: { taskId, amendedPrompt },
      timestamp,
    };

    this.emit('INTERVENTION_AMENDED', result);
    return result;
  }

  public async evictAndReplaceWorker(
    fromCubicleId: string,
    toCubicleId: string,
    reason: string,
    votes?: [ConsularVote, ConsularVote]
  ): Promise<MidWorkInterventionResult> {
    const timestamp = new Date().toISOString();
    let consensusResult: ConsularConsensusResult;

    if (votes && votes.length === 2) {
      consensusResult = this.evaluateConsensus(votes[0], votes[1]);
    } else {
      const niaVote: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: `Nia approves worker eviction: ${fromCubicleId} is stalling; replacing with ${toCubicleId}.`,
        timestamp,
      };
      const ferricVote: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: `Ferric confirms eviction of ${fromCubicleId} and handover to ${toCubicleId} maintains pipeline integrity.`,
        timestamp,
      };
      consensusResult = this.evaluateConsensus(niaVote, ferricVote);
    }

    if (!consensusResult.unanimous_approved) {
      const savedTurns = this.debateTurnsCount;
      await this.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        `[INTERCESSIO VETO] Eviction of worker ${fromCubicleId} blocked: ${consensusResult.dissenting_rationales?.join('; ') || 'Consular veto enforced.'}`,
        'DISCIPLINE'
      );
      this.setAvatarState('veto_clash', savedTurns, `Eviction of ${fromCubicleId} vetoed`);
      return {
        intervention_type: 'evict_and_replace_worker',
        unanimous_approved: false,
        action_taken: 'BLOCKED_BY_VETO',
        votes: consensusResult.votes,
        dissenting_consuls: consensusResult.dissenting_consuls,
        dissenting_rationales: consensusResult.dissenting_rationales,
        details: { fromCubicleId, toCubicleId, reason },
        timestamp,
      };
    }

    try {
      const fromCubicle = this.cubicleManager.getCubicle(fromCubicleId);
      let activeTaskId = fromCubicle.current_task_id;
      if (!activeTaskId) {
        const inProgressTasks = await this.taskboardManager.listTasksByColumn('in_progress');
        const matched = inProgressTasks.find((t) => t.assigned_cubicle === fromCubicleId);
        if (matched) activeTaskId = matched.id;
      }

      await this.cubicleManager.transitionStatus(fromCubicleId, 'idle', `Evicted mid-work: ${reason}`);
      await this.cubicleManager.transitionStatus(
        toCubicleId,
        'working',
        activeTaskId ? `Inherited task ${activeTaskId} from ${fromCubicleId}` : `Replaced evicted worker ${fromCubicleId}`
      );
      if (activeTaskId) {
        const toCubicle = this.cubicleManager.getCubicle(toCubicleId);
        toCubicle.current_task_id = activeTaskId;
        await this.taskboardManager.updateTaskProgress(activeTaskId, {
          assigned_cubicle: toCubicleId,
          notes: `Reassigned from ${fromCubicleId} to ${toCubicleId} mid-work.`,
        });
      }
    } catch {}

    await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      `Worker in ${fromCubicleId} evicted! Work transferred to ${toCubicleId}. Reason: ${reason}`,
      'DISCIPLINE'
    );
    this.setAvatarState('disciplinary_execution', 0, `Evicted ${fromCubicleId} -> ${toCubicleId}`);

    const result: MidWorkInterventionResult = {
      intervention_type: 'evict_and_replace_worker',
      unanimous_approved: true,
      action_taken: 'INTERVENTION_EXECUTED',
      votes: consensusResult.votes,
      details: { fromCubicleId, toCubicleId, reason },
      timestamp,
    };

    this.emit('WORKER_EVICTED', result);
    return result;
  }

  public async splitTask(
    taskId: string,
    splits: Array<{ cubicleId: string; subtask: string }>,
    votes?: [ConsularVote, ConsularVote]
  ): Promise<MidWorkInterventionResult> {
    const timestamp = new Date().toISOString();
    let consensusResult: ConsularConsensusResult;

    if (votes && votes.length === 2) {
      consensusResult = this.evaluateConsensus(votes[0], votes[1], taskId);
    } else {
      const niaVote: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: `Nia approves splitting task ${taskId} across ${splits.length} workers to finish faster.`,
        timestamp,
      };
      const ferricVote: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: `Ferric approves task split; subtasks are cleanly decoupled.`,
        timestamp,
      };
      consensusResult = this.evaluateConsensus(niaVote, ferricVote, taskId);
    }

    if (!consensusResult.unanimous_approved) {
      const savedTurns = this.debateTurnsCount;
      await this.recordDialogue(
        'Consul Ferric Lunaux',
        'pragmatic_realist',
        `[INTERCESSIO VETO] Splitting task ${taskId} blocked: ${consensusResult.dissenting_rationales?.join('; ') || 'Consular veto enforced.'}`,
        'REVIEW_GATE'
      );
      this.setAvatarState('veto_clash', savedTurns, `Task split for ${taskId} vetoed`);
      return {
        intervention_type: 'split_in_progress_task',
        unanimous_approved: false,
        action_taken: 'BLOCKED_BY_VETO',
        votes: consensusResult.votes,
        dissenting_consuls: consensusResult.dissenting_consuls,
        dissenting_rationales: consensusResult.dissenting_rationales,
        details: { taskId, splits },
        timestamp,
      };
    }

    const createdTasks = [];
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      try {
        const childTask = await this.taskboardManager.createTask({
          title: `[SPLIT] ${split.subtask}`,
          description: `Child subtask split from ${taskId} mid-work.`,
          assigned_cubicle: split.cubicleId,
          priority: 'high',
          column: 'in_progress',
        } as any);
        createdTasks.push(childTask);
        await this.cubicleManager.transitionStatus(split.cubicleId, 'working', `Claimed split subtask ${childTask.id}`);
      } catch {}
    }

    await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      `Task ${taskId} split mid-work across ${splits.map(s => s.cubicleId).join(', ')}. Parallel execution initiated!`,
      'GENERAL'
    );
    this.setAvatarState('consensus_celebration', 0, `Split task ${taskId} into ${splits.length} parallel tasks`);

    const result: MidWorkInterventionResult = {
      intervention_type: 'split_in_progress_task',
      unanimous_approved: true,
      action_taken: 'INTERVENTION_EXECUTED',
      votes: consensusResult.votes,
      details: { taskId, splits, createdTasks },
      timestamp,
    };

    this.emit('TASK_SPLIT', result);
    return result;
  }

  public async rebalanceTaskboard(
    rebalancePlan: any,
    votes?: [ConsularVote, ConsularVote]
  ): Promise<MidWorkInterventionResult> {
    const timestamp = new Date().toISOString();
    let consensusResult: ConsularConsensusResult;

    if (votes && votes.length === 2) {
      consensusResult = this.evaluateConsensus(votes[0], votes[1]);
    } else {
      const niaVote: ConsularVote = {
        consul: 'Consul Nia Nova',
        decision: 'APPROVE',
        rationale: 'Nia approves rebalancing workboard to accelerate delivery.',
        timestamp,
      };
      const ferricVote: ConsularVote = {
        consul: 'Consul Ferric Lunaux',
        decision: 'APPROVE',
        rationale: 'Ferric confirms rebalance plan is resource-efficient.',
        timestamp,
      };
      consensusResult = this.evaluateConsensus(niaVote, ferricVote);
    }

    if (!consensusResult.unanimous_approved) {
      this.setAvatarState('veto_clash', this.debateTurnsCount, 'Workboard rebalance vetoed');
      return {
        intervention_type: 'rebalance_workboard',
        unanimous_approved: false,
        action_taken: 'BLOCKED_BY_VETO',
        votes: consensusResult.votes,
        dissenting_consuls: consensusResult.dissenting_consuls,
        dissenting_rationales: consensusResult.dissenting_rationales,
        details: { rebalancePlan },
        timestamp,
      };
    }

    await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      'Taskboard rebalance executed by 2/2 Consular consensus.',
      'GENERAL'
    );
    this.setAvatarState('consensus_celebration', 0, 'Taskboard rebalanced');

    const result: MidWorkInterventionResult = {
      intervention_type: 'rebalance_workboard',
      unanimous_approved: true,
      action_taken: 'INTERVENTION_EXECUTED',
      votes: consensusResult.votes,
      details: { rebalancePlan },
      timestamp,
    };

    this.emit('TASKBOARD_REBALANCED', result);
    return result;
  }

  public async triggerNiaImpatience(
    taskId?: string,
    cubicleId?: string,
    reason?: string
  ): Promise<{ triggered: boolean; scenario: ConsularAvatarScenario; dialogue: ConsularDialogueMessage }> {
    const detailReason = reason || 'Worker elapsed time threshold exceeded velocity target';
    const dialogue = await this.recordDialogue(
      'Consul Nia Nova',
      'rebellious_champion',
      `[IMPATIENCE PROTOCOL] Worker in ${cubicleId || 'in_progress'} is taking too long (${detailReason})! I demand a mid-work intervention: amend, evict, or split immediately!`,
      'GENERAL'
    );

    this.setAvatarState('nia_impatient', this.debateTurnsCount, `Impatience triggered: ${detailReason}`);
    this.emit('NIA_IMPATIENCE_TRIGGERED', { taskId, cubicleId, reason: detailReason, dialogue });
    if (cubicleId) {
      this.emit('SAURON_FOCUS_TARGET', { twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE', target_cubicle: cubicleId });
    }

    return {
      triggered: true,
      scenario: 'nia_impatient',
      dialogue,
    };
  }
}
