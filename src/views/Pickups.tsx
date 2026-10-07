import { useState } from 'react';
import type { AppState, Pickup } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { calculatedPickupCost, pickupStats, roundWeight } from '../lib/calc';
import { kg, money, parseNumber, percent, shortDate } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { todayIso } from '../lib/storage';
import { Button, Card, Empty, Field, Input, PageHeader, TextArea } from '../components/ui';

export function PickupForm({
  state,
  initial,
  onSave,
  onCancel,
}: {
  state: AppState;
  initial?: Pickup;
  onSave: (data: Omit<Pickup, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}) {
  const { settings } = state;
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const [override, setOverride] = useState(initial?.costOverride != null ? String(initial.costOverride) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const weightKg = parseNumber(weight) ?? 0;
  const rounded = roundWeight(weightKg, settings.weightStepKg, settings.weightRounding);
  const calculated = calculatedPickupCost(weightKg, settings);
  const overrideValue = parseNumber(override);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          date,
          reference: reference.trim() || `Pickup ${shortDate(date)}`,
          weightKg,
          costOverride: overrideValue,
          notes: notes.trim(),
        });
      }}
    >
      <Field label="Who / where" hint="A name, an address or just a reference - whatever helps you recognise it later">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Sarah, 12 High St" autoFocus={!initial} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Weight (kg)">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.0" />
        </Field>
      </div>
      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        {weightKg > 0 ? (
          <>
            {kg(weightKg)} → <strong>{kg(rounded)}</strong> × {money(settings.costPerKg)}/kg = <strong>{money(calculated)}</strong>
          </>
        ) : (
          <>Enter the weight to see what to pay ({money(settings.costPerKg)}/kg, rounded to {settings.weightStepKg} kg)</>
        )}
      </div>
      <Field label="Actually paid (optional)" hint="Only if you paid something other than the calculated amount">
        <Input type="number" inputMode="decimal" step="0.01" min="0" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={money(calculated)} />
      </Field>
      <Field label="Notes">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1">
          {initial ? 'Save pickup' : 'Save & add items'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function PickupsView({ state, actions }: { state: AppState; actions: AppActions }) {
  const [adding, setAdding] = useState(state.pickups.length === 0);
  const pickups = [...state.pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

  return (
    <div>
      <PageHeader
        title="Pickups"
        actions={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              + New pickup
            </Button>
          )
        }
      />
      {adding && (
        <Card className="mb-4" title="New pickup">
          <PickupForm
            state={state}
            onCancel={() => setAdding(false)}
            onSave={(data) => {
              const pickup = actions.addPickup(data);
              setAdding(false);
              navigate({ name: 'add-item', pickupId: pickup.id });
            }}
          />
        </Card>
      )}
      {pickups.length === 0 && !adding ? (
        <Empty>No pickups yet.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pickups.map((p) => {
            const s = pickupStats(state, p);
            return (
              <a
                key={p.id}
                href={routeHref({ name: 'pickup', id: p.id })}
                className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-slate-50">{p.reference}</div>
                    <div className="text-xs text-slate-500">
                      {shortDate(p.date)} · {kg(p.weightKg)} · cost {money(s.totalCost)}
                    </div>
                  </div>
                  <div className={`text-right text-sm font-semibold tabular-nums ${s.realisedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {money(s.realisedProfit)}
                    <div className="text-xs font-normal text-slate-500">{percent(s.roi)} ROI</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full bg-emerald-500" style={{ width: `${s.itemCount ? (s.soldCount / s.itemCount) * 100 : 0}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                  <span>
                    {s.soldCount}/{s.itemCount} sold
                  </span>
                  <span>{money(s.heldListValue)} still listed</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
