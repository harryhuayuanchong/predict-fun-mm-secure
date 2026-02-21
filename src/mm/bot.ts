/**
 * Market maker bot.
 * Main loop: select markets, compute quotes, place/cancel orders.
 * Respects all safety guards (dry run, kill switch, circuit breaker, rate limits).
 */

import type { PredictApiClient, Market, Orderbook, Order } from '../api/client.js';
import type { EnvConfig } from '../config/schema.js';
import { logger } from '../utils/logger.js';
import { sendAlert } from '../utils/alert.js';
import { MarketSelector, type MarketWithBook } from './market-selector.js';
import { Quoter, type InventoryState, type Quote } from './quoter.js';
import type { CircuitBreaker, RiskManager, RateLimiter } from '../risk/circuit-breaker.js';
import type { OrderExecutor } from '../execution/order-executor.js';
import { botEmitter } from '../events/emitter.js';

export interface MMBotDeps {
  api: PredictApiClient;
  config: EnvConfig;
  circuitBreaker: CircuitBreaker;
  riskManager: RiskManager;
  rateLimiter: RateLimiter;
  executor: OrderExecutor;
}

export class MarketMakerBot {
  private deps: MMBotDeps;
  private selector: MarketSelector;
  private quoters = new Map<string, Quoter>();
  private openOrders = new Map<string, Order[]>();
  private inventory = new Map<string, InventoryState>();
  private running = false;
  private cycleCount = 0;
  /** Latest quotes per tokenId, exposed for the dashboard server */
  latestQuotes = new Map<string, { market: Market; quote: Quote }>();

  constructor(deps: MMBotDeps) {
    this.deps = deps;
    this.selector = new MarketSelector({
      maxMarkets: 10,
      maxSpread: deps.config.MAX_SPREAD,
    });
  }

  async start(): Promise<void> {
    const { config } = this.deps;

    logger.info('Market maker starting');
    logger.info(`Dry run: ${config.DRY_RUN}, Trading: ${config.ENABLE_TRADING}`);

    if (!config.ENABLE_TRADING) {
      logger.warn('ENABLE_TRADING=false — orders will not be submitted');
    }

    this.running = true;
    botEmitter.emitBot('mm:status', {
      running: true,
      dryRun: config.DRY_RUN,
      tradingEnabled: config.ENABLE_TRADING,
      cycleCount: this.cycleCount,
    });

    while (this.running) {
      try {
        await this.runCycle();
      } catch (err) {
        logger.error('MM cycle error:', err);
        this.deps.circuitBreaker.recordFailure();
      }

      if (this.deps.circuitBreaker.isOpen()) {
        logger.warn('Circuit breaker open, waiting for cooldown');
      }

      if (this.deps.riskManager.isKilled()) {
        logger.error('Kill switch active — halting');
        await sendAlert(
          this.deps.config.ALERT_WEBHOOK_URL,
          'Kill switch activated. Market maker halted.'
        );
        break;
      }

      await this.sleep(config.REFRESH_INTERVAL_MS);
    }

    logger.info('Market maker stopped');
  }

  stop(): void {
    this.running = false;
    botEmitter.emitBot('mm:status', {
      running: false,
      dryRun: this.deps.config.DRY_RUN,
      tradingEnabled: this.deps.config.ENABLE_TRADING,
      cycleCount: this.cycleCount,
    });
  }

  private async runCycle(): Promise<void> {
    const { api, config, circuitBreaker, riskManager, rateLimiter } = this.deps;

    if (circuitBreaker.isOpen()) return;
    if (riskManager.isKilled()) return;
    if (!riskManager.checkDailyLoss()) return;

    // Select markets
    const markets = await this.selector.selectMarkets(
      api,
      config.MARKET_TOKEN_IDS.length > 0 ? config.MARKET_TOKEN_IDS : undefined
    );

    for (const { market, orderbook } of markets) {
      await rateLimiter.waitIfNeeded();
      await this.processMarket(market, orderbook);
    }

    this.cycleCount++;
    circuitBreaker.recordSuccess();

    botEmitter.emitBot('mm:cycle', {
      timestamp: Date.now(),
      marketsProcessed: markets.length,
      cycleCount: this.cycleCount,
    });
  }

  private async processMarket(market: Market, orderbook: Orderbook): Promise<void> {
    const { config, riskManager, executor } = this.deps;
    const tokenId = market.tokenId;

    // Get or create quoter for this market
    if (!this.quoters.has(tokenId)) {
      this.quoters.set(
        tokenId,
        new Quoter({
          baseSpread: config.SPREAD,
          minSpread: config.MIN_SPREAD,
          maxSpread: config.MAX_SPREAD,
          orderSizeUsd: config.ORDER_SIZE_USD,
          maxPositionUsd: config.MAX_POSITION_USD,
          inventorySkewFactor: 0.15,
          volEmaAlpha: 0.2,
          touchBufferBps: 10,
          orderDepthUsage: 0.3,
        })
      );
    }

    const quoter = this.quoters.get(tokenId)!;
    const inv = this.inventory.get(tokenId) || { yesAmount: 0, noAmount: 0 };

    // Compute quote
    const quote = quoter.calculateQuote(orderbook, inv);
    if (!quote) {
      logger.debug(`No valid quote for ${tokenId}`);
      return;
    }

    // Store latest quote and emit for dashboard
    this.latestQuotes.set(tokenId, { market, quote });
    botEmitter.emitBot('mm:quote', {
      tokenId,
      question: market.question,
      outcome: market.outcome,
      marketId: market.marketId,
      bidPrice: quote.bidPrice,
      askPrice: quote.askPrice,
      bidShares: quote.bidShares,
      askShares: quote.askShares,
      microPrice: quote.microPrice,
      spread: quote.spread,
      bestBid: orderbook.bestBid ?? 0,
      bestAsk: orderbook.bestAsk ?? 0,
      volume24h: market.volume24h,
    });

    // Check existing orders — cancel stale ones
    const existing = this.openOrders.get(tokenId) || [];
    await this.cancelStaleOrders(existing, quote, market);

    // Place new orders
    if (quote.bidShares > 0) {
      const notional = quote.bidPrice * quote.bidShares;
      if (riskManager.validateOrderSize(notional)) {
        await executor.placeLimitOrder(market, 'BUY', quote.bidPrice, quote.bidShares);
      }
    }

    if (quote.askShares > 0) {
      const notional = quote.askPrice * quote.askShares;
      if (riskManager.validateOrderSize(notional)) {
        await executor.placeLimitOrder(market, 'SELL', quote.askPrice, quote.askShares);
      }
    }
  }

  private async cancelStaleOrders(
    existing: Order[],
    quote: Quote,
    market: Market
  ): Promise<void> {
    const stale: string[] = [];

    for (const order of existing) {
      const target = order.side === 'BUY' ? quote.bidPrice : quote.askPrice;
      const drift = Math.abs(order.price - target) / target;

      // Reprice if drifted more than 2%
      if (drift > 0.02) {
        stale.push(order.orderHash);
      }
    }

    if (stale.length > 0) {
      await this.deps.executor.cancelOrders(stale);
      logger.debug(
        `Cancelled ${stale.length} stale orders for ${market.tokenId}`
      );
    }
  }

  async syncState(makerAddress: string): Promise<void> {
    try {
      const orders = await this.deps.api.getOrders(makerAddress);
      this.openOrders.clear();

      for (const order of orders) {
        if (!this.openOrders.has(order.tokenId)) {
          this.openOrders.set(order.tokenId, []);
        }
        this.openOrders.get(order.tokenId)!.push(order);
      }

      logger.info(`Synced ${orders.length} open orders`);
    } catch (err) {
      logger.error('Failed to sync orders:', err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
