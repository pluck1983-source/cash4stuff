import { describe, expect, it } from 'vitest';
import { emptyState } from './storage';
import { nextPayment, occurrences, postDueRecurring } from './recurring';
import type { RecurringCost } from './types';

const T = '2026-01-01T00:00:00.000Z';

function plan(over: Partial<RecurringCost> = {}): RecurringCost {
  return {
    id: 'r1',
    category: 'Rent',
    description: 'Unit 4',
    amount: 50,
    frequency: 'weekly',
    startDate: '2026-09-01',
    endDate: null,
    introAmount: null,
    introPeriods: 0,
    pickupId: null,
    updatedAt: T,
    ...over,
  };
}

describe('occurrences', () => {
  it('repeats weekly up to today and stops at the end date', () => {
    expect(occurrences(plan(), '2026-09-20')).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
    expect(occurrences(plan({ endDate: '2026-09-10' }), '2026-12-01')).toEqual(['2026-09-01', '2026-09-08']);
  });

  it('keeps the day of the month, clamped for short months', () => {
    expect(occurrences(plan({ frequency: 'monthly', startDate: '2026-01-31' }), '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
});

describe('postDueRecurring', () => {
  it('posts due payments once, with the discounted rate first', () => {
    const s = { ...emptyState(), recurring: [plan({ introAmount: 25, introPeriods: 2 })] };
    const posted = postDueRecurring(s, '2026-09-22');
    expect(posted.expenses.map((e) => [e.date, e.amount, e.recurringId])).toEqual([
      ['2026-09-01', 25, 'r1'],
      ['2026-09-08', 25, 'r1'],
      ['2026-09-15', 50, 'r1'],
      ['2026-09-22', 50, 'r1'],
    ]);
    // Nothing new due: same object back, so running it on every change can't loop.
    expect(postDueRecurring(posted, '2026-09-22')).toBe(posted);
  });

  it('does not re-post a payment that was deleted', () => {
    const s = { ...emptyState(), recurring: [plan()], tombstones: { 'r1@2026-09-08': T } };
    expect(postDueRecurring(s, '2026-09-10').expenses.map((e) => e.date)).toEqual(['2026-09-01']);
  });

  it('shows the next payment and nothing once ended', () => {
    expect(nextPayment(plan({ introAmount: 25, introPeriods: 3 }), '2026-09-09')).toEqual({ date: '2026-09-15', amount: 25 });
    expect(nextPayment(plan({ endDate: '2026-09-08' }), '2026-09-09')).toBeNull();
  });
});
