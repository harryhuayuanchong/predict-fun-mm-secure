/**
 * CLI: Start bot with dashboard server.
 * Runs the market maker and/or arb bot alongside the HTTP + WebSocket dashboard.
 * Usage: npm run start:dashboard
 */

import { loadConfig, printConfig } from '../config/index.js';
import { setLogLevel } from '../utils/logger.js';
import { logger } from '../utils/logger.js';
import { PredictApiClient } from '../api/client.js';
import { CircuitBreaker, RiskManager, RateLimiter } from '../risk/circuit-breaker.js';
import { OrderExecutor } from '../execution/order-executor.js';
import { MarketMakerBot } from '../mm/bot.js';
import { ArbitrageBot } from '../arb/bot.js';
import { PersistenceStore } from '../persistence/store.js';
import { startDashboardServer, type DashboardServerDeps } from '../server/index.js';
import { botEmitter } from '../events/emitter.js';

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

  // Create bots
  const mmBot = new MarketMakerBot({
    api,
    config,
    circuitBreaker,
    riskManager,
    rateLimiter,
    executor,
  });

  const arbBot = new ArbitrageBot({
    api,
    config,
    riskManager,
    rateLimiter,
    executor,
  });

  // Initialize persistence
  const store = new PersistenceStore();
  store.startListening();

  // Start dashboard server
  const deps: DashboardServerDeps = {
    mmBot,
    arbBot,
    riskManager,
    circuitBreaker,
    config,
    store,
    mmBotRunning: false,
    arbBotRunning: false,
  };

  startDashboardServer(deps, config.DASHBOARD_PORT);

  // Track bot running state via events
  botEmitter.onBot('mm:status', (data) => {
    deps.mmBotRunning = data.running;
  });

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down...');
    mmBot.stop();
    arbBot.stop();
    botEmitter.emitBot('system:stopped', {
      reason: 'shutdown',
      timestamp: Date.now(),
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Dashboard server ready. Use the dashboard to start/stop bots.');

  // Keep process alive — the HTTP server keeps the event loop running
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
