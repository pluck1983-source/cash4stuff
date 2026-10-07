import type { SyncStatus } from '../lib/sync/useCloudSync';

interface Props {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingPhotos: number;
  error: string | null;
  onConnect: () => void;
  onSyncNow: () => void;
}

/** Compact sync indicator for the header - sign-out lives in Settings */
export function SyncControl({ status, lastSyncedAt, pendingPhotos, error, onConnect, onSyncNow }: Props) {
  if (status === 'unconfigured') {
    return <span className="text-xs text-amber-600 dark:text-amber-400" title="Built without a Google client ID - data stays on this device only">Local only</span>;
  }
  if (status === 'off') return null;

  if (status === 'reconnect') {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="whitespace-nowrap rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-700 hover:border-amber-500 dark:border-amber-800 dark:text-amber-400"
        title="Google sign-in has expired - changes are kept on this device until you reconnect"
      >
        Reconnect Google
      </button>
    );
  }

  const dot = status === 'syncing' ? 'bg-sky-500 animate-pulse' : status === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
  const label =
    status === 'syncing'
      ? pendingPhotos > 0
        ? `Uploading ${pendingPhotos} photo${pendingPhotos === 1 ? '' : 's'}…`
        : 'Syncing…'
      : status === 'error'
        ? 'Sync failed - retry'
        : lastSyncedAt
          ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
          : 'Synced';

  return (
    <button
      type="button"
      onClick={onSyncNow}
      disabled={status === 'syncing'}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      title={status === 'error' && error ? error : 'Saved to Google Drive - tap to sync now'}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </button>
  );
}
