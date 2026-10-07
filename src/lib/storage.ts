import { GENDER_LABELS } from './calc';
import type { AppState, Employment, Expense, Item, OtherIncome, Pickup, PricePoint, Settings, TaxExpenseBox } from './types';

const STORAGE_KEY = 'cash4stuff-state-v1';

export const DEFAULT_SETTINGS: Settings = {
  costPerKg: 1,
  weightStepKg: 0.5,
  weightRounding: 'nearest',
  categories: [
    'Tops',
    'Jumpers & knitwear',
    'Coats & jackets',
    'Jeans & trousers',
    'Shorts',
    'Dresses',
    'Skirts',
    'Sportswear',
    'Shoes',
    'Bags',
    'Accessories',
    'Kids',
    'Other',
  ],
  subcategories: {
    Tops: ['T-shirts', 'Shirts & blouses', 'Vests', 'Hoodies & sweats'],
    'Jeans & trousers': ['Jeans', 'Trousers', 'Joggers'],
  },
  storageAreas: ['Garage', 'Spare room', 'Storage unit'],
  salesChannels: ['Vinted', 'eBay', 'Depop', 'Facebook Marketplace', 'In person'],
  expenseCategories: [
    'Fuel',
    'Storage',
    'Rent',
    'Shipping bags & packaging',
    'Postage',
    'Equipment',
    'Cleaning & repairs',
    'Selling fees',
    'Advertising',
    'Other stock purchase',
    'Other',
  ],
  expenseTaxBoxes: {
    Fuel: 'travel',
    Storage: 'premises',
    Rent: 'premises',
    'Shipping bags & packaging': 'goods',
    Postage: 'office',
    Equipment: 'other',
    'Cleaning & repairs': 'repairs',
    'Selling fees': 'other',
    Advertising: 'advertising',
    'Other stock purchase': 'goods',
    Other: 'other',
  },
};

const TAX_BOXES: TaxExpenseBox[] = ['goods', 'travel', 'staff', 'premises', 'repairs', 'office', 'advertising', 'interest', 'financial', 'professional', 'other', 'not_allowable'];

function taxBoxes(value: unknown): Record<string, TaxExpenseBox> {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS.expenseTaxBoxes };
  const result: Record<string, TaxExpenseBox> = {};
  for (const [k, v] of Object.entries(value)) if (TAX_BOXES.includes(v as TaxExpenseBox)) result[k] = v as TaxExpenseBox;
  return result;
}

function priceHistory(value: unknown, listPrice: number | null, createdAt: string): PricePoint[] {
  const points = records(value)
    .filter((p) => typeof p.price === 'number' && typeof p.date === 'string')
    .map((p) => ({ date: p.date as string, price: p.price as number }));
  // Older data had no history - start it from the current price.
  if (points.length === 0 && listPrice !== null) return [{ date: createdAt.slice(0, 10), price: listPrice }];
  return points;
}

export function emptyState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, expenseTaxBoxes: { ...DEFAULT_SETTINGS.expenseTaxBoxes } },
    settingsUpdatedAt: EPOCH,
    pickups: [],
    items: [],
    expenses: [],
    otherIncome: [],
    employments: [],
    tombstones: {},
    deletedPhotoIds: [],
  };
}

/** Timestamp for untouched defaults, so any real edit on another device wins a merge */
export const EPOCH = '1970-01-01T00:00:00.000Z';

export function newId(): string {
  return crypto.randomUUID();
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normaliseState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearLocalState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportStateAsJson(state: AppState): string {
  return JSON.stringify(state);
}

export function importStateFromJson(text: string): AppState {
  return normaliseState(JSON.parse(text));
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : fallback;
}

function subcategoryMap(value: unknown, fallback: Record<string, string[]>): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) return { ...fallback };
  const result: Record<string, string[]> = {};
  for (const [cat, subs] of Object.entries(value)) {
    const list = strList(subs, []);
    if (list.length) result[cat] = list;
  }
  return result;
}

/** Categories as editable text: one per line, sub-categories after a colon ("Tops: T-shirts, Shirts") */
export function categoriesToText(settings: Pick<Settings, 'categories' | 'subcategories'>): string {
  return settings.categories.map((c) => (settings.subcategories[c]?.length ? `${c}: ${settings.subcategories[c].join(', ')}` : c)).join('\n');
}

export function parseCategoriesText(text: string): Pick<Settings, 'categories' | 'subcategories'> {
  const categories: string[] = [];
  const subcategories: Record<string, string[]> = {};
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    const name = (colon === -1 ? line : line.slice(0, colon)).trim();
    if (!name) continue;
    if (!categories.includes(name)) categories.push(name);
    if (colon === -1) continue;
    const subs = line
      .slice(colon + 1)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (subs.length) subcategories[name] = [...new Set([...(subcategories[name] ?? []), ...subs])];
  }
  return { categories, subcategories };
}

function tombstones(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof value !== 'object' || value === null) return result;
  for (const [id, at] of Object.entries(value)) if (typeof at === 'string') result[id] = at;
  return result;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];
}

/**
 * Fills in anything missing from stored/imported/synced data so older or
 * hand-edited files can't crash the app. Throws only if it isn't an object at all.
 */
export function normaliseState(raw: unknown): AppState {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a Wardrobe to Wallet data file');
  const r = raw as Record<string, unknown>;
  const s = (typeof r.settings === 'object' && r.settings !== null ? r.settings : {}) as Record<string, unknown>;
  const rounding = s.weightRounding;
  const settings: Settings = {
    costPerKg: num(s.costPerKg, DEFAULT_SETTINGS.costPerKg),
    weightStepKg: num(s.weightStepKg, DEFAULT_SETTINGS.weightStepKg),
    weightRounding: rounding === 'up' || rounding === 'down' || rounding === 'none' || rounding === 'nearest' ? rounding : 'nearest',
    categories: strList(s.categories, DEFAULT_SETTINGS.categories),
    subcategories: subcategoryMap(s.subcategories, Array.isArray(s.categories) ? {} : DEFAULT_SETTINGS.subcategories),
    storageAreas: strList(s.storageAreas, DEFAULT_SETTINGS.storageAreas),
    salesChannels: strList(s.salesChannels, DEFAULT_SETTINGS.salesChannels),
    expenseCategories: strList(s.expenseCategories, DEFAULT_SETTINGS.expenseCategories),
    expenseTaxBoxes: taxBoxes(s.expenseTaxBoxes),
  };
  const now = new Date().toISOString();
  const pickups: Pickup[] = records(r.pickups).map((p) => ({
    id: str(p.id) || newId(),
    date: str(p.date, now.slice(0, 10)),
    reference: str(p.reference),
    weightKg: num(p.weightKg),
    costOverride: numOrNull(p.costOverride),
    notes: str(p.notes),
    createdAt: str(p.createdAt, now),
    updatedAt: str(p.updatedAt, EPOCH),
  }));
  const items: Item[] = records(r.items).map((i) => {
    const loc = (typeof i.location === 'object' && i.location !== null ? i.location : {}) as Record<string, unknown>;
    const status = i.status;
    const listPrice = numOrNull(i.listPrice);
    const createdAt = str(i.createdAt, now);
    return {
      id: str(i.id) || newId(),
      pickupId: typeof i.pickupId === 'string' ? i.pickupId : null,
      name: str(i.name),
      category: str(i.category, 'Other'),
      subcategory: str(i.subcategory),
      gender: i.gender === 'mens' || i.gender === 'womens' || i.gender === 'unisex' ? i.gender : '',
      photoId: typeof i.photoId === 'string' ? i.photoId : null,
      location: { area: str(loc.area), rack: str(loc.rack), box: str(loc.box) },
      listPrice,
      priceHistory: priceHistory(i.priceHistory, listPrice, createdAt),
      status: status === 'listed' || status === 'sold' || status === 'written_off' ? status : 'in_stock',
      soldPrice: numOrNull(i.soldPrice),
      soldDate: typeof i.soldDate === 'string' ? i.soldDate : null,
      salesChannel: str(i.salesChannel),
      saleCosts: num(i.saleCosts),
      notes: str(i.notes),
      createdAt,
      updatedAt: str(i.updatedAt, EPOCH),
    };
  });
  const expenses: Expense[] = records(r.expenses).map((e) => ({
    id: str(e.id) || newId(),
    date: str(e.date, now.slice(0, 10)),
    category: str(e.category, 'Other'),
    description: str(e.description),
    amount: num(e.amount),
    pickupId: typeof e.pickupId === 'string' ? e.pickupId : null,
    updatedAt: str(e.updatedAt, EPOCH),
  }));
  const otherIncome: OtherIncome[] = records(r.otherIncome).map((o) => ({
    id: str(o.id) || newId(),
    date: str(o.date, now.slice(0, 10)),
    description: str(o.description),
    amount: num(o.amount),
    pickupId: typeof o.pickupId === 'string' ? o.pickupId : null,
    updatedAt: str(o.updatedAt, EPOCH),
  }));
  const employments: Employment[] = records(r.employments).map((e) => ({
    id: str(e.id) || newId(),
    taxYear: str(e.taxYear),
    employer: str(e.employer),
    grossPay: num(e.grossPay),
    taxPaid: num(e.taxPaid),
    updatedAt: str(e.updatedAt, EPOCH),
  }));
  return {
    version: 1,
    settings,
    settingsUpdatedAt: str(r.settingsUpdatedAt, EPOCH),
    pickups,
    items,
    expenses,
    otherIncome,
    employments,
    tombstones: tombstones(r.tombstones),
    deletedPhotoIds: strList(r.deletedPhotoIds, []),
  };
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function itemsToCsv(state: AppState, items: Item[]): string {
  const pickups = new Map(state.pickups.map((p) => [p.id, p]));
  const header = ['Name', 'Category', 'Sub-category', 'For', 'Status', 'Pickup', 'Pickup date', 'Area', 'Rack', 'Box', 'List price', 'Sold price', 'Sold date', 'Channel', 'Sale costs', 'Notes'];
  const rows = items.map((i) => {
    const p = i.pickupId ? pickups.get(i.pickupId) : undefined;
    return [i.name, i.category, i.subcategory, GENDER_LABELS[i.gender], i.status, p?.reference ?? '', p?.date ?? '', i.location.area, i.location.rack, i.location.box, i.listPrice, i.soldPrice, i.soldDate, i.salesChannel, i.saleCosts, i.notes];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
