/**
 * Alert utility.
 * Sends notifications to a webhook URL with rate limiting.
 * Never includes secrets in alert payloads.
 */

import axios from 'axios';
import { scrubText } from '../config/redact.js';
import { logger } from './logger.js';

let lastSentAt = 0;

export async function sendAlert(
  webhookUrl: string | undefined,
  message: string,
  minIntervalMs = 60000
): Promise<void> {
  if (!webhookUrl) return;

  const now = Date.now();
  if (now - lastSentAt < minIntervalMs) return;
  lastSentAt = now;

  const safeMessage = scrubText(message);

  try {
    await axios.post(webhookUrl, { text: safeMessage }, { timeout: 5000 });
  } catch {
    logger.warn('Failed to send alert');
  }
}
