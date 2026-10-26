/**
 * src/server/cubicle-manager.ts
 *
 * 16-Cubicle Grid Roster and Lifecycle State Machine Manager.
 * Arranges 16 worker cubicles in a 4x4 spatial matrix, persists configurations to
 * .swarm/roster.json and live telemetry to .swarm/status/cubicle-XX.json, and enforces
 * deterministic lifecycle state transitions.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CubicleConfig,
  CubicleLiveState,
  CubicleStatus,
  ConfigureCubicleDTO,
  StaminaTier,
} from './types/cubicle.js';
import { DEFAULT_CUBICLE_ROSTER } from './types/cubicle-defaults.js';
import { QuotaTracker } from './quota-tracker.js';

export class InvalidTransitionError extends Error {
  constructor(
    public cubicleId: string,
    public currentStatus: CubicleStatus,
    public targetStatus: CubicleStatus,
    message?: string
  ) {
    super(
      message ||
        `Invalid lifecycle transition for ${cubicleId}: cannot move from '${currentStatus}' to '${targetStatus}'.`
    );
    this.name = 'InvalidTransitionError';
  }
}

export type StateChangeCallback = (cubicle: CubicleLiveState, reason?: string) => void;

export class CubicleManager {
  private swarmDir: string;
  private rosterPath: string;
  private statusDir: string;
  private cubicles: Map<string, CubicleLiveState> = new Map();
  private listeners: Set<StateChangeCallback> = new Set();
  private writeQueues: Map<string, Promise<void>> = new Map();

  // Deterministic valid transition matrix
  private static readonly VALID_TRANSITIONS: Record<CubicleStatus, CubicleStatus[]> = {
    vacant: ['idle'],
    idle: ['working', 'vacant', 'error'],
    working: ['under_inspection', 'idle', 'error', 'exhausted'],
    under_inspection: ['idle', 'working', 'error'],
    error: ['idle', 'vacant', 'working'],
    exhausted: ['idle', 'vacant'],
  };

  private static mapStatusToDisplayState(status: CubicleStatus): string {
    switch (status) {
      case 'idle':
        return 'Relaxed/Idle';
      case 'working':
        return 'Working';
      case 'under_inspection':
        return 'Under Inspection';
      case 'error':
        return 'Error';
      case 'exhausted':
        return 'Exhausted';
      case 'vacant':
      default:
        return 'Vacant';
    }
  }

  constructor(swarmDir: string) {
    this.swarmDir = path.resolve(swarmDir);
    this.rosterPath = path.join(this.swarmDir, 'roster.json');
    this.statusDir = path.join(this.swarmDir, 'status');
  }

  /**
   * Initializes the 16-cubicle roster. Loads from .swarm/roster.json or seeds defaults.
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(this.statusDir, { recursive: true });

    let configs: CubicleConfig[];
    try {
      const raw = await fs.readFile(this.rosterPath, 'utf8');
      configs = JSON.parse(raw);
    } catch {
      // Seed default roster
      configs = JSON.parse(JSON.stringify(DEFAULT_CUBICLE_ROSTER));
      await fs.writeFile(this.rosterPath, JSON.stringify(configs, null, 2), 'utf8');
    }

    // Ensure exact 16 cubicle slots
    for (let i = 0; i < 16; i++) {
      const num = String(i + 1).padStart(2, '0');
      const id = `cubicle-${num}`;
      let cfg = configs.find((c) => c.id === id);

      if (!cfg) {
        cfg = {
          id,
          slot_index: i,
          row: Math.floor(i / 4),
          col: i % 4,
          enabled: false,
          brand: null,
          model: null,
          display_name: `Unassigned Slot ${num}`,
          thinking_level: 'Medium',
          thinking_budget_tokens: 0,
          can_spawn_subswarm: false,
          cli_template: '',
          api_key_env_var: '',
          quota: {
            max_tokens: 1000000,
            tokens_used: 0,
            max_cost_usd: 0,
            cost_usd_accumulated: 0,
          },
        };
      }

      cfg.port = 4101 + i;

      const stamina = QuotaTracker.calculateStamina(cfg.quota.max_tokens, cfg.quota.tokens_used);
      const fatigue = 100 - stamina;
      const tier = QuotaTracker.getStaminaTier(stamina);

      const status: CubicleStatus = !cfg.enabled
        ? 'vacant'
        : stamina === 0
        ? 'exhausted'
        : 'idle';

      const liveState: CubicleLiveState & { state?: string } = {
        id,
        config: cfg,
        status,
        state: CubicleManager.mapStatusToDisplayState(status),
        current_task_id: null,
        active_subswarm_id: null,
        surface_thoughts: cfg.enabled ? 'Initialized. Standing by for instructions.' : 'Slot unassigned.',
        stamina_percentage: stamina,
        fatigue_percentage: fatigue,
        stamina_tier: tier,
        last_heartbeat: new Date().toISOString(),
        worktree_path: path.resolve(this.swarmDir, '..', 'worktrees', id),
        branch_name: `swarm/${id}`,
        process_pid: null,
        port: 4101 + i,
        error_details: null,
      };

      this.cubicles.set(id, liveState);
      await this.saveStatusFile(liveState);
    }
  }

  /**
   * Registers a listener for live state change events.
   */
  public onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitStateChange(state: CubicleLiveState, reason?: string): void {
    for (const listener of this.listeners) {
      try {
        listener(state, reason);
      } catch {
        // Safe callback isolation
      }
    }
  }

  /**
   * Returns a specific cubicle by ID (e.g. 'cubicle-01').
   */
  public getCubicle(id: string): CubicleLiveState {
    const cubicle = this.cubicles.get(id);
    if (!cubicle) {
      throw new Error(`Cubicle with ID '${id}' not found in 16-slot grid.`);
    }
    return cubicle;
  }

  /**
   * Returns all 16 cubicle states sorted by slot index.
   */
  public getAllCubicles(): CubicleLiveState[] {
    return Array.from(this.cubicles.values()).sort(
      (a, b) => a.config.slot_index - b.config.slot_index
    );
  }

  /**
   * Transitions a cubicle to a new status with validation.
   */
  public async transitionStatus(
    id: string,
    targetStatus: CubicleStatus,
    reason?: string
  ): Promise<CubicleLiveState> {
    const cubicle = this.getCubicle(id);
    const currentStatus = cubicle.status;

    if (currentStatus === targetStatus) {
      cubicle.last_heartbeat = new Date().toISOString();
      await this.saveStatusFile(cubicle);
      this.emitStateChange(cubicle, reason);
      return cubicle; // Idempotent state refresh with event notification
    }

    const allowed = CubicleManager.VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new InvalidTransitionError(id, currentStatus, targetStatus);
    }

    // Invariant checks
    if (targetStatus === 'working' && cubicle.stamina_percentage <= 0) {
      throw new InvalidTransitionError(
        id,
        currentStatus,
        targetStatus,
        `Cannot transition ${id} to 'working': Quota is fully exhausted (stamina = 0%).`
      );
    }

    cubicle.status = targetStatus;
    (cubicle as any).state = CubicleManager.mapStatusToDisplayState(targetStatus);
    cubicle.last_heartbeat = new Date().toISOString();

    if (currentStatus === 'vacant' && targetStatus !== 'vacant' && !cubicle.config.enabled) {
      const isAstra = (cubicle.config.slot_index + 1) % 3 === 0;
      cubicle.config.enabled = true;
      cubicle.config.brand = cubicle.config.brand || (isAstra ? 'GPT / OpenAI' : 'Gemini');
      cubicle.config.model = cubicle.config.model || (isAstra ? 'gpt-astra' : 'gemini-4-argon');
      cubicle.config.display_name =
        cubicle.config.display_name && !cubicle.config.display_name.startsWith('Unassigned')
          ? cubicle.config.display_name
          : isAstra
          ? 'GPT Astra (Very High)'
          : 'Gemini 4 Argon (High)';
      await this.saveRosterFile();
    }

    if (targetStatus === 'idle') {
      cubicle.current_task_id = null;
      cubicle.active_subswarm_id = null;
      cubicle.process_pid = null;
      cubicle.error_details = null;
      cubicle.surface_thoughts = 'Standing by.';
    } else if (targetStatus === 'vacant') {
      cubicle.config.enabled = false;
      cubicle.current_task_id = null;
      cubicle.active_subswarm_id = null;
      cubicle.process_pid = null;
      cubicle.surface_thoughts = 'Slot vacant.';
    } else if (reason) {
      cubicle.surface_thoughts = reason;
    }

    await this.saveStatusFile(cubicle);
    this.emitStateChange(cubicle, reason);
    return cubicle;
  }

  /**
   * Updates configuration for a cubicle.
   */
  public async configureCubicle(
    id: string,
    dto: ConfigureCubicleDTO
  ): Promise<CubicleLiveState> {
    const cubicle = this.getCubicle(id);
    const cfg = cubicle.config;

    if (dto.enabled !== undefined) cfg.enabled = dto.enabled;
    if (dto.brand !== undefined) cfg.brand = dto.brand;
    if (dto.model !== undefined) cfg.model = dto.model;
    if (dto.display_name !== undefined) cfg.display_name = dto.display_name;
    if (dto.thinking_level !== undefined) cfg.thinking_level = dto.thinking_level;
    if (dto.thinking_budget_tokens !== undefined) cfg.thinking_budget_tokens = dto.thinking_budget_tokens;
    if (dto.can_spawn_subswarm !== undefined) cfg.can_spawn_subswarm = dto.can_spawn_subswarm;
    if (dto.cli_template !== undefined) cfg.cli_template = dto.cli_template;
    if (dto.api_key_env_var !== undefined) cfg.api_key_env_var = dto.api_key_env_var;
    if (dto.max_tokens !== undefined) cfg.quota.max_tokens = dto.max_tokens;
    if (dto.max_cost_usd !== undefined) cfg.quota.max_cost_usd = dto.max_cost_usd;

    // Recalculate stamina
    const stamina = QuotaTracker.calculateStamina(cfg.quota.max_tokens, cfg.quota.tokens_used);
    cubicle.stamina_percentage = stamina;
    cubicle.fatigue_percentage = 100 - stamina;
    cubicle.stamina_tier = QuotaTracker.getStaminaTier(stamina);

    if (cfg.enabled && cubicle.status === 'vacant') {
      cubicle.status = stamina === 0 ? 'exhausted' : 'idle';
      cubicle.surface_thoughts = 'Configured and ready.';
    } else if (!cfg.enabled && cubicle.status !== 'vacant') {
      cubicle.status = 'vacant';
      cubicle.surface_thoughts = 'Slot unassigned.';
    }

    await this.saveRosterFile();
    await this.saveStatusFile(cubicle);
    this.emitStateChange(cubicle, 'CUBICLE_CONFIGURED');
    return cubicle;
  }

  /**
   * Clears a cubicle slot back to vacant.
   */
  public async clearCubicle(id: string): Promise<CubicleLiveState> {
    const cubicle = this.getCubicle(id);
    cubicle.config.enabled = false;
    cubicle.config.brand = null;
    cubicle.config.model = null;
    cubicle.config.display_name = `Unassigned Slot ${String(cubicle.config.slot_index + 1).padStart(2, '0')}`;
    cubicle.config.can_spawn_subswarm = false;
    cubicle.status = 'vacant';
    cubicle.current_task_id = null;
    cubicle.active_subswarm_id = null;
    cubicle.surface_thoughts = 'Slot cleared.';

    await this.saveRosterFile();
    await this.saveStatusFile(cubicle);
    this.emitStateChange(cubicle, 'CUBICLE_CLEARED');
    return cubicle;
  }

  /**
   * Dynamically scales the number of active (enabled) cubicles between 0 and 16
   * according to task intensity, prioritizing speed while conserving idle resources.
   */
  public async scaleCubicles(
    targetCount: number,
    reason?: string
  ): Promise<{ activeCount: number; filled: string[]; emptied: string[] }> {
    const clamped = Math.max(0, Math.min(16, Math.floor(Number(targetCount) || 0)));
    const all = this.getAllCubicles();
    const enabled = all.filter((c) => c.config.enabled);
    const filled: string[] = [];
    const emptied: string[] = [];

    if (enabled.length > clamped) {
      const toRemove = enabled.length - clamped;
      // Prefer clearing idle/vacant/error slots from highest index down before touching working slots
      const candidates = [...enabled].sort((a, b) => {
        const aBusy = a.status === 'working' || a.status === 'under_inspection' ? 1 : 0;
        const bBusy = b.status === 'working' || b.status === 'under_inspection' ? 1 : 0;
        if (aBusy !== bBusy) return aBusy - bBusy;
        return b.config.slot_index - a.config.slot_index;
      });
      for (const cub of candidates.slice(0, toRemove)) {
        await this.clearCubicle(cub.id);
        if (reason) {
          await this.updateSurfaceThoughts(cub.id, `Emptied: ${reason}`);
        }
        emptied.push(cub.id);
      }
    } else if (enabled.length < clamped) {
      const toAdd = clamped - enabled.length;
      const vacant = all.filter((c) => !c.config.enabled);
      for (const cub of vacant.slice(0, toAdd)) {
        const isAstra = (cub.config.slot_index + 1) % 3 === 0;
        await this.configureCubicle(cub.id, {
          enabled: true,
          brand: isAstra ? 'GPT / OpenAI' : 'Gemini',
          model: isAstra ? 'gpt-astra' : 'gemini-4-argon',
          display_name: isAstra ? 'GPT Astra (Very High)' : 'Gemini 4 Argon (High)',
          thinking_level: isAstra ? 'Very High' : 'High',
          thinking_budget_tokens: isAstra ? 32000 : 16000,
          can_spawn_subswarm: !isAstra,
          cli_template: isAstra
            ? '"C:\\Users\\green\\AppData\\Local\\OpenAI\\Codex\\bin\\e78bad9887fa50cf\\codex.exe" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -m gpt-6-astra -C "{{worktree_dir}}" "{{prompt}}"'
            : '"C:\\Users\\green\\.gemini\\bin\\agy.exe" --model gemini-4-argon-high --dangerously-skip-permissions --print-timeout 0 --disable-slash-commands -w "{{worktree_dir}}" -p "{{prompt}}"',
          api_key_env_var: isAstra ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY',
          max_tokens: isAstra ? 1500000 : 2000000,
          max_cost_usd: isAstra ? 30.0 : 20.0,
        });
        if (reason) {
          await this.updateSurfaceThoughts(cub.id, `Filled: ${reason}`);
        }
        filled.push(cub.id);
      }
    }

    const activeCount = this.getAllCubicles().filter((c) => c.config.enabled).length;
    return { activeCount, filled, emptied };
  }

  /**
   * Records token usage and updates fatigue / exhaustion.
   */
  public async recordTokenConsumption(
    id: string,
    tokens: number,
    costUSD: number = 0
  ): Promise<CubicleLiveState> {
    const cubicle = this.getCubicle(id);
    const result = QuotaTracker.recordUsage(cubicle.config.quota, tokens, costUSD);

    cubicle.stamina_percentage = result.staminaPercentage;
    cubicle.fatigue_percentage = result.fatiguePercentage;
    cubicle.stamina_tier = result.staminaTier;

    if (result.isExhausted && cubicle.status !== 'exhausted') {
      cubicle.status = 'exhausted';
      cubicle.surface_thoughts = 'FLATLINED: Token quota depleted.';
      this.emitStateChange(cubicle, 'QUOTA_EXHAUSTED');
    }

    await this.saveStatusFile(cubicle);
    return cubicle;
  }

  /**
   * Recharges quota tokens and restores idle status if exhausted.
   */
  public async rechargeQuota(
    id: string,
    additionalTokens?: number
  ): Promise<CubicleLiveState> {
    const cubicle = this.getCubicle(id);
    const result = QuotaTracker.recharge(cubicle.config.quota, additionalTokens);

    cubicle.stamina_percentage = result.staminaPercentage;
    cubicle.fatigue_percentage = result.fatiguePercentage;
    cubicle.stamina_tier = result.staminaTier;

    if (cubicle.status === 'exhausted' && result.staminaPercentage > 0) {
      cubicle.status = 'idle';
      cubicle.surface_thoughts = 'Quota replenished. Ready.';
      this.emitStateChange(cubicle, 'QUOTA_RECHARGED');
    }

    await this.saveStatusFile(cubicle);
    return cubicle;
  }

  /**
   * Updates surface thoughts stream ticker.
   */
  public async updateSurfaceThoughts(id: string, thoughts: string): Promise<void> {
    const cubicle = this.getCubicle(id);
    cubicle.surface_thoughts = thoughts;
    cubicle.last_heartbeat = new Date().toISOString();
    await this.saveStatusFile(cubicle);
    this.emitStateChange(cubicle, 'THOUGHT_UPDATE');
  }

  private errorCounts: Map<string, number> = new Map();

  public getCubiclePort(cubicleId: string): number {
    const cubicle = this.cubicles.get(cubicleId);
    if (cubicle && cubicle.port) return cubicle.port;
    const match = cubicleId.match(/\d+/);
    const index = match ? parseInt(match[0], 10) : 1;
    return 4100 + index;
  }

  public recordError(cubicleId: string, error: string): { trippedCircuitBreaker: boolean; count: number } {
    const count = (this.errorCounts.get(cubicleId) || 0) + 1;
    this.errorCounts.set(cubicleId, count);
    const cubicle = this.cubicles.get(cubicleId);
    if (cubicle) {
      cubicle.error_details = {
        message: error,
        incident_id: `inc-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      if (count >= 3) {
        cubicle.status = 'error';
        cubicle.surface_thoughts = `Circuit breaker tripped: >= 3 consecutive errors (${count}).`;
        this.saveStatusFile(cubicle).catch((err) =>
          console.error(`[CubicleManager] Failed to persist status file for ${cubicle.id}:`, err)
        );
        this.emitStateChange(cubicle, 'CIRCUIT_BREAKER_TRIPPED');
        return { trippedCircuitBreaker: true, count };
      }
      this.saveStatusFile(cubicle).catch((err) =>
        console.error(`[CubicleManager] Failed to persist status file for ${cubicle.id}:`, err)
      );
      this.emitStateChange(cubicle, 'ERROR_RECORDED');
    }
    return { trippedCircuitBreaker: false, count };
  }

  public resetErrorCount(cubicleId: string): void {
    this.errorCounts.set(cubicleId, 0);
  }

  public async failoverTask(
    fromCubicleId: string,
    toCubicleId: string,
    reason?: string
  ): Promise<{ success: boolean; task_id: string | null; from: string; to: string }> {
    const fromCubicle = this.getCubicle(fromCubicleId);
    const toCubicle = this.getCubicle(toCubicleId);
    const taskId = fromCubicle.current_task_id;

    if (!taskId) {
      return { success: false, task_id: null, from: fromCubicleId, to: toCubicleId };
    }

    fromCubicle.current_task_id = null;
    fromCubicle.status = 'error';
    fromCubicle.surface_thoughts = `Task failed over to ${toCubicleId}: ${reason || 'failover triggered'}`;

    toCubicle.current_task_id = taskId;
    toCubicle.status = 'working';
    toCubicle.surface_thoughts = `Claimed failed-over task ${taskId} from ${fromCubicleId}.`;

    await this.saveStatusFile(fromCubicle);
    await this.saveStatusFile(toCubicle);

    this.emitStateChange(fromCubicle, 'TASK_FAILED_OVER');
    this.emitStateChange(toCubicle, 'TASK_ADOPTED');

    return { success: true, task_id: taskId, from: fromCubicleId, to: toCubicleId };
  }

  /**
   * Persists roster.json.
   */
  private async saveRosterFile(): Promise<void> {
    const configs = Array.from(this.cubicles.values()).map((c) => c.config);
    const payload = JSON.stringify(configs, null, 2);
    const prev = this.writeQueues.get('__roster__') || Promise.resolve();
    const next = prev.catch(() => {}).then(() => fs.writeFile(this.rosterPath, payload, 'utf8'));
    this.writeQueues.set('__roster__', next);
    await next;
  }

  /**
   * Persists status/cubicle-XX.json.
   */
  private async saveStatusFile(state: CubicleLiveState): Promise<void> {
    const filePath = path.join(this.statusDir, `${state.id}.json`);
    const payload = JSON.stringify(state, null, 2);
    const prev = this.writeQueues.get(state.id) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => fs.writeFile(filePath, payload, 'utf8'));
    this.writeQueues.set(state.id, next);
    await next;
  }
}
