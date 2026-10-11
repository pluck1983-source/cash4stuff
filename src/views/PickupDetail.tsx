import { useEffect, useState } from 'react';
import type { AppState } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { pickupStats } from '../lib/calc';
import { kg, money, parseNumber, percent, shortDate } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { Button, Card, Empty, Input, LinkButton, PageHeader, Select, Stat } from '../components/ui';
import { ItemCard } from '../components/ItemCard';
import { OPEN_QUICK_ENTRY_KEY, PickupForm } from './Pickups';
import { QuickEntry } from '../components/QuickEntry';
import { AuditTrail, askVoidReason } from '../components/Records';
import { Photo } from '../components/Photo';
import { PurchaseReceipt } from '../components/PurchaseReceipt';
import { paymentLabel } from '../lib/audit';

export function PickupDetailView({ state, books, actions, id }: { state: AppState; books: AppState; actions: AppActions; id: string }) {
  const pickup = books.pickups.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [quickEntry, setQuickEntry] = useState(() => sessionStorage.getItem(OPEN_QUICK_ENTRY_KEY) === id);
  useEffect(() => sessionStorage.removeItem(OPEN_QUICK_ENTRY_KEY), []);
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
            {pickup.voidedAt === null ? (
              <>
                <Button onClick={() => setShowReceipt(true)}>Receipt</Button>
                <Button onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Edit'}</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    const reason = askVoidReason('purchase');
                    if (reason) {
                      actions.voidPickup(pickup.id, reason);
                      navigate({ name: 'pickups' }, true);
                    }
                  }}
                >
                  Void
                </Button>
              </>
            ) : (
              <Button onClick={() => actions.restorePickup(pickup.id)}>Restore</Button>
            )}
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-slate-500">
        {pickup.receiptNumber !== null && `Receipt no. ${pickup.receiptNumber} · `}
        {shortDate(pickup.date)} · {kg(pickup.weightKg)} at {money(pickup.ratePerKg)}/kg · paid {money(pickup.amountPaid)}
        {pickup.paymentMethod && ` by ${paymentLabel(pickup.paymentMethod).toLowerCase()}`}
        {pickup.notes && ` · ${pickup.notes}`}
      </p>
      {pickup.voidedAt !== null && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          This purchase is <strong>voided</strong> and left out of every total{pickup.voidReason && `: ${pickup.voidReason}`}. Restore it if that was a mistake.
        </p>
      )}

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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <LinkButton href={routeHref({ name: 'add-item', pickupId: pickup.id })} variant="primary" className="flex-1 py-3 text-base">
          + Add item with photo
        </LinkButton>
        <Button onClick={() => setQuickEntry((v) => !v)} className="py-3" variant={quickEntry ? 'primary' : 'secondary'}>
          {quickEntry ? 'Close quick entry' : 'Quick entry (existing stock)'}
        </Button>
      </div>
      {quickEntry && <QuickEntry state={state} actions={actions} pickup={pickup} />}

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
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Void cost"
                      onClick={() => {
                        const reason = askVoidReason('cost');
                        if (reason) actions.voidExpense(e.id, reason);
                      }}
                    >
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

      {showReceipt && (
        <PurchaseReceipt
          pickup={pickup}
          settings={state.settings}
          onSign={(signaturePhotoId) => actions.updatePickup({ ...pickup, signaturePhotoId })}
          onClose={() => setShowReceipt(false)}
        />
      )}
      <Card
        title="Purchase record"
        className="mt-4"
        action={
          <Button variant="primary" onClick={() => setShowReceipt(true)}>
            {pickup.signaturePhotoId ? 'Seller receipt' : 'Receipt & signature'}
          </Button>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Receipt no.</dt>
          <dd>{pickup.receiptNumber ?? 'None (entered before receipt numbers)'}</dd>
          <dt className="text-slate-500">Paid by</dt>
          <dd>
            {paymentLabel(pickup.paymentMethod) || 'Not recorded'}
            {pickup.bankRef && ` · ref ${pickup.bankRef}`}
          </dd>
          {pickup.sellerContact && (
            <>
              <dt className="text-slate-500">Seller contact</dt>
              <dd className="break-words">{pickup.sellerContact}</dd>
            </>
          )}
          <dt className="text-slate-500">Signed</dt>
          <dd>{pickup.signaturePhotoId ? 'On screen' : pickup.paperSlipSigned ? 'Paper slip' : 'No'}</dd>
        </dl>
        {pickup.signaturePhotoId && (
          <Photo id={pickup.signaturePhotoId} alt="Seller signature" contain className="mt-3 h-28 rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
        )}
        <div className="mt-3">
          <AuditTrail createdAt={pickup.createdAt} history={pickup.history} />
        </div>
      </Card>
    </div>
  );
}
