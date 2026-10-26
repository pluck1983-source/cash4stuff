import { describe, expect, it } from 'vitest';
import { customerChoices, groupBySeller, latestOpenPickupId, pickupChoices, sellerPickups, setResolved } from './sellers';
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

describe('customerChoices', () => {
  const p = (id: string, reference: string, date: string, resolvedAt: string | null = null) => testPickup({ id, reference, date, resolvedAt });

  it('lists every customer once, open ones first, filed under their newest open pickup', () => {
    const pickups = [p('a', 'Sarah', '2026-10-01'), p('b', 'Tom', '2026-10-05', '2026-10-06T00:00:00Z'), p('c', 'Sarah', '2026-10-09'), p('d', 'Ann', '2026-10-03')];
    expect(customerChoices(pickups).map((c) => [c.pickupId, c.finished])).toEqual([
      ['c', false],
      ['d', false],
      ['b', true],
    ]);
  });

  it("keeps a finished customer choosable, filed under their newest pickup", () => {
    const pickups = [p('a', 'Sarah', '2026-10-01', '2026-10-02T00:00:00Z'), p('b', 'Sarah', '2026-10-04', '2026-10-05T00:00:00Z')];
    expect(customerChoices(pickups).map((c) => c.pickupId)).toEqual(['b']);
  });

  it("keeps an item's existing pickup selected", () => {
    const pickups = [p('a', 'Sarah', '2026-10-01'), p('b', 'Sarah', '2026-10-04')];
    expect(customerChoices(pickups, 'a').map((c) => c.pickupId)).toEqual(['a']);
  });
});

describe('new customer groups', () => {
  const p = (id: string, date: string, startsNewGroup = false) => testPickup({ id, reference: 'Sarah', date, startsNewGroup });
  const pickups = [p('a', '2026-06-01'), p('b', '2026-06-20'), p('c', '2026-09-01', true), p('d', '2026-09-15'), testPickup({ id: 't', reference: 'Tom', date: '2026-09-02' })];

  it('splits a customer at the pickup that starts a new group; later pickups join it', () => {
    expect(groupBySeller(pickups).map((g) => g.map((x) => x.id))).toEqual([['d', 'c'], ['t'], ['b', 'a']]);
    expect(sellerPickups(pickups, 'a').map((x) => x.id)).toEqual(['a', 'b']);
    expect(sellerPickups(pickups, 'd').map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('labels each group with when it began once a customer has more than one', () => {
    expect(customerChoices(pickups).map((c) => c.label)).toEqual(['Sarah (from 1 Sept 2026)', 'Tom', 'Sarah (from 1 Jun 2026)']);
  });

  it('resolving marks only that group as done', () => {
    const next = setResolved(pickups, 'a', true, '2026-10-01T00:00:00Z');
    expect(next.filter((x) => x.resolvedAt).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
