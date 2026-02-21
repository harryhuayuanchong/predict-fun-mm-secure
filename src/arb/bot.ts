/**
 * Arbitrage bot.
 * Main loop: scan markets for arb opportunities and optionally execute.
 * Respects DRY_RUN, ENABLE_TRADING, and ARB_AUTO_EXECUTE flags.
 */

import type { PredictApiClient, Market, Orderbook } from '../api/client.js';
import type { EnvConfig } from '../config/schema.js';
import { logger } from '../utils/logger.js';
import { sendAlert } from '../utils/alert.js';
import {
  IntraMarketScanner,
  MultiOutcomeScanner,
  type ArbOpportunity,
  type ArbScannerConfig,
} from './scanner.js';
import type { RiskManager, RateLimiter } from '../risk/circuit-breaker.js';
import type { OrderExecutor } from '../execution/order-executor.js';

export interface ArbBotDeps {
  api: PredictApiClient;
  config: EnvConfig;
  riskManager: RiskManager;
  rateLimiter: RateLimiter;
  executor: OrderExecutor;
}

export class ArbitrageBot {
  private deps: ArbBotDeps;
  private intraScanner: IntraMarketScanner;
  private multiScanner: MultiOutcomeScanner;
  private running = false;
  private seenOpps = new Map<string, { count: number; firstSeen: number }>();

  constructor(deps: ArbBotDeps) {
    this.deps = deps;

    const scannerConfig: ArbScannerConfig = {
      minProfitPct: deps.config.ARB_MIN_PROFIT_PCT,
      maxMarkets: deps.config.ARB_MAX_MARKETS,
      feeBps: 200,
      slippageBps: 50,
    };

    this.intraScanner = new IntraMarketScanner(scannerConfig);
    this.multiScanner = new MultiOutcomeScanner(scannerConfig);
  }

  async start(): Promise<void> {
    const { config } = this.deps;

    logger.info('Arbitrage scanner starting');
    logger.info(
      `Auto execute: ${config.ARB_AUTO_EXECUTE}, Dry run: ${config.DRY_RUN}`
    );

    this.running = true;

    while (this.running) {
      try {
        await this.runScan();
      } catch (err) {
        logger.error('Arb scan error:', err);
      }

      await this.sleep(config.ARB_SCAN_INTERVAL_MS);
    }

    logger.info('Arbitrage scanner stopped');
  }

  stop(): void {
    this.running = false;
  }

  private async runScan(): Promise<void> {
    const { api, config, riskManager } = this.deps;

    if (riskManager.isKilled()) {
      logger.warn('Kill switch active, skipping arb scan');
      return;
    }

    // Fetch markets
    const markets = await api.getMarkets();
    const subset = markets.slice(0, config.ARB_MAX_MARKETS);

    // Fetch orderbooks
    const books = new Map<string, Orderbook>();
    for (const market of subset) {
      try {
        await this.deps.rateLimiter.waitIfNeeded();
        const book = await api.getOrderbook(market.marketId);
        books.set(market.tokenId, book);
      } catch {
        // Skip markets with failed orderbook fetches
      }
    }

    // Build YES/NO pairs for intra-market arb
    const pairs = this.buildYesNoPairs(subset, books);
    const intraOpps = this.intraScanner.scanPairs(pairs);

    // Build outcome groups for multi-outcome arb
    const groups = this.buildOutcomeGroups(subset, books);
    const multiOpps = this.multiScanner.scan(groups);

    const allOpps = [...intraOpps, ...multiOpps].sort(
      (a, b) => b.edge - a.edge
    );

    if (allOpps.length > 0) {
      logger.info(`Found ${allOpps.length} arb opportunities`);
      for (const opp of allOpps.slice(0, 5)) {
        logger.info(
          `  ${opp.type}: edge=${(opp.edge * 100).toFixed(2)}% profit=$${opp.estimatedProfit.toFixed(2)} | ${opp.details}`
        );
      }
    }

    // Execute if auto-execute enabled and opportunity is stable
    if (config.ARB_AUTO_EXECUTE && config.ENABLE_TRADING && !config.DRY_RUN) {
      for (const opp of allOpps) {
        if (this.isStable(opp)) {
          await this.executeArb(opp);
        }
      }
    }
  }

  /**
   * Stability check: only execute if we've seen the same opportunity
   * at least 2 times within 30 seconds.
   */
  private isStable(opp: ArbOpportunity): boolean {
    const key = `${opp.type}:${opp.markets.map((m) => m.tokenId).join(',')}`;
    const now = Date.now();
    const seen = this.seenOpps.get(key);

    if (!seen || now - seen.firstSeen > 30000) {
      this.seenOpps.set(key, { count: 1, firstSeen: now });
      return false;
    }

    seen.count++;
    return seen.count >= 2;
  }

  private async executeArb(opp: ArbOpportunity): Promise<void> {
    const { executor, riskManager, config } = this.deps;

    if (!riskManager.checkDailyLoss()) return;

    logger.info(`Executing arb: ${opp.type} edge=${(opp.edge * 100).toFixed(2)}%`);

    if (opp.type === 'INTRA_BUY_BOTH' && opp.markets.length === 2) {
      const [yesMarket, noMarket] = opp.markets;

      const yesResult = await executor.placeLimitOrder(
        yesMarket,
        'BUY',
        yesMarket.feeRateBps > 0 ? 0.49 : 0.5, // Conservative price
        opp.shares
      );

      const noResult = await executor.placeLimitOrder(
        noMarket,
        'BUY',
        noMarket.feeRateBps > 0 ? 0.49 : 0.5,
        opp.shares
      );

      if (yesResult.success && noResult.success) {
        riskManager.recordPnl(-opp.estimatedProfit * 0.1); // Conservative PnL estimate
        await sendAlert(
          config.ALERT_WEBHOOK_URL,
          `Arb executed: ${opp.type} edge=${(opp.edge * 100).toFixed(2)}%`
        );
      }
    }

    // Clear stability tracker after execution
    const key = `${opp.type}:${opp.markets.map((m) => m.tokenId).join(',')}`;
    this.seenOpps.delete(key);
  }

  private buildYesNoPairs(
    markets: Market[],
    books: Map<string, Orderbook>
  ): { yes: Market; no: Market; yesBook: Orderbook; noBook: Orderbook }[] {
    const byCondition = new Map<string, Market[]>();

    for (const m of markets) {
      if (!m.conditionId) continue;
      if (!byCondition.has(m.conditionId)) {
        byCondition.set(m.conditionId, []);
      }
      byCondition.get(m.conditionId)!.push(m);
    }

    const pairs: {
      yes: Market;
      no: Market;
      yesBook: Orderbook;
      noBook: Orderbook;
    }[] = [];

    for (const group of byCondition.values()) {
      if (group.length !== 2) continue;

      const [a, b] = group;
      const aBook = books.get(a.tokenId);
      const bBook = books.get(b.tokenId);
      if (!aBook || !bBook) continue;

      // Determine which is YES and which is NO
      const aIsYes =
        a.outcome.toLowerCase() === 'yes' ||
        a.outcome.toLowerCase() === 'up' ||
        (aBook.bestAsk && bBook.bestAsk && aBook.bestAsk <= bBook.bestAsk);

      if (aIsYes) {
        pairs.push({ yes: a, no: b, yesBook: aBook, noBook: bBook });
      } else {
        pairs.push({ yes: b, no: a, yesBook: bBook, noBook: aBook });
      }
    }

    return pairs;
  }

  private buildOutcomeGroups(
    markets: Market[],
    books: Map<string, Orderbook>
  ): {
    conditionId: string;
    outcomes: { market: Market; orderbook: Orderbook }[];
  }[] {
    const byEvent = new Map<string, Market[]>();

    for (const m of markets) {
      const key = m.conditionId || String(m.marketId);
      if (!key) continue;
      if (!byEvent.has(key)) byEvent.set(key, []);
      byEvent.get(key)!.push(m);
    }

    const groups: {
      conditionId: string;
      outcomes: { market: Market; orderbook: Orderbook }[];
    }[] = [];

    for (const [conditionId, groupMarkets] of byEvent) {
      if (groupMarkets.length < 3) continue; // Multi-outcome needs 3+

      const outcomes: { market: Market; orderbook: Orderbook }[] = [];
      for (const m of groupMarkets) {
        const book = books.get(m.tokenId);
        if (book) outcomes.push({ market: m, orderbook: book });
      }

      if (outcomes.length >= 3) {
        groups.push({ conditionId, outcomes });
      }
    }

    return groups;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
