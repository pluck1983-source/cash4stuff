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

/** All of a seller's pickups - just the one when it has no real seller name */
export function sellerPickups<T extends Pick<Pickup, 'id' | 'reference'>>(pickups: T[], pickupId: string): T[] {
  const target = pickups.find((p) => p.id === pickupId);
  if (!target) return [];
  const key = sellerKey(target);
  return key ? pickups.filter((p) => sellerKey(p) === key) : [target];
}

/** Resolves every open pickup of the seller, or reopens all of them */
export function setResolved<T extends Pick<Pickup, 'id' | 'reference' | 'resolvedAt' | 'updatedAt'>>(pickups: T[], pickupId: string, resolved: boolean, now: string): T[] {
  const ids = new Set(sellerPickups(pickups, pickupId).map((p) => p.id));
  return pickups.map((p) => {
    if (!ids.has(p.id) || (p.resolvedAt !== null) === resolved) return p;
    return { ...p, resolvedAt: resolved ? now : null, updatedAt: now };
  });
}

export interface PickupChoice {
  /** The pickup new items are linked to - the seller's newest still-open one */
  pickupId: string;
  pickup: Pick<Pickup, 'id' | 'reference' | 'date'>;
  /** How many pickups the seller has had */
  count: number;
}

/**
 * The pickup picker when adding items: one row per seller, linked to their
 * newest pickup that isn't resolved. Sellers with everything resolved are left
 * out, except the pickup the item is already on, which always shows.
 */
export function pickupChoices<T extends Pick<Pickup, 'id' | 'reference' | 'date' | 'createdAt' | 'resolvedAt'>>(pickups: T[], currentId: string | null = null): PickupChoice[] {
  const choices: PickupChoice[] = [];
  for (const group of groupBySeller(pickups)) {
    const pick = group.find((p) => p.id === currentId) ?? group.find((p) => p.resolvedAt === null);
    if (pick) choices.push({ pickupId: pick.id, pickup: pick, count: group.length });
  }
  return choices;
}

/** Where new items go by default: the newest pickup that's still open */
export function latestOpenPickupId<T extends Pick<Pickup, 'id' | 'reference' | 'date' | 'createdAt' | 'resolvedAt'>>(pickups: T[]): string | null {
  return pickupChoices(pickups)[0]?.pickupId ?? null;
}
