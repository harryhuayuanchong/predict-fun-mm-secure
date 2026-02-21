# Security Model

## Threat Model

This bot handles prediction market trading with real funds. The primary threats are:

1. **Secret leakage** — Private keys, API keys, or JWTs exposed in logs, error messages, URLs, or process arguments.
2. **Unauthorized trading** — Accidental live order placement due to misconfiguration.
3. **Runaway losses** — Bugs or market conditions causing rapid, uncontrolled losses.
4. **Supply chain attacks** — Malicious or compromised npm dependencies.

## Mitigations

### Secret Management

- **Zod validation on startup**: All env vars are validated with strict types and ranges. Invalid config crashes immediately — no silent defaults for critical fields.
- **Redaction layer**: All log output passes through `scrubText()` which matches and replaces hex private keys, JWT tokens, Bearer tokens, and long API keys with `[REDACTED]`.
- **Config printing**: `printConfig()` uses `redactSecrets()` to mask all known secret fields before display.
- **No secrets in URLs**: API authentication uses HTTP headers exclusively. WebSocket connections do NOT append API keys as query parameters.
- **No secrets in CLI args**: The original repo passed `--private-key` to Python subprocesses (visible via `ps`). This rewrite eliminates subprocess-based execution entirely.
- **JWT auth flow**: `auth:jwt` prints the token to stdout and instructs the user to manually add it to `.env`. It never writes to `.env` directly (preventing permission/ownership issues).

### Trading Safety

- **DRY_RUN=true by default**: The Zod transform treats any value other than literal `"false"` as `true`. You must explicitly set `DRY_RUN=false`.
- **ENABLE_TRADING=false by default**: Only literal `"true"` enables trading. Double opt-in required.
- **5-second abort window**: When live trading is enabled without `AUTO_CONFIRM`, the bot prints a warning and waits 5 seconds before starting.
- **Kill switch**: `RiskManager` automatically activates a kill switch when daily losses exceed `MAX_DAILY_LOSS_USD`. All trading halts immediately.
- **Circuit breaker**: Consecutive API failures trigger a cooldown period. The bot stops placing orders until the circuit resets.
- **Rate limiting**: Sliding window rate limiter prevents API abuse.
- **Order size validation**: Every order is checked against `MAX_SINGLE_ORDER_USD` and `MAX_POSITION_USD` before submission.
- **Order executor guards**: The `OrderExecutor` validates all inputs (finite numbers, positive values, price in [0,1]) before building payloads.

### Risk Limits

| Parameter | Default | Purpose |
|-----------|---------|---------|
| MAX_DAILY_LOSS_USD | $200 | Daily loss limit before kill switch |
| MAX_POSITION_USD | $100 | Maximum per-token position |
| MAX_SINGLE_ORDER_USD | $50 | Maximum single order notional |
| CIRCUIT_MAX_FAILURES | 3 | Failures before circuit opens |
| CIRCUIT_COOLDOWN_MS | 60s | Cooldown after circuit opens |

### Dependencies

- Minimal dependency tree: `axios`, `dotenv`, `ethers`, `ws`, `zod`.
- No postinstall scripts.
- No Electron (no IPC attack surface).
- Lock file (`package-lock.json`) should be committed and audited.

## First-Time Setup Checklist

1. Copy `.env.example` to `.env` and fill in `API_KEY` and `PRIVATE_KEY`.
2. Leave `DRY_RUN=true` and `ENABLE_TRADING=false`.
3. Run `npm run smoke` to validate config, API connection, and market data.
4. Review the smoke test output for any `FAIL` items.
5. Run `npm run start:mm` in dry-run mode. Verify log output shows `[DRY RUN]` for all orders.
6. **Only when confident**: Set `DRY_RUN=false` and `ENABLE_TRADING=true`.
7. Start with minimal `ORDER_SIZE_USD` (e.g., $5) and low `MAX_DAILY_LOSS_USD`.
8. Use a dedicated wallet with only the funds you're willing to risk.

## Incident Response

If you suspect unauthorized activity:

1. Set `ENABLE_TRADING=false` in `.env` and restart the bot.
2. Rotate your `API_KEY` immediately.
3. Transfer funds out of the trading wallet.
4. Check logs for any redaction failures (search for hex patterns, JWT signatures).
5. Review API activity in the Predict.fun dashboard.
