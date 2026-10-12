import { parseNumber } from './format';
import { newId } from './storage';

/** One line of a receipt, as read from a photo or typed in */
export interface ReceiptLine {
  key: string;
  /** Ticked = a business cost; unticked lines (personal shopping) aren't recorded */
  include: boolean;
  description: string;
  amount: string;
  category: string;
}

export interface ParsedReceipt {
  lines: { description: string; amount: number }[];
  /** The receipt's own total, when one could be read - to check the lines against */
  total: number | null;
}

// Payment, change and tax lines aren't things that were bought.
const NOT_AN_ITEM = /\b(sub ?-?total|total|balance|change|cash|card|visa|mastercard|maestro|amex|contactless|chip|pin|vat|tax|due|tendered|paid|auth|refund)\b/i;
const TOTAL = /\b(total|balance due|amount due|to pay)\b/i;
const SUBTOTAL = /\bsub ?-?total\b/i;
// Description, then a price at the end: "MAILING BAGS x100  4.99", "Tape £2.50 A", "Discount -0.50"
const PRICED = /^(.*?)[\s.:]*(-)?\s*£?\s*(-)?(\d{1,5})[.,](\d{2})\s*(?:[A-Z]|\*|£)?\s*$/;

/** Picks the item lines (and the total) out of OCR text from a till receipt */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines: ParsedReceipt['lines'] = [];
  let total: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const m = PRICED.exec(line);
    if (!m) continue;
    const description = m[1].replace(/[£\s.:-]+$/, '').trim();
    const amount = Number(`${m[2] || m[3] ? '-' : ''}${m[4]}.${m[5]}`);
    if (TOTAL.test(description) && !SUBTOTAL.test(description)) {
      total ??= amount;
      continue;
    }
    if (NOT_AN_ITEM.test(description)) continue;
    // A line needs words to be an item - bare numbers are quantities, dates or codes.
    if (!/[a-z]{2}/i.test(description)) continue;
    lines.push({ description: tidy(description), amount });
  }
  return { lines, total };
}

/** Till receipts shout; "MAILING BAGS" reads better as "Mailing bags" */
function tidy(s: string): string {
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

export function blankLine(category: string): ReceiptLine {
  return { key: newId(), include: true, description: '', amount: '', category };
}

/** Sum of the ticked lines - what goes in the books */
export function businessTotal(lines: ReceiptLine[]): number {
  return Math.round(lines.reduce((t, l) => t + (l.include ? (parseNumber(l.amount) ?? 0) : 0), 0) * 100) / 100;
}
