// Penny — seed data, categories, currency + persistence helpers (ported from prototype)
import type {
  Account,
  Category,
  CategoryId,
  CategoryNode,
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

export const ACCOUNTS: Account[] = [
  { id: 'fab', name: 'FAB Current', group: 'bank', last4: '3014', balance: 14620, bg: 'linear-gradient(135deg, #2E3A2A, #46613A)', fg: '#EDEFE2', note: 'Salary account' },
  { id: 'fabsave', name: 'FAB Savings', group: 'bank', last4: '8861', balance: 28400, bg: 'linear-gradient(135deg, #3A4A33, #5F7F50)', fg: '#EDEFE2', note: 'Emergency fund' },
  { id: 'enbdcur', name: 'ENBD Current', group: 'bank', last4: '5527', balance: 3320, bg: 'linear-gradient(135deg, #4A3A2A, #8A6A3C)', fg: '#F2EBDB', note: 'Joint expenses' },
  { id: 'wio', name: 'Wio Personal', group: 'bank', last4: '9943', balance: 5150, bg: 'linear-gradient(135deg, #3D4B57, #5C7A8A)', fg: '#E7F0F2', note: 'Spending pots' },
  { id: 'neo', name: 'Mashreq Neo', group: 'bank', last4: '2208', balance: 1875, bg: 'linear-gradient(135deg, #51424F, #7A5E76)', fg: '#F0E8EF', note: 'Old salary acct' },
  { id: 'enbd', name: 'ENBD Credit', group: 'card', last4: '7812', balance: -3185, creditLimit: 15000, dueDate: '2026-06-24', bg: 'linear-gradient(135deg, #5C3A28, #A8793C)', fg: '#F5EDDC', note: 'Due in 9 days' },
  { id: 'fabcard', name: 'FAB Cashback', group: 'card', last4: '4406', balance: -1240, creditLimit: 10000, bg: 'linear-gradient(135deg, #2E2A21, #5C554A)', fg: '#EFE8D8', note: '5% groceries' },
  { id: 'citi', name: 'Citi Premier', group: 'card', last4: '1175', balance: -2210, creditLimit: 20000, bg: 'linear-gradient(135deg, #34404E, #4E5E74)', fg: '#E5EBF2', note: 'Miles card' },
  { id: 'revolut', name: 'Revolut', group: 'card', last4: '0233', balance: 1240, currency: 'USD', bg: 'linear-gradient(135deg, #3D4B57, #4E7A8A)', fg: '#E7F0F2', note: 'Travel + USD' },
  { id: 'careem', name: 'Careem Pay', group: 'wallet', last4: null, balance: 145, bg: 'linear-gradient(135deg, #44523C, #6B8A5A)', fg: '#EDF2E2', note: 'Rides + refunds' },
  { id: 'emoney', name: 'e& money', group: 'wallet', last4: null, balance: 89, bg: 'linear-gradient(135deg, #6B4A35, #B0744A)', fg: '#F5EBDD', note: 'Bills wallet' },
  { id: 'cash', name: 'Cash', group: 'wallet', last4: null, balance: 410, bg: 'linear-gradient(135deg, #EFE8D8, #DCD3C0)', fg: '#4A4438', note: 'Wallet' },
];

export const USER_ACCT_BGS: [string, string][] = [
  ['linear-gradient(135deg, #3F4A3A, #6B8A5A)', '#EDF2E2'],
  ['linear-gradient(135deg, #5C4630, #C98B2D)', '#F5EDDC'],
  ['linear-gradient(135deg, #5A3A30, #D96845)', '#F8E9E2'],
];

// d = days ago. All amounts AED.
const SEED_TXNS: Txn[] = [
  { id: 't1', d: 0, ts: 0, merchant: 'Karak House', cat: 'food', amount: 12, account: 'cash', nec: 5, items: [{ n: 'Karak chai ×2', a: 6 }, { n: 'Veg samosa', a: 6 }] },
  { id: 't2', d: 0, ts: 0, merchant: 'Careem', cat: 'transport', amount: 23.5, account: 'enbd', nec: 8 },
  { id: 't3', d: 0, ts: 0, merchant: 'Spinneys', cat: 'groceries', amount: 86.4, account: 'fab', nec: 8, items: [{ n: 'Produce + dairy', a: 64.4 }, { n: 'Ginger ale 6-pk', a: 22 }] },
  { id: 't4', d: 1, ts: 0, merchant: 'Netflix', cat: 'subs', amount: 39, account: 'enbd', nec: 4, recurring: true },
  { id: 't5', d: 1, ts: 0, merchant: 'ADNOC', cat: 'transport', amount: 120, account: 'fab', nec: 9 },
  { id: 't6', d: 1, ts: 0, merchant: 'Shake Shack', cat: 'food', amount: 67, account: 'enbd', nec: 3 },
  { id: 't7', d: 2, ts: 0, merchant: 'DEWA', cat: 'bills', amount: 412, account: 'fab', nec: 10, recurring: true },
  { id: 't8', d: 2, ts: 0, merchant: 'Caribou Coffee', cat: 'food', amount: 28, account: 'enbd', nec: 4 },
  { id: 't9', d: 3, ts: 0, merchant: 'Salary — Meridian LLC', cat: 'income', amount: 18500, account: 'fab', nec: 10, income: true },
  { id: 't10', d: 3, ts: 0, merchant: 'Rent — Al Barsha apt', cat: 'home', amount: 4200, account: 'fab', nec: 10, recurring: true },
  { id: 't11', d: 4, ts: 0, merchant: 'Carrefour', cat: 'groceries', amount: 214.8, account: 'fab', nec: 8 },
  { id: 't12', d: 5, ts: 0, merchant: 'Noon.com', cat: 'shopping', amount: 159, account: 'enbd', nec: 4 },
  { id: 't13', d: 6, ts: 0, merchant: 'Fitness First', cat: 'health', amount: 299, account: 'enbd', nec: 6, recurring: true },
  { id: 't14', d: 6, ts: 0, merchant: 'Caribou Coffee', cat: 'food', amount: 31, account: 'enbd', nec: 4 },
];

export const EMIS: Emi[] = [
  { id: 'car', name: 'Car loan — Nissan Kicks', lender: 'FAB Auto', monthly: 1450, principal: 68000, remaining: 41300, months: 48, monthsLeft: 29, rate: 3.19, interestMo: 181 },
  { id: 'phone', name: 'iPhone 17 Pro', lender: 'ENBD installments', monthly: 379, principal: 4549, remaining: 2274, months: 12, monthsLeft: 6, rate: 0, interestMo: 0 },
  { id: 'sofa', name: 'Living room furniture', lender: 'Tabby ×4', monthly: 620, principal: 2480, remaining: 1240, months: 4, monthsLeft: 2, rate: 0, interestMo: 0 },
];

export const SUBS: Sub[] = [
  { id: 'rent', name: 'Rent — Al Barsha', amount: 4200, every: 'month', nextIn: 27, cat: 'home', essential: true },
  { id: 'netflix', name: 'Netflix Premium', amount: 39, every: 'month', nextIn: 29, cat: 'subs', lastUsed: 2 },
  { id: 'spotify', name: 'Spotify', amount: 21.99, every: 'month', nextIn: 11, cat: 'subs', lastUsed: 0 },
  { id: 'icloud', name: 'iCloud+ 200GB', amount: 11.99, every: 'month', nextIn: 17, cat: 'subs', lastUsed: 0 },
  { id: 'gym', name: 'Fitness First', amount: 299, every: 'month', nextIn: 24, cat: 'health', lastUsed: 26, flag: "You haven't checked in for 26 days. That's AED 299/mo idle." },
  { id: 'anghami', name: 'Anghami Plus', amount: 19.99, every: 'month', nextIn: 6, cat: 'subs', lastUsed: 47, flag: 'Unused for 47 days — and it overlaps with Spotify.' },
];

export const GROCERY: GroceryItem[] = [
  { id: 'g1', name: 'Milk (full fat, 2L)', qty: '2' },
  { id: 'g2', name: 'Eggs', qty: '30 pk' },
  { id: 'g3', name: 'Tomatoes', qty: '1 kg' },
  { id: 'g4', name: 'Olive oil', qty: '1L', note: 'You bought 1L on May 31 — pantry is likely stocked. Skip this trip?', noteKind: 'skip' },
  { id: 'g5', name: 'Chicken breast', qty: '1 kg' },
  { id: 'g6', name: 'Ginger ale', qty: '6-pk', note: '3rd time this month — AED 66 total on soda. Want me to watch this?', noteKind: 'watch' },
];

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
  return base
    .filter((a) => !removed.has(a.id))
    .map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id] } : a));
}

export function findAccount(id: string): Account | undefined {
  return allAccounts().find((a) => a.id === id);
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
