import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './receiptLines';

describe('parseReceiptText', () => {
  it('reads item lines and the total, and skips payment lines', () => {
    const text = [
      'POUNDLAND',
      'Store 1234  12/10/26 10:04',
      'MAILING BAGS X100     4.99',
      'Parcel tape   £2.50 A',
      'Chocolate bar        1.00',
      'Multibuy saving     -0.50',
      '2 @ 1.00',
      'SUBTOTAL             7.99',
      'TOTAL               £7.99',
      'CARD                 7.99',
      'CHANGE               0.00',
      'VAT 20%              1.33',
    ].join('\n');
    const r = parseReceiptText(text);
    expect(r.total).toBe(7.99);
    expect(r.lines).toEqual([
      { description: 'Mailing bags x100', amount: 4.99 },
      { description: 'Parcel tape', amount: 2.5 },
      { description: 'Chocolate bar', amount: 1 },
      { description: 'Multibuy saving', amount: -0.5 },
    ]);
  });

  it('copes with commas for pence and no total', () => {
    expect(parseReceiptText('Fuel unleaded 45,20\nrandom words')).toEqual({ lines: [{ description: 'Fuel unleaded', amount: 45.2 }], total: null });
  });
});
