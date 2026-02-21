/**
 * CLI: JWT Authentication.
 * Authenticates with the Predict.fun API to obtain a JWT token.
 * Prints the token to stdout (never writes to .env).
 *
 * Flow (per API docs at https://dev.predict.fun):
 *   1. GET  /v1/auth/message → get dynamic message to sign
 *   2. Sign the message with your wallet's private key
 *   3. POST /v1/auth { signer, signature, message } → get JWT
 *
 * SECURITY: The user must manually add the JWT to their .env file.
 * This prevents accidental secret writes with improper permissions.
 */

import { loadConfig } from '../config/index.js';
import { setLogLevel } from '../utils/logger.js';
import { logger } from '../utils/logger.js';
import { redactValue } from '../config/redact.js';
import { Wallet } from 'ethers';
import axios from 'axios';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);

  if (!config.PRIVATE_KEY) {
    logger.error('PRIVATE_KEY is required for JWT authentication');
    process.exit(1);
  }

  logger.info('Starting JWT authentication flow');

  const baseUrl = config.API_BASE_URL.replace(/\/+$/, '');
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.API_KEY,
  };

  try {
    const wallet = new Wallet(config.PRIVATE_KEY);
    const address = wallet.address;
    logger.info(`Wallet address: ${address}`);

    // Step 1: Get the dynamic auth message
    logger.info('Fetching auth message...');
    const msgRes = await axios.get(`${baseUrl}/v1/auth/message`, {
      headers,
      timeout: 15000,
    });

    const message =
      msgRes.data?.data?.message ??
      msgRes.data?.message;

    if (!message || typeof message !== 'string') {
      logger.error('Failed to get auth message from API');
      logger.debug(`Response: ${JSON.stringify(msgRes.data)}`);
      process.exit(1);
    }

    logger.info('Auth message received, signing...');

    // Step 2: Sign the message with the wallet
    const signature = await wallet.signMessage(message);

    // Step 3: Exchange signature for JWT
    logger.info('Exchanging signature for JWT...');
    const authRes = await axios.post(
      `${baseUrl}/v1/auth`,
      {
        signer: address,
        signature,
        message,
      },
      {
        headers,
        timeout: 15000,
      }
    );

    const token =
      authRes.data?.data?.token ??
      authRes.data?.token ??
      authRes.data?.data?.jwt ??
      authRes.data?.jwt;

    if (!token) {
      logger.error('No token in API response');
      logger.debug(`Response: ${JSON.stringify(authRes.data)}`);
      process.exit(1);
    }

    // Print instructions (never auto-write to .env)
    console.log('\n' + '='.repeat(60));
    console.log('JWT token obtained successfully!');
    console.log(`Token preview: ${redactValue(token)}`);
    console.log('');
    console.log('Add this to your .env file:');
    console.log('');
    console.log(`JWT_TOKEN=${token}`);
    console.log('');
    console.log('='.repeat(60));
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      logger.error(
        `JWT auth failed: ${err.response.status} ${JSON.stringify(err.response.data)}`
      );
    } else {
      logger.error('JWT authentication failed:', err);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
