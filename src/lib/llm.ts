// Penny — the model layer. Real Claude when the backend is configured, heuristic fallback otherwise.
import { CATS, CAT_IDS, HISTORY, allAccounts, necLevel, resolveAccount } from './data';
import {
  digestDirect,
  engineParse,
  hasKey,
  parseDirect,
  receiptDirect,
  statementDirect,
  type EngineExtras,
  type EngineTurn,
} from './anthropic';
export type { EngineExtras, EngineQuery, EngineTurn } from './anthropic';
import { logEvent } from './diag';
import { pickModel } from './route';
import type {
  CategoryId,
  DigestResult,
  ParseContext,
  ParsedAccount,
  ParsedExpense,
  ParseResult,
  ReceiptResult,
  StatementResult,
  Plan,
} from './types';

const API_BASE = (import.meta.env.VITE_PENNY_API_BASE as string) || '/api';

// ---------------- heuristic fallback ----------------
const KEYWORDS: [RegExp, CategoryId][] = [
  [/karak|tea|chai|coffee|latte|snack|samosa|shawarma|burger|lunch|dinner|breakfast|cafe|restaurant|pizza|biryani|food/i, 'food'],
  [/grocer|carrefour|spinneys|lulu|supermarket|veg|fruit|milk|eggs/i, 'groceries'],
  [/taxi|careem|uber|metro|fuel|petrol|adnoc|salik|parking|rta/i, 'transport'],
  [/amazon|noon|mall|shirt|shoes|dress|gift|electronics/i, 'shopping'],
  [/dewa|etisalat|du |bill|recharge|internet|utility/i, 'bills'],
  [/netflix|spotify|subscription|icloud|prime|anghami/i, 'subs'],
  [/pharmacy|doctor|clinic|medicine|gym|vitamins/i, 'health'],
  [/rent|maintenance|furniture|ikea/i, 'home'],
  [/movie|cinema|game|bowling|concert|trip/i, 'fun'],
  [/salary|refund|received|credited/i, 'income'],
];

const NEC_BY_CAT: Record<CategoryId, number> = {
  food: 5, groceries: 8, transport: 8, shopping: 4, bills: 10,
  subs: 4, health: 8, home: 10, fun: 3, income: 10, other: 5,
};

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function localParse(text: string): ParseResult {
  const t = text.toLowerCase();

  // set name / profile?
  const nameM = text.match(/\b(?:my name is|call me|name'?s|i am called)\s+([a-z][a-z'’-]{1,20})/i);
  if (nameM) {
    const name = nameM[1][0].toUpperCase() + nameM[1].slice(1);
    return { kind: 'profile_edit', profile: { name }, reply: `Nice to meet you, ${name}! I'll remember that. 👋` };
  }

  // developer note / bug report / feature request?
  if (/\bnote (this|that|down|it)\b|fix (this|that|it)|next update|remember to|there'?s a bug|it'?s buggy|is buggy|broken|feedback|feature request|would be (nice|good|great|better) if|please (add|change|fix|note)|log (this|a bug|it)/i.test(text)) {
    return {
      kind: 'note',
      note: text.trim(),
      reply: "Noted — I've logged that for the team. It'll be picked up in the next update. 🛠️",
    };
  }

  // edit an existing account?
  if (/\b(edit|change|update|rename|set|modify)\b/.test(t) && /(account|card|wallet|balance|limit|name)/.test(t) && !/grocery|list/.test(t)) {
    const acct = resolveAccount(text);
    if (acct) {
      const changes: Record<string, unknown> = {};
      const limM = t.match(/limit\s*(?:of|to|is|=)?\s*(\d[\d,]*(?:\.\d+)?)/);
      const balM = t.match(/(?:balance|to|=|now)\s*(\d[\d,]*(?:\.\d+)?)/);
      if (limM) changes.creditLimit = parseFloat(limM[1].replace(/,/g, ''));
      else if (balM) changes.balance = parseFloat(balM[1].replace(/,/g, ''));
      const nameM = text.match(/(?:rename|name)\s+(?:it\s+)?(?:to\s+)?["']?([\w ]{2,30})["']?/i);
      if (nameM) changes.name = nameM[1].trim();
      return {
        kind: 'account_edit',
        match: acct.name,
        account: changes as unknown as ParsedAccount,
        reply: `Updated ${acct.name}.`,
      };
    }
  }

  // money-map item (lent / owe / send home)?
  const amtOf = (s: string) => {
    const m = s.match(/(\d[\d,]*(?:\.\d+)?)/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
  };
  const incRange = t.match(/(?:income|salary|earn|make|take home)[^\d]{0,24}(\d[\d,]*)\s*(?:-|to|–|—)\s*(\d[\d,]*)/);
  if (incRange) {
    const lo = parseFloat(incRange[1].replace(/,/g, ''));
    const hi = parseFloat(incRange[2].replace(/,/g, ''));
    return { kind: 'track_add', tracked: { kind: 'income', title: 'Income', amount: Math.round((lo + hi) / 2), expectedMin: lo, expectedMax: hi, recurring: true }, reply: `Got it — I'll track your income against a ${lo.toLocaleString()}–${hi.toLocaleString()} range. Log each payment and I'll show received vs expected.` };
  }
  const lentM = text.match(/\blent\s+(?:to\s+)?([a-z][\w' ]{1,24}?)\s+(?:aed\s*)?(\d[\d,]*(?:\.\d+)?)/i);
  if (lentM) {
    const who = cap(lentM[1].trim());
    return { kind: 'track_add', tracked: { kind: 'receivable', title: who, counterparty: who, amount: parseFloat(lentM[2].replace(/,/g, '')) }, reply: `Tracked — ${who} owes you. It's in your Money map. 🧭` };
  }
  if (/\b(owe|owes)\b/.test(t) && /\bi owe\b/.test(t)) {
    const rate = t.match(/(\d+(?:\.\d+)?)\s*%/);
    return { kind: 'track_add', tracked: { kind: 'payable', title: 'Debt', amount: amtOf(t), interestRate: rate ? parseFloat(rate[1]) : undefined }, reply: `Logged what you owe${rate ? ` at ${rate[1]}%` : ''}. Tracking it in your Money map.` };
  }
  if (/\b(send|sending|remit|transfer)\b/.test(t) && /\bhome\b/.test(t)) {
    return { kind: 'track_add', tracked: { kind: 'remittance', title: 'Send home', amount: amtOf(t), recurring: /month|monthly|every month/.test(t) }, reply: `Added to Send home in your Money map.` };
  }

  // account creation?
  if (/(add|create|open|link)[^.]{0,28}(account|card|wallet)\b/.test(t) && !/grocery|list/.test(t)) {
    const nameM = text.match(/(?:add|create|open|link)\s+(?:my\s+|a\s+|new\s+)*(.+?)\s+(account|card|wallet)/i);
    const raw = nameM ? nameM[1].replace(/\b(new|my|a|an)\b/gi, '').replace(/\s+/g, ' ').trim() : '';
    const name = raw ? raw.split(' ').map((w) => cap(w)).join(' ') : 'New account';
    const group = nameM && /card/i.test(nameM[2]) ? 'card' : nameM && /wallet/i.test(nameM[2]) ? 'wallet' : 'bank';
    const amtM = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(aed|dhs|usd|\$)?/);
    const balance = amtM ? parseFloat(amtM[1].replace(/,/g, '')) : 0;
    const currency = /usd|\$/.test(t) ? 'USD' : 'AED';
    const limM = t.match(/limit\s*(?:of|to|is|=)?\s*(\d[\d,]*(?:\.\d+)?)/);
    const creditLimit = group === 'card' && limM ? parseFloat(limM[1].replace(/,/g, '')) : undefined;
    const l4 = text.match(/(?:ending|last\s*4|ends?\s*(?:in|with)|[*x#]{2,4})\s*[:#]?\s*(\d{4})\b/i);
    const last4 = l4 ? l4[1] : undefined;
    return {
      kind: 'account_add',
      reply:
        group !== 'wallet' && !last4
          ? `On it — drafted the new ${group} below. What are the last 4 digits?`
          : `On it — drafted the new ${group} below. Check the details and save it.`,
      account: { name, group: group as 'bank' | 'card' | 'wallet', currency: currency as 'AED' | 'USD', balance, creditLimit, last4 },
    };
  }

  // data / opinion questions?
  const H = HISTORY;
  if (/grocer/.test(t) && /last week|this week|past week/.test(t)) {
    return {
      kind: 'insight', model: 'sonnet',
      reply: `You spent AED ${H.groceriesLastWeek.total} on groceries last week — ${H.groceriesLastWeek.detail}. That's ${Math.round(Math.abs(H.groceriesLastWeek.vsAvg) * 100)}% under your weekly average, mostly because one big Carrefour run replaced three small top-up trips. Top-up trips are where the impulse items sneak in — keep doing this.`,
    };
  }
  if (/grocer/.test(t) && /progress|trend|improv|over (the )?last|few month|months/.test(t)) {
    return {
      kind: 'insight', model: 'sonnet', chart: 'grocery_months',
      reply: `Yes — and it's a genuinely good trend. Groceries are down five months straight: Jan 1,240 → May 924, roughly 5% per month. June is tracking ≈860 at this pace. Biggest driver: fewer top-up trips — which is also where the soda kept sneaking in.`,
    };
  }
  if (/car/.test(t) && /upgrad|new|chang|replace|opinion|should/.test(t)) {
    return {
      kind: 'insight', model: 'opus',
      reply: `Honest read: you can afford it, but I'd wait 2 months. Today your EMI load is a healthy 13.2% (AED 2,449 of 18,500). A ≈120k upgrade roughly doubles the car EMI to ≈2,900/mo → ≈21% load. Safe on paper, but it eats most of your savings rate.\n\nIn 2 months the furniture plan ends (+620/mo freed) and the Kicks still has 41,300 outstanding. Trade in after that and you land at ≈17% load with no squeeze. If the car runs fine — that's my move.`,
    };
  }

  // grocery add?
  if (/add .*(to|on) (the )?(grocery|shopping) list|grocery list/.test(t) && /add|need|put/.test(t)) {
    const m = t.match(/add (.+?) (?:to|on)/);
    const items = m ? m[1].split(/,| and /).map((s) => s.trim()).filter(Boolean) : ['item'];
    return {
      kind: 'grocery_add', groceryItems: items,
      reply: `Added ${items.join(', ')} to your grocery list. I'll flag anything you probably don't need when you're shopping.`,
    };
  }

  // correction-ish?
  const correction = /not (a |an )?\w+, it'?s|actually|change (it|that)|make it|it was on|wrong/i.test(text);

  // amounts: "2+3", "5 aed", "aed 45.50"
  const sumExpr = t.match(/(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))+/);
  const amounts = (t.match(/(?:aed|dhs?|usd|\$)?\s*(\d+(?:\.\d+)?)\s*(?:aed|dhs?|usd|\$)?/g) || [])
    .map((s) => parseFloat(s.replace(/[^\d.]/g, '')))
    .filter((n) => !isNaN(n) && n > 0);
  let total = amounts.length ? Math.max(...amounts) : 0;
  let parts: number[] = [];
  if (sumExpr) {
    parts = sumExpr[0].split('+').map((s) => parseFloat(s.trim()));
    const sum = parts.reduce((a, b) => a + b, 0);
    if (!amounts.some((a) => Math.abs(a - sum) < 0.01)) total = sum;
  }
  let cat: CategoryId = 'other';
  for (const [re, c] of KEYWORDS) {
    if (re.test(t)) { cat = c; break; }
  }
  // SMS style?
  const sms = /purchase|debited|spent|card ending|txn|transaction/i.test(text);
  const merchMatch = text.match(/at ([A-Z][\w' ]{2,24})/i);
  const merchant = merchMatch ? merchMatch[1].trim() : sms ? 'Card purchase' : CATS[cat] ? CATS[cat].label : 'Expense';
  const nec = NEC_BY_CAT[cat] || 5;
  const itemWords = t.match(/(?:had|bought|got) ([a-z ,&+]+?)(?: \d|$| for| aed)/);
  let items: { n: string; a: number }[] = [];
  if (itemWords && parts.length > 1) {
    const names = itemWords[1].split(/,| and |&|\+/).map((s) => s.trim()).filter(Boolean);
    items = parts.map((a, i) => ({ n: names[i] ? cap(names[i]) : 'Item ' + (i + 1), a }));
  }
  if (!total) {
    return {
      kind: 'chat',
      reply: 'Tell me what you spent and roughly how much — even "tea and snack 2+3 5 aed" works. Or attach a bill and I\'ll do the reading.',
    };
  }
  const necL = necLevel(nec);
  return {
    kind: correction ? 'correction' : 'expense',
    reply: correction
      ? 'Got it — updated. Anything else off?'
      : nec <= 4
      ? `Logged it. Small joys count — just keep an eye on these, they add up quietly.`
      : `Logged. ${necL.key === 'ess' ? 'Solid, necessary spend.' : 'Looks perfectly reasonable to me.'}`,
    expense: {
      merchant,
      total,
      currency: 'AED',
      category: cat,
      account: total < 30 ? 'cash' : 'enbd',
      items,
      necessity: nec,
      necessityNote: nec >= 8 ? 'Day-to-day essential.' : nec >= 5 ? 'Normal living spend — within your pattern.' : "Could've skipped — flagged as a want, not a need.",
    },
  };
}

export function localCorrect(text: string, prev: ParsedExpense): ParseResult {
  const e: ParsedExpense = JSON.parse(JSON.stringify(prev));
  const t = text.toLowerCase();
  for (const id of CAT_IDS) {
    const c = CATS[id];
    if (t.includes(id) || t.includes(c.label.toLowerCase().split(' ')[0])) { e.category = id; break; }
  }
  const amt = t.match(/(?:make it|it's|its|was) (\d+(?:\.\d+)?)/);
  if (amt) e.total = parseFloat(amt[1]);
  for (const a of allAccounts()) {
    if (t.includes(a.name.toLowerCase().split(' ')[0]) || (a.id === 'cash' && t.includes('cash'))) e.account = a.id;
  }
  return { kind: 'correction', reply: 'Fixed — updated the entry below.', expense: e };
}

export function sanitize(out: ParseResult): ParseResult {
  if (out.expense) {
    const e = out.expense;
    const ids = allAccounts().map((a) => a.id);
    if (!CAT_IDS.includes(e.category)) e.category = 'other';
    if (!ids.includes(e.account)) e.account = 'cash';
    e.total = Math.abs(parseFloat(String(e.total)) || 0);
    e.necessity = Math.min(10, Math.max(1, Math.round(e.necessity || 5)));
    e.items = Array.isArray(e.items) ? e.items.filter((i) => i && i.n).slice(0, 8) : [];
  }
  return out;
}

// ---------------- request planner: which model + visible trace steps ----------------
export function classify(text: string): Plan {
  const t = text.toLowerCase();
  // The trace animation must reflect the model that will actually run (pickModel).
  const model = pickModel(text);
  if (model === 'opus') {
    return {
      model, label: 'deep reasoning',
      steps: ['thinking…', 'pulling EMI & income ratios…', "this one's nuanced — waking opus…", 'weighing both options…', 'writing it up…'],
    };
  }
  if (model === 'sonnet') {
    return {
      model, label: 'data analysis',
      steps: ['thinking…', 'reading your spending data…', 'crunching the history…', 'handing to sonnet…', 'summarizing…'],
    };
  }
  if (/(add|create|open|link)[^.]{0,28}(account|card|wallet)/.test(t) && !/grocery/.test(t)) {
    return { model: 'haiku', label: 'quick task', steps: ['on it…', 'drafting the account…'] };
  }
  return { model: 'haiku', label: 'quick parse', steps: ['reading that…', 'itemizing…', 'scoring necessity…'] };
}

// ---------------- backend bridge ----------------
let liveCache: boolean | null = null;

export async function isLive(): Promise<boolean> {
  if (hasKey()) return true; // direct, on-device key (BYOK / hard-coded config)
  if (liveCache !== null) return liveCache;
  try {
    const r = await fetch(`${API_BASE}/penny/health`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error('bad');
    const j = await r.json();
    liveCache = !!j.live;
  } catch {
    liveCache = false;
  }
  return liveCache;
}

async function postJSON<T>(path: string, body: unknown, timeoutMs = 20000): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/**
 * 2-layer engine entry: Haiku sees the open chat trail, handles common things
 * directly, and routes the rest to Sonnet/Opus. Falls back to the heuristic on
 * the last user turn when there's no key / the call fails.
 */
export async function engineTurn(trail: EngineTurn[], extra?: EngineExtras): Promise<ParseResult> {
  const t0 = Date.now();
  if (hasKey()) {
    try {
      const out = await engineParse(trail, extra);
      if (out && out.kind) {
        const cleaned = sanitize(out);
        cleaned.live = true;
        cleaned.close = out.close;
        logEvent('parse', { path: 'engine', model: out.model, kind: out.kind, ms: Date.now() - t0, ok: true });
        return cleaned;
      }
      logEvent('parse', { path: 'engine', ms: Date.now() - t0, ok: false, reason: 'empty/no-json' });
    } catch (e) {
      logEvent('parse', { path: 'engine', ms: Date.now() - t0, ok: false, error: String((e as Error)?.message || e) });
    }
  }
  // Heuristic fallback on the latest user turn.
  const lastUser = [...trail].reverse().find((t) => t.role === 'user')?.content || '';
  const fb = localParse(lastUser);
  fb.live = false;
  return fb;
}

export async function parse(
  text: string,
  prevExpense?: ParsedExpense | null,
  ctx?: ParseContext,
): Promise<ParseResult> {
  let usedLive = false;
  const t0 = Date.now();
  // 1) direct on-device key
  if (hasKey()) {
    try {
      const out = await parseDirect(text, prevExpense, ctx);
      if (out && out.kind) {
        out.live = true;
        logEvent('parse', { path: 'direct', model: out.model, kind: out.kind, ms: Date.now() - t0, ok: true });
        return sanitize(out);
      }
      logEvent('parse', { path: 'direct', ms: Date.now() - t0, ok: false, reason: 'empty/no-json' });
    } catch (e) {
      logEvent('parse', { path: 'direct', ms: Date.now() - t0, ok: false, error: String((e as Error)?.message || e) });
    }
  }
  // 2) backend proxy
  try {
    const out = await postJSON<ParseResult>('/penny/parse', { text, prevExpense: prevExpense || null, ctx: ctx || null });
    if (out && out.kind) {
      usedLive = true;
      out.live = true;
      logEvent('parse', { path: 'proxy', model: out.model, kind: out.kind, ms: Date.now() - t0, ok: true });
      return sanitize(out);
    }
  } catch {
    /* fall through to heuristic */
  }
  logEvent('parse', { path: 'heuristic', ms: Date.now() - t0, live: usedLive });
  const fallback =
    prevExpense && /not |actually|change|make it|was on|wrong/i.test(text)
      ? localCorrect(text, prevExpense)
      : localParse(text);
  fallback.live = usedLive;
  return fallback;
}

// Receipt image → itemized analysis + draft expense (vision). Falls back to scripted Spinneys demo.
const DEMO_RECEIPT: ReceiptResult = {
  reply: 'Read it — Spinneys, AED 103.00, 6 items. Most of it is solid grocery shopping. Two things caught my eye 👇',
  items: [
    { n: 'Banana 1kg', a: 7.5, nec: 9 },
    { n: 'Greek yogurt 450g', a: 18, nec: 8 },
    { n: 'Chicken breast 1kg', a: 32, nec: 9 },
    { n: 'Sourdough loaf', a: 14, nec: 7 },
    { n: 'Ginger ale 6-pk', a: 22, nec: 3, note: '3rd time this month — AED 66 on soda' },
    { n: 'Choc wafers 250g', a: 9.5, nec: 4, note: 'Checkout-aisle special 😉' },
  ],
  expense: {
    merchant: 'Spinneys', total: 103, currency: 'AED', category: 'groceries', account: 'enbd',
    items: [{ n: 'Essentials (4 items)', a: 71.5 }, { n: 'Ginger ale 6-pk', a: 22 }, { n: 'Choc wafers', a: 9.5 }],
    necessity: 7, necessityNote: 'Mostly essentials — AED 31.50 of it was wants, not needs.',
  },
  followUp: 'Want me to keep an eye on the soda habit?',
};

export async function parseReceipt(base64: string, mime: string, hint?: string): Promise<ReceiptResult> {
  if (hasKey()) {
    try {
      const out = await receiptDirect(base64, mime, hint);
      if (out && out.expense) {
        out.live = true;
        sanitize({ kind: 'expense', reply: out.reply, expense: out.expense });
        logEvent('receipt', { path: 'direct', ok: true });
        return out;
      }
      logEvent('receipt', { path: 'direct', ok: false, reason: 'no-expense' });
    } catch (e) {
      logEvent('receipt', { path: 'direct', ok: false, error: String((e as Error)?.message || e) });
    }
  }
  try {
    const out = await postJSON<ReceiptResult>('/penny/receipt', { image: base64, mime }, 30000);
    if (out && out.expense) {
      out.live = true;
      sanitize({ kind: 'expense', reply: out.reply, expense: out.expense });
      return out;
    }
  } catch {
    /* fall through */
  }
  return { ...DEMO_RECEIPT, live: false };
}

// Statement (PDF/image) → bulk import + recurring-charge discovery. Falls back to scripted demo.
const DEMO_STATEMENT: StatementResult = {
  reply:
    "That's your credit-card statement — 42 transactions, AED 6,412 total. Want me to import them all into ENBD Credit? I'll de-duplicate against what's already logged.",
  importCount: 42,
  account: 'ENBD Credit',
  toast: '42 transactions imported',
  followUpTag: 'stmtImport',
  followUpOptions: ['Import all 42', 'Not now'],
};

export async function parseStatement(base64: string, mime: string, name: string, hint?: string): Promise<StatementResult> {
  if (hasKey()) {
    try {
      const out = await statementDirect(base64, mime, name, hint);
      if (out && out.reply) {
        out.live = true;
        logEvent('statement', { path: 'direct', ok: true });
        return out;
      }
      logEvent('statement', { path: 'direct', ok: false, reason: 'no-reply' });
    } catch (e) {
      logEvent('statement', { path: 'direct', ok: false, error: String((e as Error)?.message || e) });
    }
  }
  try {
    const out = await postJSON<StatementResult>('/penny/statement', { file: base64, mime, name }, 40000);
    if (out && out.reply) {
      out.live = true;
      return out;
    }
  } catch {
    /* fall through */
  }
  return { ...DEMO_STATEMENT, live: false };
}

// ---------------- daily digest (the "Sonnet layer") ----------------
const DEMO_DIGEST = `A steady day — AED 121.90 out, most of it earning its place. Groceries and the Careem ride were solid; the karak run was your small joy of the day, no judgement.

• Soda made it into the cart again — 3rd time this month.
• Anghami renews in 6 days. Still unused. Cancel?
• You're 69% through the month at 64% of budget. Nice pace.`;

export async function digest(
  txns: { merchant: string; amount: number; cat: string; nec: number }[],
): Promise<DigestResult> {
  if (hasKey()) {
    try {
      const out = await digestDirect(txns);
      if (out && out.text && out.text.length > 40) {
        logEvent('digest', { path: 'direct', ok: true });
        return { text: out.text.trim(), live: true };
      }
    } catch (e) {
      logEvent('digest', { path: 'direct', ok: false, error: String((e as Error)?.message || e) });
    }
  }
  try {
    const out = await postJSON<{ text: string }>('/penny/digest', { txns }, 25000);
    if (out && out.text && out.text.length > 40) return { text: out.text.trim(), live: true };
  } catch {
    /* fall through */
  }
  return { text: DEMO_DIGEST, live: false };
}
