/**
 * src/server/types/cubicle.ts
 *
 * Cubicle Types, Schemas, and State Models for Symlinked Agent Swarm Engine.
 * Supports the 4x4 spatial grid of 16 worker cubicles, provider configuration,
 * lifecycle state machines, and stamina/fatigue tracking.
 */

import type { AgentRole, CubicleAccessScope } from './governance.js';
export type { AgentRole, CubicleAccessScope };

export type AIBrand = 
  | 'Gemini' 
  | 'GPT / OpenAI' 
  | 'Claude / Anthropic' 
  | 'DeepSeek' 
  | 'Custom CLI';

export type ThinkingLevel = 
  | 'Low' 
  | 'Medium' 
  | 'High' 
  | 'Very High' 
  | 'Ultra';

export type CubicleStatus = 
  | 'vacant' 
  | 'idle' 
  | 'working' 
  | 'under_inspection' 
  | 'error' 
  | 'exhausted';

export type StaminaTier = 
  | 'energized' 
  | 'fatigued' 
  | 'critical_strain' 
  | 'exhausted';

/**
 * Quota and financial budget limits for a cubicle
 */
export interface CubicleQuotaConfig {
  max_tokens: number;
  tokens_used: number;
  max_cost_usd: number;
  cost_usd_accumulated: number;
}

/**
 * Administrative configuration for a cubicle slot
 */
export interface CubicleConfig {
  id: string; // e.g. 'cubicle-01' through 'cubicle-16'
  slot_index: number; // 0 to 15
  row: number; // 0 to 3
  col: number; // 0 to 3
  enabled: boolean;
  brand: AIBrand | null;
  model: string | null; // e.g. 'gemini-4-argon', 'gpt-astra'
  display_name: string;
  thinking_level: ThinkingLevel;
  thinking_budget_tokens: number;
  can_spawn_subswarm: boolean;
  cli_template: string;
  api_key_env_var: string;
  quota: CubicleQuotaConfig;
  role?: AgentRole;
  access_scope?: CubicleAccessScope;
  port?: number;
}

/**
 * Real-time operational state and telemetry of a cubicle
 */
export interface CubicleLiveState {
  id: string; // 'cubicle-01' .. 'cubicle-16'
  config: CubicleConfig;
  status: CubicleStatus;
  current_task_id: string | null;
  active_subswarm_id: string | null;
  surface_thoughts: string;
  stamina_percentage: number; // 100 (energized) to 0 (exhausted)
  fatigue_percentage: number; // 0 (fresh) to 100 (exhausted)
  stamina_tier: StaminaTier;
  last_heartbeat: string; // ISO 8601 UTC
  worktree_path: string;
  branch_name: string; // 'swarm/cubicle-XX'
  process_pid: number | null;
  role?: AgentRole;
  access_scope?: CubicleAccessScope;
  port?: number;
  error_details: {
    message: string;
    incident_id: string | null;
    timestamp: string;
  } | null;
}

/**
 * Context variables available for CLI command template parameter interpolation
 */
export interface CLITemplateContext {
  prompt: string;
  prompt_file: string;
  model: string;
  thinking_level: ThinkingLevel;
  thinking_budget: number;
  worktree_dir: string;
  task_id: string;
  cubicle_id: string;
  api_key: string;
}

/**
 * Update request payload for configuring a cubicle slot
 */
export interface ConfigureCubicleDTO {
  enabled?: boolean;
  brand?: AIBrand | null;
  model?: string | null;
  display_name?: string;
  thinking_level?: ThinkingLevel;
  thinking_budget_tokens?: number;
  can_spawn_subswarm?: boolean;
  cli_template?: string;
  api_key_env_var?: string;
  max_tokens?: number;
  max_cost_usd?: number;
  role?: AgentRole;
  access_scope?: CubicleAccessScope;
}
