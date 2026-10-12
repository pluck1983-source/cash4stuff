import { useRef, useState } from 'react';
import { money, parseNumber } from '../lib/format';
import { compressImage } from '../lib/photos';
import { blankLine, businessTotal, parseReceiptText, type ReceiptLine } from '../lib/receiptLines';
import { Button, Input, Select } from './ui';

/**
 * A receipt broken into its lines: each ticked line is saved as its own cost
 * with its own type, and unticked ones (personal shopping) are left out. Lines
 * can be typed, or read off a photo of the receipt.
 */
export function SplitReceipt({
  lines,
  onChange,
  categories,
  defaultCategory,
  onPhoto,
}: {
  lines: ReceiptLine[];
  onChange: (lines: ReceiptLine[]) => void;
  categories: string[];
  defaultCategory: string;
  /** The receipt photo, so it's kept with the costs */
  onPhoto: (photo: Blob) => Promise<void>;
}) {
  const [reading, setReading] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: string, patch: Partial<ReceiptLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const all = Math.round(lines.reduce((t, l) => t + (parseNumber(l.amount) ?? 0), 0) * 100) / 100;
  const business = businessTotal(lines);

  async function read(file: File) {
    setNote(null);
    setReading(0);
    try {
      const photo = await compressImage(file);
      await onPhoto(photo);
      const { readText } = await import('../lib/ocr');
      // Read the full-size original - small print needs every pixel.
      const parsed = parseReceiptText(await readText(file, setReading));
      setReceiptTotal(parsed.total);
      if (parsed.lines.length === 0) {
        setNote("Couldn't pick out any lines - type them in below. A flat, well-lit photo reads best.");
        return;
      }
      const read = parsed.lines.map((l) => ({ ...blankLine(defaultCategory), description: l.description, amount: l.amount.toFixed(2) }));
      // Keep anything already typed; drop the empty starter line.
      onChange([...lines.filter((l) => l.description || l.amount), ...read]);
      setNote(`Read ${read.length} line${read.length === 1 ? '' : 's'}. Check them against the receipt, and untick anything that isn't for the business.`);
    } catch (e) {
      setNote(`Couldn't read the receipt: ${e instanceof Error ? e.message : 'unknown error'}. The reader needs a connection the first time.`);
    } finally {
      setReading(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Receipt lines</span>
        <Button className="text-sm" disabled={reading !== null} onClick={() => fileRef.current?.click()}>
          {reading !== null ? `Reading… ${Math.round(reading * 100)}%` : '📷 Read from photo'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void read(file);
          }}
        />
      </div>
      {note && <p className="text-xs text-slate-600 dark:text-slate-300">{note}</p>}
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={l.key} className={`space-y-1.5 rounded-lg p-2 ${l.include ? 'bg-slate-50 dark:bg-slate-800/60' : 'opacity-50'}`}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0"
                checked={l.include}
                onChange={(e) => set(l.key, { include: e.target.checked })}
                aria-label={`Line ${i + 1} is a business cost`}
              />
              <Input value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} placeholder="What it was" aria-label={`Line ${i + 1} description`} className="flex-1" />
              <button type="button" className="shrink-0 px-1 text-slate-400 hover:text-red-600" aria-label={`Remove line ${i + 1}`} onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>
                ✕
              </button>
            </div>
            <div className="flex gap-2 pl-7">
              {l.include ? (
                <Select value={l.category} onChange={(e) => set(l.key, { category: e.target.value })} aria-label={`Line ${i + 1} type`} className="flex-1 py-1.5">
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              ) : (
                <span className="flex-1 self-center text-xs text-slate-500">Not for the business - left out</span>
              )}
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={l.amount}
                onChange={(e) => set(l.key, { amount: e.target.value })}
                placeholder="£"
                aria-label={`Line ${i + 1} amount`}
                className="w-24 py-1.5 text-right tabular-nums"
              />
            </div>
          </li>
        ))}
      </ul>
      <Button className="w-full" onClick={() => onChange([...lines, blankLine(lines[lines.length - 1]?.category ?? defaultCategory)])}>
        + Add line
      </Button>
      <p className="text-sm text-slate-700 dark:text-slate-200">
        Business total <strong className="tabular-nums">{money(business)}</strong>
        {business !== all && <span className="text-slate-500"> of {money(all)} on the lines</span>}
        {receiptTotal !== null && Math.abs(receiptTotal - all) > 0.005 && (
          <span className="block text-xs text-amber-700 dark:text-amber-400">The receipt says {money(receiptTotal)} - a line may be missing or misread.</span>
        )}
      </p>
    </div>
  );
}
