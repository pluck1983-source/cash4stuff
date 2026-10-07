import { useCallback, type ReactNode } from 'react';
import { useAppState } from './lib/useAppState';
import { useCloudSync } from './lib/sync/useCloudSync';
import { routeHref, useIsDesktop, useRoute, type Route } from './lib/router';
import { clearLocalState, emptyState } from './lib/storage';
import { clearAllPhotos } from './lib/photos';
import { SignInScreen } from './components/SignInScreen';
import { SyncControl } from './components/SyncControl';
import { DashboardView } from './views/Dashboard';
import { PickupsView } from './views/Pickups';
import { PickupDetailView } from './views/PickupDetail';
import { AddItemView } from './views/AddItem';
import { StockView } from './views/Stock';
import { ItemDetailView } from './views/ItemDetail';
import { MoneyView } from './views/Money';
import { SettingsView } from './views/Settings';
import { FinanceView } from './views/Finance';

type Section = 'dashboard' | 'pickups' | 'add' | 'stock' | 'money' | 'finance' | 'settings';

function sectionOf(route: Route): Section {
  switch (route.name) {
    case 'pickup':
      return 'pickups';
    case 'add-item':
      return 'add';
    case 'item':
      return 'stock';
    default:
      return route.name;
  }
}

const NAV: { section: Section; label: string; href: string; icon: ReactNode }[] = [
  { section: 'dashboard', label: 'Home', href: routeHref({ name: 'dashboard' }), icon: <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" /> },
  { section: 'pickups', label: 'Pickups', href: routeHref({ name: 'pickups' }), icon: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01" /> },
  { section: 'add', label: 'Add', href: routeHref({ name: 'add-item', pickupId: null }), icon: <path d="M12 5v14M5 12h14" /> },
  { section: 'stock', label: 'Stock', href: routeHref({ name: 'stock' }), icon: <path d="M4 7h16M4 12h16M4 17h16M8 4v16" /> },
  { section: 'money', label: 'Costs', href: routeHref({ name: 'money' }), icon: <path d="M17 6.5A5 5 0 0 0 8 9v8M6 13h7M6 17h11" /> },
  { section: 'finance', label: 'Finance', href: routeHref({ name: 'finance' }), icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { section: 'settings', label: 'Settings', href: routeHref({ name: 'settings' }), icon: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12l2-1-1-3-2 .3-1.4-1.4L17 5l-3-1-1 2h-2L10 4 7 5l.4 2-1.5 1.4L4 8l-1 3 2 1v0l-2 1 1 3 2-.3 1.4 1.4L7 19l3 1 1-2h2l1 2 3-1-.4-2 1.5-1.4 1.9.4 1-3-2-1Z" /> },
];

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function App() {
  const { state, replaceState, actions } = useAppState();
  const sync = useCloudSync(state, replaceState);
  const route = useRoute();
  const isDesktop = useIsDesktop();

  const signOut = useCallback(
    async (wipeDevice: boolean) => {
      await sync.disconnect();
      if (wipeDevice) {
        clearLocalState();
        await clearAllPhotos().catch(() => {});
        replaceState(emptyState());
      }
    },
    [sync, replaceState],
  );

  // Google sign-in is the way in. Builds without a client ID (local dev) skip
  // it and keep data on the device only.
  if (sync.status === 'off') {
    return <SignInScreen status={sync.status} error={sync.error} onSignIn={() => void sync.connect()} />;
  }

  const section = sectionOf(route);
  let view: ReactNode;
  switch (route.name) {
    case 'dashboard':
      view = <DashboardView state={state} />;
      break;
    case 'pickups':
      view = <PickupsView state={state} actions={actions} />;
      break;
    case 'pickup':
      view = <PickupDetailView state={state} actions={actions} id={route.id} />;
      break;
    case 'add-item':
      view = <AddItemView key={route.pickupId ?? 'none'} state={state} actions={actions} pickupId={route.pickupId} />;
      break;
    case 'stock':
      view = <StockView state={state} />;
      break;
    case 'item':
      view = <ItemDetailView state={state} actions={actions} id={route.id} />;
      break;
    case 'money':
      view = <MoneyView state={state} actions={actions} />;
      break;
    case 'finance':
      view = <FinanceView state={state} actions={actions} />;
      break;
    case 'settings':
      view = (
        <SettingsView
          state={state}
          actions={actions}
          replaceState={replaceState}
          accountEmail={sync.accountEmail}
          dataOwner={sync.dataOwner}
          signedIn={sync.status !== 'unconfigured'}
          onSignOut={(wipe) => void signOut(wipe)}
        />
      );
      break;
  }

  const syncControl = (
    <SyncControl
      status={sync.status}
      lastSyncedAt={sync.lastSyncedAt}
      pendingPhotos={sync.pendingPhotos}
      error={sync.error}
      onConnect={() => void sync.connect()}
      onSyncNow={() => void sync.syncNow()}
    />
  );

  // Spelled out on screen - a tooltip can't be read on a phone.
  const syncProblem = sync.error && (sync.status === 'error' || sync.status === 'reconnect') && (
    <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
      <strong>Not syncing with Google Drive.</strong> {sync.error} Your changes are kept on this device until it works.
      <div className="mt-2">
        <button
          type="button"
          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-rose-800 dark:border-rose-800 dark:bg-rose-900 dark:text-rose-100"
          onClick={() => void (sync.status === 'reconnect' ? sync.connect() : sync.syncNow())}
        >
          {sync.status === 'reconnect' ? 'Sign in again' : 'Retry'}
        </button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex min-h-screen text-slate-900 dark:text-slate-100">
        <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <a href={routeHref({ name: 'dashboard' })} className="mb-6 flex items-center gap-2 text-lg font-semibold">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
            Cash4Stuff
          </a>
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <a
                key={n.section}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  section === n.section
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <NavIcon>{n.icon}</NavIcon>
                {n.section === 'add' ? 'Add item' : n.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto space-y-1">
            {syncControl}
            {sync.accountEmail && <div className="truncate px-2 text-xs text-slate-500" title={sync.accountEmail}>{sync.accountEmail}</div>}
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6 xl:p-8">
          {syncProblem}
          {view}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <a href={routeHref({ name: 'dashboard' })} className="flex flex-1 items-center gap-2 font-semibold">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
          Cash4Stuff
        </a>
        {syncControl}
        <a href={routeHref({ name: 'settings' })} className={`rounded-lg p-1.5 ${section === 'settings' ? 'text-emerald-700' : 'text-slate-500'}`} aria-label="Settings">
          <NavIcon>{NAV[NAV.length - 1].icon}</NavIcon>
        </a>
      </header>
      <main className="p-4">
        {syncProblem}
        {view}
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {NAV.filter((n) => n.section !== 'settings').map((n) => (
          <a
            key={n.section}
            href={n.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
              n.section === 'add'
                ? 'text-emerald-700 dark:text-emerald-400'
                : section === n.section
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {n.section === 'add' ? (
              <span className="-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg">
                <NavIcon>{n.icon}</NavIcon>
              </span>
            ) : (
              <NavIcon>{n.icon}</NavIcon>
            )}
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
