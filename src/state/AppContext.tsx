// Penny — global app state: transactions, accounts, grocery, currency, toast, navigation
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GROCERY,
  LS,
  USER_ACCT_BGS,
  allAccounts,
  accountBalanceFromTxns,
  demoOff,
  fmt,
  allEmis,
  allSubs,
  newCatId,
  newSubId,
  normItem,
  onLSWrite,
  readCatTree,
  seedTxns,
  writeCatTree,
} from '../lib/data';
import { sync, syncWriteHook, type SyncState } from '../lib/sync';
import { hasSupabase } from '../lib/config';
import { App as CapApp } from '@capacitor/app';
import { checkShared, type SharedPayload } from '../lib/share';
import type {
  Account,
  AccountChange,
  CategoryNode,
  CurrencyCode,
  Emi,
  GroceryItem,
  LedgerFilters,
  MasterItem,
  ParsedAccount,
  Profile,
  ShoppingList,
  Sub,
  TrackedItem,
  Txn,
} from '../lib/types';
import { Toast, useToast } from '../components/ui';

export type TabId = 'home' | 'accounts' | 'track' | 'coach';

export interface NewTxn {
  merchant: string;
  cat: Txn['cat'];
  amount: number;
  account: string;
  nec: number;
  items?: Txn['items'];
  byPenny?: boolean;
  income?: boolean;
  attribution?: Txn['attribution'];
  transfer?: boolean;
  counterAccount?: string;
  tag?: Txn['tag'];
}

export interface AppApi {
  txns: Txn[];
  addTxn: (x: NewTxn) => string;
  addTransfer: (from: string, to: string, amount: number, note?: string, charge?: number) => void;
  updateTxn: (id: string, changes: Partial<Txn>) => void;
  removeTxn: (id: string) => void;
  // edit a transaction from any list (Activity, ledger, account view)
  editTxnId: string | null;
  openTxnEditor: (id: string) => void;
  closeTxnEditor: () => void;
  // account change audit (credit limit / due date)
  acctHistoryFor: (id: string) => AccountChange[];
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  profile: Profile;
  updateProfile: (changes: Partial<Profile>) => void;
  accounts: Account[];
  addAccount: (a: ParsedAccount & { openingDate?: string }) => void;
  updateAccount: (id: string, changes: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  grocery: GroceryItem[];
  addGrocery: (name: string) => void;
  removeGroceryByName: (name: string) => void;
  toggleGrocery: (id: string) => void;
  // shopping lists v2
  shoppingLists: ShoppingList[];
  master: MasterItem[];
  openList: ShoppingList | null;
  addShoppingItem: (name: string, qty?: string) => void;
  toggleShoppingItem: (id: string) => void;
  removeShoppingItem: (id: string) => void;
  setItemPrice: (id: string, price: number) => void;
  estimateOpenList: () => { total: number; priced: number; unknown: number };
  newShoppingList: (name?: string) => void;
  finishShopping: (opts: { amount: number; merchant?: string; account?: string }) => void;
  learnPrices: (items: { n: string; a: number }[]) => void;
  toast: (msg: string) => void;
  go: (tab: TabId) => void;
  tab: TabId;
  openChat: () => void;
  closeChat: () => void;
  chatOpen: boolean;
  ledgerOpen: boolean;
  ledgerFilters: LedgerFilters;
  openLedger: (filters?: LedgerFilters) => void;
  closeLedger: () => void;
  // money map
  tracked: TrackedItem[];
  settledReimbursements: string[];
  addTracked: (item: Omit<TrackedItem, 'id' | 'createdAt' | 'status'>) => void;
  updateTracked: (id: string, changes: Partial<TrackedItem>) => void;
  settleTracked: (id: string) => void;
  removeTracked: (id: string) => void;
  settleReimbursement: (txnId: string) => void;
  moneyOpen: boolean;
  openMoney: () => void;
  closeMoney: () => void;
  // account dashboard
  accountViewId: string | null;
  openAccount: (id: string) => void;
  closeAccount: () => void;
  // settings (profile + keys + sync)
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  // editable EMIs & subscriptions
  emis: Emi[];
  subs: Sub[];
  addEmi: (e: Omit<Emi, 'id'>) => void;
  updateEmi: (id: string, changes: Partial<Emi>) => void;
  removeEmi: (id: string) => void;
  addSub: (s: Omit<Sub, 'id'>) => void;
  updateSub: (id: string, changes: Partial<Sub>) => void;
  removeSub: (id: string) => void;
  // sync (Supabase shared Space)
  syncState: SyncState;
  syncDetail: string;
  syncNow: () => void;
  reconnectSync: () => void;
  // category → subcategory tree (editable)
  categories: CategoryNode[];
  addCategory: (label: string) => void;
  updateCategory: (id: string, changes: Partial<CategoryNode>) => void;
  removeCategory: (id: string) => void;
  addSubcategory: (catId: string, label: string) => void;
  updateSubcategory: (catId: string, subId: string, label: string) => void;
  removeSubcategory: (catId: string, subId: string) => void;
  setCategoryTree: (tree: CategoryNode[]) => void;
  categoryUsage: (catId: string, subId?: string) => number;
  // settings sub-screen: setup hub
  setupOpen: boolean;
  setupSection: string | null;
  openSetup: (section?: string) => void;
  closeSetup: () => void;
  // main menu (all sections)
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  // designated savings account (emergency fund + generic saving)
  savingsAccountId: string | null;
  setSavingsAccount: (id: string | null) => void;
  // notification center (nudges + alerts)
  notificationsOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
  // first-run onboarding + data reset
  onboarded: boolean;
  completeOnboarding: () => void;
  clearAllData: () => void;
  // content shared INTO Penny from the OS share sheet → opens chat pre-attached
  sharedPayload: SharedPayload | null;
  openChatWithShare: (p: SharedPayload) => void;
  clearShared: () => void;
  // profile side panel
  profileOpen: boolean;
  openProfile: () => void;
  closeProfile: () => void;
  // manual (non-AI) expense entry with calculator
  manualOpen: boolean;
  openManual: () => void;
  closeManual: () => void;
}

const CAT_PALETTE: [string, string][] = [
  ['#C98B2D', '#F4E7CC'], ['#5F7F50', '#E5ECDB'], ['#4E7A8A', '#DEEAEE'], ['#D96845', '#F8E2D8'],
  ['#8A6FB1', '#EAE3F2'], ['#B65C7E', '#F4DFE7'], ['#4F8F7B', '#DFEDE8'], ['#A8793C', '#F0E5D2'],
];

/** First-run check: explicit flag wins; otherwise treat any existing data as already-onboarded (don't disrupt current installs). */
function readOnboarded(): boolean {
  const raw = LS.read<boolean | null>('onboarded', null);
  if (raw !== null) return raw;
  try {
    return !!localStorage.getItem('penny.profile') || !!localStorage.getItem('penny.userTxns');
  } catch {
    return false;
  }
}

const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [toast, showToast] = useToast();
  const [tab, setTab] = useState<TabId>('home');
  const [chatOpen, setChatOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState<LedgerFilters>({ preset: 'all', type: 'all' });
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [accountViewId, setAccountViewId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tracked, setTracked] = useState<TrackedItem[]>(() => LS.read<TrackedItem[]>('tracked', []));
  const [settledReimbursements, setSettledReimbursements] = useState<string[]>(() => LS.read<string[]>('settledReimb', []));

  const addTracked = useCallback(
    (item: Omit<TrackedItem, 'id' | 'createdAt' | 'status'>) => {
      const full: TrackedItem = { id: 'tr' + Date.now(), createdAt: Date.now(), status: 'open', ...item };
      setTracked((cur) => {
        const next = [full, ...cur];
        LS.write('tracked', next);
        return next;
      });
    },
    [],
  );
  const updateTracked = useCallback((id: string, changes: Partial<TrackedItem>) => {
    setTracked((cur) => {
      const next = cur.map((t) => (t.id === id ? { ...t, ...changes } : t));
      LS.write('tracked', next);
      return next;
    });
  }, []);
  const settleTracked = useCallback((id: string) => updateTracked(id, { status: 'settled' }), [updateTracked]);
  const removeTracked = useCallback(
    (id: string) => setTracked((cur) => {
      const next = cur.filter((t) => t.id !== id);
      LS.write('tracked', next);
      return next;
    }),
    [],
  );
  // editable EMIs & subscriptions (seed + user + overrides + removals)
  const [emiVersion, setEmiVersion] = useState(0);
  const [subVersion, setSubVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const emis = useMemo(() => allEmis(), [emiVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subs = useMemo(() => allSubs(), [subVersion]);
  const addEmi = useCallback((e: Omit<Emi, 'id'>) => {
    const list = LS.read<Emi[]>('userEmis', []);
    LS.write('userEmis', [{ id: 'ue' + Date.now(), ...e }, ...list]);
    setEmiVersion((v) => v + 1);
  }, []);
  const updateEmi = useCallback((id: string, changes: Partial<Emi>) => {
    const ov = LS.read<Record<string, Partial<Emi>>>('emiOverrides', {});
    ov[id] = { ...ov[id], ...changes };
    LS.write('emiOverrides', ov);
    setEmiVersion((v) => v + 1);
  }, []);
  const removeEmi = useCallback((id: string) => {
    const r = LS.read<string[]>('removedEmis', []);
    if (!r.includes(id)) LS.write('removedEmis', [...r, id]);
    setEmiVersion((v) => v + 1);
  }, []);
  const addSub = useCallback((s: Omit<Sub, 'id'>) => {
    const list = LS.read<Sub[]>('userSubs', []);
    LS.write('userSubs', [{ id: 'us' + Date.now(), ...s }, ...list]);
    setSubVersion((v) => v + 1);
  }, []);
  const updateSub = useCallback((id: string, changes: Partial<Sub>) => {
    const ov = LS.read<Record<string, Partial<Sub>>>('subOverrides', {});
    ov[id] = { ...ov[id], ...changes };
    LS.write('subOverrides', ov);
    setSubVersion((v) => v + 1);
  }, []);
  const removeSub = useCallback((id: string) => {
    const r = LS.read<string[]>('removedSubs', []);
    if (!r.includes(id)) LS.write('removedSubs', [...r, id]);
    setSubVersion((v) => v + 1);
  }, []);

  const settleReimbursement = useCallback((txnId: string) => {
    setSettledReimbursements((cur) => {
      if (cur.includes(txnId)) return cur;
      const next = [...cur, txnId];
      LS.write('settledReimb', next);
      return next;
    });
  }, []);
  const [currency, setCurrency] = useState<CurrencyCode>(() => LS.read<CurrencyCode>('currency', 'AED'));
  const [profile, setProfile] = useState<Profile>(() => LS.read<Profile>('profile', { name: 'Adam' }));
  const updateProfile = useCallback((changes: Partial<Profile>) => {
    setProfile((cur) => {
      const next = { ...cur, ...changes };
      LS.write('profile', next);
      return next;
    });
  }, []);

  // transactions: seed + user-added. Edits/deletes of ANY txn (incl. seed) are
  // supported via an overrides map + removed set, so the Activity list is fully editable.
  const [userTxns, setUserTxns] = useState<Txn[]>(() => LS.read<Txn[]>('userTxns', []));
  const [txnOverrides, setTxnOverrides] = useState<Record<string, Partial<Txn>>>(() => LS.read('txnOverrides', {}));
  const [removedTxns, setRemovedTxns] = useState<string[]>(() => LS.read<string[]>('removedTxns', []));
  const txns = useMemo(() => {
    const removed = new Set(removedTxns);
    const seed = demoOff() ? [] : seedTxns;
    return [...userTxns, ...seed]
      .filter((t) => !removed.has(t.id))
      .map((t) => (txnOverrides[t.id] ? { ...t, ...txnOverrides[t.id] } : t));
  }, [userTxns, txnOverrides, removedTxns]);
  const addTxn = useCallback((x: NewTxn): string => {
    const id = 'u' + Date.now();
    const txn: Txn = { id, ts: Date.now(), ...x };
    setUserTxns((cur) => {
      const next = [txn, ...cur];
      LS.write('userTxns', next);
      return next;
    });
    // Always flag money leaving the designated savings account.
    const savId = LS.read<string | null>('savingsAccountId', null);
    if (savId && x.account === savId && !x.income && !x.transfer && x.amount > 0) {
      showToast(`⚠️ ${fmt(x.amount, currency)} left your savings`);
    }
    return id;
  }, [showToast, currency]);
  const addTransfer = useCallback((from: string, to: string, amount: number, note?: string, charge?: number) => {
    if (!from || !to || from === to || !(amount > 0)) return;
    const savId = LS.read<string | null>('savingsAccountId', null);
    if (savId && from === savId) showToast(`⚠️ ${fmt(amount, currency)} moved out of savings`);
    setUserTxns((cur) => {
      const id = 'u' + Date.now();
      const txn: Txn = { id, ts: Date.now(), merchant: note || 'Transfer', cat: 'other', amount, account: from, counterAccount: to, transfer: true, nec: 5, byPenny: false };
      const list = [txn, ...cur];
      // Bank/processing charge (e.g. ~1.05% on a credit-card payment) — its own
      // row on the paying account, linked to the transfer for traceability.
      if (charge && charge > 0) {
        list.unshift({ id: 'uf' + Date.now(), ts: Date.now() + 1, merchant: 'Transfer charge', cat: 'bills', amount: charge, account: from, nec: 5, tag: 'fee', linkedTo: id, byPenny: false });
      }
      LS.write('userTxns', list);
      return list;
    });
  }, [showToast, currency]);
  const updateTxn = useCallback((id: string, changes: Partial<Txn>) => {
    const userList = LS.read<Txn[]>('userTxns', []);
    if (userList.some((t) => t.id === id)) {
      setUserTxns((cur) => {
        const next = cur.map((t) => (t.id === id ? { ...t, ...changes } : t));
        LS.write('userTxns', next);
        return next;
      });
    } else {
      setTxnOverrides((cur) => {
        const next = { ...cur, [id]: { ...cur[id], ...changes } };
        LS.write('txnOverrides', next);
        return next;
      });
    }
  }, []);
  const removeTxn = useCallback((id: string) => {
    const userList = LS.read<Txn[]>('userTxns', []);
    if (userList.some((t) => t.id === id)) {
      setUserTxns((cur) => {
        const next = cur.filter((t) => t.id !== id);
        LS.write('userTxns', next);
        return next;
      });
    } else {
      setRemovedTxns((cur) => {
        if (cur.includes(id)) return cur;
        const next = [...cur, id];
        LS.write('removedTxns', next);
        return next;
      });
    }
  }, []);

  // accounts (Penny-created, persisted). acctVersion cache-busts the localStorage read.
  const [acctVersion, setAcctVersion] = useState(0);
  // Balance is DERIVED from txns, so re-derive whenever txns change (e.g. a delete).
  const accounts = useMemo(
    () => allAccounts().map((a) => ({ ...a, balance: accountBalanceFromTxns(a.id, txns) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acctVersion, txns],
  );
  const addAccount = useCallback((a: ParsedAccount & { openingDate?: string }) => {
    const list = LS.read<Account[]>('userAccounts', []);
    const [bg, fg] = USER_ACCT_BGS[list.length % USER_ACCT_BGS.length];
    const id = 'ua' + Date.now();
    const { openingDate, balance, ...rest } = a;
    // Balance is derived from txns, so the account stores 0 and we post an opening entry.
    LS.write('userAccounts', [...list, { id, last4: null, note: '', bg, fg, ...rest, balance: 0 }]);
    const opening = Number(balance) || 0;
    if (opening !== 0) {
      const parsed = openingDate ? Date.parse(openingDate) : NaN;
      const ts = isNaN(parsed) ? Date.now() : parsed;
      const otx: Txn = { id: 'uo' + Date.now(), ts, merchant: 'Opening balance', cat: opening >= 0 ? 'income' : 'other', amount: Math.abs(opening), account: id, nec: 5, income: opening >= 0, byPenny: false };
      setUserTxns((cur) => { const next = [otx, ...cur]; LS.write('userTxns', next); return next; });
    }
    setAcctVersion((v) => v + 1);
  }, []);
  const [acctHistory, setAcctHistory] = useState<AccountChange[]>(() => LS.read<AccountChange[]>('acctHistory', []));
  const logAcctChange = useCallback((c: Omit<AccountChange, 'id' | 'ts'>) => {
    setAcctHistory((cur) => {
      const next = [{ id: 'ah' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), ...c }, ...cur].slice(0, 200);
      LS.write('acctHistory', next);
      return next;
    });
  }, []);
  const updateAccount = useCallback((id: string, changes: Partial<Account>) => {
    // Audit non-monetary changes (credit limit / due date) so they're traceable.
    const prev = allAccounts().find((a) => a.id === id);
    if (prev) {
      if (typeof changes.creditLimit === 'number' && Math.abs(changes.creditLimit) !== (prev.creditLimit || 0)) {
        logAcctChange({ accountId: id, kind: 'limit', from: String(prev.creditLimit || 0), to: String(Math.abs(changes.creditLimit)) });
      }
      if (changes.dueDate !== undefined && (changes.dueDate || '') !== (prev.dueDate || '')) {
        logAcctChange({ accountId: id, kind: 'due', from: prev.dueDate || '—', to: changes.dueDate || '—' });
      }
    }
    const overrides = LS.read<Record<string, Partial<Account>>>('accountOverrides', {});
    overrides[id] = { ...overrides[id], ...changes };
    LS.write('accountOverrides', overrides);
    setAcctVersion((v) => v + 1);
  }, [logAcctChange]);
  const acctHistoryFor = useCallback((id: string) => acctHistory.filter((h) => h.accountId === id), [acctHistory]);
  const removeAccount = useCallback((id: string) => {
    const userList = LS.read<Account[]>('userAccounts', []);
    if (userList.some((a) => a.id === id)) {
      LS.write('userAccounts', userList.filter((a) => a.id !== id));
    } else {
      const removed = LS.read<string[]>('removedAccounts', []);
      if (!removed.includes(id)) LS.write('removedAccounts', [...removed, id]);
    }
    // Remove the account's own transactions too (incl. its opening entry); for any
    // transfers touching it, just detach the gone side so the other account is unaffected.
    setUserTxns((cur) => {
      const next = cur
        .filter((t) => !(t.account === id && !t.transfer))
        .filter((t) => !(t.transfer && t.account === id && t.counterAccount === id))
        .map((t) => (t.transfer && t.account === id ? { ...t, account: '' } : t.transfer && t.counterAccount === id ? { ...t, counterAccount: '' } : t));
      LS.write('userTxns', next);
      return next;
    });
    setAcctVersion((v) => v + 1);
  }, []);

  // ---- shopping lists (multiple) + master catalog with learned prices ----
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>(() => {
    const saved = LS.read<ShoppingList[]>('shoppingLists', []);
    if (saved.length) return saved;
    const legacy = LS.read<GroceryItem[]>('grocery', demoOff() ? [] : GROCERY);
    return [{ id: 'sl' + Date.now(), name: 'Shopping list', status: 'open', createdAt: Date.now(), items: legacy }];
  });
  const [master, setMaster] = useState<MasterItem[]>(() => LS.read<MasterItem[]>('shoppingMaster', []));
  const openList = shoppingLists.find((l) => l.status === 'open') || null;

  const upsertMaster = useCallback((name: string, price?: number) => {
    const key = normItem(name);
    if (!key) return;
    setMaster((cur) => {
      const i = cur.findIndex((m) => m.key === key);
      let next: MasterItem[];
      if (i >= 0) {
        const m = cur[i];
        const count = m.count + 1;
        const avgPrice = price != null && price > 0 ? (m.avgPrice != null ? (m.avgPrice * m.count + price) / count : price) : m.avgPrice;
        next = [...cur];
        next[i] = { ...m, count, avgPrice };
      } else {
        next = [{ key, label: name, avgPrice: price && price > 0 ? price : undefined, count: 1 }, ...cur];
      }
      LS.write('shoppingMaster', next);
      return next;
    });
  }, []);

  const mutateOpen = useCallback((fn: (items: GroceryItem[]) => GroceryItem[]) => {
    setShoppingLists((cur) => {
      let lists = cur;
      let open = cur.find((l) => l.status === 'open');
      if (!open) {
        open = { id: 'sl' + Date.now(), name: 'Shopping list', status: 'open', createdAt: Date.now(), items: [] };
        lists = [open, ...cur];
      }
      const next = lists.map((l) => (l.id === open!.id ? { ...l, items: fn(l.items) } : l));
      LS.write('shoppingLists', next);
      return next;
    });
  }, []);

  const addShoppingItem = useCallback(
    (name: string, qty?: string) => {
      const n = name.trim();
      if (!n) return;
      const label = n[0].toUpperCase() + n.slice(1);
      const est = LS.read<MasterItem[]>('shoppingMaster', []).find((m) => m.key === normItem(n))?.avgPrice;
      mutateOpen((items) => [
        ...items.filter((g) => g.name.toLowerCase() !== label.toLowerCase()),
        { id: 'g' + Date.now() + Math.random().toString(36).slice(2, 5), name: label, qty, estPrice: est },
      ]);
      upsertMaster(n);
      showToast(`"${label}" added`);
    },
    [mutateOpen, upsertMaster, showToast],
  );
  const toggleShoppingItem = useCallback((id: string) => mutateOpen((items) => items.map((g) => (g.id === id ? { ...g, done: !g.done } : g))), [mutateOpen]);
  const removeShoppingItem = useCallback((id: string) => mutateOpen((items) => items.filter((g) => g.id !== id)), [mutateOpen]);
  const removeByName = useCallback((name: string) => mutateOpen((items) => items.filter((g) => !g.name.toLowerCase().includes(name.toLowerCase()))), [mutateOpen]);
  const setItemPrice = useCallback((id: string, price: number) => { mutateOpen((items) => items.map((g) => (g.id === id ? { ...g, estPrice: price } : g))); }, [mutateOpen]);
  const learnPrices = useCallback((items: { n: string; a: number }[]) => { items.forEach((it) => upsertMaster(it.n, it.a)); }, [upsertMaster]);

  const estimateOpenList = useCallback((): { total: number; priced: number; unknown: number } => {
    const list = shoppingLists.find((l) => l.status === 'open');
    if (!list) return { total: 0, priced: 0, unknown: 0 };
    let total = 0, priced = 0, unknown = 0;
    for (const it of list.items) {
      if (it.done) continue;
      if (it.estPrice != null && it.estPrice > 0) { total += it.estPrice; priced++; } else unknown++;
    }
    return { total, priced, unknown };
  }, [shoppingLists]);

  const newShoppingList = useCallback((name?: string) => {
    setShoppingLists((cur) => {
      const next: ShoppingList[] = [{ id: 'sl' + Date.now(), name: name || 'Shopping list', status: 'open', createdAt: Date.now(), items: [] }, ...cur];
      LS.write('shoppingLists', next);
      return next;
    });
  }, []);

  const finishShopping = useCallback(
    (opts: { amount: number; merchant?: string; account?: string }) => {
      const est = estimateOpenList().total;
      addTxn({ merchant: opts.merchant || 'Groceries', cat: 'groceries', amount: opts.amount, account: opts.account || 'cash', nec: 8, byPenny: false });
      setShoppingLists((cur) => {
        const open = cur.find((l) => l.status === 'open');
        if (!open) return cur;
        const next = cur.map((l) => (l.id === open.id ? { ...l, status: 'done' as const, completedAt: Date.now(), estimateAED: est, actualAED: opts.amount, merchant: opts.merchant } : l));
        LS.write('shoppingLists', next);
        return next;
      });
    },
    [estimateOpenList, addTxn],
  );

  // backward-compatible grocery wrappers (operate on the open list)
  const grocery = openList ? openList.items : [];
  const addGrocery = addShoppingItem;
  const removeGroceryByName = removeByName;
  const toggleGrocery = toggleShoppingItem;

  const setCurrencyPersist = useCallback((c: CurrencyCode) => {
    setCurrency(c);
    LS.write('currency', c);
  }, []);

  // ---- category → subcategory tree (declared early so reloadAll can refresh it) ----
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSection, setSetupSection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [savingsAccountId, setSavingsAccountId] = useState<string | null>(() => LS.read<string | null>('savingsAccountId', null));
  const [onboarded, setOnboarded] = useState<boolean>(() => readOnboarded());
  const [sharedPayload, setSharedPayload] = useState<SharedPayload | null>(null);
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>(() => readCatTree());

  // ---- Supabase sync: shared Space + realtime (last-write-wins) ----
  const [syncState, setSyncState] = useState<SyncState>('off');
  const [syncDetail, setSyncDetail] = useState('');

  // Pull every synced collection back out of localStorage into React state.
  // Called after a remote change lands so both devices stay in lockstep.
  const reloadAll = useCallback(() => {
    setUserTxns(LS.read<Txn[]>('userTxns', []));
    setTxnOverrides(LS.read('txnOverrides', {}));
    setRemovedTxns(LS.read<string[]>('removedTxns', []));
    setAcctHistory(LS.read<AccountChange[]>('acctHistory', []));
    setTracked(LS.read<TrackedItem[]>('tracked', []));
    setSettledReimbursements(LS.read<string[]>('settledReimb', []));
    setCurrency(LS.read<CurrencyCode>('currency', 'AED'));
    setSavingsAccountId(LS.read<string | null>('savingsAccountId', null));
    setMaster(LS.read<MasterItem[]>('shoppingMaster', []));
    const lists = LS.read<ShoppingList[]>('shoppingLists', []);
    if (lists.length) setShoppingLists(lists);
    setCategories(readCatTree());
    setAcctVersion((v) => v + 1);
    setEmiVersion((v) => v + 1);
    setSubVersion((v) => v + 1);
  }, []);

  const startedRef = useRef(false);
  useEffect(() => {
    // Install the write-hook so every local mutation of a shared doc is pushed.
    onLSWrite(syncWriteHook);
    sync.setStateCb((s, detail) => {
      setSyncState(s);
      setSyncDetail(detail || '');
    });
    if (hasSupabase() && !startedRef.current) {
      startedRef.current = true;
      void sync.start(reloadAll);
    }
    return () => onLSWrite(null);
  }, [reloadAll]);

  // Receive files/text shared into Penny from the OS share sheet — on launch and on
  // every resume (Android relaunches the app for a share). Opens chat pre-attached.
  useEffect(() => {
    const run = () => {
      void checkShared().then((p) => {
        if (p) { setSharedPayload(p); setChatOpen(true); }
      });
    };
    run();
    let remove: (() => void) | undefined;
    void CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) run(); }).then((h) => { remove = () => h.remove(); });
    // Dev-only: simulate an OS share from the browser preview (stripped in prod).
    if (import.meta.env.DEV) {
      (window as unknown as { __pennyShare?: (p: SharedPayload) => void }).__pennyShare = (p: SharedPayload) => { setSharedPayload(p); setChatOpen(true); };
    }
    return () => remove?.();
  }, []);

  const syncNow = useCallback(() => {
    if (!hasSupabase()) return;
    if (!startedRef.current) {
      startedRef.current = true;
      void sync.start(reloadAll);
    } else {
      void sync.syncNow();
    }
  }, [reloadAll]);

  const reconnectSync = useCallback(() => {
    startedRef.current = true;
    void sync.restart(reloadAll);
  }, [reloadAll]);

  // ---- category → subcategory tree (CRUD; state declared above) ----
  const persistCats = useCallback((next: CategoryNode[]) => {
    setCategories(next);
    writeCatTree(next);
  }, []);
  const addCategory = useCallback((label: string) => {
    const name = label.trim();
    if (!name) return;
    const [color, tint] = CAT_PALETTE[categories.length % CAT_PALETTE.length];
    persistCats([...categories, { id: newCatId(name), label: name, color, tint, icon: 'dots', subs: [] }]);
  }, [categories, persistCats]);
  const updateCategory = useCallback((id: string, changes: Partial<CategoryNode>) => {
    persistCats(categories.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }, [categories, persistCats]);
  const removeCategory = useCallback((id: string) => {
    persistCats(categories.filter((c) => c.id !== id));
  }, [categories, persistCats]);
  const addSubcategory = useCallback((catId: string, label: string) => {
    const name = label.trim();
    if (!name) return;
    persistCats(categories.map((c) => (c.id === catId ? { ...c, subs: [...c.subs, { id: newSubId(catId, name), label: name }] } : c)));
  }, [categories, persistCats]);
  const updateSubcategory = useCallback((catId: string, subId: string, label: string) => {
    persistCats(categories.map((c) => (c.id === catId ? { ...c, subs: c.subs.map((s) => (s.id === subId ? { ...s, label } : s)) } : c)));
  }, [categories, persistCats]);
  const removeSubcategory = useCallback((catId: string, subId: string) => {
    persistCats(categories.map((c) => (c.id === catId ? { ...c, subs: c.subs.filter((s) => s.id !== subId) } : c)));
  }, [categories, persistCats]);
  const setCategoryTree = useCallback((tree: CategoryNode[]) => persistCats(tree), [persistCats]);
  const categoryUsage = useCallback((catId: string, subId?: string): number => {
    return txns.filter((t) => (subId ? t.sub === subId : t.cat === catId)).length;
  }, [txns]);

  const api: AppApi = {
    txns,
    addTxn,
    addTransfer,
    updateTxn,
    removeTxn,
    editTxnId,
    openTxnEditor: (id: string) => setEditTxnId(id),
    closeTxnEditor: () => setEditTxnId(null),
    acctHistoryFor,
    currency,
    setCurrency: setCurrencyPersist,
    profile,
    updateProfile,
    accounts,
    addAccount,
    updateAccount,
    removeAccount,
    grocery,
    addGrocery,
    removeGroceryByName,
    toggleGrocery,
    shoppingLists,
    master,
    openList,
    addShoppingItem,
    toggleShoppingItem,
    removeShoppingItem,
    setItemPrice,
    estimateOpenList,
    newShoppingList,
    finishShopping,
    learnPrices,
    toast: showToast,
    go: setTab,
    tab,
    openChat: () => setChatOpen(true),
    closeChat: () => setChatOpen(false),
    chatOpen,
    ledgerOpen,
    ledgerFilters,
    openLedger: (filters?: LedgerFilters) => {
      setLedgerFilters(filters || { preset: 'all', type: 'all' });
      setChatOpen(false);
      setLedgerOpen(true);
    },
    closeLedger: () => setLedgerOpen(false),
    tracked,
    settledReimbursements,
    addTracked,
    updateTracked,
    settleTracked,
    removeTracked,
    settleReimbursement,
    moneyOpen,
    openMoney: () => {
      setChatOpen(false);
      setMoneyOpen(true);
    },
    closeMoney: () => setMoneyOpen(false),
    accountViewId,
    openAccount: (id: string) => setAccountViewId(id),
    closeAccount: () => setAccountViewId(null),
    settingsOpen,
    openSettings: () => {
      setChatOpen(false);
      setSettingsOpen(true);
    },
    closeSettings: () => setSettingsOpen(false),
    emis,
    subs,
    addEmi,
    updateEmi,
    removeEmi,
    addSub,
    updateSub,
    removeSub,
    syncState,
    syncDetail,
    syncNow,
    reconnectSync,
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    addSubcategory,
    updateSubcategory,
    removeSubcategory,
    setCategoryTree,
    categoryUsage,
    setupOpen,
    setupSection,
    openSetup: (section?: string) => {
      setSettingsOpen(false);
      setMenuOpen(false);
      setSetupSection(section ?? null);
      setSetupOpen(true);
    },
    closeSetup: () => setSetupOpen(false),
    menuOpen,
    openMenu: () => {
      setChatOpen(false);
      setMenuOpen(true);
    },
    closeMenu: () => setMenuOpen(false),
    savingsAccountId,
    setSavingsAccount: (id: string | null) => {
      setSavingsAccountId(id);
      LS.write('savingsAccountId', id);
    },
    notificationsOpen,
    openNotifications: () => {
      setChatOpen(false);
      setNotificationsOpen(true);
    },
    closeNotifications: () => setNotificationsOpen(false),
    onboarded,
    completeOnboarding: () => {
      setOnboarded(true);
      LS.write('onboarded', true);
    },
    sharedPayload,
    openChatWithShare: (p: SharedPayload) => {
      setSharedPayload(p);
      setChatOpen(true);
    },
    clearShared: () => setSharedPayload(null),
    clearAllData: () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('penny.'))
          .forEach((k) => localStorage.removeItem(k));
        // Set AFTER the wipe so it survives: suppresses the demo seed data so the
        // app comes back genuinely empty (not repopulated with sample accounts/txns).
        localStorage.setItem('penny.noDemo', 'true');
      } catch {
        /* ignore */
      }
      // Hard reload (all platforms) — a fresh JS context re-reads the cleared
      // storage and lands on onboarding. (exitApp could warm-restart with stale
      // in-memory state, so the wipe wouldn't show.)
      setTimeout(() => window.location.reload(), 120);
    },
    profileOpen,
    openProfile: () => setProfileOpen(true),
    closeProfile: () => setProfileOpen(false),
    manualOpen,
    openManual: () => setManualOpen(true),
    closeManual: () => setManualOpen(false),
  };

  return (
    <AppContext.Provider value={api}>
      {children}
      <Toast toast={toast} />
    </AppContext.Provider>
  );
}
