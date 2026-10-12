import type { AppState, EditRecord, IncomeKind } from './types';
import { inPeriod, isSold } from './calc';
import { liveState, paymentLabel } from './audit';
import { EXPENSE_BOX_LABELS, tradingSummary, type TaxYear } from './tax';
import { makeZip, type ZipEntry } from './zip';

/**
 * The tax-year records bundle for an accountant or MTD bridging software:
 * every purchase, sale and cost in the year (voided ones included, marked),
 * a summary, and the sellers' signatures. Money appears twice - whole pence
 * for software, pounds for people.
 */

type Cell = string | number | boolean | null;

function cell(value: Cell): string {
  const text = value === null ? '' : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  // Excel needs the byte-order mark to read £ and accents correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function penceOf(pounds: number): number {
  return Math.round(pounds * 100);
}

function pounds(value: number): string {
  return value.toFixed(2);
}

function history(h: EditRecord[]): string {
  return h.length ? JSON.stringify(h) : '';
}

const INCOME_TYPE: Record<IncomeKind, string> = { rag: 'rag', charity: 'charity_bins', bulk: 'resale_kg', other: 'other' };

export function signatureFileName(p: { receiptNumber: number | null; id: string }): string {
  return `attachments/signature-${p.receiptNumber !== null ? String(p.receiptNumber).padStart(5, '0') : p.id}.png`;
}

export function purchasesCsv(books: AppState, year: TaxYear): string {
  const rows = books.pickups
    .filter((p) => inPeriod(p.date, year.period))
    .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt))
    .map((p) => [
      p.receiptNumber,
      p.date,
      p.reference,
      p.sellerAddress,
      p.sellerPostcode,
      p.handover === 'dropoff' ? 'drop-off' : 'pickup',
      p.sellerContact,
      p.miles,
      p.weightKg,
      penceOf(p.ratePerKg),
      pounds(p.ratePerKg),
      penceOf(p.amountPaid),
      pounds(p.amountPaid),
      p.costOverride !== null,
      paymentLabel(p.paymentMethod),
      p.bankRef,
      p.signaturePhotoId ? 'on screen' : p.paperSlipSigned ? 'paper slip' : 'no',
      p.signaturePhotoId ? signatureFileName(p) : '',
      p.notes,
      p.createdAt,
      p.updatedAt,
      p.voidedAt,
      p.voidReason,
      history(p.history),
      p.id,
    ]);
  return toCsv(
    ['receipt_number', 'date_paid', 'seller', 'seller_address', 'seller_postcode', 'collected_or_dropped_off', 'seller_contact', 'miles', 'weight_kg', 'rate_per_kg_pence', 'rate_per_kg_gbp', 'amount_pence', 'amount_gbp', 'amount_entered_by_hand', 'payment_method', 'bank_ref', 'seller_signed', 'signature_file', 'notes', 'entered_at', 'last_changed_at', 'voided_at', 'void_reason', 'edit_history', 'id'],
    rows,
  );
}

export function salesCsv(books: AppState, year: TaxYear): string {
  const receipts = new Map(books.pickups.map((p) => [p.id, p.receiptNumber]));
  const rows: Cell[][] = [];
  for (const i of books.items) {
    if (!isSold(i) || !inPeriod(i.soldDate, year.period)) continue;
    const price = i.soldPrice ?? 0;
    rows.push([i.soldDate, 'item', i.salesChannel, [i.name, i.category, i.subcategory].filter(Boolean).join(' · '), '', 1, penceOf(price), pounds(price), penceOf(i.saleCosts), pounds(i.saleCosts), '', i.pickupId ? receipts.get(i.pickupId) ?? '' : '', i.createdAt, null, '', history(i.history), i.id]);
  }
  for (const o of books.otherIncome) {
    if (!inPeriod(o.date, year.period)) continue;
    rows.push([o.date, INCOME_TYPE[o.kind], o.buyer, o.description, o.weightKg, '', penceOf(o.amount), pounds(o.amount), 0, '0.00', paymentLabel(o.paymentMethod), o.pickupId ? receipts.get(o.pickupId) ?? '' : '', o.createdAt, o.voidedAt, o.voidReason, history(o.history), o.id]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(
    ['date_received', 'sale_type', 'buyer_or_channel', 'description', 'weight_kg', 'quantity_items', 'amount_pence', 'amount_gbp', 'fees_pence', 'fees_gbp', 'payment_method', 'from_purchase_receipt', 'entered_at', 'voided_at', 'void_reason', 'edit_history', 'id'],
    rows,
  );
}

export function expensesCsv(books: AppState, year: TaxYear): string {
  const receipts = new Map(books.pickups.map((p) => [p.id, p.receiptNumber]));
  const rows = books.expenses
    .filter((e) => inPeriod(e.date, year.period))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const box = books.settings.expenseTaxBoxes[e.category] ?? 'other';
      const files = e.attachmentIds.map((_, n) => attachmentFileName(e, n)).join(' ');
      return [e.date, e.category, box, EXPENSE_BOX_LABELS[box], e.description, penceOf(e.amount), pounds(e.amount), paymentLabel(e.paymentMethod), e.recurringId !== null, e.pickupId ? receipts.get(e.pickupId) ?? '' : '', files, e.createdAt, e.voidedAt, e.voidReason, history(e.history), e.id];
    });
  return toCsv(
    ['date_paid', 'category', 'sa103_box', 'sa103_heading', 'description', 'amount_pence', 'amount_gbp', 'payment_method', 'repeating', 'for_purchase_receipt', 'attachment_files', 'entered_at', 'voided_at', 'void_reason', 'edit_history', 'id'],
    rows,
  );
}

export function attachmentFileName(e: { date: string; id: string }, n: number): string {
  return `attachments/expense-${e.date}-${e.id.slice(0, 8)}-${n + 1}.jpg`;
}

export function summaryCsv(books: AppState, year: TaxYear): string {
  const live = liveState(books);
  const t = tradingSummary(live, year);
  const income = (kind: IncomeKind) => live.otherIncome.filter((o) => o.kind === kind && inPeriod(o.date, year.period)).reduce((s, o) => s + o.amount, 0);
  const line = (label: string, amount: number): Cell[] => [label, penceOf(amount), pounds(amount)];
  const rows: Cell[][] = [
    ['tax_year', '', year.label],
    ['period', '', `${year.period.from} to ${year.period.to}`],
    ['accounting_basis', '', books.settings.accountingBasis === 'cash' ? 'cash basis (money in and out when paid; no stock valuation)' : 'accruals'],
    line('income_item_sales', t.salesIncome),
    line('income_rag', income('rag')),
    line('income_charity_bins', income('charity')),
    line('income_resale_by_kg', income('bulk')),
    line('income_other', income('other')),
    line('turnover', t.turnover),
    ...t.expenses.map((e) => line(`expense_${e.box}: ${e.label}`, e.amount)),
    line('total_allowable_expenses', t.totalExpenses),
    line('net_profit', t.profitActual),
    ['purchases_count', '', t.pickups],
    ['items_sold_count', '', t.itemsSold],
    ['voided_records_count', '', [...books.pickups, ...books.expenses, ...books.otherIncome].filter((r) => r.voidedAt !== null).length],
    ['generated_at', '', new Date().toISOString()],
  ];
  return toCsv(['line', 'amount_pence', 'value'], rows);
}

/** Builds the ZIP; `loadPhoto` fetches a signature image (null if not on this device or in the cloud) */
export async function recordsZip(books: AppState, year: TaxYear, loadPhoto: (id: string) => Promise<Blob | null>): Promise<{ zip: Uint8Array; missing: number }> {
  const text = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'purchases.csv', data: text.encode(purchasesCsv(books, year)) },
    { name: 'sales.csv', data: text.encode(salesCsv(books, year)) },
    { name: 'expenses.csv', data: text.encode(expensesCsv(books, year)) },
    { name: 'summary.csv', data: text.encode(summaryCsv(books, year)) },
  ];
  let missing = 0;
  for (const p of books.pickups) {
    if (!p.signaturePhotoId || !inPeriod(p.date, year.period)) continue;
    const blob = await loadPhoto(p.signaturePhotoId).catch(() => null);
    if (blob) entries.push({ name: signatureFileName(p), data: new Uint8Array(await blob.arrayBuffer()) });
    else missing++;
  }
  for (const e of books.expenses) {
    if (!inPeriod(e.date, year.period)) continue;
    for (const [n, id] of e.attachmentIds.entries()) {
      const blob = await loadPhoto(id).catch(() => null);
      if (blob) entries.push({ name: attachmentFileName(e, n), data: new Uint8Array(await blob.arrayBuffer()) });
      else missing++;
    }
  }
  return { zip: makeZip(entries), missing };
}
