import { useMemo, useState } from 'react';
import type { AppState, Item } from '../lib/types';
import { EMPTY_FILTER, filterItems, locationLabel, type ItemFilter } from '../lib/calc';
import { money, parseNumber, shortDate } from '../lib/format';
import { routeHref, useIsDesktop } from '../lib/router';
import { downloadText, itemsToCsv, todayIso } from '../lib/storage';
import { Button, Empty, Input, LinkButton, PageHeader, Select, StatusBadge } from '../components/ui';
import { ItemCard } from '../components/ItemCard';
import { Photo } from '../components/Photo';

type SortKey = 'newest' | 'oldest' | 'price_desc' | 'price_asc' | 'name' | 'location';

const FILTER_KEY = 'cash4stuff-stock-filter';

function readFilter(): ItemFilter {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    return raw ? { ...EMPTY_FILTER, ...(JSON.parse(raw) as Partial<ItemFilter>) } : { ...EMPTY_FILTER, status: 'held' };
  } catch {
    return { ...EMPTY_FILTER, status: 'held' };
  }
}

function itemPrice(i: Item): number {
  return (i.status === 'sold' ? i.soldPrice : i.listPrice) ?? 0;
}

export function StockView({ state }: { state: AppState }) {
  const isDesktop = useIsDesktop();
  const [filter, setFilterState] = useState<ItemFilter>(readFilter);
  const [sort, setSort] = useState<SortKey>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [layout, setLayout] = useState<'table' | 'cards'>('table');

  const setFilter = (patch: Partial<ItemFilter>) => {
    const next = { ...filter, ...patch };
    setFilterState(next);
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Remembering the filter is a convenience only.
    }
  };

  const pickupsById = useMemo(() => new Map(state.pickups.map((p) => [p.id, p])), [state.pickups]);
  const items = useMemo(() => {
    const list = filterItems(state, filter);
    const sorters: Record<SortKey, (a: Item, b: Item) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      price_desc: (a, b) => itemPrice(b) - itemPrice(a),
      price_asc: (a, b) => itemPrice(a) - itemPrice(b),
      name: (a, b) => (a.name || a.category).localeCompare(b.name || b.category),
      location: (a, b) => locationLabel(a.location).localeCompare(locationLabel(b.location), undefined, { numeric: true }),
    };
    return list.sort(sorters[sort]);
  }, [state, filter, sort]);

  const listValue = items.reduce((t, i) => t + (i.status === 'sold' ? 0 : (i.listPrice ?? 0)), 0);
  const soldValue = items.reduce((t, i) => t + (i.status === 'sold' ? (i.soldPrice ?? 0) : 0), 0);
  const racks = [...new Set(state.items.filter((i) => !filter.area || i.location.area === filter.area).map((i) => i.location.rack).filter(Boolean))].sort();
  const boxes = [
    ...new Set(
      state.items
        .filter((i) => (!filter.area || i.location.area === filter.area) && (!filter.rack || i.location.rack === filter.rack))
        .map((i) => i.location.box)
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeFilters = Object.entries(filter).filter(([k, v]) => k !== 'text' && v !== '' && v !== null && !(k === 'status' && v === 'held')).length;
  const filtersOpen = isDesktop || showFilters;

  return (
    <div>
      <PageHeader
        title="Stock"
        actions={
          <>
            {isDesktop && (
              <Button onClick={() => setLayout(layout === 'table' ? 'cards' : 'table')}>{layout === 'table' ? 'Card view' : 'Table view'}</Button>
            )}
            <Button onClick={() => downloadText(`cash4stuff-stock-${todayIso()}.csv`, itemsToCsv(state, items), 'text/csv')}>Export CSV</Button>
            <LinkButton href={routeHref({ name: 'add-item', pickupId: null })} variant="primary">
              + Add item
            </LinkButton>
          </>
        }
      />

      <div className="mb-3 flex gap-2">
        <Input type="search" value={filter.text} onChange={(e) => setFilter({ text: e.target.value })} placeholder="Search name, notes, pickup, location…" />
        {!isDesktop && (
          <Button onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        )}
      </div>

      {filtersOpen && (
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
          <Select value={filter.status} onChange={(e) => setFilter({ status: e.target.value as ItemFilter['status'] })} aria-label="Status">
            <option value="held">Unsold (in stock + listed)</option>
            <option value="">Any status</option>
            <option value="in_stock">In stock, not listed</option>
            <option value="listed">Listed</option>
            <option value="sold">Sold</option>
            <option value="written_off">Written off</option>
          </Select>
          <Select value={filter.category} onChange={(e) => setFilter({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {state.settings.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select value={filter.pickupId} onChange={(e) => setFilter({ pickupId: e.target.value })} aria-label="Pickup">
            <option value="">All pickups</option>
            {[...state.pickups]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} · {shortDate(p.date)}
                </option>
              ))}
          </Select>
          <Select value={filter.area} onChange={(e) => setFilter({ area: e.target.value, rack: '', box: '' })} aria-label="Storage area">
            <option value="">All areas</option>
            {state.settings.storageAreas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <Select value={filter.rack} onChange={(e) => setFilter({ rack: e.target.value, box: '' })} aria-label="Rack">
            <option value="">All racks</option>
            {racks.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <Select value={filter.box} onChange={(e) => setFilter({ box: e.target.value })} aria-label="Box">
            <option value="">All boxes</option>
            {boxes.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Min £"
            value={filter.minPrice ?? ''}
            onChange={(e) => setFilter({ minPrice: parseNumber(e.target.value) })}
            aria-label="Minimum price"
          />
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Max £"
            value={filter.maxPrice ?? ''}
            onChange={(e) => setFilter({ maxPrice: parseNumber(e.target.value) })}
            aria-label="Maximum price"
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span>
          <strong className="text-slate-900 dark:text-slate-100">{items.length}</strong> item{items.length === 1 ? '' : 's'}
          {listValue > 0 && <> · {money(listValue)} listed value</>}
          {soldValue > 0 && <> · {money(soldValue)} sold</>}
        </span>
        <span className="flex items-center gap-2">
          {(activeFilters > 0 || filter.text) && (
            <button type="button" className="underline" onClick={() => setFilter({ ...EMPTY_FILTER, status: 'held' })}>
              Clear filters
            </button>
          )}
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto py-1 text-sm" aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_desc">Price high-low</option>
            <option value="price_asc">Price low-high</option>
            <option value="name">Name</option>
            <option value="location">Location</option>
          </Select>
        </span>
      </div>

      {items.length === 0 ? (
        <Empty>{state.items.length === 0 ? 'No stock logged yet - start from a pickup or tap Add item.' : 'Nothing matches these filters.'}</Empty>
      ) : isDesktop && layout === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="w-16 p-2" />
                <th className="p-2">Item</th>
                <th className="p-2">Pickup</th>
                <th className="p-2">Location</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">List</th>
                <th className="p-2 text-right">Sold</th>
                <th className="p-2">Sold on</th>
                <th className="p-2">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((i) => {
                const p = i.pickupId ? pickupsById.get(i.pickupId) : undefined;
                return (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => (window.location.hash = routeHref({ name: 'item', id: i.id }))}>
                    <td className="p-2">
                      <Photo id={i.photoId} alt={i.name} className="h-12 w-12 rounded-md" />
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{i.name || i.category}</div>
                      <div className="text-xs text-slate-500">{i.category}</div>
                    </td>
                    <td className="p-2 text-slate-600 dark:text-slate-300">{p?.reference ?? '-'}</td>
                    <td className="p-2 text-slate-600 dark:text-slate-300">{locationLabel(i.location) || '-'}</td>
                    <td className="p-2">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="p-2 text-right tabular-nums">{money(i.listPrice)}</td>
                    <td className="p-2 text-right tabular-nums">{i.status === 'sold' ? money(i.soldPrice) : '-'}</td>
                    <td className="p-2 text-slate-600 dark:text-slate-300">{i.status === 'sold' ? `${i.salesChannel} ${shortDate(i.soldDate)}` : '-'}</td>
                    <td className="p-2 text-slate-500">{shortDate(i.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} pickup={i.pickupId ? pickupsById.get(i.pickupId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
