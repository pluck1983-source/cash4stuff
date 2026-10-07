import { useState } from 'react';
import type { AppState, Item } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { itemCostMap, originalListPrice, pence } from '../lib/calc';
import { money, parseNumber, shortDate } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { newId, todayIso } from '../lib/storage';
import { savePhoto } from '../lib/photos';
import { Button, Card, Chips, Empty, Field, Input, PageHeader, StatusBadge } from '../components/ui';
import { ItemEditor, draftListPrice, type ItemDraft } from '../components/ItemEditor';

function toDraft(item: Item): ItemDraft {
  return {
    pickupId: item.pickupId,
    name: item.name,
    category: item.category,
    location: item.location,
    listPrice: item.listPrice === null ? '' : String(item.listPrice),
    status: item.status,
    notes: item.notes,
    newPhoto: null,
    existingPhotoId: item.photoId,
  };
}

export function ItemDetailView({ state, actions, id }: { state: AppState; actions: AppActions; id: string }) {
  const item = state.items.find((i) => i.id === id);
  if (!item) {
    return (
      <div>
        <PageHeader title="Item not found" back={routeHref({ name: 'stock' })} />
        <Empty>This item may have been deleted on another device.</Empty>
      </div>
    );
  }
  // Keyed so switching items (or an incoming sync of this one) resets the form.
  return <ItemDetail key={item.id + item.updatedAt} state={state} actions={actions} item={item} />;
}

function ItemDetail({ state, actions, item }: { state: AppState; actions: AppActions; item: Item }) {
  const [draft, setDraft] = useState(() => toDraft(item));
  const [soldPrice, setSoldPrice] = useState(item.soldPrice !== null ? String(item.soldPrice) : item.listPrice !== null ? String(item.listPrice) : '');
  const [soldDate, setSoldDate] = useState(item.soldDate ?? todayIso());
  const [channel, setChannel] = useState(item.salesChannel || state.settings.salesChannels[0] || '');
  const [saleCosts, setSaleCosts] = useState(item.saleCosts ? String(item.saleCosts) : '');
  const [saving, setSaving] = useState(false);

  const pickup = state.pickups.find((p) => p.id === item.pickupId);
  const buyCost = itemCostMap(state).get(item.id);
  const isSold = item.status === 'sold';

  async function buildFromDraft(): Promise<Item> {
    let photoId = draft.existingPhotoId;
    if (draft.newPhoto) {
      photoId = newId();
      await savePhoto(photoId, draft.newPhoto, false);
    }
    return {
      ...item,
      pickupId: draft.pickupId,
      name: draft.name.trim(),
      category: draft.category,
      photoId,
      location: { area: draft.location.area, rack: draft.location.rack.trim(), box: draft.location.box.trim() },
      listPrice: draftListPrice(draft),
      status: isSold ? 'sold' : draft.status,
      notes: draft.notes.trim(),
    };
  }

  async function saveDetails() {
    setSaving(true);
    try {
      actions.updateItem(await buildFromDraft(), item.photoId);
    } finally {
      setSaving(false);
    }
  }

  async function markSold() {
    const price = parseNumber(soldPrice);
    if (price === null) return;
    setSaving(true);
    try {
      const updated = await buildFromDraft();
      actions.updateItem({ ...updated, status: 'sold', soldPrice: price, soldDate, salesChannel: channel, saleCosts: parseNumber(saleCosts) ?? 0 }, item.photoId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={item.name || item.category}
        back={pickup ? routeHref({ name: 'pickup', id: pickup.id }) : routeHref({ name: 'stock' })}
        actions={
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Delete this item? This removes it everywhere, including its photo.')) {
                actions.deleteItem(item);
                navigate(pickup ? { name: 'pickup', id: pickup.id } : { name: 'stock' }, true);
              }
            }}
          >
            Delete
          </Button>
        }
      />
      <p className="-mt-3 mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <StatusBadge status={item.status} />
        {pickup && (
          <a className="underline" href={routeHref({ name: 'pickup', id: pickup.id })}>
            {pickup.reference}
          </a>
        )}
        {buyCost !== undefined && <span>· cost {money(buyCost)}</span>}
        <span>· added {shortDate(item.createdAt)}</span>
      </p>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Details">
          <ItemEditor state={state} draft={draft} onChange={setDraft} />
          <Button variant="primary" className="mt-5 w-full" disabled={saving} onClick={() => void saveDetails()}>
            Save changes
          </Button>
        </Card>

        <div className="space-y-4 lg:col-span-2">
        <PriceCard item={item} actions={actions} />
        <Card title={isSold ? `Sold for ${money(item.soldPrice)}` : 'Record sale'}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sold for (£)">
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} />
              </Field>
              <Field label="Date">
                <Input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} />
              </Field>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Sold on</span>
              <Chips options={state.settings.salesChannels} value={channel} onChange={setChannel} />
            </div>
            <Field label="Fees / postage you paid (£)" hint="Selling-site fees or postage on this sale - comes off the profit">
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={saleCosts} onChange={(e) => setSaleCosts(e.target.value)} placeholder="0.00" />
            </Field>
            {item.listPrice !== null && item.listPrice > 0 && parseNumber(soldPrice) !== null && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {Math.round(((parseNumber(soldPrice) ?? 0) / item.listPrice) * 100)}% of the {money(item.listPrice)} asking price
              </p>
            )}
            {buyCost !== undefined && parseNumber(soldPrice) !== null && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Profit on this item ≈ <strong>{money((parseNumber(soldPrice) ?? 0) - (parseNumber(saleCosts) ?? 0) - buyCost)}</strong>
              </p>
            )}
            <Button variant="primary" className="w-full" disabled={saving || parseNumber(soldPrice) === null} onClick={() => void markSold()}>
              {isSold ? 'Update sale' : 'Mark as sold'}
            </Button>
            {isSold && (
              <Button
                className="w-full"
                onClick={() => actions.updateItem({ ...item, status: 'listed', soldPrice: null, soldDate: null, salesChannel: '', saleCosts: 0 })}
              >
                Undo sale (back to listed)
              </Button>
            )}
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

/** Asking price, its history, and typing in a new one */
function PriceCard({ item, actions }: { item: Item; actions: AppActions }) {
  const original = originalListPrice(item);
  const current = item.listPrice;
  const [newPrice, setNewPrice] = useState('');
  const parsed = parseNumber(newPrice);
  return (
    <Card title="Asking price">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{money(current)}</span>
        {original !== null && current !== null && original !== current && (
          <span className="text-sm text-slate-500">
            was {money(original)} ({Math.round(((original - current) / original) * 100)}% off)
          </span>
        )}
      </div>
      {item.status !== 'sold' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed === null || parsed === current) return;
            actions.updateItem({ ...item, listPrice: pence(parsed) });
            setNewPrice('');
          }}
        >
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="New price £"
            aria-label="New asking price"
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={parsed === null || parsed === current}>
            Change price
          </Button>
        </form>
      )}
      {item.priceHistory.length > 1 && (
        <ul className="mt-3 space-y-0.5 text-xs text-slate-500">
          {[...item.priceHistory].reverse().map((p) => (
            <li key={p.date + p.price} className="flex justify-between">
              <span>{shortDate(p.date)}</span>
              <span className="tabular-nums">{money(p.price)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">Type the new price when you drop it. Each change is kept so you can see what it sold for against what it was listed at.</p>
    </Card>
  );
}
