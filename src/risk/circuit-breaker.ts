/**
 * Circuit breaker and risk management.
 * Prevents runaway losses and enforces rate limits.
 */

import { logger } from '../utils/logger.js';
import { botEmitter } from '../events/emitter.js';

export interface CircuitBreakerConfig {
  maxFailures: number;
  windowMs: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private failures: number[] = [];
  private openUntil = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  isOpen(): boolean {
    if (Date.now() < this.openUntil) return true;
    if (this.openUntil > 0 && Date.now() >= this.openUntil) {
      this.openUntil = 0;
      this.failures = [];
      logger.info('Circuit breaker reset');
    }
    return false;
  }

  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.failures = this.failures.filter(
      (t) => now - t < this.config.windowMs
    );

    if (this.failures.length >= this.config.maxFailures) {
      this.openUntil = now + this.config.cooldownMs;
      logger.warn(
        `Circuit breaker OPEN: ${this.failures.length} failures in ${this.config.windowMs}ms. ` +
          `Cooldown until ${new Date(this.openUntil).toISOString()}`
      );
      botEmitter.emitBot('risk:circuit_breaker', {
        isOpen: true,
        failureCount: this.failures.length,
        cooldownUntil: this.openUntil,
      });
    }
  }

  recordSuccess(): void {
    this.failures = [];
  }
}

export interface RiskLimitsConfig {
  maxDailyLossUsd: number;
  maxPositionUsd: number;
  maxSingleOrderUsd: number;
}

export class RiskManager {
  private config: RiskLimitsConfig;
  private dailyPnl = 0;
  private dailyResetAt = 0;
  private killed = false;

  constructor(config: RiskLimitsConfig) {
    this.config = config;
  }

  isKilled(): boolean {
    return this.killed;
  }

  killSwitch(): void {
    this.killed = true;
    logger.error('KILL SWITCH ACTIVATED - all trading halted');
    botEmitter.emitBot('risk:kill_switch', { active: true, reason: 'manual' });
  }

  resetKillSwitch(): void {
    this.killed = false;
    logger.info('Kill switch reset');
    botEmitter.emitBot('risk:kill_switch', { active: false });
  }

  checkDailyLoss(): boolean {
    this.maybeResetDay();
    if (Math.abs(this.dailyPnl) >= this.config.maxDailyLossUsd) {
      logger.warn(
        `Daily loss limit reached: $${this.dailyPnl.toFixed(2)} >= $${this.config.maxDailyLossUsd}`
      );
      return false;
    }
    return true;
  }

  recordPnl(amount: number): void {
    this.maybeResetDay();
    this.dailyPnl += amount;

    botEmitter.emitBot('risk:pnl', {
      timestamp: Date.now(),
      dailyPnl: this.dailyPnl,
    });

    if (this.dailyPnl <= -this.config.maxDailyLossUsd) {
      logger.error(
        `Daily loss limit exceeded: $${this.dailyPnl.toFixed(2)}. Activating kill switch.`
      );
      this.killSwitch();
    }
  }

  validateOrderSize(notionalUsd: number): boolean {
    if (notionalUsd > this.config.maxSingleOrderUsd) {
      logger.warn(
        `Order rejected: $${notionalUsd.toFixed(2)} > max $${this.config.maxSingleOrderUsd}`
      );
      return false;
    }
    return true;
  }

  validatePosition(currentPositionUsd: number, additionalUsd: number): boolean {
    if (currentPositionUsd + additionalUsd > this.config.maxPositionUsd) {
      logger.warn(
        `Position limit: $${(currentPositionUsd + additionalUsd).toFixed(2)} > max $${this.config.maxPositionUsd}`
      );
      return false;
    }
    return true;
  }

  getDailyPnl(): number {
    this.maybeResetDay();
    return this.dailyPnl;
  }

  private maybeResetDay(): void {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const dayStart = startOfDay.getTime();

    if (this.dailyResetAt < dayStart) {
      this.dailyPnl = 0;
      this.dailyResetAt = now;
    }
  }
}

export class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return this.timestamps.length < this.maxRequests;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  async waitIfNeeded(): Promise<void> {
    while (!this.canProceed()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.record();
  }
}
