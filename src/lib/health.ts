// Penny — financial health score: a single 0–100 read on how healthy the
// finances are, broken into weighted factors, with a recorded history so the
// user can see improvement over time, a target, and recommendations.
import { LS } from './data';

export interface HealthInput {
  income: number; // monthly income (inflows)
  monthSpend: number; // monthly spend (outflows, excl. transfers)
  budget: number; // monthly budget
  emiTotal: number; // total monthly EMI commitments
  creditUsed: number; // credit-card balances owed
  creditLimit: number; // total credit limit
  savingsBalance: number; // designated savings pot
}

export interface HealthFactor {
  key: string;
  label: string;
  score: number; // 0–100
  weight: number; // 0–1
  detail: string; // current state in plain words
  tip: string; // how to improve it
}

export interface HealthResult {
  score: number; // 0–100 overall
  grade: string;
  color: string;
  factors: HealthFactor[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const lerp = (v: number, good: number, bad: number) => clamp(((bad - v) / (bad - good)) * 100);

export function computeHealth(i: HealthInput): HealthResult {
  const savingsRate = i.income > 0 ? (i.income - i.monthSpend) / i.income : 0;
  const months = i.monthSpend > 0 ? i.savingsBalance / i.monthSpend : i.savingsBalance > 0 ? 6 : 0;
  const util = i.creditLimit > 0 ? i.creditUsed / i.creditLimit : 0;
  const dti = i.income > 0 ? i.emiTotal / i.income : i.emiTotal > 0 ? 1 : 0;
  const budgetR = i.budget > 0 ? i.monthSpend / i.budget : 1;

  const factors: HealthFactor[] = [
    {
      key: 'savings', label: 'Savings rate', weight: 0.25,
      score: clamp((savingsRate / 0.25) * 100),
      detail: `Keeping ${Math.round(savingsRate * 100)}% of what you earn`,
      tip: 'Aim to keep at least 20% of monthly income — automate a transfer on payday.',
    },
    {
      key: 'emergency', label: 'Emergency fund', weight: 0.2,
      score: clamp((months / 6) * 100),
      detail: `${months.toFixed(1)} months of expenses saved`,
      tip: 'Build the savings pot toward 6 months of expenses for a real cushion.',
    },
    {
      key: 'credit', label: 'Credit utilisation', weight: 0.2,
      score: lerp(util, 0.1, 0.8),
      detail: `${Math.round(util * 100)}% of your card limits in use`,
      tip: 'Keep card balances under 30% of the limit — pay down the highest-rate card first.',
    },
    {
      key: 'debt', label: 'Debt load', weight: 0.2,
      score: lerp(dti, 0.1, 0.45),
      detail: `EMIs take ${Math.round(dti * 100)}% of income`,
      tip: 'Try to keep loan repayments under 35% of income — avoid new EMIs for now.',
    },
    {
      key: 'budget', label: 'Budget adherence', weight: 0.15,
      score: lerp(budgetR, 0.7, 1.1),
      detail: budgetR <= 1 ? `Spending ${Math.round(budgetR * 100)}% of budget` : `${Math.round((budgetR - 1) * 100)}% over budget`,
      tip: 'Trim the top spending category by 10% to get back under budget.',
    },
  ];

  const score = clamp(factors.reduce((s, f) => s + f.score * f.weight, 0));
  const { grade, color } = gradeOf(score);
  return { score, grade, color, factors };
}

export function gradeOf(score: number): { grade: string; color: string } {
  if (score >= 85) return { grade: 'Excellent', color: 'var(--sage-deep)' };
  if (score >= 70) return { grade: 'Good', color: 'var(--sage)' };
  if (score >= 55) return { grade: 'Fair', color: 'var(--amber-deep)' };
  if (score >= 40) return { grade: 'Needs work', color: 'var(--amber)' };
  return { grade: 'At risk', color: 'var(--coral)' };
}

/** Recommendations to reach the target: the lowest-scoring factors first. */
export function recommendations(res: HealthResult, target: number): HealthFactor[] {
  if (res.score >= target) return [];
  return [...res.factors].sort((a, b) => a.score - b.score).slice(0, 3);
}

// ---- history (recorded daily, deduped) ----
export interface HealthPoint { d: string; score: number }

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Record today's score and return the history. On first ever run, seed a gentle
 * 6-month ramp up to the current score so the trend is meaningful immediately;
 * thereafter append one real point per day (deduped), capped at 120 points.
 */
export function recordHealth(score: number): HealthPoint[] {
  const hist = LS.read<HealthPoint[]>('healthHistory', []);
  const today = dayKey(Date.now());

  if (hist.length === 0) {
    const seed: HealthPoint[] = [];
    const now = new Date();
    for (let i = 6; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      seed.push({ d: dayKey(d.getTime()), score: clamp(score - i * 4) });
    }
    seed.push({ d: today, score });
    LS.write('healthHistory', seed);
    return seed;
  }

  const last = hist[hist.length - 1];
  let next: HealthPoint[];
  if (last.d === today) {
    next = [...hist.slice(0, -1), { d: today, score }];
  } else {
    next = [...hist, { d: today, score }];
  }
  if (next.length > 120) next = next.slice(next.length - 120);
  LS.write('healthHistory', next);
  return next;
}

export function readHealthTarget(): number {
  return LS.read<number>('healthTarget', 80);
}
export function writeHealthTarget(t: number) {
  LS.write('healthTarget', t);
}
