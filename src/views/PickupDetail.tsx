import { useState } from 'react';
import type { AppState } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { pickupStats } from '../lib/calc';
import { kg, money, parseNumber, percent, shortDate } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { Button, Card, Empty, Input, LinkButton, PageHeader, Select, Stat } from '../components/ui';
import { ItemCard } from '../components/ItemCard';
import { PickupForm } from './Pickups';

export function PickupDetailView({ state, actions, id }: { state: AppState; actions: AppActions; id: string }) {
  const pickup = state.pickups.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [costCategory, setCostCategory] = useState('Fuel');
  const [costAmount, setCostAmount] = useState('');

  if (!pickup) {
    return (
      <div>
        <PageHeader title="Pickup not found" back={routeHref({ name: 'pickups' })} />
        <Empty>This pickup may have been deleted on another device.</Empty>
      </div>
    );
  }

  const s = pickupStats(state, pickup);
  const items = state.items.filter((i) => i.pickupId === pickup.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const linkedExpenses = state.expenses.filter((e) => e.pickupId === pickup.id);

  return (
    <div>
      <PageHeader
        title={pickup.reference}
        back={routeHref({ name: 'pickups' })}
        actions={
          <>
            <Button onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Edit'}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Delete "${pickup.reference}"? Its ${items.length} item(s) are kept but no longer linked to a pickup.`)) {
                  actions.deletePickup(pickup.id);
                  navigate({ name: 'pickups' }, true);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-slate-500">
        {shortDate(pickup.date)} · {kg(pickup.weightKg)}
        {pickup.notes && ` · ${pickup.notes}`}
      </p>

      {editing && (
        <Card className="mb-4" title="Edit pickup">
          <PickupForm
            state={state}
            initial={pickup}
            onCancel={() => setEditing(false)}
            onSave={(data) => {
              actions.updatePickup({ ...pickup, ...data });
              setEditing(false);
            }}
          />
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Total cost" value={money(s.totalCost)} sub={s.linkedCosts > 0 ? `${money(s.stockCost)} stock + ${money(s.linkedCosts)} costs` : 'stock'} />
        <Stat label="Sold so far" value={money(s.salesRevenue + s.otherIncome)} sub={`${s.soldCount} of ${s.itemCount} items`} />
        <Stat label="Profit so far" value={money(s.realisedProfit)} sub={`${percent(s.roi)} return`} tone={s.realisedProfit >= 0 ? 'good' : 'bad'} />
        <Stat
          label="If the rest sells"
          value={money(s.projectedProfit)}
          sub={`${money(s.heldListValue)} still listed`}
          tone={s.projectedProfit >= 0 ? 'good' : 'bad'}
        />
      </div>

      <LinkButton href={routeHref({ name: 'add-item', pickupId: pickup.id })} variant="primary" className="mb-4 w-full py-3 text-base">
        + Add item to this pickup
      </LinkButton>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Items ({items.length}){s.costPerItem !== null && <span className="font-normal text-slate-500"> · {money(s.costPerItem)} cost each</span>}
          </h2>
          {items.length === 0 ? (
            <Empty>No items logged from this pickup yet.</Empty>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {items.map((i) => (
                <ItemCard key={i.id} item={i} />
              ))}
            </div>
          )}
        </div>
        <Card title="Costs for this pickup">
          <p className="mb-3 text-xs text-slate-500">Fuel, parking etc. added here count against this pickup's profit.</p>
          {linkedExpenses.length > 0 && (
            <ul className="mb-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {linkedExpenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-1.5">
                  <span>
                    {e.category}
                    {e.description && <span className="text-slate-500"> · {e.description}</span>}
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {money(e.amount)}
                    <button type="button" className="text-slate-400 hover:text-rose-600" aria-label="Remove cost" onClick={() => actions.deleteExpense(e.id)}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = parseNumber(costAmount);
              if (!amount) return;
              actions.saveExpense({ date: pickup.date, category: costCategory, description: pickup.reference, amount, pickupId: pickup.id });
              setCostAmount('');
            }}
          >
            <Select value={costCategory} onChange={(e) => setCostCategory(e.target.value)} className="flex-1">
              {state.settings.expenseCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="£" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} className="w-24" />
            <Button type="submit">Add</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
