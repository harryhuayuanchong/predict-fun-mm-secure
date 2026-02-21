/**
 * Typed event emitter for bot-to-dashboard communication.
 * All bot classes emit events through this singleton.
 * If no listeners are attached, emit calls are no-ops.
 */

import { EventEmitter } from 'node:events';
import type { Market, Orderbook } from '../api/client.js';

export interface QuoteEvent {
  tokenId: string;
  question: string;
  outcome: string;
  marketId: number;
  bidPrice: number;
  askPrice: number;
  bidShares: number;
  askShares: number;
  microPrice: number;
  spread: number;
  bestBid: number;
  bestAsk: number;
  volume24h: number;
}

export interface OrderEvent {
  timestamp: number;
  tokenId: string;
  question: string;
  side: 'BUY' | 'SELL';
  price: number;
  shares: number;
  orderHash: string;
  dryRun: boolean;
}

export interface OrderCancelEvent {
  timestamp: number;
  tokenId: string;
  orderHashes: string[];
  reason: string;
}

export interface CycleEvent {
  timestamp: number;
  marketsProcessed: number;
  cycleCount: number;
}

export interface StatusEvent {
  running: boolean;
  dryRun: boolean;
  tradingEnabled: boolean;
  cycleCount: number;
}

export interface ArbScanEvent {
  timestamp: number;
  opportunitiesFound: number;
  marketsScanned: number;
}

export interface ArbOpportunityEvent {
  type: string;
  edge: number;
  shares: number;
  estimatedProfit: number;
  details: string;
  marketIds: string[];
}

export interface PnlEvent {
  timestamp: number;
  dailyPnl: number;
}

export interface CircuitBreakerEvent {
  isOpen: boolean;
  failureCount: number;
  cooldownUntil?: number;
}

export interface KillSwitchEvent {
  active: boolean;
  reason?: string;
}

export interface BotEventMap {
  'mm:quote': QuoteEvent;
  'mm:order:placed': OrderEvent;
  'mm:order:cancelled': OrderCancelEvent;
  'mm:cycle': CycleEvent;
  'mm:status': StatusEvent;
  'arb:scan': ArbScanEvent;
  'arb:opportunity': ArbOpportunityEvent;
  'risk:pnl': PnlEvent;
  'risk:circuit_breaker': CircuitBreakerEvent;
  'risk:kill_switch': KillSwitchEvent;
  'system:started': { mode: string; timestamp: number };
  'system:stopped': { reason: string; timestamp: number };
  'system:error': { message: string; timestamp: number };
}

export type BotEventName = keyof BotEventMap;

class TypedBotEmitter extends EventEmitter {
  emitBot<K extends BotEventName>(event: K, data: BotEventMap[K]): boolean {
    return super.emit(event, data);
  }

  onBot<K extends BotEventName>(event: K, listener: (data: BotEventMap[K]) => void): this {
    return super.on(event, listener);
  }
}

export const botEmitter = new TypedBotEmitter();
