'use client';

import type { BotStatus } from '@/lib/types';

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: 'green' | 'red' | 'yellow' | 'gray';
}) {
  const colors = {
    green: 'bg-green-900/50 text-green-400 border-green-700',
    red: 'bg-red-900/50 text-red-400 border-red-700',
    yellow: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
    gray: 'bg-gray-800 text-gray-400 border-gray-600',
  };

  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${colors[variant]}`}
    >
      {label}
    </span>
  );
}

export function BotStatusCard({ status }: { status: BotStatus | null }) {
  if (!status) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
        <p className="text-gray-400">Loading status...</p>
      </div>
    );
  }

  const mmRunning = status.mm?.running ?? false;
  const dryRun = status.mm?.dryRun ?? true;
  const uptime = Math.floor(status.uptime);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Bot Status</h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Market Maker</span>
          <Badge
            label={mmRunning ? 'Running' : 'Stopped'}
            variant={mmRunning ? 'green' : 'gray'}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Mode</span>
          <Badge
            label={dryRun ? 'Dry Run' : 'Live'}
            variant={dryRun ? 'yellow' : 'green'}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Kill Switch</span>
          <Badge
            label={status.risk.killed ? 'ACTIVE' : 'Off'}
            variant={status.risk.killed ? 'red' : 'gray'}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Circuit Breaker</span>
          <Badge
            label={status.risk.circuitBreakerOpen ? 'Open' : 'Closed'}
            variant={status.risk.circuitBreakerOpen ? 'yellow' : 'gray'}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Daily PnL</span>
          <span
            className={`font-mono text-sm ${
              status.risk.dailyPnl >= 0
                ? 'text-green-400'
                : 'text-red-400'
            }`}
          >
            ${status.risk.dailyPnl.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Uptime</span>
          <span className="font-mono text-sm text-gray-300">
            {hours}h {minutes}m {seconds}s
          </span>
        </div>
      </div>
    </div>
  );
}
