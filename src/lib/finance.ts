// Penny — shared credit-line math. DETERMINISTIC and the ONLY source of
// available/utilisation for a linked card: the UI and the agent both read these,
// neither recomputes. Unlinked cards never touch this (callers gate on creditLineId).
import type { Account, CreditLine } from './types';

/** Cards carry debt as a negative balance; outstanding = how much is owed. */
export const outstanding = (a: { balance: number }) => Math.max(0, -a.balance);

export function lineOutstanding(members: { balance: number }[]): number {
  return members.reduce((s, c) => s + outstanding(c), 0);
}
export function lineAvailable(sharedLimit: number, members: { balance: number }[]): number {
  return Math.max(0, sharedLimit - lineOutstanding(members));
}
export function lineUtilization(sharedLimit: number, members: { balance: number }[]): number {
  return sharedLimit ? lineOutstanding(members) / sharedLimit : 0;
}
/** Spendable on one card: the line pool, capped by an optional per-card sub-limit. */
export function cardSpendable(
  card: { balance: number; creditLimit?: number },
  sharedLimit: number,
  members: { balance: number }[],
): number {
  const lineAvail = lineAvailable(sharedLimit, members);
  if (card.creditLimit) return Math.min(lineAvail, Math.max(0, card.creditLimit - outstanding(card)));
  return lineAvail;
}

/** Resolved credit view for one card — line-level when linked, per-card otherwise.
 *  One function so the headline numbers are computed once and read everywhere. */
export interface CardCredit {
  linked: boolean;
  used: number;        // outstanding shown in the headline (line total when linked)
  limit: number;       // shared limit when linked, else the card's own
  available: number;   // cardSpendable when linked, else limit − used
  utilization: number; // 0..1 (line-level when linked)
  line: CreditLine | null;
  members: Account[];  // other-and-this member cards on the line
  subCap: number | null; // this card's own sub-limit when linked (null if none)
}

export function cardCredit(card: Account, lines: CreditLine[], accounts: Account[]): CardCredit | null {
  const line = card.creditLineId ? lines.find((l) => l.id === card.creditLineId) || null : null;
  if (line) {
    const members = accounts.filter((a) => a.creditLineId === line.id);
    return {
      linked: true,
      used: lineOutstanding(members),
      limit: line.sharedLimit,
      available: cardSpendable(card, line.sharedLimit, members),
      utilization: Math.min(1, lineUtilization(line.sharedLimit, members)),
      line,
      members,
      subCap: card.creditLimit ?? null,
    };
  }
  if (!card.creditLimit) return null; // not a limit-bearing card → no credit view
  const used = outstanding(card);
  return {
    linked: false,
    used,
    limit: card.creditLimit,
    available: Math.max(0, card.creditLimit - used),
    utilization: Math.min(1, used / card.creditLimit),
    line: null,
    members: [card],
    subCap: null,
  };
}
