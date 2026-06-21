// Penny — builds a live financial snapshot from the user's REAL data, so Claude's
// insights reflect actual balances/spending instead of the static seed numbers.
import { BUDGET_MO, EMIS, INCOME_MO, SUBS, dayLabel, toAED } from './data';
import { currentAmount, itemsOfKind, owedToMe } from './money';
import type { Account, TrackedItem, Txn } from './types';

export interface ChatTurn {
  role: 'user' | 'agent';
  text: string;
}

function round(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function buildLiveSnapshot(
  txns: Txn[],
  accounts: Account[],
  tracked: TrackedItem[] = [],
  settledReimbursements: string[] = [],
): string {
  const net = accounts.reduce((s, a) => s + toAED(a), 0);
  const byGroup = (g: string) => accounts.filter((a) => (a.group || 'bank') === g);
  const groupLine = (label: string, g: string) => {
    const list = byGroup(g);
    if (!list.length) return '';
    const sub = list.reduce((s, a) => s + toAED(a), 0);
    const items = list
      .map((a) => `${a.name} ${round(toAED(a))}${a.creditLimit ? ` (limit ${round(a.creditLimit)}, used ${Math.round((Math.abs(a.balance) / a.creditLimit) * 100)}%)` : ''}`)
      .join('; ');
    return `${label} (${round(sub)} AED): ${items}.`;
  };

  const monthSpend = txns.filter((t) => !t.income).reduce((s, t) => s + t.amount, 0);
  const income = txns.filter((t) => t.income).reduce((s, t) => s + t.amount, 0) || INCOME_MO;

  const recent = [...txns]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map((t) => `${dayLabel(t.ts)}: ${t.merchant} ${t.income ? '+' : ''}${round(t.amount)} (${t.cat}, nec ${t.nec}/10${t.byPenny ? ', via Penny' : ''})`)
    .join('\n');

  const emiTotal = EMIS.reduce((s, e) => s + e.monthly, 0);
  const idleSubs = SUBS.filter((s) => s.flag).map((s) => `${s.name} ${s.amount} (idle ${s.lastUsed}d)`).join(', ');

  const idLegend = accounts.map((a) => `${a.id}=${a.name}`).join(', ');

  // money map
  const owed = owedToMe(tracked, txns, settledReimbursements);
  const owedTotal = owed.reduce((s, r) => s + r.amount, 0);
  const oweTotal = itemsOfKind(tracked, 'payable').reduce((s, p) => s + currentAmount(p), 0);
  const remit = itemsOfKind(tracked, 'remittance');
  const upcoming = itemsOfKind(tracked, 'upcoming');
  const expectedIncome = itemsOfKind(tracked, 'income');
  const moneyMap =
    owed.length || oweTotal || remit.length || upcoming.length || expectedIncome.length
      ? `\nMONEY MAP — owed to user ${round(owedTotal)} (${owed.map((r) => `${r.who} ${round(r.amount)}`).join(', ') || 'none'}); user owes ${round(oweTotal)}; send-home ${remit.map((r) => round(r.amount)).join('+') || '0'}; upcoming ${upcoming.map((u) => `${u.title} ${round(u.amount)}`).join(', ') || 'none'}; expected income ${expectedIncome.map((i) => (i.expectedMin ? `${round(i.expectedMin)}-${round(i.expectedMax || i.expectedMin)}` : round(i.amount))).join(', ') || 'none'}.`
      : '';

  return `LIVE SNAPSHOT (the user's actual current data, all AED):
ACCOUNT IDS (use these ids in ledger filters): ${idLegend}.
Net worth across ${accounts.length} accounts: ≈${round(net)}.
${groupLine('Banks', 'bank')}
${groupLine('Cards', 'card')}
${groupLine('Wallets/cash', 'wallet')}
Income ≈${round(income)}/mo; budget ${round(BUDGET_MO)}/mo; spent so far ${round(monthSpend)} (${Math.round((monthSpend / BUDGET_MO) * 100)}% of budget).
EMIs: ${EMIS.map((e) => `${e.name} ${e.monthly}/mo (${e.monthsLeft}mo left)`).join(', ')}. Total EMI ${round(emiTotal)}/mo = ${((emiTotal / income) * 100).toFixed(1)}% of income.
Recurring/idle subs: ${idleSubs || 'none flagged'}.${moneyMap}
Recent transactions:
${recent || '(none yet)'}`;
}

/** Tiny id↔label legend for the lean haiku tier — no balances/history/money-map. */
export function buildLegend(
  accounts: Account[],
  categories: { id: string; label: string }[] = [],
): string {
  const accts = accounts.map((a) => `${a.id}=${a.name}`).join(', ');
  const cats = categories.map((c) => `${c.id}=${c.label}`).join(', ');
  return `ACCOUNTS (id=name): ${accts}.\nCATEGORIES (id=label): ${cats || 'food, groceries, transport, shopping, bills, subs, health, home, fun, income, other'}.`;
}

export function buildConversationContext(turns: ChatTurn[]): string {
  if (!turns.length) return '';
  const lines = turns
    .filter((t) => t.text)
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'User' : 'Penny'}: ${t.text}`)
    .join('\n');
  return `RECENT CONVERSATION (for context — refer back to it naturally):\n${lines}`;
}
