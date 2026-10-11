import { describe, expect, it } from 'vitest';
import { groupBySeller, latestOpenPickupId, pickupChoices, setResolved } from './sellers';
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

describe('pickupChoices', () => {
  const p = (id: string, reference: string, date: string, resolvedAt: string | null = null) => testPickup({ id, reference, date, resolvedAt });

  it("shows each seller once, linked to their newest open pickup", () => {
    const pickups = [p('a', 'Sarah', '2026-10-01'), p('b', 'Tom', '2026-10-05'), p('c', 'Sarah', '2026-10-09', '2026-10-10T00:00:00Z')];
    expect(pickupChoices(pickups).map((c) => [c.pickupId, c.count])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('leaves out a seller whose pickups are all resolved, unless the item is already on one', () => {
    const pickups = [p('a', 'Sarah', '2026-10-01', '2026-10-02T00:00:00Z'), p('b', 'Tom', '2026-10-05')];
    expect(pickupChoices(pickups).map((c) => c.pickupId)).toEqual(['b']);
    expect(pickupChoices(pickups, 'a').map((c) => c.pickupId)).toEqual(['b', 'a']);
    expect(latestOpenPickupId(pickups)).toBe('b');
  });
});

describe('setResolved', () => {
  const now = '2026-10-11T12:00:00.000Z';
  const pickups = [testPickup({ id: 'a', reference: 'Sarah' }), testPickup({ id: 'b', reference: 'sarah' }), testPickup({ id: 'c', reference: 'Tom' })];

  it('resolves all of the seller\'s pickups and nobody else\'s', () => {
    const next = setResolved(pickups, 'a', true, now);
    expect(next.map((x) => x.resolvedAt)).toEqual([now, now, null]);
    expect(next[2]).toBe(pickups[2]);
  });

  it('undo reopens them all', () => {
    const next = setResolved(setResolved(pickups, 'b', true, now), 'a', false, now);
    expect(next.every((x) => x.resolvedAt === null)).toBe(true);
  });

  it('only touches the one pickup when it has an automatic name', () => {
    const auto = [testPickup({ id: 'a', reference: 'Pickup 10 Oct 2026' }), testPickup({ id: 'b', reference: 'Pickup 10 Oct 2026' })];
    expect(setResolved(auto, 'a', true, now).map((x) => x.resolvedAt)).toEqual([now, null]);
  });
});
