import type { Item, Pickup } from '../lib/types';
import { categoryLabel, locationLabel } from '../lib/calc';
import { money } from '../lib/format';
import { routeHref } from '../lib/router';
import { Photo } from './Photo';
import { StatusBadge } from './ui';

export function ItemCard({ item, pickup }: { item: Item; pickup?: Pickup }) {
  const price = item.status === 'sold' ? item.soldPrice : item.listPrice;
  return (
    <a
      href={routeHref({ name: 'item', id: item.id })}
      className="flex gap-3 rounded-xl border border-slate-200 bg-white p-2 hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900"
    >
      <Photo id={item.photoId} alt={item.name} className="h-20 w-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-medium text-slate-900 dark:text-slate-50">{item.name || item.category}</div>
          <div className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-50">{money(price)}</div>
        </div>
        <div className="truncate text-xs text-slate-500">
          {categoryLabel(item)}
          {pickup && ` · ${pickup.reference}`}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{locationLabel(item.location) || 'No location'}</span>
          <StatusBadge status={item.status} />
        </div>
      </div>
    </a>
  );
}
