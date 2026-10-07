import { useState } from 'react';
import type { AppState, Expense, OtherIncome } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { PERIOD_LABELS, expensesByCategory, inPeriod, periodFor, type PeriodKey } from '../lib/calc';
import { money, parseNumber, shortDate } from '../lib/format';
import { todayIso } from '../lib/storage';
import { Button, Card, Chips, Empty, Field, Input, PageHeader, Select } from '../components/ui';

type Tab = 'costs' | 'income';

interface Draft {
  id?: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  pickupId: string;
}

function blankDraft(category: string): Draft {
  return { date: todayIso(), category, description: '', amount: '', pickupId: '' };
}

export function MoneyView({ state, actions }: { state: AppState; actions: AppActions }) {
  const [tab, setTab] = useState<Tab>('costs');
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const defaultCategory = state.settings.expenseCategories[0] ?? 'Other';
  const [draft, setDraft] = useState<Draft>(() => blankDraft(defaultCategory));
  const period = periodFor(periodKey);

  const pickups = [...state.pickups].sort((a, b) => b.date.localeCompare(a.date));
  const pickupName = (id: string | null) => (id ? (state.pickups.find((p) => p.id === id)?.reference ?? '') : '');

  const rows: (Expense | OtherIncome)[] = (tab === 'costs' ? state.expenses : state.otherIncome)
    .filter((r) => inPeriod(r.date, period))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((t, r) => t + r.amount, 0);

  function submit() {
    const amount = parseNumber(draft.amount);
    if (amount === null) return;
    const base = { date: draft.date, description: draft.description.trim(), amount, pickupId: draft.pickupId || null };
    if (tab === 'costs') actions.saveExpense({ ...base, id: draft.id, category: draft.category });
    else actions.saveIncome({ ...base, id: draft.id });
    setDraft({ ...blankDraft(draft.category), date: draft.date });
  }

  function edit(r: Expense | OtherIncome) {
    setDraft({
      id: r.id,
      date: r.date,
      category: 'category' in r ? r.category : defaultCategory,
      description: r.description,
      amount: String(r.amount),
      pickupId: r.pickupId ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div>
      <PageHeader title="Costs & income" />
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        {(['costs', 'income'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setDraft(blankDraft(defaultCategory));
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {t === 'costs' ? 'Running costs' : 'Other income'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={draft.id ? 'Edit entry' : tab === 'costs' ? 'Add a cost' : 'Add income'} className="lg:order-2">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {tab === 'costs' ? (
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</span>
                <Chips options={state.settings.expenseCategories} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">Item sales are recorded on each item. Use this for anything else - a bulk lot sold by weight, a refund, etc.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (£)">
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} required />
              </Field>
              <Field label="Date">
                <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
              </Field>
            </div>
            <Field label="Description">
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={tab === 'costs' ? 'e.g. 100 mailing bags' : ''} />
            </Field>
            <Field label="Link to pickup (optional)" hint="Counts towards that pickup's profit">
              <Select value={draft.pickupId} onChange={(e) => setDraft({ ...draft, pickupId: e.target.value })}>
                <option value="">General business</option>
                {pickups.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.reference} · {shortDate(p.date)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" className="flex-1">
                {draft.id ? 'Save' : 'Add'}
              </Button>
              {draft.id && <Button onClick={() => setDraft(blankDraft(defaultCategory))}>Cancel</Button>}
            </div>
          </form>
        </Card>

        <div className="lg:order-1 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Select value={periodKey} onChange={(e) => setPeriodKey(e.target.value as PeriodKey)} className="w-auto">
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
                <option key={k} value={k}>
                  {PERIOD_LABELS[k]}
                </option>
              ))}
            </Select>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Total <strong className="tabular-nums">{money(total)}</strong>
            </span>
          </div>
          {tab === 'costs' && rows.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {expensesByCategory(state, period).map((c) => (
                <span key={c.category} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {c.category} <strong>{money(c.amount)}</strong>
                </span>
              ))}
            </div>
          )}
          {rows.length === 0 ? (
            <Empty>Nothing recorded for {PERIOD_LABELS[periodKey].toLowerCase()}.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => edit(r)}>
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {'category' in r ? r.category : r.description || 'Income'}
                      {'category' in r && r.description && <span className="font-normal text-slate-500"> · {r.description}</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {shortDate(r.date)}
                      {r.pickupId && ` · ${pickupName(r.pickupId)}`}
                    </div>
                  </button>
                  <span className="tabular-nums text-sm font-semibold">{money(r.amount)}</span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Delete"
                    onClick={() => {
                      if (window.confirm('Delete this entry?')) (tab === 'costs' ? actions.deleteExpense : actions.deleteIncome)(r.id);
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
