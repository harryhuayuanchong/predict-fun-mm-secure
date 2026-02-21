/**
 * Predict.fun API client.
 * - All requests authenticated via headers (never query params)
 * - Errors are scrubbed before logging
 * - Supports /v1 and legacy endpoint fallback
 *
 * API structure: /markets returns market-level objects, each with an
 * `outcomes` array. Each outcome has an `onChainId` which is the token ID
 * used for orderbook lookups and order placement.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { logger } from '../utils/logger.js';

export interface Market {
  /** On-chain token ID for this outcome (from outcomes[].onChainId) */
  tokenId: string;
  /** Market question */
  question: string;
  /** Outcome name (e.g. "Yes", "No", "Up", "Down") */
  outcome: string;
  /** Condition ID — shared by all outcomes in the same market */
  conditionId?: string;
  /** Market integer ID */
  marketId: number;
  /** Whether the market is actively tradable */
  isActive: boolean;
  isNegRisk: boolean;
  feeRateBps: number;
  volume24h: number;
  liquidity24h: number;
}

export interface OrderbookLevel {
  price: number;
  shares: number;
}

export interface Orderbook {
  tokenId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  midPrice?: number;
}

export interface Order {
  orderHash: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  shares: number;
  status: 'OPEN' | 'FILLED' | 'CANCELED';
}

export class PredictApiClient {
  private http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string, jwtToken?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };

    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    this.http = axios.create({
      baseURL: baseUrl.replace(/\/+$/, ''),
      timeout: 15000,
      headers,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getMarkets();
      logger.info('API connection successful');
      return true;
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 401) {
        logger.error('API authentication failed. Check API_KEY / JWT_TOKEN.');
      } else {
        logger.error('API connection failed');
      }
      return false;
    }
  }

  /**
   * Fetch markets and flatten into per-outcome tokens.
   * Each outcome becomes a separate Market entry with its own tokenId.
   *
   * Uses Predict.fun API pagination (cursor-based) and status filter.
   * API params: status=OPEN|RESOLVED, first=N, after=cursor
   */
  async getMarkets(includeInactive = false): Promise<Market[]> {
    const allRawMarkets: unknown[] = [];
    let cursor: string | null = null;
    const maxPages = 10; // Safety limit

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, unknown> = {
        first: 50,
      };
      if (!includeInactive) {
        params.status = 'OPEN';
      }
      if (cursor) {
        params.after = cursor;
      }

      try {
        const response = await this.http.get('/v1/markets', { params });
        const payload = response.data as Record<string, unknown>;

        // Response format: { success, cursor, data: [...] }
        const data = Array.isArray(payload?.data) ? payload.data : [];
        allRawMarkets.push(...data);

        cursor = typeof payload?.cursor === 'string' ? payload.cursor : null;
        if (!cursor || data.length === 0) break;
      } catch {
        // If /v1/markets fails, try legacy endpoint once (no pagination)
        if (page === 0) {
          try {
            const fallbackResp = await this.http.get('/markets');
            const fallbackData = this.unwrap<unknown[]>(fallbackResp.data);
            if (Array.isArray(fallbackData)) {
              allRawMarkets.push(...fallbackData);
            }
          } catch {
            // Both failed
          }
        }
        break;
      }
    }

    const markets: Market[] = [];

    for (const raw of allRawMarkets) {
      const r = raw as Record<string, unknown>;

      const tradingStatus = String(r?.tradingStatus ?? '');
      const status = String(r?.status ?? '');
      const isActive =
        tradingStatus !== 'CLOSED' &&
        status !== 'RESOLVED' &&
        status !== 'CANCELLED';

      if (!includeInactive && !isActive) continue;

      const question = String(r?.question ?? r?.title ?? 'Unknown');
      const conditionId = r?.conditionId
        ? String(r.conditionId)
        : r?.condition_id
          ? String(r.condition_id)
          : undefined;
      const marketId = Number(r?.id ?? 0);
      const isNegRisk = Boolean(r?.is_neg_risk ?? r?.isNegRisk ?? false);
      const feeRateBps = Number(r?.feeRateBps ?? r?.fee_rate_bps ?? 0);
      const volume24h = Number(r?.volume_24h ?? 0);
      const liquidity24h = Number(r?.liquidity_24h ?? 0);

      // Extract outcomes — each outcome has its own on-chain token ID
      const outcomes = Array.isArray(r?.outcomes) ? r.outcomes : [];
      const resolution = r?.resolution as Record<string, unknown> | undefined;

      if (outcomes.length > 0) {
        for (const outcome of outcomes) {
          const o = outcome as Record<string, unknown>;
          const tokenId = String(o?.onChainId ?? o?.token_id ?? o?.tokenId ?? '');
          const outcomeName = String(o?.name ?? o?.outcome ?? '');

          if (!tokenId) continue;

          markets.push({
            tokenId,
            question,
            outcome: outcomeName,
            conditionId,
            marketId,
            isActive,
            isNegRisk,
            feeRateBps,
            volume24h,
            liquidity24h,
          });
        }
      } else if (resolution?.onChainId) {
        // Fallback for markets with only a resolution object (legacy)
        markets.push({
          tokenId: String(resolution.onChainId),
          question,
          outcome: String(resolution?.name ?? ''),
          conditionId,
          marketId,
          isActive,
          isNegRisk,
          feeRateBps,
          volume24h,
          liquidity24h,
        });
      }
    }

    logger.debug(`Parsed ${markets.length} outcome tokens from ${allRawMarkets.length} raw markets`);
    return markets;
  }

  /** Returns raw API response for the first market. For debugging only. */
  async debugRawMarket(): Promise<unknown> {
    const data = await this.requestWithFallback<unknown[]>('get', [
      '/v1/markets',
      '/markets',
    ]);
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  }

  /** Returns all raw markets from the API. For debugging only. */
  async debugAllRawMarkets(): Promise<unknown[]> {
    const data = await this.requestWithFallback<unknown[]>('get', [
      '/v1/markets',
      '/markets',
    ]);
    return Array.isArray(data) ? data : [];
  }

  /** Try various query param combinations to find active markets. For debugging only. */
  async debugMarketEndpoints(): Promise<void> {
    const attempts = [
      { path: '/v1/markets', params: { status: 'ACTIVE' } },
      { path: '/v1/markets', params: { tradingStatus: 'ACTIVE' } },
      { path: '/v1/markets', params: { active: true } },
      { path: '/v1/markets', params: { limit: 100 } },
      { path: '/v1/markets', params: { page: 2 } },
      { path: '/v1/markets', params: { offset: 25 } },
      { path: '/v1/markets', params: { sort: 'createdAt', order: 'desc' } },
      { path: '/v1/markets/active', params: {} },
      { path: '/markets', params: { limit: 100 } },
    ];

    for (const { path, params } of attempts) {
      try {
        const response = await this.http.get(path, { params, timeout: 8000 });
        const data = this.unwrap<unknown>(response.data);
        const arr = Array.isArray(data) ? data : [];
        const statuses = new Map<string, number>();
        for (const item of arr) {
          const r = item as Record<string, unknown>;
          const key = `${r?.tradingStatus || 'unknown'}/${r?.status || 'unknown'}`;
          statuses.set(key, (statuses.get(key) || 0) + 1);
        }
        const statusStr = [...statuses.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
        logger.debug(`  ${path} ${JSON.stringify(params)} → ${arr.length} markets [${statusStr}]`);
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        logger.debug(`  ${path} ${JSON.stringify(params)} → ${status || 'error'}`);
      }
    }
  }

  /**
   * Fetch the orderbook for a market.
   * The API uses the numeric market ID, not the on-chain token ID.
   * Prices are based on the "Yes" outcome.
   */
  async getOrderbook(marketId: number): Promise<Orderbook> {
    const response = await this.http.get(`/v1/markets/${marketId}/orderbook`);
    const payload = response.data as Record<string, unknown>;
    const data = (payload?.data ?? payload) as Record<string, unknown>;
    return this.normalizeOrderbook(String(marketId), data);
  }

  /**
   * Legacy orderbook fetch by token ID (fallback).
   */
  async getOrderbookByToken(tokenId: string): Promise<Orderbook> {
    const raw = await this.requestWithFallback<Record<string, unknown>>('get', [
      `/orderbooks/${tokenId}`,
    ]);
    return this.normalizeOrderbook(tokenId, raw);
  }

  async getOrders(maker: string): Promise<Order[]> {
    const data = await this.requestWithFallback<unknown[]>(
      'get',
      ['/v1/orders', '/orders'],
      { params: { maker, status: 'OPEN' } }
    );
    if (!Array.isArray(data)) return [];
    return data
      .map((raw) => this.normalizeOrder(raw))
      .filter((o): o is Order => o !== null && o.status === 'OPEN');
  }

  async createOrder(payload: unknown): Promise<unknown> {
    return this.requestWithFallback('post', ['/v1/orders', '/orders'], {
      data: payload,
    });
  }

  async cancelOrders(ids: string[]): Promise<unknown> {
    return this.requestWithFallback('delete', ['/v1/orders', '/orders'], {
      data: { ids },
    });
  }

  private async requestWithFallback<T>(
    method: 'get' | 'post' | 'delete',
    paths: string[],
    options?: { params?: Record<string, unknown>; data?: unknown }
  ): Promise<T> {
    let lastError: unknown;

    for (const path of paths) {
      try {
        const response = await this.http.request({
          method,
          url: path,
          params: options?.params,
          data: options?.data,
        });
        return this.unwrap<T>(response.data);
      } catch (err) {
        lastError = err;
        const status = (err as AxiosError)?.response?.status;
        if (status === 404 || status === 405) continue;
        break;
      }
    }

    throw lastError;
  }

  private unwrap<T>(payload: unknown): T {
    if (
      payload &&
      typeof payload === 'object' &&
      'data' in (payload as Record<string, unknown>)
    ) {
      return (payload as Record<string, unknown>).data as T;
    }
    return payload as T;
  }

  private normalizeOrderbook(
    tokenId: string,
    raw: Record<string, unknown>
  ): Orderbook {
    const bidsRaw = Array.isArray(raw?.bids) ? raw.bids : [];
    const asksRaw = Array.isArray(raw?.asks) ? raw.asks : [];

    const parseLevel = (entry: unknown): OrderbookLevel | null => {
      if (Array.isArray(entry)) {
        const price = Number(entry[0]);
        const shares = Number(entry[1]);
        return Number.isFinite(price) && Number.isFinite(shares)
          ? { price, shares }
          : null;
      }
      const e = entry as Record<string, unknown>;
      const price = Number(e?.price ?? 0);
      const shares = Number(e?.shares ?? e?.quantity ?? e?.size ?? 0);
      return Number.isFinite(price) ? { price, shares } : null;
    };

    const bids = (bidsRaw as unknown[])
      .map(parseLevel)
      .filter((l): l is OrderbookLevel => l !== null)
      .sort((a, b) => b.price - a.price);

    const asks = (asksRaw as unknown[])
      .map(parseLevel)
      .filter((l): l is OrderbookLevel => l !== null)
      .sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price;
    const bestAsk = asks[0]?.price;

    return {
      tokenId,
      bids,
      asks,
      bestBid,
      bestAsk,
      spread:
        bestBid !== undefined && bestAsk !== undefined
          ? bestAsk - bestBid
          : undefined,
      midPrice:
        bestBid !== undefined && bestAsk !== undefined
          ? (bestBid + bestAsk) / 2
          : undefined,
    };
  }

  private normalizeOrder(raw: unknown): Order | null {
    const r = raw as Record<string, unknown>;
    const orderRaw = (r?.order as Record<string, unknown>) ?? r;

    const tokenId = String(orderRaw?.tokenId ?? orderRaw?.token_id ?? '');
    const orderHash = String(
      orderRaw?.hash ?? orderRaw?.order_hash ?? r?.order_hash ?? ''
    );

    if (!tokenId || !orderHash) return null;

    const sideRaw = orderRaw?.side;
    const side: 'BUY' | 'SELL' =
      sideRaw === 0 || sideRaw === 'BUY' || sideRaw === '0' ? 'BUY' : 'SELL';

    const statusRaw = r?.status ?? orderRaw?.status;
    const status: 'OPEN' | 'FILLED' | 'CANCELED' =
      statusRaw === 'FILLED'
        ? 'FILLED'
        : statusRaw === 'CANCELED'
          ? 'CANCELED'
          : 'OPEN';

    return {
      orderHash,
      tokenId,
      side,
      price: Number(r?.pricePerShare ?? orderRaw?.price ?? 0),
      shares: Number(r?.shares ?? orderRaw?.shares ?? 0),
      status,
    };
  }
}
