'use client';

import { useState } from 'react';
import { botApi } from '@/lib/api-client';
import type { BotStatus } from '@/lib/types';

export function ControlPanel({ status }: { status: BotStatus | null }) {
  const [loading, setLoading] = useState('');
  const [confirmKill, setConfirmKill] = useState(false);

  const mmRunning = status?.mm?.running ?? false;
  const killed = status?.risk.killed ?? false;

  async function handleAction(action: () => Promise<unknown>, label: string) {
    setLoading(label);
    try {
      await action();
    } catch (err) {
      console.error(`Action failed: ${label}`, err);
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Controls</h2>

      <div className="space-y-3">
        {/* MM Start/Stop */}
        <div className="flex gap-2">
          <button
            onClick={() =>
              handleAction(() => botApi.startBot('mm'), 'start-mm')
            }
            disabled={mmRunning || loading === 'start-mm'}
            className="flex-1 rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === 'start-mm' ? 'Starting...' : 'Start MM'}
          </button>
          <button
            onClick={() =>
              handleAction(() => botApi.stopBot('mm'), 'stop-mm')
            }
            disabled={!mmRunning || loading === 'stop-mm'}
            className="flex-1 rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === 'stop-mm' ? 'Stopping...' : 'Stop MM'}
          </button>
        </div>

        {/* Arb Start/Stop */}
        <div className="flex gap-2">
          <button
            onClick={() =>
              handleAction(() => botApi.startBot('arb'), 'start-arb')
            }
            disabled={loading === 'start-arb'}
            className="flex-1 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === 'start-arb' ? 'Starting...' : 'Start Arb'}
          </button>
          <button
            onClick={() =>
              handleAction(() => botApi.stopBot('arb'), 'stop-arb')
            }
            disabled={loading === 'stop-arb'}
            className="flex-1 rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === 'stop-arb' ? 'Stopping...' : 'Stop Arb'}
          </button>
        </div>

        {/* Kill Switch */}
        {!killed ? (
          confirmKill ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  handleAction(() => botApi.killSwitch(), 'kill');
                  setConfirmKill(false);
                }}
                className="flex-1 rounded bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
              >
                Confirm Kill
              </button>
              <button
                onClick={() => setConfirmKill(false)}
                className="flex-1 rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmKill(true)}
              className="w-full rounded border border-red-700 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/60"
            >
              Kill Switch
            </button>
          )
        ) : (
          <button
            onClick={() =>
              handleAction(() => botApi.resetKillSwitch(), 'reset')
            }
            disabled={loading === 'reset'}
            className="w-full rounded bg-yellow-700 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
          >
            {loading === 'reset' ? 'Resetting...' : 'Reset Kill Switch'}
          </button>
        )}
      </div>
    </div>
  );
}
