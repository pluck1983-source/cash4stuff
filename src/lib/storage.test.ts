import { describe, expect, it } from 'vitest';
import { emptyState, exportStateAsJson, importStateFromJson, itemsToCsv, normaliseState } from './storage';

describe('normaliseState', () => {
  it('round-trips through JSON', () => {
    const s = emptyState();
    expect(importStateFromJson(exportStateAsJson(s))).toEqual(s);
  });
  it('fills in missing fields instead of crashing', () => {
    const s = normaliseState({ items: [{ id: 'i1', name: 'Coat', listPrice: 'abc', location: null, status: 'weird' }], settings: { costPerKg: 2 } });
    expect(s.settings.costPerKg).toBe(2);
    expect(s.settings.weightStepKg).toBe(0.5);
    expect(s.items[0]).toMatchObject({ id: 'i1', name: 'Coat', listPrice: null, status: 'in_stock', location: { area: '', rack: '', box: '' } });
  });
  it('rejects things that are not data files', () => {
    expect(() => normaliseState(null)).toThrow();
  });
});

describe('itemsToCsv', () => {
  it('quotes values containing commas or quotes', () => {
    const s = normaliseState({ items: [{ id: 'i1', name: 'Jeans, "501"', category: 'Jeans' }] });
    expect(itemsToCsv(s, s.items).split('\n')[1].startsWith('"Jeans, ""501""",Jeans')).toBe(true);
  });
});

describe('price history', () => {
  it('starts history from the current price for older data', () => {
    const s = normaliseState({ items: [{ id: 'i1', listPrice: 12, createdAt: '2026-02-03T10:00:00.000Z' }] });
    expect(s.items[0].priceHistory).toEqual([{ date: '2026-02-03', price: 12 }]);
  });
});
