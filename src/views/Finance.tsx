import { useMemo, useState } from 'react';
import type { AppState, TaxExpenseBox } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { money, parseNumber, percent, shortDate } from '../lib/format';
import { downloadText, todayIso } from '../lib/storage';
import { EXPENSE_BOX_LABELS, RATES, mtdNote, taxEstimate, taxYearLedgerCsv, taxYearsWithData, tradingSummary } from '../lib/tax';
import { Button, Card, Field, Input, PageHeader, Select, Stat } from '../components/ui';

function Row({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? 'font-semibold' : ''} ${muted ? 'text-slate-500' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function FinanceView({ state, actions }: { state: AppState; actions: AppActions }) {
  const today = todayIso();
  const years = useMemo(() => taxYearsWithData(state, today), [state, today]);
  const [yearId, setYearId] = useState(years[0].id);
  const year = years.find((y) => y.id === yearId) ?? years[0];

  const trading = useMemo(() => tradingSummary(state, year), [state, year]);
  const employments = state.employments.filter((e) => e.taxYear === year.id);
  const estimate = taxEstimate(trading, employments);
  const mtd = mtdNote(trading.turnover);

  const [employer, setEmployer] = useState('');
  const [grossPay, setGrossPay] = useState('');
  const [taxPaid, setTaxPaid] = useState('');
  const [showMapping, setShowMapping] = useState(false);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Finance & tax"
        actions={
          <>
            <Select value={year.id} onChange={(e) => setYearId(e.target.value)} className="w-auto" aria-label="Tax year">
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  Tax year {y.label}
                </option>
              ))}
            </Select>
            <Button onClick={() => downloadText(`cash4stuff-ledger-${year.id}.csv`, taxYearLedgerCsv(state, year), 'text/csv')}>Export ledger CSV</Button>
            <Button onClick={() => window.print()}>Print</Button>
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-slate-500">
        {shortDate(year.period.from)} - {shortDate(year.period.to)} · return and any balance due by {shortDate(year.dueDate)}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Business turnover" value={money(trading.turnover)} sub={`${trading.itemsSold} items sold`} />
        <Stat label="Allowable expenses" value={money(trading.totalExpenses)} sub={`incl. ${trading.pickups} pickups`} />
        <Stat label="Taxable profit" value={money(estimate.tradingProfit)} sub={estimate.usesTradingAllowance ? 'using £1,000 trading allowance' : 'using actual expenses'} />
        <Stat
          label={estimate.balanceDue >= 0 ? 'Estimated tax to pay' : 'Estimated refund'}
          value={money(Math.abs(estimate.balanceDue))}
          sub={`by ${shortDate(year.dueDate)}`}
          tone={estimate.balanceDue > 0 ? 'bad' : 'good'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Self-employment (SA103) figures">
          <p className="mb-2 text-xs text-slate-500">
            Cash basis: sales count when sold, stock counts when paid for. These are the headings on the self-employment pages of the return.
          </p>
          <Row label="Sales" value={money(trading.salesIncome)} />
          {trading.otherIncome > 0 && <Row label="Other business income" value={money(trading.otherIncome)} />}
          <Row label="Turnover" value={money(trading.turnover)} strong />
          <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
          {trading.expenses.length === 0 && <Row label="No expenses in this tax year" value="-" muted />}
          {trading.expenses.map((e) => (
            <Row key={e.box} label={e.label} value={money(e.amount)} muted={e.box === 'not_allowable'} />
          ))}
          <Row label="Total allowable expenses" value={money(trading.totalExpenses)} strong />
          <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
          <Row label={trading.profitActual >= 0 ? 'Net profit' : 'Net loss'} value={money(trading.profitActual)} strong />
          <div className={`mt-3 rounded-lg p-3 text-sm ${trading.allowanceIsBetter ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {trading.allowanceIsBetter ? (
              <>
                <strong>Claim the £1,000 trading allowance instead of expenses.</strong> It gives a taxable profit of {money(trading.profitWithAllowance)} instead of{' '}
                {money(trading.profitActual)}. You can't claim both.
              </>
            ) : (
              <>Actual expenses beat the £1,000 trading allowance this year, so claim expenses.</>
            )}
          </div>
          <button type="button" className="mt-3 text-sm text-emerald-700 underline dark:text-emerald-400" onClick={() => setShowMapping((v) => !v)}>
            {showMapping ? 'Hide' : 'Change'} which heading each cost type goes under
          </button>
          {showMapping && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Pickups always go under "{EXPENSE_BOX_LABELS.goods}"; fees/postage recorded on sales go under "{EXPENSE_BOX_LABELS.other}".</p>
              {state.settings.expenseCategories.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 truncate">{cat}</span>
                  <Select
                    value={state.settings.expenseTaxBoxes[cat] ?? 'other'}
                    onChange={(e) =>
                      actions.updateSettings({
                        ...state.settings,
                        expenseTaxBoxes: { ...state.settings.expenseTaxBoxes, [cat]: e.target.value as TaxExpenseBox },
                      })
                    }
                    className="py-1 text-sm"
                  >
                    {(Object.keys(EXPENSE_BOX_LABELS) as TaxExpenseBox[]).map((box) => (
                      <option key={box} value={box}>
                        {EXPENSE_BOX_LABELS[box]}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Employment income this tax year">
            <p className="mb-3 text-xs text-slate-500">From each job's P60 (or P45 if you left). Used only for the tax estimate - it isn't business income.</p>
            {employments.length > 0 && (
              <ul className="mb-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {employments.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-1.5">
                    <span className="flex-1">{e.employer || 'Employment'}</span>
                    <span className="tabular-nums">{money(e.grossPay)}</span>
                    <span className="w-24 text-right tabular-nums text-slate-500">tax {money(e.taxPaid)}</span>
                    <button type="button" className="text-slate-400 hover:text-rose-600" aria-label="Remove" onClick={() => actions.deleteEmployment(e.id)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                const pay = parseNumber(grossPay);
                if (pay === null) return;
                actions.saveEmployment({ taxYear: year.id, employer: employer.trim(), grossPay: pay, taxPaid: parseNumber(taxPaid) ?? 0 });
                setEmployer('');
                setGrossPay('');
                setTaxPaid('');
              }}
            >
              <Field label="Employer" className="col-span-2 sm:col-span-1">
                <Input value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="e.g. Tesco" aria-label="Employer" />
              </Field>
              <Field label="Pay (£)">
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={grossPay} onChange={(e) => setGrossPay(e.target.value)} required />
              </Field>
              <Field label="Tax paid (£)">
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={taxPaid} onChange={(e) => setTaxPaid(e.target.value)} />
              </Field>
              <Button type="submit" className="self-end">
                Add job
              </Button>
            </form>
          </Card>

          <Card title="Estimated tax for the year">
            <Row label="Employment pay" value={money(estimate.employmentPay)} />
            <Row label="Taxable business profit" value={money(estimate.tradingProfit)} />
            <Row label="Total income" value={money(estimate.totalIncome)} strong />
            <Row label="Personal allowance" value={money(estimate.personalAllowance)} muted />
            <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
            <Row label="Income tax" value={money(estimate.incomeTax)} />
            <Row label={`Class 4 National Insurance (${percent(RATES.class4MainRate)} above ${money(RATES.class4LowerLimit)})`} value={money(estimate.class4)} />
            <Row label="Total tax" value={money(estimate.totalLiability)} strong />
            <Row label="Already paid through PAYE" value={`- ${money(estimate.employmentTaxPaid)}`} muted />
            <Row label={estimate.balanceDue >= 0 ? `To pay by ${shortDate(year.dueDate)}` : 'Refund due (estimate)'} value={money(Math.abs(estimate.balanceDue))} strong />
            {estimate.paymentsOnAccountLikely && (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                HMRC will probably also ask for payments on account towards next year: about {money(estimate.paymentOnAccount)} on {shortDate(year.dueDate)} (on top of
                the above) and again on 31 Jul.
              </p>
            )}
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              The business adds about <strong>{money(estimate.taxOnBusiness)}</strong> to your tax bill this year - worth setting aside.
            </p>
          </Card>
        </div>
      </div>

      <Card title="Good to know" className="mt-4">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>An estimate for England, Wales and Northern Ireland rates - Scotland's income tax bands differ. Losses and other income (savings, dividends, property) aren't included.</li>
          <li>If turnover is £1,000 or less and you claim the trading allowance, you may not need to register for self assessment for the business at all.</li>
          <li>Selling sites (Vinted, eBay, Depop…) send HMRC details of sellers with 30+ sales or about £1,700+ of sales in a calendar year - make sure the turnover here matches.</li>
          {mtd && <li>{mtd}</li>}
          <li>Keep records (this app's data and the ledger export) for at least 5 years after the 31 January filing deadline.</li>
        </ul>
      </Card>
    </div>
  );
}
