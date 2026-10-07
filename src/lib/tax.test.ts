import { describe, expect, it } from 'vitest';
import { class4, incomeTax, personalAllowance, taxEstimate, taxYear, taxYearStartFor, tradingSummary, taxYearLedgerCsv } from './tax';
import { emptyState, normaliseState } from './storage';
import type { AppState } from './types';

const T = '2026-01-01T00:00:00.000Z';

describe('tax year helpers', () => {
  it('starts the UK tax year on 6 April', () => {
    expect(taxYearStartFor('2026-04-05')).toBe(2025);
    expect(taxYearStartFor('2026-04-06')).toBe(2026);
    expect(taxYear(2025)).toMatchObject({ id: '2025-26', label: '2025/26', dueDate: '2027-01-31' });
  });
});

describe('income tax', () => {
  it('is nothing within the personal allowance', () => {
    expect(incomeTax(12570)).toBe(0);
  });
  it('charges 20% in the basic band', () => {
    expect(incomeTax(30000)).toBe(3486);
  });
  it('charges 40% above £50,270', () => {
    expect(incomeTax(60000)).toBe(11432);
  });
  it('tapers the personal allowance over £100,000', () => {
    expect(personalAllowance(110000)).toBe(7570);
    expect(personalAllowance(130000)).toBe(0);
    // 37,700 @20% + (125,140-37,700) @40% + (150,000-125,140) @45%
    expect(incomeTax(150000)).toBe(53703);
  });
});

describe('class 4 NI', () => {
  it('is 6% between £12,570 and £50,270 and 2% above', () => {
    expect(class4(12000)).toBe(0);
    expect(class4(20000)).toBe(445.8);
    expect(class4(60000)).toBe(2262 + 194.6);
  });
});

function businessState(): AppState {
  return normaliseState({
    ...emptyState(),
    pickups: [
      { id: 'p1', date: '2025-05-01', reference: 'A', weightKg: 100, costOverride: null, notes: '', createdAt: T, updatedAt: T },
      { id: 'p0', date: '2025-03-01', reference: 'Last year', weightKg: 50, costOverride: null, notes: '', createdAt: T, updatedAt: T },
    ],
    items: [
      { id: 'i1', pickupId: 'p1', name: 'Coat', category: 'Coats', status: 'sold', soldPrice: 2000, soldDate: '2025-06-01', saleCosts: 50, listPrice: 2500 },
      { id: 'i2', pickupId: 'p1', name: 'Old sale', category: 'Coats', status: 'sold', soldPrice: 999, soldDate: '2025-04-05' },
    ],
    expenses: [
      { id: 'e1', date: '2025-07-01', category: 'Fuel', description: '', amount: 200, pickupId: null },
      { id: 'e2', date: '2025-08-01', category: 'Rent', description: '', amount: 600, pickupId: null },
    ],
    otherIncome: [{ id: 'o1', date: '2025-09-01', description: 'Bulk lot', amount: 100, pickupId: null }],
  });
}

describe('tradingSummary', () => {
  it('totals the tax year on the cash basis under SA103 headings', () => {
    const t = tradingSummary(businessState(), taxYear(2025));
    expect(t.salesIncome).toBe(2000);
    expect(t.otherIncome).toBe(100);
    expect(t.turnover).toBe(2100);
    expect(t.expenses.map((e) => [e.box, e.amount])).toEqual([
      ['goods', 100],
      ['travel', 200],
      ['premises', 600],
      ['other', 50],
    ]);
    expect(t.totalExpenses).toBe(950);
    expect(t.profitActual).toBe(1150);
    expect(t.profitWithAllowance).toBe(1100);
    expect(t.allowanceIsBetter).toBe(true);
  });
});

describe('taxEstimate', () => {
  it('adds business profit on top of employment and credits PAYE', () => {
    const state = businessState();
    const trading = tradingSummary(state, taxYear(2025));
    const est = taxEstimate(trading, [{ id: 'j', taxYear: '2025-26', employer: 'Shop', grossPay: 30000, taxPaid: 3486, updatedAt: T }]);
    expect(est.tradingProfit).toBe(1100);
    expect(est.incomeTax).toBe(3706);
    expect(est.class4).toBe(0);
    expect(est.balanceDue).toBe(220);
    expect(est.taxOnBusiness).toBe(220);
    expect(est.paymentsOnAccountLikely).toBe(false);
  });
  it('flags payments on account when most tax is not collected at source', () => {
    const trading = { ...tradingSummary(emptyState(), taxYear(2025)), profitActual: 30000, profitWithAllowance: 29000, allowanceIsBetter: false };
    const est = taxEstimate(trading, []);
    expect(est.balanceDue).toBe(3486 + 1045.8);
    expect(est.paymentsOnAccountLikely).toBe(true);
  });
});

describe('taxYearLedgerCsv', () => {
  it('lists every movement in the year in date order', () => {
    const lines = taxYearLedgerCsv(businessState(), taxYear(2025)).split('\n');
    expect(lines[0]).toBe('Date,Type,Tax heading,Description,Amount (£),Pickup');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['2025-05-01', '2025-06-01', '2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01']);
  });
});
