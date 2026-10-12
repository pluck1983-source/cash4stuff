import { describe, expect, it } from 'vitest';
import { splitSale } from './quantity';
import { itemCostMap, pickupStats, totals } from './calc';
import { emptyState, normaliseState } from './storage';
import { testPickup } from './fixtures';
import type { Item } from './types';

const T = '2026-03-11T10:00:00.000Z';
function item(over: Partial<Item> = {}): Item {
  return {
    ...normaliseState({ items: [{ id: 'x' }] }).items[0],
    pickupId: 'p1',
    category: 'Tops',
    sku: 'TOP-0001',
    listPrice: 5,
    status: 'listed',
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

describe('quantities', () => {
  it('loads older items as one unit', () => {
    expect(normaliseState({ items: [{ id: 'a' }, { id: 'b', quantity: 4 }, { id: 'c', quantity: 0 }] }).items.map((i) => i.quantity)).toEqual([1, 4, 1]);
  });

  it('splits a part sale off into its own sold record', () => {
    const stock = item({ id: 'a', quantity: 5, photoId: 'ph' });
    const after = splitSale([stock], stock, { soldPrice: 12, soldDate: '2026-03-20', salesChannel: 'Vinted', saleCosts: 1 }, 2, T, 'b');
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({ id: 'a', quantity: 3, status: 'listed', soldPrice: null });
    expect(after[1]).toMatchObject({ id: 'b', quantity: 2, status: 'sold', soldPrice: 12, sku: 'TOP-0001', photoId: 'ph', pickupId: 'p1' });
  });

  it('counts units, values and cost per unit', () => {
    const p = testPickup({ id: 'p1', date: '2026-03-10', reference: 'Sarah', weightKg: 10, costOverride: 12 });
    const state = {
      ...emptyState(),
      pickups: [{ ...p, amountPaid: 12 }],
      items: [
        item({ id: 'a', quantity: 3 }),
        item({ id: 'b', quantity: 2, status: 'sold', soldPrice: 9, soldDate: '2026-03-20' }),
        item({ id: 'c', listPrice: 10 }),
      ],
    };
    const s = pickupStats(state, state.pickups[0]);
    expect(s.itemCount).toBe(6);
    expect(s.soldCount).toBe(2);
    expect(s.heldListValue).toBe(25);
    expect(s.costPerItem).toBe(2);
    expect(itemCostMap(state).get('a')).toBe(6);
    const t = totals(state);
    expect(t.itemsSold).toBe(2);
    expect(t.averageSalePrice).toBe(4.5);
    expect(t.heldItems).toBe(4);
    expect(t.stockListValue).toBe(25);
  });
});
