import type { Item, Pickup } from '../lib/types';
import { categoryLabel, locationLabel } from '../lib/calc';
import { money, shortDate } from '../lib/format';
import { routeHref } from '../lib/router';
import { Photo } from './Photo';
import { StatusBadge } from './ui';

export function ItemCard({ item, pickup }: { item: Item; pickup?: Pickup }) {
  const price = item.status === 'sold' ? item.soldPrice : item.listPrice;
  return (
    <a
      href={routeHref({ name: 'item', id: item.id })}
      className="flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-2 hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900"
    >
      <Photo id={item.photoId} alt={item.name} className="h-20 w-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-medium text-slate-900 dark:text-slate-50">
            {item.quantity > 1 && <span className="mr-1 rounded bg-brand-100 px-1 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">×{item.quantity}</span>}
            {item.name || item.category}
          </div>
          {price === null ? (
            <div className="shrink-0 text-xs text-slate-400">No price</div>
          ) : (
            <div className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {money(price)}
              {item.quantity > 1 && item.status !== 'sold' && <span className="text-xs font-normal text-slate-500"> each</span>}
            </div>
          )}
        </div>
        <div className="truncate text-xs text-slate-500">
          {categoryLabel(item)}
          {pickup && ` · ${pickup.reference}`}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">
            {item.sku && <span className="mr-1 font-mono font-semibold text-slate-700 dark:text-slate-300">{item.sku}</span>}
            {locationLabel(item.location) || 'No location'}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {item.status === 'listed' && item.listedDate && <span className="text-xs text-slate-500">{shortDate(item.listedDate)}</span>}
            <StatusBadge status={item.status} />
          </span>
        </div>
      </div>
    </a>
  );
}
