import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppState } from '../lib/types';
import {
  PERIOD_LABELS,
  expensesByCategory,
  locationLabel,
  monthlySeries,
  periodFor,
  pickupStats,
  salesByCategory,
  totals,
  type PeriodKey,
  type Totals,
} from '../lib/calc';
import { kg, money, moneyShort, percent, shortDate } from '../lib/format';
import { routeHref, useIsDesktop } from '../lib/router';
import { Button, Card, Empty, LinkButton, Select, Stat } from '../components/ui';
import { Photo } from '../components/Photo';

// --- Key figures -----------------------------------------------------------

type KpiKey =
  | 'totalIncome'
  | 'netProfit'
  | 'stockCost'
  | 'runningCosts'
  | 'totalCosts'
  | 'stockListValue'
  | 'stockBookCost'
  | 'heldItems'
  | 'itemsSold'
  | 'averageSalePrice'
  | 'kgBought'
  | 'pickups'
  | 'unpricedItems'
  | 'soldVsList';

interface KpiDef {
  label: string;
  value: (t: Totals) => string;
  sub?: (t: Totals) => ReactNode;
  tone?: (t: Totals) => 'good' | 'bad' | 'default';
  /** Snapshot figures ignore the period selector */
  snapshot?: boolean;
}

const KPIS: Record<KpiKey, KpiDef> = {
  totalIncome: { label: 'Total income', value: (t) => moneyShort(t.totalIncome), sub: (t) => `${t.itemsSold} sold${t.otherIncome ? ` + ${money(t.otherIncome)} other` : ''}` },
  netProfit: { label: 'Net profit', value: (t) => moneyShort(t.netProfit), tone: (t) => (t.netProfit >= 0 ? 'good' : 'bad'), sub: () => 'income - all costs' },
  stockCost: { label: 'Stock cost', value: (t) => moneyShort(t.stockCost), sub: (t) => `${t.pickups} pickups · ${kg(t.kgBought)}` },
  runningCosts: { label: 'Running costs', value: (t) => moneyShort(t.runningCosts + t.saleCosts), sub: (t) => (t.saleCosts ? `incl. ${money(t.saleCosts)} sale fees/postage` : 'fuel, rent, bags…') },
  totalCosts: { label: 'Total business cost', value: (t) => moneyShort(t.totalCosts), sub: () => 'stock + running costs' },
  stockListValue: { label: 'Stock value (listed)', value: (t) => moneyShort(t.stockListValue), sub: (t) => `${t.heldItems} items held`, snapshot: true },
  stockBookCost: { label: 'Stock at cost', value: (t) => moneyShort(t.stockBookCost), sub: () => 'what unsold items cost you', snapshot: true },
  heldItems: { label: 'Items in stock', value: (t) => String(t.heldItems), sub: (t) => `${t.listedItems} listed online`, snapshot: true },
  itemsSold: { label: 'Items sold', value: (t) => String(t.itemsSold), sub: (t) => `${t.itemsAdded} added` },
  averageSalePrice: { label: 'Average sale', value: (t) => money(t.averageSalePrice) },
  kgBought: { label: 'Kilos bought', value: (t) => kg(t.kgBought), sub: (t) => `${t.pickups} pickups` },
  pickups: { label: 'Pickups', value: (t) => String(t.pickups), sub: (t) => kg(t.kgBought) },
  soldVsList: {
    label: 'Sold vs asking price',
    value: (t) => percent(t.soldVsList),
    sub: (t) => (t.soldListValue ? `${money(t.soldAgainstListValue)} for ${money(t.soldListValue)} listed` : 'nothing sold with a list price'),
  },
  unpricedItems: { label: 'Not priced yet', value: (t) => String(t.unpricedItems), sub: () => 'items with no list price', snapshot: true },
};

function KpiTile({ k, t }: { k: KpiKey; t: Totals }) {
  const def = KPIS[k];
  return <Stat label={def.label} value={def.value(t)} sub={def.sub?.(t)} tone={def.tone?.(t) ?? 'default'} />;
}

// --- Widgets -----------------------------------------------------------------

type WidgetKey = 'kpis' | 'monthTable' | 'monthly' | 'pickups' | 'expenses' | 'categories' | 'recentSales' | 'locations' | 'attention';

const WIDGET_LABELS: Record<WidgetKey, string> = {
  kpis: 'Key figures',
  monthTable: 'Monthly figures',
  monthly: 'Income vs costs by month',
  pickups: 'Pickup profitability',
  expenses: 'Running costs by type',
  categories: 'Sales by category',
  recentSales: 'Recent sales',
  locations: 'Stock by location',
  attention: 'Needs attention',
};

interface WidgetConfig {
  key: WidgetKey;
  visible: boolean;
  wide: boolean;
}

interface DashboardLayout {
  widgets: WidgetConfig[];
  kpis: KpiKey[];
}

const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { key: 'kpis', visible: true, wide: true },
    { key: 'monthTable', visible: true, wide: true },
    { key: 'monthly', visible: true, wide: false },
    { key: 'pickups', visible: true, wide: false },
    { key: 'expenses', visible: true, wide: false },
    { key: 'categories', visible: true, wide: false },
    { key: 'recentSales', visible: true, wide: false },
    { key: 'attention', visible: true, wide: false },
    { key: 'locations', visible: false, wide: false },
  ],
  kpis: ['totalIncome', 'netProfit', 'totalCosts', 'stockCost', 'runningCosts', 'stockListValue', 'soldVsList', 'heldItems'],
};

/** Layout is per device - a desktop and a laptop can be set up differently */
const LAYOUT_KEY = 'cash4stuff-dashboard-layout';

function readLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const saved = JSON.parse(raw) as DashboardLayout;
    // Add any widget introduced since the layout was saved.
    const known = new Set(saved.widgets.map((w) => w.key));
    const widgets = [...saved.widgets.filter((w) => w.key in WIDGET_LABELS), ...DEFAULT_LAYOUT.widgets.filter((w) => !known.has(w.key))];
    return { widgets, kpis: saved.kpis.filter((k) => k in KPIS) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const tooltipStyle = {
  backgroundColor: 'var(--chart-surface)',
  border: '1px solid var(--chart-grid)',
  borderRadius: 8,
  color: 'var(--chart-text)',
  fontSize: 12,
};

function MonthlyChart({ state }: { state: AppState }) {
  const data = useMemo(() => monthlySeries(state, 12).map((p) => ({ ...p, costs: p.stockCost + p.runningCosts })), [state]);
  if (data.every((d) => d.income === 0 && d.costs === 0)) return <Empty>No money in or out in the last 12 months yet.</Empty>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--chart-muted)' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--chart-muted)' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `£${v}`} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            formatter={(v) => money(Number(v))}
            labelFormatter={(label, payload) => {
              const p = payload?.[0]?.payload as { profit?: number } | undefined;
              return p?.profit !== undefined ? `${label} · profit ${money(p.profit)}` : String(label);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-text)' }} iconType="circle" iconSize={8} />
          <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="costs" name="Costs (stock + running)" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Month-by-month figures - the numbers behind the chart, plus volumes */
function MonthTable({ state, months, compact = false }: { state: AppState; months: number; compact?: boolean }) {
  const rows = useMemo(() => monthlySeries(state, months).reverse(), [state, months]);
  const sumOf = (pick: (t: Totals) => number) => rows.reduce((total, r) => total + pick(r.totals), 0);
  const cols: { label: string; value: (t: Totals) => string; total?: string; wideOnly?: boolean; tone?: (t: Totals) => string }[] = [
    { label: 'Income', value: (t) => money(t.totalIncome), total: money(sumOf((t) => t.totalIncome)) },
    { label: 'Stock', value: (t) => money(t.stockCost), total: money(sumOf((t) => t.stockCost)), wideOnly: true },
    { label: 'Running', value: (t) => money(t.runningCosts + t.saleCosts), total: money(sumOf((t) => t.runningCosts + t.saleCosts)), wideOnly: true },
    { label: 'Costs', value: (t) => money(t.totalCosts), total: money(sumOf((t) => t.totalCosts)) },
    {
      label: 'Profit',
      value: (t) => money(t.netProfit),
      total: money(sumOf((t) => t.netProfit)),
      tone: (t) => (t.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'),
    },
    { label: 'Pickups', value: (t) => (t.pickups ? `${t.pickups} · ${kg(t.kgBought)}` : '-'), wideOnly: true },
    { label: 'Added', value: (t) => String(t.itemsAdded), total: String(sumOf((t) => t.itemsAdded)), wideOnly: true },
    { label: 'Sold', value: (t) => String(t.itemsSold), total: String(sumOf((t) => t.itemsSold)) },
    { label: 'Avg sale', value: (t) => money(t.averageSalePrice), wideOnly: true },
    { label: 'Vs list', value: (t) => percent(t.soldVsList), wideOnly: true },
  ];
  const shown = cols.filter((c) => !compact || !c.wideOnly);
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-1.5">Month</th>
            {shown.map((c) => (
              <th key={c.label} className="px-2 py-1.5 text-right last:pr-4">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r.month}>
              <td className="px-4 py-1.5 font-medium">{r.label}</td>
              {shown.map((c) => (
                <td key={c.label} className={`px-2 py-1.5 text-right last:pr-4 ${c.tone?.(r.totals) ?? ''}`}>
                  {c.value(r.totals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 font-semibold tabular-nums dark:border-slate-700">
          <tr>
            <td className="px-4 py-1.5">Total</td>
            {shown.map((c) => (
              <td key={c.label} className="px-2 py-1.5 text-right last:pr-4">
                {c.total ?? ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Single-series horizontal bars as plain HTML - labels stay readable at any width */
function BarList({ rows, empty }: { rows: { label: string; value: number; sub?: string }[]; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${money(r.value)}${r.sub ? ` (${r.sub})` : ''}`}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate text-slate-700 dark:text-slate-200">
              {r.label}
              {r.sub && <span className="text-slate-500"> · {r.sub}</span>}
            </span>
            <span className="tabular-nums text-slate-900 dark:text-slate-100">{money(r.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--series-1)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PickupTable({ state, limit }: { state: AppState; limit?: number }) {
  const stats = state.pickups
    .map((p) => pickupStats(state, p))
    .sort((a, b) => b.pickup.date.localeCompare(a.pickup.date))
    .slice(0, limit);
  if (stats.length === 0) return <Empty>No pickups yet.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-1.5">Pickup</th>
            <th className="px-2 py-1.5 text-right">Cost</th>
            <th className="px-2 py-1.5 text-right">Sold</th>
            <th className="px-2 py-1.5 text-right">Profit</th>
            <th className="hidden px-4 py-1.5 text-right sm:table-cell">If rest sells</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {stats.map((s) => (
            <tr key={s.pickup.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2">
                <a className="font-medium text-slate-900 hover:underline dark:text-slate-100" href={routeHref({ name: 'pickup', id: s.pickup.id })}>
                  {s.pickup.reference}
                </a>
                <div className="text-xs text-slate-500">
                  {shortDate(s.pickup.date)} · {s.soldCount}/{s.itemCount} sold
                </div>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{money(s.totalCost)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{money(s.salesRevenue + s.otherIncome)}</td>
              <td className={`whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums ${s.realisedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {money(s.realisedProfit)}
                <div className="text-xs font-normal text-slate-500">{percent(s.roi)}</div>
              </td>
              <td className="hidden px-4 py-2 text-right tabular-nums text-slate-600 sm:table-cell dark:text-slate-300">{money(s.projectedProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentSales({ state, limit = 6 }: { state: AppState; limit?: number }) {
  const sold = state.items
    .filter((i) => i.status === 'sold')
    .sort((a, b) => (b.soldDate ?? '').localeCompare(a.soldDate ?? ''))
    .slice(0, limit);
  if (sold.length === 0) return <Empty>No sales recorded yet.</Empty>;
  return (
    <ul className="space-y-2">
      {sold.map((i) => (
        <li key={i.id}>
          <a href={routeHref({ name: 'item', id: i.id })} className="flex items-center gap-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <Photo id={i.photoId} alt={i.name} className="h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{i.name || i.category}</div>
              <div className="truncate text-xs text-slate-500">
                {i.salesChannel} · {shortDate(i.soldDate)}
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums">{money(i.soldPrice)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Attention({ state }: { state: AppState }) {
  const held = state.items.filter((i) => i.status === 'in_stock' || i.status === 'listed');
  const unpriced = held.filter((i) => i.listPrice === null).length;
  const unlisted = held.filter((i) => i.status === 'in_stock').length;
  const noPhoto = held.filter((i) => !i.photoId).length;
  const noLocation = held.filter((i) => !locationLabel(i.location)).length;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const stale = held.filter((i) => i.createdAt < ninetyDaysAgo).length;
  const rows = [
    { n: unlisted, text: 'in stock but not listed yet' },
    { n: unpriced, text: 'with no listing price' },
    { n: stale, text: 'unsold after 90+ days' },
    { n: noPhoto, text: 'with no photo' },
    { n: noLocation, text: 'with no storage location' },
  ].filter((r) => r.n > 0);
  if (rows.length === 0) return <p className="text-sm text-slate-500">All stock is priced, listed, photographed and located.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.text} className="flex items-center gap-2">
          <span className="inline-flex min-w-8 justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {r.n}
          </span>
          <span className="text-slate-700 dark:text-slate-200">items {r.text}</span>
        </li>
      ))}
      <li>
        <a href={routeHref({ name: 'stock' })} className="text-sm text-emerald-700 underline dark:text-emerald-400">
          Go to stock →
        </a>
      </li>
    </ul>
  );
}

function LocationBreakdown({ state }: { state: AppState }) {
  const byArea = new Map<string, { count: number; value: number }>();
  for (const i of state.items) {
    if (i.status !== 'in_stock' && i.status !== 'listed') continue;
    const key = [i.location.area || 'No location', i.location.rack && `Rack ${i.location.rack}`].filter(Boolean).join(' · ');
    const e = byArea.get(key) ?? { count: 0, value: 0 };
    e.count += 1;
    e.value += i.listPrice ?? 0;
    byArea.set(key, e);
  }
  const rows = [...byArea.entries()].map(([label, v]) => ({ label, value: v.value, sub: `${v.count} items` })).sort((a, b) => b.value - a.value);
  return <BarList rows={rows} empty="No stock held." />;
}

// --- Views -------------------------------------------------------------------

function PeriodSelect({ value, onChange }: { value: PeriodKey; onChange: (k: PeriodKey) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as PeriodKey)} className="w-auto" aria-label="Period">
      {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
        <option key={k} value={k}>
          {PERIOD_LABELS[k]}
        </option>
      ))}
    </Select>
  );
}

/** Phone: the handful of numbers worth a glance, and the actions done most often */
function QuickDashboard({ state }: { state: AppState }) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const t = useMemo(() => totals(state, periodFor(periodKey)), [state, periodKey]);
  const latest = [...state.pickups].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <LinkButton href={routeHref({ name: 'pickups' })} variant="primary" className="py-3">
          + New pickup
        </LinkButton>
        <LinkButton href={routeHref({ name: 'add-item', pickupId: latest?.id ?? null })} variant="primary" className="py-3">
          + Add item
        </LinkButton>
        <LinkButton href={routeHref({ name: 'stock' })} className="py-3">
          Find / sell item
        </LinkButton>
        <LinkButton href={routeHref({ name: 'money' })} className="py-3">
          + Add cost
        </LinkButton>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="whitespace-nowrap text-sm font-semibold text-slate-700 dark:text-slate-200">At a glance</h2>
        <PeriodSelect value={periodKey} onChange={setPeriodKey} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['totalIncome', 'netProfit', 'totalCosts', 'stockCost', 'stockListValue', 'heldItems'] as KpiKey[]).map((k) => (
          <KpiTile key={k} k={k} t={t} />
        ))}
      </div>

      <Card title="Monthly figures" action={<a className="text-sm text-emerald-700 underline dark:text-emerald-400" href={routeHref({ name: 'finance' })}>Finance</a>}>
        <MonthTable state={state} months={6} compact />
      </Card>

      <Card title="Latest pickups" action={<a className="text-sm text-emerald-700 underline dark:text-emerald-400" href={routeHref({ name: 'pickups' })}>All</a>}>
        <PickupTable state={state} limit={3} />
      </Card>
      <Card title="Needs attention">
        <Attention state={state} />
      </Card>
    </div>
  );
}

/** Desktop: every figure, with widgets that can be shown, hidden, reordered and resized */
function FullDashboard({ state }: { state: AppState }) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('year');
  const [layout, setLayoutState] = useState<DashboardLayout>(readLayout);
  const [customising, setCustomising] = useState(false);
  const period = periodFor(periodKey);
  const t = useMemo(() => totals(state, period), [state, period]);

  const setLayout = (next: DashboardLayout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      // Layout is a convenience - fine if it doesn't persist.
    }
  };

  const moveWidget = (index: number, delta: number) => {
    const widgets = [...layout.widgets];
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
    setLayout({ ...layout, widgets });
  };
  const patchWidget = (index: number, patch: Partial<WidgetConfig>) =>
    setLayout({ ...layout, widgets: layout.widgets.map((w, i) => (i === index ? { ...w, ...patch } : w)) });

  function renderWidget(key: WidgetKey): ReactNode {
    switch (key) {
      case 'kpis':
        return (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {layout.kpis.map((k) => (
              <KpiTile key={k} k={k} t={t} />
            ))}
          </div>
        );
      case 'monthTable':
        return <MonthTable state={state} months={12} />;
      case 'monthly':
        return <MonthlyChart state={state} />;
      case 'pickups':
        return <PickupTable state={state} limit={8} />;
      case 'expenses':
        return <BarList rows={expensesByCategory(state, period).map((c) => ({ label: c.category, value: c.amount }))} empty="No running costs in this period." />;
      case 'categories':
        return (
          <BarList
            rows={salesByCategory(state, period).map((c) => ({ label: c.category, value: c.amount, sub: `${c.count} sold` }))}
            empty="No sales in this period."
          />
        );
      case 'recentSales':
        return <RecentSales state={state} />;
      case 'locations':
        return <LocationBreakdown state={state} />;
      case 'attention':
        return <Attention state={state} />;
    }
  }

  const periodNote: Partial<Record<WidgetKey, string>> = {
    kpis: `${PERIOD_LABELS[periodKey]} · stock figures are as of now`,
    monthTable: 'Last 12 months, newest first',
    monthly: 'Last 12 months',
    pickups: 'All time, newest first',
    expenses: PERIOD_LABELS[periodKey],
    categories: PERIOD_LABELS[periodKey],
    locations: 'Unsold stock, by listed value',
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-slate-900 dark:text-slate-50">Dashboard</h1>
        <PeriodSelect value={periodKey} onChange={setPeriodKey} />
        <Button onClick={() => setCustomising((v) => !v)} variant={customising ? 'primary' : 'secondary'}>
          {customising ? 'Done' : 'Customise'}
        </Button>
      </div>

      {customising && (
        <Card className="mb-4" title="Customise dashboard" action={<Button variant="ghost" onClick={() => setLayout(DEFAULT_LAYOUT)}>Reset</Button>}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Panels</h3>
              <ul className="space-y-1">
                {layout.widgets.map((w, i) => (
                  <li key={w.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700">
                    <input type="checkbox" checked={w.visible} onChange={(e) => patchWidget(i, { visible: e.target.checked })} aria-label={`Show ${WIDGET_LABELS[w.key]}`} />
                    <span className="flex-1">{WIDGET_LABELS[w.key]}</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={w.wide} onChange={(e) => patchWidget(i, { wide: e.target.checked })} /> Full width
                    </label>
                    <Button variant="ghost" className="px-2 py-1" onClick={() => moveWidget(i, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </Button>
                    <Button variant="ghost" className="px-2 py-1" onClick={() => moveWidget(i, 1)} disabled={i === layout.widgets.length - 1} aria-label="Move down">
                      ↓
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Key figures</h3>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(KPIS) as KpiKey[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={layout.kpis.includes(k)}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          // Keep the canonical order so tiles don't jump around as they're toggled.
                          kpis: e.target.checked ? (Object.keys(KPIS) as KpiKey[]).filter((x) => x === k || layout.kpis.includes(x)) : layout.kpis.filter((x) => x !== k),
                        })
                      }
                    />
                    {KPIS[k].label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {layout.widgets
          .filter((w) => w.visible)
          .map((w) =>
            w.key === 'kpis' ? (
              <div key={w.key} className="lg:col-span-2">
                {renderWidget('kpis')}
                <p className="mt-1 text-xs text-slate-500">{periodNote.kpis}</p>
              </div>
            ) : (
              <Card
                key={w.key}
                className={w.wide ? 'lg:col-span-2' : ''}
                title={WIDGET_LABELS[w.key]}
                action={periodNote[w.key] && <span className="text-xs text-slate-500">{periodNote[w.key]}</span>}
              >
                {renderWidget(w.key)}
              </Card>
            ),
          )}
      </div>
    </div>
  );
}

export function DashboardView({ state }: { state: AppState }) {
  const isDesktop = useIsDesktop();
  return isDesktop ? <FullDashboard state={state} /> : <QuickDashboard state={state} />;
}
