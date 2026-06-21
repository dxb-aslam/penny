// Penny Agent v2 — router: cheap local classifier deciding lean vs full tier.
// Conservative by design: a misrouted log still works (full handles it); a
// misrouted question returns more:true from the lean call and escalates.
import type { Route } from '../types';

const NON_TXN = /\b(how much|how many|why|what'?s|whats|show|list|trend|progress|should i|edit|change|rename|update|delete|remove|set |transfer|move|owe|lent|borrow|send home|remit|subscription|subscribe|emi|loan|installment|grocery list|shopping list|budget|report|balance|due|statement|card|account|categor)\b/i;
const HAS_AMOUNT = /(?:aed|dhs?|usd|\$|rs|inr|eur)?\s*\d+(?:[.,]\d+)?\b/i;

export function routeMessage(text: string): Route {
  const t = (text || '').trim();
  if (!t) return 'full';
  if (NON_TXN.test(t)) return 'full';
  if (HAS_AMOUNT.test(t)) return 'lean'; // looks like a quick log
  return 'full';                          // no amount, ambiguous → let the agent decide
}
