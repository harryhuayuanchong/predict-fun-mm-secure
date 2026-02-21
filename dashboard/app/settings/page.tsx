'use client';

import { useState, useEffect } from 'react';
import { botApi } from '@/lib/api-client';
import { useBotStatus } from '@/hooks/use-bot-status';
import { ConnectionIndicator } from '@/components/connection-indicator';
import { ControlPanel } from '@/components/control-panel';
import type { RedactedConfig } from '@/lib/types';

const CONFIG_GROUPS: Record<string, string[]> = {
  Safety: [
    'DRY_RUN',
    'ENABLE_TRADING',
    'AUTO_CONFIRM',
    'MAX_DAILY_LOSS_USD',
    'MAX_POSITION_USD',
    'MAX_SINGLE_ORDER_USD',
  ],
  'Market Maker': [
    'SPREAD',
    'MIN_SPREAD',
    'MAX_SPREAD',
    'ORDER_SIZE_USD',
    'REFRESH_INTERVAL_MS',
    'MARKET_TOKEN_IDS',
  ],
  Arbitrage: [
    'ARB_AUTO_EXECUTE',
    'ARB_MIN_PROFIT_PCT',
    'ARB_SCAN_INTERVAL_MS',
    'ARB_MAX_MARKETS',
  ],
  'Circuit Breaker': [
    'CIRCUIT_MAX_FAILURES',
    'CIRCUIT_WINDOW_MS',
    'CIRCUIT_COOLDOWN_MS',
  ],
  'Rate Limiting': [
    'RATE_LIMIT_REQUESTS_PER_SEC',
    'RATE_LIMIT_ORDERS_PER_MIN',
  ],
  Other: [
    'API_BASE_URL',
    'API_KEY',
    'JWT_TOKEN',
    'PRIVATE_KEY',
    'WALLET_MODE',
    'LOG_LEVEL',
    'DASHBOARD_PORT',
    'DASHBOARD_API_TOKEN',
  ],
};

function ConfigSection({
  title,
  keys,
  config,
}: {
  title: string;
  keys: string[];
  config: RedactedConfig;
}) {
  const entries = keys
    .filter((k) => k in config)
    .map((k) => ({ key: k, value: config[k] }));

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-300">{title}</h3>
      <div className="space-y-2">
        {entries.map(({ key, value }) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="text-gray-500">{key}</span>
            <span className="font-mono text-gray-300">
              {Array.isArray(value)
                ? value.join(', ') || '(empty)'
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { status, connected } = useBotStatus();
  const [config, setConfig] = useState<RedactedConfig | null>(null);

  useEffect(() => {
    botApi
      .getConfig()
      .then((res) => setConfig(res.config))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <ConnectionIndicator connected={connected} />
      </div>

      <ControlPanel status={status} />

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Configuration
        </h2>
        {config ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(CONFIG_GROUPS).map(([title, keys]) => (
              <ConfigSection
                key={title}
                title={title}
                keys={keys}
                config={config}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Loading configuration...
          </p>
        )}
      </div>
    </div>
  );
}
