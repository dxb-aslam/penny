// Penny — savings tracker: one designated savings account (emergency fund +
// generic saving, together) climbing a ladder of named milestones.
import type { Account, Txn } from './types';

export interface Milestone {
  amount: number;
  /** The achievement you "unlock" on reaching this amount. */
  name: string;
  /** A short flavour line shown under the name. */
  blurb: string;
}

// Milestones up to 10,000 are ALWAYS visible; beyond that each is revealed only
// after the previous one is achieved (see visibleMilestones).
export const MILESTONES: Milestone[] = [
  { amount: 100, name: 'The Beginning', blurb: 'You started. That’s the hardest part.' },
  { amount: 500, name: 'Sprout', blurb: 'A little buffer is growing.' },
  { amount: 1000, name: 'Nest Egg', blurb: 'Your first real cushion.' },
  { amount: 2000, name: 'Cushion', blurb: 'A bad week won’t break you.' },
  { amount: 5000, name: 'Safety Net', blurb: 'Most emergencies are covered.' },
  { amount: 10000, name: 'Foundation', blurb: 'A solid base to build on.' },
  { amount: 20000, name: 'Fortress', blurb: 'Real resilience.' },
  { amount: 50000, name: 'Vault', blurb: 'Serious staying power.' },
  { amount: 100000, name: 'Treasury', blurb: 'Six figures of calm.' },
  { amount: 250000, name: 'Citadel', blurb: 'Hard to shake now.' },
  { amount: 500000, name: 'Empire', blurb: 'Wealth, quietly compounding.' },
  { amount: 1000000, name: 'Legend', blurb: 'Seven figures. Take a bow.' },
];

const ALWAYS_SHOWN_UPTO = 10000;

/**
 * Milestones to display for a given savings balance:
 * everything ≤ 10,000 is always shown; beyond that, reveal one at a time — the
 * next target appears, and the one after it stays hidden until it's achieved.
 */
export function visibleMilestones(balance: number): Milestone[] {
  const out = MILESTONES.filter((m) => m.amount <= ALWAYS_SHOWN_UPTO);
  const above = MILESTONES.filter((m) => m.amount > ALWAYS_SHOWN_UPTO);
  for (const m of above) {
    out.push(m);
    if (balance < m.amount) break; // reveal up to the first unachieved; hide the rest
  }
  return out;
}

/** The highest milestone the balance has reached (the current achievement), or null. */
export function achievedMilestone(balance: number): Milestone | null {
  let hit: Milestone | null = null;
  for (const m of MILESTONES) if (balance >= m.amount) hit = m;
  return hit;
}

/** The next milestone still to reach, or null if the ladder is topped out. */
export function nextMilestone(balance: number): Milestone | null {
  return MILESTONES.find((m) => balance < m.amount) || null;
}

/** Progress (0–1) from the achieved milestone toward the next one. */
export function milestoneProgress(balance: number): number {
  const next = nextMilestone(balance);
  if (!next) return 1;
  const prev = achievedMilestone(balance)?.amount ?? 0;
  const span = next.amount - prev;
  return span > 0 ? Math.max(0, Math.min(1, (balance - prev) / span)) : 0;
}

/** The savings balance = the designated account's balance (clamped at 0). */
export function savingsBalance(accounts: Account[], savingsId: string | null): number {
  if (!savingsId) return 0;
  const a = accounts.find((x) => x.id === savingsId);
  return a ? Math.max(0, a.balance) : 0;
}

/** Recent outflows from the savings account (spends or transfers OUT), newest first. */
export function savingsOutflows(txns: Txn[], savingsId: string | null, sinceDays = 30): Txn[] {
  if (!savingsId) return [];
  const cutoff = Date.now() - sinceDays * 86400000;
  return txns
    .filter((t) => t.account === savingsId && !t.income && t.ts >= cutoff)
    .sort((a, b) => b.ts - a.ts);
}
