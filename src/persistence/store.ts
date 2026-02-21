/**
 * Persistence store for order history and PnL tracking.
 * Uses append-only JSONL files in the data/ directory.
 * Subscribes to botEmitter to auto-persist events.
 */

import fs from 'node:fs';
import path from 'node:path';
import { botEmitter, type OrderEvent, type PnlEvent } from '../events/emitter.js';

export interface PersistedOrder {
  timestamp: number;
  tokenId: string;
  question: string;
  side: 'BUY' | 'SELL';
  price: number;
  shares: number;
  orderHash: string;
  action: 'placed' | 'cancelled';
  dryRun: boolean;
}

export interface PersistedPnl {
  timestamp: number;
  dailyPnl: number;
}

export class PersistenceStore {
  private dataDir: string;
  private ordersPath: string;
  private pnlPath: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.ordersPath = path.join(this.dataDir, 'orders.jsonl');
    this.pnlPath = path.join(this.dataDir, 'pnl.jsonl');

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /** Start listening to bot events and persisting them */
  startListening(): void {
    botEmitter.onBot('mm:order:placed', (data: OrderEvent) => {
      this.appendOrder({
        timestamp: data.timestamp,
        tokenId: data.tokenId,
        question: data.question,
        side: data.side,
        price: data.price,
        shares: data.shares,
        orderHash: data.orderHash,
        action: 'placed',
        dryRun: data.dryRun,
      });
    });

    botEmitter.onBot('mm:order:cancelled', (data) => {
      for (const hash of data.orderHashes) {
        this.appendOrder({
          timestamp: data.timestamp,
          tokenId: data.tokenId,
          question: '',
          side: 'BUY',
          price: 0,
          shares: 0,
          orderHash: hash,
          action: 'cancelled',
          dryRun: false,
        });
      }
    });

    botEmitter.onBot('risk:pnl', (data: PnlEvent) => {
      this.appendPnl({
        timestamp: data.timestamp,
        dailyPnl: data.dailyPnl,
      });
    });
  }

  private appendOrder(order: PersistedOrder): void {
    try {
      fs.appendFileSync(this.ordersPath, JSON.stringify(order) + '\n');
    } catch {
      // Silently ignore write errors to avoid crashing the bot
    }
  }

  private appendPnl(pnl: PersistedPnl): void {
    try {
      fs.appendFileSync(this.pnlPath, JSON.stringify(pnl) + '\n');
    } catch {
      // Silently ignore
    }
  }

  getOrders(limit = 100, offset = 0): PersistedOrder[] {
    return this.readJsonl<PersistedOrder>(this.ordersPath, limit, offset);
  }

  getPnlHistory(sinceMs = 0): PersistedPnl[] {
    const all = this.readJsonl<PersistedPnl>(this.pnlPath, 10000, 0);
    if (sinceMs > 0) {
      return all.filter((p) => p.timestamp >= sinceMs);
    }
    return all;
  }

  getOrderCount(): number {
    if (!fs.existsSync(this.ordersPath)) return 0;
    try {
      const content = fs.readFileSync(this.ordersPath, 'utf-8');
      return content.split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  private readJsonl<T>(filePath: string, limit: number, offset: number): T[] {
    if (!fs.existsSync(filePath)) return [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      // Return newest first
      const reversed = lines.reverse();
      const sliced = reversed.slice(offset, offset + limit);

      return sliced
        .map((line) => {
          try {
            return JSON.parse(line) as T;
          } catch {
            return null;
          }
        })
        .filter((item): item is T => item !== null);
    } catch {
      return [];
    }
  }
}
