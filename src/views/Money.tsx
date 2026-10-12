import { useState } from 'react';
import type { AppState, Expense, IncomeKind, OtherIncome, PaymentMethod, RecurringCost, RecurringFrequency } from '../lib/types';
import { paymentLabel } from '../lib/audit';
import { PaymentChips, VoidedNote, askVoidReason } from '../components/Records';
import { describeRecurring, nextPayment } from '../lib/recurring';
import type { AppActions } from '../lib/useAppState';
import { PERIOD_LABELS, expensesByCategory, inPeriod, periodFor, type PeriodKey } from '../lib/calc';
import { money, parseNumber, shortDate } from '../lib/format';
import { newId, todayIso } from '../lib/storage';
import { compressImage, savePhoto } from '../lib/photos';
import { Photo } from '../components/Photo';
import { SplitReceipt } from '../components/SplitReceipt';
import { blankLine, businessTotal, type ReceiptLine } from '../lib/receiptLines';
import { Button, Card, Chips, Empty, Field, Input, PageHeader, Select } from '../components/ui';

type Tab = 'costs' | 'income';
type Repeat = 'once' | RecurringFrequency;

interface Draft {
  id?: string;
  /** Editing a repeating cost rather than a single entry */
  planId?: string;
  recurringId?: string | null;
  date: string;
  category: string;
  description: string;
  amount: string;
  pickupId: string;
  repeat: Repeat;
  endDate: string;
  introAmount: string;
  introPeriods: string;
  paymentMethod: PaymentMethod;
  kind: IncomeKind;
  buyer: string;
  weight: string;
  rate: string;
  attachmentIds: string[];
}

const WEIGHED: IncomeKind[] = ['rag', 'charity'];

/** The type last given to a receipt line - shop receipts are usually the same sort of thing */
const SPLIT_CATEGORY_KEY = 'cash4stuff-split-category';

function rateKey(kind: IncomeKind) {
  return `cash4stuff-rate-${kind}`;
}

/** Last £/kg used for rag or charity weigh-outs (they're usually the same) */
function lastRate(kind: IncomeKind): string {
  return localStorage.getItem(rateKey(kind)) ?? WEIGHED.map((k) => localStorage.getItem(rateKey(k))).find(Boolean) ?? '';
}

function blankDraft(category: string): Draft {
  return { date: todayIso(), category, description: '', amount: '', pickupId: '', repeat: 'once', endDate: '', introAmount: '', introPeriods: '', paymentMethod: '', kind: 'rag', buyer: '', weight: '', rate: lastRate('rag'), attachmentIds: [] };
}

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = { rag: 'Rag merchant', charity: 'Charity bins', bulk: 'Bulk lot', other: 'Other' };

const REPEAT_LABELS: Record<Repeat, string> = { once: 'One-off', weekly: 'Weekly', monthly: 'Monthly' };

export function MoneyView({ state, books, actions }: { state: AppState; books: AppState; actions: AppActions }) {
  const [tab, setTab] = useState<Tab>('costs');
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const defaultCategory = state.settings.expenseCategories[0] ?? 'Other';
  const [draft, setDraft] = useState<Draft>(() => blankDraft(defaultCategory));
  /** Set while a receipt is being entered line by line */
  const [lines, setLines] = useState<ReceiptLine[] | null>(null);
  const period = periodFor(periodKey);

  const pickups = [...state.pickups].sort((a, b) => b.date.localeCompare(a.date));
  const pickupName = (id: string | null) => (id ? (state.pickups.find((p) => p.id === id)?.reference ?? '') : '');

  // Voided entries stay listed (crossed out) so the record is complete, but don't count.
  const rows: (Expense | OtherIncome)[] = (tab === 'costs' ? books.expenses : books.otherIncome)
    .filter((r) => inPeriod(r.date, period))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((t, r) => t + (r.voidedAt === null ? r.amount : 0), 0);

  const repeating = tab === 'costs' && draft.repeat !== 'once';
  const per = draft.repeat === 'weekly' ? 'week' : 'month';

  function submit() {
    if (lines && tab === 'costs') {
      const shop = draft.description.trim();
      const kept = lines.filter((l) => l.include && parseNumber(l.amount) !== null);
      if (kept.length === 0) return;
      // Each business line is its own cost (so it lands under its own type), sharing the receipt photo.
      for (const l of kept) {
        const what = l.description.trim();
        actions.saveExpense({
          date: draft.date,
          description: [shop, what].filter(Boolean).join(': '),
          amount: parseNumber(l.amount) ?? 0,
          pickupId: draft.pickupId || null,
          category: l.category,
          recurringId: null,
          paymentMethod: draft.paymentMethod,
          attachmentIds: draft.attachmentIds,
        });
      }
      try {
        localStorage.setItem(SPLIT_CATEGORY_KEY, kept[kept.length - 1].category);
      } catch {
        // Remembering is a convenience only.
      }
      setLines(null);
      setDraft({ ...blankDraft(draft.category), date: draft.date });
      return;
    }
    const amount = parseNumber(draft.amount);
    if (amount === null) return;
    const base = { date: draft.date, description: draft.description.trim(), amount, pickupId: draft.pickupId || null };
    if (repeating) {
      const introAmount = parseNumber(draft.introAmount);
      const introPeriods = Math.max(0, Math.floor(parseNumber(draft.introPeriods) ?? 0));
      actions.saveRecurring({
        id: draft.planId,
        category: draft.category,
        description: base.description,
        amount,
        frequency: draft.repeat as RecurringFrequency,
        startDate: draft.date,
        endDate: draft.endDate || null,
        introAmount: introAmount !== null && introPeriods > 0 ? introAmount : null,
        introPeriods: introAmount !== null ? introPeriods : 0,
        pickupId: base.pickupId,
      });
      setDraft(blankDraft(draft.category));
      return;
    }
    if (tab === 'costs')
      actions.saveExpense({ ...base, id: draft.id, category: draft.category, recurringId: draft.recurringId ?? null, paymentMethod: draft.paymentMethod, attachmentIds: draft.attachmentIds });
    else {
      if (WEIGHED.includes(draft.kind) && draft.rate) localStorage.setItem(rateKey(draft.kind), draft.rate);
      actions.saveIncome({ ...base, id: draft.id, kind: draft.kind, buyer: draft.buyer.trim(), weightKg: parseNumber(draft.weight), paymentMethod: draft.paymentMethod });
    }
    setDraft({ ...blankDraft(draft.category), date: draft.date });
  }

  function edit(r: Expense | OtherIncome) {
    setLines(null);
    setDraft({
      ...blankDraft(defaultCategory),
      id: r.id,
      recurringId: 'recurringId' in r ? r.recurringId : null,
      date: r.date,
      category: 'category' in r ? r.category : defaultCategory,
      description: r.description,
      amount: String(r.amount),
      pickupId: r.pickupId ?? '',
      paymentMethod: r.paymentMethod,
      ...('kind' in r ? { kind: r.kind, buyer: r.buyer, weight: r.weightKg !== null ? String(r.weightKg) : '', rate: '' } : { attachmentIds: r.attachmentIds }),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editPlan(plan: RecurringCost) {
    setLines(null);
    setDraft({
      planId: plan.id,
      date: plan.startDate,
      category: plan.category,
      description: plan.description,
      amount: String(plan.amount),
      pickupId: plan.pickupId ?? '',
      repeat: plan.frequency,
      endDate: plan.endDate ?? '',
      introAmount: plan.introAmount !== null ? String(plan.introAmount) : '',
      introPeriods: plan.introPeriods ? String(plan.introPeriods) : '',
      paymentMethod: '',
      kind: 'rag',
      buyer: '',
      weight: '',
      rate: '',
      attachmentIds: [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Weight x rate fills in the amount for rag and charity weigh-outs (it can still be overtyped) */
  function weighOut(weight: string, rate: string) {
    const w = parseNumber(weight);
    const r = parseNumber(rate);
    const amount = WEIGHED.includes(draft.kind) && w !== null && r !== null ? (Math.round(w * r * 100) / 100).toFixed(2) : draft.amount;
    setDraft({ ...draft, weight, rate, amount });
  }

  async function attach(files: FileList | null) {
    if (!files?.length) return;
    const ids: string[] = [];
    for (const file of Array.from(files)) {
      const id = newId();
      await savePhoto(id, await compressImage(file), false);
      ids.push(id);
    }
    setDraft((d) => ({ ...d, attachmentIds: [...d.attachmentIds, ...ids] }));
  }

  const editing = Boolean(draft.id || draft.planId);
  const lastSplit = (() => {
    try {
      return localStorage.getItem(SPLIT_CATEGORY_KEY);
    } catch {
      return null;
    }
  })();
  const splitCategory = lastSplit && state.settings.expenseCategories.includes(lastSplit) ? lastSplit : draft.category;
  const keptCount = lines ? lines.filter((l) => l.include && parseNumber(l.amount) !== null).length : 0;
  const plans = [...state.recurring].sort((a, b) => a.category.localeCompare(b.category));

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
              setLines(null);
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {t === 'costs' ? 'Running costs' : 'Other income'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={draft.planId ? 'Edit repeating cost' : draft.id ? 'Edit entry' : tab === 'costs' ? 'Add a cost' : 'Add income'} className="min-w-0 lg:order-2">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {tab === 'costs' && lines ? null : tab === 'costs' ? (
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</span>
                <Chips grid options={state.settings.expenseCategories} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500">Item sales are recorded on each item. Use this for unsellable stock sold to a rag merchant, a bulk lot sold by weight, or anything else.</p>
                <div>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</span>
                  <Chips
                    options={Object.values(INCOME_KIND_LABELS)}
                    value={INCOME_KIND_LABELS[draft.kind]}
                    onChange={(label) => {
                      const kind = (Object.keys(INCOME_KIND_LABELS) as IncomeKind[]).find((k) => INCOME_KIND_LABELS[k] === label) ?? 'other';
                      setDraft({ ...draft, kind, rate: draft.rate || lastRate(kind) });
                    }}
                  />
                </div>
                <Field label="Who paid">
                  <Input
                    value={draft.buyer}
                    onChange={(e) => setDraft({ ...draft, buyer: e.target.value })}
                    placeholder={draft.kind === 'rag' ? 'e.g. ABC Textiles' : draft.kind === 'charity' ? 'e.g. the charity bin company' : ''}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={WEIGHED.includes(draft.kind) ? 'Weight (kg)' : 'Weight (kg, optional)'}>
                    <Input type="number" inputMode="decimal" step="0.01" min="0" value={draft.weight} onChange={(e) => weighOut(e.target.value, draft.rate)} />
                  </Field>
                  {WEIGHED.includes(draft.kind) && (
                    <Field label="Rate (£/kg)">
                      <Input type="number" inputMode="decimal" step="0.01" min="0" value={draft.rate} onChange={(e) => weighOut(draft.weight, e.target.value)} />
                    </Field>
                  )}
                </div>
              </>
            )}
            {tab === 'costs' && !draft.id && !lines && (
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Repeats</span>
                <Chips
                  options={Object.values(REPEAT_LABELS)}
                  value={REPEAT_LABELS[draft.repeat]}
                  onChange={(label) => setDraft({ ...draft, repeat: (Object.keys(REPEAT_LABELS) as Repeat[]).find((k) => REPEAT_LABELS[k] === label) ?? 'once' })}
                />
              </div>
            )}
            {tab === 'costs' && !draft.id && !repeating && (
              <button
                type="button"
                className="text-sm font-medium text-brand-700 underline dark:text-brand-300"
                onClick={() => setLines(lines ? null : [blankLine(splitCategory)])}
              >
                {lines ? 'Enter one total instead' : 'Split a receipt into lines (leave out personal items)'}
              </button>
            )}
            {lines && (
              <SplitReceipt
                lines={lines}
                onChange={setLines}
                categories={state.settings.expenseCategories}
                defaultCategory={splitCategory}
                onPhoto={async (photo) => {
                  const id = newId();
                  await savePhoto(id, photo, false);
                  setDraft((d) => ({ ...d, attachmentIds: [...d.attachmentIds, id] }));
                }}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              {lines ? (
                <Field label="Business total">
                  <div className="py-2 text-lg font-semibold tabular-nums">{money(businessTotal(lines))}</div>
                </Field>
              ) : (
              <Field label={repeating ? `Amount per ${per} (£)` : 'Amount (£)'}>
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} required />
              </Field>
              )}
              <Field label={repeating ? 'First payment' : 'Date'}>
                <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
              </Field>
            </div>
            {repeating && (
              <>
                <Field label="Last payment (optional)" hint={`Leave empty to keep posting every ${per} until you stop it`}>
                  <Input type="date" value={draft.endDate} min={draft.date} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                </Field>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Discounted start (optional)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`Rate per ${per} (£)`}>
                      <Input type="number" inputMode="decimal" step="0.01" min="0" value={draft.introAmount} onChange={(e) => setDraft({ ...draft, introAmount: e.target.value })} placeholder="e.g. 25" />
                    </Field>
                    <Field label={`How many ${per}s`}>
                      <Input type="number" inputMode="numeric" step="1" min="0" value={draft.introPeriods} onChange={(e) => setDraft({ ...draft, introPeriods: e.target.value })} placeholder="e.g. 8" />
                    </Field>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Each payment is added to your costs on its date. Changing this later only affects payments that haven't been added yet.
                </p>
              </>
            )}
            {!repeating && (
              <Field label={tab === 'costs' ? 'Paid by' : 'Paid to you by'}>
                <PaymentChips value={draft.paymentMethod} onChange={(paymentMethod) => setDraft({ ...draft, paymentMethod })} />
              </Field>
            )}
            <Field label={lines ? 'Shop / supplier' : 'Description'}>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={lines ? 'e.g. Poundland' : tab === 'costs' ? 'e.g. 100 mailing bags' : ''} />
            </Field>
            {tab === 'costs' && !repeating && (
              <Field label="Receipts & invoices (optional)" hint="Photos are kept with the cost and go in the records ZIP">
                <div className="flex flex-wrap gap-2">
                  {draft.attachmentIds.map((id) => (
                    <div key={id} className="relative">
                      <Photo id={id} alt="Receipt" className="h-20 w-16 rounded-lg" />
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-slate-900 text-xs text-white"
                        onClick={() => setDraft({ ...draft, attachmentIds: draft.attachmentIds.filter((x) => x !== id) })}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <label className="flex h-20 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-600">
                    <span className="text-xl leading-none">+</span>
                    Photo
                    <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ''))} />
                  </label>
                </div>
              </Field>
            )}
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
                {editing ? 'Save' : repeating ? `Set up ${draft.repeat} cost` : lines ? `Add ${keptCount} cost${keptCount === 1 ? '' : 's'}` : 'Add'}
              </Button>
              {editing && <Button onClick={() => setDraft(blankDraft(defaultCategory))}>Cancel</Button>}
            </div>
          </form>
        </Card>

        {tab === 'costs' && plans.length > 0 && (
          <Card title="Repeating costs" className="min-w-0 lg:order-3 lg:col-start-3">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {plans.map((plan) => {
                const next = nextPayment(plan, todayIso());
                return (
                  <li key={plan.id} className="flex items-start gap-3 py-2.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => editPlan(plan)}>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {plan.category}
                        {plan.description && <span className="font-normal text-slate-500"> · {plan.description}</span>}
                      </div>
                      <div className="text-xs text-slate-500">{describeRecurring(plan, money)}</div>
                      <div className="text-xs text-slate-500">
                        {next ? `Next ${shortDate(next.date)} · ${money(next.amount)}` : `Ended${plan.endDate ? ` ${shortDate(plan.endDate)}` : ''}`}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300"
                      onClick={() => {
                        if (!window.confirm(`Stop "${plan.description || plan.category}"? Nothing more will be added.`)) return;
                        const keep = window.confirm('Keep the payments already added to your costs?\n\nOK - keep them (they were paid)\nCancel - void them too');
                        actions.deleteRecurring(plan.id, keep);
                        if (draft.planId === plan.id) setDraft(blankDraft(defaultCategory));
                      }}
                    >
                      Stop
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <div className="min-w-0 lg:order-1 lg:col-span-2 lg:row-span-2">
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
              {rows.map((r) => {
                const voided = r.voidedAt !== null;
                return (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !voided && edit(r)} disabled={voided}>
                      <div className={`truncate text-sm font-medium text-slate-900 dark:text-slate-100 ${voided ? 'line-through opacity-60' : ''}`}>
                        {'category' in r ? r.category : INCOME_KIND_LABELS[r.kind]}
                        {'kind' in r && r.buyer && <span className="font-normal text-slate-500"> · {r.buyer}</span>}
                        {r.description && <span className="font-normal text-slate-500"> · {r.description}</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {'recurringId' in r && r.recurringId && '↻ '}
                        {shortDate(r.date)}
                        {r.paymentMethod && ` · ${paymentLabel(r.paymentMethod)}`}
                        {'attachmentIds' in r && r.attachmentIds.length > 0 && ` · 📎 ${r.attachmentIds.length}`}
                        {'kind' in r && r.weightKg !== null && ` · ${r.weightKg} kg`}
                        {r.pickupId && ` · ${pickupName(r.pickupId)}`}
                      </div>
                      {voided && <VoidedNote voidedAt={r.voidedAt} reason={r.voidReason} />}
                    </button>
                    <span className={`tabular-nums text-sm font-semibold ${voided ? 'line-through opacity-60' : ''}`}>{money(r.amount)}</span>
                    {voided ? (
                      <button type="button" className="text-xs text-slate-500 underline" onClick={() => (tab === 'costs' ? actions.restoreExpense : actions.restoreIncome)(r.id)}>
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Void"
                        onClick={() => {
                          const reason = askVoidReason(tab === 'costs' ? 'cost' : 'income');
                          if (reason) (tab === 'costs' ? actions.voidExpense : actions.voidIncome)(r.id, reason);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
