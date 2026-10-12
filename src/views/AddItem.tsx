import { useState } from 'react';
import type { AppState } from '../lib/types';
import { LAST_KEY, readLast, type LastDefaults } from '../lib/itemDefaults';
import type { AppActions } from '../lib/useAppState';
import { money } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { newId } from '../lib/storage';
import { latestOpenPickupId } from '../lib/sellers';
import { savePhoto } from '../lib/photos';
import { Button, LinkButton, PageHeader } from '../components/ui';
import { ItemEditor, draftListPrice, type ItemDraft } from '../components/ItemEditor';

function freshDraft(state: AppState, pickupId: string | null): ItemDraft {
  const last = readLast();
  return {
    pickupId,
    name: '',
    keywords: '',
    category: last?.category ?? state.settings.categories[0] ?? 'Other',
    subcategory: last?.subcategory ?? '',
    gender: last?.gender ?? '',
    location: last?.location ?? { area: state.settings.storageAreas[0] ?? '', rack: '', box: '' },
    sku: '',
    quantity: 1,
    listPrice: '',
    status: 'in_stock',
    listedDate: '',
    notes: '',
    newPhoto: null,
    existingPhotoId: null,
  };
}

export function AddItemView({ state, actions, pickupId }: { state: AppState; actions: AppActions; pickupId: string | null }) {
  const [draft, setDraft] = useState<ItemDraft>(() => freshDraft(state, pickupId ?? latestOpenPickupId(state.pickups)));
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<{ name: string; price: number | null; quantity: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pickup = state.pickups.find((p) => p.id === draft.pickupId);
  const addedCount = added.reduce((t, a) => t + a.quantity, 0);

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
        keywords: draft.keywords.trim(),
        category: draft.category,
        subcategory: draft.subcategory,
        gender: draft.gender,
        photoId,
        location: { area: draft.location.area, rack: draft.location.rack.trim(), box: draft.location.box.trim() },
        sku: draft.sku.trim(),
        quantity: draft.quantity,
        listPrice,
        status: draft.status,
        listedDate: draft.status === 'listed' ? draft.listedDate || null : null,
        soldPrice: null,
        soldDate: null,
        salesChannel: '',
        saleCosts: 0,
        notes: draft.notes.trim(),
      });
      localStorage.setItem(LAST_KEY, JSON.stringify({ category: draft.category, subcategory: draft.subcategory, gender: draft.gender, location: draft.location } satisfies LastDefaults));
      if (another) {
        setAdded((a) => [{ name: draft.name.trim() || draft.category, price: listPrice, quantity: draft.quantity }, ...a]);
        setDraft({ ...freshDraft(state, draft.pickupId), status: draft.status, listedDate: draft.listedDate });
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
      <PageHeader
        title="Add item"
        back={pickup ? routeHref({ name: 'pickup', id: pickup.id }) : routeHref({ name: 'stock' })}
        actions={
          <LinkButton href={routeHref({ name: 'add-photos', pickupId: draft.pickupId })}>
            📷 Add several from photos
          </LinkButton>
        }
      />
      {added.length > 0 && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          ✓ Added {addedCount} item{addedCount === 1 ? '' : 's'} - last: {added[0].name}
          {added[0].quantity > 1 && ` ×${added[0].quantity}`}
          {added[0].price !== null && ` (${money(added[0].price)}${added[0].quantity > 1 ? ' each' : ''})`}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <ItemEditor state={state} draft={draft} onChange={setDraft} />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {/* Sticky on phones so saving never needs a scroll back down */}
        <div className="sticky bottom-[var(--tabs-h)] z-10 -mx-4 mt-6 flex gap-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 dark:border-slate-800 dark:bg-slate-950/95">
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
