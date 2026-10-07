import { useState } from 'react';
import type { AppState, StorageLocation } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { money } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { newId } from '../lib/storage';
import { savePhoto } from '../lib/photos';
import { Button, PageHeader } from '../components/ui';
import { ItemEditor, draftListPrice, type ItemDraft } from '../components/ItemEditor';

/** Remembered per device, so boxing up a pile of stock doesn't mean re-typing the shelf every time */
const LAST_KEY = 'cash4stuff-last-item-defaults';

interface LastDefaults {
  category: string;
  location: StorageLocation;
}

function readLast(): LastDefaults | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as LastDefaults) : null;
  } catch {
    return null;
  }
}

function freshDraft(state: AppState, pickupId: string | null): ItemDraft {
  const last = readLast();
  return {
    pickupId,
    name: '',
    category: last?.category ?? state.settings.categories[0] ?? 'Other',
    location: last?.location ?? { area: state.settings.storageAreas[0] ?? '', rack: '', box: '' },
    listPrice: '',
    status: 'listed',
    notes: '',
    newPhoto: null,
    existingPhotoId: null,
  };
}

function latestPickupId(state: AppState): string | null {
  const latest = [...state.pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0];
  return latest?.id ?? null;
}

export function AddItemView({ state, actions, pickupId }: { state: AppState; actions: AppActions; pickupId: string | null }) {
  const [draft, setDraft] = useState<ItemDraft>(() => freshDraft(state, pickupId ?? latestPickupId(state)));
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<{ name: string; price: number | null }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pickup = state.pickups.find((p) => p.id === draft.pickupId);

  async function save(another: boolean) {
    setSaving(true);
    setError(null);
    try {
      let photoId: string | null = null;
      if (draft.newPhoto) {
        photoId = newId();
        await savePhoto(photoId, draft.newPhoto, false);
      }
      const listPrice = draftListPrice(draft);
      actions.addItem({
        pickupId: draft.pickupId,
        name: draft.name.trim(),
        category: draft.category,
        photoId,
        location: { area: draft.location.area, rack: draft.location.rack.trim(), box: draft.location.box.trim() },
        listPrice,
        // "Listed" with no price yet just means it's waiting to be priced and listed.
        status: draft.status === 'listed' && listPrice === null ? 'in_stock' : draft.status,
        soldPrice: null,
        soldDate: null,
        salesChannel: '',
        saleCosts: 0,
        notes: draft.notes.trim(),
      });
      localStorage.setItem(LAST_KEY, JSON.stringify({ category: draft.category, location: draft.location } satisfies LastDefaults));
      if (another) {
        setAdded((a) => [{ name: draft.name.trim() || draft.category, price: listPrice }, ...a]);
        setDraft({ ...freshDraft(state, draft.pickupId), status: draft.status });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate(draft.pickupId ? { name: 'pickup', id: draft.pickupId } : { name: 'stock' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add item" back={pickup ? routeHref({ name: 'pickup', id: pickup.id }) : routeHref({ name: 'stock' })} />
      {added.length > 0 && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          ✓ Added {added.length} item{added.length === 1 ? '' : 's'} - last: {added[0].name}
          {added[0].price !== null && ` (${money(added[0].price)})`}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <ItemEditor state={state} draft={draft} onChange={setDraft} />
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {/* Sticky on phones so saving never needs a scroll back down */}
        <div className="sticky bottom-16 z-10 -mx-4 mt-6 flex gap-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 dark:border-slate-800 dark:bg-slate-950/95">
          <Button type="submit" variant="primary" className="flex-1 py-3 text-base" disabled={saving}>
            {saving ? 'Saving…' : 'Save & add another'}
          </Button>
          <Button onClick={() => void save(false)} disabled={saving} className="py-3">
            Save & done
          </Button>
        </div>
      </form>
    </div>
  );
}
