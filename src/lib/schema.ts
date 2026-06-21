// Penny — schema registry: the single source of truth for every editable table.
// Drives the Setup-hub forms, list rows, delete-confirmation reference guards,
// and (Phase 2) the compact schema digest fed to the LLM's standardized `crud`
// tool. Each spec wires the generic UI to the existing AppContext CRUD methods.
import type { Field, FormValues } from '../components/EditSheet';
import type { AppApi } from '../state/AppContext';
import type { Account, AccountGroup, Attribution, AttributionMode, CategoryId, CurrencyCode, Emi, RawCrud, Sub, TrackedItem, Txn, TxnTag } from './types';
import { acctMask, catLabel, fmt } from './data';

const TAG_OPTS = [
  { value: '', label: 'None' },
  { value: 'interest', label: 'Interest' },
  { value: 'epp', label: 'EPP' },
  { value: 'cash_advance', label: 'Cash advance' },
  { value: 'fee', label: 'Fee' },
];
const tagOf = (v: FormValues[string]): TxnTag | undefined => {
  const s = String(v ?? '');
  return (['fee', 'interest', 'epp', 'cash_advance'] as string[]).includes(s) ? (s as TxnTag) : undefined;
};
const ATTR_OPTS = [
  { value: 'self', label: 'Just me' },
  { value: 'company', label: 'My business' },
  { value: 'person', label: 'Someone else' },
  { value: 'lent', label: 'Lent out' },
];
const attrFrom = (mode: FormValues[string], who: FormValues[string]): Attribution | undefined => {
  const m = String(mode || 'self') as AttributionMode;
  return m && m !== 'self' ? { mode: m, who: who ? String(who) : undefined } : undefined;
};

export interface TableSpec<T> {
  id: string;
  label: string;
  singular: string;
  icon: string;
  list: (app: AppApi) => T[];
  fields: (app: AppApi) => Field[];
  primary: (r: T) => string;
  secondary: (r: T, app: AppApi) => string;
  editable?: (r: T) => boolean;
  toForm: (r: T) => FormValues;
  create: (app: AppApi, v: FormValues) => void;
  update: (app: AppApi, r: T, v: FormValues) => void;
  remove: (app: AppApi, r: T) => void;
  /** Reference count blocking deletion (e.g. an account used by transactions). */
  refCount?: (app: AppApi, r: T) => { count: number; noun: string };
}

const num = (v: FormValues[string]): number => (v === '' || v == null ? 0 : Number(v));
const str = (v: FormValues[string]): string => (v == null ? '' : String(v));
// Clamp a free-text enum (e.g. an LLM writing "savings" for a bank) to allowed values.
const oneOf = <T extends string>(v: FormValues[string], allowed: readonly T[], fallback: T): T => {
  const s = str(v).trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === s) || fallback;
};
const GROUPS = ['bank', 'card', 'wallet'] as const;
const CURRENCIES_ALLOWED = ['AED', 'USD', 'EUR', 'INR'] as const;
const KINDS = ['receivable', 'payable', 'remittance', 'upcoming', 'income'] as const;

const GROUP_OPTS = [
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
];
const CURRENCY_OPTS = (['AED', 'USD', 'EUR', 'INR'] as CurrencyCode[]).map((c) => ({ value: c, label: c }));
const KIND_OPTS = [
  { value: 'receivable', label: 'Owed to me' },
  { value: 'payable', label: 'I owe (debt)' },
  { value: 'remittance', label: 'Send home' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'income', label: 'Income' },
];

const catOpts = (app: AppApi) => app.categories.map((c) => ({ value: c.id, label: c.label }));
const acctOpts = (app: AppApi) => app.accounts.map((a) => ({ value: a.id, label: a.name }));

const accountSpec: TableSpec<Account> = {
  id: 'accounts', label: 'Accounts', singular: 'Account', icon: 'wallet',
  list: (app) => app.accounts,
  fields: () => [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Liv Savings' },
    { key: 'group', label: 'Type', type: 'select', options: GROUP_OPTS },
    { key: 'currency', label: 'Currency', type: 'select', options: CURRENCY_OPTS },
    // Opening balance is posted as a dated entry — backdate it via opening date.
    // (On edit these stay blank; the balance is derived from transactions.)
    { key: 'balance', label: 'Opening balance (new account)', type: 'number' },
    { key: 'openingDate', label: 'Opening date', type: 'date' },
    { key: 'creditLimit', label: 'Credit limit (cards)', type: 'number' },
    { key: 'statementDay', label: 'Statement day 1-30 (cards)', type: 'number' },
    { key: 'dueDays', label: 'Due days after statement (cards)', type: 'number' },
    { key: 'dueDate', label: 'Fixed due date (cards)', type: 'date' },
    { key: 'last4', label: 'Last 4 digits', type: 'text', placeholder: '0000' },
  ],
  primary: (r) => r.name + (acctMask(r) ? ' ' + acctMask(r) : ''),
  secondary: (r, app) => `${r.group} · ${fmt(r.balance, app.currency)}`,
  // Opening fields blank on edit — balance derives from transactions, not the form.
  toForm: (r) => ({ name: r.name, group: r.group, currency: r.currency || 'AED', balance: '', openingDate: '', creditLimit: r.creditLimit, dueDate: r.dueDate || '', last4: r.last4 || '' }),
  create: (app, v) => app.addAccount({ name: str(v.name) || 'Account', group: oneOf<AccountGroup>(v.group, GROUPS, 'bank'), currency: oneOf<CurrencyCode>(v.currency, CURRENCIES_ALLOWED, 'AED'), balance: num(v.balance), openingDate: v.openingDate ? str(v.openingDate) : undefined, creditLimit: v.creditLimit != null && v.creditLimit !== '' ? Math.abs(num(v.creditLimit)) : undefined, statementDay: v.statementDay != null && v.statementDay !== '' ? Math.max(1, Math.min(30, Math.round(num(v.statementDay)))) : undefined, dueDays: v.dueDays != null && v.dueDays !== '' ? Math.max(0, Math.round(num(v.dueDays))) : undefined, last4: str(v.last4).replace(/\D/g, '').slice(0, 4) || undefined }),
  // Balance is derived from transactions. If a balance is given (e.g. via chat
  // "set the opening balance to X"), reconcile it by posting an opening/adjustment
  // entry so the derived balance matches — rather than silently ignoring it.
  update: (app, r, v) => {
    app.updateAccount(r.id, { name: str(v.name) || r.name, group: oneOf<AccountGroup>(v.group, GROUPS, r.group), currency: oneOf<CurrencyCode>(v.currency, CURRENCIES_ALLOWED, 'AED'), creditLimit: v.creditLimit != null && v.creditLimit !== '' ? Math.abs(num(v.creditLimit)) : undefined, statementDay: v.statementDay != null && v.statementDay !== '' ? Math.max(1, Math.min(30, Math.round(num(v.statementDay)))) : undefined, dueDays: v.dueDays != null && v.dueDays !== '' ? Math.max(0, Math.round(num(v.dueDays))) : undefined, dueDate: v.dueDate ? str(v.dueDate) : null, last4: str(v.last4).replace(/\D/g, '').slice(0, 4) || null });
    if (v.balance != null && v.balance !== '') {
      const delta = num(v.balance) - r.balance;
      if (Math.abs(delta) >= 0.005) {
        const hasTxns = app.txns.some((t) => t.account === r.id || t.counterAccount === r.id);
        const ts = v.openingDate ? (Date.parse(str(v.openingDate)) || undefined) : undefined;
        app.addTxn({ merchant: hasTxns ? 'Balance adjustment' : 'Opening balance', cat: delta >= 0 ? 'income' : 'other', amount: Math.abs(delta), account: r.id, nec: 5, income: delta >= 0, byPenny: false, ts });
      }
    }
  },
  remove: (app, r) => app.removeAccount(r.id),
  // Deleting an account also removes its transactions, so no ref-count block.
};

const txnSpec: TableSpec<Txn> = {
  id: 'transactions', label: 'Transactions', singular: 'Transaction', icon: 'filetext',
  list: (app) => app.txns.slice(0, 100),
  fields: (app) => [
    { key: 'merchant', label: 'Merchant', type: 'text', placeholder: 'e.g. Spinneys' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'category', label: 'Category', type: 'select', options: catOpts(app) },
    { key: 'account', label: 'Account', type: 'select', options: acctOpts(app) },
    { key: 'necessity', label: 'Necessity 1-10', type: 'number' },
    { key: 'tag', label: 'Tag', type: 'select', options: TAG_OPTS },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'income', label: 'Is income', type: 'toggle' },
  ],
  primary: (r) => r.merchant,
  secondary: (r, app) => `${fmt(r.amount, app.currency)} · ${catLabel(r.cat)}`,
  editable: (r) => r.id.startsWith('u'),
  toForm: (r) => ({ merchant: r.merchant, amount: r.amount, category: r.cat, account: r.account, necessity: r.nec, tag: r.tag || '', income: !!r.income }),
  create: (app, v) => {
    const id = app.addTxn({ merchant: str(v.merchant) || 'Expense', cat: (str(v.category) || 'other') as CategoryId, amount: num(v.amount), account: str(v.account) || 'cash', nec: num(v.necessity) || 5, tag: tagOf(v.tag), income: !!v.income });
    if (v.date) { const ts = Date.parse(str(v.date)); if (!Number.isNaN(ts)) app.updateTxn(id, { ts }); }
  },
  update: (app, r, v) => {
    const changes: Partial<Txn> = { merchant: str(v.merchant), cat: (str(v.category) || r.cat) as CategoryId, amount: num(v.amount), account: str(v.account) || r.account, nec: num(v.necessity) || r.nec, tag: tagOf(v.tag), income: !!v.income };
    if (v.date) { const ts = Date.parse(str(v.date)); if (!Number.isNaN(ts)) changes.ts = ts; }
    app.updateTxn(r.id, changes);
  },
  remove: (app, r) => app.removeTxn(r.id),
};

const emiSpec: TableSpec<Emi> = {
  id: 'emis', label: 'EMIs', singular: 'EMI', icon: 'coins',
  list: (app) => app.emis,
  fields: () => [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Car loan' },
    { key: 'lender', label: 'Lender', type: 'text' },
    { key: 'monthly', label: 'Monthly', type: 'number' },
    { key: 'principal', label: 'Principal', type: 'number' },
    { key: 'remaining', label: 'Remaining', type: 'number' },
    { key: 'months', label: 'Total months', type: 'number' },
    { key: 'monthsLeft', label: 'Months left', type: 'number' },
    { key: 'rate', label: 'Rate %', type: 'number' },
  ],
  primary: (r) => r.name,
  secondary: (r, app) => `${fmt(r.monthly, app.currency)}/mo · ${r.monthsLeft} mo left`,
  toForm: (r) => ({ name: r.name, lender: r.lender, monthly: r.monthly, principal: r.principal, remaining: r.remaining, months: r.months, monthsLeft: r.monthsLeft, rate: r.rate }),
  create: (app, v) => app.addEmi({ name: str(v.name) || 'EMI', lender: str(v.lender), monthly: num(v.monthly), principal: num(v.principal), remaining: num(v.remaining), months: num(v.months), monthsLeft: num(v.monthsLeft), rate: num(v.rate), interestMo: 0 }),
  update: (app, r, v) => app.updateEmi(r.id, { name: str(v.name), lender: str(v.lender), monthly: num(v.monthly), principal: num(v.principal), remaining: num(v.remaining), months: num(v.months), monthsLeft: num(v.monthsLeft), rate: num(v.rate) }),
  remove: (app, r) => app.removeEmi(r.id),
};

const subSpec: TableSpec<Sub> = {
  id: 'subs', label: 'Recurring', singular: 'Recurring item', icon: 'loop',
  list: (app) => app.subs,
  fields: (app) => [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Netflix' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'every', label: 'Every', type: 'text', placeholder: 'monthly' },
    { key: 'nextIn', label: 'Next in (days)', type: 'number' },
    { key: 'cat', label: 'Category', type: 'select', options: catOpts(app) },
    { key: 'essential', label: 'Essential', type: 'toggle' },
    { key: 'attrMode', label: 'For', type: 'select', options: ATTR_OPTS },
    { key: 'attrWho', label: 'Who (if not me)', type: 'text', placeholder: 'business / name' },
  ],
  primary: (r) => r.name,
  secondary: (r, app) => `${fmt(r.amount, app.currency)} · ${r.every}${r.attribution && r.attribution.mode !== 'self' ? ` · ↩ ${r.attribution.who || r.attribution.mode}` : ''}`,
  toForm: (r) => ({ name: r.name, amount: r.amount, every: r.every, nextIn: r.nextIn, cat: r.cat, essential: !!r.essential, attrMode: r.attribution?.mode || 'self', attrWho: r.attribution?.who || '' }),
  create: (app, v) => app.addSub({ name: str(v.name) || 'Subscription', amount: num(v.amount), every: str(v.every) || 'monthly', nextIn: num(v.nextIn), cat: (str(v.cat) || 'subs') as CategoryId, essential: !!v.essential, attribution: attrFrom(v.attrMode, v.attrWho) }),
  update: (app, r, v) => app.updateSub(r.id, { name: str(v.name), amount: num(v.amount), every: str(v.every), nextIn: num(v.nextIn), cat: (str(v.cat) || r.cat) as CategoryId, essential: !!v.essential, attribution: attrFrom(v.attrMode, v.attrWho) }),
  remove: (app, r) => app.removeSub(r.id),
};

const trackedSpec: TableSpec<TrackedItem> = {
  id: 'tracked', label: 'Money map', singular: 'Money-map item', icon: 'coins',
  list: (app) => app.tracked,
  fields: () => [
    { key: 'kind', label: 'Kind', type: 'select', options: KIND_OPTS },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'counterparty', label: 'Who', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'interestRate', label: 'Interest % / yr', type: 'number' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'recurring', label: 'Recurring (monthly)', type: 'toggle' },
    { key: 'cheque', label: 'Post-dated cheque', type: 'toggle' },
  ],
  primary: (r) => r.title,
  secondary: (r, app) => `${r.cheque ? 'Cheque · ' : ''}${KIND_OPTS.find((k) => k.value === r.kind)?.label || r.kind} · ${fmt(r.amount, app.currency)}`,
  toForm: (r) => ({ kind: r.kind, title: r.title, counterparty: r.counterparty || '', amount: r.amount, interestRate: r.interestRate, dueDate: r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : '', recurring: !!r.recurring, cheque: !!r.cheque }),
  create: (app, v) => app.addTracked({ kind: oneOf<TrackedItem['kind']>(v.kind, KINDS, 'receivable'), title: str(v.title) || 'Item', counterparty: str(v.counterparty) || undefined, amount: num(v.amount), interestRate: v.interestRate != null && v.interestRate !== '' ? num(v.interestRate) : undefined, dueDate: v.dueDate ? Date.parse(str(v.dueDate)) || undefined : undefined, recurring: !!v.recurring, cheque: !!v.cheque }),
  update: (app, r, v) => app.updateTracked(r.id, { kind: oneOf<TrackedItem['kind']>(v.kind, KINDS, r.kind), title: str(v.title), counterparty: str(v.counterparty) || undefined, amount: num(v.amount), interestRate: v.interestRate != null && v.interestRate !== '' ? num(v.interestRate) : undefined, dueDate: v.dueDate ? Date.parse(str(v.dueDate)) || undefined : undefined, recurring: !!v.recurring, cheque: !!v.cheque }),
  remove: (app, r) => app.removeTracked(r.id),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLE_SPECS: Record<string, TableSpec<any>> = {
  accounts: accountSpec,
  transactions: txnSpec,
  emis: emiSpec,
  subs: subSpec,
  tracked: trackedSpec,
};

export const TABLE_ORDER = ['accounts', 'transactions', 'emis', 'subs', 'tracked'];

// Find a record by id, or fuzzily by its display name/title.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveRecord(spec: TableSpec<any>, app: AppApi, match: string): any {
  const list = spec.list(app);
  const m = (match || '').trim().toLowerCase();
  if (!m) return null;
  return (
    list.find((r) => String((r as { id?: string }).id || '').toLowerCase() === m) ||
    list.find((r) => spec.primary(r).toLowerCase() === m) ||
    list.find((r) => spec.primary(r).toLowerCase().includes(m)) ||
    null
  );
}

/** Execute a standardized CRUD op from the LLM. Returns a user-facing message. */
export function applyCrud(app: AppApi, c: RawCrud): { message: string; ok: boolean } {
  const data = (c.data || {}) as FormValues;
  // Transfers move money between two accounts (no TABLE_SPECS row).
  if (c.table === 'transfer') {
    const findAcct = (m: unknown) => {
      const s = String(m ?? '').trim().toLowerCase();
      return app.accounts.find((a) => a.id.toLowerCase() === s) || app.accounts.find((a) => a.name.toLowerCase().includes(s));
    };
    const from = findAcct(data.from ?? data.account);
    const to = findAcct(data.to ?? data.counterAccount);
    const amount = Number(data.amount) || 0;
    if (!from || !to) return { message: 'Tell me which two accounts to move between.', ok: false };
    if (amount <= 0) return { message: 'How much should I move?', ok: false };
    // explicit charge, else auto ~1.05% when paying a credit card
    let charge = data.charge != null && data.charge !== '' ? Number(data.charge) || 0 : 0;
    if (!charge && to.group === 'card') charge = Math.round(amount * 0.0105 * 100) / 100;
    app.addTransfer(from.id, to.id, amount, data.note ? String(data.note) : undefined, charge);
    return { message: `Moved ${fmt(amount, app.currency)} from ${from.name} to ${to.name}${charge ? ` (+ ${fmt(charge, app.currency)} fee)` : ''}.`, ok: true };
  }
  // Categories live outside TABLE_SPECS (bespoke tree model).
  if (c.table === 'categories') {
    const label = String(data.label || data.name || c.match || '').trim();
    if (c.op === 'create') {
      if (!label) return { message: "I need a name for the category.", ok: false };
      app.addCategory(label);
      return { message: `Added the “${label}” category.`, ok: true };
    }
    const cat = app.categories.find((x) => x.id === c.match || x.label.toLowerCase() === (c.match || '').toLowerCase());
    if (!cat) return { message: `I couldn't find a “${c.match}” category.`, ok: false };
    if (c.op === 'update') { app.updateCategory(cat.id, { label: label || cat.label }); return { message: `Renamed it to “${label || cat.label}”.`, ok: true }; }
    const used = app.categoryUsage(cat.id);
    if (used > 0) return { message: `Can't delete “${cat.label}” — it's used by ${used} transaction${used > 1 ? 's' : ''}.`, ok: false };
    app.removeCategory(cat.id);
    return { message: `Deleted the “${cat.label}” category.`, ok: true };
  }

  const spec = TABLE_SPECS[c.table];
  if (!spec) return { message: `I don't manage a “${c.table}” table.`, ok: false };

  if (c.op === 'create') {
    spec.create(app, data);
    return { message: `Added a new ${spec.singular.toLowerCase()}.`, ok: true };
  }
  const rec = c.match ? resolveRecord(spec, app, c.match) : null;
  if (!rec) return { message: `I couldn't find “${c.match}” in your ${spec.label.toLowerCase()}.`, ok: false };
  if (c.op === 'update') {
    spec.update(app, rec, { ...spec.toForm(rec), ...data });
    return { message: `Updated ${spec.primary(rec)}.`, ok: true };
  }
  // delete
  const ref = spec.refCount?.(app, rec);
  if (ref && ref.count > 0) return { message: `Can't delete ${spec.primary(rec)} — it's used by ${ref.count} ${ref.noun}${ref.count > 1 ? 's' : ''}.`, ok: false };
  spec.remove(app, rec);
  return { message: `Deleted ${spec.primary(rec)}.`, ok: true };
}

/** Compact, token-cheap schema digest for the Phase-2 LLM `crud` tool. */
export function schemaDigest(): string {
  const lines = ['categories(id,label,subs[])'];
  for (const id of TABLE_ORDER) {
    const s = TABLE_SPECS[id];
    // field keys only — types are obvious from names; keeps the prompt tiny
    const keys = s.fields({ categories: [], accounts: [] } as unknown as AppApi).map((f) => f.key);
    lines.push(`${s.id}(${keys.join(',')})`);
  }
  return lines.join('\n');
}
