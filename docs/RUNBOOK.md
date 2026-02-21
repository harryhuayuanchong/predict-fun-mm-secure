# Runbook — Safe Deployment Guide

## Prerequisites

- Node.js 18+ (LTS recommended)
- A Predict.fun account with API key
- A dedicated EOA wallet (never use your main wallet)
- Funded wallet with USDC on the appropriate chain

## Local Development

```bash
# 1. Clone and install
cd predict-fun-mm-secure
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your API_KEY and PRIVATE_KEY

# 3. Validate
npm run smoke

# 4. Dry-run market maker
npm run start:mm
# Verify [DRY RUN] prefix on all order logs

# 5. Dry-run arbitrage scanner
npm run start:arb
```

## Production Deployment (VPS)

### Server Setup

```bash
# Use a minimal Linux VPS (Ubuntu 22.04+)
# Create a non-root user for the bot
sudo adduser mmbot
sudo su - mmbot

# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
```

### Secrets Injection

**Never commit `.env` to git. Never copy secrets in plaintext over insecure channels.**

Option A — Direct `.env` file:
```bash
# Create .env with restrictive permissions
touch .env
chmod 600 .env
# Paste secrets via secure terminal (SSH)
nano .env
```

Option B — Environment variables:
```bash
# Export secrets in the shell session
export API_KEY="your-api-key"
export PRIVATE_KEY="0x..."
export DRY_RUN=false
export ENABLE_TRADING=true
npm run start:mm
```

Option C — Docker with secrets:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
USER node
CMD ["node", "dist/cli/start-mm.js"]
```
```bash
docker run --env-file .env predict-mm
```

### Process Management

Use `pm2` or `systemd` to keep the bot running:

```bash
# pm2
npm install -g pm2
pm2 start "npm run start:mm" --name predict-mm
pm2 save
pm2 startup

# Monitor
pm2 logs predict-mm
pm2 monit
```

### Monitoring

- Watch for `[ERROR]` and `[WARN]` in logs.
- Set `ALERT_WEBHOOK_URL` to a Slack/Discord webhook for real-time alerts.
- Monitor daily PnL via log output.
- The kill switch auto-activates on loss limit breach — check alerts.

## JWT Authentication

```bash
# Obtain JWT (requires API_KEY and PRIVATE_KEY in .env)
npm run auth:jwt

# Copy the printed JWT_TOKEN line into your .env
# Restart the bot to use the new token
```

JWTs may expire. Re-run `auth:jwt` if you see 401 errors.

## Operational Procedures

### Starting Live Trading

1. Ensure smoke test passes: `npm run smoke`
2. Set `DRY_RUN=false` and `ENABLE_TRADING=true` in `.env`
3. Start with conservative limits:
   - `ORDER_SIZE_USD=5`
   - `MAX_DAILY_LOSS_USD=50`
   - `MAX_SINGLE_ORDER_USD=20`
4. Monitor logs for the first 30 minutes

### Emergency Stop

1. Press `Ctrl+C` (sends SIGINT — graceful shutdown)
2. Or set `ENABLE_TRADING=false` and restart
3. The kill switch auto-activates on loss limit breach

### Changing Configuration

1. Edit `.env`
2. Restart the bot (config is loaded once at startup)
3. Verify new settings in the startup log output

### Scaling Up

After gaining confidence:
1. Gradually increase `ORDER_SIZE_USD`
2. Increase `MAX_DAILY_LOSS_USD` proportionally
3. Add more markets via `MARKET_TOKEN_IDS`
4. Consider running MM and arb bots independently

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Configuration validation failed` | Check `.env` against `.env.example`. All required fields must be set. |
| `API connection failed` | Verify `API_KEY` and `API_BASE_URL`. Run `npm run smoke`. |
| `API authentication failed` | Regenerate API key or re-run `npm run auth:jwt`. |
| `Circuit breaker OPEN` | API is returning errors. Wait for cooldown or check API status. |
| `Kill switch activated` | Daily loss limit reached. Reset by restarting the bot (new day). |
| `No valid quote` | Orderbook is too thin or too wide. Normal for illiquid markets. |
