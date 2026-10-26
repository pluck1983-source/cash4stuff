import type { Item } from './types';

/**
 * The item already using a photo with this fingerprint, if any. A part-sold
 * stock record and the sales split off it share one photo, so the record still
 * in stock is preferred. `exceptId` leaves out the item being edited.
 */
export function itemWithPhoto(items: Item[], hash: string | null, exceptId: string | null = null): Item | undefined {
  if (!hash) return undefined;
  const matches = items.filter((i) => i.id !== exceptId && i.photoHash === hash);
  return matches.find((i) => i.status !== 'sold') ?? matches[0];
}

/** How a matched item is named in the warning, e.g. "Levi's jeans (JEA-0012)" */
export function describeItem(item: Pick<Item, 'name' | 'category' | 'sku'>): string {
  const name = item.name || item.category;
  return item.sku ? `${name} (${item.sku})` : name;
}

export function duplicateWarning(item: Item): string {
  return `This photo is already on ${describeItem(item)}${item.status === 'sold' ? ', which has sold' : ''}.`;
}
