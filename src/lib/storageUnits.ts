import type { AppState, Expense, InsurancePolicy, RecurringCost, RentFrequency, StorageUnit } from './types';
import { isHeld, itemCostMap, listValue } from './calc';
import { liveState } from './audit';
import { newId } from './storage';

/**
 * Storage units and insurance policies. Pure functions over the state so the
 * move-to-a-new-unit flow (end the old unit and its rent, start the new one,
 * carry the stock and the insurance across) can be tested on its own.
 */

export interface Rent {
  amount: number;
  frequency: RentFrequency;
}

export type UnitInput = Omit<StorageUnit, 'id' | 'updatedAt' | 'recurringId' | 'endDate'> & { id?: string; endDate?: string | null };

/** Category rent is posted under - "Storage" if it's in the list, so it lands in the premises box */
export function rentCategory(state: AppState): string {
  const cats = state.settings.expenseCategories;
  return cats.find((c) => c.toLowerCase() === 'storage') ?? cats.find((c) => /storage|rent/i.test(c)) ?? cats[0] ?? 'Storage';
}

export function unitLabel(u: Pick<StorageUnit, 'company' | 'site' | 'unitNumber'>): string {
  return [u.company || 'Storage unit', u.site, u.unitNumber && `unit ${u.unitNumber}`].filter(Boolean).join(' · ');
}

function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Voids rent already posted after a plan's new end date (posted ahead of a move that was entered late) */
function voidPostedAfter(expenses: Expense[], planId: string, endDate: string, now: string): Expense[] {
  return expenses.map((e) =>
    e.recurringId === planId && e.voidedAt === null && e.date > endDate
      ? { ...e, voidedAt: now, voidReason: 'After moving out of the storage unit', history: [...e.history, { at: now, changes: { voided: ['no', 'yes: after moving out of the storage unit'] } }], updatedAt: now }
      : e,
  );
}

function withArea(state: AppState, area: string, now: string): AppState {
  if (!area || state.settings.storageAreas.includes(area)) return state;
  return { ...state, settings: { ...state.settings, storageAreas: [...state.settings.storageAreas, area] }, settingsUpdatedAt: now };
}

/**
 * Adds or updates a unit and keeps its rent in step: a repeating cost is
 * started from the move-in date, its amount follows the form, and it stops
 * the day before the unit ends. rent = null leaves any existing plan alone.
 */
export function saveUnit(state: AppState, input: UnitInput, rent: Rent | null, now: string): { state: AppState; unit: StorageUnit } {
  const before = input.id ? state.storageUnits.find((u) => u.id === input.id) : undefined;
  const unit: StorageUnit = { ...input, id: before?.id ?? input.id ?? newId(), endDate: input.endDate ?? before?.endDate ?? null, recurringId: before?.recurringId ?? null, updatedAt: now };
  let recurring = state.recurring;
  let expenses = state.expenses;
  const plan = unit.recurringId ? recurring.find((r) => r.id === unit.recurringId) : undefined;
  const planEnd = unit.endDate ? dayBefore(unit.endDate) : null;
  const description = `Rent - ${unitLabel(unit)}`;
  if (plan) {
    const next: RecurringCost = { ...plan, ...(rent ? { amount: rent.amount, frequency: rent.frequency } : {}), description, endDate: planEnd ?? plan.endDate, updatedAt: now };
    recurring = recurring.map((r) => (r.id === plan.id ? next : r));
    if (next.endDate) expenses = voidPostedAfter(expenses, plan.id, next.endDate, now);
  } else if (rent && rent.amount > 0) {
    const created: RecurringCost = { id: newId(), category: rentCategory(state), description, amount: rent.amount, frequency: rent.frequency, startDate: unit.startDate, endDate: planEnd, introAmount: null, introPeriods: 0, pickupId: null, updatedAt: now };
    recurring = [...recurring, created];
    unit.recurringId = created.id;
  } else if (unit.recurringId && !plan) {
    unit.recurringId = null; // plan was stopped from the Repeating costs list
  }
  const storageUnits = before ? state.storageUnits.map((u) => (u.id === unit.id ? unit : u)) : [...state.storageUnits, unit];
  return { state: withArea({ ...state, storageUnits, recurring, expenses }, unit.area, now), unit };
}

/** Moves out: the unit is kept on record with an end date, and its rent stops the day before */
export function endUnit(state: AppState, id: string, endDate: string, now: string): AppState {
  const unit = state.storageUnits.find((u) => u.id === id);
  if (!unit) return state;
  return saveUnit(state, { ...unit, endDate }, null, now).state;
}

export interface MoveOptions {
  /** The day stock moves - the old unit ends and the new one starts */
  moveDate: string;
  /** Relabel unsold stock in the old unit's area as being in the new unit */
  moveStock: boolean;
  /** Point the old unit's insurance at the new one (the insurer must be told separately) */
  movePolicies: boolean;
}

/** Switching company or unit in one go */
export function moveToNewUnit(state: AppState, fromId: string, next: UnitInput, rent: Rent | null, opts: MoveOptions, now: string): { state: AppState; unit: StorageUnit; movedItems: number; movedPolicies: number } {
  const from = state.storageUnits.find((u) => u.id === fromId);
  let s = from ? endUnit(state, fromId, opts.moveDate, now) : state;
  const saved = saveUnit(s, { ...next, id: undefined, startDate: opts.moveDate, endDate: null }, rent, now);
  s = saved.state;
  let movedItems = 0;
  if (from && opts.moveStock && from.area && from.area !== saved.unit.area) {
    s = {
      ...s,
      items: s.items.map((i) => {
        if (!isHeld(i) || i.location.area !== from.area) return i;
        movedItems++;
        return { ...i, location: { ...i.location, area: saved.unit.area }, updatedAt: now };
      }),
    };
  }
  let movedPolicies = 0;
  if (from && opts.movePolicies) {
    s = {
      ...s,
      policies: s.policies.map((p) => {
        if (p.unitId !== from.id || (p.endDate && p.endDate < opts.moveDate)) return p;
        movedPolicies++;
        return { ...p, unitId: saved.unit.id, updatedAt: now };
      }),
    };
  }
  return { state: s, unit: saved.unit, movedItems, movedPolicies };
}

export function savePolicy(state: AppState, input: Omit<InsurancePolicy, 'id' | 'updatedAt'> & { id?: string }, now: string): AppState {
  const policy: InsurancePolicy = { ...input, id: input.id ?? newId(), updatedAt: now };
  const exists = state.policies.some((p) => p.id === policy.id);
  return { ...state, policies: exists ? state.policies.map((p) => (p.id === policy.id ? policy : p)) : [...state.policies, policy] };
}

export function currentUnits(state: AppState): StorageUnit[] {
  return state.storageUnits.filter((u) => u.endDate === null).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function pastUnits(state: AppState): StorageUnit[] {
  return state.storageUnits.filter((u) => u.endDate !== null).sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
}

/** The unit stock in this area is in now */
export function unitForArea(state: AppState, area: string): StorageUnit | undefined {
  return currentUnits(state).find((u) => u.area === area);
}

export function isPolicyActive(p: Pick<InsurancePolicy, 'startDate' | 'endDate'>, today: string): boolean {
  return p.startDate <= today && (p.endDate === null || p.endDate >= today);
}

export function policiesForUnit(state: AppState, unitId: string, today: string): InsurancePolicy[] {
  return state.policies.filter((p) => p.unitId === unitId && isPolicyActive(p, today));
}

/** What the stock in a unit is worth: cost (what was paid) and asking price */
export function unitStockValue(state: AppState, unit: Pick<StorageUnit, 'area'>): { pieces: number; cost: number; asking: number } {
  const costs = itemCostMap(liveState(state));
  const held = state.items.filter((i) => isHeld(i) && i.location.area === unit.area);
  return {
    pieces: held.reduce((t, i) => t + i.quantity, 0),
    cost: held.reduce((t, i) => t + (costs.get(i.id) ?? 0), 0),
    asking: held.reduce((t, i) => t + listValue(i), 0),
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Things to sort out with a policy, most urgent first */
export function policyWarnings(state: AppState, p: InsurancePolicy, today: string): string[] {
  const out: string[] = [];
  if (p.endDate && p.endDate < today) out.push(`Ended ${p.endDate} - stock isn't covered by it`);
  else if (p.endDate && daysBetween(today, p.endDate) <= 30) out.push(`Renews or ends in ${daysBetween(today, p.endDate)} days (${p.endDate})`);
  if (p.startDate > today) out.push(`Doesn't start until ${p.startDate}`);
  const unit = p.unitId ? state.storageUnits.find((u) => u.id === p.unitId) : undefined;
  if (p.unitId && !unit) out.push('The unit it covered has been deleted');
  if (unit?.endDate && unit.endDate <= today && (!p.endDate || p.endDate >= today)) out.push(`Still set to ${unitLabel(unit)}, which you moved out of - tell the insurer the new address`);
  if (unit && p.sumInsured !== null) {
    const v = unitStockValue(state, unit);
    if (v.cost > p.sumInsured) out.push(`Stock cost £${v.cost.toFixed(0)} is more than the £${p.sumInsured.toFixed(0)} insured`);
  }
  if (!p.policyNumber) out.push('No policy number recorded');
  return out;
}

/** Units with stock in them but no live policy */
export function uninsuredUnits(state: AppState, today: string): StorageUnit[] {
  return currentUnits(state).filter((u) => policiesForUnit(state, u.id, today).length === 0 && unitStockValue(state, u).pieces > 0);
}
