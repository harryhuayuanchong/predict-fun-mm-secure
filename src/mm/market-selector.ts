/**
 * Market selector.
 * Scores and ranks markets by liquidity, volume, and spread quality.
 * Returns the top N markets suitable for quoting.
 */

import type { Market, Orderbook, PredictApiClient } from '../api/client.js';
import { logger } from '../utils/logger.js';

export interface MarketWithBook {
  market: Market;
  orderbook: Orderbook;
  score: number;
}

export interface MarketSelectorConfig {
  maxMarkets: number;
  minLiquidity: number;
  minVolume: number;
  maxSpread: number;
}

const DEFAULT_CONFIG: MarketSelectorConfig = {
  maxMarkets: 10,
  minLiquidity: 0,
  minVolume: 0,
  maxSpread: 0.3,
};

export class MarketSelector {
  private config: MarketSelectorConfig;

  constructor(config?: Partial<MarketSelectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async selectMarkets(
    api: PredictApiClient,
    filterTokenIds?: string[]
  ): Promise<MarketWithBook[]> {
    const allMarkets = await api.getMarkets();

    let candidates = filterTokenIds?.length
      ? allMarkets.filter((m) => filterTokenIds.includes(m.tokenId))
      : allMarkets;

    // Basic quality filters
    candidates = candidates.filter(
      (m) =>
        m.volume24h >= this.config.minVolume &&
        m.liquidity24h >= this.config.minLiquidity
    );

    // Fetch orderbooks and score
    const scored: MarketWithBook[] = [];

    for (const market of candidates) {
      try {
        const orderbook = await api.getOrderbook(market.marketId);
        if (!orderbook.bestBid || !orderbook.bestAsk) continue;

        const spread =
          orderbook.spread !== undefined && orderbook.midPrice
            ? orderbook.spread / orderbook.midPrice
            : 1;

        if (spread > this.config.maxSpread) continue;

        const score = this.scoreMarket(market, orderbook, spread);
        scored.push({ market, orderbook, score });
      } catch {
        logger.debug(`Skipping market ${market.tokenId}: orderbook fetch failed`);
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, this.config.maxMarkets);

    logger.info(
      `Selected ${selected.length}/${candidates.length} markets for quoting`
    );

    return selected;
  }

  private scoreMarket(
    market: Market,
    orderbook: Orderbook,
    spread: number
  ): number {
    // Higher volume, more liquidity, tighter spread = better
    const volumeScore = Math.log1p(market.volume24h);
    const liquidityScore = Math.log1p(market.liquidity24h);
    const spreadScore = Math.max(0, 1 - spread / this.config.maxSpread);

    const topBidDepth = orderbook.bids.slice(0, 3).reduce((s, l) => s + l.shares, 0);
    const topAskDepth = orderbook.asks.slice(0, 3).reduce((s, l) => s + l.shares, 0);
    const depthScore = Math.log1p(topBidDepth + topAskDepth);

    return volumeScore * 0.3 + liquidityScore * 0.3 + spreadScore * 0.25 + depthScore * 0.15;
  }
}
