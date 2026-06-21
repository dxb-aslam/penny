// Penny Agent v2 — context assembler. Builds the per-user USER block appended to
// the static prompt at runtime (accounts, categories, profile, txn schema).
import type { Account, CategoryNode, CreditLine } from '../types';
import { lineAvailable, lineOutstanding } from '../finance';

export interface CtxInput {
  name: string;
  currency: string;
  accounts: Account[];
  categories: CategoryNode[];
  creditLines?: CreditLine[];
}

const TYPE = (g: string) => (g === 'card' ? 'card' : g === 'wallet' ? 'wallet' : 'bank');

/** Lean tier (P1) — minimal: accounts + category ids. */
export function leanUserBlock(c: CtxInput): string {
  const accts = c.accounts.length
    ? c.accounts.map((a) => `${a.id}|${a.name}|${TYPE(a.group)}|${Math.round(a.balance)}`).join(' · ')
    : '(none yet)';
  const primary = c.accounts[0]?.id || '-';
  const cats = c.categories.map((cat) => cat.id).join(' ');
  return `\nACCOUNTS  id|name|type|balance\n${accts}   (primary: ${primary})\nCATS  ${cats}`;
}

/** Full tier (P2) — richer: profile, accounts w/ card details, category tree, txn schema. */
export function fullUserBlock(c: CtxInput): string {
  const lines = c.creditLines || [];
  const accts = c.accounts.length
    ? c.accounts.map((a) => `${a.id}|${a.name}|${TYPE(a.group)}|${Math.round(a.balance)}|${a.last4 || '-'}|${a.creditLimit || '-'}|${a.dueDate || (a.statementDay ? `day${a.statementDay}+${a.dueDays ?? '?'}d` : '-')}${a.creditLineId ? `|line:${a.creditLineId}` : ''}`).join(' · ')
    : '(none yet — help the user add one)';
  const primary = c.accounts[0]?.id || '-';
  const cats = c.categories.map((cat) => `${cat.id}→${cat.label}[${cat.subs.map((s) => s.id.split(':').pop()).join(',')}]`).join(' ');
  // Pre-computed line figures — the agent READS available/used, never recomputes.
  const lineBlock = lines.length
    ? '\nCREDIT LINES (shared limits — read available/used from here, not per-card)  id|bank|sharedLimit|used|available|cards\n ' +
      lines.map((l) => {
        const members = c.accounts.filter((a) => a.creditLineId === l.id);
        return `${l.id}|${l.bank}|${l.sharedLimit}|${Math.round(lineOutstanding(members))}|${Math.round(lineAvailable(l.sharedLimit, members))}|${members.map((m) => m.id).join(',') || '-'}`;
      }).join(' · ')
    : '';
  return `\n--- USER ---\nprofile {name:${c.name}, currency:${c.currency}, tz:Asia/Dubai}\nACCOUNTS id|name|type|balance|last4|limit|due[|line:id]\n ${accts}  (primary ${primary})${lineBlock}\nCATS id→label[subs]\n ${cats}\nTXN schema  id ts(ms) merchant cat(fk) sub? amount account(fk) nec(1-10) items(json)? tag(fee|interest|epp|cash_advance)? recurring? income? transfer? counterAccount?`;
}
