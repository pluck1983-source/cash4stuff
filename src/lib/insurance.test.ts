import { describe, expect, it } from 'vitest';
import type { AppState, Expense, Item } from './types';
import { emptyState } from './storage';
import { testPickup } from './fixtures';
import { auditDefaults } from './audit';
import { claimItems, claimPackZip, claimReadiness, inventoryCsv, inventoryHtml, readinessWarnings } from './insurance';

const at = '2026-03-10T10:00:00.000Z';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    sku: 'TOP-0001',
    pickupId: 'p1',
    name: 'Blue jumper',
    keywords: 'Next, M',
    category: 'Tops',
    subcategory: '',
    gender: 'womens',
    photoId: 'ph1',
    photoHash: null,
    location: { area: 'Unit 4', rack: 'A', box: '1' },
    quantity: 1,
    listPrice: 12,
    priceHistory: [],
    status: 'listed',
    listedDate: null,
    soldPrice: null,
    soldDate: null,
    salesChannel: '',
    saleCosts: 0,
    history: [],
    notes: '',
    createdAt: at,
    updatedAt: at,
    ...over,
  };
}

function books(): AppState {
  const s = emptyState();
  s.pickups = [testPickup({ id: 'p1', receiptNumber: 42, amountPaid: 10, signaturePhotoId: 'sig1', reference: 'Jo <Smith>' })];
  s.items = [
    item(),
    item({ id: 'i2', sku: 'TOP-0002', photoId: null }),
    item({ id: 'i3', sku: 'TOP-0003', status: 'sold', soldPrice: 5, soldDate: '2026-03-12' }),
    item({ id: 'i4', sku: 'BAG-0001', pickupId: null, location: { area: 'Garage', rack: '', box: '' }, listPrice: null }),
  ];
  const rent: Expense = { ...auditDefaults(at), id: 'e1', date: '2026-03-01', category: 'Storage', description: 'Unit 4 rent', amount: 80, pickupId: null, recurringId: null, paymentMethod: 'card', attachmentIds: ['r1'], attachmentHashes: {}, updatedAt: at };
  s.expenses = [rent];
  return s;
}

describe('insurance claim pack', () => {
  it('covers only unsold stock, in the chosen area', () => {
    expect(claimItems(books(), '').map((i) => i.id).sort()).toEqual(['i1', 'i2', 'i4']);
    expect(claimItems(books(), 'Unit 4').map((i) => i.id).sort()).toEqual(['i1', 'i2']);
  });

  it('values stock at its share of the purchase and flags the gaps', () => {
    const r = claimReadiness(books(), 'Unit 4');
    // £10 lot shared over the three pieces logged from it (one since sold)
    expect(r.costValue).toBeCloseTo(20 / 3);
    expect(r.listValue).toBe(24);
    expect(r.noPhoto).toBe(1);
    expect(r.noPurchase).toBe(0);
    const all = claimReadiness(books(), '');
    expect(all.noPurchase).toBe(1);
    expect(all.unvalued).toBe(1);
    expect(readinessWarnings(all).join(' ')).toMatch(/not linked to a purchase/);
  });

  it('marks stock with no proof of purchase in the spreadsheet', () => {
    const s = books();
    const csv = inventoryCsv(s, claimItems(s, ''), new Map());
    expect(csv).toContain('NO PURCHASE RECORD');
    expect(csv).toContain('00042');
  });

  it('escapes text in the printable inventory', () => {
    const s = books();
    const items = claimItems(s, 'Unit 4');
    const html = inventoryHtml(s, items, claimReadiness(s, 'Unit 4'), { area: 'Unit 4', generatedAt: new Date(at), photoFiles: new Map(), signatureFiles: new Map() });
    expect(html).toContain('Jo &lt;Smith&gt;');
    expect(html).not.toContain('Jo <Smith>');
  });

  it('bundles photos, signatures and storage receipts, counting the ones it could not load', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const { zip, missing } = await claimPackZip(books(), { area: '', generatedAt: new Date(at) }, async (id) => (id === 'ph1' || id === 'sig1' ? blob : null));
    const names = new TextDecoder().decode(zip);
    for (const f of ['README.txt', 'inventory.html', 'inventory.csv', 'purchases.csv', 'storage-costs.csv', 'signatures/receipt-00042.png', 'photos/TOP-0001-i1.jpg']) expect(names).toContain(f);
    expect(missing).toBe(1); // the storage rent receipt
  });
});
