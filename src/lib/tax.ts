import type { AppState, Employment, TaxExpenseBox } from './types';
import { inPeriod, isSold, pence, pickupStockCost, type Period } from './calc';

/**
 * Self-assessment helpers for a sole trader using the cash basis (the
 * default for sole traders since 2024/25): income counts when it's received
 * and costs when they're paid, so stock counts as a cost when it's bought,
 * not when it sells.
 *
 * Rest-of-UK (England, Wales, Northern Ireland) rates only - Scotland has
 * its own income tax bands. Thresholds are frozen until April 2031
 * (November 2025 Budget), so years from 2024/25 on share one set of figures.
 * This is an estimate to plan and fill in the return with, not advice.
 */

export const EXPENSE_BOX_LABELS: Record<TaxExpenseBox, string> = {
  goods: 'Cost of goods bought for resale or goods used',
  travel: 'Car, van and travel expenses',
  staff: 'Wages, salaries and other staff costs',
  premises: 'Rent, rates, power and insurance costs',
  repairs: 'Repairs and maintenance of property and equipment',
  office: 'Phone, fax, stationery and other office costs',
  advertising: 'Advertising and business entertainment costs',
  interest: 'Interest on bank and other loans',
  financial: 'Bank, credit card and other financial charges',
  professional: 'Accountancy, legal and other professional fees',
  other: 'Other allowable business expenses',
  not_allowable: 'Not allowable (excluded)',
};

export interface TaxRates {
  personalAllowance: number;
  /** Personal allowance falls by £1 for every £2 of income over this */
  taperThreshold: number;
  basicBand: number;
  additionalThreshold: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
  class4LowerLimit: number;
  class4UpperLimit: number;
  class4MainRate: number;
  class4UpperRate: number;
  tradingAllowance: number;
}

/** 2024/25 onwards (Class 4 main rate cut to 6% from 6 April 2024; Class 2 no longer compulsory) */
export const RATES: TaxRates = {
  personalAllowance: 12570,
  taperThreshold: 100000,
  basicBand: 37700,
  additionalThreshold: 125140,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  class4LowerLimit: 12570,
  class4UpperLimit: 50270,
  class4MainRate: 0.06,
  class4UpperRate: 0.02,
  tradingAllowance: 1000,
};

export interface TaxYear {
  /** e.g. "2025-26" */
  id: string;
  /** e.g. "2025/26" */
  label: string;
  period: Period;
  /** 31 January after the year ends - filing and balancing payment deadline */
  dueDate: string;
}

export function taxYear(startYear: number): TaxYear {
  const end = startYear + 1;
  return {
    id: `${startYear}-${String(end).slice(-2)}`,
    label: `${startYear}/${String(end).slice(-2)}`,
    period: { from: `${startYear}-04-06`, to: `${end}-04-05` },
    dueDate: `${end + 1}-01-31`,
  };
}

export function taxYearStartFor(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4));
  return isoDate.slice(5, 10) >= '04-06' ? year : year - 1;
}

/** Tax years with any activity, plus the current one, newest first */
export function taxYearsWithData(state: AppState, today: string): TaxYear[] {
  const starts = new Set<number>([taxYearStartFor(today)]);
  const add = (d: string | null) => d && starts.add(taxYearStartFor(d));
  state.pickups.forEach((p) => add(p.date));
  state.expenses.forEach((e) => add(e.date));
  state.otherIncome.forEach((o) => add(o.date));
  state.items.forEach((i) => add(i.soldDate));
  state.employments.forEach((e) => starts.add(Number(e.taxYear.slice(0, 4))));
  return [...starts].filter((y) => y >= 2000).sort((a, b) => b - a).map(taxYear);
}

export interface ExpenseLine {
  box: TaxExpenseBox;
  label: string;
  amount: number;
}

export interface TradingSummary {
  salesIncome: number;
  otherIncome: number;
  /** Total business income (turnover) */
  turnover: number;
  expenses: ExpenseLine[];
  /** Allowable expenses (excludes "not allowable") */
  totalExpenses: number;
  /** Turnover minus actual expenses - can be negative */
  profitActual: number;
  /** Turnover minus the £1,000 trading allowance, never below zero */
  profitWithAllowance: number;
  /** The allowance gives a lower taxable profit than actual expenses */
  allowanceIsBetter: boolean;
  itemsSold: number;
  pickups: number;
}

export function tradingSummary(state: AppState, year: TaxYear, rates = RATES): TradingSummary {
  const period = year.period;
  const sold = state.items.filter((i) => isSold(i) && inPeriod(i.soldDate, period));
  const salesIncome = pence(sold.reduce((t, i) => t + (i.soldPrice ?? 0), 0));
  const otherIncome = pence(state.otherIncome.filter((o) => inPeriod(o.date, period)).reduce((t, o) => t + o.amount, 0));
  const turnover = pence(salesIncome + otherIncome);

  const byBox = new Map<TaxExpenseBox, number>();
  const addTo = (box: TaxExpenseBox, amount: number) => byBox.set(box, (byBox.get(box) ?? 0) + amount);
  const pickups = state.pickups.filter((p) => inPeriod(p.date, period));
  for (const p of pickups) addTo('goods', pickupStockCost(p, state.settings));
  for (const e of state.expenses) {
    if (inPeriod(e.date, period)) addTo(state.settings.expenseTaxBoxes[e.category] ?? 'other', e.amount);
  }
  // Selling-site fees and postage recorded against individual sales.
  const saleCosts = sold.reduce((t, i) => t + i.saleCosts, 0);
  if (saleCosts) addTo('other', saleCosts);

  const expenses = (Object.keys(EXPENSE_BOX_LABELS) as TaxExpenseBox[])
    .filter((box) => byBox.has(box))
    .map((box) => ({ box, label: EXPENSE_BOX_LABELS[box], amount: pence(byBox.get(box) ?? 0) }));
  const totalExpenses = pence(expenses.filter((e) => e.box !== 'not_allowable').reduce((t, e) => t + e.amount, 0));
  const profitActual = pence(turnover - totalExpenses);
  const profitWithAllowance = pence(Math.max(0, turnover - rates.tradingAllowance));
  return {
    salesIncome,
    otherIncome,
    turnover,
    expenses,
    totalExpenses,
    profitActual,
    profitWithAllowance,
    allowanceIsBetter: profitWithAllowance < profitActual,
    itemsSold: sold.length,
    pickups: pickups.length,
  };
}

export function personalAllowance(totalIncome: number, rates = RATES): number {
  const reduction = Math.max(0, totalIncome - rates.taperThreshold) / 2;
  return Math.max(0, rates.personalAllowance - reduction);
}

/** Income tax on non-savings income (pay + trading profit) */
export function incomeTax(totalIncome: number, rates = RATES): number {
  const allowance = personalAllowance(totalIncome, rates);
  const taxable = Math.max(0, totalIncome - allowance);
  const basic = Math.min(taxable, rates.basicBand);
  // The additional-rate threshold is on gross income, so the higher band ends where it starts.
  const higherBandTop = Math.max(rates.basicBand, rates.additionalThreshold - allowance);
  const higher = Math.max(0, Math.min(taxable, higherBandTop) - rates.basicBand);
  const additional = Math.max(0, taxable - higherBandTop);
  return pence(basic * rates.basicRate + higher * rates.higherRate + additional * rates.additionalRate);
}

export function class4(profit: number, rates = RATES): number {
  const main = Math.max(0, Math.min(profit, rates.class4UpperLimit) - rates.class4LowerLimit);
  const upper = Math.max(0, profit - rates.class4UpperLimit);
  return pence(main * rates.class4MainRate + upper * rates.class4UpperRate);
}

export interface TaxEstimate {
  employmentPay: number;
  employmentTaxPaid: number;
  /** Taxable trading profit used (the better of actual expenses / trading allowance) */
  tradingProfit: number;
  usesTradingAllowance: boolean;
  totalIncome: number;
  personalAllowance: number;
  incomeTax: number;
  class4: number;
  /** Income tax + Class 4 */
  totalLiability: number;
  /** Still owed after PAYE (negative = refund due) */
  balanceDue: number;
  /** Extra tax caused by the business: liability with it minus liability on pay alone */
  taxOnBusiness: number;
  /** Whether payments on account would be due for the next year */
  paymentsOnAccountLikely: boolean;
  /** Each payment on account (31 Jan and 31 Jul) if they apply */
  paymentOnAccount: number;
}

export function taxEstimate(trading: TradingSummary, employments: Employment[], rates = RATES): TaxEstimate {
  const employmentPay = pence(employments.reduce((t, e) => t + e.grossPay, 0));
  const employmentTaxPaid = pence(employments.reduce((t, e) => t + e.taxPaid, 0));
  const usesTradingAllowance = trading.allowanceIsBetter;
  const tradingProfit = Math.max(0, usesTradingAllowance ? trading.profitWithAllowance : trading.profitActual);
  const totalIncome = pence(employmentPay + tradingProfit);
  const tax = incomeTax(totalIncome, rates);
  const nic = class4(tradingProfit, rates);
  const totalLiability = pence(tax + nic);
  const balanceDue = pence(totalLiability - employmentTaxPaid);
  // HMRC asks for payments on account when the bill not collected at source is
  // over £1,000 and less than 80% of the total was collected at source.
  const paymentsOnAccountLikely = balanceDue > 1000 && employmentTaxPaid < totalLiability * 0.8;
  return {
    employmentPay,
    employmentTaxPaid,
    tradingProfit,
    usesTradingAllowance,
    totalIncome,
    personalAllowance: personalAllowance(totalIncome, rates),
    incomeTax: tax,
    class4: nic,
    totalLiability,
    balanceDue,
    taxOnBusiness: pence(totalLiability - incomeTax(employmentPay, rates)),
    paymentsOnAccountLikely,
    paymentOnAccount: paymentsOnAccountLikely ? pence(balanceDue / 2) : 0,
  };
}

/** Making Tax Digital for Income Tax starts by turnover (self-employment + property) */
export function mtdNote(turnover: number): string | null {
  if (turnover > 50000) return 'Turnover over £50,000: Making Tax Digital (quarterly digital updates) applies from April 2026.';
  if (turnover > 30000) return 'Turnover over £30,000: Making Tax Digital (quarterly digital updates) applies from April 2027.';
  if (turnover > 20000) return 'Turnover over £20,000: Making Tax Digital (quarterly digital updates) is due to apply from April 2028.';
  return null;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Every money movement in the tax year, for an accountant or for checking the return */
export function taxYearLedgerCsv(state: AppState, year: TaxYear): string {
  const p = year.period;
  const rows: (string | number)[][] = [];
  const pickups = new Map(state.pickups.map((x) => [x.id, x]));
  for (const i of state.items) {
    if (!isSold(i) || !inPeriod(i.soldDate, p)) continue;
    rows.push([i.soldDate ?? '', 'Income', 'Sale', `${i.name || i.category}${i.salesChannel ? ` (${i.salesChannel})` : ''}`, i.soldPrice ?? 0, i.pickupId ? (pickups.get(i.pickupId)?.reference ?? '') : '']);
    if (i.saleCosts) rows.push([i.soldDate ?? '', 'Expense', EXPENSE_BOX_LABELS.other, `Fees/postage on ${i.name || i.category}`, -i.saleCosts, '']);
  }
  for (const o of state.otherIncome) if (inPeriod(o.date, p)) rows.push([o.date, 'Income', 'Other business income', o.description, o.amount, '']);
  for (const x of state.pickups) if (inPeriod(x.date, p)) rows.push([x.date, 'Expense', EXPENSE_BOX_LABELS.goods, `Pickup: ${x.reference} (${x.weightKg} kg)`, -pickupStockCost(x, state.settings), x.reference]);
  for (const e of state.expenses) {
    if (!inPeriod(e.date, p)) continue;
    const box = state.settings.expenseTaxBoxes[e.category] ?? 'other';
    rows.push([e.date, 'Expense', EXPENSE_BOX_LABELS[box], [e.category, e.description].filter(Boolean).join(': '), -e.amount, e.pickupId ? (pickups.get(e.pickupId)?.reference ?? '') : '']);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [['Date', 'Type', 'Tax heading', 'Description', 'Amount (£)', 'Pickup'], ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
