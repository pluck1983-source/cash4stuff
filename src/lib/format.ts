const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const gbpWhole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return gbp.format(value);
}

/** Compact money for big dashboard figures - pence dropped once it's over £1,000 */
export function moneyShort(value: number): string {
  return Math.abs(value) >= 1000 ? gbpWhole.format(value) : gbp.format(value);
}

export function kg(value: number): string {
  return `${Number(value.toFixed(2))} kg`;
}

export function percent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value * 100)}%`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Parses a money/weight input; empty means null */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[£,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
