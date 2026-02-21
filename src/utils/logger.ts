/**
 * Secure logger.
 * Scrubs all output through secret redaction before printing.
 * Prevents accidental secret leakage in logs.
 */

import { scrubText } from '../config/redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return scrubText(arg.message);
      }
      if (typeof arg === 'string') {
        return scrubText(arg);
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return scrubText(JSON.stringify(arg));
        } catch {
          return '[Object]';
        }
      }
      return String(arg);
    })
    .join(' ');
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(`${timestamp()} [DEBUG] ${formatArgs(args)}`);
    }
  },

  info(...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(`${timestamp()} [INFO]  ${formatArgs(args)}`);
    }
  },

  warn(...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(`${timestamp()} [WARN]  ${formatArgs(args)}`);
    }
  },

  error(...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(`${timestamp()} [ERROR] ${formatArgs(args)}`);
    }
  },
};
