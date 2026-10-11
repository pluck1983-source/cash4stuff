import { describe, expect, it } from 'vitest';
import { groupBySeller } from './sellers';
import { testPickup } from './fixtures';

describe('groupBySeller', () => {
  const p = (id: string, reference: string, date: string) => testPickup({ id, reference, date });

  it('puts a repeat seller in one group, placed by their latest pickup', () => {
    const groups = groupBySeller([p('a', 'Sarah Jones', '2026-10-01'), p('b', 'Tom', '2026-10-05'), p('c', 'sarah jones ', '2026-10-09')]);
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([['c', 'a'], ['b']]);
  });

  it("doesn't group pickups that only share an automatic name", () => {
    const groups = groupBySeller([p('a', 'Pickup 10 Oct 2026', '2026-10-10'), p('b', 'Pickup 10 Oct 2026', '2026-10-10')]);
    expect(groups).toHaveLength(2);
  });
});
