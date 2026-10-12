import type { Pickup } from './types';

/** A complete pickup for tests - pass only the fields that matter */
export function testPickup(over: Partial<Pickup> = {}): Pickup {
  const at = '2026-01-01T00:00:00.000Z';
  return {
    id: 'p1',
    date: '2026-03-10',
    reference: 'Seller',
    sellerAddress: '',
    sellerPostcode: '',
    handover: 'pickup',
    weightKg: 1,
    costOverride: null,
    ratePerKg: 1,
    amountPaid: 1,
    paymentMethod: 'cash',
    bankRef: '',
    sellerContact: '',
    miles: null,
    receiptNumber: null,
    signaturePhotoId: null,
    paperSlipSigned: false,
    notes: '',
    resolvedAt: null,
    createdAt: at,
    updatedAt: at,
    voidedAt: null,
    voidReason: '',
    history: [],
    ...over,
  };
}
