// Penny Agent v2 — router: cheap local classifier deciding lean vs full tier.
// Conservative by design: a misrouted log still works (full handles it); a
// misrouted question returns more:true from the lean call and escalates.
import type { Route } from '../types';

const NON_TXN = /\b(how much|how many|why|what'?s|whats|show|list|trend|progress|should i|edit|change|rename|update|delete|remove|set |transfer|move|owe|lent|borrow|send home|remit|subscription|subscribe|emi|loan|installment|grocery list|shopping list|budget|report|balance|due|statement|card|account|categor)\b/i;
const HAS_AMOUNT = /(?:aed|dhs?|usd|\$|rs|inr|eur)?\s*\d+(?:[.,]\d+)?\b/i;

// A message with no letters at all — just digits/punctuation (e.g. "4018",
// "1,200") — names nothing bought, so it's NOT a quick log. Could be a card's
// last-4, a PIN reply, an amount awaiting a merchant… Let the agent ask.
const BARE_NUMBER = /^[\d\s.,/-]+$/;

export function routeMessage(text: string): Route {
  const t = (text || '').trim();
  if (!t) return 'full';
  if (BARE_NUMBER.test(t)) return 'full'; // ambiguous bare number → agent clarifies, never auto-logs
  if (NON_TXN.test(t)) return 'full';
  if (HAS_AMOUNT.test(t)) return 'lean';  // looks like a quick log
  return 'full';                          // no amount, ambiguous → let the agent decide
}
