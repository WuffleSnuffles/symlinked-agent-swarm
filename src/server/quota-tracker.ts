/**
 * src/server/quota-tracker.ts
 *
 * Token Accounting, Quota Management, and Fatigue/Stamina Mathematics.
 * Computes deterministic stamina percentages and tiers (energized, fatigued, critical_strain, exhausted)
 * based on token consumption.
 */

import { CubicleQuotaConfig, StaminaTier } from './types/cubicle.js';

export class QuotaTracker {
  /**
   * Calculates stamina remaining percentage [0, 100].
   * 100% = completely fresh / zero usage.
   * 0% = quota fully depleted / exhausted.
   */
  public static calculateStamina(maxTokens: number, tokensUsed: number): number {
    if (maxTokens <= 0) return 0;
    const remaining = Math.max(0, maxTokens - tokensUsed);
    const percentage = Math.round((remaining / maxTokens) * 100);
    return Math.max(0, Math.min(100, percentage));
  }

  /**
   * Calculates fatigue percentage [0, 100].
   * 0% = completely fresh / zero tokens used.
   * 100% = exhausted / all quota consumed.
   */
  public static calculateFatigue(maxTokens: number, tokensUsed: number): number {
    return 100 - this.calculateStamina(maxTokens, tokensUsed);
  }

  /**
   * Classifies a stamina percentage into one of 4 visual/operational tiers:
   * - Energized: 70% to 100%
   * - Fatigued: 35% to 69%
   * - Critical Strain: 1% to 34%
   * - Exhausted: 0%
   */
  public static getStaminaTier(staminaPercentage: number): StaminaTier {
    if (staminaPercentage <= 0) return 'exhausted';
    if (staminaPercentage <= 34) return 'critical_strain';
    if (staminaPercentage <= 69) return 'fatigued';
    return 'energized';
  }

  /**
   * Records token consumption and updates cost.
   * Returns updated metrics and whether quota was newly exhausted.
   */
  public static recordUsage(
    quota: CubicleQuotaConfig,
    tokensConsumed: number,
    costUSD: number = 0
  ): {
    staminaPercentage: number;
    fatiguePercentage: number;
    staminaTier: StaminaTier;
    isExhausted: boolean;
  } {
    quota.tokens_used += Math.max(0, tokensConsumed);
    quota.cost_usd_accumulated += Math.max(0, costUSD);

    const staminaPercentage = this.calculateStamina(quota.max_tokens, quota.tokens_used);
    const fatiguePercentage = 100 - staminaPercentage;
    const staminaTier = this.getStaminaTier(staminaPercentage);
    const isExhausted = staminaPercentage === 0;

    return {
      staminaPercentage,
      fatiguePercentage,
      staminaTier,
      isExhausted,
    };
  }

  /**
   * Recharges quota by adding additional tokens, or resetting usage.
   */
  public static recharge(
    quota: CubicleQuotaConfig,
    additionalTokens?: number
  ): {
    staminaPercentage: number;
    fatiguePercentage: number;
    staminaTier: StaminaTier;
  } {
    if (additionalTokens !== undefined && additionalTokens > 0) {
      quota.max_tokens += additionalTokens;
    } else {
      // Full reset of tokens used
      quota.tokens_used = 0;
    }

    const staminaPercentage = this.calculateStamina(quota.max_tokens, quota.tokens_used);
    const fatiguePercentage = 100 - staminaPercentage;
    const staminaTier = this.getStaminaTier(staminaPercentage);

    return {
      staminaPercentage,
      fatiguePercentage,
      staminaTier,
    };
  }
}
