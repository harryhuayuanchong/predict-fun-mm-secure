'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_BOT_WS_URL || 'ws://localhost:3001';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(
    new Map()
  );

  const subscribe = useCallback(
    (event: string, handler: (data: unknown) => void) => {
      if (!listenersRef.current.has(event)) {
        listenersRef.current.set(event, new Set());
      }
      listenersRef.current.get(event)!.add(handler);
      return () => {
        listenersRef.current.get(event)?.delete(handler);
      };
    },
    []
  );

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let mounted = true;

    function connect() {
      if (!mounted) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mounted) setConnected(true);
      };

      ws.onclose = () => {
        if (mounted) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (evt) => {
        try {
          const msg: WsMessage = JSON.parse(evt.data);
          listenersRef.current
            .get(msg.event)
            ?.forEach((h) => h(msg.data));
        } catch {
          // Ignore malformed messages
        }
      };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  return { connected, subscribe };
}
