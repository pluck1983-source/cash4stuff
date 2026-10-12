import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { navigate, routeHref } from '../lib/router';
import { newId } from '../lib/storage';
import { compressImage, savePhoto } from '../lib/photos';
import { latestOpenPickupId, pickupChoices } from '../lib/sellers';
import { parseNumber, shortDate } from '../lib/format';
import { pence } from '../lib/calc';
import { showToast } from '../lib/toast';
import { Button, Chips, Empty, Field, Input, PageHeader, Select } from '../components/ui';
import { QuantityStepper } from '../components/ItemEditor';
import { LAST_KEY, readLast, type LastDefaults } from '../lib/itemDefaults';

/** One photo waiting to become an item */
interface Row {
  key: string;
  photo: Blob;
  previewUrl: string;
  name: string;
  pickupId: string | null;
  category: string;
  quantity: number;
  /** Asking price each, as typed ('' = not priced yet) */
  price: string;
}

/**
 * Pick a pile of photos at once - each becomes an item. Set the pickup (for
 * all of them or one by one), give them names if wanted, and save. Prices,
 * sizes and the rest can be filled in on each item afterwards.
 */
export function BulkAddView({ state, actions, pickupId }: { state: AppState; actions: AppActions; pickupId: string | null }) {
  const [last] = useState(readLast);
  const [defaultPickup] = useState(() => pickupId ?? latestOpenPickupId(state.pickups));
  const [rows, setRows] = useState<Row[]>([]);
  const [area, setArea] = useState(last?.location.area ?? state.settings.storageAreas[0] ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Previews are freed when the page closes.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => () => rowsRef.current.forEach((r) => URL.revokeObjectURL(r.previewUrl)), []);

  const categories = state.settings.categories;
  const defaultCategory = last?.category && categories.includes(last.category) ? last.category : (categories[0] ?? 'Other');

  async function addPhotos(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: files.length });
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const photo = await compressImage(file);
        const row: Row = { key: newId(), photo, previewUrl: URL.createObjectURL(photo), name: '', pickupId: defaultPickup, category: defaultCategory, quantity: 1, price: '' };
        setRows((rs) => [...rs, row]);
      } catch {
        failed.push(file.name);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    if (failed.length) setError(`Couldn't use ${failed.length} photo${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`);
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remove(key: string) {
    setRows((rs) => {
      const row = rs.find((r) => r.key === key);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return rs.filter((r) => r.key !== key);
    });
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    const location = { area, rack: last?.location.rack ?? '', box: last?.location.box ?? '' };
    let saved = 0;
    try {
      for (const row of rows) {
        const photoId = newId();
        await savePhoto(photoId, row.photo, false);
        actions.addItem({
          pickupId: row.pickupId,
          name: row.name.trim(),
          keywords: '',
          category: row.category,
          subcategory: '',
          gender: last?.gender ?? '',
          photoId,
          location,
          quantity: row.quantity,
          listPrice: (() => {
            const price = parseNumber(row.price);
            return price === null ? null : pence(price);
          })(),
          status: 'in_stock',
          listedDate: null,
          soldPrice: null,
          soldDate: null,
          salesChannel: '',
          saleCosts: 0,
          notes: '',
        });
        saved += row.quantity;
        remove(row.key);
      }
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ ...last, category: rows[rows.length - 1]?.category ?? defaultCategory, location } satisfies LastDefaults));
      } catch {
        // Remembering is a convenience only.
      }
      showToast(`✓ Added ${saved} item${saved === 1 ? '' : 's'}`);
      const pickups = new Set(rows.map((r) => r.pickupId));
      const only = pickups.size === 1 ? [...pickups][0] : null;
      navigate(only ? { name: 'pickup', id: only } : { name: 'stock' });
    } catch (e) {
      // The ones already saved have left the list, so trying again won't double them up.
      setError(`Saved ${saved}, then stopped: ${e instanceof Error ? e.message : 'could not save'}. Tap Save to try the rest again.`);
      setSaving(false);
    }
  }

  const choices = pickupChoices(state.pickups, defaultPickup);
  const pickupOptions = (current: string | null) => {
    const list = current && !choices.some((c) => c.pickupId === current) ? pickupChoices(state.pickups, current) : choices;
    return [
      <option key="" value="">
        No pickup
      </option>,
      ...list.map((c) => (
        <option key={c.pickupId} value={c.pickupId}>
          {c.pickup.reference} · {shortDate(c.pickup.date)}
        </option>
      )),
    ];
  };
  const pieces = rows.reduce((t, r) => t + r.quantity, 0);
  const allSame = rows.length > 0 && rows.every((r) => r.pickupId === rows[0].pickupId) ? (rows[0].pickupId ?? '') : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add from photos" back={routeHref({ name: 'add-item', pickupId })} />
      <p className="-mt-2 mb-4 text-sm text-slate-500">Choose several photos - each one becomes an item. Set how many and the list price here if you know them; everything else can be added on each item later.</p>

      <Button variant={rows.length ? 'secondary' : 'primary'} className="mb-4 w-full py-3 text-base" disabled={progress !== null || saving} onClick={() => libraryRef.current?.click()}>
        {progress ? `Processing ${progress.done} of ${progress.total}…` : rows.length ? '+ Choose more photos' : '📷 Choose photos'}
      </Button>
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void addPhotos([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        !progress && <Empty>No photos chosen yet.</Empty>
      ) : (
        <>
          <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <Field label={`Pickup for all ${rows.length}`}>
              <Select
                value={allSame ?? 'mixed'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== 'mixed') setRows((rs) => rs.map((r) => ({ ...r, pickupId: v || null })));
                }}
              >
                {allSame === null && <option value="mixed">Different pickups</option>}
                {pickupOptions(allSame || null)}
              </Select>
            </Field>
            {state.settings.storageAreas.length > 0 && (
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Stored at</span>
                <Chips options={state.settings.storageAreas} value={area} onChange={setArea} />
              </div>
            )}
          </div>

          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={r.key} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                <img src={r.previewUrl} alt={`Photo ${i + 1}`} className="h-24 w-24 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="Name (optional)" aria-label={`Name for item ${i + 1}`} />
                  <Select value={r.pickupId ?? ''} onChange={(e) => update(r.key, { pickupId: e.target.value || null })} aria-label={`Pickup for item ${i + 1}`}>
                    {pickupOptions(r.pickupId)}
                  </Select>
                  <Select value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} aria-label={`Category for item ${i + 1}`}>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Qty</span>
                    <div className="flex-1">
                      <QuantityStepper value={r.quantity} onChange={(quantity) => update(r.key, { quantity })} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{r.quantity > 1 ? '£ each' : 'Price £'}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={r.price}
                      onChange={(e) => update(r.key, { price: e.target.value })}
                      placeholder="Optional"
                      aria-label={`List price for item ${i + 1}`}
                      className="flex-1"
                    />
                  </div>
                </div>
                <button type="button" className="self-start px-1 text-slate-400 hover:text-red-600" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(r.key)} disabled={saving}>
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-[var(--tabs-h)] z-10 -mx-4 mt-6 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 dark:border-slate-800 dark:bg-slate-950/95">
            <Button variant="primary" className="w-full py-3 text-base" disabled={saving || progress !== null} onClick={() => void saveAll()}>
              {saving ? 'Saving…' : `Save ${pieces} item${pieces === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
