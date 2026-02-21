/**
 * Order executor.
 * Handles order placement and cancellation with safety guards.
 * - DRY_RUN: logs the order but does not submit
 * - ENABLE_TRADING: must be true for live orders
 * - All order payloads are validated before submission
 */

import type { PredictApiClient, Market } from '../api/client.js';
import type { EnvConfig } from '../config/schema.js';
import { logger } from '../utils/logger.js';
import { botEmitter } from '../events/emitter.js';

export interface OrderResult {
  success: boolean;
  orderHash?: string;
  error?: string;
}

export class OrderExecutor {
  private api: PredictApiClient;
  private config: EnvConfig;
  private orderCount = 0;

  constructor(api: PredictApiClient, config: EnvConfig) {
    this.api = api;
    this.config = config;
  }

  async placeLimitOrder(
    market: Market,
    side: 'BUY' | 'SELL',
    price: number,
    shares: number
  ): Promise<OrderResult> {
    // Validate inputs
    if (price <= 0 || price >= 1 || shares <= 0) {
      logger.warn(
        `Invalid order params: price=${price}, shares=${shares}`
      );
      return { success: false, error: 'Invalid order parameters' };
    }

    if (!Number.isFinite(price) || !Number.isFinite(shares)) {
      logger.warn('Non-finite order params rejected');
      return { success: false, error: 'Non-finite values' };
    }

    const notional = price * shares;
    if (notional > this.config.MAX_SINGLE_ORDER_USD) {
      logger.warn(
        `Order notional $${notional.toFixed(2)} exceeds limit $${this.config.MAX_SINGLE_ORDER_USD}`
      );
      return { success: false, error: 'Order size exceeds limit' };
    }

    // Build payload
    const payload = {
      tokenId: market.tokenId,
      side: side === 'BUY' ? 0 : 1,
      price: Number(price.toFixed(4)),
      shares: Math.floor(shares),
      type: 'LIMIT',
      feeRateBps: market.feeRateBps,
      isNegRisk: market.isNegRisk,
    };

    // Dry run check
    if (this.config.DRY_RUN || !this.config.ENABLE_TRADING) {
      logger.info(
        `[DRY RUN] ${side} ${payload.shares} shares @ ${payload.price} on ${market.tokenId}`
      );
      this.orderCount++;
      const dryHash = `dry-${this.orderCount}`;
      botEmitter.emitBot('mm:order:placed', {
        timestamp: Date.now(),
        tokenId: market.tokenId,
        question: market.question,
        side,
        price: payload.price,
        shares: payload.shares,
        orderHash: dryHash,
        dryRun: true,
      });
      return { success: true, orderHash: dryHash };
    }

    // Live order
    try {
      const result = await this.api.createOrder(payload);
      const hash =
        result && typeof result === 'object' && 'order_hash' in (result as Record<string, unknown>)
          ? String((result as Record<string, unknown>).order_hash)
          : undefined;

      logger.info(
        `Placed ${side} ${payload.shares} shares @ ${payload.price} on ${market.tokenId}`
      );
      this.orderCount++;
      botEmitter.emitBot('mm:order:placed', {
        timestamp: Date.now(),
        tokenId: market.tokenId,
        question: market.question,
        side,
        price: payload.price,
        shares: payload.shares,
        orderHash: hash || `live-${this.orderCount}`,
        dryRun: false,
      });
      return { success: true, orderHash: hash };
    } catch (err) {
      logger.error(`Order placement failed for ${market.tokenId}:`, err);
      return { success: false, error: 'API error' };
    }
  }

  async cancelOrders(orderHashes: string[]): Promise<boolean> {
    if (orderHashes.length === 0) return true;

    if (this.config.DRY_RUN || !this.config.ENABLE_TRADING) {
      logger.info(`[DRY RUN] Cancel ${orderHashes.length} orders`);
      botEmitter.emitBot('mm:order:cancelled', {
        timestamp: Date.now(),
        tokenId: '',
        orderHashes,
        reason: 'dry-run cancel',
      });
      return true;
    }

    try {
      await this.api.cancelOrders(orderHashes);
      logger.info(`Cancelled ${orderHashes.length} orders`);
      botEmitter.emitBot('mm:order:cancelled', {
        timestamp: Date.now(),
        tokenId: '',
        orderHashes,
        reason: 'stale order',
      });
      return true;
    } catch (err) {
      logger.error('Cancel orders failed:', err);
      return false;
    }
  }

  async cancelAllForMarket(
    tokenId: string,
    makerAddress: string
  ): Promise<boolean> {
    try {
      const orders = await this.api.getOrders(makerAddress);
      const marketOrders = orders.filter(
        (o) => o.tokenId === tokenId && o.status === 'OPEN'
      );
      if (marketOrders.length === 0) return true;

      const hashes = marketOrders.map((o) => o.orderHash);
      return this.cancelOrders(hashes);
    } catch (err) {
      logger.error(`Cancel all for ${tokenId} failed:`, err);
      return false;
    }
  }

  getOrderCount(): number {
    return this.orderCount;
  }
}
