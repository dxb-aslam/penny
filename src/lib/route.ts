// Penny — single source of truth for model routing (keeps cost down).
//
// Tiers: haiku (cheap, the default for parsing & simple asks) → sonnet (data
// analysis / insight questions) → opus (genuine money DECISIONS only).
// Opus is the most expensive tier, so it requires BOTH an opinion/advice phrase
// AND a real financial-decision context — "should I add milk" stays on haiku;
// "should I upgrade my car" goes to opus.
import type { ModelId } from './types';

const OPINION = /\b(should i|shall i|worth it|worth buying|is it worth|can i afford|afford|better to|do you think|what do you think|your (take|opinion|advice)|advice|recommend|which (card|account|loan|option)|pay ?off early)\b/;
const DECISION_CTX = /\b(car|vehicle|loan|emi|mortgage|buy|buying|purchase|upgrad|afford|house|apartment|invest|savings?|salary|raise|debt|insurance|refinanc|big[- ]?ticket|upgrade my)\b/;
const ANALYSIS = /\b(progress|trend|trending|improv|over the last|past (few )?month|this month|last month|months|compare|comparison|average|how much|how many|spent on|spend on|what did i|breakdown|by category|summary|insight|pattern|on track|over budget|under budget)\b/;

export function pickModel(text: string): ModelId {
  const t = (text || '').toLowerCase();
  if (OPINION.test(t) && DECISION_CTX.test(t)) return 'opus';
  if (ANALYSIS.test(t)) return 'sonnet';
  return 'haiku';
}
