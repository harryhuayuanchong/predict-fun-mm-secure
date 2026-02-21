'use client';

import { useState, useEffect } from 'react';
import { botApi } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import type { MarketQuote } from '@/lib/types';

function QuoteCard({ quote }: { quote: MarketQuote }) {
  const spreadPct = (quote.spread * 100).toFixed(2);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <p className="mb-2 truncate text-sm font-medium text-gray-300">
        {quote.question}
      </p>
      <p className="mb-3 text-xs text-gray-500">{quote.outcome}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500">Bid</p>
          <p className="font-mono text-sm text-green-400">
            {quote.bidPrice.toFixed(4)}
          </p>
          <p className="font-mono text-xs text-gray-500">
            {quote.bidShares} shares
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Ask</p>
          <p className="font-mono text-sm text-red-400">
            {quote.askPrice.toFixed(4)}
          </p>
          <p className="font-mono text-xs text-gray-500">
            {quote.askShares} shares
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-between border-t border-gray-700 pt-2">
        <span className="text-xs text-gray-500">
          Spread: {spreadPct}%
        </span>
        <span className="text-xs text-gray-500">
          Mid: {quote.microPrice.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

export function QuoteGrid() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    botApi
      .getMarkets()
      .then((res) => setQuotes(res.markets))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return subscribe('mm:quote', (raw) => {
      const q = raw as MarketQuote;
      setQuotes((prev) => {
        const idx = prev.findIndex((p) => p.tokenId === q.tokenId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = q;
          return next;
        }
        return [...prev, q];
      });
    });
  }, [subscribe]);

  if (quotes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-white">
          Active Quotes
        </h2>
        <p className="text-sm text-gray-400">
          No active quotes. Start the market maker to see live quotes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">
        Active Quotes ({quotes.length})
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {quotes.map((q) => (
          <QuoteCard key={q.tokenId} quote={q} />
        ))}
      </div>
    </div>
  );
}
