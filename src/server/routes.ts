/**
 * REST API route handlers for the dashboard server.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DashboardServerDeps } from './index.js';
import { redactSecrets } from '../config/redact.js';
import { logger } from '../utils/logger.js';

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  deps: DashboardServerDeps
) => Promise<void>;

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

function checkAuth(req: IncomingMessage, token: string): boolean {
  if (!token) return true; // No token configured = open access
  const auth = req.headers['authorization'];
  return auth === `Bearer ${token}`;
}

const getStatus: Handler = async (_req, res, deps) => {
  json(res, {
    mm: deps.mmBot
      ? {
          running: deps.mmBotRunning,
          dryRun: deps.config.DRY_RUN,
          tradingEnabled: deps.config.ENABLE_TRADING,
          ppMode: deps.config.PP_MODE,
        }
      : null,
    arb: deps.arbBot
      ? {
          running: deps.arbBotRunning,
        }
      : null,
    risk: {
      killed: deps.riskManager.isKilled(),
      dailyPnl: deps.riskManager.getDailyPnl(),
      circuitBreakerOpen: deps.circuitBreaker.isOpen(),
    },
    uptime: process.uptime(),
  });
};

const getMarkets: Handler = async (_req, res, deps) => {
  const quotes: unknown[] = [];
  if (deps.mmBot) {
    for (const [, { market, quote }] of deps.mmBot.latestQuotes) {
      quotes.push({
        tokenId: market.tokenId,
        question: market.question,
        outcome: market.outcome,
        marketId: market.marketId,
        bidPrice: quote.bidPrice,
        askPrice: quote.askPrice,
        bidShares: quote.bidShares,
        askShares: quote.askShares,
        microPrice: quote.microPrice,
        spread: quote.spread,
        volume24h: market.volume24h,
      });
    }
  }
  json(res, { markets: quotes });
};

const getOrders: Handler = async (_req, res, deps) => {
  json(res, { orders: deps.store.getOrders(100, 0) });
};

const getOrderHistory: Handler = async (req, res, deps) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const offset = Number(url.searchParams.get('offset') || 0);
  const orders = deps.store.getOrders(limit, offset);
  const total = deps.store.getOrderCount();
  json(res, { orders, total });
};

const getPnl: Handler = async (req, res, deps) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const since = Number(url.searchParams.get('since') || 0);
  const history = deps.store.getPnlHistory(since);
  json(res, {
    history,
    current: deps.riskManager.getDailyPnl(),
  });
};

const getConfig: Handler = async (_req, res, deps) => {
  const redacted = redactSecrets(deps.config as unknown as Record<string, unknown>);
  json(res, { config: redacted });
};

const postBotStart: Handler = async (req, res, deps) => {
  if (!checkAuth(req, deps.config.DASHBOARD_API_TOKEN)) {
    json(res, { error: 'Unauthorized' }, 401);
    return;
  }
  const body = await readBody(req);
  const { mode } = JSON.parse(body || '{}');

  if (mode === 'mm' && deps.mmBot && !deps.mmBotRunning) {
    // Fire-and-forget: start() blocks in a while loop, so don't await it.
    // The mm:status event listener in start-dashboard.ts tracks the running state.
    deps.mmBot.start().catch((err) => {
      logger.error('MM bot start error:', err);
    });
  } else if (mode === 'arb' && deps.arbBot && !deps.arbBotRunning) {
    deps.arbBot.start().catch((err) => {
      logger.error('Arb bot start error:', err);
    });
  }
  json(res, { ok: true });
};

const postBotStop: Handler = async (req, res, deps) => {
  if (!checkAuth(req, deps.config.DASHBOARD_API_TOKEN)) {
    json(res, { error: 'Unauthorized' }, 401);
    return;
  }
  const body = await readBody(req);
  const { mode } = JSON.parse(body || '{}');

  if (mode === 'mm' && deps.mmBot) {
    deps.mmBot.stop();
    // mmBotRunning will be set to false by the mm:status event listener
  } else if (mode === 'arb' && deps.arbBot) {
    deps.arbBot.stop();
    deps.arbBotRunning = false;
  }
  json(res, { ok: true });
};

const postKillSwitch: Handler = async (req, res, deps) => {
  if (!checkAuth(req, deps.config.DASHBOARD_API_TOKEN)) {
    json(res, { error: 'Unauthorized' }, 401);
    return;
  }
  deps.riskManager.killSwitch();
  json(res, { ok: true });
};

const postKillSwitchReset: Handler = async (req, res, deps) => {
  if (!checkAuth(req, deps.config.DASHBOARD_API_TOKEN)) {
    json(res, { error: 'Unauthorized' }, 401);
    return;
  }
  deps.riskManager.resetKillSwitch();
  json(res, { ok: true });
};

const routes: Record<string, Record<string, Handler>> = {
  GET: {
    '/api/status': getStatus,
    '/api/markets': getMarkets,
    '/api/orders': getOrders,
    '/api/orders/history': getOrderHistory,
    '/api/pnl': getPnl,
    '/api/config': getConfig,
  },
  POST: {
    '/api/bot/start': postBotStart,
    '/api/bot/stop': postBotStop,
    '/api/bot/kill-switch': postKillSwitch,
    '/api/bot/kill-switch/reset': postKillSwitchReset,
  },
};

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DashboardServerDeps
): void {
  // Add CORS headers to every response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const method = req.method || 'GET';
  const pathname = url.pathname;

  logger.debug(`Dashboard API: ${method} ${pathname}`);

  const handler = routes[method]?.[pathname];
  if (handler) {
    handler(req, res, deps).catch((err) => {
      logger.error(`API error on ${method} ${pathname}:`, err);
      json(res, { error: 'Internal server error' }, 500);
    });
  } else {
    json(res, { error: 'Not found' }, 404);
  }
}
