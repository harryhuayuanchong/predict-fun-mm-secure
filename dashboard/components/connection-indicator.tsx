'use client';

export function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          connected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className={connected ? 'text-green-400' : 'text-red-400'}>
        {connected ? 'Bot Connected' : 'Bot Offline'}
      </span>
    </div>
  );
}
