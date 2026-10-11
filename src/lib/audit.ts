import { pence, roundWeight } from './calc';
import type { AppState, Audited, EditRecord, PaymentMethod, Settings } from './types';

export const PAYMENT_LABELS: Record<Exclude<PaymentMethod, ''>, string> = { cash: 'Cash', bank: 'Bank transfer', other: 'Other' };

export function paymentLabel(method: PaymentMethod): string {
  return method ? PAYMENT_LABELS[method] : '';
}

export function isVoided(record: { voidedAt: string | null }): boolean {
  return record.voidedAt !== null;
}

/** The state with voided records taken out - what every total, chart and list of live records works from */
export function liveState(state: AppState): AppState {
  const live = <T extends { voidedAt: string | null }>(list: T[]) => (list.some(isVoided) ? list.filter((r) => !isVoided(r)) : list);
  const pickups = live(state.pickups);
  const expenses = live(state.expenses);
  const otherIncome = live(state.otherIncome);
  if (pickups === state.pickups && expenses === state.expenses && otherIncome === state.otherIncome) return state;
  return { ...state, pickups, expenses, otherIncome };
}

/** Weight x rate, with the weight rounded per Settings */
export function purchaseCost(weightKg: number, ratePerKg: number, settings: Settings): number {
  return pence(roundWeight(weightKg, settings.weightStepKg, settings.weightRounding) * ratePerKg);
}

export function nextReceiptNumber(state: AppState): number {
  return state.pickups.reduce((max, p) => Math.max(max, p.receiptNumber ?? 0), 0) + 1;
}

function shown(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Adds an edit-history entry when a record is changed after the day it was
 * entered (same-day corrections are just part of entering it). `fields` are
 * the ones worth logging.
 */
export function withHistory<T extends Pick<Audited, 'createdAt' | 'history'>>(before: T, after: T, now: string, fields: (keyof T)[]): T {
  if (localDay(before.createdAt) >= localDay(now)) return after;
  const changes: EditRecord['changes'] = {};
  for (const f of fields) {
    const a = shown(before[f]);
    const b = shown(after[f]);
    if (a !== b) changes[String(f)] = [a, b];
  }
  return Object.keys(changes).length ? { ...after, history: [...before.history, { at: now, changes }] } : after;
}

/** yyyy-mm-dd in the device's time zone */
function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function auditDefaults(createdAt: string): Audited {
  return { createdAt, voidedAt: null, voidReason: '', history: [] };
}
