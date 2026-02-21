/**
 * Dashboard API server.
 * Embedded HTTP + WebSocket server for the bot process.
 * Exposes REST endpoints and real-time event streaming.
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { handleRequest } from './routes.js';
import { setupWebSocket } from './ws-handler.js';
import { logger } from '../utils/logger.js';
import type { MarketMakerBot } from '../mm/bot.js';
import type { ArbitrageBot } from '../arb/bot.js';
import type { RiskManager, CircuitBreaker } from '../risk/circuit-breaker.js';
import type { EnvConfig } from '../config/schema.js';
import type { PersistenceStore } from '../persistence/store.js';

export interface DashboardServerDeps {
  mmBot: MarketMakerBot | null;
  arbBot: ArbitrageBot | null;
  riskManager: RiskManager;
  circuitBreaker: CircuitBreaker;
  config: EnvConfig;
  store: PersistenceStore;
  mmBotRunning: boolean;
  arbBotRunning: boolean;
}

export function startDashboardServer(
  deps: DashboardServerDeps,
  port: number
): http.Server {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, deps);
  });

  const wss = new WebSocketServer({ server });
  setupWebSocket(wss);

  server.listen(port, '0.0.0.0', () => {
    logger.info(`Dashboard server listening on http://0.0.0.0:${port}`);
  });

  return server;
}
