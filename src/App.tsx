import { useCallback, useMemo, type ReactNode } from 'react';
import { useAppState } from './lib/useAppState';
import { useCloudSync } from './lib/sync/useCloudSync';
import { routeHref, useIsDesktop, useRoute, type Route } from './lib/router';
import { clearLocalState, emptyState } from './lib/storage';
import { clearAllPhotos } from './lib/photos';
import { SignInScreen } from './components/SignInScreen';
import { SyncControl } from './components/SyncControl';
import { Wordmark } from './components/Wordmark';
import { DashboardView } from './views/Dashboard';
import { PickupsView } from './views/Pickups';
import { PickupDetailView } from './views/PickupDetail';
import { AddItemView } from './views/AddItem';
import { BulkAddView } from './views/BulkAdd';
import { StockView } from './views/Stock';
import { ItemDetailView } from './views/ItemDetail';
import { MoneyView } from './views/Money';
import { SettingsView } from './views/Settings';
import { FinanceView } from './views/Finance';
import { liveState } from './lib/audit';
import { BottomTabs, NAV, NavIcon, TAB_SECTIONS, type Section } from './components/Nav';
import { useNavOrder } from './lib/navOrder';
import { useToast } from './lib/toast';
import { AdminView } from './views/Admin';
import { DiaryView } from './views/Diary';
import { TripBar } from './components/TripBar';


function sectionOf(route: Route): Section {
  switch (route.name) {
    case 'pickup':
      return 'pickups';
    case 'add-item':
    case 'add-photos':
      return 'add';
    case 'item':
      return 'stock';
    default:
      return route.name;
  }
}

export default function App() {
  const { state: books, replaceState, actions } = useAppState();
  const sync = useCloudSync(books, replaceState);
  // Voided purchases, costs and income stay in the books but out of every total.
  const state = useMemo(() => liveState(books), [books]);
  const tabOrder = useNavOrder(TAB_SECTIONS);
  const tabs = tabOrder.map((sec) => NAV.find((n) => n.section === sec)!);
  const route = useRoute();
  const isDesktop = useIsDesktop();
  const toastMessage = useToast();

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
      view = <PickupsView state={state} books={books} actions={actions} />;
      break;
    case 'diary':
      view = <DiaryView state={state} actions={actions} />;
      break;
    case 'pickup':
      view = <PickupDetailView state={state} books={books} actions={actions} id={route.id} />;
      break;
    case 'add-item':
      view = <AddItemView key={route.pickupId ?? 'none'} state={state} actions={actions} pickupId={route.pickupId} />;
      break;
    case 'add-photos':
      view = <BulkAddView key={route.pickupId ?? 'none'} state={state} actions={actions} pickupId={route.pickupId} />;
      break;
    case 'stock':
      view = <StockView state={state} />;
      break;
    case 'item':
      view = <ItemDetailView state={state} actions={actions} id={route.id} />;
      break;
    case 'money':
      view = <MoneyView state={state} books={books} actions={actions} />;
      break;
    case 'finance':
      view = <FinanceView state={state} books={books} actions={actions} />;
      break;
    case 'admin':
      view = <AdminView state={state} actions={actions} />;
      break;
    case 'settings':
      view = (
        <SettingsView
          state={books}
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
    <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <strong>Not syncing with Google Drive.</strong> {sync.error} Your changes are kept on this device until it works.
      <div className="mt-2">
        <button
          type="button"
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-800 dark:border-red-800 dark:bg-red-900 dark:text-red-100"
          onClick={() => void (sync.status === 'reconnect' ? sync.connect() : sync.syncNow())}
        >
          {sync.status === 'reconnect' ? 'Sign in again' : 'Retry'}
        </button>
      </div>
    </div>
  );

  const toast = toastMessage && (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabs-h)+1rem)] z-50 flex justify-center px-4 lg:bottom-6 lg:left-56"
    >
      <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">{toastMessage}</div>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="flex min-h-screen text-slate-900 dark:text-slate-100">
        <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <a href={routeHref({ name: 'dashboard' })} className="mb-6 flex items-center gap-2" aria-label="Wardrobe to Wallet - home">
            <Wordmark className="text-xl" />
          </a>
          <nav className="flex flex-col gap-1">
            {[...tabs, NAV.find((n) => n.section === 'settings')!].map((n) => (
              <a
                key={n.section}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  section === n.section
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
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
          <div className="sticky top-0 z-30 mb-3 empty:hidden">
            <TripBar actions={actions} />
          </div>
          {syncProblem}
          {view}
        </main>
        {toast}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[calc(var(--tabs-h)+1rem)] text-slate-900 dark:text-slate-100">
      <div className="sticky-safe sticky top-0 z-20 bg-white/95 backdrop-blur dark:bg-slate-900/95">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <a href={routeHref({ name: 'dashboard' })} className="flex min-w-0 flex-1 items-center" aria-label="Wardrobe to Wallet - home">
          <Wordmark className="text-xl" />
        </a>
        {syncControl}
        <a href={routeHref({ name: 'settings' })} className={`rounded-lg p-1.5 ${section === 'settings' ? 'text-brand-700' : 'text-slate-500'}`} aria-label="Settings">
          <NavIcon>{NAV.find((n) => n.section === 'settings')!.icon}</NavIcon>
        </a>
      </header>
      <TripBar actions={actions} />
      </div>
      <main className="p-4">
        {syncProblem}
        {view}
      </main>
      <BottomTabs tabs={tabs} section={section} />
      {toast}
    </div>
  );
}
