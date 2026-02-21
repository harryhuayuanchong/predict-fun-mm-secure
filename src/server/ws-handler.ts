/**
 * WebSocket event broadcasting.
 * Forwards all botEmitter events to connected WebSocket clients.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { botEmitter, type BotEventName } from '../events/emitter.js';

const BROADCAST_EVENTS: BotEventName[] = [
  'mm:quote',
  'mm:order:placed',
  'mm:order:cancelled',
  'mm:cycle',
  'mm:status',
  'arb:scan',
  'arb:opportunity',
  'risk:pnl',
  'risk:circuit_breaker',
  'risk:kill_switch',
  'system:started',
  'system:stopped',
  'system:error',
];

export function setupWebSocket(wss: WebSocketServer): void {
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  for (const eventName of BROADCAST_EVENTS) {
    botEmitter.onBot(eventName, (data) => {
      const msg = JSON.stringify({
        event: eventName,
        data,
        timestamp: Date.now(),
      });

      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    });
  }
}
