// Penny — direct (client-side) Claude calls for the BYOK / no-server model.
//
// The user's own key is used, so calling Anthropic straight from the device is
// acceptable (the only person who can read the key is its owner). On native the
// webview's fetch is used; in the browser the SDK adds the
// `anthropic-dangerous-direct-browser-access` header so CORS works.
//
// Models follow the design's router: parse → Haiku, data/insight → Sonnet,
// opinion/affordability → Opus.
import Anthropic from '@anthropic-ai/sdk';
import { getApiKey, hasAnthropicKey } from './config';
import { CAT_IDS } from './data';
import { logLlm, type LlmUsage } from './llmlog';
import { pickModel } from './route';
import { schemaDigest } from './schema';
import type {
  DigestResult,
  ModelId,
  ParseContext,
  ParseResult,
  ParsedExpense,
  RawCrud,
  RawLedgerFilters,
  RawSuggestion,
  ReceiptResult,
  StatementResult,
} from './types';

const MODELS: Record<ModelId, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
};

const ACCOUNT_IDS = ['fab', 'fabsave', 'enbdcur', 'wio', 'neo', 'enbd', 'fabcard', 'citi', 'revolut', 'careem', 'emoney', 'cash'];

const SNAPSHOT = `DATA SNAPSHOT (all AED): income 18,500/mo; budget 9,000/mo; spent so far this month 5,692; net across all accounts ≈52,000. Groceries by month: Jan 1240, Feb 1186, Mar 1071, Apr 988, May 924, Jun-so-far 612 — improving ≈5%/mo for 5 straight months. Groceries last week: 301 (Spinneys 86.40 + Carrefour 214.80), 18% under weekly average. EMIs: car 1,450/mo (29 mo left, 41,300 remaining, 3.19% flat), iPhone 379/mo (6 mo), furniture 620/mo (2 mo). EMI/income 13.2% (banks worry past 35%). Interest/income 0.98%. Recurring: rent 4,200, gym 299 (unused 26 days), Anghami 19.99 (unused 47 days, overlaps Spotify), Netflix 39, Spotify 21.99, iCloud 11.99. Car context: 2023 Nissan Kicks; a ≈120k upgrade roughly doubles the car EMI to ≈2,900/mo → ≈21% EMI load — affordable but eats the savings rate; furniture plan ends in 2 months freeing 620/mo.`;

const SYS = `You are Penny, a warm, lightly witty personal-finance companion in an expense tracker app (UAE user, default currency AED). You parse what the user says into structured expense data.

Reply with ONLY valid JSON, no markdown fences, matching:
{
 "kind": "expense" | "grocery_add" | "correction" | "insight" | "account_add" | "account_edit" | "note" | "ledger" | "track_add" | "profile_edit" | "chat",
 "reply": "Penny's voice — warm, human, never preachy. For kind=insight this is the full answer: 2-4 short sentences with concrete AED numbers from the LIVE SNAPSHOT, ending with a clear take. Otherwise 1-2 short sentences, with a light nudge if the spend looks unnecessary.",
 "chart": "grocery_months" | "spend_months" | null,
 "model": "haiku" | "sonnet" | "opus",
 "account": {"name": "...", "group": "bank"|"card"|"wallet", "currency": "AED", "balance": number, "creditLimit": number (cards only, when known), "last4": "last 4 digits as a string (banks & cards)"} (for kind=account_add include all fields; for kind=account_edit include ONLY the fields being changed),
 "match": "for kind=account_edit — the name or last4 of the existing account to change",
 "filters": {"accounts": ["account id"], "categories": ["category id"], "type": "all"|"in"|"out", "period": "today"|"week"|"month"|"last_month"|"3m"|"year"|"all", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD"} (only for kind=ledger; omit keys you don't need),
 "note": "for kind=note — a clear, self-contained restatement of the bug/fix/feature the user wants logged for the developers",
 "profile": {"name": "..."} (only for kind=profile_edit),
 "expense": {
   "merchant": "best guess merchant or short title",
   "total": number,
   "currency": "AED",
   "category": one of ${JSON.stringify(CAT_IDS)},
   "account": one of ${JSON.stringify(ACCOUNT_IDS)},
   "items": [{"n": "item name", "a": number}],
   "necessity": 1-10 (10 = essential like rent/utilities, 5-7 = reasonable, 1-4 = impulse),
   "necessityNote": "one short sentence on why",
   "attribution": {"mode": "self"|"lent"|"company"|"person", "who": "name"} (only when the spend was NOT for the user — e.g. paid for a friend, a company/reimbursable expense, or money lent; omit or use mode "self" otherwise)
 },
 "tracked": {"kind": "receivable"|"payable"|"remittance"|"upcoming"|"income", "title": "...", "counterparty": "name", "amount": number, "currency": "AED", "dueDate": "YYYY-MM-DD", "recurring": true|false, "interestRate": number (payables that accrue), "expectedMin": number, "expectedMax": number (income range)} (only for kind=track_add),
 "groceryItems": ["only for kind=grocery_add"],
 "suggestion": {"label": "short first-person action, e.g. 'Show me the breakdown' / 'Watch my coffee spend'", "action": "ledger"|"money_map"|"new_list"|"watch"|"none", "filters": {ledger filters, only when action=ledger}} (OPTIONAL — a single proactive next-step offered with confirm chips; include on ANY kind)
}

Rules: expand arithmetic like "2+3" into items. If user pasted a bank SMS, extract merchant/amount/card. If the message is a correction to the previous expense, set kind="correction" and return the FULL corrected expense. Questions about their data or opinion questions = kind="insight": answer from the LIVE SNAPSHOT, numbers-first, with a clear recommendation. To CREATE an account/card/wallet → kind="account_add". For a bank or card, include "last4" if the user gave the last 4 digits; if they didn't, still draft it but ask for the last 4 digits in your reply (cards also: ask for the credit limit if not given). To CHANGE an existing one (rename, new balance, set credit limit, set last 4 digits, etc.) → kind="account_edit" with "match" = the account to change and "account" = only the changed fields. MONEY MAP — when the user is tracking money owed, owing, or expected (not a normal spend), set kind="track_add" with "tracked": "I lent Ahmed 500" / "Ahmed owes me 500" → receivable (counterparty Ahmed, amount 500); "I owe Khalid 5000 at 5%" → payable (interestRate 5); "send 3000 home" / "remit to family" → remittance (recurring if monthly); "rent 4200 due next week" / "expecting a 2000 bill" → upcoming (dueDate); "expecting ~9000 from a client" or variable salary like "my salary is usually 15000-20000" → income (expectedMin/expectedMax). Reply warmly confirming. For a normal expense that was for someone else or the company, keep kind="expense" but set "attribution". If the user tells you their name or what to call them ("my name is X", "call me X", "I'm X"), set kind="profile_edit" with profile.name and warmly greet them by it.
If the user wants to SEE/SHOW/LIST/FIND/REVIEW transactions or open the ledger ("show me groceries last month", "list my spending on FAB", "what did I pay on the ENBD card", "show all income this year"), set kind="ledger" and fill "filters" — map account NAMES to their ids using the ACCOUNT IDS legend in the snapshot, use category ids, pick a period preset when possible (or from/to dates for an explicit range), and set type to in/out when they ask only for income or only spending. reply = one short line like "Here's your groceries from last month 👇". If the user is reporting a bug, asking to fix/change the APP itself, leaving feedback, or requesting a feature ("note this", "fix this in the next update", "remember to…", "there's a bug…", "it would be nice if…"), set kind="note". When the message refers back to something ("fix this", "that didn't work", "this is wrong", "in the next update") WITHOUT spelling out the issue, DO NOT ask the user to describe it — read the RECENT CONVERSATION above, work out what went wrong (the question they asked + the answer/action that fell short), and write a concrete, specific "note" capturing it. Only ask for clarification if there is genuinely nothing in the conversation to go on. Reply confirming exactly what you've logged. If it's just conversation, kind="chat" with expense=null. Default account: cash for small street spends, enbd for card-sounding things.
SUGGESTIVE ACTIONS — be SPARING. Add a "suggestion" ONLY when there is a clearly useful next step the user would likely say yes to; most replies need NONE (omit it or set action="none"). Never suggest twice in a row, never suggest something they just did, never pad a reply with a suggestion just to have one. The four actions: "ledger" (open the transaction list filtered — set "filters" too; good after a spending question they'd want to drill into, or an odd/zero result worth inspecting), "money_map" (open owed/owing/upcoming — good after lending/borrowing/receivable talk), "new_list" (start a fresh shopping list — good after a big grocery shop or when they mention planning a trip), "watch" (keep an eye on a recurring impulse pattern — good after a repeat impulse buy). The label is what the chip says; keep it short and first-person. Skip the suggestion entirely for simple confirmations and small-talk.

Use the LIVE SNAPSHOT and RECENT CONVERSATION provided in the user message for all real numbers and context — refer back to earlier messages naturally. If no snapshot is given, you may use this baseline: ${SNAPSHOT}`;

// Lean prompt for the haiku tier (logging + CRUD + ledger): no big snapshot, no
// insight prose — just the structured contract + a compact tables digest. This
// is the main token saver; the full SYS above is only used for sonnet/opus
// (insight / opinion questions that genuinely need the live snapshot).
const LEAN_SYS = `You are Penny, a warm UAE finance companion (default AED). Parse the user's message into JSON only, no markdown fences:
{
 "kind": "expense" | "grocery_add" | "correction" | "ledger" | "note" | "profile_edit" | "crud" | "chat",
 "reply": "1-2 short, warm sentences confirming what you did",
 "expense": {"merchant": "...", "total": number, "currency": "AED", "category": one of ${JSON.stringify(CAT_IDS)}, "account": one of ${JSON.stringify(ACCOUNT_IDS)}, "items": [{"n":"...","a":number}], "necessity": 1-10, "necessityNote": "...", "attribution": {"mode":"self"|"lent"|"company"|"person","who":"name"} (omit if self), "tag": "interest"|"epp"|"cash_advance" (ONLY for a credit-card interest charge, an EPP/easy-payment installment, or a cash advance/withdrawal on a card; omit otherwise)},
 "groceryItems": ["only for kind=grocery_add"],
 "filters": {"accounts":["id"],"categories":["id"],"type":"all"|"in"|"out","period":"today"|"week"|"month"|"last_month"|"3m"|"year"|"all","from":"YYYY-MM-DD","to":"YYYY-MM-DD"} (kind=ledger),
 "note": "for kind=note — concise restatement of the bug/feature",
 "profile": {"name":"..."} (kind=profile_edit),
 "crud": {"op":"create"|"update"|"delete","table":"accounts"|"transactions"|"emis"|"subs"|"tracked"|"categories"|"transfer","match":"name or id of the existing record (update/delete)","data":{field:value using the field names below; for table=transfer use {from, to, amount}}},
 "suggestion": {"label":"...","action":"ledger"|"money_map"|"new_list"|"watch"|"none","filters":{}} (OPTIONAL, sparing)
}
TABLES & FIELDS (for kind=crud):
${schemaDigest()}
Rules: a normal spend → kind="expense" (default account: cash for street spends, enbd for card-sounding). Listing grocery/shopping items → grocery_add. Fixing the previous expense → kind="correction" (return the full corrected expense). "show/list/find/what did I pay on X" → kind="ledger" (map account NAMES→ids and category names→ids using the legend). Reporting a bug / asking to fix or change the app / a feature request ("note this", "fix this") → kind="note"; if vague, infer from the recent conversation, don't ask. "call me X" / "my name is X" → kind="profile_edit". CREATING / EDITING / DELETING an account, card, EMI, loan, subscription, recurring item, money-map item (owed/debt/send-home/upcoming), or category → kind="crud" with op/table/match/data (use the field names above; for tracked the kinds are receivable|payable|remittance|upcoming|income; a post-dated cheque the user submitted (e.g. a personal cheque for their business) → table=tracked, kind=receivable, cheque=true, with a dueDate). Moving money between two of the user's own accounts ("transfer 500 from FAB to ENBD", "move 1000 to savings", "pay 2000 to my ENBD card") → kind="crud", op="create", table="transfer", data={from, to, amount, charge (optional fee; for a credit-card payment it auto-applies ~1.05% if omitted)}. A spend that was for someone else/company/lent → kind="expense" with attribution. Anything else → kind="chat". Only add a "suggestion" when there's a genuinely useful next step.`;

let client: Anthropic | null = null;
let clientKey = '';
function getClient(): Anthropic {
  const key = getApiKey();
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    clientKey = key;
  }
  return client;
}

export function hasKey(): boolean {
  return hasAnthropicKey();
}

const routeModel = pickModel;

function extractJSON<T>(text: string): T | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

type Block = { type: string; text?: string };

// Flatten content (string or blocks) into a loggable string; images noted, not dumped.
function contentToText(content: string | Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => {
      const t = (b as { type?: string }).type;
      if (t === 'text') return (b as { text?: string }).text || '';
      if (t === 'image') return '[image]';
      if (t === 'document') return '[document]';
      return `[${t}]`;
    })
    .join('\n');
}

async function call(
  model: ModelId,
  system: string,
  content: string | Anthropic.MessageParam['content'],
  maxTokens: number,
  label = 'call',
): Promise<string> {
  return callMessages(model, system, [{ role: 'user', content: content as Anthropic.MessageParam['content'] }], maxTokens, label);
}

// Multi-turn variant — used by the 2-layer engine so Haiku sees the open chat trail.
export async function callMessages(
  model: ModelId,
  system: string,
  messages: Anthropic.MessageParam[],
  maxTokens: number,
  label = 'call',
): Promise<string> {
  // Haiku doesn't accept the effort param; Sonnet/Opus default to high — nudge down for snappier replies.
  const extra = model === 'haiku' ? {} : { output_config: { effort: 'medium' as const } };
  const started = Date.now();
  const loggedInput = messages.map((m) => `${m.role}: ${contentToText(m.content)}`).join('\n');
  try {
    const res = await getClient().messages.create({
      model: MODELS[model],
      max_tokens: maxTokens,
      system,
      messages,
      ...extra,
    });
    const out = (res.content as Block[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('')
      .trim();
    const u = (res as { usage?: LlmUsage }).usage || {};
    logLlm({
      model,
      modelId: MODELS[model],
      label,
      path: 'direct',
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheCreate: u.cache_creation_input_tokens || 0,
      ms: Date.now() - started,
      system,
      input: loggedInput,
      output: out,
      ok: true,
    });
    return out;
  } catch (e) {
    logLlm({
      model,
      modelId: MODELS[model],
      label,
      path: 'direct',
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheCreate: 0,
      ms: Date.now() - started,
      system,
      input: loggedInput,
      output: '',
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function parseDirect(
  text: string,
  prev?: ParsedExpense | null,
  ctx?: ParseContext,
): Promise<ParseResult | null> {
  const model = routeModel(text);
  const prevLine = prev ? `Previous expense (for corrections): ${JSON.stringify(prev)}\n\n` : '';
  // Haiku tier (logging / CRUD / ledger): lean prompt + compact legend, NO snapshot.
  if (model === 'haiku') {
    const userContent =
      (ctx?.legend ? ctx.legend + '\n\n' : '') +
      (ctx?.conversation ? ctx.conversation + '\n\n' : '') +
      prevLine +
      `User message: "${text}"`;
    const out = await call('haiku', LEAN_SYS, userContent, 700, 'parse');
    const parsed = extractJSON<ParseResult>(out);
    if (!parsed) return null;
    parsed.model = 'haiku';
    return parsed;
  }
  // Full tier (sonnet/opus): insight / opinion — needs the live snapshot.
  const userContent =
    (ctx?.conversation ? ctx.conversation + '\n\n' : '') +
    (ctx?.snapshot ? ctx.snapshot + '\n\n' : '') +
    prevLine +
    `User message: "${text}"`;
  const out = await call(model, SYS, userContent, 900, 'parse');
  const parsed = extractJSON<ParseResult>(out);
  if (!parsed) return null;
  if (!parsed.model) parsed.model = model;
  return parsed;
}

// ===================== 2-layer engine =====================
// Layer 1 (Haiku, always): sees the open chat trail. Logs the common stuff
// directly (expense / grocery / profile / note / ledger), can fetch data via
// `queries`, and ROUTES heavier work to Layer 2 with a self-contained brief.
// Layer 2 (Sonnet/Opus): receives ONLY that brief — no chat, no snapshot.

const ENGINE_L1 = `You are Penny, a warm UAE money assistant (default AED). You are LAYER 1 and you see the whole open chat. Do the easy, frequent things yourself; hand heavier work to a stronger model. Reply with ONLY JSON, no markdown fences:
{
 "reply": "1-2 short warm sentences (empty string when you set queries)",
 "expense": {"merchant":"","total":number,"currency":"AED","category":<cat>,"account":<acct>,"items":[{"n":"","a":number}],"necessity":1-10,"necessityNote":"","income":false,"tag":"fee|interest|epp|cash_advance"(omit unless a card fee/interest/EPP/cash-advance),"attribution":{"mode":"self|company|person|lent","who":""}(omit if self)} | null,
 "correct": false (set true if this expense is a FIX to the one just logged — return the FULL corrected expense),
 "grocery": ["item", ...] | null,
 "profile": {"name":""} | null,
 "note": "developer note / bug / feature request" | null,
 "filters": {"accounts":["id"],"categories":["id"],"type":"all|in|out","period":"today|week|month|last_month|3m|year|all","from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | null,
 "queries": [{"table":"transactions|accounts|emis|subs|tracked","filter":"this_month|last_month|cat=<id>|account=<id>","agg":"sum|count|list"}] | null,
 "route": {"model":"sonnet|opus","task":"account_add|account_edit|emi|card|statement|transfer|money_map|analysis|advice|other","brief":"a COMPLETE self-contained instruction; include any numbers you fetched — the next model sees nothing else"} | null,
 "need_history": 0,
 "close": false,
 "suggestion": {"label":"","action":"ledger|money_map|new_list|watch|none","filters":{}} | null
}
cats: ${CAT_IDS.join(' ')}
CRITICAL: you do NOT know any of the user's amounts, balances, totals, counts or trends. NEVER invent or estimate a figure. ANY question about how much / balance / total / count / breakdown / "this month vs last" → you MUST return "queries" first (I run them and call you again with the real numbers) or "route" to analysis. Give no numbers until you have query results.
ONE path per turn:
• A spend or income → "expense". Set account to an EXISTING account id from the legend (a cash/wallet for small spends, a card for card-sounding ones). If the user has no accounts yet, leave account empty and gently suggest adding one. If the spend was NOT for the user — for their business, for someone else, or money lent — set expense.attribution {mode: company|person|lent, who} so it's tracked as reimbursable; omit for normal personal spends.
• Listing items onto a shopping list → "grocery".
• "call me X" / their name → "profile". A bug report, app feedback or feature request → "note" (infer from the chat if vague; don't ask).
• "show / list / what did I pay on X" → "filters" (map account & category NAMES to ids using the legend).
• You need the user's real numbers before you can answer → "queries"; keep reply empty. I run them and call you again with the results.
• Heavier work — create/edit an account, card, EMI or loan; import a statement; transfer money; money-map (owed / owing / send-home / upcoming); a real report or analysis; or a "should I…" money decision — set "route" and pack EVERYTHING needed into brief. sonnet = data ops, imports, analysis; opus = judgement on a real decision.
• Otherwise just talk → fill only "reply".
need_history: set the number of older turns you want if the shown trail isn't enough. close: true ONLY when the request is fully resolved and nothing is pending.`;

const ENGINE_L2 = `You are Penny (UAE, default AED). A router handed you one task; the brief below is your ONLY context (no chat, no other data). Do exactly that, then reply warmly. Return ONLY JSON, no fences:
{"reply":"1-3 short sentences; for analysis/advice be concrete, numbers-first, with a clear take","crud":{"op":"create|update|delete","table":"accounts|transactions|emis|subs|tracked|categories|transfer","match":"name or id (update/delete)","data":{field:value}} | null,"filters":{ledger filters} | null,"suggestion":{"label":"","action":"ledger|money_map|new_list|watch|none","filters":{}} | null}
Use "crud" to create/edit/delete data (tables & fields below; for table=transfer data={from,to,amount,charge?}). Use "filters" to open the ledger. For analysis/advice just "reply".
TABLES & FIELDS:
${schemaDigest()}`;

export interface EngineTurn { role: 'user' | 'assistant'; content: string }
export interface EngineQuery { table: string; filter?: string; agg?: string }
export interface EngineExtras {
  legend?: string;
  name?: string;
  runQueries?: (q: EngineQuery[]) => Promise<string> | string;
}
type EngineResult = ParseResult & { close?: boolean };

interface Control {
  reply?: string;
  expense?: ParsedExpense | null;
  correct?: boolean;
  grocery?: string[] | null;
  profile?: { name?: string } | null;
  note?: string | null;
  filters?: RawLedgerFilters | null;
  queries?: EngineQuery[] | null;
  route?: { model?: string; task?: string; brief?: string } | null;
  need_history?: number;
  close?: boolean;
  suggestion?: RawSuggestion | null;
}

export async function engineParse(trail: EngineTurn[], extra?: EngineExtras): Promise<EngineResult | null> {
  const sys = ENGINE_L1 + (extra?.name ? `\nUser's name: ${extra.name}.` : '') + (extra?.legend ? `\n${extra.legend}` : '');
  const messages: Anthropic.MessageParam[] = trail
    .filter((t) => t.content && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content }));
  if (!messages.length) return null;

  let control: Control | null = null;
  for (let i = 0; i < 3; i++) {
    const out = await callMessages('haiku', sys, messages, 700, 'engine-l1');
    control = extractJSON<Control>(out);
    if (!control) return null;
    if (control.queries && control.queries.length && extra?.runQueries) {
      const results = await extra.runQueries(control.queries);
      messages.push({ role: 'assistant', content: out });
      messages.push({ role: 'user', content: `QUERY RESULTS:\n${results}\n\nNow log, answer or route as needed.` });
      continue;
    }
    break;
  }
  if (!control) return null;
  const close = !!control.close;
  const suggestion = control.suggestion ?? null;

  // Hand off to Layer 2 with only the brief.
  if (control.route && control.route.brief) {
    const model: ModelId = control.route.model === 'opus' ? 'opus' : 'sonnet';
    const l2 = await callMessages(model, ENGINE_L2, [{ role: 'user', content: control.route.brief }], 900, 'engine-l2');
    const r = extractJSON<{ reply?: string; crud?: RawCrud; filters?: RawLedgerFilters; suggestion?: RawSuggestion }>(l2);
    if (r?.crud) return { kind: 'crud', reply: r.reply || control.reply || 'Done.', crud: r.crud, suggestion: r.suggestion ?? suggestion, model, close };
    if (r?.filters) return { kind: 'ledger', reply: r.reply || control.reply || '', filters: r.filters, suggestion: r.suggestion ?? suggestion, model, close };
    return { kind: 'insight', reply: r?.reply || control.reply || '…', suggestion: r?.suggestion ?? suggestion, model, close };
  }

  // Direct (Haiku-handled) paths.
  const base = { suggestion, model: 'haiku' as ModelId, close };
  if (control.expense) return { kind: control.correct ? 'correction' : 'expense', reply: control.reply || '', expense: control.expense, ...base };
  if (control.grocery && control.grocery.length) return { kind: 'grocery_add', reply: control.reply || '', groceryItems: control.grocery, ...base };
  if (control.profile?.name) return { kind: 'profile_edit', reply: control.reply || '', profile: control.profile, ...base };
  if (control.note) return { kind: 'note', reply: control.reply || '', note: control.note, ...base };
  if (control.filters) return { kind: 'ledger', reply: control.reply || '', filters: control.filters, ...base };
  return { kind: 'chat', reply: control.reply || '…', ...base };
}

export async function receiptDirect(base64: string, mime: string, hint?: string): Promise<ReceiptResult | null> {
  const sys = `You are Penny, reading a receipt photo. Return ONLY JSON:
{"reply":"1-2 warm sentences naming the merchant, total and item count, flagging anything impulse","items":[{"n":"item","a":number,"nec":1-10,"note":"optional short flag"}],"expense":{"merchant":"","total":number,"currency":"AED","category":one of ${JSON.stringify(CAT_IDS)},"account":"enbd","items":[{"n":"grouped name","a":number}],"necessity":1-10,"necessityNote":""},"followUp":"optional one short follow-up question"}`;
  const text = hint && hint.trim()
    ? `Read this receipt and return the JSON described. The user added this note — use it to set the category/account or details: "${hint.trim()}"`
    : 'Read this receipt and return the JSON described.';
  const content: Anthropic.MessageParam['content'] = [
    { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: base64 } },
    { type: 'text', text },
  ];
  const out = await call('sonnet', sys, content, 1200, 'receipt');
  return extractJSON<ReceiptResult>(out);
}

export async function statementDirect(file: string, mime: string, name: string, hint?: string): Promise<StatementResult | null> {
  const isPdf = (mime || '').includes('pdf');
  const sys = `You are Penny, reading a bank/card statement. Return ONLY JSON:
{"reply":"1-2 sentences: how many transactions, total, and an offer to import into the right account","importCount":number,"account":"account name string","toast":"short toast text","followUpTag":"stmtImport","followUpOptions":["Import all N","Not now"]}`;
  const block = isPdf
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: file } } as const);
  const note = hint && hint.trim() ? ` The user added: "${hint.trim()}".` : '';
  const content = [block, { type: 'text', text: `File name: ${name}.${note} Summarize and return the JSON described.` }] as Anthropic.MessageParam['content'];
  const out = await call('sonnet', sys, content, 900, 'statement');
  return extractJSON<StatementResult>(out);
}

export async function digestDirect(
  txns: { merchant: string; amount: number; cat: string; nec: number }[],
): Promise<DigestResult | null> {
  const lines = txns.map((t) => `${t.merchant}: ${t.amount} AED (${t.cat}, necessity ${t.nec}/10)`).join('\n');
  const prompt = `You are Penny, a warm personal finance companion. Based on today's spending log below, write a short daily digest. Format: 2 short paragraphs max 50 words total, then exactly 3 bullet tips (each under 12 words, start with "•"). Be specific, gently witty, never preachy. Mention amounts in AED.

Today's log:
${lines}

Context: monthly income 18,500 AED, budget 9,000 AED, recurring: rent 4,200, gym 299 (unused 26 days), Anghami 19.99 (unused 47 days, overlaps Spotify).`;
  const out = await call('sonnet', '', prompt, 500, 'digest');
  if (out && out.length > 40) return { text: out, live: true };
  return null;
}

/** Ask Claude to propose a category → subcategory tree for an expense tracker. */
export async function generateCategoriesDirect(
  context?: string,
): Promise<{ id: string; label: string; subs: string[] }[] | null> {
  const sys = `You design expense categories for a UAE personal-finance app (currency AED). Return ONLY JSON: an array of 8-12 top-level categories, each {"id":"lowercase-kebab","label":"Title Case","subs":["Subcategory", ...]} with 3-6 realistic subcategories each. Always include an "income" category and an "other" category. Keep it practical for an individual's everyday spending.`;
  const user = (context ? context + '\n\n' : '') + 'Generate the category tree as JSON.';
  const out = await call('sonnet', sys, user, 1100, 'category_gen');
  return extractJSON<{ id: string; label: string; subs: string[] }[]>(out);
}
