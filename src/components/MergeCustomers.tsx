import { useState } from 'react';
import type { AppState, Pickup } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { groupBySeller, groupLabel, mergeCustomers, SELLER_DETAILS, sellerPickups } from '../lib/sellers';
import { shortDate } from '../lib/format';
import { showToast } from '../lib/toast';
import { Button, Card, Empty, Input } from './ui';

const DETAIL_LABELS: Record<(typeof SELLER_DETAILS)[number], string> = { reference: 'Name', sellerAddress: 'Address', sellerPostcode: 'Postcode', sellerContact: 'Contact' };

/**
 * Picks other customers (usually early pickups entered before the seller's
 * full details were known) to file under this pickup's customer, shows what
 * will change, and merges them once confirmed.
 */
export function MergeCustomers({ state, actions, pickup, onClose }: { state: AppState; actions: AppActions; pickup: Pickup; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const own = new Set(sellerPickups(state.pickups, pickup.id).map((p) => p.id));
  const groups = groupBySeller(state.pickups);
  const others = groups.filter((g) => !own.has(g[0].id));
  const q = search.trim().toLowerCase();
  const shown = q ? others.filter((g) => g.some((p) => [p.reference, p.sellerAddress, p.sellerPostcode, p.sellerContact].some((v) => v.toLowerCase().includes(q)))) : others;
  const itemCount = (g: Pickup[]) => state.items.filter((i) => i.pickupId !== null && g.some((p) => p.id === i.pickupId)).length;

  const after = picked.length ? mergeCustomers(state.pickups, pickup.id, picked) : state.pickups;
  const target = after.find((p) => p.id === pickup.id) ?? pickup;
  const moving = after.filter((p) => !own.has(p.id) && sellerPickups(after, pickup.id).some((x) => x.id === p.id));
  const kept = SELLER_DETAILS.filter((f) => target[f] !== pickup[f]);

  return (
    <Card className="mb-4" title={`Merge into ${pickup.reference}`} action={<Button onClick={onClose}>Close</Button>}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        Tick the old pickups that were really this customer. They'll be counted as {pickup.reference}, with these details, and their items and figures move
        here. Dates, weights, miles, payments and receipt numbers stay as they were, and the old details are kept in each pickup's edit history.
      </p>
      <Input type="search" placeholder="Search name, address, postcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2 w-full" />
      {shown.length === 0 ? (
        <Empty>{others.length ? 'No other customers match.' : 'There are no other customers to merge.'}</Empty>
      ) : (
        <ul className="mb-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {shown.map((g) => {
            const checked = picked.includes(g[0].id);
            const address = [g[0].sellerAddress, g[0].sellerPostcode].filter(Boolean).join(', ');
            return (
              <li key={g[0].id}>
                <label className="flex items-start gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={checked}
                    onChange={(e) => setPicked((v) => (e.target.checked ? [...v, g[0].id] : v.filter((id) => id !== g[0].id)))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{groupLabel(g, groups)}</span>
                    <span className="block text-xs text-slate-500">
                      {g.length > 1 ? `${g.length} pickups, ${shortDate(g[g.length - 1].date)} to ${shortDate(g[0].date)}` : shortDate(g[0].date)} · {itemCount(g)} items
                      {address && ` · ${address}`}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {moving.length > 0 && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-900 dark:bg-brand-950">
          <p className="mb-2 font-medium">
            {moving.length} {moving.length === 1 ? 'pickup' : 'pickups'} and {itemCount(moving)} items will join {target.reference}:
          </p>
          <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {SELLER_DETAILS.map((f) => (
              <div key={f} className="contents">
                <dt className="text-slate-500">{DETAIL_LABELS[f]}</dt>
                <dd className="break-words">
                  {target[f] || <span className="text-slate-400">none</span>}
                  {kept.includes(f) && <span className="text-xs text-slate-500"> (kept from an old pickup)</span>}
                </dd>
              </div>
            ))}
          </dl>
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            onClick={() => {
              const ok = window.confirm(
                `Merge ${moving.length} ${moving.length === 1 ? 'pickup' : 'pickups'} into ${target.reference}? Their seller details will change to the ones shown. You can still edit any pickup afterwards.`,
              );
              if (!ok) return;
              actions.mergeCustomers(pickup.id, picked);
              showToast(`Merged into ${target.reference}`);
              onClose();
            }}
          >
            Merge {moving.length} {moving.length === 1 ? 'pickup' : 'pickups'}
          </Button>
        </div>
      )}
    </Card>
  );
}
