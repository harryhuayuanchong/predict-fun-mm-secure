'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { botApi } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import type { PnlPoint } from '@/lib/types';

export function PnlChart() {
  const [data, setData] = useState<PnlPoint[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    botApi
      .getPnl()
      .then((res) => setData(res.history.slice(-200)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return subscribe('risk:pnl', (raw) => {
      const point = raw as PnlPoint;
      setData((prev) => [...prev.slice(-199), point]);
    });
  }, [subscribe]);

  const chartData = data.map((d) => ({
    time: d.timestamp,
    pnl: d.dailyPnl,
  }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Daily PnL</h2>
        <p className="text-gray-400 text-sm">No PnL data yet. Start the bot to see updates.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Daily PnL</h2>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="time"
            tickFormatter={(t) => format(new Date(t), 'HH:mm')}
            stroke="#6b7280"
            fontSize={12}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
            labelFormatter={(t) =>
              format(new Date(t as number), 'HH:mm:ss')
            }
            formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(2)}`, 'PnL']}
          />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="pnl"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
