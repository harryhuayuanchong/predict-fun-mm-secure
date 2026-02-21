/**
 * CLI: List all markets from the API.
 * Diagnostic tool to see what the API returns.
 * Uses the paginated getMarkets to fetch all markets.
 */

import { loadConfig } from '../config/index.js';
import { PredictApiClient } from '../api/client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new PredictApiClient(
    config.API_BASE_URL,
    config.API_KEY,
    config.JWT_TOKEN || undefined
  );

  // Fetch all markets including inactive
  const allMarkets = await api.getMarkets(true);

  // Sort by marketId descending (newest first)
  allMarkets.sort((a, b) => b.marketId - a.marketId);

  // Deduplicate by marketId (since outcomes create multiple entries per market)
  const seen = new Set<number>();
  const uniqueMarkets = allMarkets.filter((m) => {
    if (seen.has(m.marketId)) return false;
    seen.add(m.marketId);
    return true;
  });

  const activeCount = uniqueMarkets.filter((m) => m.isActive).length;
  const inactiveCount = uniqueMarkets.length - activeCount;

  console.log(`\nTotal unique markets: ${uniqueMarkets.length} (${activeCount} active, ${inactiveCount} inactive)`);
  console.log(`Total outcome tokens: ${allMarkets.length}\n`);

  // Show newest 30
  console.log('Newest 30 markets:');
  console.log('ID   | Active | Question (first 65 chars)');
  console.log('-----|--------|---------------------------');

  for (const m of uniqueMarkets.slice(0, 30)) {
    const active = m.isActive ? ' YES  ' : '  no  ';
    const q = m.question.slice(0, 65);
    console.log(`${String(m.marketId).padEnd(4)} | ${active} | ${q}`);
  }

  console.log('');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
