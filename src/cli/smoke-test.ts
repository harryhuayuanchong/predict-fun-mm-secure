/**
 * CLI: Smoke Test.
 * Validates configuration, API connection, and basic market data access.
 * Never places orders. Safe to run at any time.
 */

import { loadConfig, printConfig } from '../config/index.js';
import { setLogLevel } from '../utils/logger.js';
import { logger } from '../utils/logger.js';
import { PredictApiClient } from '../api/client.js';

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  // 1. Config validation
  let config;
  try {
    config = loadConfig();
    setLogLevel(config.LOG_LEVEL);
    results.push({ name: 'Config validation', passed: true, detail: 'All env vars valid' });
  } catch (err) {
    results.push({
      name: 'Config validation',
      passed: false,
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
    printResults(results);
    process.exit(1);
  }

  printConfig(config);

  // 2. Safety defaults
  results.push({
    name: 'DRY_RUN default',
    passed: config.DRY_RUN === true,
    detail: config.DRY_RUN ? 'DRY_RUN=true (safe)' : 'DRY_RUN=false (LIVE MODE)',
  });

  results.push({
    name: 'ENABLE_TRADING default',
    passed: config.ENABLE_TRADING === false,
    detail: config.ENABLE_TRADING
      ? 'ENABLE_TRADING=true (orders will be placed)'
      : 'ENABLE_TRADING=false (safe)',
  });

  // 3. API connection
  const api = new PredictApiClient(
    config.API_BASE_URL,
    config.API_KEY,
    config.JWT_TOKEN || undefined
  );

  const connected = await api.testConnection();
  results.push({
    name: 'API connection',
    passed: connected,
    detail: connected ? 'Connected successfully' : 'Connection failed',
  });

  if (!connected) {
    printResults(results);
    process.exit(1);
  }

  // 4. Fetch markets
  try {
    // Debug: dump raw first market to understand API structure
    try {
      const rawMarket = await api.debugRawMarket();
      if (rawMarket) {
        logger.debug('Raw API market sample (first market):');
        logger.debug(JSON.stringify(rawMarket, null, 2).slice(0, 2000));
      }
    } catch {
      logger.debug('Could not fetch raw market sample');
    }

    // Fetch active (OPEN) markets using the API status filter
    const markets = await api.getMarkets(false);
    logger.debug(`Active markets (status=OPEN): ${markets.length} outcome tokens`);

    if (markets.length > 0) {
      logger.debug(`Active market[0]: tokenId=${markets[0].tokenId} question="${markets[0].question}" outcome="${markets[0].outcome}"`);
    }

    results.push({
      name: 'Market data',
      passed: markets.length > 0,
      detail: markets.length > 0
        ? `${markets.length} active outcome tokens`
        : `0 active markets found. Predict.fun may have no live markets right now.`,
    });

    // 5. Fetch one orderbook — try multiple markets in case the first has no book
    if (markets.length > 0) {
      let bookFetched = false;
      const tryCount = Math.min(markets.length, 5);

      for (let i = 0; i < tryCount && !bookFetched; i++) {
        const sample = markets[i];
        try {
          const book = await api.getOrderbook(sample.marketId);
          const hasBids = book.bids.length > 0;
          const hasAsks = book.asks.length > 0;
          results.push({
            name: 'Orderbook data',
            passed: hasBids && hasAsks,
            detail: `${book.bids.length} bids, ${book.asks.length} asks for ${sample.tokenId.slice(0, 8)}...`,
          });

          if (book.bestBid && book.bestAsk) {
            results.push({
              name: 'Book quality',
              passed: book.bestBid < book.bestAsk,
              detail: `Bid=${book.bestBid.toFixed(4)} Ask=${book.bestAsk.toFixed(4)} Spread=${book.spread?.toFixed(4)}`,
            });
          }
          bookFetched = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const status = (err as any)?.response?.status;
          logger.debug(
            `Orderbook fetch failed for market[${i}] ${sample.tokenId}: ${status || ''} ${msg}`
          );
        }
      }

      if (!bookFetched) {
        results.push({
          name: 'Orderbook data',
          passed: false,
          detail: `Failed to fetch orderbook for first ${tryCount} markets. Run with LOG_LEVEL=debug for details.`,
        });
      }
    }
  } catch {
    results.push({
      name: 'Market data',
      passed: false,
      detail: 'Failed to fetch markets',
    });
  }

  // 6. Risk limits sanity
  results.push({
    name: 'Risk limits',
    passed:
      config.MAX_DAILY_LOSS_USD > 0 &&
      config.MAX_POSITION_USD > 0 &&
      config.MAX_SINGLE_ORDER_USD > 0,
    detail: `Loss=$${config.MAX_DAILY_LOSS_USD} Pos=$${config.MAX_POSITION_USD} Order=$${config.MAX_SINGLE_ORDER_USD}`,
  });

  results.push({
    name: 'Spread range',
    passed: config.MIN_SPREAD < config.MAX_SPREAD,
    detail: `${(config.MIN_SPREAD * 100).toFixed(2)}% - ${(config.MAX_SPREAD * 100).toFixed(2)}%`,
  });

  printResults(results);

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    logger.warn('Some checks failed. Review before enabling trading.');
  } else {
    logger.info('All smoke tests passed.');
  }
}

function printResults(results: CheckResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('Smoke Test Results');
  console.log('='.repeat(60));

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}: ${r.detail}`);
  }

  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  console.log(`  ${passed}/${results.length} checks passed\n`);
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
