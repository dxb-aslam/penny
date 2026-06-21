// Penny — seed data, categories, currency + persistence helpers (ported from prototype)
import type {
  Account,
  Category,
  CategoryId,
  CategoryNode,
  CreditLine,
  Currency,
  CurrencyCode,
  Emi,
  GroceryItem,
  Sub,
  Txn,
  TxnTag,
} from './types';

export const CATS: Record<CategoryId, Category> = {
  food: { label: 'Food & drink', color: '#C98B2D', tint: '#F4E7CC', icon: 'cup' },
  groceries: { label: 'Groceries', color: '#5F7F50', tint: '#E5ECDB', icon: 'basket' },
  transport: { label: 'Transport', color: '#4E7A8A', tint: '#DEEAEE', icon: 'car' },
  shopping: { label: 'Shopping', color: '#D96845', tint: '#F8E2D8', icon: 'bag' },
  bills: { label: 'Bills & utilities', color: '#8A6FB1', tint: '#EAE3F2', icon: 'bolt' },
  subs: { label: 'Subscriptions', color: '#B65C7E', tint: '#F4DFE7', icon: 'loop' },
  health: { label: 'Health', color: '#4F8F7B', tint: '#DFEDE8', icon: 'heart' },
  home: { label: 'Home & rent', color: '#A8793C', tint: '#F0E5D2', icon: 'house' },
  fun: { label: 'Fun & leisure', color: '#C2702E', tint: '#F5E4D0', icon: 'spark' },
  income: { label: 'Income', color: '#46613A', tint: '#E5ECDB', icon: 'arrowdown' },
  other: { label: 'Other', color: '#968D7D', tint: '#EFE8D8', icon: 'dots' },
};

export const CAT_IDS = Object.keys(CATS) as CategoryId[];

// ---- Editable category → subcategory tree ----
// Defaults are seeded from CATS with a few sensible subcategories; the whole tree
// is then user-editable and stored as one doc ('catTree', synced across devices).
const DEFAULT_SUBS: Record<string, string[]> = {
  food: ['Dining out', 'Coffee & snacks', 'Takeaway', 'Dessert'],
  groceries: ['Supermarket', 'Fruit & veg', 'Butcher', 'Bakery'],
  transport: ['Fuel', 'Taxi & ride-hail', 'Parking', 'Salik / tolls', 'Public transport'],
  shopping: ['Clothing', 'Electronics', 'Household', 'Gifts'],
  bills: ['Electricity & water', 'Internet', 'Mobile', 'Insurance'],
  subs: ['Streaming', 'Music', 'Cloud storage', 'Software'],
  health: ['Pharmacy', 'Doctor', 'Gym', 'Dental'],
  home: ['Rent', 'Maintenance', 'Furniture'],
  fun: ['Cinema', 'Travel', 'Events', 'Hobbies'],
  income: ['Salary', 'Business', 'Reimbursement', 'Gift'],
  other: [],
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}

export function defaultCatTree(): CategoryNode[] {
  return CAT_IDS.map((id) => ({
    id,
    label: CATS[id].label,
    color: CATS[id].color,
    tint: CATS[id].tint,
    icon: CATS[id].icon,
    subs: (DEFAULT_SUBS[id] || []).map((label) => ({ id: id + ':' + slug(label), label })),
  }));
}

export function readCatTree(): CategoryNode[] {
  const saved = LS.read<CategoryNode[] | null>('catTree', null);
  if (saved && Array.isArray(saved) && saved.length) return saved;
  return defaultCatTree();
}

export function writeCatTree(tree: CategoryNode[]): void {
  LS.write('catTree', tree);
}

/** Style for any category id, including custom ones (falls back to "other"). */
export function catStyle(id: string): Category {
  if ((CATS as Record<string, Category>)[id]) return (CATS as Record<string, Category>)[id];
  const node = readCatTree().find((c) => c.id === id);
  if (node) return { label: node.label, color: node.color, tint: node.tint, icon: node.icon };
  return CATS.other;
}

export function catLabel(id: string): string {
  return catStyle(id).label;
}

export function subLabel(catId: string, subId?: string): string | undefined {
  if (!subId) return undefined;
  return readCatTree().find((c) => c.id === catId)?.subs.find((s) => s.id === subId)?.label;
}

export function newSubId(catId: string, label: string): string {
  return catId + ':' + slug(label) + '-' + Math.random().toString(36).slice(2, 6);
}

export function newCatId(label: string): string {
  return 'cat-' + slug(label) + '-' + Math.random().toString(36).slice(2, 6);
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  AED: { sym: 'AED', rate: 1, dp: 0 },
  USD: { sym: '$', rate: 0.2723, dp: 0 },
  EUR: { sym: '€', rate: 0.2519, dp: 0 },
  INR: { sym: '₹', rate: 22.76, dp: 0 },
};

// No demo seed data — Penny always starts empty; the user adds their own
// accounts (with an opening-balance entry) and logs live transactions.
export const ACCOUNTS: Account[] = [];

export const USER_ACCT_BGS: [string, string][] = [
  ['linear-gradient(135deg, #3F4A3A, #6B8A5A)', '#EDF2E2'],
  ['linear-gradient(135deg, #5C4630, #C98B2D)', '#F5EDDC'],
  ['linear-gradient(135deg, #5A3A30, #D96845)', '#F8E9E2'],
];

const SEED_TXNS: Txn[] = [];

export const EMIS: Emi[] = [];

export const SUBS: Sub[] = [];

export const GROCERY: GroceryItem[] = [];

export const INCOME_MO = 18500;
export const BUDGET_MO = 9000;

/** Normalize an item name to a master-catalog key. */
export function normItem(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export const HISTORY = {
  groceriesByMonth: [
    { m: 'Jan', v: 1240 }, { m: 'Feb', v: 1186 }, { m: 'Mar', v: 1071 },
    { m: 'Apr', v: 988 }, { m: 'May', v: 924 }, { m: 'Jun', v: 612, partial: true },
  ],
  groceriesLastWeek: { total: 301, detail: 'Spinneys 86.40 + Carrefour 214.80', vsAvg: -0.18 },
  spendByMonth: [
    { m: 'Jan', v: 9340 }, { m: 'Feb', v: 8920 }, { m: 'Mar', v: 9105 },
    { m: 'Apr', v: 8610 }, { m: 'May', v: 8290 }, { m: 'Jun', v: 5692, partial: true },
  ],
};

// ---- persistence (namespaced; never clears foreign keys) ----
// A single write-hook lets the sync engine (lib/sync.ts) observe every local
// mutation and push it to Supabase, without threading sync through every caller.
let lsWriteHook: ((key: string, value: unknown) => void) | null = null;
let lsSilent = false;
export function onLSWrite(fn: ((key: string, value: unknown) => void) | null): void {
  lsWriteHook = fn;
}
/** Apply a write WITHOUT notifying the sync hook (used when applying a remote change). */
export function lsWriteSilent(k: string, v: unknown): void {
  lsSilent = true;
  try {
    LS.write(k, v);
  } finally {
    lsSilent = false;
  }
}
export const LS = {
  read<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem('penny.' + k);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(k: string, v: unknown) {
    try {
      localStorage.setItem('penny.' + k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
    if (!lsSilent && lsWriteHook) {
      try {
        lsWriteHook(k, v);
      } catch {
        /* never let sync break a local write */
      }
    }
  },
};

export function todayAt(daysAgo: number): number {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.round(
    (+new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
      +new Date(d.getFullYear(), d.getMonth(), d.getDate())) /
      86400000,
  );
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmt(aed: number, cur?: CurrencyCode, opts?: { dp?: number }): string {
  const c = CURRENCIES[cur || 'AED'] || CURRENCIES.AED;
  const v = aed * c.rate;
  const dp = opts && opts.dp != null ? opts.dp : Math.abs(v) < 100 && v % 1 !== 0 ? 2 : c.dp;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (v < 0 ? '−' : '') + (c.sym === 'AED' ? s + ' AED' : c.sym + s);
}

export interface NecLevel {
  key: 'ess' | 'ok' | 'imp';
  label: string;
  color: string;
  deep: string;
  tint: string;
}

export function necLevel(n: number): NecLevel {
  if (n >= 8) return { key: 'ess', label: 'Essential', color: 'var(--sage)', deep: 'var(--sage-deep)', tint: 'var(--sage-tint)' };
  if (n >= 5) return { key: 'ok', label: 'Reasonable', color: 'var(--amber)', deep: 'var(--amber-deep)', tint: 'var(--amber-tint)' };
  return { key: 'imp', label: 'Impulse', color: 'var(--coral)', deep: 'var(--coral-deep)', tint: 'var(--coral-tint)' };
}

export const seedTxns: Txn[] = SEED_TXNS.map((t) => ({ ...t, ts: todayAt(t.d ?? 0) }));

/**
 * Money direction of a transaction. In an account context (accountId given), a
 * transfer is "out" from its source and "in" to its destination; without a
 * context, a transfer is neutral (shown as an internal move). Non-transfers are
 * "in" when income, else "out".
 */
/** Signed balance an account derives from its transactions (incl. its opening entry). */
export function accountBalanceFromTxns(id: string, txns: Txn[]): number {
  let bal = 0;
  for (const t of txns) {
    if (t.transfer) {
      if (t.counterAccount === id) bal += t.amount;
      else if (t.account === id) bal -= t.amount;
    } else if (t.account === id) {
      bal += t.income ? t.amount : -t.amount;
    }
  }
  return bal;
}

/** All transactions merged from storage (user + seed − removed, with overrides). */
export function allTxns(): Txn[] {
  const user = LS.read<Txn[]>('userTxns', []);
  const overrides = LS.read<Record<string, Partial<Txn>>>('txnOverrides', {});
  const removed = new Set(LS.read<string[]>('removedTxns', []));
  const seed = demoOff() ? [] : seedTxns;
  return [...user, ...seed].filter((t) => !removed.has(t.id)).map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t));
}

/**
 * Effective credit-card due date. Prefers a statement-day + days-after rule
 * (counted on 30-day months), else a fixed dueDate. Returns the next occurrence.
 */
export function cardDue(a: Account, now = Date.now()): { dayOfMonth: number; date: Date; inDays: number; label: string } | null {
  const base = new Date(now);
  const todayMid = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (a.statementDay && a.dueDays != null) {
    const D = (((a.statementDay + a.dueDays - 1) % 30) + 30) % 30 + 1; // 1–30, 30-day months
    let target = new Date(base.getFullYear(), base.getMonth(), D);
    if (target < todayMid) target = new Date(base.getFullYear(), base.getMonth() + 1, D);
    const inDays = Math.round((target.getTime() - todayMid.getTime()) / 86400000);
    return { dayOfMonth: D, date: target, inDays, label: `Due ~${ordinal(D)}` };
  }
  if (a.dueDate) {
    const t = Date.parse(a.dueDate);
    if (!isNaN(t)) {
      const d = new Date(t);
      const inDays = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - todayMid.getTime()) / 86400000);
      return { dayOfMonth: d.getDate(), date: d, inDays, label: `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` };
    }
  }
  return null;
}
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function txnDir(t: Txn, accountId?: string): 'in' | 'out' | 'transfer' {
  if (t.transfer) {
    if (accountId && t.counterAccount === accountId) return 'in';
    if (accountId && t.account === accountId) return 'out';
    return 'transfer';
  }
  return t.income ? 'in' : 'out';
}

/** Does this transaction touch the given account (as source or transfer counterparty)? */
export function txnTouchesAccount(t: Txn, accountId: string): boolean {
  return t.account === accountId || t.counterAccount === accountId;
}

/** Display metadata for the credit-card / debt tags. */
export const TXN_TAGS: Record<TxnTag, { label: string; color: string; tint: string }> = {
  interest: { label: 'Interest', color: 'var(--coral-deep)', tint: 'var(--coral-tint)' },
  fee: { label: 'Fee', color: 'var(--amber-deep)', tint: 'var(--amber-tint)' },
  epp: { label: 'EPP', color: 'var(--accent-deep)', tint: 'var(--accent-tint)' },
  cash_advance: { label: 'Cash advance', color: 'var(--coral-deep)', tint: 'var(--coral-tint)' },
};
export const TXN_TAG_IDS = Object.keys(TXN_TAGS) as TxnTag[];

/** After "Clear all data" the app starts genuinely empty — no demo seed accounts/
 *  txns/EMIs/subs/grocery. The flag is set on clear and survives it. */
export function demoOff(): boolean {
  return LS.read<boolean>('noDemo', false);
}

export function allAccounts(): Account[] {
  // edits (seed or user accounts) live in an overrides map keyed by id
  const overrides = LS.read<Record<string, Partial<Account>>>('accountOverrides', {});
  const removed = new Set(LS.read<string[]>('removedAccounts', []));
  const seed = demoOff() ? [] : ACCOUNTS;
  const base = [...seed, ...LS.read<Account[]>('userAccounts', [])];
  const txns = allTxns();
  return base
    .filter((a) => !removed.has(a.id))
    .map((a) => {
      const merged = overrides[a.id] ? { ...a, ...overrides[a.id] } : a;
      // Balance is DERIVED from transactions (opening entry + ins − outs), never stored.
      return { ...merged, balance: accountBalanceFromTxns(a.id, txns) };
    });
}

export function findAccount(id: string): Account | undefined {
  return allAccounts().find((a) => a.id === id);
}

// ---- shared credit lines (user-created; no seed) ----
export function allCreditLines(): CreditLine[] {
  return LS.read<CreditLine[]>('creditLines', []);
}
export function getCreditLine(id: string | null | undefined): CreditLine | undefined {
  return id ? allCreditLines().find((l) => l.id === id) : undefined;
}
/** Member cards on a line (defaults to the live account list). */
export function accountsOnLine(lineId: string, accounts?: Account[]): Account[] {
  return (accounts ?? allAccounts()).filter((a) => a.creditLineId === lineId);
}

/** Resolve a free-text reference (from chat) to an account — by name, last4, or fuzzy contains. */
export function resolveAccount(query: string): Account | undefined {
  if (!query) return undefined;
  const q = query.toLowerCase().trim();
  const accts = allAccounts();
  return (
    accts.find((a) => a.name.toLowerCase() === q) ||
    accts.find((a) => a.last4 && q.includes(a.last4)) ||
    accts.find((a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase())) ||
    accts.find((a) => a.name.toLowerCase().split(' ').some((w) => w.length > 2 && q.includes(w)))
  );
}

/** Masked card/account suffix, e.g. "*9218". Empty for wallets/cash without a number. */
export function acctMask(a: Account): string {
  return a.last4 && a.last4.length >= 3 ? `*${a.last4}` : '';
}

/** 1–2 char mark derived from an account name, for the list badge. */
export function accountInitials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '•';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function toAED(a: Account): number {
  const c = a.currency ? CURRENCIES[a.currency] : undefined;
  return c && a.currency !== 'AED' ? a.balance / c.rate : a.balance;
}

// ---- editable EMIs & subscriptions (seed + user, with per-id overrides & removals) ----
function merge<T extends { id: string }>(seed: T[], overKey: string, userKey: string, removedKey: string): T[] {
  const ov = LS.read<Record<string, Partial<T>>>(overKey, {});
  const removed = new Set(LS.read<string[]>(removedKey, []));
  const user = LS.read<T[]>(userKey, []);
  const base = demoOff() ? [] : seed;
  return [...base, ...user].filter((x) => !removed.has(x.id)).map((x) => (ov[x.id] ? { ...x, ...ov[x.id] } : x));
}

export function allEmis(): Emi[] {
  return merge<Emi>(EMIS, 'emiOverrides', 'userEmis', 'removedEmis');
}
export function allSubs(): Sub[] {
  return merge<Sub>(SUBS, 'subOverrides', 'userSubs', 'removedSubs');
}
