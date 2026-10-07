import { describe, expect, it } from 'vitest';
import { emptyState } from './storage';
import { applyListEdit, usageCount } from './lists';
import type { AppState, Item } from './types';

const T = '2026-01-01T00:00:00.000Z';
const NOW = '2026-10-07T12:00:00.000Z';

function item(id: string, category: string, subcategory = ''): Item {
  return {
    id,
    pickupId: null,
    name: id,
    category,
    subcategory,
    gender: '',
    photoId: null,
    location: { area: 'Garage', rack: '', box: '' },
    listPrice: null,
    priceHistory: [],
    status: 'in_stock',
    soldPrice: null,
    soldDate: null,
    salesChannel: '',
    saleCosts: 0,
    notes: '',
    createdAt: T,
    updatedAt: T,
  };
}

function state(): AppState {
  const s = emptyState();
  return {
    ...s,
    settings: { ...s.settings, categories: ['Tops', 'Shoes', 'Bags'], subcategories: { Tops: ['T-shirts', 'Shirts'] }, expenseTaxBoxes: { Fuel: 'travel' } },
    items: [item('a', 'Tops', 'T-shirts'), item('b', 'Tops'), item('c', 'Shoes')],
    expenses: [{ id: 'e1', date: '2026-09-01', category: 'Fuel', description: '', amount: 10, pickupId: null, recurringId: null, updatedAt: T }],
  };
}

describe('applyListEdit', () => {
  it('renames a category, relabelling items and keeping its sub-categories', () => {
    const s = applyListEdit(state(), { kind: 'categories', op: 'rename', from: 'Tops', to: 'Upper' }, NOW);
    expect(s.settings.categories).toEqual(['Upper', 'Shoes', 'Bags']);
    expect(s.settings.subcategories).toEqual({ Upper: ['T-shirts', 'Shirts'] });
    expect(s.items.filter((i) => i.category === 'Upper').map((i) => i.id)).toEqual(['a', 'b']);
    expect(s.items[0].updatedAt).toBe(NOW);
    expect(s.items[2].updatedAt).toBe(T);
    expect(s.settingsUpdatedAt).toBe(NOW);
  });

  it('deletes a category moving its items to another one', () => {
    const s = applyListEdit(state(), { kind: 'categories', op: 'delete', name: 'Shoes', moveTo: 'Bags' }, NOW);
    expect(s.settings.categories).toEqual(['Tops', 'Bags']);
    expect(s.items.find((i) => i.id === 'c')?.category).toBe('Bags');
  });

  it('can delete without moving, leaving the old label on items', () => {
    const s = applyListEdit(state(), { kind: 'categories', op: 'delete', name: 'Shoes', moveTo: null }, NOW);
    expect(s.settings.categories).toEqual(['Tops', 'Bags']);
    expect(s.items.find((i) => i.id === 'c')?.category).toBe('Shoes');
  });

  it('renames a sub-category only within its category', () => {
    const s = applyListEdit(state(), { kind: 'subcategories', op: 'rename', from: 'T-shirts', to: 'Tees', parent: 'Tops' }, NOW);
    expect(s.settings.subcategories.Tops).toEqual(['Tees', 'Shirts']);
    expect(s.items[0].subcategory).toBe('Tees');
  });

  it('moves a cost type tax heading with a rename', () => {
    const s = applyListEdit(state(), { kind: 'expenseCategories', op: 'rename', from: 'Fuel', to: 'Petrol' }, NOW);
    expect(s.settings.expenseTaxBoxes).toEqual({ Petrol: 'travel' });
    expect(s.expenses[0].category).toBe('Petrol');
  });

  it('adds without duplicates and reorders', () => {
    let s = applyListEdit(state(), { kind: 'categories', op: 'add', name: ' Hats ' }, NOW);
    expect(s.settings.categories).toEqual(['Tops', 'Shoes', 'Bags', 'Hats']);
    expect(applyListEdit(s, { kind: 'categories', op: 'add', name: 'Hats' }, NOW)).toBe(s);
    s = applyListEdit(s, { kind: 'categories', op: 'move', name: 'Hats', by: -1 }, NOW);
    expect(s.settings.categories).toEqual(['Tops', 'Shoes', 'Hats', 'Bags']);
  });
});

describe('usageCount', () => {
  it('counts items or costs using an entry', () => {
    const s = state();
    expect(usageCount(s, 'categories', 'Tops')).toBe(2);
    expect(usageCount(s, 'subcategories', 'T-shirts', 'Tops')).toBe(1);
    expect(usageCount(s, 'storageAreas', 'Garage')).toBe(3);
    expect(usageCount(s, 'expenseCategories', 'Fuel')).toBe(1);
    expect(usageCount(s, 'categories', 'Bags')).toBe(0);
  });
});
