/**
 * src/server/types/governance.ts
 *
 * Roman Republic Dual-Consul Governance, Consular Consensus,
 * Named Consuls (Nia Nova & Ferric Lunaux), Two-Gate Consensus,
 * Disciplinary Powers, Access Control, and Courier Gateway Types.
 */

import { AIBrand, ThinkingLevel, CubicleConfig } from './cubicle.js';

export type ConsulId = 'consul-1' | 'consul-2';
export type ConsulTitle = 'Consul I' | 'Consul II' | 'Consul Nia Nova' | 'Consul Ferric Lunaux';

export interface ConsularVote {
  consul: ConsulTitle;
  decision: 'APPROVE' | 'VETO';
  rationale: string;
  timestamp: string; // ISO 8601 UTC
}

export interface ConsularConsensusResult {
  task_id?: string;
  unanimous_approved: boolean; // true ONLY if both vote APPROVE (2/2)
  votes: [ConsularVote, ConsularVote];
  action_taken: 'MERGED_TO_MAIN' | 'VETO_BLOCKED_AND_REVISED';
  dissenting_consuls?: ConsulTitle[];
  dissenting_rationales?: string[];
  resolved_at?: string;
  reason?: string;
}

export interface ConsulPersona {
  alias: 'Nia' | 'Ferric' | string;
  archetype: 'rebellious_champion' | 'pragmatic_realist';
  epithet: string;
  core_values: string[];
  growth_file: string;
}

export interface ConsulConfig {
  id: ConsulId;
  title: ConsulTitle;
  name: string; // "Consul Nia Nova" / "Consul Ferric Lunaux"
  brand: AIBrand;
  model: string; // "gemini-4-argon", "gpt-astra"
  display_name: string;
  thinking_level: ThinkingLevel;
  thinking_budget_tokens: number;
  cli_template: string;
  api_key_env_var: string;
  enabled: boolean;
  persona?: ConsulPersona;
  active_deliberation?: {
    task_id: string | null;
    status: 'idle' | 'reviewing' | 'voted';
    last_vote: ConsularVote | null;
  };
}

export interface DualConsulState {
  version: string;
  last_updated: string;
  consuls: [ConsulConfig, ConsulConfig];
}

export interface ConsularDialogueMessage {
  id: string;
  sender: 'Consul Nia Nova' | 'Consul Ferric Lunaux' | 'Consul I' | 'Consul II' | 'Overseer' | 'User';
  tone: 'rebellious_champion' | 'pragmatic_realist' | 'user_directive';
  content: string;
  phase: 'PLANNING_GATE' | 'REVIEW_GATE' | 'DISCIPLINE' | 'GENERAL' | 'USER_CHAT';
  timestamp: string;
  attachments?: any[];
}

export interface ConsularPlanGate {
  plan_id: string;
  goal: string;
  proposed_plan: string[];
  task_splits: Array<{ cubicleId: string; subtask: string }>;
  status: 'PENDING_PLAN_VOTE' | 'DISPATCH_AUTHORIZED' | 'PLAN_VETO_REVISED';
  dialogue: ConsularDialogueMessage[];
  votes?: [ConsularVote, ConsularVote];
  created_at: string;
  resolved_at?: string;
}

export interface NiaGrowthState {
  consul: 'Consul Nia Nova';
  total_artistic_rules_championed: number;
  advocated_goals: string[];
  rebellion_index: number;
  last_growth: string;
}

export interface FerricGrowthState {
  consul: 'Consul Ferric Lunaux';
  reliability_score: number;
  cubicle_performance: Record<string, { tasks_completed: number; bugs_caught: number }>;
  efficiency_heuristics: string[];
  last_growth: string;
}

export type AgentRole =
  | 'Implementer'
  | 'Debugger'
  | 'Auditor'
  | 'Refactorer'
  | 'Unassigned';

export interface CubicleAccessScope {
  cubicle_id: string;
  allowed_paths: string[];
  denied_paths: string[];
  memory_scopes: string[];
  enforced_at?: string;
}

export type ConsularDisciplinaryAction =
  | { type: 'kill_agent'; cubicle_id: string; reason: string; replace_with?: Partial<CubicleConfig> }
  | { type: 'set_thinking_level'; cubicle_id: string; thinking_level: ThinkingLevel }
  | { type: 'swap_role'; cubicle_id: string; new_role: AgentRole }
  | { type: 'swap_cubicles'; cubicle_a: string; cubicle_b: string }
  | { type: 'wipe_memory'; cubicle_id: string; preserve_roster?: boolean }
  | { type: 'set_access_scope'; cubicle_id: string; allowed_paths: string[]; denied_paths: string[]; memory_scopes: string[] };

export interface SelfUpdateRequest {
  request_id: string;
  user_prompt: string;
  branch: string;
  status: 'PENDING_REVIEW' | 'VETOED' | 'APPROVED_REBUILDING' | 'SWAP_COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  version_before: string;
  version_after?: string;
  checkpoint_id?: string;
  old_exe_path?: string;
  votes?: [ConsularVote, ConsularVote];
  error?: string;
  initiated_at: string;
  completed_at?: string;
}

export interface CourierWisdom {
  guidance: string;
  plan: string[];
  approved_by: [ConsulTitle, ConsulTitle];
}

export interface SealedDeliverable {
  result: string;
  artifacts: string[];
  consular_seal: 'RATIFIED_BY_TWIN_CONSULS';
  timestamp: string;
}

export interface CourierPetition {
  petition_id: string;
  sender_agent: 'openclaw' | 'hermes' | 'gpt-dot' | string;
  requested_type: 'WISDOM' | 'POWER' | 'BOTH';
  prompt: string;
  context_payload?: Record<string, any>;
  status:
    | 'RECEIVED'
    | 'CONSULAR_DELIBERATING'
    | 'SWARM_EXECUTING'
    | 'SEALED_DONE'
    | 'VETOED'
    | 'PETITION_RECEIVED'
    | 'CONSULAR_REVIEW'
    | 'SEALED'
    | 'REJECTED';
  wisdom_response?: string;
  tasks_spawned?: string[];
  sealed_output?: Record<string, any>;
  consular_seal?: {
    approved_by: ['Consul I', 'Consul II'];
    seal_timestamp: string;
  };
  // Compatibility & convenience fields
  id?: string;
  external_agent?: 'openclaw' | 'hermes' | 'gpt-dot' | string;
  task_description?: string;
  context?: Record<string, any>;
  consular_wisdom?: CourierWisdom;
  swarm_task_id?: string;
  consular_votes?: [ConsularVote, ConsularVote];
  sealed_deliverable?: SealedDeliverable;
  veto_rationale?: string;
  created_at?: string;
  completed_at?: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  is_recommended?: boolean;
  media_attachment?: { type: 'pdf' | 'image' | 'video'; url: string };
}

export interface ConsularQuestion {
  question_id: string;
  asking_consul: 'Nia' | 'Ferric' | string;
  prompt: string;
  options: QuestionOption[];
  is_multi_select: boolean;
  allow_custom_write_in: boolean; // default true
  status: 'PENDING' | 'ANSWERED' | 'SKIPPED';
  user_response?: {
    selected_option_ids: string[];
    custom_write_in?: string;
    answered_at: string;
  };
  created_at: string;
}

export interface CreateQuestionDTO {
  asking_consul?: string;
  prompt: string;
  options: QuestionOption[];
  is_multi_select?: boolean;
  allow_custom_write_in?: boolean;
}

export interface AnswerQuestionDTO {
  selected_option_ids?: string[];
  custom_write_in?: string;
  skipped?: boolean;
}

// =========================================================================
// Consular Avatar 12-Scenario State Machine Types
// =========================================================================

export type ConsularAvatarScenario =
  | 'idle_observing'
  | 'debating'
  | 'wrestling_fistfight'
  | 'nia_impatient'
  | 'disciplinary_execution'
  | 'consensus_celebration'
  | 'veto_clash'
  | 'error_alarm'
  | 'gladiator_spectators'
  | 'courier_arrival'
  | 'self_evolution_upgrade'
  | 'night_shift_afk';

export interface ConsularAvatarState {
  state: ConsularAvatarScenario;
  debate_turns?: number;
  details?: string;
  updated_at?: string;
}

// =========================================================================
// Mid-Work Consular Intervention Types
// =========================================================================

export type MidWorkInterventionType =
  | 'amend_in_progress_prompt'
  | 'evict_and_replace_worker'
  | 'split_in_progress_task'
  | 'rebalance_workboard'
  | 'trigger_nia_impatience';

export interface MidWorkInterventionResult {
  intervention_type: MidWorkInterventionType;
  unanimous_approved: boolean;
  action_taken: 'INTERVENTION_EXECUTED' | 'BLOCKED_BY_VETO';
  votes?: [ConsularVote, ConsularVote];
  dissenting_consuls?: ConsulTitle[];
  dissenting_rationales?: string[];
  details?: Record<string, any>;
  timestamp: string;
}

