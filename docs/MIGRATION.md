# Migration Guide

## Migrating from `predict-fun-marketmaker` to `predict-fun-mm-secure`

This guide helps you migrate from the original repo to the secure rewrite.

## Key Differences

| Aspect | Original | Secure Rewrite |
|--------|----------|----------------|
| Config validation | None (raw `process.env`) | Zod schema with strict types |
| Secret logging | Partial (`printConfig` safe, but errors leak) | All output scrubbed via `scrubText()` |
| DRY_RUN default | `false` | `true` (must explicitly set `"false"`) |
| ENABLE_TRADING default | Depends on config | `false` (must explicitly set `"true"`) |
| JWT auth | Writes token to `.env` file | Prints to stdout (manual copy) |
| WebSocket auth | API key in URL query param | Not implemented (header-based only) |
| Private key in CLI args | Yes (Python subprocess) | Eliminated entirely |
| Electron desktop | Included | Removed (CLI-only) |
| Cross-platform arb | Polymarket, Probable, Opinion | Predict-only (single platform) |
| Dependencies | 15+ packages | 5 core packages |

## Environment Variable Mapping

Most env vars map directly. Key changes:

| Original | Secure Rewrite | Notes |
|----------|---------------|-------|
| `API_BASE_URL` | `API_BASE_URL` | Same |
| `API_KEY` | `API_KEY` | Same |
| `JWT_TOKEN` | `JWT_TOKEN` | Same |
| `PRIVATE_KEY` | `PRIVATE_KEY` | Same |
| `DRY_RUN` | `DRY_RUN` | Default changed: `true` |
| `ENABLE_TRADING` | `ENABLE_TRADING` | Default changed: `false` |
| `AUTO_CONFIRM` | `AUTO_CONFIRM` | Same |
| `SPREAD` | `SPREAD` | Same |
| `MIN_SPREAD` | `MIN_SPREAD` | Same |
| `MAX_SPREAD` | `MAX_SPREAD` | Same |
| `ORDER_SIZE` | `ORDER_SIZE_USD` | Renamed for clarity |
| `MAX_DAILY_LOSS` | `MAX_DAILY_LOSS_USD` | Renamed |
| `MAX_POSITION` | `MAX_POSITION_USD` | Renamed |
| `MAX_SINGLE_ORDER` | `MAX_SINGLE_ORDER_USD` | Renamed |
| `POLYMARKET_*` | — | Removed (single platform) |
| `PROBABLE_*` | — | Removed |
| `OPINION_*` | — | Removed |
| `PREDICT_WS_*` | — | WebSocket not yet implemented |
| `MM_*` (advanced) | — | Simplified; advanced tuning params removed |

## Migration Steps

1. **Copy your `.env`** from the original repo.
2. **Rename** the variables listed above.
3. **Set safety defaults**: Ensure `DRY_RUN=true` and `ENABLE_TRADING=false`.
4. **Remove** cross-platform keys (`POLYMARKET_*`, `PROBABLE_*`, `OPINION_*`).
5. **Run smoke test**: `npm run smoke` to validate the new config.
6. **Test in dry-run mode**: `npm run start:mm` and verify output.
7. **Gradually enable**: Only switch to live trading after confirming behavior matches expectations.

## Features Not Yet Ported

The secure rewrite focuses on core functionality with proper safety. These advanced features from the original are not yet included:

- **WebSocket-driven quoting**: The original used WS for near-realtime orderbook updates. The rewrite uses REST polling via `REFRESH_INTERVAL_MS`.
- **Cross-platform arbitrage**: Polymarket, Probable, and Opinion integrations are removed. Only Predict.fun intra-market and multi-outcome arb are supported.
- **Layered quoting**: Multi-layer order placement is simplified to single-level quotes.
- **Advanced adaptive params**: Volatility EMA, depth speed, panic/retreat/restore state machine are simplified.
- **Desktop GUI**: The Electron app is removed. Use CLI commands directly.
- **Dependency arbitrage**: The OR-Tools based dependency arb solver is removed.

These can be added incrementally while maintaining the security foundations.
