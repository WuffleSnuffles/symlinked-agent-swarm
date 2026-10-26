/**
 * src/server/capability-matrix.ts
 *
 * Thinking-Tier-Gated Sub-Swarm Spawning Matrix and Rules Engine.
 * Enforces the strict capability matrix:
 * - Gemini 4 Argon (High): can_spawn_subswarm = true
 * - GPT Astra (Very High): can_spawn_subswarm = false (Strict Restriction)
 * - GPT Astra (Ultra): can_spawn_subswarm = true
 * - Recursion Depth Cap: max_depth = 1 (Child workers can NEVER spawn nested sub-swarms)
 */

import { ThinkingLevel, AIBrand } from './types/cubicle.js';

export class CapabilityRestrictionError extends Error {
  public readonly code = 'CAPABILITY_RESTRICTION_ERROR';
  public readonly statusCode = 403;

  constructor(
    public model: string,
    public thinkingLevel: ThinkingLevel,
    public cubicleId?: string,
    message?: string
  ) {
    super(
      message ||
        `CAPABILITY_RESTRICTION_ERROR: Model '${model}' with thinking level '${thinkingLevel}' is restricted from spawning sub-swarms.`
    );
    this.name = 'CapabilityRestrictionError';
  }
}

export class MaxRecursionDepthError extends Error {
  public readonly code = 'MAX_RECURSION_DEPTH_EXCEEDED';
  public readonly statusCode = 400;

  constructor(
    public currentDepth: number,
    public maxDepth: number = 1,
    public cubicleId?: string
  ) {
    super(
      `MAX_RECURSION_DEPTH_EXCEEDED: Sub-swarm depth ${currentDepth} exceeds maximum allowable depth (${maxDepth}). Nested child sub-swarms are prohibited.`
    );
    this.name = 'MaxRecursionDepthError';
  }
}

export interface CapabilityRule {
  model_pattern: string | RegExp;
  brand?: AIBrand;
  thinking_tier: ThinkingLevel | 'ANY';
  can_spawn_subswarm: boolean;
  rationale?: string;
}

export const DEFAULT_CAPABILITY_RULES: CapabilityRule[] = [
  // Rule 1: Gemini 4 Argon (High) - Sub-swarm authorized
  {
    model_pattern: /gemini[- ]?4[- ]?argon/i,
    thinking_tier: 'High',
    can_spawn_subswarm: true,
    rationale: 'Gemini 4 Argon (High) is authorized to spawn parallel sub-swarm micro-agents.',
  },

  // Rule 2: GPT Astra (Very High) - STRICTLY RESTRICTED SOLO WORKER
  {
    model_pattern: /gpt[- ]?astra/i,
    thinking_tier: 'Very High',
    can_spawn_subswarm: false,
    rationale: 'GPT Astra (Very High) is restricted from spawning sub-swarms; operates strictly as a solo worker.',
  },

  // Rule 3: GPT Astra (Ultra) - Sub-swarm authorized
  {
    model_pattern: /gpt[- ]?astra/i,
    thinking_tier: 'Ultra',
    can_spawn_subswarm: true,
    rationale: 'GPT Astra (Ultra) thinking tier enables sub-swarm spawning capability.',
  },

  // Rule 4: Universal Ultra tier models
  {
    model_pattern: /.*/,
    thinking_tier: 'Ultra',
    can_spawn_subswarm: true,
    rationale: 'Ultra thinking tier provides high-capacity reasoning necessary for child sub-agent management.',
  },

  // Rule 5: Universal Low and Medium tiers - Restricted
  {
    model_pattern: /.*/,
    thinking_tier: 'Low',
    can_spawn_subswarm: false,
    rationale: 'Low thinking tier lacks multi-task decomposition capability.',
  },
  {
    model_pattern: /.*/,
    thinking_tier: 'Medium',
    can_spawn_subswarm: false,
    rationale: 'Medium thinking tier lacks multi-task decomposition capability.',
  },
];

export class CapabilityMatrix {
  private rules: CapabilityRule[];
  private maxDepth: number;

  constructor(rules: CapabilityRule[] = DEFAULT_CAPABILITY_RULES, maxDepth: number = 1) {
    this.rules = [...rules];
    this.maxDepth = maxDepth;
  }

  /**
   * Evaluates whether a model at a given thinking tier and depth can spawn sub-swarms.
   */
  public evaluate(params: {
    model: string;
    thinkingLevel: ThinkingLevel;
    currentDepth?: number;
    manualOverride?: boolean;
    cubicleId?: string;
  }): { allowed: boolean; reason: string } {
    const currentDepth = params.currentDepth ?? 0;

    // Invariant 1: Recursion depth enforcement
    if (currentDepth >= this.maxDepth) {
      throw new MaxRecursionDepthError(currentDepth, this.maxDepth, params.cubicleId);
    }

    // Invariant 2: Explicit manual override bypass
    if (params.manualOverride !== undefined) {
      return {
        allowed: params.manualOverride,
        reason: params.manualOverride
          ? 'Authorized via explicit manual administrator override in cubicle configuration.'
          : 'Blocked via explicit manual administrator override in cubicle configuration.',
      };
    }

    const normModel = params.model.trim();
    const normTier = params.thinkingLevel;

    // Match against rules in priority order
    for (const rule of this.rules) {
      const patternMatch =
        typeof rule.model_pattern === 'string'
          ? normModel.toLowerCase().includes(rule.model_pattern.toLowerCase())
          : rule.model_pattern.test(normModel);

      const tierMatch =
        rule.thinking_tier === 'ANY' ||
        rule.thinking_tier.toLowerCase() === normTier.toLowerCase();

      if (patternMatch && tierMatch) {
        return {
          allowed: rule.can_spawn_subswarm,
          reason: rule.rationale || (rule.can_spawn_subswarm ? 'Authorized by capability rule.' : 'Restricted by capability rule.'),
        };
      }
    }

    // Default conservative fallback
    return {
      allowed: false,
      reason: `CAPABILITY_RESTRICTION_ERROR: No matching authorizing rule found for model '${normModel}' at tier '${normTier}'.`,
    };
  }

  /**
   * Asserts capability or throws CapabilityRestrictionError.
   */
  public assertCanSpawn(params: {
    model: string;
    thinkingLevel: ThinkingLevel;
    currentDepth?: number;
    manualOverride?: boolean;
    cubicleId?: string;
  }): void {
    const evaluation = this.evaluate(params);
    if (!evaluation.allowed) {
      throw new CapabilityRestrictionError(
        params.model,
        params.thinkingLevel,
        params.cubicleId,
        evaluation.reason
      );
    }
  }
}
