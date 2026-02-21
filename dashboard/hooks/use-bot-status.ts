'use client';

import { useState, useEffect } from 'react';
import { botApi } from '@/lib/api-client';
import { useWebSocket } from './use-websocket';
import type { BotStatus } from '@/lib/types';

export function useBotStatus() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { connected, subscribe } = useWebSocket();

  // Initial fetch + periodic refresh
  useEffect(() => {
    const fetchStatus = () => {
      botApi
        .getStatus()
        .then(setStatus)
        .catch((e) => setError(e.message));
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Live updates from WebSocket
  useEffect(() => {
    const unsubs = [
      subscribe('mm:status', (data) => {
        const d = data as BotStatus['mm'];
        setStatus((prev) =>
          prev ? { ...prev, mm: d } : prev
        );
      }),
      subscribe('risk:kill_switch', (data) => {
        const d = data as { active: boolean };
        setStatus((prev) =>
          prev
            ? { ...prev, risk: { ...prev.risk, killed: d.active } }
            : prev
        );
      }),
      subscribe('risk:pnl', (data) => {
        const d = data as { dailyPnl: number };
        setStatus((prev) =>
          prev
            ? { ...prev, risk: { ...prev.risk, dailyPnl: d.dailyPnl } }
            : prev
        );
      }),
      subscribe('risk:circuit_breaker', (data) => {
        const d = data as { isOpen: boolean };
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                risk: { ...prev.risk, circuitBreakerOpen: d.isOpen },
              }
            : prev
        );
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe]);

  return { status, error, connected };
}
