import type { AppState, Expense, InsurancePolicy, Item, Pickup, StorageUnit } from './types';
import { currentUnits, policiesForUnit, policyWarnings, unitForArea, unitLabel } from './storageUnits';
import { categoryLabel, isHeld, itemCostMap, listValue, locationLabel } from './calc';
import { liveState, paymentLabel } from './audit';
import { toCsv } from './records';
import { makeZip, type ZipEntry } from './zip';
import { evidenceExtension } from './evidence';

/**
 * The insurance claim pack: everything an insurer asks for when stock in
 * storage is lost or damaged, as of the moment it's made.
 *
 * Storage policies (e.g. SAGIC via Surewise) exclude commercial stock unless
 * there's proof of purchase for it, and want evidence of value and age for
 * every item claimed. So for each item still held this gives its photo, where
 * it was stored, when it came in, which numbered purchase receipt it came from
 * (with the seller's signature), what it cost and what it was priced at - plus
 * the storage unit's own costs and receipts, to show the unit was rented.
 *
 * Make one regularly and keep a copy somewhere other than the storage unit and
 * this device (email it to yourself, or save it to Drive): if the claim is for
 * fire or theft, the records need to survive it.
 */

export interface ClaimPackOptions {
  /** Only stock in this storage area ('' = every area) */
  area: string;
  /** When the pack is made - shown in it, so the insurer knows what "now" was */
  generatedAt?: Date;
}

/** Gaps an insurer could use to reduce or refuse a claim - shown before and after exporting */
export interface ClaimReadiness {
  records: number;
  units: number;
  costValue: number;
  listValue: number;
  /** Item records with no photo */
  noPhoto: number;
  /** Not linked to any purchase, so no proof of purchase */
  noPurchase: number;
  /** Linked to a purchase that has no receipt number */
  noReceiptNumber: number;
  /** Purchases behind this stock that the seller hasn't signed (on screen or on paper) */
  unsignedPurchases: number;
  /** Purchases behind this stock that have been voided */
  voidedPurchases: number;
  /** Items with no price and no cost, so nothing to value them by */
  unvalued: number;
}

export function claimItems(state: AppState, area: string): Item[] {
  return state.items
    .filter((i) => isHeld(i) && (!area || i.location.area === area))
    .sort((a, b) => locationLabel(a.location).localeCompare(locationLabel(b.location), undefined, { numeric: true }) || a.sku.localeCompare(b.sku, undefined, { numeric: true }));
}

function pickupsFor(state: AppState, items: Item[]): Pickup[] {
  const ids = new Set(items.map((i) => i.pickupId).filter((id): id is string => !!id));
  return state.pickups.filter((p) => ids.has(p.id)).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
}

/** Storage-unit costs (rent, insurance) prove the unit was rented and when - matched on the cost type or description */
function storageCosts(state: AppState): Expense[] {
  return liveState(state)
    .expenses.filter((e) => /storage/i.test(e.category) || /storage/i.test(e.description))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The unit(s) the pack covers and the live policies on them */
export function claimCover(state: AppState, area: string, today: string): { units: StorageUnit[]; policies: InsurancePolicy[] } {
  const units = area ? [unitForArea(state, area)].filter((u): u is StorageUnit => !!u) : currentUnits(state);
  const policies = units.flatMap((u) => policiesForUnit(state, u.id, today));
  return { units, policies };
}

/** Gaps in the unit and policy details for this pack */
export function coverWarnings(state: AppState, area: string, today: string): string[] {
  const { units, policies } = claimCover(state, area, today);
  const out: string[] = [];
  if (area && units.length === 0) out.push(`No storage unit recorded for "${area}" (Costs → Storage & insurance)`);
  if (units.length > 0 && policies.length === 0) out.push('No current insurance policy recorded for this storage');
  for (const p of policies) for (const w of policyWarnings(state, p, today)) out.push(`Policy ${p.policyNumber || '(no number)'}: ${w}`);
  return out;
}

export function claimReadiness(state: AppState, area: string): ClaimReadiness {
  const items = claimItems(state, area);
  const costs = itemCostMap(liveState(state));
  const pickups = new Map(state.pickups.map((p) => [p.id, p]));
  const behind = pickupsFor(state, items);
  return {
    records: items.length,
    units: items.reduce((t, i) => t + i.quantity, 0),
    costValue: items.reduce((t, i) => t + (costs.get(i.id) ?? 0), 0),
    listValue: items.reduce((t, i) => t + listValue(i), 0),
    noPhoto: items.filter((i) => !i.photoId).length,
    noPurchase: items.filter((i) => !i.pickupId || !pickups.has(i.pickupId)).length,
    noReceiptNumber: items.filter((i) => i.pickupId && pickups.get(i.pickupId) && pickups.get(i.pickupId)?.receiptNumber === null).length,
    unsignedPurchases: behind.filter((p) => !p.voidedAt && !p.signaturePhotoId && !p.paperSlipSigned).length,
    voidedPurchases: behind.filter((p) => p.voidedAt).length,
    unvalued: items.filter((i) => !i.listPrice && !costs.get(i.id)).length,
  };
}

/** Plain-English list of the gaps, empty when there are none */
export function readinessWarnings(r: ClaimReadiness): string[] {
  const out: string[] = [];
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  if (r.noPurchase) out.push(`${n(r.noPurchase, 'item')} not linked to a purchase - no proof of purchase, which the policy needs for stock`);
  if (r.noReceiptNumber) out.push(`${n(r.noReceiptNumber, 'item')} from a purchase with no receipt number`);
  if (r.unsignedPurchases) out.push(`${n(r.unsignedPurchases, 'purchase')} the seller hasn't signed for`);
  if (r.voidedPurchases) out.push(`${n(r.voidedPurchases, 'voided purchase')} still has stock linked to it`);
  if (r.noPhoto) out.push(`${n(r.noPhoto, 'item')} with no photo`);
  if (r.unvalued) out.push(`${n(r.unvalued, 'item')} with no price and no cost`);
  return out;
}

function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

export function itemPhotoFile(item: Pick<Item, 'id' | 'sku'>): string {
  return `photos/${slug(item.sku || item.id)}-${item.id.slice(0, 6)}.jpg`;
}

export function receiptLabel(p: Pick<Pickup, 'receiptNumber'>): string {
  return p.receiptNumber !== null ? String(p.receiptNumber).padStart(5, '0') : '';
}

function signatureFile(p: Pickup): string {
  return `signatures/receipt-${receiptLabel(p) || p.id.slice(0, 8)}.png`;
}

function storageFile(e: Expense, n: number, ext = 'jpg'): string {
  return `storage-costs/${e.date}-${e.id.slice(0, 8)}-${n + 1}.${ext}`;
}

const gbp = (v: number) => v.toFixed(2);

export function inventoryCsv(state: AppState, items: Item[], photoFiles: Map<string, string>): string {
  const costs = itemCostMap(liveState(state));
  const pickups = new Map(state.pickups.map((p) => [p.id, p]));
  const rows = items.map((i) => {
    const p = i.pickupId ? pickups.get(i.pickupId) : undefined;
    const cost = costs.get(i.id);
    return [
      i.sku,
      i.name,
      categoryLabel(i),
      i.keywords,
      i.quantity,
      i.location.area,
      i.location.rack,
      i.location.box,
      p?.date ?? i.createdAt.slice(0, 10),
      p ? receiptLabel(p) || 'no number' : 'NO PURCHASE RECORD',
      p?.reference ?? '',
      p?.voidedAt ? 'purchase voided' : '',
      cost !== undefined ? gbp(cost) : '',
      i.listPrice !== null ? gbp(i.listPrice) : '',
      gbp(listValue(i)),
      i.status === 'listed' || i.listPrice ? 'priced' : 'not priced',
      photoFiles.get(i.id) ?? (i.photoId ? 'photo could not be loaded' : 'no photo'),
      i.notes,
      i.createdAt,
      i.updatedAt,
      i.id,
    ];
  });
  return toCsv(
    ['sku', 'description', 'category', 'brand_colour_size', 'quantity', 'storage_area', 'rack', 'box', 'date_acquired', 'purchase_receipt', 'bought_from', 'purchase_note', 'cost_gbp', 'asking_price_each_gbp', 'asking_value_gbp', 'priced', 'photo_file', 'notes', 'entered_at', 'last_changed_at', 'id'],
    rows,
  );
}

export function purchasesForClaimCsv(state: AppState, items: Item[], signatureFiles: Map<string, string>): string {
  const counts = new Map<string, number>();
  for (const i of items) if (i.pickupId) counts.set(i.pickupId, (counts.get(i.pickupId) ?? 0) + i.quantity);
  const rows = pickupsFor(state, items).map((p) => [
    receiptLabel(p),
    p.date,
    p.reference,
    p.sellerAddress,
    p.sellerPostcode,
    p.handover === 'dropoff' ? 'dropped off' : 'collected',
    'used clothing and textiles',
    p.weightKg,
    gbp(p.ratePerKg),
    gbp(p.amountPaid),
    paymentLabel(p.paymentMethod),
    p.bankRef,
    p.signaturePhotoId ? 'on screen' : p.paperSlipSigned ? 'paper slip' : 'not signed',
    signatureFiles.get(p.id) ?? '',
    counts.get(p.id) ?? 0,
    p.createdAt,
    p.voidedAt ?? '',
    p.voidReason,
    p.id,
  ]);
  return toCsv(
    ['receipt_number', 'date_bought', 'seller', 'seller_address', 'seller_postcode', 'collected_or_dropped_off', 'goods', 'weight_kg', 'rate_per_kg_gbp', 'amount_paid_gbp', 'payment_method', 'bank_ref', 'seller_signed', 'signature_file', 'items_from_it_in_this_pack', 'entered_at', 'voided_at', 'void_reason', 'id'],
    rows,
  );
}

export function storageCostsCsv(costs: Expense[], files: Map<string, string[]>): string {
  return toCsv(
    ['date_paid', 'type', 'description', 'amount_gbp', 'payment_method', 'receipt_files', 'entered_at', 'id'],
    costs.map((e) => [e.date, e.category, e.description, gbp(e.amount), paymentLabel(e.paymentMethod), (files.get(e.id) ?? []).join(' '), e.createdAt, e.id]),
  );
}

function esc(text: string | number | null | undefined): string {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const money = (v: number) => `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A printable inventory with the photos beside each item - open it in a browser and print or save as PDF */
export function inventoryHtml(
  state: AppState,
  items: Item[],
  r: ClaimReadiness,
  opts: { area: string; generatedAt: Date; photoFiles: Map<string, string>; signatureFiles: Map<string, string>; documentFiles?: Map<string, string[]> },
): string {
  const cover = claimCover(state, opts.area, opts.generatedAt.toISOString().slice(0, 10));
  const coverHtml = `${cover.units
    .map(
      (u) => `<h3>Stored at: ${esc(unitLabel(u))}</h3><table class="summary">
${[
  ['Address', [u.address, u.postcode].filter(Boolean).join(', ')],
  ['Unit size', u.unitSize],
  ['Account no.', u.accountRef],
  ['Phone', u.phone],
  ['Email', u.email],
  ['Renting since', u.startDate],
]
  .filter(([, v]) => v)
  .map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
  .join('')}</table>`,
    )
    .join('')}${cover.policies
    .map((p) => {
      const docs = opts.documentFiles?.get(p.id) ?? [];
      return `<h3>Insured: ${esc([p.broker, p.insurer].filter(Boolean).join(' / ') || 'Policy')}</h3><table class="summary">
${[
  ['Policy number', p.policyNumber],
  ['Cover', p.coverLevel],
  ['Sum insured', p.sumInsured !== null ? money(p.sumInsured) : ''],
  ['Period', `${p.startDate} to ${p.endDate ?? 'rolling'}`],
  ['Claims phone', p.claimsPhone],
  ['Claims email', p.claimsEmail],
]
  .filter(([, v]) => v)
  .map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
  .join('')}${docs.length ? `<tr><td>Documents</td><td>${docs.map((d) => `<a href="${esc(d)}">${esc(d.split('/').pop())}</a>`).join(', ')}</td></tr>` : ''}</table>`;
    })
    .join('')}`;
  const costs = itemCostMap(liveState(state));
  const pickups = new Map(state.pickups.map((p) => [p.id, p]));
  const s = state.settings;
  const when = opts.generatedAt.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const warnings = readinessWarnings(r);

  const groups = new Map<string, Item[]>();
  for (const i of items) {
    const key = locationLabel(i.location) || 'No location recorded';
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  const itemRows = [...groups]
    .map(
      ([where, list]) => `
<h3>${esc(where)} <small>(${list.reduce((t, i) => t + i.quantity, 0)} items)</small></h3>
<table class="items"><thead><tr><th>Photo</th><th>Item</th><th>Qty</th><th>Acquired</th><th>Receipt</th><th class="num">Cost</th><th class="num">Asking</th></tr></thead><tbody>
${list
  .map((i) => {
    const p = i.pickupId ? pickups.get(i.pickupId) : undefined;
    const photo = opts.photoFiles.get(i.id);
    const cost = costs.get(i.id);
    return `<tr>
<td class="ph">${photo ? `<a href="${esc(photo)}"><img src="${esc(photo)}" alt=""></a>` : '<span class="warn">no photo</span>'}</td>
<td><b>${esc(i.name || categoryLabel(i))}</b><br><span class="muted">${esc(i.sku)} · ${esc(categoryLabel(i))}${i.keywords ? ` · ${esc(i.keywords)}` : ''}</span>${i.notes ? `<br><span class="muted">${esc(i.notes)}</span>` : ''}</td>
<td>${i.quantity}</td>
<td>${esc(p?.date ?? i.createdAt.slice(0, 10))}</td>
<td>${p ? esc(receiptLabel(p) || 'no number') + (p.voidedAt ? ' <span class="warn">(voided)</span>' : '') : '<span class="warn">none</span>'}</td>
<td class="num">${cost !== undefined ? money(cost) : '-'}</td>
<td class="num">${i.listPrice !== null ? money(listValue(i)) : '-'}</td>
</tr>`;
  })
  .join('\n')}
</tbody></table>`,
    )
    .join('\n');

  const purchaseRows = pickupsFor(state, items)
    .map((p) => {
      const sig = opts.signatureFiles.get(p.id);
      return `<tr><td>${esc(receiptLabel(p) || '-')}</td><td>${esc(p.date)}</td><td>${esc(p.reference)}${p.sellerPostcode ? `<br><span class="muted">${esc(p.sellerPostcode)}</span>` : ''}</td><td class="num">${p.weightKg} kg</td><td class="num">${money(p.amountPaid)}</td><td>${esc(paymentLabel(p.paymentMethod) || '-')}${p.bankRef ? `<br><span class="muted">${esc(p.bankRef)}</span>` : ''}</td><td>${sig ? `<img class="sig" src="${esc(sig)}" alt="signature">` : p.paperSlipSigned ? 'paper slip' : '<span class="warn">not signed</span>'}${p.voidedAt ? ` <span class="warn">voided: ${esc(p.voidReason)}</span>` : ''}</td></tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stock inventory for insurance - ${esc(opts.area || 'all storage')} - ${esc(opts.generatedAt.toISOString().slice(0, 10))}</title>
<style>
body{font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:1000px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #111}h3{font-size:15px;margin:20px 0 6px}
small,.muted{color:#555;font-weight:normal}.warn{color:#b00020;font-weight:600}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f3f3f3;font-size:12px}
.num{text-align:right;white-space:nowrap}.ph img{width:96px;height:96px;object-fit:cover;border-radius:4px}.sig{height:48px;background:#fff}
.summary td{border:none;padding:2px 12px 2px 0}.box{border:1px solid #e0a800;background:#fff8e1;padding:8px 12px;border-radius:6px}
tr{break-inside:avoid}@media print{a{color:inherit;text-decoration:none}}
</style></head><body>
<h1>Stock inventory${opts.area ? ` - ${esc(opts.area)}` : ''}</h1>
<div>${esc(s.businessName || 'Business')}${s.traderName ? ` · ${esc(s.traderName)}` : ''}</div>
${s.businessAddress ? `<div class="muted" style="white-space:pre-line">${esc(s.businessAddress)}</div>` : ''}
<p>Stock held as of <b>${esc(when)}</b>, taken from the business's stock and purchase records.</p>
<table class="summary">
<tr><td>Item records</td><td><b>${r.records}</b> (${r.units} pieces)</td></tr>
<tr><td>Cost of this stock (what was paid for it)</td><td><b>${money(r.costValue)}</b></td></tr>
<tr><td>Asking price of this stock</td><td><b>${money(r.listValue)}</b></td></tr>
<tr><td>Purchases it came from</td><td><b>${pickupsFor(state, items).length}</b> numbered purchase receipts - see below</td></tr>
</table>
<p class="muted">Cost per item is the purchase price of the lot it came from (stock is bought by weight) shared equally across the pieces logged from that lot.</p>
${coverHtml}
${warnings.length ? `<div class="box"><b>Gaps in these records:</b><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
<h2>Items by storage location</h2>
${itemRows || '<p>No stock held.</p>'}
<h2>Purchase receipts</h2>
<p class="muted">Each purchase is a numbered receipt for used clothing bought by weight, signed by the seller. Full details are in purchases.csv.</p>
<table><thead><tr><th>Receipt</th><th>Date</th><th>Seller</th><th class="num">Weight</th><th class="num">Paid</th><th>Payment</th><th>Signed</th></tr></thead><tbody>
${purchaseRows || '<tr><td colspan="7">None</td></tr>'}
</tbody></table>
<p class="muted" style="margin-top:24px">Made by Wardrobe to Wallet on ${esc(opts.generatedAt.toISOString())}.</p>
</body></html>
`;
}

function readme(state: AppState, r: ClaimReadiness, area: string, generatedAt: Date, missingPhotos: number): string {
  const today = generatedAt.toISOString().slice(0, 10);
  const warnings = [...readinessWarnings(r), ...coverWarnings(state, area, today)];
  const { units, policies } = claimCover(state, area, today);
  return [
    `STOCK INVENTORY FOR INSURANCE${area ? ` - ${area}` : ''}`,
    `Made ${generatedAt.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })} (${generatedAt.toISOString()})`,
    '',
    `${r.records} item records (${r.units} pieces). Cost £${gbp(r.costValue)}, asking price £${gbp(r.listValue)}.`,
    '',
    ...units.map((u) => `STORED AT: ${unitLabel(u)}${u.address ? `, ${u.address.replace(/\n/g, ', ')}` : ''}${u.postcode ? ` ${u.postcode}` : ''}${u.accountRef ? ` (account ${u.accountRef})` : ''}${u.phone ? ` - ${u.phone}` : ''}`),
    ...policies.map((p) => `INSURED: ${[p.broker, p.insurer].filter(Boolean).join(' / ')} policy ${p.policyNumber}${p.sumInsured !== null ? `, sum insured £${gbp(p.sumInsured)}` : ''}${p.claimsPhone ? ` - claims ${p.claimsPhone}` : ''}`),
    ...(units.length || policies.length ? [''] : []),
    'WHAT IS IN HERE',
    '  inventory.html     - open in a browser: every item with its photo, location, receipt and value. Print or save as PDF for the insurer.',
    '  inventory.csv      - the same list as a spreadsheet',
    '  purchases.csv      - the numbered purchase receipts this stock came from (proof of purchase)',
    '  storage-costs.csv  - payments for the storage unit, with receipts in storage-costs/',
    '  photos/            - one photo per item, named by stock code',
    '  signatures/        - sellers\' signatures on the purchase receipts',
    '  insurance/         - the policy documents saved in the app',
    '',
    warnings.length || missingPhotos ? 'GAPS TO FIX' : 'No gaps found in the records.',
    ...warnings.map((w) => `  - ${w}`),
    ...(missingPhotos ? [`  - ${missingPhotos} photo/signature file(s) couldn't be loaded (not on this device and not synced) - make the pack again once online`] : []),
    '',
    'KEEP A COPY OFF-SITE',
    '  Save this file somewhere other than the storage unit and this phone (email it to yourself or save it to Drive).',
    '  Make a fresh one whenever a lot of stock goes in or out, and straight after any incident - before anything is moved.',
    '',
    'IF SOMETHING HAPPENS (check your own policy wording - these are from the Surewise/SAGIC storage policy summary)',
    '  - Theft: report to the police within 24 hours and get a crime reference number. Theft is only covered with forced, violent entry - photograph the damage.',
    '  - Report the claim to the insurer within 30 days.',
    '  - Don\'t throw anything damaged away until the insurer has seen it.',
    '',
  ].join('\r\n');
}

/** Loads photos a few at a time - they may need fetching from Drive */
async function loadAll<T>(jobs: T[], run: (job: T) => Promise<void>, width = 6): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, jobs.length) }, async () => {
      while (next < jobs.length) await run(jobs[next++]);
    }),
  );
}

export async function claimPackZip(
  state: AppState,
  opts: ClaimPackOptions,
  loadPhoto: (id: string) => Promise<Blob | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ zip: Uint8Array; readiness: ClaimReadiness; missing: number }> {
  const generatedAt = opts.generatedAt ?? new Date();
  const items = claimItems(state, opts.area);
  const readiness = claimReadiness(state, opts.area);
  const pickups = pickupsFor(state, items);
  const costs = storageCosts(state);

  const files: ZipEntry[] = [];
  const photoFiles = new Map<string, string>();
  const signatureFiles = new Map<string, string>();
  const costFiles = new Map<string, string[]>();
  const documentFiles = new Map<string, string[]>();
  const { policies } = claimCover(state, opts.area, generatedAt.toISOString().slice(0, 10));
  let missing = 0;

  type Job = { photoId: string; name: string; record: (name: string) => void; evidence?: true };
  const jobs: Job[] = [
    ...items.filter((i) => i.photoId).map((i) => ({ photoId: i.photoId as string, name: itemPhotoFile(i), record: (name: string) => photoFiles.set(i.id, name) })),
    ...pickups.filter((p) => p.signaturePhotoId).map((p) => ({ photoId: p.signaturePhotoId as string, name: signatureFile(p), record: (name: string) => signatureFiles.set(p.id, name) })),
    ...costs.flatMap((e) =>
      e.attachmentIds.map((id, n) => ({
        photoId: id,
        name: storageFile(e, n),
        evidence: true as const,
        record: (name: string) => costFiles.set(e.id, [...(costFiles.get(e.id) ?? []), name]),
      })),
    ),
    ...policies.flatMap((p) =>
      p.documentIds.map((id, n) => ({
        photoId: id,
        name: `insurance/${slug(p.policyNumber || p.id.slice(0, 8))}-${n + 1}.jpg`,
        evidence: true as const,
        record: (name: string) => documentFiles.set(p.id, [...(documentFiles.get(p.id) ?? []), name]),
      })),
    ),
  ];
  let done = 0;
  await loadAll(jobs, async (job) => {
    const blob = await loadPhoto(job.photoId).catch(() => null);
    if (blob) {
      const name = job.evidence ? job.name.replace(/\.jpg$/, `.${await evidenceExtension(blob)}`) : job.name;
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      job.record(name);
    } else missing++;
    onProgress?.(++done, jobs.length);
  });
  files.sort((a, b) => a.name.localeCompare(b.name));

  const text = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'README.txt', data: text.encode(readme(state, readiness, opts.area, generatedAt, missing)) },
    { name: 'inventory.html', data: text.encode(inventoryHtml(state, items, readiness, { area: opts.area, generatedAt, photoFiles, signatureFiles, documentFiles })) },
    { name: 'inventory.csv', data: text.encode(inventoryCsv(state, items, photoFiles)) },
    { name: 'purchases.csv', data: text.encode(purchasesForClaimCsv(state, items, signatureFiles)) },
    { name: 'storage-costs.csv', data: text.encode(storageCostsCsv(costs, costFiles)) },
    ...files,
  ];
  return { zip: makeZip(entries, generatedAt), readiness, missing };
}
