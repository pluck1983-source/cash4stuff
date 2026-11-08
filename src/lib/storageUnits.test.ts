import { describe, expect, it } from 'vitest';
import type { AppState, Item } from './types';
import { emptyState } from './storage';
import { moveToNewUnit, policyWarnings, savePolicy, saveUnit, uninsuredUnits, type UnitInput } from './storageUnits';
import { retainUntil } from './evidence';
import { postDueRecurring } from './recurring';
import { mergeStates } from './sync/syncEngine';
import { coverWarnings } from './insurance';

const now = '2026-11-08T12:00:00.000Z';

function unitInput(over: Partial<UnitInput> = {}): UnitInput {
  return { company: 'Big Yellow', site: 'Swindon', address: '1 Road', postcode: 'SN1 1AA', unitNumber: '12', unitSize: '50 sq ft', accountRef: 'ACC1', phone: '01793 000000', email: '', noticePeriod: '', accessHours: '', area: 'Storage unit', startDate: '2026-06-01', notes: '', ...over };
}

function item(id: string, status: Item['status'], area = 'Storage unit'): Item {
  return { id, sku: id, pickupId: null, name: id, keywords: '', category: 'Tops', subcategory: '', gender: '', photoId: null, photoHash: null, location: { area, rack: 'A', box: '1' }, quantity: 1, listPrice: 10, priceHistory: [], status, listedDate: null, soldPrice: status === 'sold' ? 8 : null, soldDate: status === 'sold' ? '2026-07-01' : null, salesChannel: '', saleCosts: 0, history: [], notes: '', createdAt: now, updatedAt: now };
}

function withUnit(): { state: AppState; unitId: string } {
  const s0 = emptyState();
  s0.items = [item('a', 'listed'), item('b', 'in_stock'), item('c', 'sold')];
  const { state, unit } = saveUnit(s0, unitInput(), { amount: 60, frequency: 'monthly' }, now);
  return { state: savePolicy(state, { insurer: 'SAGIC', broker: 'Surewise', policyNumber: 'SW1', coverLevel: 'Silver', sumInsured: 5, premium: 40, premiumFrequency: 'yearly', startDate: '2026-06-01', endDate: '2027-06-01', claimsPhone: '', claimsEmail: '', unitId: unit.id, documentIds: [], notes: '' }, now), unitId: unit.id };
}

describe('storage units', () => {
  it('starts the rent as a repeating cost from the move-in date', () => {
    const { state } = withUnit();
    expect(state.recurring).toHaveLength(1);
    expect(state.recurring[0]).toMatchObject({ amount: 60, startDate: '2026-06-01', endDate: null, category: 'Storage' });
  });

  it('moving ends the old unit and its rent, and carries unsold stock and the policy across', () => {
    const { state, unitId } = withUnit();
    const posted = postDueRecurring(state, '2026-11-08');
    const r = moveToNewUnit(posted, unitId, unitInput({ company: 'Safestore', unitNumber: '7', area: 'Safestore 7' }), { amount: 70, frequency: 'monthly' }, { moveDate: '2026-10-15', moveStock: true, movePolicies: true }, now);
    const old = r.state.storageUnits.find((u) => u.id === unitId);
    expect(old?.endDate).toBe('2026-10-15');
    expect(r.state.recurring.find((p) => p.id === old?.recurringId)?.endDate).toBe('2026-10-14');
    // Rent posted for 1 Nov at the old unit is voided
    const oldRent = r.state.expenses.filter((e) => e.recurringId === old?.recurringId);
    expect(oldRent.find((e) => e.date === '2026-11-01')?.voidedAt).not.toBeNull();
    expect(oldRent.find((e) => e.date === '2026-10-01')?.voidedAt).toBeNull();
    expect(r.movedItems).toBe(2);
    expect(r.state.items.find((i) => i.id === 'c')?.location.area).toBe('Storage unit');
    expect(r.state.items.find((i) => i.id === 'a')?.location.area).toBe('Safestore 7');
    expect(r.state.settings.storageAreas).toContain('Safestore 7');
    expect(r.movedPolicies).toBe(1);
    expect(r.state.policies[0].unitId).toBe(r.unit.id);
  });

  it('flags a policy still pointing at a unit you moved out of, and underinsurance', () => {
    const { state, unitId } = withUnit();
    const moved = moveToNewUnit(state, unitId, unitInput({ area: 'New' }), null, { moveDate: '2026-10-15', moveStock: true, movePolicies: false }, now).state;
    const w = policyWarnings(moved, moved.policies[0], '2026-11-08').join(' ');
    expect(w).toMatch(/moved out of/);
    expect(uninsuredUnits(moved, '2026-11-08')).toHaveLength(1);
    expect(coverWarnings(moved, 'New', '2026-11-08').join(' ')).toMatch(/No current insurance/);
  });

  it('survives a sync merge and an old copy without the new lists', () => {
    const { state } = withUnit();
    const old = { ...emptyState() } as Partial<AppState>;
    delete old.storageUnits;
    delete old.policies;
    const merged = mergeStates(state, old as AppState);
    expect(merged.storageUnits).toHaveLength(1);
    expect(merged.policies).toHaveLength(1);
  });
});

describe('evidence retention', () => {
  it('keeps records 5 years after the filing deadline for their tax year', () => {
    expect(retainUntil('2026-11-10')).toBe('2033-01-31');
    expect(retainUntil('2027-04-05')).toBe('2033-01-31');
    expect(retainUntil('2027-04-06')).toBe('2034-01-31');
  });
});
