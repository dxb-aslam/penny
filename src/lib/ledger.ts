// Penny — transaction ledger: filtering, ranges, summaries, and NL→filter normalization.
import { CATS, CAT_IDS, allAccounts, findAccount } from './data';
import type { CategoryId, CurrencyCode, LedgerFilters, PeriodPreset, RawLedgerFilters, Txn } from './types';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'This month',
  last_month: 'Last month',
  '3m': 'Last 90 days',
  year: 'This year',
  all: 'All time',
};

/** Resolve a filter set to a [from, to] epoch-ms window (Infinity bounds = open). */
export function resolveRange(f: LedgerFilters): { from: number; to: number } {
  if (f.from != null || f.to != null) {
    return { from: f.from ?? 0, to: f.to ?? Number.MAX_SAFE_INTEGER };
  }
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (f.preset) {
    case 'today':
      return { from: startOfDay, to: Number.MAX_SAFE_INTEGER };
    case 'week':
      return { from: startOfDay - 6 * 86400000, to: Number.MAX_SAFE_INTEGER };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Number.MAX_SAFE_INTEGER };
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const to = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
      return { from, to };
    }
    case '3m':
      return { from: startOfDay - 89 * 86400000, to: Number.MAX_SAFE_INTEGER };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: Number.MAX_SAFE_INTEGER };
    case 'all':
    default:
      return { from: 0, to: Number.MAX_SAFE_INTEGER };
  }
}

export function applyFilters(txns: Txn[], f: LedgerFilters): Txn[] {
  const { from, to } = resolveRange(f);
  const accts = f.accounts && f.accounts.length ? new Set(f.accounts) : null;
  const cats = f.categories && f.categories.length ? new Set<string>(f.categories) : null;
  return txns
    .filter((t) => {
      if (t.ts < from || t.ts > to) return false;
      // a transfer belongs to either the source or the destination account
      if (accts && !accts.has(t.account) && !(t.transfer && t.counterAccount && accts.has(t.counterAccount))) return false;
      if (cats && !cats.has(t.cat)) return false;
      if (f.type === 'in' && !t.income && !t.transfer) return false;
      if (f.type === 'out' && t.income) return false;
      return true;
    })
    .sort((a, b) => b.ts - a.ts);
}

export interface LedgerSummary {
  inAED: number;
  outAED: number;
  net: number;
  count: number;
}

export interface CatTotal {
  cat: CategoryId;
  total: number;
}

/** Spending total per category within a set (descending), for the ledger breakdown. */
export function categoryBreakdown(txns: Txn[]): CatTotal[] {
  const m = new Map<CategoryId, number>();
  for (const t of txns) {
    if (t.income || t.transfer) continue;
    m.set(t.cat, (m.get(t.cat) || 0) + t.amount);
  }
  return [...m.entries()]
    .map(([cat, total]) => ({ cat, total }))
    .sort((a, b) => b.total - a.total);
}

export function summarize(txns: Txn[]): LedgerSummary {
  let inAED = 0;
  let outAED = 0;
  for (const t of txns) {
    if (t.transfer) continue; // internal moves don't count as spend/income
    if (t.income) inAED += t.amount;
    else outAED += t.amount;
  }
  return { inAED, outAED, net: inAED - outAED, count: txns.length };
}

/** Map Claude's raw filter object to a validated LedgerFilters (ids checked, ISO dates → ms). */
export function normalizeFilters(raw: RawLedgerFilters | null | undefined): LedgerFilters {
  if (!raw) return { preset: 'all', type: 'all' };
  const validAccts = new Set(allAccounts().map((a) => a.id));
  const accounts = (raw.accounts || []).filter((id) => validAccts.has(id));
  const categories = (raw.categories || []).filter((c): c is CategoryId => (CAT_IDS as string[]).includes(c));
  const parseDate = (s?: string): number | undefined => {
    if (!s) return undefined;
    const ms = Date.parse(s);
    return isNaN(ms) ? undefined : ms;
  };
  const from = parseDate(raw.from);
  const to = parseDate(raw.to);
  const f: LedgerFilters = {
    accounts: accounts.length ? accounts : undefined,
    categories: categories.length ? categories : undefined,
    type: raw.type || 'all',
  };
  if (from != null || to != null) {
    f.from = from;
    f.to = to;
  } else {
    f.preset = raw.period || 'all';
  }
  return f;
}

/** Human-readable description of an active filter set (for the ledger header + Penny's reply). */
export function describeFilters(f: LedgerFilters, currency: CurrencyCode): string {
  const parts: string[] = [];
  if (f.type === 'in') parts.push('income');
  else if (f.type === 'out') parts.push('spending');
  if (f.categories && f.categories.length) {
    parts.push(f.categories.map((c) => CATS[c]?.label || c).join(' + '));
  }
  if (f.accounts && f.accounts.length) {
    const names = f.accounts.map((id) => findAccount(id)?.name.split(' ')[0] || id);
    parts.push('on ' + names.join(' + '));
  }
  if (f.from != null || f.to != null) {
    const d = (ms?: number) => (ms != null ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '…');
    parts.push(`${d(f.from)} – ${d(f.to)}`);
  } else if (f.preset && f.preset !== 'all') {
    parts.push(PERIOD_LABELS[f.preset].toLowerCase());
  }
  void currency;
  if (!parts.length) return 'All time';
  return parts.join(' · ');
}

export function isFiltered(f: LedgerFilters): boolean {
  return !!(
    (f.accounts && f.accounts.length) ||
    (f.categories && f.categories.length) ||
    (f.type && f.type !== 'all') ||
    (f.preset && f.preset !== 'all') ||
    f.from != null ||
    f.to != null
  );
}
