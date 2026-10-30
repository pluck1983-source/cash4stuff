import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Audited, Booking, Employment, Expense, Item, OtherIncome, Pickup, RecurringCost, Settings } from './types';
import { assignMissingSkus, makeSku, nextSkuNumber, skuForNewCategory } from './sku';
import { auditDefaults, nextReceiptNumber, purchaseCost, withHistory } from './audit';
import { postDueRecurring } from './recurring';
import { applyListEdit, type ListEdit } from './lists';
import { splitSale, type Sale } from './quantity';
import { mergeCustomers, setResolved } from './sellers';
import { loadState, newId, saveState, todayIso } from './storage';

type NewPickup = Omit<Pickup, 'id' | 'updatedAt' | keyof Audited | 'amountPaid' | 'receiptNumber' | 'resolvedAt'>;
type NewItem = Omit<Item, 'id' | 'sku' | 'quantity' | 'createdAt' | 'updatedAt' | 'priceHistory' | 'history'> & { sku?: string; quantity?: number };
type NewEmployment = Omit<Employment, 'id' | 'updatedAt'>;
type NewExpense = Omit<Expense, 'id' | 'updatedAt' | 'recurringId' | 'paymentMethod' | 'attachmentIds' | keyof Audited> & {
  recurringId?: string | null;
  paymentMethod?: Expense['paymentMethod'];
  attachmentIds?: string[];
};
type NewRecurring = Omit<RecurringCost, 'id' | 'updatedAt'>;
type NewIncome = Omit<OtherIncome, 'id' | 'updatedAt' | keyof Audited>;
type NewBooking = Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>;

const PICKUP_FIELDS: (keyof Pickup)[] = ['date', 'reference', 'sellerAddress', 'sellerPostcode', 'handover', 'weightKg', 'ratePerKg', 'costOverride', 'amountPaid', 'paymentMethod', 'bankRef', 'sellerContact', 'miles', 'paperSlipSigned', 'signaturePhotoId', 'notes'];
const EXPENSE_FIELDS: (keyof Expense)[] = ['date', 'category', 'description', 'amount', 'paymentMethod', 'pickupId', 'attachmentIds'];
const INCOME_FIELDS: (keyof OtherIncome)[] = ['date', 'kind', 'buyer', 'weightKg', 'description', 'amount', 'paymentMethod', 'pickupId'];
const SALE_FIELDS: (keyof Item)[] = ['status', 'soldPrice', 'soldDate', 'salesChannel', 'saleCosts'];

/** Marks a money record void (it stays in the books, crossed out) or restores it */
function setVoid<T extends Audited & { id: string; updatedAt: string }>(list: T[], id: string, reason: string | null, now: string): T[] {
  return list.map((r) => {
    if (r.id !== id) return r;
    const entry = { at: now, changes: { voided: reason === null ? ['yes', 'no (restored)'] : ['no', `yes: ${reason}`] } as Record<string, [string, string]> };
    return { ...r, voidedAt: reason === null ? null : now, voidReason: reason ?? '', history: [...r.history, entry], updatedAt: now };
  });
}

function stamp() {
  return new Date().toISOString();
}

export function useAppState() {
  const [state, setState] = useState<AppState>(loadState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
    // Items added before SKUs existed (or on a device not updated yet) get one.
    const items = assignMissingSkus(posted.items, new Date().toISOString());
    if (posted !== state || items !== state.items) setState({ ...posted, items });
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

    /** Deletes a photo unless another record (a split-off sale) still shows it */
    function dropPhoto(photoId: string, fromItemId: string) {
      setState((s) =>
        s.items.some((i) => i.id !== fromItemId && i.photoId === photoId) ? s : { ...s, deletedPhotoIds: [...s.deletedPhotoIds, photoId] },
      );
    }

    const api = {
      /** Saves a purchase with its cost worked out now, and the next receipt number */
      addPickup(data: NewPickup): Pickup {
        const now = stamp();
        const s0 = stateRef.current;
        const pickup: Pickup = {
          ...data,
          amountPaid: data.costOverride ?? purchaseCost(data.weightKg, data.ratePerKg, s0.settings),
          receiptNumber: nextReceiptNumber(s0),
          resolvedAt: null,
          id: newId(),
          ...auditDefaults(now),
          updatedAt: now,
        };
        setState((s) => ({ ...s, pickups: [...s.pickups, { ...pickup, receiptNumber: nextReceiptNumber(s) }] }));
        return pickup;
      },
      updatePickup(pickup: Pickup) {
        const now = stamp();
        setState((s) => {
          const before = s.pickups.find((p) => p.id === pickup.id);
          let next: Pickup = { ...pickup, amountPaid: pickup.costOverride ?? purchaseCost(pickup.weightKg, pickup.ratePerKg, s.settings), updatedAt: now };
          if (before) next = withHistory(before, next, now, PICKUP_FIELDS);
          return { ...s, pickups: s.pickups.map((p) => (p.id === pickup.id ? next : p)) };
        });
      },
      /**
       * Marks a seller's pickups as having all their items added (or undoes it),
       * so they stop being offered when adding items. A later pickup from the
       * same seller starts open again.
       */
      setSellerResolved(pickupId: string, resolved: boolean) {
        const now = stamp();
        setState((s) => ({ ...s, pickups: setResolved(s.pickups, pickupId, resolved, now) }));
      },
      /**
       * Files other customers' pickups under this pickup's customer, taking its
       * seller details. Old details stay in each pickup's edit history.
       */
      mergeCustomers(targetId: string, fromIds: string[]) {
        const now = stamp();
        setState((s) => {
          const live = s.pickups.filter((p) => p.voidedAt === null);
          const merged = new Map(mergeCustomers(live, targetId, fromIds).map((p) => [p.id, p]));
          const pickups = s.pickups.map((before) => {
            const after = merged.get(before.id);
            if (!after || after === before) return before;
            return { ...withHistory(before, after, now, [...PICKUP_FIELDS, 'startsNewGroup']), updatedAt: now };
          });
          return { ...s, pickups };
        });
      },
      /** A purchase is never deleted - voiding keeps it in the books, crossed out, with the reason */
      voidPickup(id: string, reason: string) {
        setState((s) => ({ ...s, pickups: setVoid(s.pickups, id, reason, stamp()) }));
      },
      restorePickup(id: string) {
        setState((s) => ({ ...s, pickups: setVoid(s.pickups, id, null, stamp()) }));
      },
      /** createdAt can be backdated for stock that was already in hand before the app */
      addItem(data: NewItem, createdAt?: string): Item {
        const now = stamp();
        const added = createdAt ?? now;
        const priceHistory = data.listPrice !== null ? [{ date: added.slice(0, 10), price: data.listPrice }] : [];
        const typed = data.sku?.trim() ?? '';
        const item: Item = { ...data, quantity: Math.max(1, Math.floor(data.quantity ?? 1)), sku: typed || makeSku(data.category, nextSkuNumber(stateRef.current.items)), priceHistory, history: [], id: newId(), createdAt: added, updatedAt: now };
        // Numbered against the latest list so two quick adds can't share a SKU.
        setState((s) => ({ ...s, items: [...s.items, { ...item, sku: typed || makeSku(item.category, nextSkuNumber(s.items)) }] }));
        return item;
      },
      /** Saves an item; a changed asking price is added to its price history */
      updateItem(item: Item, replacedPhotoId?: string | null) {
        setState((s) => {
          const previous = s.items.find((i) => i.id === item.id);
          let { priceHistory, history } = item;
          // Changing or undoing a sale after the day it was recorded is logged.
          if (previous?.soldDate && previous.soldDate < todayIso()) {
            const logged = withHistory({ ...previous, createdAt: previous.soldDate }, item, stamp(), SALE_FIELDS);
            history = logged.history;
          }
          if (item.listPrice !== null && item.listPrice !== previous?.listPrice) {
            const today = todayIso();
            // Re-pricing twice in a day keeps only the latest price for that day.
            priceHistory = [...priceHistory.filter((p) => p.date !== today), { date: today, price: item.listPrice }];
          }
          const sku = previous && item.sku === previous.sku ? skuForNewCategory(item.sku, previous.category, item.category) : item.sku;
          const next = { ...item, sku, priceHistory, history, updatedAt: stamp() };
          return { ...s, items: previous ? s.items.map((i) => (i.id === item.id ? next : i)) : [...s.items, next] };
        });
        if (replacedPhotoId && replacedPhotoId !== item.photoId) dropPhoto(replacedPhotoId, item.id);
      },
      /**
       * Records a sale. Selling only some of a quantity splits the sold units off
       * into their own sold record (same SKU and photo), so each sale stays one
       * line in the books and the rest stays in stock.
       */
      sellItem(item: Item, sale: Sale, count = item.quantity) {
        const sold = Math.min(item.quantity, Math.max(1, Math.floor(count)));
        if (sold >= item.quantity) {
          api.updateItem({ ...item, ...sale, status: 'sold' });
          return;
        }
        const now = stamp();
        const id = newId();
        setState((s) => ({ ...s, items: splitSale(s.items, item, sale, sold, now, id) }));
      },
      /** Sold items can't be deleted - their sale is part of the books */
      deleteItem(item: Item) {
        if (item.status === 'sold') return;
        remove('items', item.id);
        if (item.photoId) dropPhoto(item.photoId, item.id);
      },
      saveExpense(data: NewExpense & { id?: string }) {
        const now = stamp();
        setState((s) => {
          const before = data.id ? s.expenses.find((e) => e.id === data.id) : undefined;
          const base = { ...data, recurringId: data.recurringId ?? null, paymentMethod: data.paymentMethod ?? before?.paymentMethod ?? '', attachmentIds: data.attachmentIds ?? before?.attachmentIds ?? [], updatedAt: now };
          if (!before) return { ...s, expenses: [...s.expenses, { ...base, id: data.id ?? newId(), ...auditDefaults(now) }] };
          const next = withHistory(before, { ...before, ...base, id: before.id }, now, EXPENSE_FIELDS);
          return { ...s, expenses: s.expenses.map((e) => (e.id === before.id ? next : e)) };
        });
      },
      /**
       * Saves a repeating cost. Payments already posted keep their amounts (they
       * happened); ones now outside the start/end dates are voided, and any
       * newly due are posted straight away.
       */
      saveBooking(data: NewBooking & { id?: string }): Booking {
        const now = stamp();
        const existing = data.id ? stateRef.current.bookings.find((b) => b.id === data.id) : undefined;
        const booking: Booking = { ...data, id: data.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now };
        setState((s) => ({ ...s, bookings: s.bookings.some((b) => b.id === booking.id) ? s.bookings.map((b) => (b.id === booking.id ? booking : b)) : [...s.bookings, booking] }));
        return booking;
      },
      deleteBooking(id: string) {
        setState((s) => ({ ...s, bookings: s.bookings.filter((b) => b.id !== id), tombstones: { ...s.tombstones, [id]: stamp() } }));
      },
      /** Links the pickup recorded at a booked visit, and marks the booking done */
      completeBooking(bookingId: string, pickupId: string) {
        const now = stamp();
        setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, status: 'done', pickupId, updatedAt: now } : b)) }));
      },
      /** Saves a trip's miles on the booking, and on its pickup if one is recorded */
      setBookingMiles(bookingId: string, miles: number) {
        const now = stamp();
        setState((s) => {
          const booking = s.bookings.find((b) => b.id === bookingId);
          if (!booking) return s;
          const pickups = s.pickups.map((p) => (p.id === booking.pickupId ? withHistory(p, { ...p, miles, updatedAt: now }, now, PICKUP_FIELDS) : p));
          return { ...s, pickups, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, miles, updatedAt: now } : b)) };
        });
      },
      saveRecurring(data: NewRecurring & { id?: string }) {
        const now = stamp();
        const plan: RecurringCost = { ...data, id: data.id ?? newId(), updatedAt: now };
        setState((s) => {
          let expenses = s.expenses;
          for (const e of s.expenses) {
            const outside = e.recurringId === plan.id && e.voidedAt === null && (e.date < plan.startDate || (plan.endDate !== null && e.date > plan.endDate));
            if (outside) expenses = setVoid(expenses, e.id, 'Outside the repeating cost\'s dates after it was changed', now);
          }
          // A voided payment stays voided - it isn't posted again.
          const exists = s.recurring.some((r) => r.id === plan.id);
          return { ...s, recurring: exists ? s.recurring.map((r) => (r.id === plan.id ? plan : r)) : [...s.recurring, plan], expenses };
        });
      },
      /** Stops a repeating cost; keepPosted leaves the payments already made in the costs list */
      deleteRecurring(id: string, keepPosted: boolean) {
        const now = stamp();
        setState((s) => {
          let expenses = s.expenses;
          for (const e of s.expenses) {
            if (e.recurringId !== id) continue;
            // Kept payments become ordinary costs so nothing re-links them; the rest are voided, not deleted.
            expenses = keepPosted
              ? expenses.map((x) => (x.id === e.id ? { ...x, recurringId: null, updatedAt: now } : x))
              : e.voidedAt === null
                ? setVoid(expenses, e.id, 'Repeating cost stopped and its payments removed', now)
                : expenses;
          }
          return { ...s, recurring: s.recurring.filter((r) => r.id !== id), expenses, tombstones: { ...s.tombstones, [id]: now } };
        });
      },
      voidExpense(id: string, reason: string) {
        setState((s) => ({ ...s, expenses: setVoid(s.expenses, id, reason, stamp()) }));
      },
      restoreExpense(id: string) {
        setState((s) => ({ ...s, expenses: setVoid(s.expenses, id, null, stamp()) }));
      },
      saveIncome(data: NewIncome & { id?: string }) {
        const now = stamp();
        setState((s) => {
          const before = data.id ? s.otherIncome.find((o) => o.id === data.id) : undefined;
          if (!before) return { ...s, otherIncome: [...s.otherIncome, { ...data, id: data.id ?? newId(), updatedAt: now, ...auditDefaults(now) }] };
          const next = withHistory(before, { ...before, ...data, id: before.id, updatedAt: now }, now, INCOME_FIELDS);
          return { ...s, otherIncome: s.otherIncome.map((o) => (o.id === before.id ? next : o)) };
        });
      },
      voidIncome(id: string, reason: string) {
        setState((s) => ({ ...s, otherIncome: setVoid(s.otherIncome, id, reason, stamp()) }));
      },
      restoreIncome(id: string) {
        setState((s) => ({ ...s, otherIncome: setVoid(s.otherIncome, id, null, stamp()) }));
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
      /** Admin tab: add/rename/delete/reorder a category or other list entry, carrying records with it */
      editList(edit: ListEdit) {
        setState((s) => applyListEdit(s, edit, stamp()));
      },
    };
    return api;
  }, []);

  return { state, replaceState, actions };
}

export type AppActions = ReturnType<typeof useAppState>['actions'];
