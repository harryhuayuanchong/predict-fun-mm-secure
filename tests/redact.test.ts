/**
 * Tests for secret redaction utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactValue, redactSecrets, scrubText, isSecretField } from '../src/config/redact.js';

describe('redactValue', () => {
  it('returns (not set) for empty/undefined', () => {
    assert.strictEqual(redactValue(undefined), '(not set)');
    assert.strictEqual(redactValue(''), '(not set)');
  });

  it('returns **** for short values', () => {
    assert.strictEqual(redactValue('abc'), '****');
    assert.strictEqual(redactValue('12345678'), '****');
  });

  it('shows first 4 chars for longer values', () => {
    const result = redactValue('mysecretkey123456');
    assert.strictEqual(result, 'myse...(redacted)');
  });
});

describe('redactSecrets', () => {
  it('redacts known secret fields', () => {
    const input = {
      API_KEY: 'super-secret-api-key',
      PRIVATE_KEY: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      JWT_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123',
      API_BASE_URL: 'https://api.predict.fun',
      DRY_RUN: true,
    };

    const result = redactSecrets(input);

    assert.ok(!result.API_KEY.includes('super-secret'));
    assert.ok(result.API_KEY.includes('(redacted)'));
    assert.ok(!result.PRIVATE_KEY.includes('abcdef'));
    assert.ok(result.PRIVATE_KEY.includes('(redacted)'));

    // Non-secret fields unchanged
    assert.strictEqual(result.API_BASE_URL, 'https://api.predict.fun');
    assert.strictEqual(result.DRY_RUN, true);
  });

  it('does not modify the original object', () => {
    const input = { API_KEY: 'original-value', FOO: 'bar' };
    redactSecrets(input);
    assert.strictEqual(input.API_KEY, 'original-value');
  });
});

describe('scrubText', () => {
  it('redacts hex private keys', () => {
    const text =
      'Error with key 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 in tx';
    const result = scrubText(text);
    assert.ok(result.includes('[REDACTED]'));
    assert.ok(!result.includes('abcdef1234567890'));
  });

  it('redacts JWT tokens', () => {
    const text =
      'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c was invalid';
    const result = scrubText(text);
    assert.ok(result.includes('[REDACTED]'));
    assert.ok(!result.includes('eyJhbGci'));
  });

  it('redacts Bearer tokens', () => {
    const text = 'Authorization: Bearer abcdefghij1234567890abcdefghij';
    const result = scrubText(text);
    assert.ok(result.includes('[REDACTED]'));
    assert.ok(!result.includes('abcdefghij1234567890'));
  });

  it('leaves normal text untouched', () => {
    const text = 'Order placed successfully at price 0.55';
    const result = scrubText(text);
    assert.strictEqual(result, text);
  });
});

describe('isSecretField', () => {
  it('identifies known secret fields', () => {
    assert.ok(isSecretField('PRIVATE_KEY'));
    assert.ok(isSecretField('API_KEY'));
    assert.ok(isSecretField('JWT_TOKEN'));
    assert.ok(isSecretField('RPC_URL'));
    assert.ok(isSecretField('ALERT_WEBHOOK_URL'));
  });

  it('is case-insensitive', () => {
    assert.ok(isSecretField('private_key'));
    assert.ok(isSecretField('api_key'));
  });

  it('rejects non-secret fields', () => {
    assert.ok(!isSecretField('DRY_RUN'));
    assert.ok(!isSecretField('SPREAD'));
    assert.ok(!isSecretField('LOG_LEVEL'));
  });
});
