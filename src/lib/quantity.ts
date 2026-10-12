import type { Item } from './types';

export type Sale = Pick<Item, 'soldPrice' | 'soldDate' | 'salesChannel' | 'saleCosts'>;

/**
 * Sells `count` units of a record holding more than that: the sold units become
 * their own sold record (same SKU, photo and pickup) and the rest stay in stock.
 */
export function splitSale(items: Item[], item: Item, sale: Sale, count: number, now: string, id: string): Item[] {
  const sold: Item = { ...item, ...sale, quantity: count, status: 'sold', history: [], id, updatedAt: now };
  return [...items.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - count, updatedAt: now } : i)), sold];
}
