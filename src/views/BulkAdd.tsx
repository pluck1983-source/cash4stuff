import { useEffect, useRef, useState } from 'react';
import type { AppState, ItemGender } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { navigate, routeHref } from '../lib/router';
import { newId } from '../lib/storage';
import { compressImage, loadPhotoBlob, photoFingerprint, savePhoto } from '../lib/photos';
import { latestOpenPickupId } from '../lib/sellers';
import { describeItem, duplicateWarning, itemWithPhoto } from '../lib/duplicates';
import { parseNumber } from '../lib/format';
import { GENDER_LABELS, GENDER_OPTIONS, isHeld, pence } from '../lib/calc';
import { showToast } from '../lib/toast';
import { Button, Chips, Empty, Field, Input, PageHeader, Select } from '../components/ui';
import { CustomerOptions, QuantityStepper } from '../components/ItemEditor';
import { LAST_KEY, readLast, type LastDefaults } from '../lib/itemDefaults';
import { ZoomableImg } from '../components/Lightbox';
import { unlockAiKey } from '../lib/aiKey';
import type { Candidate } from '../lib/autoCategorise';

/** One photo waiting to become an item */
interface Row {
  key: string;
  photo: Blob;
  /** Fingerprint of the file as picked, null if the device couldn't make one */
  hash: string | null;
  previewUrl: string;
  name: string;
  pickupId: string | null;
  /** Women's, Men's etc - '' when not set */
  gender: ItemGender;
  category: string;
  subcategory: string;
  quantity: number;
  /** Asking price each, as typed ('' = not priced yet) */
  price: string;
  /** Photo AI progress for this photo */
  ai: 'none' | 'busy' | 'done' | 'failed';
  /** The AI was unsure - saved with a "Needs check" flag unless someone picks the category */
  needsCheck: boolean;
  /** Category came from the photo AI */
  suggested: boolean;
  /** Compared with stock by the photo AI */
  dupChecked: boolean;
  /** What the photo AI thinks this is a second photo of */
  aiDuplicate: string | null;
}

/** Newest held items of the same category to compare each photo with */
const MAX_STOCK_COMPARED = 60;

/**
 * Pick a pile of photos at once - each becomes an item. Set the customer (for
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
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Previews are freed when the page closes.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => () => rowsRef.current.forEach((r) => URL.revokeObjectURL(r.previewUrl)), []);

  const categories = state.settings.categories;
  // A pile of photos is rarely all one thing, so new photos start with no
  // category (flagged to check) rather than copying the last item's - unless a
  // category has been picked for the whole batch.
  const allSameCategory = rows.length > 0 && rows.every((r) => r.category === rows[0].category) ? rows[0].category : null;
  const defaultCategory = allSameCategory ?? '';
  // New photos follow whatever was last picked for the batch, then the last item added.
  const defaultGender = rows.length > 0 ? rows[rows.length - 1].gender : (last?.gender ?? '');

  async function addPhotos(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: files.length });
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const hash = await photoFingerprint(file).catch(() => null);
        const photo = await compressImage(file);
        const row: Row = { key: newId(), photo, hash, previewUrl: URL.createObjectURL(photo), name: '', pickupId: defaultPickup, gender: defaultGender, category: defaultCategory, subcategory: '', quantity: 1, price: '', ai: 'none', needsCheck: false, suggested: false, dupChecked: false, aiDuplicate: null };
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

  /** Asks the photo AI about each photo that has no category yet, a few at a time */
  /**
   * Photo AI: suggests what each uncategorised photo is, then looks for the same
   * item already in stock (or earlier in this batch) under a different photo.
   */
  async function runAi() {
    setAiError(null);
    let apiKey: string | null;
    try {
      apiKey = await unlockAiKey(state.settings.aiKeys ?? []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Face ID failed');
      return;
    }
    if (!apiKey) return;
    const key = apiKey;
    // Loaded only when used, so the AI code doesn't slow down opening the app.
    const { suggestFromPhoto, findSameItem } = await import('../lib/autoCategorise');
    const batch = rowsRef.current;
    // What each row will look like once suggestions are in, so the duplicate check can use them straight away.
    const latest = new Map(batch.map((r) => [r.key, r]));
    setAiRunning(true);
    let stop: string | null = null;
    const fail = (row: Row, e: unknown) => {
      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, ai: 'failed' } : r)));
      // A bad key or empty balance fails every photo, so stop at the first.
      if (e instanceof Error && 'status' in e && (e.status === 401 || e.status === 403 || e.status === 400)) stop = e.message;
    };
    const inParallel = async (todo: Row[], work: (row: Row) => Promise<void>) => {
      const queue = [...todo];
      const worker = async () => {
        for (let row = queue.shift(); row && !stop; row = queue.shift()) await work(row);
      };
      await Promise.all([worker(), worker(), worker()]);
    };

    const toSuggest = batch.filter((r) => !r.category);
    setRows((rs) => rs.map((r) => (toSuggest.some((t) => t.key === r.key) ? { ...r, ai: 'busy' } : r)));
    await inParallel(toSuggest, async (row) => {
      try {
        const s = await suggestFromPhoto(row.photo, state.settings, key);
        latest.set(row.key, { ...row, category: s.category, gender: row.gender || s.gender });
        // Only fills what's still blank, so anything picked by hand meanwhile stays.
        setRows((rs) =>
          rs.map((r) =>
            r.key !== row.key
              ? r
              : r.category
                ? { ...r, ai: 'done' }
                : { ...r, ai: 'done', name: r.name || s.name, gender: r.gender || s.gender, category: s.category, subcategory: s.subcategory, needsCheck: !s.sure, suggested: s.category !== '' },
          ),
        );
      } catch (e) {
        fail(row, e);
      }
    });

    const photos = new Map<string, Blob | null>();
    const stockPhoto = async (id: string) => {
      if (!photos.has(id)) photos.set(id, await loadPhotoBlob(id));
      return photos.get(id) ?? null;
    };
    const ordered = batch.map((r) => latest.get(r.key) ?? r);
    const toCheck = ordered.filter((r) => r.category && !r.dupChecked);
    setRows((rs) => rs.map((r) => (toCheck.some((t) => t.key === r.key) ? { ...r, ai: 'busy' } : r)));
    await inParallel(toCheck, async (row) => {
      const sameKind = (category: string, gender: ItemGender) => category === row.category && (!gender || !row.gender || gender === row.gender);
      const candidates: Candidate[] = [];
      ordered.slice(0, ordered.indexOf(row)).forEach((o, i) => {
        if (sameKind(o.category, o.gender)) candidates.push({ label: `photo ${i + 1} above`, photo: o.photo });
      });
      const stock = state.items
        .filter((i) => isHeld(i) && i.photoId && sameKind(i.category, i.gender))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_STOCK_COMPARED);
      for (const item of stock) {
        const photo = await stockPhoto(item.photoId!);
        if (photo) candidates.push({ label: describeItem(item), photo });
      }
      try {
        const found = await findSameItem(row.photo, candidates, key);
        setRows((rs) =>
          rs.map((r) =>
            r.key === row.key
              ? { ...r, ai: r.ai === 'failed' ? 'failed' : 'done', dupChecked: true, aiDuplicate: found ? `${found.sure ? 'Looks like' : 'Might be'} the same item as ${found.candidate.label}` : null }
              : r,
          ),
        );
      } catch (e) {
        fail(row, e);
      }
    });

    setRows((rs) => rs.map((r) => (r.ai === 'busy' ? { ...r, ai: 'none' } : r)));
    setAiRunning(false);
    if (stop) setAiError(`The photo AI stopped: ${stop}. Check the key and credit in Settings.`);
  }

  function remove(key: string) {
    setRows((rs) => {
      const row = rs.find((r) => r.key === key);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return rs.filter((r) => r.key !== key);
    });
  }

  async function saveAll() {
    if (duplicates.size > 0 && !window.confirm(`${duplicates.size} of these ${duplicates.size === 1 ? 'looks like an item' : 'look like items'} already added.\n\nSave them anyway?`)) return;
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
          subcategory: row.category ? row.subcategory : '',
          gender: row.gender,
          photoId,
          photoHash: row.hash,
          ...(row.needsCheck && row.category ? { needsCheck: true } : {}),
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
        // The category isn't remembered from here, so a bulk batch can't set the next single add's.
        localStorage.setItem(LAST_KEY, JSON.stringify({ ...last, category: last?.category ?? '', gender: rows[rows.length - 1]?.gender ?? '', location } satisfies LastDefaults));
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

  const pickupOptions = (current: string | null) => <CustomerOptions state={state} currentId={current} none="No customer" />;
  // Photo key -> what it's a copy of: an item already saved, or an earlier photo in this batch.
  const duplicates = new Map<string, string>();
  rows.forEach((r, i) => {
    const saved = itemWithPhoto(state.items, r.hash);
    const earlier = r.hash ? rows.findIndex((o) => o.hash === r.hash) : i;
    if (saved) duplicates.set(r.key, duplicateWarning(saved));
    else if (earlier < i) duplicates.set(r.key, `Same photo as photo ${earlier + 1} above.`);
    else if (r.aiDuplicate) duplicates.set(r.key, `${r.aiDuplicate} (photo AI)`);
  });
  const pieces = rows.reduce((t, r) => t + r.quantity, 0);
  const genderOptions = (
    <>
      <option value="">Women's/men's?</option>
      {GENDER_OPTIONS.map((g) => (
        <option key={g} value={g}>
          {GENDER_LABELS[g]}
        </option>
      ))}
    </>
  );
  const uncategorised = rows.filter((r) => !r.category).length;
  const unsure = rows.filter((r) => r.category && r.needsCheck).length;
  const unchecked = rows.filter((r) => !r.dupChecked).length;
  const aiReady = (state.settings.aiKeys?.length ?? 0) > 0;
  const categoryOptions = (
    <>
      <option value="">Category? (needs check)</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </>
  );
  const allSameGender = rows.length > 0 && rows.every((r) => r.gender === rows[0].gender) ? rows[0].gender : null;
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
            {duplicates.size > 0 && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <span>
                  ⚠ {duplicates.size} possible duplicate{duplicates.size === 1 ? '' : 's'} - marked below
                </span>
                <Button onClick={() => [...duplicates.keys()].forEach(remove)} disabled={saving}>
                  Remove {duplicates.size === 1 ? 'it' : 'them'}
                </Button>
              </div>
            )}
            {aiReady ? (
              (uncategorised > 0 || unchecked > 0) && (
                <Button variant="primary" className="w-full" disabled={aiRunning || saving} onClick={() => void runAi()}>
                  {aiRunning
                    ? '✨ Looking at photos…'
                    : uncategorised > 0
                      ? `✨ Suggest categories and check for duplicates`
                      : `✨ Check ${unchecked} for duplicates in stock`}
                </Button>
              )
            ) : (
              <p className="text-xs text-slate-500">
                Want categories filled in for you? <a className="underline" href={routeHref({ name: 'settings' })}>Set up the photo AI in Settings</a>.
              </p>
            )}
            {aiError && <p className="text-sm text-red-600">{aiError}</p>}
            <Field label={`Customer for all ${rows.length}`}>
              <Select
                value={allSame ?? 'mixed'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== 'mixed') setRows((rs) => rs.map((r) => ({ ...r, pickupId: v || null })));
                }}
              >
                {allSame === null && <option value="mixed">Different customers</option>}
                {pickupOptions(allSame || null)}
              </Select>
            </Field>
            <Field label={`Women's / men's for all ${rows.length}`}>
              <Select
                value={allSameGender ?? 'mixed'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== 'mixed') setRows((rs) => rs.map((r) => ({ ...r, gender: v as ItemGender })));
                }}
              >
                {allSameGender === null && <option value="mixed">Different</option>}
                {genderOptions}
              </Select>
            </Field>
            <Field label={`Category for all ${rows.length}`}>
              <Select
                value={allSameCategory ?? 'mixed'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== 'mixed') setRows((rs) => rs.map((r) => ({ ...r, category: v, subcategory: '', needsCheck: false, suggested: false, dupChecked: false, aiDuplicate: null })));
                }}
              >
                {allSameCategory === null && <option value="mixed">Different</option>}
                {categoryOptions}
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
                <ZoomableImg src={r.previewUrl} alt={`Photo ${i + 1}`} className="h-24 w-24 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  {duplicates.has(r.key) && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">⚠ {duplicates.get(r.key)}</p>}
                  {r.ai === 'busy' && <p className="text-xs text-slate-500">✨ Looking at this photo…</p>}
                  {r.ai === 'failed' && <p className="text-xs text-red-600">The photo AI couldn't read this one</p>}
                  {r.suggested && r.ai !== 'busy' && r.category && (
                    <p className={`text-xs font-medium ${r.needsCheck ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>
                      {r.needsCheck ? '⚠ AI not sure - check' : '✨ Suggested'}
                      {r.subcategory && ` · ${r.subcategory}`}
                    </p>
                  )}
                  <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="Name (optional)" aria-label={`Name for item ${i + 1}`} />
                  <Select value={r.pickupId ?? ''} onChange={(e) => update(r.key, { pickupId: e.target.value || null })} aria-label={`Customer for item ${i + 1}`}>
                    {pickupOptions(r.pickupId)}
                  </Select>
                  <Select value={r.gender} onChange={(e) => update(r.key, { gender: e.target.value as ItemGender })} aria-label={`Women's or men's for item ${i + 1}`}>
                    {genderOptions}
                  </Select>
                  <Select
                    value={r.category}
                    onChange={(e) => update(r.key, { category: e.target.value, subcategory: '', needsCheck: false, suggested: false, dupChecked: false, aiDuplicate: null })}
                    aria-label={`Category for item ${i + 1}`}
                    className={r.category && !r.needsCheck ? undefined : '!border-amber-400 !bg-amber-50 dark:!border-amber-700 dark:!bg-amber-950'}
                  >
                    {categoryOptions}
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

          {(uncategorised > 0 || unsure > 0) && (
            <p className="mt-4 text-sm text-amber-800 dark:text-amber-300">
              ⚠ {[uncategorised > 0 && `${uncategorised} without a category`, unsure > 0 && `${unsure} the AI wasn't sure about`].filter(Boolean).join(' and ')} - they'll be
              flagged "Needs check" in Stock to look at later.
            </p>
          )}
          <div className="vv-bottom sticky bottom-[var(--tabs-h)] z-10 -mx-4 mt-6 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 dark:border-slate-800 dark:bg-slate-950/95">
            <Button variant="primary" className="w-full py-3 text-base" disabled={saving || progress !== null} onClick={() => void saveAll()}>
              {saving ? 'Saving…' : `Save ${pieces} item${pieces === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
