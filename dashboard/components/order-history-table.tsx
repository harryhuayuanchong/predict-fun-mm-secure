'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { botApi } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import type { OrderRecord } from '@/lib/types';

export function OrderHistoryTable({ limit = 50 }: { limit?: number }) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [total, setTotal] = useState(0);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    botApi
      .getOrderHistory(limit, 0)
      .then((res) => {
        setOrders(res.orders);
        setTotal(res.total);
      })
      .catch(() => {});
  }, [limit]);

  // Live updates
  useEffect(() => {
    return subscribe('mm:order:placed', (raw) => {
      const o = raw as OrderRecord & { orderHash: string; dryRun: boolean };
      const record: OrderRecord = {
        timestamp: o.timestamp || Date.now(),
        tokenId: o.tokenId,
        question: o.question || '',
        side: o.side,
        price: o.price,
        shares: o.shares,
        orderHash: o.orderHash,
        action: 'placed',
        dryRun: o.dryRun,
      };
      setOrders((prev) => [record, ...prev].slice(0, limit));
      setTotal((prev) => prev + 1);
    });
  }, [subscribe, limit]);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Order History</h2>
        <span className="text-xs text-gray-500">{total} total orders</span>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-400">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-xs text-gray-500">
                <th className="pb-2 pr-4">Time</th>
                <th className="pb-2 pr-4">Market</th>
                <th className="pb-2 pr-4">Side</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Shares</th>
                <th className="pb-2 pr-4">Notional</th>
                <th className="pb-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr
                  key={`${o.orderHash}-${i}`}
                  className="border-b border-gray-800 text-gray-300"
                >
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">
                    {format(new Date(o.timestamp), 'HH:mm:ss')}
                  </td>
                  <td className="max-w-[200px] truncate py-2 pr-4 text-xs">
                    {o.question || o.tokenId.slice(0, 12)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`text-xs font-medium ${
                        o.side === 'BUY'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {o.price.toFixed(4)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{o.shares}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    ${(o.price * o.shares).toFixed(2)}
                  </td>
                  <td className="py-2 pr-4">
                    {o.dryRun ? (
                      <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-400">
                        DRY
                      </span>
                    ) : o.action === 'cancelled' ? (
                      <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">
                        Cancelled
                      </span>
                    ) : (
                      <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-400">
                        Live
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
