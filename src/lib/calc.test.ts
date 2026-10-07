import { describe, expect, it } from 'vitest';
import { calculatedPickupCost, filterItems, EMPTY_FILTER, periodFor, pickupStats, roundWeight, totals } from './calc';
import { DEFAULT_SETTINGS, emptyState } from './storage';
import type { AppState, Item, Pickup } from './types';

const T = '2026-01-01T00:00:00.000Z';

function pickup(over: Partial<Pickup> = {}): Pickup {
  return { id: 'p1', date: '2026-03-10', reference: 'Sarah', weightKg: 12.3, costOverride: null, notes: '', createdAt: T, updatedAt: T, ...over };
}

function item(over: Partial<Item> = {}): Item {
  return {
    id: Math.random().toString(36).slice(2),
    pickupId: 'p1',
    name: 'Jeans',
    category: 'Jeans',
    subcategory: '',
    gender: '',
    photoId: null,
    location: { area: 'Garage', rack: 'A', box: '3' },
    listPrice: 10,
    priceHistory: [],
    status: 'listed',
    soldPrice: null,
    soldDate: null,
    salesChannel: '',
    saleCosts: 0,
    notes: '',
    createdAt: '2026-03-11T10:00:00.000Z',
    updatedAt: T,
    ...over,
  };
}

function stateWith(over: Partial<AppState>): AppState {
  return { ...emptyState(), ...over };
}

describe('roundWeight', () => {
  it('rounds to the nearest half kilo by default', () => {
    expect(roundWeight(12.3, 0.5, 'nearest')).toBe(12.5);
    expect(roundWeight(12.2, 0.5, 'nearest')).toBe(12);
    expect(roundWeight(12.25, 0.5, 'nearest')).toBe(12.5);
    expect(roundWeight(12.74, 0.5, 'nearest')).toBe(12.5);
  });
  it('supports always up / always down / none', () => {
    expect(roundWeight(12.01, 0.5, 'up')).toBe(12.5);
    expect(roundWeight(12.49, 0.5, 'down')).toBe(12);
    expect(roundWeight(12.37, 0.5, 'none')).toBe(12.37);
  });
  it('is not tipped over a step by float noise', () => {
    expect(roundWeight(0.1 + 0.2 + 2.7, 0.5, 'up')).toBe(3);
  });
  it('treats bad input as zero', () => {
    expect(roundWeight(-1, 0.5, 'nearest')).toBe(0);
    expect(roundWeight(Number.NaN, 0.5, 'nearest')).toBe(0);
  });
});

describe('pickup cost', () => {
  it('is rounded weight times the per-kg rate', () => {
    expect(calculatedPickupCost(12.3, DEFAULT_SETTINGS)).toBe(12.5);
    expect(calculatedPickupCost(7.8, { ...DEFAULT_SETTINGS, costPerKg: 1.2 })).toBe(9.6);
  });
});

describe('pickupStats', () => {
  it('works out realised and projected profit for a pickup', () => {
    const p = pickup({ costOverride: 15 });
    const state = stateWith({
      pickups: [p],
      items: [
        item({ status: 'sold', soldPrice: 20, soldDate: '2026-03-20', saleCosts: 2 }),
        item({ status: 'sold', soldPrice: 8, soldDate: '2026-03-21' }),
        item({ listPrice: 12 }),
        item({ listPrice: null, status: 'in_stock' }),
        item({ pickupId: 'other', status: 'sold', soldPrice: 100, soldDate: '2026-03-21' }),
      ],
      expenses: [{ id: 'e1', date: '2026-03-10', category: 'Fuel', description: '', amount: 5, pickupId: 'p1', updatedAt: T }],
    });
    const s = pickupStats(state, p);
    expect(s.stockCost).toBe(15);
    expect(s.totalCost).toBe(20);
    expect(s.itemCount).toBe(4);
    expect(s.soldCount).toBe(2);
    expect(s.salesRevenue).toBe(28);
    expect(s.realisedProfit).toBe(6); // 28 - 2 fees - 20 cost
    expect(s.heldListValue).toBe(12);
    expect(s.projectedProfit).toBe(18);
    expect(s.roi).toBeCloseTo(0.3);
    expect(s.costPerItem).toBe(3.75);
  });
});

describe('totals', () => {
  const state = stateWith({
    pickups: [pickup(), pickup({ id: 'p2', date: '2025-12-01', weightKg: 4 })],
    items: [
      item({ status: 'sold', soldPrice: 30, soldDate: '2026-03-15', saleCosts: 3 }),
      item({ listPrice: 20 }),
      item({ pickupId: 'p2', status: 'sold', soldPrice: 9, soldDate: '2025-12-20' }),
    ],
    expenses: [
      { id: 'e1', date: '2026-03-01', category: 'Rent', description: '', amount: 50, pickupId: null, updatedAt: T },
      { id: 'e2', date: '2025-11-01', category: 'Fuel', description: '', amount: 10, pickupId: null, updatedAt: T },
    ],
    otherIncome: [{ id: 'o1', date: '2026-03-02', description: 'Bulk lot', amount: 5, pickupId: null, updatedAt: T }],
  });

  it('adds everything up for all time', () => {
    const t = totals(state);
    expect(t.stockCost).toBe(16.5);
    expect(t.runningCosts).toBe(60);
    expect(t.saleCosts).toBe(3);
    expect(t.totalCosts).toBe(79.5);
    expect(t.salesIncome).toBe(39);
    expect(t.totalIncome).toBe(44);
    expect(t.netProfit).toBe(-35.5);
    expect(t.heldItems).toBe(1);
    expect(t.stockListValue).toBe(20);
    // p1 cost 12.5 split over its 2 items
    expect(t.stockBookCost).toBe(6.25);
    // both sold items were listed at 10 and sold for 30 + 9
    expect(t.soldListValue).toBe(20);
    expect(t.soldVsList).toBe(1.95);
  });

  it('limits flows to the period but keeps stock as a snapshot', () => {
    const t = totals(state, { from: '2026-01-01', to: '2026-12-31' });
    expect(t.stockCost).toBe(12.5);
    expect(t.runningCosts).toBe(50);
    expect(t.salesIncome).toBe(30);
    expect(t.itemsSold).toBe(1);
    expect(t.stockListValue).toBe(20);
  });
});

describe('periodFor', () => {
  it('uses the UK tax year (6 April)', () => {
    expect(periodFor('tax_year', new Date(2026, 3, 5))).toEqual({ from: '2025-04-06', to: '2026-04-05' });
    expect(periodFor('tax_year', new Date(2026, 3, 6))).toEqual({ from: '2026-04-06', to: '2027-04-05' });
  });
  it('handles last month across a year boundary', () => {
    expect(periodFor('last_month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('filterItems', () => {
  const state = stateWith({
    pickups: [pickup()],
    items: [
      item({ id: 'a', name: 'Nike hoodie', category: 'Hoodies & sweats', gender: 'unisex', location: { area: 'Garage', rack: 'B', box: '1' } }),
      item({ id: 'b', name: 'Zara dress', category: 'Dresses', gender: 'womens', status: 'sold', soldPrice: 15, soldDate: '2026-03-12' }),
      item({ id: 'c', name: 'Boots', category: 'Shoes', listPrice: 40, status: 'in_stock' }),
    ],
  });
  const ids = (f: Partial<typeof EMPTY_FILTER>) => filterItems(state, { ...EMPTY_FILTER, ...f }).map((i) => i.id);

  it("filters by who it's for, with unisex counting for both", () => {
    expect(ids({ gender: 'womens' })).toEqual(['a', 'b']);
    expect(ids({ gender: 'mens' })).toEqual(['a']);
    expect(ids({ gender: 'unisex' })).toEqual(['a']);
  });

  it('filters by text across name and pickup reference', () => {
    expect(ids({ text: 'nike' })).toEqual(['a']);
    expect(ids({ text: 'sarah' })).toEqual(['a', 'b', 'c']);
  });
  it('filters by status, category, location and price', () => {
    expect(ids({ status: 'held' })).toEqual(['a', 'c']);
    expect(ids({ category: 'Dresses' })).toEqual(['b']);
    expect(ids({ rack: 'b' })).toEqual(['a']);
    expect(ids({ minPrice: 12 })).toEqual(['b', 'c']);
  });
});
