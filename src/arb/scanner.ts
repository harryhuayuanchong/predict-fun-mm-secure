/**
 * Arbitrage opportunity scanner.
 * Detects intra-market (YES+NO != $1) and multi-outcome arbitrage.
 * All opportunities are validated with VWAP estimation before execution.
 */

import type { PredictApiClient, Market, Orderbook, OrderbookLevel } from '../api/client.js';
import { logger } from '../utils/logger.js';

export interface ArbOpportunity {
  type: 'INTRA_BUY_BOTH' | 'INTRA_SELL_BOTH' | 'MULTI_OUTCOME';
  markets: Market[];
  edge: number;
  shares: number;
  estimatedProfit: number;
  details: string;
}

export interface ArbScannerConfig {
  minProfitPct: number;
  maxMarkets: number;
  feeBps: number;
  slippageBps: number;
}

/**
 * Estimate the VWAP cost to buy `shares` from an orderbook side.
 */
function estimateVwap(
  levels: OrderbookLevel[],
  shares: number,
  feeBps: number,
  slippageBps: number
): { avgPrice: number; totalCost: number; filled: number } | null {
  let remaining = shares;
  let totalCost = 0;
  let filled = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.shares);
    totalCost += take * level.price;
    filled += take;
    remaining -= take;
  }

  if (filled <= 0) return null;

  const fees = totalCost * (feeBps / 10000);
  const slippage = totalCost * (slippageBps / 10000);
  const totalAllIn = totalCost + fees + slippage;

  return {
    avgPrice: totalAllIn / filled,
    totalCost: totalAllIn,
    filled,
  };
}

export class IntraMarketScanner {
  private config: ArbScannerConfig;

  constructor(config: ArbScannerConfig) {
    this.config = config;
  }

  /**
   * Scan for YES+NO price deviations from $1.
   * Requires pairs of markets (YES token + NO token for same condition).
   */
  scanPairs(
    pairs: { yes: Market; no: Market; yesBook: Orderbook; noBook: Orderbook }[]
  ): ArbOpportunity[] {
    const opportunities: ArbOpportunity[] = [];

    for (const { yes, no, yesBook, noBook } of pairs) {
      // BUY BOTH: yesAsk + noAsk < $1
      const buyBothOpp = this.checkBuyBoth(yes, no, yesBook, noBook);
      if (buyBothOpp) opportunities.push(buyBothOpp);

      // SELL BOTH: yesBid + noBid > $1
      const sellBothOpp = this.checkSellBoth(yes, no, yesBook, noBook);
      if (sellBothOpp) opportunities.push(sellBothOpp);
    }

    return opportunities;
  }

  private checkBuyBoth(
    yes: Market,
    no: Market,
    yesBook: Orderbook,
    noBook: Orderbook
  ): ArbOpportunity | null {
    if (!yesBook.bestAsk || !noBook.bestAsk) return null;

    // Quick check before VWAP
    const rawSum = yesBook.bestAsk + noBook.bestAsk;
    if (rawSum >= 1) return null;

    // VWAP estimation — try several sizes
    const maxShares = 100;
    const sizes = [maxShares, Math.floor(maxShares * 0.6), Math.floor(maxShares * 0.36)];

    for (const targetShares of sizes) {
      if (targetShares <= 0) continue;

      const yesVwap = estimateVwap(
        yesBook.asks,
        targetShares,
        yes.feeRateBps || this.config.feeBps,
        this.config.slippageBps
      );
      const noVwap = estimateVwap(
        noBook.asks,
        targetShares,
        no.feeRateBps || this.config.feeBps,
        this.config.slippageBps
      );

      if (!yesVwap || !noVwap) continue;

      const shares = Math.min(yesVwap.filled, noVwap.filled);
      if (shares <= 0) continue;

      const totalCost = yesVwap.avgPrice * shares + noVwap.avgPrice * shares;
      const payout = shares; // Exactly one side pays $1 per share
      const edge = (payout - totalCost) / totalCost;

      if (edge >= this.config.minProfitPct) {
        return {
          type: 'INTRA_BUY_BOTH',
          markets: [yes, no],
          edge,
          shares,
          estimatedProfit: payout - totalCost,
          details: `BUY ${shares} YES@${yesVwap.avgPrice.toFixed(4)} + NO@${noVwap.avgPrice.toFixed(4)} = ${(yesVwap.avgPrice + noVwap.avgPrice).toFixed(4)} < $1`,
        };
      }
    }

    return null;
  }

  private checkSellBoth(
    yes: Market,
    no: Market,
    yesBook: Orderbook,
    noBook: Orderbook
  ): ArbOpportunity | null {
    if (!yesBook.bestBid || !noBook.bestBid) return null;

    const rawSum = yesBook.bestBid + noBook.bestBid;
    if (rawSum <= 1) return null;

    const maxShares = 100;
    const sizes = [maxShares, Math.floor(maxShares * 0.6), Math.floor(maxShares * 0.36)];

    for (const targetShares of sizes) {
      if (targetShares <= 0) continue;

      const yesVwap = estimateVwap(
        yesBook.bids,
        targetShares,
        yes.feeRateBps || this.config.feeBps,
        this.config.slippageBps
      );
      const noVwap = estimateVwap(
        noBook.bids,
        targetShares,
        no.feeRateBps || this.config.feeBps,
        this.config.slippageBps
      );

      if (!yesVwap || !noVwap) continue;

      const shares = Math.min(yesVwap.filled, noVwap.filled);
      if (shares <= 0) continue;

      // Proceeds from selling minus obligation
      const proceeds = yesVwap.avgPrice * shares + noVwap.avgPrice * shares;
      const obligation = shares; // Must pay $1 for the winning side
      const edge = (proceeds - obligation) / obligation;

      if (edge >= this.config.minProfitPct) {
        return {
          type: 'INTRA_SELL_BOTH',
          markets: [yes, no],
          edge,
          shares,
          estimatedProfit: proceeds - obligation,
          details: `SELL ${shares} YES@${yesVwap.avgPrice.toFixed(4)} + NO@${noVwap.avgPrice.toFixed(4)} = ${(yesVwap.avgPrice + noVwap.avgPrice).toFixed(4)} > $1`,
        };
      }
    }

    return null;
  }
}

export class MultiOutcomeScanner {
  private config: ArbScannerConfig;

  constructor(config: ArbScannerConfig) {
    this.config = config;
  }

  /**
   * Scan for multi-outcome arb: if N outcomes sum to < $1, buy all.
   */
  scan(
    outcomeGroups: {
      conditionId: string;
      outcomes: { market: Market; orderbook: Orderbook }[];
    }[]
  ): ArbOpportunity[] {
    const opportunities: ArbOpportunity[] = [];

    for (const group of outcomeGroups) {
      if (group.outcomes.length < 2) continue;

      // Quick check: sum of best asks
      let askSum = 0;
      let allValid = true;

      for (const { orderbook } of group.outcomes) {
        if (!orderbook.bestAsk) {
          allValid = false;
          break;
        }
        askSum += orderbook.bestAsk;
      }

      if (!allValid || askSum >= 1) continue;

      // VWAP check with conservative size
      const targetShares = 50;
      let totalCost = 0;
      let minFilled = Infinity;
      const vwaps: { avgPrice: number; filled: number }[] = [];

      for (const { market, orderbook } of group.outcomes) {
        const vwap = estimateVwap(
          orderbook.asks,
          targetShares,
          market.feeRateBps || this.config.feeBps,
          this.config.slippageBps
        );

        if (!vwap) {
          allValid = false;
          break;
        }

        totalCost += vwap.avgPrice * vwap.filled;
        minFilled = Math.min(minFilled, vwap.filled);
        vwaps.push(vwap);
      }

      if (!allValid || minFilled <= 0) continue;

      // Re-compute with uniform size
      totalCost = vwaps.reduce((sum, v) => sum + v.avgPrice * minFilled, 0);
      const payout = minFilled; // One outcome wins
      const edge = (payout - totalCost) / totalCost;

      if (edge >= this.config.minProfitPct) {
        opportunities.push({
          type: 'MULTI_OUTCOME',
          markets: group.outcomes.map((o) => o.market),
          edge,
          shares: minFilled,
          estimatedProfit: payout - totalCost,
          details: `BUY all ${group.outcomes.length} outcomes for ${group.conditionId}, total cost ${(totalCost / minFilled).toFixed(4)}/share < $1`,
        });
      }
    }

    return opportunities;
  }
}
