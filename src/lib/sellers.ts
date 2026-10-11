import type { Pickup } from './types';

/** Names the app fills in when none is typed, e.g. "Pickup 10 Oct 2026" - not real sellers */
const AUTO_NAME = /^(Pickup|Drop-off) \d{1,2} \w{3} \d{4}$/;

export function sellerKey(p: Pick<Pickup, 'reference'>): string {
  const name = p.reference.trim();
  return name && !AUTO_NAME.test(name) ? name.toLowerCase() : '';
}

/**
 * The pickups list as groups, newest first: a seller with more than one
 * pickup gets one group holding all of theirs (newest first), everyone else
 * a group of one. Groups sit where the seller's latest pickup would.
 */
export function groupBySeller<T extends Pick<Pickup, 'id' | 'reference' | 'date' | 'createdAt'>>(pickups: T[]): T[][] {
  const newestFirst = [...pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const groups: T[][] = [];
  const byKey = new Map<string, T[]>();
  for (const p of newestFirst) {
    const key = sellerKey(p);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.push(p);
    } else {
      const group = [p];
      groups.push(group);
      if (key) byKey.set(key, group);
    }
  }
  return groups;
}
