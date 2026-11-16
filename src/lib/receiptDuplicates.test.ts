import { describe, expect, it } from 'vitest';
import { costsSameDateAmount, costsWithFile, findDuplicateReceipts } from './receiptDuplicates';

type C = { id: string; date: string; amount: number; attachmentIds: string[]; attachmentHashes: Record<string, string>; voidedAt: string | null };
const cost = (id: string, date: string, amount: number, files: Record<string, string | null> = {}, voidedAt: string | null = null): C => ({
  id,
  date,
  amount,
  attachmentIds: Object.keys(files),
  attachmentHashes: Object.fromEntries(Object.entries(files).filter((e): e is [string, string] => e[1] !== null)),
  voidedAt,
});

describe('costsWithFile', () => {
  const costs = [cost('a', '2026-11-01', 5, { p1: 'h1' }), cost('b', '2026-11-02', 6, { p2: 'h2' }, '2026-11-03')];
  it('finds a live cost with the same file', () => expect(costsWithFile(costs, 'h1').map((c) => c.id)).toEqual(['a']));
  it('leaves out the cost being edited', () => expect(costsWithFile(costs, 'h1', 'a')).toEqual([]));
  it('ignores voided costs and missing fingerprints', () => {
    expect(costsWithFile(costs, 'h2')).toEqual([]);
    expect(costsWithFile(costs, null)).toEqual([]);
  });
});

describe('costsSameDateAmount', () => {
  it('matches to the penny on the same date', () => {
    const costs = [cost('a', '2026-11-01', 12.3), cost('b', '2026-11-01', 12.31), cost('c', '2026-11-02', 12.3)];
    expect(costsSameDateAmount(costs, '2026-11-01', 12.30000001).map((c) => c.id)).toEqual(['a']);
  });
});

describe('findDuplicateReceipts', () => {
  it('reports the same file on two costs', () => {
    const groups = findDuplicateReceipts([cost('a', '2026-11-01', 5, { p1: 'h' }), cost('b', '2026-11-04', 7, { p2: 'h' })], new Map());
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('file');
    expect(groups[0].expenses.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('uses fingerprints of stored files for older receipts', () => {
    const groups = findDuplicateReceipts([cost('a', '2026-11-01', 5, { p1: null }), cost('b', '2026-11-04', 7, { p2: null })], new Map([['p1', 'x'], ['p2', 'x']]));
    expect(groups.map((g) => g.kind)).toEqual(['file']);
  });

  it('does not report lines split off one receipt (they share one attachment)', () => {
    expect(findDuplicateReceipts([cost('a', '2026-11-01', 3, { p1: 'h' }), cost('b', '2026-11-01', 3, { p1: 'h' })], new Map())).toEqual([]);
  });

  it('reports two costs with the same date and amount', () => {
    const groups = findDuplicateReceipts([cost('a', '2026-11-01', 9.99, { p1: 'h1' }), cost('b', '2026-11-01', 9.99, { p2: 'h2' }), cost('c', '2026-11-01', 4)], new Map());
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('date-amount');
  });

  it('lists a pair once when it is both the same file and the same date and amount', () => {
    const groups = findDuplicateReceipts([cost('a', '2026-11-01', 5, { p1: 'h' }), cost('b', '2026-11-01', 5, { p2: 'h' })], new Map());
    expect(groups.map((g) => g.kind)).toEqual(['file']);
  });

  it('does not repeat a date-and-amount pair already inside a same-file group', () => {
    const groups = findDuplicateReceipts([cost('a', '2026-11-01', 5, { p1: 'h' }), cost('b', '2026-11-01', 7, { p2: 'h' }), cost('c', '2026-11-01', 5, { p3: 'h' })], new Map());
    expect(groups.map((g) => g.kind)).toEqual(['file']);
  });

  it('ignores voided costs', () => {
    expect(findDuplicateReceipts([cost('a', '2026-11-01', 5, { p1: 'h' }), cost('b', '2026-11-01', 5, { p2: 'h' }, '2026-11-02')], new Map())).toEqual([]);
  });
});
