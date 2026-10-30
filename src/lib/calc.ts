import type { AppState, Item, ItemGender, ItemStatus, Pickup, Settings, WeightRounding } from './types';
import { groupKeys, sellerKey, sellerPickups } from './sellers';

/** Rounds money to whole pence so totals don't drift with floating point */
export function pence(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundWeight(weightKg: number, stepKg: number, mode: WeightRounding): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (mode === 'none' || stepKg <= 0) return weightKg;
  const steps = weightKg / stepKg;
  // Guard against 2.9999999 style float noise tipping a value over a step boundary.
  const fixed = Math.round(steps * 1e6) / 1e6;
  const rounded = mode === 'up' ? Math.ceil(fixed) : mode === 'down' ? Math.floor(fixed) : Math.round(fixed);
  return rounded * stepKg;
}

export function calculatedPickupCost(weightKg: number, settings: Settings): number {
  return pence(roundWeight(weightKg, settings.weightStepKg, settings.weightRounding) * settings.costPerKg);
}

/** What the pickup cost to buy - saved when it was entered, so later rate changes don't alter it */
export function pickupStockCost(pickup: Pickup, _settings?: Settings): number {
  return pickup.amountPaid;
}

export function isSold(item: Item): boolean {
  return item.status === 'sold' && item.soldPrice !== null;
}

/** Items still held (not sold, not written off) */
export function isHeld(item: Item): boolean {
  return item.status === 'in_stock' || item.status === 'listed';
}

export interface PickupStats {
  pickup: Pickup;
  stockCost: number;
  /** Expenses tagged to this pickup (fuel, parking...) */
  linkedCosts: number;
  totalCost: number;
  itemCount: number;
  soldCount: number;
  heldCount: number;
  /** Gross sale prices of sold items */
  salesRevenue: number;
  /** Fees/postage on those sales */
  saleCosts: number;
  otherIncome: number;
  /** Sum of list prices on items still held */
  heldListValue: number;
  /** Money in minus money out so far */
  realisedProfit: number;
  /** Realised profit plus what the held stock would fetch at list price */
  projectedProfit: number;
  /** Realised return on cost, null when the pickup cost nothing */
  roi: number | null;
  /** Average buy cost per logged item */
  costPerItem: number | null;
}

export function pickupStats(state: AppState, pickup: Pickup): PickupStats {
  return statsFor(state, pickup, [pickup]);
}

/**
 * Figures for everything bought from a customer, across all their pickups -
 * items are logged against the customer, so a single pickup's share isn't
 * known. `pickup` is the customer's newest one (shown as the row's pickup).
 */
export function customerStats(state: AppState, pickupId: string): PickupStats | null {
  const pickups = sellerPickups(state.pickups, pickupId).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  return pickups.length ? statsFor(state, pickups[0], pickups) : null;
}

function statsFor(state: AppState, pickup: Pickup, pickups: Pickup[]): PickupStats {
  const ids = new Set(pickups.map((p) => p.id));
  const items = state.items.filter((i) => i.pickupId !== null && ids.has(i.pickupId));
  const sold = items.filter(isSold);
  const held = items.filter(isHeld);
  const stockCost = pence(sum(pickups.map((p) => pickupStockCost(p, state.settings))));
  const linkedCosts = pence(sum(state.expenses.filter((e) => e.pickupId !== null && ids.has(e.pickupId)).map((e) => e.amount)));
  const otherIncome = pence(sum(state.otherIncome.filter((o) => o.pickupId !== null && ids.has(o.pickupId)).map((o) => o.amount)));
  const salesRevenue = pence(sum(sold.map((i) => i.soldPrice ?? 0)));
  const saleCosts = pence(sum(sold.map((i) => i.saleCosts)));
  const heldListValue = pence(sum(held.map(listValue)));
  const totalCost = pence(stockCost + linkedCosts);
  const realisedProfit = pence(salesRevenue + otherIncome - saleCosts - totalCost);
  return {
    pickup,
    stockCost,
    linkedCosts,
    totalCost,
    itemCount: units(items),
    soldCount: units(sold),
    heldCount: units(held),
    salesRevenue,
    saleCosts,
    otherIncome,
    heldListValue,
    realisedProfit,
    projectedProfit: pence(realisedProfit + heldListValue),
    roi: totalCost > 0 ? realisedProfit / totalCost : null,
    costPerItem: items.length > 0 ? pence(stockCost / units(items)) : null,
  };
}

export interface Period {
  /** Inclusive ISO dates; null = unbounded */
  from: string | null;
  to: string | null;
}

export const ALL_TIME: Period = { from: null, to: null };

export function inPeriod(date: string | null, period: Period): boolean {
  if (!date) return false;
  const day = date.slice(0, 10);
  if (period.from && day < period.from) return false;
  if (period.to && day > period.to) return false;
  return true;
}

export type PeriodKey = 'month' | 'last_month' | 'year' | 'tax_year' | 'all';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  month: 'This month',
  last_month: 'Last month',
  year: 'This year',
  tax_year: 'This tax year',
  all: 'All time',
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function periodFor(key: PeriodKey, today = new Date()): Period {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case 'month':
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case 'last_month':
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'tax_year': {
      // UK tax year runs 6 April - 5 April.
      const startYear = isoDate(today) >= `${y}-04-06` ? y : y - 1;
      return { from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` };
    }
    case 'all':
      return ALL_TIME;
  }
}

export interface Totals {
  /** Paid for stock (pickups) in the period */
  stockCost: number;
  /** All other business costs (fuel, rent, bags, equipment...) in the period */
  runningCosts: number;
  /** Fees/postage on sales in the period */
  saleCosts: number;
  totalCosts: number;
  salesIncome: number;
  otherIncome: number;
  totalIncome: number;
  netProfit: number;
  itemsSold: number;
  itemsAdded: number;
  pickups: number;
  kgBought: number;
  averageSalePrice: number | null;
  /** Asking price (at the time of sale) of the items sold in the period that had one */
  soldListValue: number;
  /** What those same items actually sold for */
  soldAgainstListValue: number;
  /** Sold price as a share of asking price, e.g. 0.85 = sold for 85% of list on average; null if nothing to compare */
  soldVsList: number | null;
  /** Current snapshot - not limited to the period */
  heldItems: number;
  listedItems: number;
  unpricedItems: number;
  /** Sum of list prices of everything still held - current snapshot */
  stockListValue: number;
  /** Buy cost of held stock, apportioned per item from its pickup - current snapshot */
  stockBookCost: number;
}

export function totals(state: AppState, period: Period = ALL_TIME): Totals {
  const pickups = state.pickups.filter((p) => inPeriod(p.date, period));
  const stockCost = pence(sum(pickups.map((p) => pickupStockCost(p, state.settings))));
  const runningCosts = pence(sum(state.expenses.filter((e) => inPeriod(e.date, period)).map((e) => e.amount)));
  const soldInPeriod = state.items.filter((i) => isSold(i) && inPeriod(i.soldDate, period));
  const salesIncome = pence(sum(soldInPeriod.map((i) => i.soldPrice ?? 0)));
  const saleCosts = pence(sum(soldInPeriod.map((i) => i.saleCosts)));
  const otherIncome = pence(sum(state.otherIncome.filter((o) => inPeriod(o.date, period)).map((o) => o.amount)));
  const totalCosts = pence(stockCost + runningCosts + saleCosts);
  const totalIncome = pence(salesIncome + otherIncome);
  const held = state.items.filter(isHeld);
  const perItemCost = itemCostMap(state);
  const compared = soldInPeriod.filter((i) => i.listPrice !== null && i.listPrice > 0);
  const soldListValue = pence(sum(compared.map(listValue)));
  const soldAgainstListValue = pence(sum(compared.map((i) => i.soldPrice ?? 0)));
  return {
    stockCost,
    runningCosts,
    saleCosts,
    totalCosts,
    salesIncome,
    otherIncome,
    totalIncome,
    netProfit: pence(totalIncome - totalCosts),
    itemsSold: units(soldInPeriod),
    // Split-off sales share their stock record's added date, so they aren't counted twice.
    itemsAdded: units(state.items.filter((i) => inPeriod(i.createdAt, period))),
    pickups: pickups.length,
    kgBought: sum(pickups.map((p) => p.weightKg)),
    averageSalePrice: soldInPeriod.length ? pence(salesIncome / units(soldInPeriod)) : null,
    soldListValue,
    soldAgainstListValue,
    soldVsList: soldListValue > 0 ? soldAgainstListValue / soldListValue : null,
    heldItems: units(held),
    listedItems: units(held.filter((i) => i.status === 'listed')),
    unpricedItems: units(held.filter((i) => i.listPrice === null)),
    stockListValue: pence(sum(held.map(listValue))),
    stockBookCost: pence(sum(held.map((i) => perItemCost.get(i.id) ?? 0))),
  };
}

/** Each item's share of its pickup's stock cost (split evenly across the items logged from it) */
/** Units a record stands for - most are single pieces */
export function units(items: Item[]): number {
  return sum(items.map((i) => i.quantity));
}

/** Asking value of a record: price each × how many */
export function listValue(item: Item): number {
  return (item.listPrice ?? 0) * item.quantity;
}

/** Buy cost of each item: what was paid for its customer group, over all its pickups, shared across every piece logged to it */
export function itemCostMap(state: AppState): Map<string, number> {
  const groups = groupKeys(state.pickups);
  const paid = new Map<string, number>();
  for (const p of state.pickups) {
    const key = groups.get(p.id) ?? '';
    paid.set(key, (paid.get(key) ?? 0) + pickupStockCost(p, state.settings));
  }
  const keyOf = (item: Item) => (item.pickupId ? (groups.get(item.pickupId) ?? null) : null);
  const counts = new Map<string, number>();
  for (const item of state.items) {
    const key = keyOf(item);
    if (key) counts.set(key, (counts.get(key) ?? 0) + item.quantity);
  }
  const result = new Map<string, number>();
  for (const item of state.items) {
    const key = keyOf(item);
    if (key) result.set(item.id, ((paid.get(key) ?? 0) / (counts.get(key) ?? 1)) * item.quantity);
  }
  return result;
}

export interface MonthPoint {
  /** yyyy-mm */
  month: string;
  label: string;
  income: number;
  stockCost: number;
  runningCosts: number;
  profit: number;
  totals: Totals;
}

/** Month-by-month income and costs for the last `count` months, oldest first */
export function monthlySeries(state: AppState, count = 12, today = new Date()): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const start = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const t = totals(state, { from: isoDate(start), to: isoDate(end) });
    points.push({
      month: isoDate(start).slice(0, 7),
      label: start.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      income: t.totalIncome,
      stockCost: t.stockCost,
      runningCosts: pence(t.runningCosts + t.saleCosts),
      profit: t.netProfit,
      totals: t,
    });
  }
  return points;
}

export function expensesByCategory(state: AppState, period: Period = ALL_TIME): { category: string; amount: number }[] {
  const byCat = new Map<string, number>();
  for (const e of state.expenses) {
    if (!inPeriod(e.date, period)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  }
  return [...byCat.entries()].map(([category, amount]) => ({ category, amount: pence(amount) })).sort((a, b) => b.amount - a.amount);
}

export function salesByCategory(state: AppState, period: Period = ALL_TIME): { category: string; amount: number; count: number }[] {
  const byCat = new Map<string, { amount: number; count: number }>();
  for (const i of state.items) {
    if (!isSold(i) || !inPeriod(i.soldDate, period)) continue;
    const entry = byCat.get(i.category) ?? { amount: 0, count: 0 };
    entry.amount += i.soldPrice ?? 0;
    entry.count += i.quantity;
    byCat.set(i.category, entry);
  }
  return [...byCat.entries()]
    .map(([category, v]) => ({ category, amount: pence(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount);
}

/** First asking price the item had (before any reductions) */
export function originalListPrice(item: Item): number | null {
  return item.priceHistory[0]?.price ?? item.listPrice;
}

/** How much the asking price has dropped since first listed, as a share (0.2 = 20% off) */
export function priceDrop(item: Item): number | null {
  const original = originalListPrice(item);
  if (!original || item.listPrice === null) return null;
  return (original - item.listPrice) / original;
}

export interface ItemFilter {
  text: string;
  /** Empty = any */
  category: string;
  /** Empty = any; only meaningful with a category */
  subcategory: string;
  gender: ItemGender;
  status: ItemStatus | 'held' | '';
  /** Any one of the customer's pickups - matches items from all of them */
  pickupId: string;
  area: string;
  rack: string;
  box: string;
  minPrice: number | null;
  maxPrice: number | null;
  /** Only unsold items with no list price yet - sold and written-off ones don't need one */
  unpriced: boolean;
  /** Only items flagged to check: the photo AI was unsure, or there's no category */
  needsCheck: boolean;
}

/** Category filter value for items whose category is blank or no longer in Settings */
export const UNCATEGORISED = '__uncategorised__';

export const EMPTY_FILTER: ItemFilter = {
  text: '',
  category: '',
  subcategory: '',
  gender: '',
  status: '',
  pickupId: '',
  area: '',
  rack: '',
  box: '',
  minPrice: null,
  maxPrice: null,
  unpriced: false,
  needsCheck: false,
};

/** Still needs an asking price: unsold with none set yet (bulk photo adds leave it blank) */
export function isUnpriced(item: Item): boolean {
  return isHeld(item) && !item.listPrice;
}

/** The photo AI was unsure of its guess, or the item has no category yet */
export function needsCheck(item: Pick<Item, 'needsCheck' | 'category'>): boolean {
  return item.needsCheck === true || !item.category;
}

export function filterItems(state: AppState, filter: ItemFilter): Item[] {
  const text = filter.text.trim().toLowerCase();
  const pickupsById = new Map(state.pickups.map((p) => [p.id, p]));
  const groups = groupKeys(state.pickups);
  const customer = filter.pickupId ? (groups.get(filter.pickupId) ?? `missing:${filter.pickupId}`) : '';
  return state.items.filter((i) => {
    if (filter.category === UNCATEGORISED ? state.settings.categories.includes(i.category) : filter.category && i.category !== filter.category) return false;
    if (filter.category && filter.subcategory && i.subcategory !== filter.subcategory) return false;
    if (filter.gender && i.gender !== filter.gender) return false;
    if (filter.status === 'held' ? !isHeld(i) : filter.status && i.status !== filter.status) return false;
    if (customer && (!i.pickupId || groups.get(i.pickupId) !== customer)) return false;
    if (filter.area && i.location.area !== filter.area) return false;
    if (filter.rack && i.location.rack.toLowerCase() !== filter.rack.trim().toLowerCase()) return false;
    if (filter.box && i.location.box.toLowerCase() !== filter.box.trim().toLowerCase()) return false;
    if (filter.unpriced && !isUnpriced(i)) return false;
    if (filter.needsCheck && !needsCheck(i)) return false;
    const price = i.status === 'sold' ? i.soldPrice : i.listPrice;
    if (filter.minPrice !== null && (price ?? 0) < filter.minPrice) return false;
    if (filter.maxPrice !== null && (price ?? 0) > filter.maxPrice) return false;
    if (text) {
      const pickup = i.pickupId ? pickupsById.get(i.pickupId) : undefined;
      const haystack = [i.sku, i.name, i.keywords, i.category, i.subcategory, GENDER_LABELS[i.gender], i.notes, i.salesChannel, i.location.area, i.location.rack, i.location.box, pickup?.reference ?? '']
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

export const GENDER_LABELS: Record<ItemGender, string> = { '': '', mens: "Men's", womens: "Women's", boys: 'Boys', girls: 'Girls' };
export const GENDER_OPTIONS: ItemGender[] = ['mens', 'womens', 'boys', 'girls'];

/** "Women's · Tops · T-shirts", or just "Tops" */
export function categoryLabel(item: Pick<Item, 'category' | 'subcategory'> & { gender?: ItemGender }): string {
  return [item.gender ? GENDER_LABELS[item.gender] : '', item.category, item.subcategory].filter(Boolean).join(' · ');
}

export function locationLabel(loc: { area: string; rack: string; box: string }): string {
  return [loc.area, loc.rack && `Rack ${loc.rack}`, loc.box && `Box ${loc.box}`].filter(Boolean).join(' · ');
}

function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export interface NewGroupSuggestion {
  /** The customer's latest pickup before this one */
  latest: Pickup;
  days: number;
  /** Pieces from their current group still in stock or listed */
  itemsLeft: number;
}

/**
 * Whether a new pickup from a repeat customer should be offered a fresh group:
 * their last pickup was at least newGroupAfterDays ago and no more than
 * newGroupItemsLeft pieces from their current group are left to sell.
 */
export function suggestNewGroup(state: AppState, reference: string, date: string): NewGroupSuggestion | null {
  const key = sellerKey({ reference });
  if (!key) return null;
  const latest = state.pickups.filter((p) => sellerKey(p) === key).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0];
  if (!latest) return null;
  const ids = new Set(sellerPickups(state.pickups, latest.id).map((p) => p.id));
  const itemsLeft = units(state.items.filter((i) => i.pickupId !== null && ids.has(i.pickupId) && isHeld(i)));
  const days = Math.round((Date.parse(date) - Date.parse(latest.date)) / 86_400_000);
  const { newGroupAfterDays, newGroupItemsLeft } = state.settings;
  return days >= newGroupAfterDays && itemsLeft <= newGroupItemsLeft ? { latest, days, itemsLeft } : null;
}
