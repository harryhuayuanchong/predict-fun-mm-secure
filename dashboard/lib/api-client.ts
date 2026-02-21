import type { BotStatus, MarketQuote, OrderRecord, PnlPoint, RedactedConfig } from './types';

const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL || 'http://localhost:3001';
const API_TOKEN = process.env.NEXT_PUBLIC_DASHBOARD_TOKEN || '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BOT_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const botApi = {
  getStatus: () => apiFetch<BotStatus>('/api/status'),
  getMarkets: () => apiFetch<{ markets: MarketQuote[] }>('/api/markets'),
  getOrders: () => apiFetch<{ orders: OrderRecord[] }>('/api/orders'),
  getOrderHistory: (limit = 100, offset = 0) =>
    apiFetch<{ orders: OrderRecord[]; total: number }>(
      `/api/orders/history?limit=${limit}&offset=${offset}`
    ),
  getPnl: () => apiFetch<{ history: PnlPoint[]; current: number }>('/api/pnl'),
  getConfig: () => apiFetch<{ config: RedactedConfig }>('/api/config'),

  startBot: (mode: 'mm' | 'arb') =>
    apiFetch('/api/bot/start', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  stopBot: (mode: 'mm' | 'arb') =>
    apiFetch('/api/bot/stop', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  killSwitch: () =>
    apiFetch('/api/bot/kill-switch', { method: 'POST' }),
  resetKillSwitch: () =>
    apiFetch('/api/bot/kill-switch/reset', { method: 'POST' }),
};
