'use client';

import { useBotStatus } from '@/hooks/use-bot-status';
import { ConnectionIndicator } from '@/components/connection-indicator';
import { BotStatusCard } from '@/components/bot-status-card';
import { ControlPanel } from '@/components/control-panel';
import { PnlChart } from '@/components/pnl-chart';
import { QuoteGrid } from '@/components/quote-grid';
import { OrderHistoryTable } from '@/components/order-history-table';

export default function DashboardPage() {
  const { status, connected } = useBotStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <ConnectionIndicator connected={connected} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BotStatusCard status={status} />
        <ControlPanel status={status} />
      </div>

      <PnlChart />

      <QuoteGrid />

      <OrderHistoryTable limit={20} />
    </div>
  );
}
