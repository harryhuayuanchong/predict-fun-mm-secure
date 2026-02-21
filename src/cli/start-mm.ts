/**
 * CLI: Start Market Maker.
 * Loads config, initializes all dependencies, and starts the MM bot.
 * Handles graceful shutdown on SIGINT/SIGTERM.
 */

import { loadConfig, printConfig } from '../config/index.js';
import { setLogLevel } from '../utils/logger.js';
import { logger } from '../utils/logger.js';
import { PredictApiClient } from '../api/client.js';
import { CircuitBreaker, RiskManager, RateLimiter } from '../risk/circuit-breaker.js';
import { OrderExecutor } from '../execution/order-executor.js';
import { MarketMakerBot } from '../mm/bot.js';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);
  printConfig(config);

  // Confirm safety
  if (!config.DRY_RUN && config.ENABLE_TRADING && !config.AUTO_CONFIRM) {
    logger.warn('Live trading is enabled. Press Ctrl+C within 5s to abort.');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Initialize API client
  const api = new PredictApiClient(
    config.API_BASE_URL,
    config.API_KEY,
    config.JWT_TOKEN || undefined
  );

  const connected = await api.testConnection();
  if (!connected) {
    logger.error('API connection failed. Exiting.');
    process.exit(1);
  }

  // Initialize risk components
  const circuitBreaker = new CircuitBreaker({
    maxFailures: config.CIRCUIT_MAX_FAILURES,
    windowMs: config.CIRCUIT_WINDOW_MS,
    cooldownMs: config.CIRCUIT_COOLDOWN_MS,
  });

  const riskManager = new RiskManager({
    maxDailyLossUsd: config.MAX_DAILY_LOSS_USD,
    maxPositionUsd: config.MAX_POSITION_USD,
    maxSingleOrderUsd: config.MAX_SINGLE_ORDER_USD,
  });

  const rateLimiter = new RateLimiter(
    config.RATE_LIMIT_REQUESTS_PER_SEC,
    1000
  );

  const executor = new OrderExecutor(api, config);

  // Create and start bot
  const bot = new MarketMakerBot({
    api,
    config,
    circuitBreaker,
    riskManager,
    rateLimiter,
    executor,
  });

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down market maker...');
    bot.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await bot.start();
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
