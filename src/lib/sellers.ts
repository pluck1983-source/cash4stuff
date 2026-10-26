import type { Pickup } from './types';
import { shortDate } from './format';

/** Names the app fills in when none is typed, e.g. "Pickup 10 Oct 2026" - not real sellers */
const AUTO_NAME = /^(Pickup|Drop-off) \d{1,2} \w{3} \d{4}$/;

export function sellerKey(p: Pick<Pickup, 'reference'>): string {
  const name = p.reference.trim();
  return name && !AUTO_NAME.test(name) ? name.toLowerCase() : '';
}

type Groupable = Pick<Pickup, 'id' | 'reference' | 'date' | 'createdAt'> & Partial<Pick<Pickup, 'startsNewGroup'>>;

const newest = (a: Groupable, b: Groupable) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt);

/**
 * Pickup id -> the customer group it's counted in. A seller's pickups form one
 * group until one is marked startsNewGroup; that one and the later ones form
 * the next. Pickups without a real seller name are a group of their own.
 */
export function groupKeys(pickups: Groupable[]): Map<string, string> {
  const keys = new Map<string, string>();
  const started = new Map<string, string>();
  for (const p of [...pickups].sort((a, b) => newest(b, a))) {
    const seller = sellerKey(p);
    if (!seller) {
      keys.set(p.id, `pickup:${p.id}`);
      continue;
    }
    if (!started.has(seller) || p.startsNewGroup) started.set(seller, p.id);
    keys.set(p.id, `${seller}#${started.get(seller)}`);
  }
  return keys;
}

/**
 * The pickups list as groups, newest first: a customer with more than one
 * pickup gets one group holding all of theirs (newest first) - or one per
 * group, once a new group has been started - everyone else a group of one.
 * Groups sit where their latest pickup would.
 */
export function groupBySeller<T extends Groupable>(pickups: T[]): T[][] {
  const newestFirst = [...pickups].sort(newest);
  const keys = groupKeys(pickups);
  const groups: T[][] = [];
  const byKey = new Map<string, T[]>();
  for (const p of newestFirst) {
    const key = keys.get(p.id) ?? '';
    const existing = byKey.get(key);
    if (existing) {
      existing.push(p);
    } else {
      const group = [p];
      groups.push(group);
      byKey.set(key, group);
    }
  }
  return groups;
}

/** The pickups in the same customer group as this one - just the one when it has no real seller name */
export function sellerPickups<T extends Groupable>(pickups: T[], pickupId: string): T[] {
  const keys = groupKeys(pickups);
  const key = keys.get(pickupId);
  return key ? pickups.filter((p) => keys.get(p.id) === key) : [];
}

/** Resolves every open pickup of the seller, or reopens all of them */
export function setResolved<T extends Groupable & Pick<Pickup, 'resolvedAt' | 'updatedAt'>>(pickups: T[], pickupId: string, resolved: boolean, now: string): T[] {
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

export interface CustomerChoice extends PickupChoice {
  /** Every one of the group's pickups has been marked as all items added */
  finished: boolean;
  /** The customer's name, with the date the group began when they have more than one group */
  label: string;
}

/** A group's name: the customer, plus when it began if the customer has had a new group started */
export function groupLabel<T extends Groupable>(group: T[], groups: T[][]): string {
  const key = sellerKey(group[0]);
  const oldest = group[group.length - 1];
  const several = key !== '' && groups.filter((g) => sellerKey(g[0]) === key).length > 1;
  return several ? `${oldest.reference} (from ${shortDate(oldest.date)})` : group[0].reference;
}

/**
 * The customer picker when adding items: items are logged against a customer,
 * not a particular pickup. Each customer is listed once and the item is filed
 * under their newest open pickup - or their newest pickup once they're all
 * finished - so per-pickup figures keep working. Open customers come first.
 */
export function customerChoices<T extends Groupable & Pick<Pickup, 'resolvedAt'>>(pickups: T[], currentId: string | null = null): CustomerChoice[] {
  const choices: CustomerChoice[] = [];
  const groups = groupBySeller(pickups);
  for (const group of groups) {
    const pick = group.find((p) => p.id === currentId) ?? group.find((p) => p.resolvedAt === null) ?? group[0];
    choices.push({ pickupId: pick.id, pickup: pick, count: group.length, finished: group.every((p) => p.resolvedAt !== null), label: groupLabel(group, groups) });
  }
  return [...choices.filter((c) => !c.finished), ...choices.filter((c) => c.finished)];
}
