import type { AppState, Expense, RecurringCost } from './types';

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The nth payment date (0 = start). Monthly keeps the start's day, clamped to short months (31 Jan -> 28 Feb). */
function nthDate(plan: Pick<RecurringCost, 'frequency' | 'startDate'>, n: number): string {
  const start = parse(plan.startDate);
  if (plan.frequency === 'weekly') return iso(new Date(start.getTime() + n * 7 * 86_400_000));
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay))));
}

/** Payment dates from the start up to and including `upTo` (and the end date, if set) */
export function occurrences(plan: Pick<RecurringCost, 'frequency' | 'startDate' | 'endDate'>, upTo: string): string[] {
  const last = plan.endDate && plan.endDate < upTo ? plan.endDate : upTo;
  const dates: string[] = [];
  for (let n = 0; n < 5000; n++) {
    const date = nthDate(plan, n);
    if (date > last) break;
    dates.push(date);
  }
  return dates;
}

export function amountFor(plan: Pick<RecurringCost, 'amount' | 'introAmount' | 'introPeriods'>, n: number): number {
  return plan.introAmount !== null && n < plan.introPeriods ? plan.introAmount : plan.amount;
}

/** Stable per payment, so every device posts the same record and a deleted one stays deleted */
export function occurrenceId(planId: string, date: string): string {
  return `${planId}@${date}`;
}

export function nextPayment(plan: RecurringCost, today: string): { date: string; amount: number } | null {
  for (let n = 0; n < 5000; n++) {
    const date = nthDate(plan, n);
    if (plan.endDate && date > plan.endDate) return null;
    if (date > today) return { date, amount: amountFor(plan, n) };
  }
  return null;
}

/**
 * Posts each repeating cost's payments that are due by today and not yet
 * posted (or deleted). Returns the same state object when nothing is due, so
 * it is safe to run on every change.
 */
export function postDueRecurring(state: AppState, today: string): AppState {
  const existing = new Set(state.expenses.map((e) => e.id));
  const added: Expense[] = [];
  for (const plan of state.recurring) {
    occurrences(plan, today).forEach((date, n) => {
      const id = occurrenceId(plan.id, date);
      if (existing.has(id) || state.tombstones[id]) return;
      added.push({
        id,
        date,
        category: plan.category,
        description: plan.description,
        amount: amountFor(plan, n),
        pickupId: plan.pickupId,
        recurringId: plan.id,
        // The plan's own timestamp, so two devices posting the same payment produce identical records.
        updatedAt: plan.updatedAt,
      });
    });
  }
  return added.length ? { ...state, expenses: [...state.expenses, ...added] } : state;
}

export function describeRecurring(plan: RecurringCost, money: (n: number) => string): string {
  const per = plan.frequency === 'weekly' ? 'week' : 'month';
  const intro = plan.introAmount !== null && plan.introPeriods > 0 ? ` (${money(plan.introAmount)} for the first ${plan.introPeriods} ${per}${plan.introPeriods === 1 ? '' : 's'})` : '';
  return `${money(plan.amount)} a ${per}${intro}`;
}
