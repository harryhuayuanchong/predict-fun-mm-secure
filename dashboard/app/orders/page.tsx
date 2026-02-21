'use client';

import { ConnectionIndicator } from '@/components/connection-indicator';
import { OrderHistoryTable } from '@/components/order-history-table';
import { useWebSocket } from '@/hooks/use-websocket';

export default function OrdersPage() {
  const { connected } = useWebSocket();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Order History</h1>
        <ConnectionIndicator connected={connected} />
      </div>

      <OrderHistoryTable limit={100} />
    </div>
  );
}
