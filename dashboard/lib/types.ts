export interface BotStatus {
  mm: {
    running: boolean;
    dryRun: boolean;
    tradingEnabled: boolean;
  } | null;
  arb: {
    running: boolean;
  } | null;
  risk: {
    killed: boolean;
    dailyPnl: number;
    circuitBreakerOpen: boolean;
  };
  uptime: number;
}

export interface MarketQuote {
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
  volume24h: number;
}

export interface OrderRecord {
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

export interface PnlPoint {
  timestamp: number;
  dailyPnl: number;
}

export interface WsMessage {
  event: string;
  data: unknown;
  timestamp: number;
}

export interface RedactedConfig {
  [key: string]: string | number | boolean | string[];
}
