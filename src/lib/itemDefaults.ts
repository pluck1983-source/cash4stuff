import type { ItemGender, StorageLocation } from './types';

/** Remembered per device, so boxing up a pile of stock doesn't mean re-typing the shelf every time */
export const LAST_KEY = 'cash4stuff-last-item-defaults';

export interface LastDefaults {
  category: string;
  subcategory?: string;
  gender?: ItemGender;
  location: StorageLocation;
}

export function readLast(): LastDefaults | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as LastDefaults) : null;
  } catch {
    return null;
  }
}
