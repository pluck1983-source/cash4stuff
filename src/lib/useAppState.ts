import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState, Employment, Expense, Item, OtherIncome, Pickup, RecurringCost, Settings } from './types';
import { postDueRecurring } from './recurring';
import { loadState, newId, saveState, todayIso } from './storage';

type NewPickup = Omit<Pickup, 'id' | 'createdAt' | 'updatedAt'>;
type NewItem = Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'priceHistory'>;
type NewEmployment = Omit<Employment, 'id' | 'updatedAt'>;
type NewExpense = Omit<Expense, 'id' | 'updatedAt' | 'recurringId'> & { recurringId?: string | null };
type NewRecurring = Omit<RecurringCost, 'id' | 'updatedAt'>;
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

  // Post repeating costs (rent etc.) that have fallen due - on open, after any
  // change (including a sync bringing in a new plan) and when the app comes back.
  useEffect(() => {
    const posted = postDueRecurring(state, todayIso());
    if (posted !== state) setState(posted);
  }, [state]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setState((s) => postDueRecurring(s, todayIso()));
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const actions = useMemo(() => {
    function upsert<K extends 'pickups' | 'items' | 'expenses' | 'otherIncome' | 'employments' | 'recurring'>(key: K, record: AppState[K][number]) {
      setState((s) => {
        const list = s[key] as AppState[K][number][];
        const exists = list.some((r) => r.id === record.id);
        return { ...s, [key]: exists ? list.map((r) => (r.id === record.id ? record : r)) : [...list, record] };
      });
    }

    function remove<K extends 'pickups' | 'items' | 'expenses' | 'otherIncome' | 'employments' | 'recurring'>(key: K, id: string) {
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
      /** createdAt can be backdated for stock that was already in hand before the app */
      addItem(data: NewItem, createdAt?: string): Item {
        const now = stamp();
        const added = createdAt ?? now;
        const priceHistory = data.listPrice !== null ? [{ date: added.slice(0, 10), price: data.listPrice }] : [];
        const item: Item = { ...data, priceHistory, id: newId(), createdAt: added, updatedAt: now };
        upsert('items', item);
        return item;
      },
      /** Saves an item; a changed asking price is added to its price history */
      updateItem(item: Item, replacedPhotoId?: string | null) {
        setState((s) => {
          const previous = s.items.find((i) => i.id === item.id);
          let { priceHistory } = item;
          if (item.listPrice !== null && item.listPrice !== previous?.listPrice) {
            const today = todayIso();
            // Re-pricing twice in a day keeps only the latest price for that day.
            priceHistory = [...priceHistory.filter((p) => p.date !== today), { date: today, price: item.listPrice }];
          }
          const next = { ...item, priceHistory, updatedAt: stamp() };
          return { ...s, items: previous ? s.items.map((i) => (i.id === item.id ? next : i)) : [...s.items, next] };
        });
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
        upsert('expenses', { ...data, recurringId: data.recurringId ?? null, id: data.id ?? newId(), updatedAt: stamp() });
      },
      /**
       * Saves a repeating cost. Payments already posted keep their amounts (they
       * happened); ones now outside the start/end dates are removed, and any
       * newly due are posted straight away.
       */
      saveRecurring(data: NewRecurring & { id?: string }) {
        const now = stamp();
        const plan: RecurringCost = { ...data, id: data.id ?? newId(), updatedAt: now };
        setState((s) => {
          const outside = s.expenses.filter(
            (e) => e.recurringId === plan.id && (e.date < plan.startDate || (plan.endDate !== null && e.date > plan.endDate)),
          );
          const gone = new Set(outside.map((e) => e.id));
          const tombstones = { ...s.tombstones };
          for (const id of gone) tombstones[id] = now;
          // A payment deleted by hand stays deleted, unless the plan now starts later and it's no longer in range anyway.
          const exists = s.recurring.some((r) => r.id === plan.id);
          return {
            ...s,
            recurring: exists ? s.recurring.map((r) => (r.id === plan.id ? plan : r)) : [...s.recurring, plan],
            expenses: s.expenses.filter((e) => !gone.has(e.id)),
            tombstones,
          };
        });
      },
      /** Stops a repeating cost; keepPosted leaves the payments already made in the costs list */
      deleteRecurring(id: string, keepPosted: boolean) {
        const now = stamp();
        setState((s) => {
          const posted = keepPosted ? [] : s.expenses.filter((e) => e.recurringId === id).map((e) => e.id);
          const tombstones = { ...s.tombstones, [id]: now };
          for (const pid of posted) tombstones[pid] = now;
          return {
            ...s,
            recurring: s.recurring.filter((r) => r.id !== id),
            // Kept payments become ordinary costs so nothing re-links them.
            expenses: s.expenses.filter((e) => !posted.includes(e.id)).map((e) => (e.recurringId === id ? { ...e, recurringId: null, updatedAt: now } : e)),
            tombstones,
          };
        });
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
      saveEmployment(data: NewEmployment & { id?: string }) {
        upsert('employments', { ...data, id: data.id ?? newId(), updatedAt: stamp() });
      },
      deleteEmployment(id: string) {
        remove('employments', id);
      },
      updateSettings(settings: Settings) {
        setState((s) => ({ ...s, settings, settingsUpdatedAt: stamp() }));
      },
    };
  }, []);

  return { state, replaceState, actions };
}

export type AppActions = ReturnType<typeof useAppState>['actions'];
