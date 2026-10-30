import type { Item } from './types';

/**
 * Stock-keeping units: a short category code plus a running number, e.g.
 * TOP-0042. Given once when an item is added and never changed (renaming a
 * category doesn't re-label stock), so it can be written on a tag.
 */

export function skuPrefix(category: string): string {
  const letters = category.toUpperCase().replace(/[^A-Z]/g, '');
  return (letters.slice(0, 3) || 'ITM').padEnd(3, 'X');
}

function skuNumber(sku: string): number {
  // Only our own CAT-0001 codes count, so a typed code like LEVI501 doesn't jump the numbering.
  const match = /^[A-Z]{3}-(\d+)$/.exec(sku);
  return match ? Number(match[1]) : 0;
}

export function nextSkuNumber(items: Pick<Item, 'sku'>[]): number {
  return items.reduce((max, i) => Math.max(max, skuNumber(i.sku)), 0) + 1;
}

export function makeSku(category: string, n: number): string {
  return `${skuPrefix(category)}-${String(n).padStart(4, '0')}`;
}

/**
 * An item saved without a category gets a stand-in ITM-0042 code. Once it's
 * given a category the code takes that category's letters, keeping its number.
 * Real codes never change.
 */
export function skuForNewCategory(sku: string, previousCategory: string, category: string): string {
  const match = /^ITM-(\d+)$/.exec(sku);
  if (!match || previousCategory.trim() || !category.trim()) return sku;
  return makeSku(category, Number(match[1]));
}

/** Gives SKUs to items that don't have one yet, oldest first. Returns the same array when nothing changes. */
export function assignMissingSkus<T extends Pick<Item, 'sku' | 'category' | 'createdAt' | 'updatedAt'>>(items: T[], now: string): T[] {
  if (items.every((i) => i.sku)) return items;
  let n = nextSkuNumber(items);
  const order = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.sku)
    .sort((a, b) => a.item.createdAt.localeCompare(b.item.createdAt));
  const next = [...items];
  for (const { item, index } of order) next[index] = { ...item, sku: makeSku(item.category, n++), updatedAt: now };
  return next;
}
