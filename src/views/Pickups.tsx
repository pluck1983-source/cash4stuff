import { useState } from 'react';
import type { AppState, Audited, Handover, PaymentMethod, Pickup } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { pickupStats, roundWeight } from '../lib/calc';
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

const PAYMENT_KEY = 'cash4stuff-last-payment-method';

type PickupDraft = Omit<Pickup, 'id' | 'updatedAt' | keyof Audited | 'amountPaid' | 'receiptNumber'>;

/** "12 High Street\nLeeds" or "12 High Street, Leeds" -> "12 High Street" */
function firstAddressLine(address: string): string {
  return address.split(/\n|,/)[0].trim();
}

export function PickupForm({
  state,
  initial,
  onSave,
  onCancel,
}: {
  state: AppState;
  initial?: Pickup;
  onSave: (data: PickupDraft, next: 'photo' | 'quick') => void;
  onCancel: () => void;
}) {
  const { settings } = state;
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [address, setAddress] = useState(initial?.sellerAddress ?? '');
  const [postcode, setPostcode] = useState(initial?.sellerPostcode ?? '');
  const [handover, setHandover] = useState<Handover>(initial?.handover ?? 'pickup');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const [rate, setRate] = useState(String(initial?.ratePerKg ?? settings.costPerKg));
  const [override, setOverride] = useState(initial?.costOverride != null ? String(initial.costOverride) : '');
  const [payment, setPayment] = useState<PaymentMethod>(initial?.paymentMethod ?? ((localStorage.getItem(PAYMENT_KEY) as PaymentMethod | null) || 'cash'));
  const [bankRef, setBankRef] = useState(initial?.bankRef ?? '');
  const [contact, setContact] = useState(initial?.sellerContact ?? '');
  const [paperSlip, setPaperSlip] = useState(initial?.paperSlipSigned ?? false);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

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
            paperSlipSigned: paperSlip,
            signaturePhotoId,
            notes: notes.trim(),
          },
          submitter?.value === 'quick' ? 'quick' : 'photo',
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
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Sarah Jones" autoComplete="off" autoFocus={!initial} />
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
      <Field label="Actually paid (optional)" hint="If you paid something other than weight × rate - or, for stock you already had, what you paid when you don't know the weight">
        <Input type="number" inputMode="decimal" step="0.01" min="0" value={override} onChange={(e) => setOverride(e.target.value)} placeholder={money(calculated)} />
      </Field>
      <Field label="Notes">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" className="flex-1" value="photo" disabled={saving}>
          {initial ? 'Save pickup' : 'Save & add items'}
        </Button>
        {!initial && (
          <Button type="submit" value="quick" className="flex-1" disabled={saving}>
            Save & quick entry (existing stock)
          </Button>
        )}
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function PickupsView({ state, books, actions }: { state: AppState; books: AppState; actions: AppActions }) {
  const [adding, setAdding] = useState(state.pickups.length === 0);
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
        <Card className="mb-4" title="New pickup">
          <PickupForm
            state={state}
            onCancel={() => setAdding(false)}
            onSave={(data, next) => {
              const pickup = actions.addPickup(data);
              setAdding(false);
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pickups.map((p) => {
            const s = pickupStats(state, p);
            return (
              <a
                key={p.id}
                href={routeHref({ name: 'pickup', id: p.id })}
                className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-slate-50">{p.reference}</div>
                    {(p.sellerAddress || p.sellerPostcode) && (
                      <div className="truncate text-xs text-slate-500">{[firstAddressLine(p.sellerAddress), p.sellerPostcode].filter(Boolean).join(', ')}</div>
                    )}
                    <div className="text-xs text-slate-500">
                      {p.receiptNumber !== null && `No. ${p.receiptNumber} · `}
                      {shortDate(p.date)} · {p.handover === 'dropoff' ? 'drop-off · ' : ''}
                      {kg(p.weightKg)} · cost {money(s.totalCost)}
                    </div>
                  </div>
                  <div className={`text-right text-sm font-semibold tabular-nums ${s.realisedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {money(s.realisedProfit)}
                    <div className="text-xs font-normal text-slate-500">{percent(s.roi)} ROI</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full bg-emerald-500" style={{ width: `${s.itemCount ? (s.soldCount / s.itemCount) * 100 : 0}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                  <span>
                    {s.soldCount}/{s.itemCount} sold
                  </span>
                  <span>{money(s.heldListValue)} still listed</span>
                </div>
              </a>
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
