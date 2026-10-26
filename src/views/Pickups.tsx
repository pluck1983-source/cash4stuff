import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { groupBySeller, sellerKey } from '../lib/sellers';
import type { AppState, Audited, Booking, Handover, PaymentMethod, Pickup } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { customerStats, pickupStats, roundWeight, suggestNewGroup, type PickupStats } from '../lib/calc';
import { purchaseCost } from '../lib/audit';
import { savePhoto } from '../lib/photos';
import { Photo } from '../components/Photo';
import { PaymentChips, SignaturePad, VoidedNote } from '../components/Records';
import { kg, money, parseNumber, percent, shortDate } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { newId, todayIso } from '../lib/storage';
import { Button, Card, Empty, Field, Input, PageHeader, TextArea } from '../components/ui';

/** Tells the pickup page to open with quick entry showing */
export const OPEN_QUICK_ENTRY_KEY = 'cash4stuff-open-quick-entry';
/** Pickup id whose seller should be copied into a new pickup form */
export const REPEAT_SELLER_KEY = 'cash4stuff-repeat-seller';
/** Diary booking id to start a pickup from */
export const FROM_BOOKING_KEY = 'cash4stuff-pickup-from-booking';

type SellerDetails = Pick<Pickup, 'reference' | 'sellerAddress' | 'sellerPostcode' | 'sellerContact'> & { miles?: number | null };

/** Each seller once, with the details from their latest pickup */
function previousSellers(pickups: Pickup[]): Map<string, SellerDetails> {
  const sellers = new Map<string, SellerDetails>();
  const newestFirst = [...pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  for (const p of newestFirst) {
    const key = sellerKey(p);
    if (key && !sellers.has(key)) sellers.set(key, p);
  }
  return sellers;
}

const PAYMENT_KEY = 'cash4stuff-last-payment-method';

type PickupDraft = Omit<Pickup, 'id' | 'updatedAt' | keyof Audited | 'amountPaid' | 'receiptNumber' | 'resolvedAt'>;

/** "12 High Street\nLeeds" or "12 High Street, Leeds" -> "12 High Street" */
function firstAddressLine(address: string): string {
  return address.split(/\n|,/)[0].trim();
}

export function PickupForm({
  state,
  initial,
  seller,
  onSave,
  onCancel,
}: {
  state: AppState;
  initial?: Pickup;
  /** A previous seller to fill in on a new pickup */
  seller?: SellerDetails;
  onSave: (data: PickupDraft, next: 'photo' | 'quick' | 'done') => void;
  onCancel: () => void;
}) {
  const { settings } = state;
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const from = initial ?? seller;
  const [reference, setReference] = useState(from?.reference ?? '');
  const [address, setAddress] = useState(from?.sellerAddress ?? '');
  const [postcode, setPostcode] = useState(from?.sellerPostcode ?? '');
  // Each visit is a pickup unless they say otherwise, even for a repeat seller.
  const [handover, setHandover] = useState<Handover>(initial?.handover ?? 'pickup');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const [rate, setRate] = useState(String(initial?.ratePerKg ?? settings.costPerKg));
  const [override, setOverride] = useState(initial?.costOverride != null ? String(initial.costOverride) : '');
  const [payment, setPayment] = useState<PaymentMethod>(initial?.paymentMethod ?? ((localStorage.getItem(PAYMENT_KEY) as PaymentMethod | null) || 'cash'));
  const [bankRef, setBankRef] = useState(initial?.bankRef ?? '');
  const [contact, setContact] = useState(from?.sellerContact ?? '');
  const sellers = useMemo(() => previousSellers(state.pickups), [state.pickups]);
  const [paperSlip, setPaperSlip] = useState(initial?.paperSlipSigned ?? false);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [miles, setMiles] = useState(from?.miles != null ? String(from.miles) : '');
  const [newGroup, setNewGroup] = useState(initial?.startsNewGroup ?? false);
  const [saving, setSaving] = useState(false);
  // A new group can only start from a customer's second or later pickup.
  const typedSeller = sellerKey({ reference });
  const hasEarlier =
    typedSeller !== '' && state.pickups.some((p) => p.id !== initial?.id && sellerKey(p) === typedSeller && (!initial || p.date + p.createdAt < initial.date + initial.createdAt));

  const weightKg = parseNumber(weight) ?? 0;
  const ratePerKg = parseNumber(rate) ?? settings.costPerKg;
  const rounded = roundWeight(weightKg, settings.weightStepKg, settings.weightRounding);
  const calculated = purchaseCost(weightKg, ratePerKg, settings);
  const overrideValue = parseNumber(override);
  const signed = Boolean(initial?.signaturePhotoId);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        let startsNewGroup = hasEarlier && newGroup;
        const suggestion = !initial && hasEarlier && !newGroup ? suggestNewGroup(state, reference, date) : null;
        if (suggestion) {
          const left = suggestion.itemsLeft === 0 ? 'nothing is' : `only ${suggestion.itemsLeft} item${suggestion.itemsLeft === 1 ? ' is' : 's are'}`;
          startsNewGroup = window.confirm(
            `${suggestion.latest.reference}'s last pickup was ${suggestion.days} days ago and ${left} left from it.\n\n` +
              'Start a new group with this pickup, so its costs and profit are counted separately?\n\n' +
              'OK - new group (later pickups join it)\nCancel - add to the existing group',
          );
        }
        setSaving(true);
        let signaturePhotoId = initial?.signaturePhotoId ?? null;
        if (signature) {
          signaturePhotoId = newId();
          await savePhoto(signaturePhotoId, signature, false);
        }
        if (payment) localStorage.setItem(PAYMENT_KEY, payment);
        onSave(
          {
            date,
            reference: reference.trim() || `${handover === 'dropoff' ? 'Drop-off' : 'Pickup'} ${shortDate(date)}`,
            sellerAddress: address.trim(),
            sellerPostcode: postcode.trim().toUpperCase(),
            handover,
            weightKg,
            ratePerKg,
            costOverride: overrideValue,
            paymentMethod: payment,
            bankRef: payment === 'bank' ? bankRef.trim() : '',
            sellerContact: contact.trim(),
            miles: parseNumber(miles),
            paperSlipSigned: paperSlip,
            signaturePhotoId,
            notes: notes.trim(),
            startsNewGroup,
          },
          submitter?.value === 'quick' ? 'quick' : submitter?.value === 'done' ? 'done' : 'photo',
        );
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pickup or drop-off">
        {(['pickup', 'dropoff'] as const).map((h) => (
          <label
            key={h}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
              handover === h ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <input type="radio" name="handover" className="sr-only" checked={handover === h} onChange={() => setHandover(h)} />
            {handover === h ? '☑' : '☐'} {h === 'pickup' ? 'Pickup' : 'Drop-off'}
          </label>
        ))}
      </div>
      <Field label="Seller's name">
        <Input
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            // Picking a previous seller fills in their details, unless some are already typed.
            const known = sellers.get(e.target.value.trim().toLowerCase());
            if (known && !initial && !address && !postcode && !contact) {
              setAddress(known.sellerAddress);
              setPostcode(known.sellerPostcode);
              setContact(known.sellerContact);
            }
          }}
          list="previous-sellers"
          placeholder="e.g. Sarah Jones"
          autoComplete="off"
          autoFocus={!initial && !seller}
        />
        <datalist id="previous-sellers">
          {[...sellers.values()].map((s) => (
            <option key={s.reference} value={s.reference}>
              {[s.sellerAddress.split(/\n|,/)[0], s.sellerPostcode].filter(Boolean).join(', ')}
            </option>
          ))}
        </datalist>
      </Field>
      <Field label="Address">
        <TextArea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 High Street, Leeds" />
      </Field>
      <Field label="Postcode" className="max-w-40">
        <Input value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="e.g. LS1 4AB" autoCapitalize="characters" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.0" />
        </Field>
        <Field label="Rate (£/kg)">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
      </div>
      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        {weightKg > 0 ? (
          <>
            {kg(weightKg)} → <strong>{kg(rounded)}</strong> × {money(ratePerKg)}/kg = <strong>{money(calculated)}</strong>
          </>
        ) : (
          <>Enter the weight to see what to pay ({money(ratePerKg)}/kg, rounded to {settings.weightStepKg} kg)</>
        )}
      </div>
      <Field label="Paid by">
        <PaymentChips value={payment} onChange={setPayment} />
      </Field>
      {payment === 'bank' && (
        <Field label="Bank reference (optional)" hint="What it shows as on the statement, so it can be matched up">
          <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
        </Field>
      )}
      <Field label="Seller's signature" hint="Proves the purchase was real - the strongest evidence if HMRC ever asks">
        {signed && !signature ? (
          <Photo id={initial?.signaturePhotoId ?? null} alt="Seller signature" contain className="h-28 rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
        ) : (
          <SignaturePad onChange={setSignature} />
        )}
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={paperSlip} onChange={(e) => setPaperSlip(e.target.checked)} className="h-4 w-4" />
          Signed a paper slip instead
        </label>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" hint={!initial ? 'Back-date it for stock you already have' : undefined}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Seller phone / email (optional)">
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
      </div>
      <Field label="Miles (optional)" hint="There and back - filled in by the Diary's trip tracker when you use it">
        <Input type="number" inputMode="decimal" step="0.1" min="0" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="0.0" className="max-w-40" />
      </Field>
      <Field label="Actually paid (optional)" hint="If you paid something other than weight × rate - or, for stock you already had, what you paid when you don't know the weight">
        <Input type="number" inputMode="decimal" step="0.01" min="0" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={money(calculated)} />
      </Field>
      <Field label="Notes">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {hasEarlier && (
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={newGroup} onChange={(e) => setNewGroup(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            Start a new group for this customer
            <span className="block text-xs text-slate-500">This pickup and later ones get their own costs and profit, apart from the earlier pickups.</span>
          </span>
        </label>
      )}
      {initial ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" className="flex-1" value="photo" disabled={saving}>
            Save pickup
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button type="submit" variant="primary" className="sm:flex-1" value="photo" disabled={saving}>
            Save & add items
          </Button>
          <Button type="submit" value="quick" className="sm:flex-1" disabled={saving}>
            Save & quick entry
          </Button>
          <Button type="submit" value="done" disabled={saving}>
            Save
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      )}
    </form>
  );
}

export function PickupsView({ state, books, actions }: { state: AppState; books: AppState; actions: AppActions }) {
  // Opened from "New pickup from this seller" on a pickup's page.
  const [repeatOf] = useState(() => state.pickups.find((p) => p.id === sessionStorage.getItem(REPEAT_SELLER_KEY)));
  useEffect(() => sessionStorage.removeItem(REPEAT_SELLER_KEY), []);
  // Opened from "Start pickup" on a Diary booking.
  const [booking] = useState<Booking | undefined>(() => state.bookings.find((b) => b.id === sessionStorage.getItem(FROM_BOOKING_KEY)));
  useEffect(() => sessionStorage.removeItem(FROM_BOOKING_KEY), []);
  const fromBooking: SellerDetails | undefined = booking && {
    reference: booking.name,
    sellerAddress: booking.address,
    sellerPostcode: booking.postcode,
    sellerContact: booking.contact,
    miles: booking.miles,
  };
  const [adding, setAdding] = useState(state.pickups.length === 0 || Boolean(repeatOf) || Boolean(booking));
  const pickups = [...state.pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const voided = books.pickups.filter((p) => p.voidedAt !== null);

  return (
    <div>
      <PageHeader
        title="Pickups"
        actions={
          !adding && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              + New pickup
            </Button>
          )
        }
      />
      {adding && (
        <Card className="mb-4" title={booking ? `Pickup for ${booking.name || 'diary booking'}` : repeatOf ? `New pickup from ${repeatOf.reference}` : 'New pickup'}>
          <PickupForm
            state={state}
            seller={fromBooking ?? repeatOf}
            onCancel={() => setAdding(false)}
            onSave={(data, next) => {
              // The old group's stock is nearly gone, so it drops out of the item picker.
              const previous = data.startsNewGroup ? pickups.find((p) => sellerKey(p) === sellerKey(data)) : undefined;
              if (previous) actions.setSellerResolved(previous.id, true);
              const pickup = actions.addPickup(data);
              if (booking) actions.completeBooking(booking.id, pickup.id);
              setAdding(false);
              if (next === 'done') return;
              if (next === 'quick') {
                sessionStorage.setItem(OPEN_QUICK_ENTRY_KEY, pickup.id);
                navigate({ name: 'pickup', id: pickup.id });
              } else {
                navigate({ name: 'add-item', pickupId: pickup.id });
              }
            }}
          />
        </Card>
      )}
      {pickups.length === 0 && !adding ? (
        <Empty>No pickups yet.</Empty>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupBySeller(pickups).map((group) => {
            const footer = <ResolveBar pickups={group} actions={actions} />;
            return group.length === 1 ? (
              <PickupCard key={group[0].id} state={state} pickup={group[0]} footer={footer} />
            ) : (
              <SellerGroup key={group[0].id} state={state} pickups={group} footer={footer} />
            );
          })}
        </div>
      )}
      {voided.length > 0 && (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-slate-500">Voided pickups ({voided.length}) - kept for the records, not counted</summary>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {voided.map((p) => (
              <li key={p.id} className="py-2">
                <a href={routeHref({ name: 'pickup', id: p.id })} className="text-slate-500 line-through">
                  {p.receiptNumber !== null && `No. ${p.receiptNumber} · `}
                  {p.reference} · {shortDate(p.date)} · {money(p.amountPaid)}
                </a>{' '}
                <VoidedNote voidedAt={p.voidedAt} reason={p.voidReason} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * "All items added" for a seller: their pickups stop being offered when
 * adding items. Undo brings them back.
 */
export function ResolveBar({ pickups, actions }: { pickups: Pickup[]; actions: AppActions }) {
  const resolved = pickups.every((p) => p.resolvedAt !== null);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      {resolved ? (
        <>
          <span className="font-medium text-emerald-700 dark:text-emerald-400">✓ All items added</span>
          <button type="button" className="text-slate-500 underline" onClick={() => actions.setSellerResolved(pickups[0].id, false)}>
            Undo
          </button>
        </>
      ) : (
        <>
          <span className="text-slate-500">Still adding items</span>
          <button type="button" className="font-medium text-brand-700 underline dark:text-brand-400" onClick={() => actions.setSellerResolved(pickups[0].id, true)}>
            Mark all items added
          </button>
        </>
      )}
    </div>
  );
}

function PickupCard({ state, pickup: p, inGroup = false, footer }: { state: AppState; pickup: Pickup; inGroup?: boolean; footer?: ReactNode }) {
  const s = pickupStats(state, p);
  const body = (
    <a
      href={routeHref({ name: 'pickup', id: p.id })}
      className={`block p-4 ${inGroup ? 'rounded-xl border border-slate-200 bg-white hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* In a seller's group the name and address are already in the group's heading */}
          {!inGroup && <div className="truncate font-medium text-slate-900 dark:text-slate-50">{p.reference}</div>}
          {!inGroup && (p.sellerAddress || p.sellerPostcode) && (
            <div className="truncate text-xs text-slate-500">{[firstAddressLine(p.sellerAddress), p.sellerPostcode].filter(Boolean).join(', ')}</div>
          )}
          <div className={inGroup ? 'text-sm text-slate-700 dark:text-slate-300' : 'text-xs text-slate-500'}>
            {p.receiptNumber !== null && `No. ${p.receiptNumber} · `}
            {shortDate(p.date)} · {p.handover === 'dropoff' ? 'drop-off · ' : ''}
            {kg(p.weightKg)} · cost {money(s.totalCost)}
          </div>
        </div>
        {/* In a group, items and profit belong to the customer and show on the group's heading */}
        {!inGroup && (
          <div className={`text-right text-sm font-semibold tabular-nums ${s.realisedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {money(s.realisedProfit)}
            <div className="text-xs font-normal text-slate-500">{percent(s.roi)} ROI</div>
          </div>
        )}
      </div>
      {!inGroup && <SoldBar stats={s} />}
    </a>
  );
  if (inGroup) return body;
  return (
    <div className="rounded-xl border border-slate-200 bg-white hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900">
      {body}
      {footer && <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">{footer}</div>}
    </div>
  );
}

function SoldBar({ stats: s }: { stats: PickupStats }) {
  return (
    <>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full bg-emerald-500" style={{ width: `${s.itemCount ? (s.soldCount / s.itemCount) * 100 : 0}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-500">
        <span>
          {s.soldCount}/{s.itemCount} sold
        </span>
        <span>{money(s.heldListValue)} still listed</span>
      </div>
    </>
  );
}

/** A repeat seller's pickups under one heading, newest first - tap to open */
function SellerGroup({ state, pickups, footer }: { state: AppState; pickups: Pickup[]; footer?: ReactNode }) {
  const latest = pickups[0];
  // Items are logged to the customer, so profit is only known for all their pickups together.
  const stats = customerStats(state, latest.id) ?? pickupStats(state, latest);
  const paid = stats.totalCost;
  const profit = stats.realisedProfit;
  const weight = pickups.reduce((t, p) => t + p.weightKg, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <details className="group">
        <summary className="block cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-900 dark:text-slate-50">{latest.reference}</span>
                <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200">{pickups.length} pickups</span>
              </div>
              {(latest.sellerAddress || latest.sellerPostcode) && (
                <div className="truncate text-xs text-slate-500">{[firstAddressLine(latest.sellerAddress), latest.sellerPostcode].filter(Boolean).join(', ')}</div>
              )}
              <div className="text-xs text-slate-500">
                Last {shortDate(latest.date)} · {kg(weight)} · cost {money(paid)}
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className={`text-right text-sm font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(profit)}</div>
              <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-180">
                ▾
              </span>
            </div>
          </div>
          <SoldBar stats={stats} />
        </summary>
        <div className="space-y-2 border-t border-slate-100 p-2 dark:border-slate-800">
          {pickups.map((p) => (
            <PickupCard key={p.id} state={state} pickup={p} inGroup />
          ))}
        </div>
      </details>
      {footer && <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">{footer}</div>}
    </div>
  );
}
