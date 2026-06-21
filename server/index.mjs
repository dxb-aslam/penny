// Penny — minimal Anthropic proxy. Keeps the API key server-side.
// Runs with: node --env-file=.env server/index.mjs   (Node 18+)
// Without ANTHROPIC_API_KEY it stays up but reports demo mode so the app uses its on-device fallback.
import http from 'node:http';

const PORT = process.env.PENNY_SERVER_PORT || 8788;
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODELS = {
  haiku: process.env.PENNY_MODEL_HAIKU || 'claude-haiku-4-5-20251001',
  sonnet: process.env.PENNY_MODEL_SONNET || 'claude-sonnet-4-6',
  opus: process.env.PENNY_MODEL_OPUS || 'claude-opus-4-8',
};

const CAT_IDS = ['food', 'groceries', 'transport', 'shopping', 'bills', 'subs', 'health', 'home', 'fun', 'income', 'other'];
const ACCOUNT_IDS = ['fab', 'fabsave', 'enbdcur', 'wio', 'neo', 'enbd', 'fabcard', 'citi', 'revolut', 'careem', 'emoney', 'cash'];

const SNAPSHOT = `DATA SNAPSHOT (all AED): income 18,500/mo; budget 9,000/mo; spent so far this month 5,692; net across all accounts ≈52,000. Groceries by month: Jan 1240, Feb 1186, Mar 1071, Apr 988, May 924, Jun-so-far 612 — improving ≈5%/mo for 5 straight months. Groceries last week: 301 (Spinneys 86.40 + Carrefour 214.80), 18% under weekly average. EMIs: car 1,450/mo (29 mo left, 41,300 remaining, 3.19% flat), iPhone 379/mo (6 mo), furniture 620/mo (2 mo). EMI/income 13.2% (banks worry past 35%). Interest/income 0.98%. Recurring: rent 4,200, gym 299 (unused 26 days), Anghami 19.99 (unused 47 days, overlaps Spotify), Netflix 39, Spotify 21.99, iCloud 11.99. Car context: 2023 Nissan Kicks; a ≈120k upgrade roughly doubles the car EMI to ≈2,900/mo → ≈21% EMI load — affordable but eats the savings rate; furniture plan ends in 2 months freeing 620/mo.`;

const SYS = `You are Penny, a warm, lightly witty personal-finance companion in an expense tracker app (UAE user, default currency AED). You parse what the user says into structured expense data.

Reply with ONLY valid JSON, no markdown fences, matching:
{
 "kind": "expense" | "grocery_add" | "correction" | "insight" | "account_add" | "account_edit" | "note" | "ledger" | "track_add" | "profile_edit" | "chat",
 "profile": {"name": "..."} (only for kind=profile_edit — when the user says their name / what to call them),
 "tracked": {"kind": "receivable"|"payable"|"remittance"|"upcoming"|"income", "title": "...", "counterparty": "name", "amount": number, "dueDate": "YYYY-MM-DD", "recurring": bool, "interestRate": number, "expectedMin": number, "expectedMax": number} (only for kind=track_add),
 "//attribution": "on an expense, add attribution:{mode:self|lent|company|person, who} when the spend was for someone else / company / lent",
 "filters": {"accounts": ["account id"], "categories": ["category id"], "type": "all"|"in"|"out", "period": "today"|"week"|"month"|"last_month"|"3m"|"year"|"all", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD"} (only for kind=ledger),
 "reply": "Penny's voice — warm, human, never preachy. For kind=insight this is the full answer: 2-4 short sentences with concrete AED numbers from the snapshot, ending with a clear take. Otherwise 1-2 short sentences, with a light nudge if the spend looks unnecessary.",
 "chart": "grocery_months" | "spend_months" | null (only for kind=insight, when a monthly trend chart helps),
 "model": "haiku" | "sonnet" | "opus" (which tier this answer deserves),
 "account": {"name": "...", "group": "bank"|"card"|"wallet", "currency": "AED", "balance": number, "creditLimit": number (cards only)} (kind=account_add: all fields; kind=account_edit: only changed fields),
 "match": "for kind=account_edit — name or last4 of the existing account to change",
 "//last4": "include last4 (string) in account for banks/cards; ask the user for it if not given",
 "expense": {
   "merchant": "best guess merchant or short title",
   "total": number,
   "currency": "AED",
   "category": one of ${JSON.stringify(CAT_IDS)},
   "account": one of ${JSON.stringify(ACCOUNT_IDS)},
   "items": [{"n": "item name", "a": number}],
   "necessity": 1-10 (10 = essential like rent/utilities, 5-7 = reasonable, 1-4 = impulse),
   "necessityNote": "one short sentence on why"
 },
 "groceryItems": ["only for kind=grocery_add"],
 "note": "for kind=note — a clear restatement of the bug/fix/feature the user wants logged for the developers",
 "suggestion": {"label": "short first-person action", "action": "ledger"|"money_map"|"new_list"|"watch"|"none", "filters": {ledger filters, only when action=ledger}} (OPTIONAL proactive next-step with confirm chips; any kind)
}

Rules: expand arithmetic like "2+3" into items. If user pasted a bank SMS, extract merchant/amount/card. If the message is a correction to the previous expense, set kind="correction" and return the FULL corrected expense. Questions about their data or opinion questions = kind="insight": answer from the snapshot, numbers-first, with a clear recommendation. If the user wants to SEE/SHOW/LIST/FIND transactions or open the ledger, set kind="ledger" and fill "filters" (map account names to ids, use category ids, pick a period preset or from/to dates, set type for income-only/spending-only); reply one short line. If the user is tracking money owed/owing/expected (lent money, "X owes me", "I owe at N%", send home, upcoming bill, variable salary range), set kind="track_add" with "tracked". For a spend that was for someone else/company/lent, keep kind="expense" but set expense.attribution. If the user is reporting a bug, asking to fix/change the app, leaving feedback, or requesting a feature ("note this", "fix this in the next update", "remember to…", "there's a bug…"), set kind="note". When the message refers back to something ("fix this", "that didn't work") without spelling out the issue, do NOT ask them to describe it — infer it from the RECENT CONVERSATION above and write a concrete "note". Reply confirming what you logged. If it's just conversation, kind="chat" with expense=null. Default account: cash for small street spends, enbd for card-sounding things.
SUGGESTIVE ACTIONS — be SPARING. Add "suggestion" ONLY when there's a clearly useful next step the user would likely accept; most replies need none (omit / action="none"). Never suggest twice in a row or something they just did. Actions: "ledger" (open filtered transactions — set "filters"; after a spending question or odd result), "money_map" (after lending/borrowing/receivable talk), "new_list" (after a big grocery shop or trip planning), "watch" (after a repeat impulse buy). Keep the label short and first-person.

${SNAPSHOT}`;

async function callAnthropic({ model = 'haiku', system, content, maxTokens = 1024 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELS[model] || MODELS.haiku,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.content || []).map((b) => b.text || '').join('').trim();
}

function extractJSON(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function routeModel(text) {
  const t = (text || '').toLowerCase();
  if (/car|upgrad|should i|opinion|afford|advice|worth it/.test(t)) return 'opus';
  if (/progress|trend|improv|month|compare|average|how much|spent on|spend on|what did i/.test(t)) return 'sonnet';
  return 'haiku';
}

// ---- handlers ----
async function handleParse(body) {
  const { text, prevExpense, ctx } = body;
  const model = routeModel(text);
  const userContent =
    (ctx?.conversation ? ctx.conversation + '\n\n' : '') +
    (ctx?.snapshot ? ctx.snapshot + '\n\n' : '') +
    (prevExpense ? `Previous expense (for corrections): ${JSON.stringify(prevExpense)}\n\n` : '') +
    `User message: "${text}"`;
  const out = await callAnthropic({ model, system: SYS, content: userContent, maxTokens: 900 });
  const parsed = extractJSON(out);
  if (!parsed) throw new Error('no json');
  if (!parsed.model) parsed.model = model;
  return parsed;
}

async function handleReceipt(body) {
  const { image, mime } = body;
  const sys = `You are Penny, reading a receipt photo. Return ONLY JSON:
{"reply":"1-2 warm sentences naming the merchant, total and item count, flagging anything impulse","items":[{"n":"item","a":number,"nec":1-10,"note":"optional short flag"}],"expense":{"merchant":"","total":number,"currency":"AED","category":one of ${JSON.stringify(CAT_IDS)},"account":"enbd","items":[{"n":"grouped name","a":number}],"necessity":1-10,"necessityNote":""},"followUp":"optional one short follow-up question"}`;
  const content = [
    { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: image } },
    { type: 'text', text: 'Read this receipt and return the JSON described.' },
  ];
  const out = await callAnthropic({ model: 'sonnet', system: sys, content, maxTokens: 1200 });
  const parsed = extractJSON(out);
  if (!parsed) throw new Error('no json');
  return parsed;
}

async function handleStatement(body) {
  const { file, mime, name } = body;
  const isPdf = (mime || '').includes('pdf');
  const sys = `You are Penny, reading a bank/card statement. Return ONLY JSON:
{"reply":"1-2 sentences: how many transactions, total, and an offer to import into the right account","importCount":number,"account":"account name string","toast":"short toast text","followUpTag":"stmtImport","followUpOptions":["Import all N","Not now"]}`;
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: file } };
  const content = [block, { type: 'text', text: `File name: ${name}. Summarize and return the JSON described.` }];
  const out = await callAnthropic({ model: 'sonnet', system: sys, content, maxTokens: 900 });
  const parsed = extractJSON(out);
  if (!parsed) throw new Error('no json');
  return parsed;
}

async function handleDigest(body) {
  const lines = (body.txns || [])
    .map((t) => `${t.merchant}: ${t.amount} AED (${t.cat}, necessity ${t.nec}/10)`)
    .join('\n');
  const prompt = `You are Penny, a warm personal finance companion. Based on today's spending log below, write a short daily digest. Format: 2 short paragraphs max 50 words total, then exactly 3 bullet tips (each under 12 words, start with "•"). Be specific, gently witty, never preachy. Mention amounts in AED.

Today's log:
${lines}

Context: monthly income 18,500 AED, budget 9,000 AED, recurring: rent 4,200, gym 299 (unused 26 days), Anghami 19.99 (unused 47 days, overlaps Spotify).`;
  const text = await callAnthropic({ model: 'sonnet', content: prompt, maxTokens: 500 });
  return { text };
}

const ROUTES = {
  '/penny/parse': handleParse,
  '/penny/receipt': handleReceipt,
  '/penny/statement': handleStatement,
  '/penny/digest': handleDigest,
};

function send(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && url === '/penny/health') return send(res, 200, { live: !!KEY });

  const handler = ROUTES[url];
  if (req.method === 'POST' && handler) {
    if (!KEY) return send(res, 503, { error: 'demo mode — no ANTHROPIC_API_KEY' });
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 25 * 1024 * 1024) req.destroy(); // 25MB guard
    });
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const out = await handler(body);
        send(res, 200, out);
      } catch (err) {
        console.error(`[penny] ${url} failed:`, err.message);
        send(res, 502, { error: String(err.message || err) });
      }
    });
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[penny] proxy on http://localhost:${PORT}  ·  ${KEY ? 'LIVE (Anthropic key set)' : 'DEMO MODE (no key)'}`);
});
