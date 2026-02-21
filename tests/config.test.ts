/**
 * Tests for config validation via Zod schema.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EnvSchema } from '../src/config/schema.js';

describe('EnvSchema', () => {
  const validEnv = {
    API_KEY: 'test-api-key-12345',
    PRIVATE_KEY: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  };

  it('accepts valid minimal config with defaults', () => {
    const result = EnvSchema.safeParse(validEnv);
    assert.ok(result.success, 'Should parse valid env');

    const config = result.data;
    assert.strictEqual(config.DRY_RUN, true, 'DRY_RUN defaults to true');
    assert.strictEqual(config.ENABLE_TRADING, false, 'ENABLE_TRADING defaults to false');
    assert.strictEqual(config.AUTO_CONFIRM, false, 'AUTO_CONFIRM defaults to false');
    assert.strictEqual(config.WALLET_MODE, 'EOA');
    assert.strictEqual(config.API_BASE_URL, 'https://api.predict.fun');
  });

  it('rejects missing API_KEY', () => {
    const result = EnvSchema.safeParse({ PRIVATE_KEY: validEnv.PRIVATE_KEY });
    assert.ok(!result.success, 'Should reject missing API_KEY');
  });

  it('rejects missing PRIVATE_KEY', () => {
    const result = EnvSchema.safeParse({ API_KEY: validEnv.API_KEY });
    assert.ok(!result.success, 'Should reject missing PRIVATE_KEY');
  });

  it('rejects empty API_KEY', () => {
    const result = EnvSchema.safeParse({ ...validEnv, API_KEY: '' });
    assert.ok(!result.success, 'Should reject empty API_KEY');
  });

  it('parses DRY_RUN correctly', () => {
    // DRY_RUN=true by default, only "false" disables it
    const trueResult = EnvSchema.safeParse({ ...validEnv, DRY_RUN: 'true' });
    assert.ok(trueResult.success);
    assert.strictEqual(trueResult.data.DRY_RUN, true);

    const falseResult = EnvSchema.safeParse({ ...validEnv, DRY_RUN: 'false' });
    assert.ok(falseResult.success);
    assert.strictEqual(falseResult.data.DRY_RUN, false);

    // Anything other than "false" is treated as true (safe default)
    const randomResult = EnvSchema.safeParse({ ...validEnv, DRY_RUN: 'yes' });
    assert.ok(randomResult.success);
    assert.strictEqual(randomResult.data.DRY_RUN, true);
  });

  it('parses ENABLE_TRADING correctly', () => {
    const trueResult = EnvSchema.safeParse({ ...validEnv, ENABLE_TRADING: 'true' });
    assert.ok(trueResult.success);
    assert.strictEqual(trueResult.data.ENABLE_TRADING, true);

    // Anything other than "true" is false (safe default)
    const falseResult = EnvSchema.safeParse({ ...validEnv, ENABLE_TRADING: 'yes' });
    assert.ok(falseResult.success);
    assert.strictEqual(falseResult.data.ENABLE_TRADING, false);
  });

  it('validates spread range', () => {
    // Too small
    const tooSmall = EnvSchema.safeParse({ ...validEnv, SPREAD: '0.0001' });
    assert.ok(!tooSmall.success, 'Should reject spread < 0.001');

    // Too large
    const tooLarge = EnvSchema.safeParse({ ...validEnv, SPREAD: '0.6' });
    assert.ok(!tooLarge.success, 'Should reject spread > 0.5');

    // Valid
    const valid = EnvSchema.safeParse({ ...validEnv, SPREAD: '0.05' });
    assert.ok(valid.success);
    assert.strictEqual(valid.data.SPREAD, 0.05);
  });

  it('validates numeric coercion', () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      MAX_DAILY_LOSS_USD: '500',
      ORDER_SIZE_USD: '25',
    });
    assert.ok(result.success);
    assert.strictEqual(result.data.MAX_DAILY_LOSS_USD, 500);
    assert.strictEqual(result.data.ORDER_SIZE_USD, 25);
  });

  it('parses MARKET_TOKEN_IDS as array', () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      MARKET_TOKEN_IDS: 'abc123,def456, ghi789 ',
    });
    assert.ok(result.success);
    assert.deepStrictEqual(result.data.MARKET_TOKEN_IDS, [
      'abc123',
      'def456',
      'ghi789',
    ]);
  });

  it('handles empty MARKET_TOKEN_IDS', () => {
    const result = EnvSchema.safeParse({ ...validEnv, MARKET_TOKEN_IDS: '' });
    assert.ok(result.success);
    assert.deepStrictEqual(result.data.MARKET_TOKEN_IDS, []);
  });

  it('validates API_BASE_URL must be a valid URL', () => {
    const bad = EnvSchema.safeParse({
      ...validEnv,
      API_BASE_URL: 'not-a-url',
    });
    assert.ok(!bad.success, 'Should reject invalid URL');
  });

  it('validates WALLET_MODE enum', () => {
    const eoa = EnvSchema.safeParse({ ...validEnv, WALLET_MODE: 'EOA' });
    assert.ok(eoa.success);
    assert.strictEqual(eoa.data.WALLET_MODE, 'EOA');

    const external = EnvSchema.safeParse({ ...validEnv, WALLET_MODE: 'EXTERNAL' });
    assert.ok(external.success);
    assert.strictEqual(external.data.WALLET_MODE, 'EXTERNAL');

    const invalid = EnvSchema.safeParse({ ...validEnv, WALLET_MODE: 'INVALID' });
    assert.ok(!invalid.success, 'Should reject invalid wallet mode');
  });
});
