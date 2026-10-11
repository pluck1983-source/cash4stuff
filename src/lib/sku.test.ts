import { describe, expect, it } from 'vitest';
import { assignMissingSkus, makeSku, nextSkuNumber, skuPrefix } from './sku';
import { orderSections } from './navOrder';

describe('SKUs', () => {
  it('uses a three-letter category code and a running number', () => {
    expect(skuPrefix('Jeans & trousers')).toBe('JEA');
    expect(skuPrefix('Ox')).toBe('OXX');
    expect(skuPrefix('')).toBe('ITM');
    expect(makeSku('Tops', 42)).toBe('TOP-0042');
  });

  it('numbers after the highest so far, whatever the category', () => {
    expect(nextSkuNumber([{ sku: 'TOP-0007' }, { sku: 'SHO-0012' }, { sku: '' }])).toBe(13);
  });

  it('gives items without one a SKU, oldest first, and leaves the rest alone', () => {
    const items = [
      { sku: '', category: 'Shoes', createdAt: '2026-02-01', updatedAt: 'old' },
      { sku: 'TOP-0003', category: 'Tops', createdAt: '2026-01-15', updatedAt: 'old' },
      { sku: '', category: 'Tops', createdAt: '2026-01-01', updatedAt: 'old' },
    ];
    const next = assignMissingSkus(items, 'now');
    expect(next.map((i) => i.sku)).toEqual(['SHO-0005', 'TOP-0003', 'TOP-0004']);
    expect(next[1]).toBe(items[1]);
    expect(next[0].updatedAt).toBe('now');
    expect(assignMissingSkus(next, 'later')).toBe(next);
  });
});

describe('tab order', () => {
  it('keeps the saved order, drops unknown tabs and adds new ones at the end', () => {
    expect(orderSections(['a', 'b', 'c', 'd'], 'c,x,a')).toEqual(['c', 'a', 'b', 'd']);
    expect(orderSections(['a', 'b'], '')).toEqual(['a', 'b']);
  });
});
