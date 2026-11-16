import type { Expense } from './types';

/**
 * Spotting a receipt or invoice entered twice. Only reports - the person
 * decides what to do (nothing here voids or removes anything).
 *
 * Two checks:
 * - the same file: the SHA-256 of a file matches another attachment. Lines
 *   split off one receipt share a single attachment, which is not a
 *   duplicate, so a match must be on a different attachment.
 * - the same date and amount on two live costs: catches a receipt that was
 *   photographed twice (every photo is a different file).
 */

type Costs = Pick<Expense, 'id' | 'date' | 'amount' | 'attachmentIds' | 'attachmentHashes' | 'voidedAt'>[];

function live<T extends { voidedAt: string | null }>(expenses: T[]): T[] {
  return expenses.filter((e) => e.voidedAt === null);
}

/** Live costs (other than `exceptId`) that already have a file with this fingerprint */
export function costsWithFile<T extends Costs[number]>(expenses: T[], hash: string | null, exceptId: string | null = null): T[] {
  if (!hash) return [];
  return live(expenses).filter((e) => e.id !== exceptId && Object.values(e.attachmentHashes).includes(hash));
}

/** Live costs (other than `exceptId`) on the same date for the same amount, to the penny */
export function costsSameDateAmount<T extends Costs[number]>(expenses: T[], date: string, amount: number, exceptId: string | null = null): T[] {
  const pence = Math.round(amount * 100);
  return live(expenses).filter((e) => e.id !== exceptId && e.date === date && Math.round(e.amount * 100) === pence);
}

export interface DuplicateGroup<T> {
  kind: 'file' | 'date-amount';
  expenses: T[];
}

/**
 * Every group of live costs that look like the same receipt. `fileHashes` maps
 * attachment id to a fingerprint: the one taken at upload, or one worked out
 * from the stored file for receipts added before upload fingerprints existed.
 */
export function findDuplicateReceipts<T extends Costs[number]>(expenses: T[], fileHashes: Map<string, string>): DuplicateGroup<T>[] {
  const costs = live(expenses);
  const groups: DuplicateGroup<T>[] = [];

  // Same file on different attachments
  const byHash = new Map<string, { attachments: Set<string>; expenses: Set<T> }>();
  for (const e of costs) {
    for (const id of e.attachmentIds) {
      const hash = e.attachmentHashes[id] ?? fileHashes.get(id);
      if (!hash) continue;
      const g = byHash.get(hash) ?? { attachments: new Set(), expenses: new Set() };
      g.attachments.add(id);
      g.expenses.add(e);
      byHash.set(hash, g);
    }
  }
  const fileGroups: Set<string>[] = [];
  for (const g of byHash.values()) {
    if (g.attachments.size < 2) continue;
    const list = [...g.expenses];
    // A file added twice to the same cost is still worth showing.
    groups.push({ kind: 'file', expenses: list });
    fileGroups.push(new Set(list.map((e) => e.id)));
  }

  // Same date and amount, unless they share a receipt (a split receipt) or were already listed as the same file
  const byDateAmount = new Map<string, T[]>();
  for (const e of costs) {
    const k = `${e.date}|${Math.round(e.amount * 100)}`;
    byDateAmount.set(k, [...(byDateAmount.get(k) ?? []), e]);
  }
  for (const list of byDateAmount.values()) {
    if (list.length < 2) continue;
    const shared = list.every((e) => e.attachmentIds.some((id) => list.some((o) => o !== e && o.attachmentIds.includes(id))));
    const alreadyListed = fileGroups.some((g) => list.every((e) => g.has(e.id)));
    if (shared || alreadyListed) continue;
    groups.push({ kind: 'date-amount', expenses: list });
  }

  for (const g of groups) g.expenses.sort((a, b) => a.date.localeCompare(b.date));
  return groups.sort((a, b) => b.expenses[0].date.localeCompare(a.expenses[0].date));
}
