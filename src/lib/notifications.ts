// Penny — notification center: the nudges + alerts that used to live in Coach,
// now derived from real data and surfaced through the Home bell.
import type { Account, CurrencyCode, Emi, Sub, Txn } from './types';
import type { IconName } from '../components/Icons';
import { BUDGET_MO, cardDue, fmt } from './data';
import { savingsBalance, savingsOutflows } from './savings';
import { computeHealth, readHealthTarget } from './health';

export type NotifTone = 'info' | 'warn' | 'good';
export type NotifAction = 'ledger' | 'track' | 'savings' | 'coach' | 'accounts' | 'money';

export interface NotifItem {
  id: string;
  tone: NotifTone;
  icon: IconName;
  title: string;
  body: string;
  action?: NotifAction;
  actionLabel?: string;
}

export interface NotifCtx {
  txns: Txn[];
  accounts: Account[];
  emis: Emi[];
  subs: Sub[];
  currency: CurrencyCode;
  budget: number;
  savingsAccountId: string | null;
  healthScore: number;
  healthTarget: number;
}


export function buildNotifications(c: NotifCtx): NotifItem[] {
  const items: NotifItem[] = [];
  const cur = c.currency;

  // 1 · money leaving the savings account (always flag this)
  for (const t of savingsOutflows(c.txns, c.savingsAccountId, 14).slice(0, 3)) {
    items.push({
      id: 'sav-' + t.id,
      tone: 'warn',
      icon: 'coins',
      title: 'Money left your savings',
      body: `${fmt(t.amount, cur)} — ${t.merchant}. Move it back when you can.`,
      action: 'savings',
      actionLabel: 'View savings',
    });
  }

  // 2 · cards due soon (statement-day + days rule, else fixed due date)
  for (const a of c.accounts) {
    if (a.group !== 'card' || a.balance >= 0) continue;
    const d = cardDue(a)?.inDays ?? null;
    if (d != null && d >= 0 && d <= 7) {
      items.push({
        id: 'due-' + a.id,
        tone: d <= 2 ? 'warn' : 'info',
        icon: 'calendar',
        title: `${a.name} payment due ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}`,
        body: `You owe ${fmt(Math.abs(a.balance), a.currency || cur)}. Pay before the due date to dodge interest.`,
        action: 'accounts',
        actionLabel: 'Open account',
      });
    }
  }

  // 3 · over budget this month
  const monthSpend = c.txns.filter((t) => !t.income && !t.transfer).reduce((s, t) => s + t.amount, 0);
  if (c.budget > 0 && monthSpend > c.budget) {
    items.push({
      id: 'budget',
      tone: 'warn',
      icon: 'flag',
      title: 'Over budget',
      body: `You've spent ${fmt(monthSpend, cur)} of your ${fmt(c.budget, cur)} budget.`,
      action: 'ledger',
      actionLabel: 'See spending',
    });
  }

  // 4 · subscriptions renewing soon
  for (const s of c.subs) {
    if (s.nextIn > 0 && s.nextIn <= 7) {
      items.push({
        id: 'sub-' + s.id,
        tone: 'info',
        icon: 'loop',
        title: `${s.name} renews in ${s.nextIn} day${s.nextIn === 1 ? '' : 's'}`,
        body: `${fmt(s.amount, cur)}${s.flag ? ` · ${s.flag}` : ''}. Cancel from Track if you don't use it.`,
        action: 'track',
        actionLabel: 'Track ▸ Recurring',
      });
    }
  }

  // 5 · health below target
  if (c.healthScore < c.healthTarget) {
    items.push({
      id: 'health',
      tone: 'info',
      icon: 'shield',
      title: `Health ${c.healthScore} · target ${c.healthTarget}`,
      body: `A few small moves would lift your score. See the recommendations in Coach.`,
      action: 'coach',
      actionLabel: 'Open Coach',
    });
  }

  return items;
}

/** Structural slice of the app state needed to build notifications. */
export interface NotifApp {
  txns: Txn[];
  accounts: Account[];
  emis: Emi[];
  subs: Sub[];
  currency: CurrencyCode;
  savingsAccountId: string | null;
}

/** Single source of truth — used by both the Home bell (count) and the panel (list). */
export function notificationsFor(app: NotifApp): NotifItem[] {
  const income = app.txns.filter((t) => t.income && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const monthSpend = app.txns.filter((t) => !t.income && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const emiTotal = app.emis.reduce((s, e) => s + e.monthly, 0);
  const cards = app.accounts.filter((a) => a.group === 'card' && a.creditLimit);
  const creditUsed = cards.reduce((s, a) => s + Math.max(0, -a.balance), 0);
  const creditLimit = cards.reduce((s, a) => s + (a.creditLimit || 0), 0);
  const sb = savingsBalance(app.accounts, app.savingsAccountId);
  const health = computeHealth({ income, monthSpend, budget: BUDGET_MO, emiTotal, creditUsed, creditLimit, savingsBalance: sb });
  return buildNotifications({
    txns: app.txns,
    accounts: app.accounts,
    emis: app.emis,
    subs: app.subs,
    currency: app.currency,
    budget: BUDGET_MO,
    savingsAccountId: app.savingsAccountId,
    healthScore: health.score,
    healthTarget: readHealthTarget(),
  });
}
