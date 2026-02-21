/**
 * CLI: Start Arbitrage Scanner.
 * Loads config, initializes dependencies, and starts the arb bot.
 */

import { loadConfig, printConfig } from '../config/index.js';
import { setLogLevel } from '../utils/logger.js';
import { logger } from '../utils/logger.js';
import { PredictApiClient } from '../api/client.js';
import { RiskManager, RateLimiter } from '../risk/circuit-breaker.js';
import { OrderExecutor } from '../execution/order-executor.js';
import { ArbitrageBot } from '../arb/bot.js';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);
  printConfig(config);

  if (config.ARB_AUTO_EXECUTE && !config.DRY_RUN && !config.AUTO_CONFIRM) {
    logger.warn(
      'Arb auto-execute is ON with live trading. Press Ctrl+C within 5s to abort.'
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

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

  const bot = new ArbitrageBot({
    api,
    config,
    riskManager,
    rateLimiter,
    executor,
  });

  const shutdown = (): void => {
    logger.info('Shutting down arbitrage scanner...');
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
