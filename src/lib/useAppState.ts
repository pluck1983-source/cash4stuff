import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState, Expense, Item, OtherIncome, Pickup, Settings } from './types';
import { loadState, newId, saveState } from './storage';

type NewPickup = Omit<Pickup, 'id' | 'createdAt' | 'updatedAt'>;
type NewItem = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;
type NewExpense = Omit<Expense, 'id' | 'updatedAt'>;
type NewIncome = Omit<OtherIncome, 'id' | 'updatedAt'>;

function stamp() {
  return new Date().toISOString();
}

export function useAppState() {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    try {
      saveState(state);
    } catch {
      // Storage full - photos are kept separately, so this would take a
      // very large amount of data; the cloud copy still has everything.
    }
  }, [state]);

  const replaceState = useCallback((next: AppState) => setState(next), []);

  const actions = useMemo(() => {
    function upsert<K extends 'pickups' | 'items' | 'expenses' | 'otherIncome'>(key: K, record: AppState[K][number]) {
      setState((s) => {
        const list = s[key] as AppState[K][number][];
        const exists = list.some((r) => r.id === record.id);
        return { ...s, [key]: exists ? list.map((r) => (r.id === record.id ? record : r)) : [...list, record] };
      });
    }

    function remove<K extends 'pickups' | 'items' | 'expenses' | 'otherIncome'>(key: K, id: string) {
      setState((s) => ({
        ...s,
        [key]: (s[key] as { id: string }[]).filter((r) => r.id !== id),
        tombstones: { ...s.tombstones, [id]: stamp() },
      }));
    }

    return {
      addPickup(data: NewPickup): Pickup {
        const now = stamp();
        const pickup: Pickup = { ...data, id: newId(), createdAt: now, updatedAt: now };
        upsert('pickups', pickup);
        return pickup;
      },
      updatePickup(pickup: Pickup) {
        upsert('pickups', { ...pickup, updatedAt: stamp() });
      },
      /** Items from the pickup are kept, just no longer linked to it */
      deletePickup(id: string) {
        const now = stamp();
        setState((s) => ({
          ...s,
          pickups: s.pickups.filter((p) => p.id !== id),
          items: s.items.map((i) => (i.pickupId === id ? { ...i, pickupId: null, updatedAt: now } : i)),
          expenses: s.expenses.map((e) => (e.pickupId === id ? { ...e, pickupId: null, updatedAt: now } : e)),
          otherIncome: s.otherIncome.map((o) => (o.pickupId === id ? { ...o, pickupId: null, updatedAt: now } : o)),
          tombstones: { ...s.tombstones, [id]: now },
        }));
      },
      addItem(data: NewItem): Item {
        const now = stamp();
        const item: Item = { ...data, id: newId(), createdAt: now, updatedAt: now };
        upsert('items', item);
        return item;
      },
      updateItem(item: Item, replacedPhotoId?: string | null) {
        upsert('items', { ...item, updatedAt: stamp() });
        if (replacedPhotoId && replacedPhotoId !== item.photoId) {
          setState((s) => ({ ...s, deletedPhotoIds: [...s.deletedPhotoIds, replacedPhotoId] }));
        }
      },
      deleteItem(item: Item) {
        remove('items', item.id);
        if (item.photoId) {
          const photoId = item.photoId;
          setState((s) => ({ ...s, deletedPhotoIds: [...s.deletedPhotoIds, photoId] }));
        }
      },
      saveExpense(data: NewExpense & { id?: string }) {
        upsert('expenses', { ...data, id: data.id ?? newId(), updatedAt: stamp() });
      },
      deleteExpense(id: string) {
        remove('expenses', id);
      },
      saveIncome(data: NewIncome & { id?: string }) {
        upsert('otherIncome', { ...data, id: data.id ?? newId(), updatedAt: stamp() });
      },
      deleteIncome(id: string) {
        remove('otherIncome', id);
      },
      updateSettings(settings: Settings) {
        setState((s) => ({ ...s, settings, settingsUpdatedAt: stamp() }));
      },
    };
  }, []);

  return { state, replaceState, actions };
}

export type AppActions = ReturnType<typeof useAppState>['actions'];
