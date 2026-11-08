import { useState } from 'react';
import type { AppState, InsurancePolicy, PremiumFrequency, RentFrequency, StorageUnit } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { money, parseNumber, shortDate } from '../lib/format';
import { newId, todayIso } from '../lib/storage';
import { savePhoto } from '../lib/photos';
import { prepareEvidence } from '../lib/evidence';
import { currentUnits, pastUnits, policiesForUnit, policyWarnings, uninsuredUnits, unitLabel, unitStockValue, type UnitInput } from '../lib/storageUnits';
import { isHeld } from '../lib/calc';
import { Button, Card, Empty, Field, Input, Select, TextArea } from './ui';
import { EvidenceThumb } from './Photo';

type UnitMode = { kind: 'add' } | { kind: 'edit'; unit: StorageUnit } | { kind: 'move'; from: StorageUnit };

interface UnitDraft {
  company: string;
  site: string;
  address: string;
  postcode: string;
  unitNumber: string;
  unitSize: string;
  accountRef: string;
  phone: string;
  email: string;
  noticePeriod: string;
  accessHours: string;
  area: string;
  startDate: string;
  rent: string;
  rentFrequency: RentFrequency;
  notes: string;
  moveStock: boolean;
  movePolicies: boolean;
}

function unitDraft(state: AppState, mode: UnitMode): UnitDraft {
  const blank: UnitDraft = {
    company: '',
    site: '',
    address: '',
    postcode: '',
    unitNumber: '',
    unitSize: '',
    accountRef: '',
    phone: '',
    email: '',
    noticePeriod: '',
    accessHours: '',
    area: state.settings.storageAreas.find((a) => /unit/i.test(a)) ?? '',
    startDate: todayIso(),
    rent: '',
    rentFrequency: 'monthly',
    notes: '',
    moveStock: true,
    movePolicies: true,
  };
  if (mode.kind === 'add') return blank;
  if (mode.kind === 'move') return { ...blank, area: '' };
  const u = mode.unit;
  const plan = u.recurringId ? state.recurring.find((r) => r.id === u.recurringId) : undefined;
  return { ...blank, ...u, rent: plan ? String(plan.amount) : '', rentFrequency: plan?.frequency ?? 'monthly' };
}

interface PolicyDraft {
  id?: string;
  insurer: string;
  broker: string;
  policyNumber: string;
  coverLevel: string;
  sumInsured: string;
  premium: string;
  premiumFrequency: PremiumFrequency;
  startDate: string;
  endDate: string;
  claimsPhone: string;
  claimsEmail: string;
  unitId: string;
  documentIds: string[];
  notes: string;
}

function policyDraft(state: AppState, p?: InsurancePolicy): PolicyDraft {
  if (p)
    return {
      ...p,
      sumInsured: p.sumInsured !== null ? String(p.sumInsured) : '',
      premium: p.premium !== null ? String(p.premium) : '',
      endDate: p.endDate ?? '',
      unitId: p.unitId ?? '',
    };
  return {
    insurer: '',
    broker: '',
    policyNumber: '',
    coverLevel: '',
    sumInsured: '',
    premium: '',
    premiumFrequency: 'yearly',
    startDate: todayIso(),
    endDate: '',
    claimsPhone: '',
    claimsEmail: '',
    unitId: currentUnits(state)[0]?.id ?? '',
    documentIds: [],
    notes: '',
  };
}

function Line({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-slate-500">{label}</span>
      {href ? (
        <a href={href} className="min-w-0 break-words font-medium text-brand-700 dark:text-brand-400">
          {value}
        </a>
      ) : (
        <span className="min-w-0 whitespace-pre-line break-words font-medium">{value}</span>
      )}
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {items.map((w) => (
        <li key={w}>⚠ {w}</li>
      ))}
    </ul>
  );
}

export function StorageAndInsurance({ state, actions }: { state: AppState; actions: AppActions }) {
  const today = todayIso();
  const [unitMode, setUnitMode] = useState<UnitMode | null>(null);
  const [unit, setUnit] = useState<UnitDraft>(() => unitDraft(state, { kind: 'add' }));
  const [policy, setPolicy] = useState<PolicyDraft | null>(null);
  const [showPast, setShowPast] = useState(false);

  const current = currentUnits(state);
  const past = pastUnits(state);
  const uninsured = uninsuredUnits(state, today);
  const policies = [...state.policies].sort((a, b) => (b.endDate ?? '9999').localeCompare(a.endDate ?? '9999'));

  function openUnit(mode: UnitMode) {
    setUnitMode(mode);
    setUnit(unitDraft(state, mode));
    setPolicy(null);
  }

  function saveUnitForm() {
    if (!unitMode) return;
    const area = unit.area.trim() || [unit.company.trim(), unit.unitNumber.trim()].filter(Boolean).join(' ') || 'Storage unit';
    const input: UnitInput = {
      company: unit.company.trim(),
      site: unit.site.trim(),
      address: unit.address.trim(),
      postcode: unit.postcode.trim().toUpperCase(),
      unitNumber: unit.unitNumber.trim(),
      unitSize: unit.unitSize.trim(),
      accountRef: unit.accountRef.trim(),
      phone: unit.phone.trim(),
      email: unit.email.trim(),
      noticePeriod: unit.noticePeriod.trim(),
      accessHours: unit.accessHours.trim(),
      area,
      startDate: unit.startDate || today,
      notes: unit.notes.trim(),
    };
    const amount = parseNumber(unit.rent);
    const rent = amount !== null ? { amount, frequency: unit.rentFrequency } : null;
    if (unitMode.kind === 'move') {
      const r = actions.moveStorageUnit(unitMode.from.id, input, rent, { moveDate: input.startDate, moveStock: unit.moveStock, movePolicies: unit.movePolicies });
      const told = r.movedPolicies
        ? `\n\n${r.movedPolicies} insurance polic${r.movedPolicies === 1 ? 'y now points' : 'ies now point'} at the new unit. Tell the insurer the new address before you move - most storage policies name the facility, and stock at an address they don't know about may not be covered.`
        : '';
      window.alert(`Moved to ${unitLabel(input)}.${r.movedItems ? ` ${r.movedItems} unsold item records now show "${area}" - update racks and boxes as you unpack.` : ''} The old unit's rent stops the day before ${shortDate(input.startDate)}.${told}`);
    } else {
      actions.saveStorageUnit({ ...input, id: unitMode.kind === 'edit' ? unitMode.unit.id : undefined }, rent);
    }
    setUnitMode(null);
  }

  function savePolicyForm() {
    if (!policy) return;
    actions.savePolicy({
      id: policy.id,
      insurer: policy.insurer.trim(),
      broker: policy.broker.trim(),
      policyNumber: policy.policyNumber.trim(),
      coverLevel: policy.coverLevel.trim(),
      sumInsured: parseNumber(policy.sumInsured),
      premium: parseNumber(policy.premium),
      premiumFrequency: policy.premiumFrequency,
      startDate: policy.startDate || today,
      endDate: policy.endDate || null,
      claimsPhone: policy.claimsPhone.trim(),
      claimsEmail: policy.claimsEmail.trim(),
      unitId: policy.unitId || null,
      documentIds: policy.documentIds,
      notes: policy.notes.trim(),
    });
    setPolicy(null);
  }

  async function addDocuments(files: FileList | null) {
    if (!files?.length) return;
    const ids: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const id = newId();
        await savePhoto(id, await prepareEvidence(file), false);
        ids.push(id);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : `Couldn't add ${file.name}`);
      }
    }
    setPolicy((p) => (p ? { ...p, documentIds: [...p.documentIds, ...ids] } : p));
  }

  const set = (patch: Partial<UnitDraft>) => setUnit((u) => ({ ...u, ...patch }));
  const setP = (patch: Partial<PolicyDraft>) => setPolicy((p) => (p ? { ...p, ...patch } : p));
  const moveFrom = unitMode?.kind === 'move' ? unitMode.from : null;
  const movingItems = moveFrom ? state.items.filter((i) => isHeld(i) && i.location.area === moveFrom.area).length : 0;
  const movingPolicies = moveFrom ? policiesForUnit(state, moveFrom.id, today).length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {uninsured.length > 0 && (
          <Warnings items={uninsured.map((u) => `${unitLabel(u)} has stock in it but no current insurance policy recorded`)} />
        )}

        <Card
          title="Storage units"
          action={
            <Button onClick={() => openUnit({ kind: 'add' })} className="text-sm">
              + Add unit
            </Button>
          }
        >
          {current.length === 0 ? (
            <Empty>No storage unit recorded. Add the company and unit details so they're to hand - and in the insurance pack - if anything happens.</Empty>
          ) : (
            <ul className="space-y-4">
              {current.map((u) => {
                const v = unitStockValue(state, u);
                const plan = u.recurringId ? state.recurring.find((r) => r.id === u.recurringId) : undefined;
                const cover = policiesForUnit(state, u.id, today);
                return (
                  <li key={u.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{unitLabel(u)}</div>
                        <div className="text-xs text-slate-500">
                          Since {shortDate(u.startDate)} · stock area “{u.area}” · {v.pieces} pieces, cost {money(v.cost)}, asking {money(v.asking)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button className="text-xs" onClick={() => openUnit({ kind: 'edit', unit: u })}>
                          Edit
                        </Button>
                        <Button className="text-xs" variant="primary" onClick={() => openUnit({ kind: 'move', from: u })}>
                          Move to new unit
                        </Button>
                        <Button
                          className="text-xs"
                          onClick={() => {
                            const date = window.prompt('Date you moved out (yyyy-mm-dd)? The rent stops the day before.', today)?.trim();
                            if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) actions.endStorageUnit(u.id, date);
                          }}
                        >
                          Moved out
                        </Button>
                      </div>
                    </div>
                    <Line label="Address" value={[u.address, u.postcode].filter(Boolean).join('\n')} />
                    <Line label="Size" value={u.unitSize} />
                    <Line label="Account no." value={u.accountRef} />
                    <Line label="Phone" value={u.phone} href={`tel:${u.phone.replace(/\s/g, '')}`} />
                    <Line label="Email" value={u.email} href={`mailto:${u.email}`} />
                    <Line label="Access" value={u.accessHours} />
                    <Line label="Notice" value={u.noticePeriod} />
                    <Line label="Rent" value={plan ? `${money(plan.amount)} per ${plan.frequency === 'weekly' ? 'week' : 'month'} (posted to costs automatically)` : ''} />
                    <Line label="Insured by" value={cover.map((p) => [p.broker || p.insurer, p.policyNumber].filter(Boolean).join(' · ')).join('\n')} />
                    <Line label="Notes" value={u.notes} />
                  </li>
                );
              })}
            </ul>
          )}
          {past.length > 0 && (
            <div className="mt-3">
              <button type="button" className="text-sm font-medium text-brand-700 dark:text-brand-400" onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Hide' : 'Show'} previous units ({past.length})
              </button>
              {showPast && (
                <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {past.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                      <button type="button" className="min-w-0 text-left" onClick={() => openUnit({ kind: 'edit', unit: u })}>
                        <div className="font-medium">{unitLabel(u)}</div>
                        <div className="text-xs text-slate-500">
                          {shortDate(u.startDate)} - {shortDate(u.endDate)}
                          {u.accountRef && ` · account ${u.accountRef}`}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Insurance"
          action={
            <Button
              onClick={() => {
                setUnitMode(null);
                setPolicy(policyDraft(state));
              }}
              className="text-sm"
            >
              + Add policy
            </Button>
          }
        >
          {policies.length === 0 ? (
            <Empty>No policy recorded. Add the policy number and claims line so they're to hand when you need them.</Empty>
          ) : (
            <ul className="space-y-3">
              {policies.map((p) => {
                const u = p.unitId ? state.storageUnits.find((x) => x.id === p.unitId) : undefined;
                const ended = p.endDate !== null && p.endDate < today;
                return (
                  <li key={p.id} className={`rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${ended ? 'opacity-60' : ''}`}>
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {[p.broker, p.insurer].filter(Boolean).join(' / ') || 'Policy'}
                          {p.coverLevel && <span className="font-normal text-slate-500"> · {p.coverLevel}</span>}
                        </div>
                        <div className="text-xs text-slate-500">
                          {shortDate(p.startDate)} - {p.endDate ? shortDate(p.endDate) : 'rolling'}
                          {u && ` · covers ${unitLabel(u)}`}
                        </div>
                      </div>
                      <Button
                        className="text-xs"
                        onClick={() => {
                          setUnitMode(null);
                          setPolicy(policyDraft(state, p));
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                    <Line label="Policy no." value={p.policyNumber} />
                    <Line label="Sum insured" value={p.sumInsured !== null ? money(p.sumInsured) : ''} />
                    <Line label="Premium" value={p.premium !== null ? `${money(p.premium)} ${p.premiumFrequency === 'monthly' ? 'a month' : p.premiumFrequency === 'yearly' ? 'a year' : 'one-off'}` : ''} />
                    <Line label="Claims phone" value={p.claimsPhone} href={`tel:${p.claimsPhone.replace(/\s/g, '')}`} />
                    <Line label="Claims email" value={p.claimsEmail} href={`mailto:${p.claimsEmail}`} />
                    <Line label="Notes" value={p.notes} />
                    {p.documentIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.documentIds.map((id) => (
                          <EvidenceThumb key={id} id={id} className="h-16 w-12 rounded" />
                        ))}
                      </div>
                    )}
                    {!ended && <Warnings items={policyWarnings(state, p, today)} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* On a phone the form comes first, so tapping Edit or Move shows it straight away */}
      <div className="order-first min-w-0 lg:order-none">
        {unitMode && (
          <Card title={unitMode.kind === 'add' ? 'Add a storage unit' : unitMode.kind === 'edit' ? 'Edit storage unit' : `Move from ${unitLabel(unitMode.from)}`}>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveUnitForm();
              }}
            >
              {unitMode.kind === 'move' && (
                <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  The old unit is kept on record with an end date and its rent stops. Enter the new company and unit below.
                </p>
              )}
              <Field label="Storage company">
                <Input value={unit.company} onChange={(e) => set({ company: e.target.value })} placeholder="e.g. Big Yellow" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Site / branch">
                  <Input value={unit.site} onChange={(e) => set({ site: e.target.value })} placeholder="e.g. Swindon" />
                </Field>
                <Field label="Unit number">
                  <Input value={unit.unitNumber} onChange={(e) => set({ unitNumber: e.target.value })} />
                </Field>
              </div>
              <Field label="Address">
                <TextArea rows={2} value={unit.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Postcode">
                  <Input value={unit.postcode} onChange={(e) => set({ postcode: e.target.value })} />
                </Field>
                <Field label="Unit size">
                  <Input value={unit.unitSize} onChange={(e) => set({ unitSize: e.target.value })} placeholder="e.g. 50 sq ft" />
                </Field>
              </div>
              <Field label="Account / contract number">
                <Input value={unit.accountRef} onChange={(e) => set({ accountRef: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input type="tel" value={unit.phone} onChange={(e) => set({ phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={unit.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Access hours">
                  <Input value={unit.accessHours} onChange={(e) => set({ accessHours: e.target.value })} placeholder="e.g. 6am-10pm, keypad" />
                </Field>
                <Field label="Notice to leave">
                  <Input value={unit.noticePeriod} onChange={(e) => set({ noticePeriod: e.target.value })} placeholder="e.g. 14 days" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rent (£)" hint="Posted to costs as a repeating cost">
                  <Input type="number" inputMode="decimal" step="0.01" min="0" value={unit.rent} onChange={(e) => set({ rent: e.target.value })} />
                </Field>
                <Field label="Every">
                  <Select value={unit.rentFrequency} onChange={(e) => set({ rentFrequency: e.target.value as RentFrequency })}>
                    <option value="monthly">Month</option>
                    <option value="weekly">Week</option>
                  </Select>
                </Field>
              </div>
              <Field label={unitMode.kind === 'move' ? 'Moving date' : 'Moved in'}>
                <Input type="date" value={unit.startDate} onChange={(e) => set({ startDate: e.target.value })} required />
              </Field>
              <Field label="Stock area name" hint="What items in this unit show as their storage area">
                <Input list="storage-areas" value={unit.area} onChange={(e) => set({ area: e.target.value })} placeholder={[unit.company, unit.unitNumber].filter(Boolean).join(' ') || 'e.g. Storage unit'} />
                <datalist id="storage-areas">
                  {state.settings.storageAreas.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </Field>
              {unitMode.kind === 'move' && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <label className="flex gap-2">
                    <input type="checkbox" checked={unit.moveStock} onChange={(e) => set({ moveStock: e.target.checked })} />
                    <span>Move the {movingItems} unsold item records from “{unitMode.from.area}” to the new unit (sold items keep their old location)</span>
                  </label>
                  {movingPolicies > 0 && (
                    <label className="flex gap-2">
                      <input type="checkbox" checked={unit.movePolicies} onChange={(e) => set({ movePolicies: e.target.checked })} />
                      <span>Move {movingPolicies === 1 ? 'the insurance policy' : `the ${movingPolicies} insurance policies`} to the new unit - you still need to tell the insurer</span>
                    </label>
                  )}
                </div>
              )}
              <Field label="Notes">
                <TextArea rows={2} value={unit.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary">
                  {unitMode.kind === 'move' ? 'Move' : 'Save'}
                </Button>
                <Button type="button" onClick={() => setUnitMode(null)}>
                  Cancel
                </Button>
                {unitMode.kind === 'edit' && (
                  <Button
                    type="button"
                    className="text-red-700"
                    onClick={() => {
                      if (!window.confirm('Delete this unit? Use "Moved out" instead if you rented it - deleting removes its details. Its rent stays in Repeating costs.')) return;
                      actions.deleteStorageUnit(unitMode.unit.id);
                      setUnitMode(null);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </form>
          </Card>
        )}

        {policy && (
          <Card title={policy.id ? 'Edit policy' : 'Add an insurance policy'}>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                savePolicyForm();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bought through (broker)">
                  <Input value={policy.broker} onChange={(e) => setP({ broker: e.target.value })} placeholder="e.g. Surewise" />
                </Field>
                <Field label="Insurer">
                  <Input value={policy.insurer} onChange={(e) => setP({ insurer: e.target.value })} placeholder="e.g. SAGIC" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Policy number">
                  <Input value={policy.policyNumber} onChange={(e) => setP({ policyNumber: e.target.value })} required />
                </Field>
                <Field label="Cover level">
                  <Input value={policy.coverLevel} onChange={(e) => setP({ coverLevel: e.target.value })} placeholder="e.g. Silver, business" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sum insured (£)">
                  <Input type="number" inputMode="decimal" step="1" min="0" value={policy.sumInsured} onChange={(e) => setP({ sumInsured: e.target.value })} />
                </Field>
                <Field label="Premium (£)">
                  <div className="flex gap-1">
                    <Input type="number" inputMode="decimal" step="0.01" min="0" value={policy.premium} onChange={(e) => setP({ premium: e.target.value })} />
                    <Select value={policy.premiumFrequency} onChange={(e) => setP({ premiumFrequency: e.target.value as PremiumFrequency })} className="w-auto" aria-label="Premium paid">
                      <option value="yearly">/yr</option>
                      <option value="monthly">/mo</option>
                      <option value="once">once</option>
                    </Select>
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <Input type="date" value={policy.startDate} onChange={(e) => setP({ startDate: e.target.value })} required />
                </Field>
                <Field label="Renews / ends">
                  <Input type="date" value={policy.endDate} min={policy.startDate} onChange={(e) => setP({ endDate: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Claims phone">
                  <Input type="tel" value={policy.claimsPhone} onChange={(e) => setP({ claimsPhone: e.target.value })} placeholder="e.g. 01268 200 020" />
                </Field>
                <Field label="Claims email">
                  <Input type="email" value={policy.claimsEmail} onChange={(e) => setP({ claimsEmail: e.target.value })} />
                </Field>
              </div>
              <Field label="Covers">
                <Select value={policy.unitId} onChange={(e) => setP({ unitId: e.target.value })}>
                  <option value="">No particular unit</option>
                  {state.storageUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {unitLabel(u)}
                      {u.endDate ? ' (moved out)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Policy documents" hint="Schedule, certificate, IPID - photos or PDFs">
                <div className="flex flex-wrap gap-2">
                  {policy.documentIds.map((id) => (
                    <div key={id} className="relative">
                      <EvidenceThumb id={id} className="h-20 w-16 rounded-lg" />
                      <button
                        type="button"
                        aria-label="Remove document"
                        className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-slate-900 text-xs text-white"
                        onClick={() => setP({ documentIds: policy.documentIds.filter((x) => x !== id) })}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <label className="flex h-20 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs text-slate-500 dark:border-slate-600">
                    <span className="text-xl leading-none">+</span>
                    Add
                    <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => void addDocuments(e.target.files).then(() => (e.target.value = ''))} />
                  </label>
                </div>
              </Field>
              <Field label="Notes">
                <TextArea rows={2} value={policy.notes} onChange={(e) => setP({ notes: e.target.value })} placeholder="e.g. Stock needs proof of purchase; theft needs forced entry" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary">
                  Save
                </Button>
                <Button type="button" onClick={() => setPolicy(null)}>
                  Cancel
                </Button>
                {policy.id && (
                  <Button
                    type="button"
                    className="text-red-700"
                    onClick={() => {
                      if (!window.confirm('Delete this policy and its documents? To keep a record of an old policy, set its end date instead.')) return;
                      actions.deletePolicy(policy.id as string);
                      setPolicy(null);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
