import { useEffect, useMemo } from 'react';
import type { AppState, ItemGender, ItemStatus, StorageLocation } from '../lib/types';
import { GENDER_LABELS, GENDER_OPTIONS } from '../lib/calc';
import { parseNumber, shortDate } from '../lib/format';
import { Chips, Field, Input, Select } from './ui';
import { Photo, PhotoPicker } from './Photo';

export interface ItemDraft {
  pickupId: string | null;
  name: string;
  category: string;
  subcategory: string;
  gender: ItemGender;
  location: StorageLocation;
  listPrice: string;
  status: ItemStatus;
  notes: string;
  /** A newly taken photo, not yet saved */
  newPhoto: Blob | null;
  /** The photo already saved on the item (null if none, or removed) */
  existingPhotoId: string | null;
}

export function draftListPrice(draft: ItemDraft): number | null {
  return parseNumber(draft.listPrice);
}

/** All the add/edit fields for an item - the quick flow is top to bottom, nothing else needed */
export function ItemEditor({ state, draft, onChange, showPickup = true }: { state: AppState; draft: ItemDraft; onChange: (d: ItemDraft) => void; showPickup?: boolean }) {
  const set = (patch: Partial<ItemDraft>) => onChange({ ...draft, ...patch });
  const setLoc = (patch: Partial<StorageLocation>) => set({ location: { ...draft.location, ...patch } });

  const previewUrl = useMemo(() => (draft.newPhoto ? URL.createObjectURL(draft.newPhoto) : null), [draft.newPhoto]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pickups = useMemo(() => [...state.pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)), [state.pickups]);

  // Racks and boxes already used in this area, offered as suggestions.
  const knownRacks = useMemo(
    () => [...new Set(state.items.filter((i) => i.location.area === draft.location.area && i.location.rack).map((i) => i.location.rack))].sort(),
    [state.items, draft.location.area],
  );
  const knownBoxes = useMemo(
    () =>
      [...new Set(state.items.filter((i) => i.location.area === draft.location.area && i.location.rack === draft.location.rack && i.location.box).map((i) => i.location.box))].sort(),
    [state.items, draft.location.area, draft.location.rack],
  );
  const subcategories = state.settings.subcategories[draft.category] ?? [];

  return (
    <div className="space-y-5">
      {showPickup && (
        <Field label="Pickup">
          <Select value={draft.pickupId ?? ''} onChange={(e) => set({ pickupId: e.target.value || null })}>
            <option value="">No pickup (bought separately / own stock)</option>
            {pickups.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} · {shortDate(p.date)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Photo</span>
        <PhotoPicker
          preview={
            previewUrl ? (
              <img src={previewUrl} alt="Item" className="h-full w-full object-cover" />
            ) : draft.existingPhotoId ? (
              <Photo id={draft.existingPhotoId} alt={draft.name} className="h-full w-full" />
            ) : null
          }
          onPicked={(blob) => set({ newPhoto: blob })}
          onClear={() => set({ newPhoto: null, existingPhotoId: null })}
        />
      </div>

      <Field label="Name">
        <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Levi's 501 jeans W32" />
      </Field>

      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">For (optional - tap again to clear)</span>
        <Chips
          options={GENDER_OPTIONS.map((g) => GENDER_LABELS[g])}
          value={GENDER_LABELS[draft.gender]}
          onChange={(label) => {
            const g = GENDER_OPTIONS.find((o) => GENDER_LABELS[o] === label) ?? '';
            set({ gender: g === draft.gender ? '' : g });
          }}
        />
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</span>
        <Chips
          options={state.settings.categories}
          value={draft.category}
          onChange={(category) => set({ category, subcategory: category === draft.category ? draft.subcategory : '' })}
        />
        {subcategories.length > 0 && (
          <div className="mt-2 border-l-2 border-emerald-200 pl-3 dark:border-emerald-900">
            <span className="mb-1 block text-xs text-slate-500">Type (optional - tap again to clear)</span>
            <Chips options={subcategories} value={draft.subcategory} onChange={(sub) => set({ subcategory: sub === draft.subcategory ? '' : sub })} />
          </div>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Stored at</span>
        <Chips options={state.settings.storageAreas} value={draft.location.area} onChange={(area) => setLoc({ area })} />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Rack">
            <Input value={draft.location.rack} onChange={(e) => setLoc({ rack: e.target.value })} list="known-racks" placeholder="e.g. A" />
            <datalist id="known-racks">
              {knownRacks.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Box">
            <Input value={draft.location.box} onChange={(e) => setLoc({ box: e.target.value })} list="known-boxes" placeholder="e.g. 3" />
            <datalist id="known-boxes">
              {knownBoxes.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Listing price (£)">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={draft.listPrice} onChange={(e) => set({ listPrice: e.target.value })} placeholder="0.00" />
        </Field>
        {draft.status !== 'sold' && (
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => set({ status: e.target.value as ItemStatus })}>
              <option value="in_stock">In stock (not listed yet)</option>
              <option value="listed">Listed online</option>
              <option value="written_off">Written off / binned</option>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Notes">
        <Input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Size, brand, condition…" />
      </Field>
    </div>
  );
}
