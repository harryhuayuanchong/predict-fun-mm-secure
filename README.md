# Predict.fun Secure Market Maker

Market maker and arbitrage bot for [Predict.fun](https://predict.fun) prediction markets.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your credentials:

- `API_KEY` — your Predict.fun API key
- `PRIVATE_KEY` — wallet private key (use a dedicated trading wallet with limited funds)

### Get a JWT Token

```bash
npm run auth:jwt
```

This prints a JWT to stdout. Copy it into your `.env` file as `JWT_TOKEN=...`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run smoke` | Validate config, API connection, and orderbook access. Never places orders. |
| `npm run auth:jwt` | Obtain a JWT token from the Predict.fun API |
| `npm run start:mm` | Start the market maker bot |
| `npm run start:arb` | Start the arbitrage scanner |
| `npm run start:dashboard` | Start bot + dashboard API server (port 3001) |
| `npm run test` | Run unit tests |
| `npm run lint` | TypeScript type-check |

## Getting Started

### Step 1: Smoke Test

```bash
npm run smoke
```

Validates your config, API connection, market data, and orderbook access. Safe to run at any time.

Use `LOG_LEVEL=debug npm run smoke` for verbose output.

### Step 2: Dry-Run Mode (No Real Money)

By default, your `.env` has two safety flags:

```
DRY_RUN=true
ENABLE_TRADING=false
```

With these settings, the bot connects to the API, fetches markets and orderbooks, calculates quotes, and logs what it *would* do — but never places real orders.

```bash
npm run start:mm
```

Watch the logs to make sure the quotes look sensible before going live.

### Step 3: Live Trading (Real Money)

To trade with real money, change these two lines in `.env`:

```
DRY_RUN=false
ENABLE_TRADING=true
```

Both must be changed. Then run:

```bash
npm run start:mm
```

### Risk Limits

These settings in `.env` control your exposure:

| Setting | Default | Description |
|---------|---------|-------------|
| `ORDER_SIZE_USD` | `10` | Size of each order |
| `MAX_SINGLE_ORDER_USD` | `50` | Maximum size per order |
| `MAX_POSITION_USD` | `100` | Maximum exposure per market |
| `MAX_DAILY_LOSS_USD` | `200` | Circuit breaker — stops trading if daily loss exceeds this |

Start with the defaults and scale up only after you're comfortable with the behavior.

### Arbitrage Scanner

```bash
npm run start:arb
```

Scans for intra-market arbitrage (YES + NO prices summing to != $1) and multi-outcome mispricing. Respects the same `DRY_RUN` and `ENABLE_TRADING` flags.

## Safety Features

- **DRY_RUN + ENABLE_TRADING** — two independent flags must both be flipped to trade
- **Circuit breaker** — automatically stops trading after repeated failures
- **Daily loss limit** — kills trading if `MAX_DAILY_LOSS_USD` is exceeded
- **Rate limiting** — prevents API throttling
- **Secret redaction** — API keys and private keys are never logged
- **Config validation** — Zod schema validates all env vars at startup

## How It Works

### Market Maker Workflow (`npm run start:mm`)

```
Startup
  │
  ├─ Load & validate .env config (Zod schema)
  ├─ Check DRY_RUN / ENABLE_TRADING flags
  ├─ Initialize API client, circuit breaker, rate limiter, risk manager
  │
  ▼
Main Loop (repeats every REFRESH_INTERVAL_MS)
  │
  ├─ 1. Safety checks
  │     ├─ Circuit breaker open? → skip cycle
  │     ├─ Kill switch active? → halt bot
  │     └─ Daily loss limit hit? → skip cycle
  │
  ├─ 2. Market Selection
  │     ├─ Fetch all active markets from API (status=OPEN, paginated)
  │     ├─ Filter by MARKET_TOKEN_IDS (if set) or auto-select
  │     ├─ Fetch orderbooks for each candidate
  │     ├─ Score markets by: volume (30%), liquidity (30%), spread (25%), depth (15%)
  │     └─ Select top 10 markets for quoting
  │
  ├─ 3. Quote Calculation (per market)
  │     ├─ Compute micro-price (depth-weighted mid from top-3 bid/ask levels)
  │     ├─ Update volatility EMA
  │     ├─ Calculate adaptive spread = base spread * (1 + vol penalty) + book penalty
  │     ├─ Apply inventory skew (bias quotes away from accumulated position)
  │     ├─ Apply touch buffer (don't cross top-of-book)
  │     ├─ Clamp prices to [0.01, 0.99], round to tick (0.001)
  │     └─ Size orders with inventory-aware scaling and depth cap
  │
  ├─ 4. Order Management
  │     ├─ Cancel stale orders (price drifted > 2% from new quote)
  │     └─ Place new bid and ask limit orders
  │
  └─ 5. Execution
        ├─ Validate order size against MAX_SINGLE_ORDER_USD
        ├─ DRY_RUN=true → log "[DRY RUN] Would place..." and skip
        └─ DRY_RUN=false + ENABLE_TRADING=true → submit to API
```

### Arbitrage Scanner Workflow (`npm run start:arb`)

```
Startup
  │
  ├─ Load config, initialize scanners
  │
  ▼
Scan Loop (repeats every ARB_SCAN_INTERVAL_MS)
  │
  ├─ 1. Fetch markets and orderbooks (up to ARB_MAX_MARKETS)
  │
  ├─ 2. Intra-Market Scan (YES/NO pairs)
  │     ├─ Group outcomes by conditionId into YES/NO pairs
  │     ├─ Check: YES ask + NO ask < $1 → BUY BOTH opportunity
  │     ├─ Check: YES bid + NO bid > $1 → SELL BOTH opportunity
  │     └─ Validate with VWAP estimation (fees + slippage included)
  │
  ├─ 3. Multi-Outcome Scan (3+ outcomes)
  │     ├─ Group outcomes by conditionId (3+ outcomes per group)
  │     ├─ Check: sum of all ask prices < $1 → BUY ALL opportunity
  │     └─ Validate with VWAP estimation
  │
  ├─ 4. Log opportunities sorted by edge
  │
  └─ 5. Auto-Execute (if ARB_AUTO_EXECUTE=true + ENABLE_TRADING=true + DRY_RUN=false)
        ├─ Stability check: opportunity must appear 2+ times within 30 seconds
        └─ Place orders for both sides simultaneously
```

## Modules

### `src/api/` — API Client

The REST client for the Predict.fun API. Handles authentication (API key + JWT), cursor-based pagination, and endpoint fallback.

- **`client.ts`** — `PredictApiClient` class with methods for markets, orderbooks, orders, and auth. Fetches active markets via `GET /v1/markets?status=OPEN` with pagination. Orderbooks use the numeric market ID (`GET /v1/markets/{id}/orderbook`). All requests are authenticated via headers (never query params).

### `src/config/` — Configuration

Startup validation and secret management.

- **`schema.ts`** — Zod schema defining every env var with types, defaults, and constraints. Invalid config crashes immediately on startup rather than failing silently at runtime.
- **`index.ts`** — Loads `.env` via dotenv, parses through the Zod schema, and exports the validated config.
- **`redact.ts`** — Secret redaction utilities. `redactValue()` masks secrets for display, `redactSecrets()` sanitizes config objects, `scrubText()` removes hex keys and JWTs from arbitrary log text.

### `src/mm/` — Market Maker

The quoting engine that provides liquidity on both sides of a market.

- **`market-selector.ts`** — Scores and ranks markets by volume, liquidity, spread tightness, and orderbook depth. Returns the top N markets suitable for quoting.
- **`quoter.ts`** — Computes bid/ask prices using: depth-weighted micro-pricing, volatility EMA for adaptive spread, inventory skew to reduce directional risk, touch buffer to avoid crossing top-of-book, and inventory-aware order sizing.
- **`bot.ts`** — Main loop that ties it all together. Each cycle: check safety guards, select markets, compute quotes, cancel stale orders, place new orders.

### `src/arb/` — Arbitrage Scanner

Detects and optionally executes arbitrage opportunities.

- **`scanner.ts`** — Two scanner classes:
  - `IntraMarketScanner` — Finds YES+NO pairs where combined prices deviate from $1. Uses VWAP estimation with fees and slippage to validate profitability at realistic fill sizes.
  - `MultiOutcomeScanner` — Finds 3+ outcome groups where buying all outcomes costs less than the guaranteed $1 payout.
- **`bot.ts`** — Main loop with stability checks (opportunity must persist across 2+ scans before execution) and YES/NO pair building from conditionId grouping.

### `src/execution/` — Order Executor

- **`order-executor.ts`** — Handles order placement and cancellation. Validates every order (price range, notional size, finite values) before submission. Respects both `DRY_RUN` and `ENABLE_TRADING` flags independently.

### `src/risk/` — Risk Management

- **`circuit-breaker.ts`** — Three classes:
  - `CircuitBreaker` — Opens after N failures within a time window, auto-resets after cooldown.
  - `RiskManager` — Tracks daily PnL, enforces loss limits, provides a kill switch that halts all trading.
  - `RateLimiter` — Sliding-window rate limiter to prevent API throttling.

### `src/utils/` — Utilities

- **`logger.ts`** — Structured logger with configurable levels (debug/info/warn/error). All output is scrubbed through `scrubText()` so secrets never appear in logs.
- **`alert.ts`** — Sends webhook alerts (e.g., to Slack/Discord) for critical events like kill switch activation.

### `src/cli/` — CLI Entry Points

- **`start-mm.ts`** — Starts the market maker bot with graceful shutdown on SIGINT/SIGTERM.
- **`start-arb.ts`** — Starts the arbitrage scanner.
- **`auth-jwt.ts`** — JWT authentication flow: fetches a signing message from the API, signs it with your wallet, exchanges for a JWT token.
- **`smoke-test.ts`** — Validates config, API connection, market data, orderbook access, and risk limits. Never places orders.
- **`list-markets.ts`** — Diagnostic tool that lists all markets from the API with their active/inactive status.

### `tests/` — Unit Tests

- **`config.test.ts`** — 12 tests for Zod schema validation (defaults, type coercion, error cases).
- **`redact.test.ts`** — 9 tests for secret redaction (field masking, text scrubbing, pattern matching).
- **`quoter.test.ts`** — 9 tests for the quoting engine (spread, inventory skew, edge cases).

## Dashboard

A Next.js web dashboard for real-time monitoring and control.

### Setup

```bash
cd dashboard
npm install
cp .env.local.example .env.local
```

### Running

Start both the bot (with dashboard server) and the frontend:

```bash
# Terminal 1: Start bot with dashboard API server on port 3001
npm run start:dashboard

# Terminal 2: Start Next.js dashboard on port 3000
cd dashboard && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### Dashboard Features

- **Overview** — Bot status, PnL chart, active quotes, recent orders
- **Markets** — Live quote grid with bid/ask prices, spreads, and market info
- **Orders** — Full order history table with timestamps, sides, prices, dry-run status
- **Settings** — View redacted config, start/stop bots, toggle kill switch
- **Real-time** — WebSocket connection for live updates (quotes, orders, PnL)
- **Controls** — Start/stop MM or Arb, activate/reset kill switch

### Architecture

```
Dashboard (port 3000)  ←── WebSocket + REST ──→  Bot (port 3001)
                                                       │
                                                  data/orders.jsonl
                                                  data/pnl.jsonl
```

The bot embeds an HTTP + WebSocket server. The dashboard connects to it. Order history and PnL are persisted to JSONL files in `data/` for survival across restarts.

## Project Structure

```
src/
  api/          API client (REST, orderbook, orders)
  config/       Env validation, redaction, config loader
  cli/          CLI entry points (smoke, auth, start-mm, start-arb, start-dashboard)
  mm/           Market maker (market selector, quoter, bot loop)
  arb/          Arbitrage scanner (intra-market, multi-outcome)
  execution/    Order executor (dry-run aware)
  risk/         Circuit breaker, rate limiter, risk manager
  events/       Typed EventEmitter for bot-to-dashboard communication
  server/       Embedded HTTP + WebSocket server for dashboard API
  persistence/  JSONL-based order and PnL history storage
  utils/        Logger, alerts
dashboard/      Next.js web dashboard
tests/          Unit tests
docs/           Security docs, runbook, migration guide
```
