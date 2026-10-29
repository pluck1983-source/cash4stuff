import { describe, expect, it } from 'vitest';
import { describeItem, itemWithPhoto } from './duplicates';
import { normaliseState } from './storage';
import type { Item } from './types';

function item(over: Partial<Item>): Item {
  return { ...normaliseState({ items: [{ id: 'x' }] }).items[0], ...over };
}

describe('itemWithPhoto', () => {
  const items = [
    item({ id: 'a', photoId: 'ph1', photoHash: 'h1', status: 'sold' }),
    item({ id: 'b', photoId: 'ph1', photoHash: 'h1', status: 'in_stock' }),
    item({ id: 'c', photoId: 'ph2', photoHash: 'h2' }),
    item({ id: 'd', photoId: 'ph3', photoHash: null }),
  ];

  it('finds the item with the same photo, preferring one still in stock', () => {
    expect(itemWithPhoto(items, 'h1')?.id).toBe('b');
    expect(itemWithPhoto(items, 'h2')?.id).toBe('c');
  });

  it('matches exact fingerprints only, never photos without one', () => {
    expect(itemWithPhoto(items, 'h9')).toBeUndefined();
    expect(itemWithPhoto(items, null)).toBeUndefined();
  });

  it("doesn't report the item being edited as its own duplicate", () => {
    expect(itemWithPhoto(items, 'h2', 'c')).toBeUndefined();
  });
});

describe('describeItem', () => {
  it('uses the name and SKU, or the category when unnamed', () => {
    expect(describeItem({ name: 'Jeans', category: 'Bottoms', sku: 'BOT-0001' })).toBe('Jeans (BOT-0001)');
    expect(describeItem({ name: '', category: 'Tops', sku: '' })).toBe('Tops');
  });
});
