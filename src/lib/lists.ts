import type { AppState, Settings } from './types';

/** The editable lists on the Admin tab */
export type ListKind = 'categories' | 'subcategories' | 'storageAreas' | 'salesChannels' | 'expenseCategories';

export type ListEdit =
  | { kind: ListKind; op: 'add'; name: string; parent?: string }
  | { kind: ListKind; op: 'rename'; from: string; to: string; parent?: string }
  /** moveTo: relabel everything using it to another entry; null leaves the old label on those records */
  | { kind: ListKind; op: 'delete'; name: string; moveTo: string | null; parent?: string }
  | { kind: ListKind; op: 'move'; name: string; by: -1 | 1; parent?: string };

export function listValues(settings: Settings, kind: ListKind, parent?: string): string[] {
  if (kind === 'subcategories') return settings.subcategories[parent ?? ''] ?? [];
  return settings[kind];
}

/** How many records use an entry - stock items, or costs and repeating costs for cost types */
export function usageCount(state: AppState, kind: ListKind, name: string, parent?: string): number {
  switch (kind) {
    case 'categories':
      return state.items.filter((i) => i.category === name).length;
    case 'subcategories':
      return state.items.filter((i) => i.category === parent && i.subcategory === name).length;
    case 'storageAreas':
      return state.items.filter((i) => i.location.area === name).length;
    case 'salesChannels':
      return state.items.filter((i) => i.salesChannel === name).length;
    case 'expenseCategories':
      return state.expenses.filter((e) => e.category === name).length + state.recurring.filter((r) => r.category === name).length;
  }
}

function setList(settings: Settings, kind: ListKind, values: string[], parent?: string): Settings {
  if (kind !== 'subcategories') return { ...settings, [kind]: values };
  const subcategories = { ...settings.subcategories };
  if (values.length) subcategories[parent ?? ''] = values;
  else delete subcategories[parent ?? ''];
  return { ...settings, subcategories };
}

/** Relabels every record using `from` to `to` (stamping them so the change syncs) */
function relabel(state: AppState, kind: ListKind, from: string, to: string, now: string, parent?: string): AppState {
  switch (kind) {
    case 'categories':
      return { ...state, items: state.items.map((i) => (i.category === from ? { ...i, category: to, updatedAt: now } : i)) };
    case 'subcategories':
      return {
        ...state,
        items: state.items.map((i) => (i.category === parent && i.subcategory === from ? { ...i, subcategory: to, updatedAt: now } : i)),
      };
    case 'storageAreas':
      return { ...state, items: state.items.map((i) => (i.location.area === from ? { ...i, location: { ...i.location, area: to }, updatedAt: now } : i)) };
    case 'salesChannels':
      return { ...state, items: state.items.map((i) => (i.salesChannel === from ? { ...i, salesChannel: to, updatedAt: now } : i)) };
    case 'expenseCategories':
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.category === from ? { ...e, category: to, updatedAt: now } : e)),
        recurring: state.recurring.map((r) => (r.category === from ? { ...r, category: to, updatedAt: now } : r)),
      };
  }
}

/** Applies an Admin-tab change to the lists, carrying records and linked settings along with it */
export function applyListEdit(state: AppState, edit: ListEdit, now: string): AppState {
  const values = listValues(state.settings, edit.kind, edit.parent);
  let next = state;
  let settings = state.settings;

  if (edit.op === 'add') {
    const name = edit.name.trim();
    if (!name || values.includes(name)) return state;
    settings = setList(settings, edit.kind, [...values, name], edit.parent);
  } else if (edit.op === 'move') {
    const i = values.indexOf(edit.name);
    const j = i + edit.by;
    if (i < 0 || j < 0 || j >= values.length) return state;
    const moved = [...values];
    [moved[i], moved[j]] = [moved[j], moved[i]];
    settings = setList(settings, edit.kind, moved, edit.parent);
  } else if (edit.op === 'rename') {
    const to = edit.to.trim();
    if (!to || to === edit.from || !values.includes(edit.from)) return state;
    // Renaming onto an existing entry merges the two.
    const renamed = values.includes(to) ? values.filter((v) => v !== edit.from) : values.map((v) => (v === edit.from ? to : v));
    settings = setList(settings, edit.kind, renamed, edit.parent);
    next = relabel(next, edit.kind, edit.from, to, now, edit.parent);
    settings = carryLinked(settings, edit.kind, edit.from, to);
  } else {
    settings = setList(settings, edit.kind, values.filter((v) => v !== edit.name), edit.parent);
    if (edit.moveTo) next = relabel(next, edit.kind, edit.name, edit.moveTo, now, edit.parent);
    settings = carryLinked(settings, edit.kind, edit.name, edit.moveTo);
  }
  return { ...next, settings, settingsUpdatedAt: now };
}

/** Sub-categories follow their category; a cost type keeps its tax heading */
function carryLinked(settings: Settings, kind: ListKind, from: string, to: string | null): Settings {
  if (kind === 'categories') {
    const subcategories = { ...settings.subcategories };
    const subs = subcategories[from];
    delete subcategories[from];
    if (subs && to) subcategories[to] = [...new Set([...(subcategories[to] ?? []), ...subs])];
    return { ...settings, subcategories };
  }
  if (kind === 'expenseCategories') {
    const expenseTaxBoxes = { ...settings.expenseTaxBoxes };
    const box = expenseTaxBoxes[from];
    if (to && box && !expenseTaxBoxes[to]) expenseTaxBoxes[to] = box;
    // Keep the old heading while costs still carry the old name (deleted without moving).
    if (to) delete expenseTaxBoxes[from];
    return { ...settings, expenseTaxBoxes };
  }
  return settings;
}
