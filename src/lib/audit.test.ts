import { describe, expect, it } from 'vitest';
import { liveState, nextReceiptNumber, withHistory } from './audit';
import { emptyState, normaliseState } from './storage';
import { testPickup } from './fixtures';
import { crc32, makeZip } from './zip';
import { expensesCsv, purchasesCsv, summaryCsv } from './records';
import { taxYear } from './tax';

describe('withHistory', () => {
  const before = testPickup({ createdAt: '2026-05-01T10:00:00.000Z', weightKg: 10, amountPaid: 10 });

  it('ignores same-day corrections', () => {
    const after = { ...before, weightKg: 12 };
    expect(withHistory(before, after, '2026-05-01T15:00:00.000Z', ['weightKg']).history).toEqual([]);
  });

  it('logs changes made on a later day, old and new values', () => {
    const after = { ...before, weightKg: 12, amountPaid: 12 };
    const logged = withHistory(before, after, '2026-05-03T09:00:00.000Z', ['weightKg', 'amountPaid', 'notes']);
    expect(logged.history).toEqual([{ at: '2026-05-03T09:00:00.000Z', changes: { weightKg: ['10', '12'], amountPaid: ['10', '12'] } }]);
  });
});

describe('voiding and receipt numbers', () => {
  it('leaves voided records out of the live state but keeps them in the books', () => {
    const books = { ...emptyState(), pickups: [testPickup({ id: 'a' }), testPickup({ id: 'b', voidedAt: '2026-05-01T00:00:00.000Z', voidReason: 'duplicate' })] };
    expect(liveState(books).pickups.map((p) => p.id)).toEqual(['a']);
    expect(books.pickups).toHaveLength(2);
  });

  it('numbers receipts after the highest so far, voided ones included', () => {
    const books = { ...emptyState(), pickups: [testPickup({ receiptNumber: 4 }), testPickup({ receiptNumber: 7, voidedAt: '2026-05-01T00:00:00.000Z' })] };
    expect(nextReceiptNumber(books)).toBe(8);
  });
});

describe('older data', () => {
  it('fixes the cost of older pickups so a later rate change cannot alter it', () => {
    const old = normaliseState({ settings: { costPerKg: 1 }, pickups: [{ id: 'p', date: '2026-04-10', reference: 'Sam', weightKg: 12.3, costOverride: null }] });
    expect(old.pickups[0].amountPaid).toBe(12.5);
    const later = normaliseState({ ...old, settings: { ...old.settings, costPerKg: 2 } });
    expect(later.pickups[0].amountPaid).toBe(12.5);
    expect(later.pickups[0].ratePerKg).toBe(1);
  });
});

describe('records export', () => {
  const year = taxYear(2026);
  const books = {
    ...emptyState(),
    pickups: [
      testPickup({ id: 'p1', date: '2026-05-01', receiptNumber: 1, weightKg: 10, amountPaid: 10.1, signaturePhotoId: 'sig' }),
      testPickup({ id: 'p2', date: '2026-05-02', receiptNumber: 2, amountPaid: 99, voidedAt: '2026-05-03T00:00:00.000Z', voidReason: 'entered twice' }),
    ],
  };

  it('lists every purchase in the year with whole pence, voided ones marked', () => {
    const csv = purchasesCsv(books, year);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(',1010,10.10,');
    expect(lines[1]).toContain('attachments/signature-00001.png');
    expect(lines[2]).toContain('entered twice');
  });

  it('leaves voided purchases out of the summary', () => {
    const csv = summaryCsv(books, year);
    expect(csv).toContain('expense_goods: Cost of goods bought for resale or goods used,1010,10.10');
    expect(csv).toContain('voided_records_count,,1');
  });

  it('writes a header even with no costs', () => {
    expect(expensesCsv(books, year).trim().split('\r\n')).toHaveLength(1);
  });
});

describe('zip', () => {
  it('uses the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('starts with a local file header and ends with the directory record', () => {
    const zip = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 12, true)).toBe(1);
  });
});
