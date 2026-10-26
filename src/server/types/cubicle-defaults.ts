/**
 * src/server/types/cubicle-defaults.ts
 *
 * Initial Default Pre-Configuration Roster for the 16-Cubicle Swarm.
 * Mandated:
 * - Cubicles 1 & 2: Gemini 4 Argon (High), can_spawn_subswarm = true
 * - Cubicle 3: GPT Astra (Very High), can_spawn_subswarm = false (STRICT RESTRICTION)
 * - Cubicles 4–16: Blank / Unassigned slots, enabled = false
 */

import { CubicleConfig } from './cubicle.js';

export const DEFAULT_CUBICLE_ROSTER: CubicleConfig[] = [
  // Cubicle 1: Gemini 4 Argon (High) - Sub-swarm authorized
  {
    id: 'cubicle-01',
    slot_index: 0,
    row: 0,
    col: 0,
    enabled: true,
    brand: 'Gemini',
    model: 'gemini-4-argon',
    display_name: 'Gemini 4 Argon (High)',
    thinking_level: 'High',
    thinking_budget_tokens: 16000,
    can_spawn_subswarm: true,
    cli_template: 'gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file "{{prompt_file}}" --dir "{{worktree_dir}}"',
    api_key_env_var: 'GEMINI_API_KEY',
    quota: {
      max_tokens: 2000000,
      tokens_used: 0,
      max_cost_usd: 20.0,
      cost_usd_accumulated: 0.0,
    },
  },

  // Cubicle 2: Gemini 4 Argon (High) - Sub-swarm authorized
  {
    id: 'cubicle-02',
    slot_index: 1,
    row: 0,
    col: 1,
    enabled: true,
    brand: 'Gemini',
    model: 'gemini-4-argon',
    display_name: 'Gemini 4 Argon (High)',
    thinking_level: 'High',
    thinking_budget_tokens: 16000,
    can_spawn_subswarm: true,
    cli_template: 'gemini run --model {{model}} --thinking-budget {{thinking_budget}} --input-file "{{prompt_file}}" --dir "{{worktree_dir}}"',
    api_key_env_var: 'GEMINI_API_KEY',
    quota: {
      max_tokens: 2000000,
      tokens_used: 0,
      max_cost_usd: 20.0,
      cost_usd_accumulated: 0.0,
    },
  },

  // Cubicle 3: GPT Astra (Very High) - STRICTLY RESTRICTED from sub-swarms
  {
    id: 'cubicle-03',
    slot_index: 2,
    row: 0,
    col: 2,
    enabled: true,
    brand: 'GPT / OpenAI',
    model: 'gpt-astra',
    display_name: 'GPT Astra (Very High)',
    thinking_level: 'Very High',
    thinking_budget_tokens: 32000,
    can_spawn_subswarm: false, // MANDATORY: Restricted solo worker!
    cli_template: 'openai api chat.completions.create --model {{model}} --input "{{prompt}}" --workdir "{{worktree_dir}}"',
    api_key_env_var: 'OPENAI_API_KEY',
    quota: {
      max_tokens: 1500000,
      tokens_used: 0,
      max_cost_usd: 30.0,
      cost_usd_accumulated: 0.0,
    },
  },

  // Cubicles 4-16: Blank / Unassigned slots
  ...Array.from({ length: 13 }, (_, i) => {
    const slotIndex = i + 3;
    const num = String(slotIndex + 1).padStart(2, '0');
    return {
      id: `cubicle-${num}`,
      slot_index: slotIndex,
      row: Math.floor(slotIndex / 4),
      col: slotIndex % 4,
      enabled: false,
      brand: null,
      model: null,
      display_name: `Unassigned Slot ${num}`,
      thinking_level: 'Medium' as const,
      thinking_budget_tokens: 0,
      can_spawn_subswarm: false,
      cli_template: '',
      api_key_env_var: '',
      quota: {
        max_tokens: 1000000,
        tokens_used: 0,
        max_cost_usd: 0.0,
        cost_usd_accumulated: 0.0,
      },
    };
  }),
];
