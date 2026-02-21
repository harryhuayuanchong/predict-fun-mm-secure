/**
 * Market maker quoting engine.
 * Computes bid/ask prices and sizes using adaptive spread,
 * inventory skew, and depth-weighted micro-pricing.
 */

import type { Orderbook, OrderbookLevel } from '../api/client.js';
import { logger } from '../utils/logger.js';

export interface QuoterConfig {
  baseSpread: number;
  minSpread: number;
  maxSpread: number;
  orderSizeUsd: number;
  maxPositionUsd: number;
  inventorySkewFactor: number;
  volEmaAlpha: number;
  touchBufferBps: number;
  orderDepthUsage: number;
}

export interface Quote {
  bidPrice: number;
  askPrice: number;
  bidShares: number;
  askShares: number;
  microPrice: number;
  spread: number;
}

export interface InventoryState {
  yesAmount: number;
  noAmount: number;
}

const MIN_PRICE = 0.01;
const MAX_PRICE = 0.99;
const MIN_TICK = 0.001;

export class Quoter {
  private config: QuoterConfig;
  private volEma = 0;
  private lastMicroPrice = 0;

  constructor(config: QuoterConfig) {
    this.config = config;
  }

  /**
   * Calculate bid/ask quotes for a given orderbook and inventory state.
   * Returns null if the book is invalid or too wide.
   */
  calculateQuote(
    orderbook: Orderbook,
    inventory: InventoryState
  ): Quote | null {
    const { bestBid, bestAsk } = orderbook;

    if (!bestBid || !bestAsk || bestBid <= 0 || bestAsk <= 0 || bestBid >= bestAsk) {
      return null;
    }

    const bookSpread = (bestAsk - bestBid) / ((bestBid + bestAsk) / 2);
    if (bookSpread > 0.4) {
      logger.debug('Book spread too wide, skipping');
      return null;
    }

    // Micro-price: depth-weighted mid
    const topBidShares = this.topDepth(orderbook.bids);
    const topAskShares = this.topDepth(orderbook.asks);

    const microPrice =
      topBidShares + topAskShares > 0
        ? (bestAsk * topBidShares + bestBid * topAskShares) /
          (topBidShares + topAskShares)
        : (bestBid + bestAsk) / 2;

    // Volatility EMA
    if (this.lastMicroPrice > 0) {
      const volComponent =
        Math.abs(microPrice - this.lastMicroPrice) / this.lastMicroPrice;
      this.volEma =
        this.volEma + this.config.volEmaAlpha * (volComponent - this.volEma);
    }
    this.lastMicroPrice = microPrice;

    // Adaptive spread
    const volPenalty = this.volEma * 1.2;
    const bookPenalty = bookSpread * 0.35;
    let spread = this.config.baseSpread * (1 + volPenalty) + bookPenalty;
    spread = Math.max(this.config.minSpread, Math.min(this.config.maxSpread, spread));

    // Inventory bias: [-1, +1]. Positive = long YES.
    const inventoryBias = this.computeInventoryBias(inventory);

    // Fair price with inventory skew
    const fairPrice =
      microPrice * (1 - inventoryBias * this.config.inventorySkewFactor * spread);

    // Asymmetric spread
    const half = spread / 2;
    const bidFactor = Math.max(0.6, Math.min(1.8, 1 + inventoryBias * 0.4));
    const askFactor = Math.max(0.6, Math.min(1.8, 1 - inventoryBias * 0.4));

    let bidPrice = fairPrice * (1 - half * bidFactor);
    let askPrice = fairPrice * (1 + half * askFactor);

    // Touch buffer: don't cross top of book
    const buffer = this.config.touchBufferBps / 10000;
    const maxBid = bestBid * (1 - buffer);
    const minAsk = bestAsk * (1 + buffer);
    bidPrice = Math.min(bidPrice, maxBid);
    askPrice = Math.max(askPrice, minAsk);

    // Clamp to valid range
    bidPrice = Math.max(MIN_PRICE, Math.min(MAX_PRICE, bidPrice));
    askPrice = Math.max(MIN_PRICE, Math.min(MAX_PRICE, askPrice));

    // Round to tick
    bidPrice = Math.floor(bidPrice / MIN_TICK) * MIN_TICK;
    askPrice = Math.ceil(askPrice / MIN_TICK) * MIN_TICK;

    if (bidPrice >= askPrice - MIN_TICK) {
      return null;
    }

    // Order sizing
    const bidShares = this.calculateShares(bidPrice, inventory, 'BUY', orderbook);
    const askShares = this.calculateShares(askPrice, inventory, 'SELL', orderbook);

    if (bidShares <= 0 && askShares <= 0) {
      return null;
    }

    return { bidPrice, askPrice, bidShares, askShares, microPrice, spread };
  }

  private calculateShares(
    price: number,
    inventory: InventoryState,
    side: 'BUY' | 'SELL',
    orderbook: Orderbook
  ): number {
    const baseShares = Math.floor(this.config.orderSizeUsd / price);
    if (baseShares <= 0) return 0;

    // Cap by depth usage
    const topDepth =
      side === 'BUY'
        ? this.topDepth(orderbook.bids)
        : this.topDepth(orderbook.asks);
    const depthCap = Math.floor(topDepth * this.config.orderDepthUsage);

    // Inventory-aware sizing
    const bias = this.computeInventoryBias(inventory);
    let sizeFactor: number;
    if (side === 'BUY') {
      sizeFactor = Math.max(0.3, Math.min(1.5, 1 - bias * 0.4));
    } else {
      sizeFactor = Math.max(0.3, Math.min(1.5, 1 + bias * 0.4));
    }

    let shares = Math.floor(baseShares * sizeFactor);
    if (depthCap > 0) {
      shares = Math.min(shares, depthCap);
    }

    return Math.max(0, shares);
  }

  private computeInventoryBias(inventory: InventoryState): number {
    const maxPos = this.config.maxPositionUsd;
    if (maxPos <= 0) return 0;
    const raw = (inventory.yesAmount - inventory.noAmount) / maxPos;
    return Math.max(-1, Math.min(1, raw));
  }

  private topDepth(levels: OrderbookLevel[]): number {
    return levels.slice(0, 3).reduce((sum, l) => sum + l.shares, 0);
  }

  reset(): void {
    this.volEma = 0;
    this.lastMicroPrice = 0;
  }
}
