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

## Project Structure

```
src/
  api/          API client (REST, orderbook, orders)
  config/       Env validation, redaction, config loader
  cli/          CLI entry points (smoke, auth, start-mm, start-arb)
  mm/           Market maker (market selector, quoter, bot loop)
  arb/          Arbitrage scanner (intra-market, multi-outcome)
  execution/    Order executor (dry-run aware)
  risk/         Circuit breaker, rate limiter, risk manager
  utils/        Logger, alerts
tests/          Unit tests
docs/           Security docs, runbook, migration guide
```
