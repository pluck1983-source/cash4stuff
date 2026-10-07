import { useState } from 'react';
import type { AppState, Settings, WeightRounding } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { calculatedPickupCost } from '../lib/calc';
import { money, parseNumber } from '../lib/format';
import { downloadText, exportStateAsJson, importStateFromJson, todayIso } from '../lib/storage';
import { Button, Card, Field, Input, PageHeader, Select, TextArea } from '../components/ui';

function ListEditor({ label, values, onSave }: { label: string; values: string[]; onSave: (v: string[]) => void }) {
  const [text, setText] = useState(values.join('\n'));
  const parsed = [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))];
  const changed = parsed.join('\n') !== values.join('\n');
  return (
    <Field label={label} hint="One per line, in the order you want them shown">
      <TextArea rows={Math.min(12, Math.max(4, values.length + 1))} value={text} onChange={(e) => setText(e.target.value)} />
      {changed && (
        <Button variant="primary" className="mt-2" onClick={() => onSave(parsed)}>
          Save {label.toLowerCase()}
        </Button>
      )}
    </Field>
  );
}

export function SettingsView({
  state,
  actions,
  replaceState,
  accountEmail,
  signedIn,
  onSignOut,
}: {
  state: AppState;
  actions: AppActions;
  replaceState: (s: AppState) => void;
  accountEmail: string | null;
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
          re-prices every past pickup that doesn't have an "actually paid" amount.
        </p>
      </Card>

      <Card title="Lists">
        <div className="grid gap-4 md:grid-cols-2">
          <ListEditor label="Categories" values={settings.categories} onSave={(categories) => update({ categories })} />
          <ListEditor label="Storage areas" values={settings.storageAreas} onSave={(storageAreas) => update({ storageAreas })} />
          <ListEditor label="Sales channels" values={settings.salesChannels} onSave={(salesChannels) => update({ salesChannels })} />
          <ListEditor label="Cost types" values={settings.expenseCategories} onSave={(expenseCategories) => update({ expenseCategories })} />
        </div>
      </Card>

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
            Signed in{accountEmail ? <> as <strong>{accountEmail}</strong></> : ''}. Data syncs to a private app folder in that Google Drive.
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
