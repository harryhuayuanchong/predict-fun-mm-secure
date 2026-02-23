/**
 * Environment variable schema using Zod.
 * All secrets validated on startup. Invalid config = immediate crash.
 */

import { z } from 'zod';

const nonEmptyString = z.string().min(1);

const walletModeEnum = z.enum(['EOA', 'EXTERNAL']).default('EOA');

export const EnvSchema = z.object({
  // Platform API
  API_BASE_URL: z.string().url().default('https://api.predict.fun'),
  API_KEY: nonEmptyString.describe('Predict.fun API key'),

  // JWT
  JWT_TOKEN: z.string().optional().default(''),

  // Wallet
  WALLET_MODE: walletModeEnum,
  PRIVATE_KEY: nonEmptyString.describe('EOA private key (hex)'),
  PREDICT_ACCOUNT_ADDRESS: z.string().optional().default(''),
  RPC_URL: z.string().optional().default(''),

  // Safety
  DRY_RUN: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  ENABLE_TRADING: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  AUTO_CONFIRM: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  PP_MODE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  PP_MIN_ORDER_SIZE_USD: z.coerce.number().min(0).default(20),
  MAX_DAILY_LOSS_USD: z.coerce.number().positive().default(200),
  MAX_POSITION_USD: z.coerce.number().positive().default(100),
  MAX_SINGLE_ORDER_USD: z.coerce.number().positive().default(50),

  // Market Maker
  SPREAD: z.coerce.number().min(0.001).max(0.5).default(0.02),
  MIN_SPREAD: z.coerce.number().min(0.001).max(0.5).default(0.01),
  MAX_SPREAD: z.coerce.number().min(0.001).max(1).default(0.08),
  ORDER_SIZE_USD: z.coerce.number().positive().default(10),
  REFRESH_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),

  // Arbitrage
  ARB_AUTO_EXECUTE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  ARB_MIN_PROFIT_PCT: z.coerce.number().min(0).default(0.02),
  ARB_SCAN_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  ARB_MAX_MARKETS: z.coerce.number().int().min(1).default(80),

  // Circuit Breaker
  CIRCUIT_MAX_FAILURES: z.coerce.number().int().min(1).default(3),
  CIRCUIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  CIRCUIT_COOLDOWN_MS: z.coerce.number().int().min(1000).default(60000),

  // Rate Limiting
  RATE_LIMIT_REQUESTS_PER_SEC: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_ORDERS_PER_MIN: z.coerce.number().int().min(1).default(30),

  // Alerts
  ALERT_WEBHOOK_URL: z.string().optional().default(''),

  // Dashboard
  DASHBOARD_PORT: z.coerce.number().int().min(1024).default(3001),
  DASHBOARD_API_TOKEN: z.string().optional().default(''),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Market filter
  MARKET_TOKEN_IDS: z
    .string()
    .optional()
    .default('')
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    ),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
