import { useMemo, useState } from 'react';
import type { AppState, Booking, Pickup } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { contactHref, mapsUrl, splitBookings } from '../lib/diary';
import { sellerKey } from '../lib/sellers';
import { askNotificationPermission, newTrip, notify, useTrip, writeTrip } from '../lib/trip';
import { shortDate } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { todayIso } from '../lib/storage';
import { Button, Card, Empty, Field, Input, PageHeader, TextArea } from '../components/ui';
import { FROM_BOOKING_KEY } from './Pickups';

type Draft = Pick<Booking, 'date' | 'time' | 'name' | 'address' | 'postcode' | 'contact' | 'notes'>;

function weekday(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
}

function BookingForm({ state, initial, onSave, onCancel }: { state: AppState; initial?: Booking; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(() => initial ?? { date: todayIso(), time: '', name: '', address: '', postcode: '', contact: '', notes: '' });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  // Sellers already bought from, so a repeat booking fills itself in.
  const sellers = useMemo(() => {
    const map = new Map<string, Pickup>();
    for (const p of [...state.pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))) {
      const key = sellerKey(p);
      if (key && !map.has(key)) map.set(key, p);
    }
    return map;
  }, [state.pickups]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...d, name: d.name.trim(), address: d.address.trim(), postcode: d.postcode.trim().toUpperCase(), contact: d.contact.trim(), notes: d.notes.trim() });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pickup date">
          <Input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} required />
        </Field>
        <Field label="Time (optional)">
          <Input type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
      </div>
      <Field label="Name">
        <Input
          value={d.name}
          onChange={(e) => {
            const known = sellers.get(e.target.value.trim().toLowerCase());
            set(known && !initial && !d.address && !d.postcode && !d.contact
              ? { name: e.target.value, address: known.sellerAddress, postcode: known.sellerPostcode, contact: known.sellerContact }
              : { name: e.target.value });
          }}
          list="diary-sellers"
          placeholder="e.g. Sarah Jones"
          autoComplete="off"
          autoFocus={!initial}
        />
        <datalist id="diary-sellers">
          {[...sellers.values()].map((p) => (
            <option key={p.id} value={p.reference} />
          ))}
        </datalist>
      </Field>
      <Field label="Address">
        <TextArea rows={2} value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder="e.g. 12 High Street, Leeds" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Postcode">
          <Input value={d.postcode} onChange={(e) => set({ postcode: e.target.value.toUpperCase() })} placeholder="e.g. LS1 4AB" autoCapitalize="characters" autoComplete="off" />
        </Field>
        <Field label="Phone / email (optional)">
          <Input value={d.contact} onChange={(e) => set({ contact: e.target.value })} inputMode="tel" />
        </Field>
      </div>
      <Field label="Notes">
        <TextArea value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. 6 bags, side gate" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1">
          {initial ? 'Save booking' : 'Add to diary'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function BookingCard({ state, booking: b, actions, onEdit }: { state: AppState; booking: Booking; actions: AppActions; onEdit: () => void }) {
  const trip = useTrip();
  const maps = mapsUrl(b.address, b.postcode);
  const tel = contactHref(b.contact);
  const pickup = b.pickupId ? state.pickups.find((p) => p.id === b.pickupId) : undefined;
  const tracking = trip?.bookingId === b.id;
  const open = b.status === 'booked';

  return (
    <div className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${tracking ? 'border-brand-500' : 'border-slate-200 dark:border-slate-800'} ${b.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-slate-50">
            {b.time && <span className="mr-2 tabular-nums text-brand-700 dark:text-brand-300">{b.time}</span>}
            {b.name || 'No name'}
          </div>
          {maps ? (
            <a href={maps} target="_blank" rel="noreferrer" className="mt-0.5 block text-sm text-sky-700 underline dark:text-sky-400">
              📍 {[b.address.replace(/\s*\n\s*/g, ', '), b.postcode].filter(Boolean).join(', ')}
            </a>
          ) : (
            <div className="text-sm text-slate-500">No address</div>
          )}
          {b.contact &&
            (tel ? (
              <a href={tel} className="block text-sm text-sky-700 underline dark:text-sky-400">
                {b.contact}
              </a>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">{b.contact}</div>
            ))}
          {b.notes && <div className="mt-1 text-xs text-slate-500">{b.notes}</div>}
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">
          {b.status === 'done' && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Done</span>}
          {b.status === 'cancelled' && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold dark:bg-slate-800">Cancelled</span>}
          {b.miles !== null && <div className="mt-1">{b.miles} mi</div>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {open && (
          <Button
            variant="primary"
            onClick={() => {
              sessionStorage.setItem(FROM_BOOKING_KEY, b.id);
              navigate({ name: 'pickups' });
            }}
          >
            Start pickup
          </Button>
        )}
        {(open || (b.status === 'done' && b.miles === null)) && !trip && (
          <Button
            onClick={async () => {
              await askNotificationPermission();
              writeTrip(newTrip(b.id, b.name || 'pickup'));
              void notify('Trip started', `Tracking miles for ${b.name || 'this pickup'}. Keep the app open on screen.`);
            }}
          >
            Start trip
          </Button>
        )}
        {pickup && (
          <a href={routeHref({ name: 'pickup', id: pickup.id })} className="self-center text-sm underline">
            View pickup
          </a>
        )}
        <Button onClick={onEdit}>Edit</Button>
        {open && (
          <Button
            onClick={() => {
              if (window.confirm(`Cancel the booking with ${b.name || 'this seller'}?`)) actions.saveBooking({ ...b, status: 'cancelled' });
            }}
          >
            Cancel
          </Button>
        )}
        {b.status === 'cancelled' && (
          <>
            <Button onClick={() => actions.saveBooking({ ...b, status: 'booked' })}>Rebook</Button>
            <Button variant="danger" onClick={() => window.confirm('Delete this booking?') && actions.deleteBooking(b.id)}>
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function DiaryView({ state, actions }: { state: AppState; actions: AppActions }) {
  const [editing, setEditing] = useState<Booking | 'new' | null>(state.bookings.length === 0 ? 'new' : null);
  const today = todayIso();
  const { upcoming, past } = splitBookings(state.bookings, today);
  const byDate = upcoming.reduce<Map<string, Booking[]>>((m, b) => m.set(b.date, [...(m.get(b.date) ?? []), b]), new Map());

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Diary"
        actions={
          editing === null && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              + Book a pickup
            </Button>
          )
        }
      />
      {editing !== null && (
        <Card className="mb-4" title={editing === 'new' ? 'Book a pickup' : `Edit booking: ${editing.name}`}>
          <BookingForm
            key={editing === 'new' ? 'new' : editing.id}
            state={state}
            initial={editing === 'new' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSave={(d) => {
              const base = editing === 'new' ? { status: 'booked' as const, pickupId: null, miles: null } : editing;
              actions.saveBooking({ ...base, ...d });
              setEditing(null);
            }}
          />
        </Card>
      )}

      {upcoming.length === 0 && editing === null && <Empty>Nothing booked. Tap Book a pickup to add one.</Empty>}
      {[...byDate].map(([date, list]) => (
        <section key={date} className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {date === today ? 'Today' : weekday(date)} · {shortDate(date)}
          </h2>
          <div className="space-y-2">
            {list.map((b) => (
              <BookingCard key={b.id} state={state} booking={b} actions={actions} onEdit={() => setEditing(b)} />
            ))}
          </div>
        </section>
      ))}

      {past.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-slate-500">Past and cancelled ({past.length})</summary>
          <div className="mt-2 space-y-2">
            {past.map((b) => (
              <div key={b.id}>
                <div className="mb-1 text-xs text-slate-500">
                  {shortDate(b.date)}
                  {b.status === 'booked' && ' · not recorded as picked up'}
                </div>
                <BookingCard state={state} booking={b} actions={actions} onEdit={() => setEditing(b)} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
