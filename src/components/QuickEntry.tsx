import { useRef, useState } from 'react';
import type { AppState, ItemGender, ItemStatus, Pickup } from '../lib/types';
import { GENDER_LABELS, GENDER_OPTIONS } from '../lib/calc';
import type { AppActions } from '../lib/useAppState';
import { money, parseNumber } from '../lib/format';
import { todayIso } from '../lib/storage';
import { Button, Card, Input, Select } from './ui';

const KEY = 'cash4stuff-quick-entry-defaults';

interface Defaults {
  category: string;
  subcategory?: string;
  gender?: ItemGender;
  area: string;
  rack: string;
  box: string;
  status: ItemStatus;
}

function readDefaults(state: AppState): Defaults {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Defaults;
  } catch {
    // fall through to defaults
  }
  return { category: state.settings.categories[0] ?? 'Other', area: state.settings.storageAreas[0] ?? '', rack: '', box: '', status: 'listed' };
}

/**
 * Fast hand entry for stock already in hand: one compact row per item, Enter
 * saves and jumps back to the name, and everything except the name and price
 * stays as it was for the next item. Photos can be added later from the item.
 */
export function QuickEntry({ state, actions, pickup }: { state: AppState; actions: AppActions; pickup: Pickup }) {
  const [d, setD] = useState<Defaults>(() => readDefaults(state));
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [soldPrice, setSoldPrice] = useState('');
  const [soldDate, setSoldDate] = useState(todayIso());
  const [count, setCount] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const subs = state.settings.subcategories[d.category] ?? [];

  const set = (patch: Partial<Defaults>) => {
    const next = { ...d, ...patch };
    setD(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Remembering is a convenience only.
    }
  };

  function save() {
    const listPrice = parseNumber(price);
    const sold = d.status === 'sold' ? parseNumber(soldPrice) : null;
    if (d.status === 'sold' && sold === null) return;
    // Stock from a past pickup counts as in stock since the pickup, not since today.
    const backdated = pickup.date < todayIso() ? `${pickup.date}T12:00:00.000Z` : undefined;
    actions.addItem(
      {
        pickupId: pickup.id,
        name: name.trim(),
        category: d.category,
        gender: d.gender ?? '',
        subcategory: subs.includes(d.subcategory ?? '') ? (d.subcategory ?? '') : '',
        photoId: null,
        location: { area: d.area, rack: d.rack.trim(), box: d.box.trim() },
        listPrice,
        status: d.status === 'listed' && listPrice === null ? 'in_stock' : d.status,
        soldPrice: sold,
        soldDate: sold !== null ? soldDate : null,
        salesChannel: '',
        saleCosts: 0,
        notes: '',
      },
      backdated,
    );
    setCount((c) => c + 1);
    setName('');
    setPrice('');
    setSoldPrice('');
    nameRef.current?.focus();
  }

  return (
    <Card
      title="Quick entry (no photo)"
      className="mb-4"
      action={count > 0 && <span className="text-xs text-emerald-700 dark:text-emerald-400">✓ {count} added</span>}
    >
      <p className="mb-3 text-xs text-slate-500">
        For logging stock you already have. Press Enter to save each item; category, location and status stay set for the next one. Add photos later from
        each item.
      </p>
      <form
        className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="col-span-2" aria-label="Item name" />
        <Select value={d.gender ?? ''} onChange={(e) => set({ gender: e.target.value as ItemGender })} aria-label="For">
          <option value="">Anyone</option>
          {GENDER_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g]}
            </option>
          ))}
        </Select>
        <Select value={d.category} onChange={(e) => set({ category: e.target.value, subcategory: '' })} aria-label="Category">
          {state.settings.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        {subs.length > 0 && (
          <Select value={d.subcategory ?? ''} onChange={(e) => set({ subcategory: e.target.value })} aria-label="Sub-category">
            <option value="">Any type</option>
            {subs.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        )}
        <Input type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="List £" aria-label="Listing price" />
        <Select value={d.area} onChange={(e) => set({ area: e.target.value })} aria-label="Storage area">
          <option value="">No area</option>
          {state.settings.storageAreas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Input value={d.rack} onChange={(e) => set({ rack: e.target.value })} placeholder="Rack" aria-label="Rack" />
        <Input value={d.box} onChange={(e) => set({ box: e.target.value })} placeholder="Box" aria-label="Box" />
        <Select value={d.status} onChange={(e) => set({ status: e.target.value as ItemStatus })} aria-label="Status">
          <option value="listed">Listed</option>
          <option value="in_stock">Not listed</option>
          <option value="sold">Already sold</option>
        </Select>
        {d.status === 'sold' && (
          <>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} placeholder="Sold £" aria-label="Sold price" required />
            <Input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} aria-label="Sold date" />
          </>
        )}
        <Button type="submit" variant="primary" className="col-span-2 md:col-span-1">
          Add
        </Button>
      </form>
      {d.status === 'sold' && parseNumber(price) !== null && parseNumber(soldPrice) !== null && (
        <p className="mt-2 text-xs text-slate-500">
          Listed {money(parseNumber(price))}, sold {money(parseNumber(soldPrice))}
        </p>
      )}
    </Card>
  );
}
