// Penny Agent v2 — the data DRIVER bound to the running app (AppContext). Maps
// the executor's table ops onto the existing CRUD methods + in-memory rows.
// (Swappable: a SQLite driver would implement the same AgentData interface.)
import type { AppApi } from '../../state/AppContext';
import type { AgentData } from './executor';
import type { CategoryId, ExpenseItem, ParsedExpense, TrackKind } from '../types';

const n = (v: unknown): number => (v === '' || v == null ? 0 : Number(v) || 0);
const s = (v: unknown): string => (v == null ? '' : String(v));
const dateMs = (v: unknown): number | undefined => { if (v == null || v === '') return undefined; const t = Date.parse(s(v)); return isNaN(t) ? undefined : t; };
function items(v: unknown): ExpenseItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((it) => (Array.isArray(it) ? { n: s(it[0]), a: n(it[1]) } : null)).filter(Boolean) as ExpenseItem[];
  return out.length ? out : undefined;
}

export function makeAgentData(app: AppApi): AgentData {
  return {
    rows(table) {
      switch (table) {
        case 'txn': return app.txns as unknown as Record<string, unknown>[];
        case 'account': return app.accounts as unknown as Record<string, unknown>[];
        case 'sub': return app.subs as unknown as Record<string, unknown>[];
        case 'emi': return app.emis as unknown as Record<string, unknown>[];
        case 'tracked_item': return app.tracked as unknown as Record<string, unknown>[];
        case 'category': return app.categories as unknown as Record<string, unknown>[];
        case 'grocery_item': return ((app.openList?.items) || []) as unknown as Record<string, unknown>[];
        case 'credit_line': return app.creditLines as unknown as Record<string, unknown>[];
        case 'profile': return [app.profile] as unknown as Record<string, unknown>[];
        default: return [];
      }
    },
    add(table, o) {
      switch (table) {
        case 'txn': {
          const expense: ParsedExpense = {
            merchant: s(o.merchant) || 'Expense', total: Math.abs(n(o.amount)), currency: app.currency,
            category: (s(o.cat) || 'other') as CategoryId, account: s(o.account), items: items(o.items) || [],
            necessity: Math.max(1, Math.min(10, Math.round(n(o.nec)) || 5)), necessityNote: '',
          };
          const txnId = app.addTxn({
            merchant: expense.merchant, cat: expense.category, amount: expense.total, account: expense.account,
            nec: expense.necessity, items: expense.items, byPenny: true,
            ...(expense.category === 'income' ? { income: true } : {}),
            ...(o.sub ? { sub: s(o.sub) } : {}),
          });
          if (expense.category === 'groceries' && expense.items) app.learnPrices(expense.items.map((i) => ({ n: i.n, a: i.a })));
          return { ok: true, kind: 'expense', data: { expense, txnId } };
        }
        case 'account': {
          app.addAccount({ name: s(o.name) || 'Account', group: (s(o.group) || 'bank') as 'bank' | 'card' | 'wallet', currency: app.currency, balance: n(o.balance), creditLimit: o.creditLimit ? Math.abs(n(o.creditLimit)) : undefined, last4: o.last4 ? s(o.last4).replace(/\D/g, '').slice(0, 4) : undefined });
          return { ok: true, kind: 'account', data: { name: s(o.name) } };
        }
        case 'transfer': {
          app.addTransfer(s(o.from), s(o.to), Math.abs(n(o.amount)), undefined, o.charge ? Math.abs(n(o.charge)) : undefined);
          return { ok: true, kind: 'transfer' };
        }
        case 'sub': {
          app.addSub({ name: s(o.name) || 'Subscription', amount: Math.abs(n(o.amount)), every: s(o.every) || 'month', nextIn: 30, cat: (s(o.cat) || 'subs') as CategoryId, essential: !!o.essential });
          return { ok: true, kind: 'sub' };
        }
        case 'emi': {
          const months = Math.round(n(o.months)) || 12;
          app.addEmi({ name: s(o.name) || 'Loan', lender: s(o.lender), monthly: Math.abs(n(o.monthly)), principal: Math.abs(n(o.principal)), remaining: o.remaining !== undefined ? Math.abs(n(o.remaining)) : Math.abs(n(o.principal)), months, monthsLeft: months, rate: n(o.rate), interestMo: 0 });
          return { ok: true, kind: 'emi' };
        }
        case 'tracked_item': {
          app.addTracked({ kind: (s(o.kind) || 'receivable') as TrackKind, title: s(o.title) || s(o.counterparty) || 'Item', counterparty: o.counterparty ? s(o.counterparty) : undefined, amount: Math.abs(n(o.amount)), dueDate: dateMs(o.dueDate), recurring: !!o.recurring, interestRate: o.interestRate ? Math.abs(n(o.interestRate)) : undefined });
          return { ok: true, kind: 'tracked' };
        }
        case 'credit_line': { const id = app.addCreditLine({ bank: s(o.bank) || s(o.name) || 'Card', name: o.name ? s(o.name) : undefined, sharedLimit: Math.abs(n(o.sharedLimit)), currency: app.currency, note: o.note ? s(o.note) : undefined }); return { ok: true, kind: 'credit_line', data: { id } }; }
        case 'grocery_item': { app.addGrocery(s(o.name)); return { ok: true, kind: 'grocery' }; }
        case 'category': { app.addCategory(s(o.label) || s(o.name) || 'Category'); return { ok: true, kind: 'category' }; }
        case 'shopping_list': { app.newShoppingList(o.name ? s(o.name) : undefined); return { ok: true, kind: 'list' }; }
        case 'profile': { app.updateProfile({ name: s(o.name) }); return { ok: true, kind: 'profile' }; }
        default: return { ok: false, error: `cannot add to ${table}` };
      }
    },
    update(table, id, c) {
      try {
        switch (table) {
          case 'txn': app.updateTxn(id, cleanTxn(c)); return true;
          case 'account': {
            // Balance is DERIVED from txns — a raw override is ignored. Reconcile a
            // requested balance by posting a dated adjustment entry instead.
            const c2 = { ...c };
            if (c2.balance !== undefined) {
              const cur = app.accounts.find((a) => a.id === id);
              const delta = n(c2.balance) - (cur ? cur.balance : 0);
              if (delta !== 0) app.addTxn({ merchant: 'Balance adjustment', cat: delta >= 0 ? 'income' : 'other', amount: Math.abs(delta), account: id, nec: 5, income: delta >= 0, byPenny: true });
              delete c2.balance;
            }
            if (Object.keys(c2).length) app.updateAccount(id, c2);
            return true;
          }
          case 'sub': app.updateSub(id, c); return true;
          case 'emi': app.updateEmi(id, c); return true;
          case 'tracked_item': { if (s(c.status) === 'settled') app.settleTracked(id); else app.updateTracked(id, c); return true; }
          case 'category': app.updateCategory(id, c); return true;
          case 'credit_line': app.updateCreditLine(id, c); return true;
          case 'profile': app.updateProfile({ name: s(c.name) }); return true;
          default: return false;
        }
      } catch { return false; }
    },
    remove(table, id) {
      try {
        switch (table) {
          case 'txn': app.removeTxn(id); return true;
          case 'account': app.removeAccount(id); return true;
          case 'sub': app.removeSub(id); return true;
          case 'emi': app.removeEmi(id); return true;
          case 'tracked_item': app.removeTracked(id); return true;
          case 'category': app.removeCategory(id); return true;
          case 'credit_line': app.removeCreditLine(id); return true;
          case 'grocery_item': {
            const it = (app.openList?.items || []).find((g) => g.id === id) as { name?: string; n?: string } | undefined;
            const nm = it?.name ?? it?.n;
            if (nm) { app.removeGroceryByName(nm); return true; }
            return false;
          }
          default: return false;
        }
      } catch { return false; }
    },
  };
}

function cleanTxn(c: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (c.merchant != null) out.merchant = s(c.merchant);
  if (c.cat != null) out.cat = s(c.cat);
  if (c.amount != null) out.amount = Math.abs(n(c.amount));
  if (c.account != null) out.account = s(c.account);
  if (c.nec != null) out.nec = Math.max(1, Math.min(10, Math.round(n(c.nec))));
  if (c.sub != null) out.sub = s(c.sub);
  return out;
}
