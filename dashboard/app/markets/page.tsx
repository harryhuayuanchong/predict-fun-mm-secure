'use client';

import { ConnectionIndicator } from '@/components/connection-indicator';
import { QuoteGrid } from '@/components/quote-grid';
import { useWebSocket } from '@/hooks/use-websocket';

export default function MarketsPage() {
  const { connected } = useWebSocket();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Markets</h1>
        <ConnectionIndicator connected={connected} />
      </div>

      <QuoteGrid />
    </div>
  );
}
