import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Pickup, Settings } from '../lib/types';
import { paymentLabel } from '../lib/audit';
import { roundWeight } from '../lib/calc';
import { kg, money, shortDate } from '../lib/format';
import { savePhoto } from '../lib/photos';
import { newId } from '../lib/storage';
import { Photo } from './Photo';
import { SignaturePad } from './Records';
import { Button } from './ui';

/** The seller's copy of a purchase, with a line for them to sign on screen. Printable. */
export function PurchaseReceipt({ pickup, settings, onSign, onClose }: { pickup: Pickup; settings: Settings; onSign: (signaturePhotoId: string) => void; onClose: () => void }) {
  const [signature, setSignature] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.classList.add('print-receipt');
    return () => document.body.classList.remove('print-receipt');
  }, []);

  const rounded = roundWeight(pickup.weightKg, settings.weightStepKg, settings.weightRounding);
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 border-b border-slate-200 py-1.5">
      <span className="text-slate-600">{label}</span>
      <span className="whitespace-pre-line text-right font-medium tabular-nums">{value}</span>
    </div>
  );

  return createPortal(
    <div role="dialog" aria-label="Purchase receipt" className="receipt fixed inset-0 z-50 overflow-y-auto bg-white p-4 text-slate-900">
      <div className="mx-auto max-w-sm">
        <div className="mb-4 text-center">
          <div className="text-lg font-semibold">{settings.businessName || 'Purchase receipt'}</div>
          {settings.traderName && <div className="text-sm">{settings.traderName}</div>}
          {settings.businessAddress && <div className="whitespace-pre-line text-xs text-slate-600">{settings.businessAddress}</div>}
        </div>
        <div className="mb-3 flex justify-between text-sm">
          <span>Receipt no. {pickup.receiptNumber ?? '-'}</span>
          <span>{shortDate(pickup.date)}</span>
        </div>
        <div className="text-sm">
          {row('Bought from', pickup.reference)}
          {pickup.sellerAddress && row('Address', pickup.sellerAddress)}
          {pickup.sellerPostcode && row('Postcode', pickup.sellerPostcode)}
          {row('Collection', pickup.handover === 'dropoff' ? 'Dropped off by seller' : 'Picked up from seller')}
          {row('Goods', 'Used clothing and textiles')}
          {row('Weight', rounded !== pickup.weightKg ? `${kg(pickup.weightKg)} (charged ${kg(rounded)})` : kg(pickup.weightKg))}
          {row('Rate', `${money(pickup.ratePerKg)} per kg`)}
          {row('Paid by', paymentLabel(pickup.paymentMethod) || '-')}
          <div className="flex justify-between gap-4 py-2 text-base font-semibold">
            <span>Total paid</span>
            <span className="tabular-nums">{money(pickup.amountPaid)}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-600">I confirm I have sold these goods, they were mine to sell, and I have received the amount above.</p>
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Seller's signature</div>
          {pickup.signaturePhotoId ? (
            <Photo id={pickup.signaturePhotoId} alt="Seller signature" contain className="h-28 rounded border border-slate-300 bg-white" />
          ) : (
            <>
              <SignaturePad onChange={setSignature} />
              {signature && (
                <Button
                  variant="primary"
                  className="mt-2 w-full print:hidden"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    const id = newId();
                    await savePhoto(id, signature, false);
                    onSign(id);
                    setSaving(false);
                  }}
                >
                  Save signature
                </Button>
              )}
            </>
          )}
        </div>
        <div className="mt-6 flex gap-2 print:hidden">
          <Button className="flex-1" onClick={() => window.print()}>
            Print / save PDF
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
