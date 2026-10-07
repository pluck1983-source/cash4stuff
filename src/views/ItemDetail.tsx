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
    subcategory: item.subcategory,
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
  const [selling, setSelling] = useState(false);
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
      subcategory: draft.subcategory,
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

  async function confirmSale(sale: Pick<Item, 'soldPrice' | 'soldDate' | 'salesChannel' | 'saleCosts'>) {
    setSaving(true);
    try {
      const updated = await buildFromDraft();
      actions.updateItem({ ...updated, ...sale, status: 'sold' }, item.photoId);
      setSelling(false);
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

      {!isSold && item.status !== 'written_off' && (
        <Button variant="primary" className="mb-4 w-full py-4 text-lg" onClick={() => setSelling(true)}>
          Sold it - enter final price
        </Button>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:order-2 lg:col-span-2">
          {isSold && <SoldCard item={item} buyCost={buyCost} onEdit={() => setSelling(true)} actions={actions} />}
          <PriceCard item={item} actions={actions} />
        </div>

        <Card className="lg:order-1 lg:col-span-3" title="Details">
          <ItemEditor state={state} draft={draft} onChange={setDraft} />
          <Button variant="primary" className="mt-5 w-full" disabled={saving} onClick={() => void saveDetails()}>
            Save changes
          </Button>
        </Card>
      </div>

      {selling && <SaleDialog state={state} item={item} buyCost={buyCost} saving={saving} onCancel={() => setSelling(false)} onConfirm={(sale) => void confirmSale(sale)} />}
    </div>
  );
}

/** What it sold for, and the way back if it was a mistake */
function SoldCard({ item, buyCost, onEdit, actions }: { item: Item; buyCost: number | undefined; onEdit: () => void; actions: AppActions }) {
  const list = item.listPrice;
  const profit = buyCost !== undefined && item.soldPrice !== null ? item.soldPrice - item.saleCosts - buyCost : null;
  return (
    <Card title="Sold">
      <div className="text-2xl font-semibold tabular-nums">{money(item.soldPrice)}</div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {item.soldDate && shortDate(item.soldDate)}
        {item.salesChannel && ` · ${item.salesChannel}`}
        {item.saleCosts > 0 && ` · ${money(item.saleCosts)} fees/postage`}
      </p>
      {list !== null && list > 0 && item.soldPrice !== null && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {Math.round((item.soldPrice / list) * 100)}% of the {money(list)} asking price
        </p>
      )}
      {profit !== null && (
        <p className="mt-1 text-sm">
          Profit on this item ≈ <strong className={profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}>{money(profit)}</strong>
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onEdit}>
          Edit sale
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            if (window.confirm('Undo this sale and put the item back to listed?'))
              actions.updateItem({ ...item, status: 'listed', soldPrice: null, soldDate: null, salesChannel: '', saleCosts: 0 });
          }}
        >
          Undo sale
        </Button>
      </div>
    </Card>
  );
}

/** Asks for the final selling price - deliberately blank, so the asking price is never recorded by accident */
function SaleDialog({
  state,
  item,
  buyCost,
  saving,
  onCancel,
  onConfirm,
}: {
  state: AppState;
  item: Item;
  buyCost: number | undefined;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (sale: Pick<Item, 'soldPrice' | 'soldDate' | 'salesChannel' | 'saleCosts'>) => void;
}) {
  const [price, setPrice] = useState(item.soldPrice !== null ? String(item.soldPrice) : '');
  const [date, setDate] = useState(item.soldDate ?? todayIso());
  const [channel, setChannel] = useState(item.salesChannel || state.settings.salesChannels[0] || '');
  const [costs, setCosts] = useState(item.saleCosts ? String(item.saleCosts) : '');
  const sold = parseNumber(price);
  const fees = parseNumber(costs) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <form
        role="dialog"
        aria-label="Record sale"
        className="pb-safe max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (sold === null) return;
          onConfirm({ soldPrice: pence(sold), soldDate: date, salesChannel: channel, saleCosts: pence(fees) });
        }}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">What did it sell for?</h2>
        <p className="mb-4 text-sm text-slate-500">
          {item.name || item.category}
          {item.listPrice !== null && ` · asking ${money(item.listPrice)}`}
        </p>
        <div className="space-y-4">
          <Field label="Final selling price (£)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              autoFocus
              required
              className="py-3 text-xl"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Fees / postage (£)">
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={costs} onChange={(e) => setCosts(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Sold on</span>
            <Chips options={state.settings.salesChannels} value={channel} onChange={setChannel} />
          </div>
          {sold !== null && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {item.listPrice !== null && item.listPrice > 0 && <>{Math.round((sold / item.listPrice) * 100)}% of asking. </>}
              {buyCost !== undefined && (
                <>
                  Profit ≈ <strong>{money(sold - fees - buyCost)}</strong>
                </>
              )}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" className="flex-1 py-3 text-base" disabled={saving || sold === null}>
              Confirm sale
            </Button>
            <Button className="py-3" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
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
