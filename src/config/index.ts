/**
 * Configuration loader.
 * Validates all env vars on startup with Zod.
 * Never exposes raw secrets in logs or errors.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvSchema, type EnvConfig } from './schema.js';
import { redactSecrets } from './redact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedConfig: EnvConfig | null = null;

export function loadConfig(): EnvConfig {
  if (cachedConfig) return cachedConfig;

  const envPath = process.env.ENV_PATH || path.resolve(__dirname, '../../.env');
  dotenvConfig({ path: envPath });

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`
    );
    console.error('Configuration validation failed:');
    console.error(issues.join('\n'));
    process.exit(1);
  }

  const config = result.data;

  // Cross-validate
  if (config.MIN_SPREAD > config.MAX_SPREAD) {
    console.error('MIN_SPREAD cannot exceed MAX_SPREAD');
    process.exit(1);
  }

  if (config.ENABLE_TRADING && config.DRY_RUN) {
    console.error('ENABLE_TRADING=true requires DRY_RUN=false');
    process.exit(1);
  }

  if (config.WALLET_MODE === 'EOA' && !config.PRIVATE_KEY) {
    console.error('WALLET_MODE=EOA requires PRIVATE_KEY');
    process.exit(1);
  }

  cachedConfig = config;
  return config;
}

export function printConfig(config: EnvConfig): void {
  const safe = redactSecrets(config);
  console.log('\nConfiguration:');
  console.log('-'.repeat(60));

  const entries: [string, unknown][] = [
    ['API URL', safe.API_BASE_URL],
    ['API Key', safe.API_KEY],
    ['JWT Token', safe.JWT_TOKEN],
    ['Wallet Mode', safe.WALLET_MODE],
    ['Private Key', safe.PRIVATE_KEY],
    ['Predict Account', config.PREDICT_ACCOUNT_ADDRESS || 'Direct EOA'],
    ['Dry Run', config.DRY_RUN],
    ['Trading Enabled', config.ENABLE_TRADING],
    ['Auto Confirm', config.AUTO_CONFIRM],
    ['PP Mode', config.PP_MODE],
    ['PP Min Order Size', `$${config.PP_MIN_ORDER_SIZE_USD}`],
    ['Max Daily Loss', `$${config.MAX_DAILY_LOSS_USD}`],
    ['Max Position', `$${config.MAX_POSITION_USD}`],
    ['Max Single Order', `$${config.MAX_SINGLE_ORDER_USD}`],
    ['Spread', `${(config.SPREAD * 100).toFixed(2)}%`],
    ['Spread Range', `${(config.MIN_SPREAD * 100).toFixed(2)}% - ${(config.MAX_SPREAD * 100).toFixed(2)}%`],
    ['Order Size', `$${config.ORDER_SIZE_USD}`],
    ['Arb Auto Execute', config.ARB_AUTO_EXECUTE],
    ['Log Level', config.LOG_LEVEL],
  ];

  for (const [key, value] of entries) {
    console.log(`  ${key}: ${value}`);
  }

  console.log('-'.repeat(60));
}

export { redactSecrets } from './redact.js';
export type { EnvConfig } from './schema.js';
