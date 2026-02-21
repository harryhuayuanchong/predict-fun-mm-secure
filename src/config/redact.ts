/**
 * Secret redaction utilities.
 * Ensures secrets never appear in logs, error messages, or exports.
 */

/** Fields that contain secret values and must be redacted */
const SECRET_FIELDS = new Set([
  'PRIVATE_KEY',
  'API_KEY',
  'JWT_TOKEN',
  'POLYMARKET_API_KEY',
  'POLYMARKET_API_SECRET',
  'POLYMARKET_API_PASSPHRASE',
  'POLYMARKET_PRIVATE_KEY',
  'PROBABLE_PRIVATE_KEY',
  'OPINION_API_KEY',
  'OPINION_PRIVATE_KEY',
  'PREDICT_WS_API_KEY',
  'ALERT_WEBHOOK_URL',
  'RPC_URL',
  'DASHBOARD_API_TOKEN',
]);

/** Patterns that look like secrets in arbitrary text */
const SECRET_PATTERNS = [
  // Private keys (hex, 64 chars)
  /0x[0-9a-fA-F]{64}/g,
  // JWT tokens
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
  // API keys (various formats)
  /[A-Za-z0-9]{32,}/g,
];

/**
 * Redact a single secret value for display.
 * Shows first 4 chars and masks the rest.
 */
export function redactValue(value: string | undefined): string {
  if (!value || value.length === 0) return '(not set)';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...(redacted)`;
}

/**
 * Return a copy of the config with all secret fields redacted.
 */
export function redactSecrets<T extends Record<string, unknown>>(obj: T): T {
  const redacted = { ...obj };
  for (const key of Object.keys(redacted)) {
    if (SECRET_FIELDS.has(key) && typeof redacted[key] === 'string') {
      (redacted as Record<string, unknown>)[key] = redactValue(
        redacted[key] as string
      );
    }
  }
  return redacted;
}

/**
 * Scrub secrets from arbitrary text (log lines, error messages).
 * Replaces known patterns with [REDACTED].
 */
export function scrubText(text: string): string {
  let scrubbed = text;
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}

/**
 * Check if a field name is known to be secret.
 */
export function isSecretField(fieldName: string): boolean {
  return SECRET_FIELDS.has(fieldName.toUpperCase());
}
