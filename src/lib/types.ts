// Penny — shared domain types

export type CategoryId =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'subs'
  | 'health'
  | 'home'
  | 'fun'
  | 'income'
  | 'other';

export type CurrencyCode = 'AED' | 'USD' | 'EUR' | 'INR';

export interface Profile {
  name: string;
}

export type AccountGroup = 'bank' | 'card' | 'wallet';

export interface Category {
  label: string;
  color: string;
  tint: string;
  icon: string;
}

export interface SubCategory {
  id: string;
  label: string;
}

/** An editable category in the tree (defaults seeded from CATS, then user-editable). */
export interface CategoryNode {
  id: string;
  label: string;
  color: string;
  tint: string;
  icon: string;
  subs: SubCategory[];
}

export interface Currency {
  sym: string;
  rate: number;
  dp: number;
}

export interface Account {
  id: string;
  name: string;
  group: AccountGroup;
  last4?: string | null;
  balance: number;
  currency?: CurrencyCode;
  bg: string;
  fg: string;
  note?: string;
  /** Credit cards: total credit limit (positive). Enables available-credit + utilization display. */
  creditLimit?: number;
  /** Cards: statement/payment due date (YYYY-MM-DD or free text). Changes are logged. */
  dueDate?: string | null;
}

/** Audit entry for a non-monetary account change (credit limit / due date). */
export interface AccountChange {
  id: string;
  accountId: string;
  ts: number;
  kind: 'limit' | 'due';
  from: string;
  to: string;
}

export interface ExpenseItem {
  n: string;
  a: number;
}

/** Who an expense was really for. Non-self modes are reimbursable → feed "Owed to me". */
export type AttributionMode = 'self' | 'lent' | 'company' | 'person';
export interface Attribution {
  mode: AttributionMode;
  who?: string;
}

export type TrackKind = 'receivable' | 'payable' | 'remittance' | 'upcoming' | 'income';

export interface TrackedItem {
  id: string;
  kind: TrackKind;
  title: string;
  counterparty?: string;
  amount: number; // AED
  currency?: CurrencyCode;
  dueDate?: number; // epoch ms
  recurring?: boolean; // monthly (remittance / income)
  interestRate?: number; // % per year (payables that accrue)
  status: 'open' | 'settled';
  createdAt: number;
  note?: string;
  cheque?: boolean; // a post-dated cheque (e.g. personal cheque submitted for the business)
  // income-specific (variable):
  expectedMin?: number;
  expectedMax?: number;
  receivedThisMonth?: number;
}

/** Special credit-card / debt tags so interest, fees, EPP and cash advances are trackable. */
export type TxnTag = 'fee' | 'interest' | 'epp' | 'cash_advance';

export interface Txn {
  id: string;
  ts: number;
  d?: number;
  merchant: string;
  cat: CategoryId;
  sub?: string; // optional subcategory id
  tag?: TxnTag; // interest / fee / EPP / cash advance (for debt tracking)
  linkedTo?: string; // links a derived row (e.g. a transfer fee) to its parent txn
  amount: number;
  account: string;
  nec: number;
  items?: ExpenseItem[];
  recurring?: boolean;
  income?: boolean;
  byPenny?: boolean;
  attribution?: Attribution;
  /** Transfer between accounts: `account` is the source, `counterAccount` the destination. */
  transfer?: boolean;
  counterAccount?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  qty?: string;
  note?: string;
  noteKind?: 'skip' | 'watch';
  done?: boolean;
  estPrice?: number; // expected unit price (AED), learned from the master catalog
}

export interface ShoppingList {
  id: string;
  name: string;
  status: 'open' | 'done';
  createdAt: number;
  completedAt?: number;
  items: GroceryItem[];
  estimateAED?: number; // basket estimate at the time of finishing
  actualAED?: number; // the real bill
  merchant?: string;
  linkedTxnId?: string;
}

export interface MasterItem {
  key: string; // normalized name
  label: string; // display name
  avgPrice?: number; // learned average price (AED)
  count: number; // times added/seen
  category?: CategoryId;
}

export interface Emi {
  id: string;
  name: string;
  lender: string;
  monthly: number;
  principal: number;
  remaining: number;
  months: number;
  monthsLeft: number;
  rate: number;
  interestMo: number;
}

export interface Sub {
  id: string;
  name: string;
  amount: number;
  every: string;
  nextIn: number;
  cat: CategoryId;
  lastUsed?: number;
  essential?: boolean;
  flag?: string;
  attribution?: Attribution; // recurring expense for business / someone else
}

export type SubDecision = 'cancel' | 'keep' | 'snooze';

// ---- LLM contract ----
export type ParseKind =
  | 'expense'
  | 'grocery_add'
  | 'correction'
  | 'insight'
  | 'account_add'
  | 'account_edit'
  | 'note'
  | 'ledger'
  | 'track_add'
  | 'profile_edit'
  | 'crud'
  | 'chat';

/** Standardized CRUD op the LLM emits to create/update/delete any table. */
export interface RawCrud {
  op: 'create' | 'update' | 'delete';
  table: string; // accounts | transactions | emis | subs | tracked | categories
  match?: string; // id or name/title of the existing record (update/delete)
  data?: Record<string, unknown>;
}

export type ModelId = 'haiku' | 'sonnet' | 'opus';

export interface ParsedExpense {
  merchant: string;
  total: number;
  currency: CurrencyCode;
  category: CategoryId;
  account: string;
  items: ExpenseItem[];
  necessity: number;
  necessityNote: string;
  attribution?: Attribution;
  tag?: TxnTag;
}

/** Raw tracked-item shape Claude returns for kind=track_add (dates as ISO). */
export interface RawTrackedItem {
  kind: TrackKind;
  title: string;
  counterparty?: string;
  amount?: number;
  currency?: CurrencyCode;
  dueDate?: string;
  recurring?: boolean;
  interestRate?: number;
  note?: string;
  expectedMin?: number;
  expectedMax?: number;
  cheque?: boolean;
}

export interface ParsedAccount {
  name: string;
  group: AccountGroup;
  currency: CurrencyCode;
  balance: number;
  creditLimit?: number;
  last4?: string;
}

export interface ParseResult {
  kind: ParseKind;
  reply: string;
  chart?: 'grocery_months' | 'spend_months' | null;
  expense?: ParsedExpense | null;
  account?: ParsedAccount | null;
  groceryItems?: string[];
  /** For kind=note: the captured developer note / bug report / feature request. */
  note?: string | null;
  /** For kind=account_edit: which existing account to change (name or last4 to match). */
  match?: string | null;
  /** For kind=ledger: the filters to open the transaction ledger with. */
  filters?: RawLedgerFilters | null;
  /** For kind=track_add: a money-map item to create (owed/owing/send-home/upcoming/income). */
  tracked?: RawTrackedItem | null;
  /** For kind=profile_edit: profile fields to update (e.g. the user's name). */
  profile?: Partial<Profile> | null;
  /** For kind=crud: a create/update/delete op against any table. */
  crud?: RawCrud | null;
  /** Optional, sparing next-action Penny offers with confirm chips. */
  suggestion?: RawSuggestion | null;
  model?: ModelId;
  live?: boolean;
  /** 2-layer engine: Haiku signalled the topic is resolved → reset the chat trail. */
  close?: boolean;
}

export interface Plan {
  model: ModelId;
  label: string;
  steps: string[];
}

export type SuggestionAction = 'ledger' | 'money_map' | 'new_list' | 'watch' | 'none';
export interface RawSuggestion {
  label: string;
  action: SuggestionAction;
  filters?: RawLedgerFilters;
}

export interface ParseContext {
  /** Live financial snapshot computed from the user's real data (full tier). */
  snapshot?: string;
  /** Compact id↔label legend for accounts + categories (lean haiku tier). */
  legend?: string;
  /** Recent conversation turns, pre-formatted. */
  conversation?: string;
}

export type PeriodPreset = 'today' | 'week' | 'month' | 'last_month' | '3m' | 'year' | 'all';

export interface LedgerFilters {
  accounts?: string[];
  categories?: CategoryId[];
  type?: 'all' | 'in' | 'out';
  preset?: PeriodPreset;
  from?: number; // epoch ms
  to?: number; // epoch ms
}

/** Raw filter shape Claude returns (dates as ISO strings). */
export interface RawLedgerFilters {
  accounts?: string[];
  categories?: string[];
  type?: 'all' | 'in' | 'out';
  period?: PeriodPreset;
  from?: string;
  to?: string;
}

export interface ReceiptResult {
  reply: string;
  items: { n: string; a: number; nec: number; note?: string }[];
  expense: ParsedExpense;
  followUp?: string;
  live?: boolean;
}

export interface StatementResult {
  reply: string;
  importCount: number;
  account: string;
  toast: string;
  followUpTag: string;
  followUpOptions: string[];
  live?: boolean;
}

export interface DigestResult {
  text: string;
  live: boolean;
}
