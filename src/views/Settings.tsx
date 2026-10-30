import { useState } from 'react';
import type { AppState, Settings, WeightRounding } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { calculatedPickupCost } from '../lib/calc';
import { money, parseNumber } from '../lib/format';
import { downloadText, exportStateAsJson, importStateFromJson, todayIso } from '../lib/storage';
import { routeHref } from '../lib/router';
import { NAV, NavIcon, TAB_SECTIONS } from '../components/Nav';
import { saveNavOrder, useNavOrder } from '../lib/navOrder';
import { Button, Card, Field, Input, PageHeader, Select, TextArea } from '../components/ui';
import { PhotoAiSettings } from '../components/PhotoAiSettings';

export function SettingsView({
  state,
  actions,
  replaceState,
  accountEmail,
  dataOwner,
  signedIn,
  onSignOut,
}: {
  state: AppState;
  actions: AppActions;
  replaceState: (s: AppState) => void;
  accountEmail: string | null;
  dataOwner: string | null;
  signedIn: boolean;
  onSignOut: (wipeDevice: boolean) => void;
}) {
  const { settings } = state;
  const [rate, setRate] = useState(String(settings.costPerKg));
  const [step, setStep] = useState(String(settings.weightStepKg));
  const update = (patch: Partial<Settings>) => actions.updateSettings({ ...settings, ...patch });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" />

      <Card title="Buying price">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price per kg (£)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={() => {
                const v = parseNumber(rate);
                if (v !== null && v !== settings.costPerKg) update({ costPerKg: v });
              }}
            />
          </Field>
          <Field label="Round weight to (kg)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={step}
              onChange={(e) => setStep(e.target.value)}
              onBlur={() => {
                const v = parseNumber(step);
                if (v !== null && v !== settings.weightStepKg) update({ weightStepKg: v });
              }}
            />
          </Field>
          <Field label="Rounding">
            <Select value={settings.weightRounding} onChange={(e) => update({ weightRounding: e.target.value as WeightRounding })}>
              <option value="nearest">To nearest</option>
              <option value="up">Always up</option>
              <option value="down">Always down</option>
              <option value="none">Don't round</option>
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Example: 12.3 kg costs {money(calculatedPickupCost(12.3, settings))}, 12.8 kg costs {money(calculatedPickupCost(12.8, settings))}. Changing this
          only affects new pickups - each pickup keeps the rate and cost it was bought at.
        </p>
      </Card>

      <Card title="Repeat customers">
        <p className="mb-3 text-sm text-slate-500">
          A customer's pickups are grouped together, and items are logged to the customer. When a new pickup comes at least this long after their last one, with only
          this many of their items left to sell, you'll be asked whether to start a new group so its costs and profit are counted separately.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="Days since last pickup">
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              defaultValue={settings.newGroupAfterDays}
              onBlur={(e) => {
                const v = parseNumber(e.target.value);
                if (v !== null && v >= 0 && v !== settings.newGroupAfterDays) update({ newGroupAfterDays: Math.round(v) });
              }}
            />
          </Field>
          <Field label="Items left at most">
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              defaultValue={settings.newGroupItemsLeft}
              onBlur={(e) => {
                const v = parseNumber(e.target.value);
                if (v !== null && v >= 0 && v !== settings.newGroupItemsLeft) update({ newGroupItemsLeft: Math.round(v) });
              }}
            />
          </Field>
        </div>
      </Card>

      <TabOrderCard />

      <Card title="Purchase receipts">
        <p className="mb-3 text-sm text-slate-500">Printed at the top of the receipt the seller signs.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Business name">
            <Input value={settings.businessName} onChange={(e) => update({ businessName: e.target.value })} placeholder="e.g. Wardrobe to Wallet" />
          </Field>
          <Field label="Your name">
            <Input value={settings.traderName} onChange={(e) => update({ traderName: e.target.value })} />
          </Field>
          <Field label="Address / phone" className="md:col-span-2">
            <TextArea value={settings.businessAddress} onChange={(e) => update({ businessAddress: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title="Lists">
        <p className="text-sm text-slate-500">
          Stock categories, cost types, storage areas and selling sites are managed on the{' '}
          <a href={routeHref({ name: 'admin' })} className="font-medium text-brand-700 underline dark:text-brand-400">
            Admin tab
          </a>
          .
        </p>
      </Card>

      <PhotoAiSettings />

      <Card title="Backup">
        <p className="mb-3 text-sm text-slate-500">
          Everything except photos, as one file. Photos are backed up in Google Drive when you're signed in.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadText(`cash4stuff-backup-${todayIso()}.json`, exportStateAsJson(state), 'application/json')}>Download backup</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
            Restore from backup…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const next = importStateFromJson(await file.text());
                  if (window.confirm(`Replace everything on this device with this backup (${next.items.length} items, ${next.pickups.length} pickups)?`)) {
                    // Restamp so the restored copy wins over the cloud copy when they merge.
                    const now = new Date().toISOString();
                    replaceState({
                      ...next,
                      settingsUpdatedAt: now,
                      pickups: next.pickups.map((p) => ({ ...p, updatedAt: now })),
                      items: next.items.map((i) => ({ ...i, updatedAt: now })),
                      expenses: next.expenses.map((x) => ({ ...x, updatedAt: now })),
                      otherIncome: next.otherIncome.map((x) => ({ ...x, updatedAt: now })),
                    });
                  }
                } catch (err) {
                  window.alert(`That file couldn't be read: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
            />
          </label>
        </div>
      </Card>

      {signedIn && (
        <Card title="Account">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            Signed in{accountEmail ? <> as <strong>{accountEmail}</strong></> : ''}. Data syncs to the <strong>Wardrobe to Wallet</strong> folder in{' '}
            {dataOwner && dataOwner !== accountEmail ? <strong>{dataOwner}</strong> : 'this account'}'s Google Drive.
          </p>
          <p className="mb-3 text-sm text-slate-500">
            To let someone else use the app: in Google Drive, share the Wardrobe to Wallet folder with their Google account as <strong>Editor</strong>. Their address also
            has to be added as a test user on the app's Google sign-in setup. Unshare the folder to remove their access.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (window.confirm('Sign out? Your data stays on this device and in Google Drive.')) onSignOut(false);
              }}
            >
              Sign out
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Sign out and remove all data and photos from THIS device? Anything not yet synced to Google Drive will be lost. Use this on a shared or borrowed device.'))
                  onSignOut(true);
              }}
            >
              Sign out & clear this device
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Which tabs sit in the first five on a phone - the rest are a swipe away. Saved on this device. */
function TabOrderCard() {
  const order = useNavOrder(TAB_SECTIONS);
  const move = (i: number, by: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    saveNavOrder(next);
  };
  return (
    <Card title="Bottom tabs (phone)">
      <p className="mb-3 text-sm text-slate-500">The first five show without swiping. Swipe the tab bar sideways for the rest. Saved on this device.</p>
      <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {order.map((section, i) => {
          const tab = NAV.find((n) => n.section === section)!;
          return (
            <li key={section} className={`flex items-center gap-3 px-3 py-2 ${i === 5 ? 'border-t-2 border-dashed border-slate-300 dark:border-slate-600' : ''}`}>
              <span className="w-4 text-xs tabular-nums text-slate-400">{i + 1}</span>
              <NavIcon>{tab.icon}</NavIcon>
              <span className="flex-1 text-sm">{tab.section === 'add' ? 'Add item' : tab.label}</span>
              <button type="button" className="rounded-md px-2 py-1 text-slate-500 disabled:opacity-30" disabled={i === 0} aria-label={`Move ${tab.label} up`} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="rounded-md px-2 py-1 text-slate-500 disabled:opacity-30" disabled={i === order.length - 1} aria-label={`Move ${tab.label} down`} onClick={() => move(i, 1)}>
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      <Button className="mt-3" onClick={() => saveNavOrder(null)}>
        Reset to default order
      </Button>
    </Card>
  );
}
