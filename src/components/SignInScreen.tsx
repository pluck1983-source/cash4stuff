import type { SyncStatus } from '../lib/sync/useCloudSync';

export function SignInScreen({ status, error, onSignIn }: { status: SyncStatus; error: string | null; onSignIn: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Cash4Stuff</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Pickups, stock, sales and running costs. Sign in with Google to keep everything synced between your phone and computer.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          disabled={status === 'syncing'}
          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {status === 'syncing' ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          Everything is kept in a Cash4Stuff folder in the business owner's Google Drive. Helpers sign in with their own Google account once the owner has shared that folder with them.
        </p>
      </div>
    </div>
  );
}
