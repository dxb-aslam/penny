// Penny — chat view: the conversational logging surface (the core experience)
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt, allAccounts } from '../lib/data';
import { classify, engineTurn, isLive, parseReceipt, parseStatement } from '../lib/llm';
import type { EngineQuery, EngineTurn } from '../lib/llm';
import { logChat, logNote } from '../lib/diag';
import { resolveAccount } from '../lib/data';
import { applyFilters, normalizeFilters, summarize } from '../lib/ledger';
import type { LedgerFilters } from '../lib/types';
import { normalizeTracked } from '../lib/money';
import { buildLegend } from '../lib/snapshot';
import { applyCrud } from '../lib/schema';
import { captureImage, pickFile } from '../lib/media';
import type { PickedFile, PickedImage } from '../lib/media';
import type { Account, ParsedAccount, ParsedExpense, ParseResult } from '../lib/types';
import { AgentAvatar } from '../components/Avatar';
import { Icons } from '../components/Icons';
import { useApp } from '../state/AppContext';
import {
  AccountCard,
  AnalysisCard,
  ChartMsg,
  ExpenseCard,
  ModelTag,
  ReceiptPhoto,
  TraceBubble,
} from './cards';
import type { ChatMsg } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let MID = 1;

// Map an edited/parsed expense onto the persisted transaction's fields.
function txnChangesFrom(e: ParsedExpense) {
  return {
    merchant: e.merchant,
    cat: e.category,
    amount: e.total,
    account: e.account,
    nec: e.necessity,
    items: e.items,
    ...(e.category === 'income' ? { income: true } : { income: false }),
    ...(e.attribution && e.attribution.mode !== 'self' ? { attribution: e.attribution } : { attribution: undefined }),
    tag: e.tag,
  };
}

interface TraceState {
  steps: string[];
  idx: number;
  model: string;
  label: string;
}

const STARTERS = [
  'had tea and snack 2+3, 5 aed',
  'Scan a grocery receipt',
  'How much on groceries last week?',
  'Should I upgrade my car?',
  'Add my new Liv savings account, 2500 aed',
];

const COMPOSER_SUGGESTIONS = [
  'any progress in my grocery spend?',
  'should I upgrade my car?',
  "it's not shopping, it's a gift",
  'add milk to grocery list',
];

const SHEET_OPTIONS = [
  { key: 'receipt', Icon: Icons.camera, tint: 'var(--sage-tint)', color: 'var(--sage-deep)', t: 'Snap a bill or receipt', s: 'Itemized + necessity-scored' },
  { key: 'sms', Icon: Icons.sms, tint: 'var(--amber-tint)', color: 'var(--amber-deep)', t: 'Paste a bank SMS', s: 'Card alerts become entries' },
  { key: 'statement', Icon: Icons.filetext, tint: 'var(--coral-tint)', color: 'var(--coral-deep)', t: 'Card / bank statement', s: 'PDF — bulk import + subscription scan' },
] as const;

export function ChatView() {
  const app = useApp();
  const open = app.chatOpen;
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [trace, setTrace] = useState<TraceState | null>(null);
  const [sheet, setSheet] = useState(false);
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState<{ kind: 'image'; img: PickedImage } | { kind: 'file'; file: PickedFile } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<ChatMsg[]>(msgs);
  const lastExpenseRef = useRef<string | null>(null);
  const booted = useRef(false);
  const trailStartRef = useRef(0); // index into msgs where the current open trail begins (reset on close)

  // Resolve Haiku's data queries against the user's real (merged) data.
  const runQueries = useCallback((qs: EngineQuery[]): string => {
    const periodOf = (f = ''): LedgerFilters['preset'] =>
      /last_month/.test(f) ? 'last_month' : /this_month|month/.test(f) ? 'month' : /week/.test(f) ? 'week' : /year/.test(f) ? 'year' : /3m/.test(f) ? '3m' : 'all';
    return qs.map((q) => {
      const label = `${q.table}${q.filter ? ' ' + q.filter : ''}`;
      if (q.table === 'transactions') {
        const parts = (q.filter || '').split(/[,|]/).map((s) => s.trim());
        const cat = parts.find((p) => p.startsWith('cat='))?.slice(4);
        const acc = parts.find((p) => p.startsWith('account='))?.slice(8);
        const f = normalizeFilters({ period: periodOf(q.filter), categories: cat ? [cat] : undefined, accounts: acc ? [acc] : undefined });
        const rows = applyFilters(app.txns, f);
        if (q.agg === 'count') return `${label} = ${rows.length} txns`;
        if (q.agg === 'list') return `${label} = ${rows.slice(0, 15).map((t) => `${t.merchant} ${Math.round(t.amount)}`).join('; ') || 'none'}`;
        const s = summarize(rows);
        return `${label} = out ${Math.round(s.outAED)} AED, in ${Math.round(s.inAED)} AED (${rows.length} txns)`;
      }
      if (q.table === 'accounts') return `accounts = ${app.accounts.map((a) => `${a.name} ${Math.round(a.balance)}${a.creditLimit ? '/' + a.creditLimit : ''}`).join('; ')}`;
      if (q.table === 'emis') return `emis = ${app.emis.map((e) => `${e.name} ${e.monthly}/mo (${e.monthsLeft}mo left)`).join('; ') || 'none'}`;
      if (q.table === 'subs') return `subs = ${app.subs.map((s) => `${s.name} ${s.amount}`).join('; ') || 'none'}`;
      if (q.table === 'tracked') return `tracked = ${app.tracked.filter((t) => t.status === 'open').map((t) => `${t.kind} ${t.title} ${t.amount}`).join('; ') || 'none'}`;
      return `${label} = (unknown table)`;
    }).join('\n');
  }, [app.txns, app.accounts, app.emis, app.subs, app.tracked]);

  // keep a ref of the latest messages for event handlers (read outside render)
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  useEffect(() => {
    isLive().then(setLive);
  }, []);

  // A file/text shared into Penny → attach it (and prefill any text) in the composer.
  // Deferred so the effect body doesn't trigger a synchronous state update.
  useEffect(() => {
    if (!open) return;
    const p = app.sharedPayload;
    if (!p) return;
    const t = setTimeout(() => {
      if (p.image) setPending({ kind: 'image', img: p.image });
      else if (p.file) setPending({ kind: 'file', file: p.file });
      if (p.text) setInput((cur) => (cur ? cur : p.text!));
      app.clearShared();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, app.sharedPayload]);

  const push = useCallback((m: Omit<ChatMsg, 'id'>): string => {
    const id = 'm' + MID++;
    const msg: ChatMsg = { id, enter: true, ...m };
    setMsgs((cur) => [...cur, msg]);
    return id;
  }, []);

  const patch = useCallback((id: string, fn: (m: ChatMsg) => ChatMsg) => {
    setMsgs((cur) => cur.map((m) => (m.id === id ? fn({ ...m, enter: false }) : m)));
  }, []);

  // auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [msgs, thinking, trace]);

  // persist transcript (for diagnostics / pull-and-review)
  useEffect(() => {
    if (msgs.length) logChat(msgs);
  }, [msgs]);

  // greeting on first open
  useEffect(() => {
    if (open && !booted.current) {
      booted.current = true;
      (async () => {
        await sleep(450);
        setThinking(true);
        await sleep(900);
        setThinking(false);
        push({
          role: 'agent',
          type: 'text',
          text: `Hey ${app.profile.name} 👋 — tell me what you spent, snap a bill, forward a bank SMS — or just ask me things about your money.`,
        });
        push({ role: 'agent', type: 'chips', data: { tag: 'starter', options: STARTERS } });
      })();
    }
    // greeting captures the name once on first open; intentionally not re-firing on name change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, push]);

  async function agentSay(text: string, delay = 700) {
    setThinking(true);
    await sleep(delay);
    setThinking(false);
    return push({ role: 'agent', type: 'text', text });
  }

  // Sparing "Want me to…?" follow-up — render confirm chips only when Penny
  // returned a genuinely useful next action.
  async function maybeSuggest(out: { suggestion?: ParseResult['suggestion'] }) {
    const s = out.suggestion;
    if (!s || !s.label || !s.action || s.action === 'none') return;
    await sleep(520);
    push({
      role: 'agent',
      type: 'chips',
      data: { tag: 'suggest', options: [s.label, 'Not now'], suggestAction: s.action, suggestFilters: s.filters ?? null },
    });
  }

  // Edit a logged expense inline — patch the card AND the persisted transaction.
  function editExpense(msgId: string, e: ParsedExpense) {
    patch(msgId, (mm) => ({ ...mm, data: { ...mm.data, expense: e } }));
    const m = msgsRef.current.find((x) => x.id === msgId);
    if (m?.data?.txnId) app.updateTxn(m.data.txnId, txnChangesFrom(e));
  }

  // Undo a logged expense — remove the transaction it created.
  function undoExpense(msgId: string) {
    const m = msgsRef.current.find((x) => x.id === msgId);
    if (m?.data?.undone) return;
    if (m?.data?.txnId) app.removeTxn(m.data.txnId);
    patch(msgId, (mm) => ({ ...mm, data: { ...mm.data, undone: true } }));
    if (lastExpenseRef.current === msgId) lastExpenseRef.current = null;
    app.toast('Entry removed');
  }

  function saveAccount(msgId: string) {
    const m = msgsRef.current.find((x) => x.id === msgId);
    if (!m || !m.data?.account) return;
    const a = m.data.account;
    patch(msgId, (mm) => ({ ...mm, data: { ...mm.data, saved: true } }));
    app.addAccount(a);
    app.toast(`${a.name} added — ${allAccounts().length + 1} accounts now`);
  }

  // Auto-log the moment Penny presents an expense — the card reflects "Logged",
  // with inline edit + Undo. (Previously this was a draft needing a Save tap, so
  // entries Penny said were "logged" silently weren't.)
  function pushExpenseCard(expense: ParsedExpense, live?: boolean) {
    const txnId = app.addTxn({
      merchant: expense.merchant,
      cat: expense.category,
      amount: expense.total,
      account: expense.account,
      nec: expense.necessity,
      items: expense.items,
      byPenny: true,
      ...(expense.category === 'income' ? { income: true } : {}),
      ...(expense.attribution && expense.attribution.mode !== 'self' ? { attribution: expense.attribution } : {}),
      ...(expense.tag ? { tag: expense.tag } : {}),
    });
    if (expense.category === 'groceries' && expense.items && expense.items.length) {
      app.learnPrices(expense.items.map((i) => ({ n: i.n, a: i.a })));
    }
    const id = push({ role: 'agent', type: 'expense', data: { expense, saved: true, live, txnId } });
    lastExpenseRef.current = id;
    app.toast('Logged ' + fmt(expense.total, app.currency));
    return id;
  }

  // ---------- main text pipeline (the model router) ----------
  async function handleText(text: string) {
    // Build the OPEN chat trail (since the last close) for Haiku — Layer 1 sees it all.
    const priorOpen = msgsRef.current.slice(trailStartRef.current);
    const trail: EngineTurn[] = [];
    for (const m of priorOpen) {
      if (m.type === 'text' && m.text) trail.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
      else if (m.role === 'agent' && m.type === 'expense' && m.data?.expense && !m.data?.undone) trail.push({ role: 'assistant', content: `(logged: ${m.data.expense.merchant} ${m.data.expense.total} AED, ${m.data.expense.category})` });
    }
    trail.push({ role: 'user', content: text });

    push({ role: 'user', type: 'text', text });
    setInput('');
    const plan = classify(text);
    const stepMs = plan.model === 'haiku' ? 520 : 900;
    setThinking(true);
    setTrace({ ...plan, idx: 0 });
    const timer = setInterval(() => {
      setTrace((tr) => (tr && tr.idx < tr.steps.length - 1 ? { ...tr, idx: tr.idx + 1 } : tr));
    }, stepMs);
    const prevMsg = lastExpenseRef.current ? msgsRef.current.find((m) => m.id === lastExpenseRef.current) : null;
    const prev = prevMsg && !prevMsg.data?.undone ? prevMsg.data?.expense || null : null;
    const turns = priorOpen.filter((m) => m.type === 'text' && m.text).map((m) => ({ role: m.role, text: m.text as string }));
    const extra = {
      name: app.profile.name,
      legend: buildLegend(app.accounts, app.categories),
      runQueries,
    };
    const [out] = await Promise.all([engineTurn(trail, extra), sleep(Math.min(plan.steps.length, 4) * stepMs)]);
    clearInterval(timer);
    setTrace(null);
    setThinking(false);
    if (out.close) trailStartRef.current = msgsRef.current.length; // topic resolved → next message starts fresh
    const modelTag = { model: out.model || plan.model, label: plan.label };

    if (out.kind === 'insight') {
      push({ role: 'agent', type: 'text', text: out.reply, data: modelTag });
      if (out.chart) {
        await sleep(420);
        push({ role: 'agent', type: 'chart', data: { k: out.chart } });
      }
      await maybeSuggest(out);
      return;
    }
    if (out.kind === 'note') {
      const ctxStr = turns.slice(-6, -1).map((tn) => `${tn.role === 'user' ? 'Me' : 'Penny'}: ${tn.text}`).join('\n');
      logNote(out.note || text, ctxStr || undefined);
      push({ role: 'agent', type: 'text', text: out.reply || "Noted — I've logged that with the conversation around it. 🛠️" });
      return;
    }
    if (out.kind === 'crud' && out.crud) {
      const res = applyCrud(app, out.crud);
      push({ role: 'agent', type: 'text', text: res.ok ? out.reply || res.message : res.message });
      if (res.ok) app.toast(res.message);
      await maybeSuggest(out);
      return;
    }
    if (out.kind === 'ledger') {
      const filters = normalizeFilters(out.filters);
      if (out.reply) push({ role: 'agent', type: 'text', text: out.reply });
      await sleep(300);
      app.openLedger(filters);
      return;
    }
    if (out.kind === 'track_add' && out.tracked) {
      app.addTracked(normalizeTracked(out.tracked));
      push({ role: 'agent', type: 'text', text: out.reply || "Tracked it — it's in your Money map now. 🧭" });
      return;
    }
    if (out.kind === 'profile_edit' && out.profile?.name) {
      const name = String(out.profile.name).trim().slice(0, 30);
      app.updateProfile({ name });
      push({ role: 'agent', type: 'text', text: out.reply || `Got it — I'll call you ${name} from now on. 👋` });
      return;
    }
    if (out.kind === 'account_edit') {
      const acct = out.match ? resolveAccount(out.match) : undefined;
      const changes = (out.account || {}) as Partial<Account>;
      if (acct) {
        const clean: Partial<Account> = {};
        if (changes.name) clean.name = changes.name;
        if (typeof changes.balance === 'number') clean.balance = changes.balance;
        if (typeof changes.creditLimit === 'number') clean.creditLimit = Math.abs(changes.creditLimit);
        if (changes.currency) clean.currency = changes.currency;
        if (changes.last4) clean.last4 = String(changes.last4).replace(/\D/g, '').slice(0, 4);
        if (changes.note) clean.note = changes.note;
        app.updateAccount(acct.id, clean);
        push({ role: 'agent', type: 'text', text: out.reply || `Updated ${acct.name}.` });
        app.toast(`${acct.name} updated`);
      } else {
        push({ role: 'agent', type: 'text', text: out.reply || "I couldn't tell which account to change — which one did you mean?" });
      }
      return;
    }
    if (out.kind === 'account_add' && out.account) {
      if (out.reply) push({ role: 'agent', type: 'text', text: out.reply });
      await sleep(380);
      const a = out.account;
      push({
        role: 'agent',
        type: 'account',
        data: {
          account: {
            name: a.name,
            group: a.group || 'bank',
            currency: a.currency || 'AED',
            balance: a.balance ?? 0,
            ...(a.creditLimit ? { creditLimit: Math.abs(a.creditLimit) } : {}),
            ...(a.last4 ? { last4: String(a.last4).replace(/\D/g, '').slice(0, 4) } : {}),
          },
          saved: false,
        },
      });
      return;
    }
    if (out.kind === 'correction' && prev && lastExpenseRef.current) {
      const id = lastExpenseRef.current;
      const merged = { ...prev, ...out.expense! };
      patch(id, (mm) => ({ ...mm, data: { ...mm.data, expense: merged, flash: true } }));
      const cm = msgsRef.current.find((m) => m.id === id);
      if (cm?.data?.txnId) app.updateTxn(cm.data.txnId, txnChangesFrom(merged));
      setTimeout(() => patch(id, (mm) => ({ ...mm, data: { ...mm.data, flash: false } })), 1400);
      push({ role: 'agent', type: 'text', text: out.reply || 'Fixed — updated the entry above. ✓' });
      return;
    }
    if (out.kind === 'grocery_add' && out.groceryItems && out.groceryItems.length) {
      out.groceryItems.forEach((n) => app.addGrocery(n));
      push({ role: 'agent', type: 'text', text: out.reply || 'Added to your grocery list.' });
      const soda = out.groceryItems.find((n) => /ginger ale|soda|cola|pepsi/i.test(n));
      if (soda) {
        await agentSay("Heads up though — that's the 3rd soda run this month (AED 66 so far). Want it on the list anyway?", 850);
        push({ role: 'agent', type: 'chips', data: { tag: 'soda', options: ['Keep it, I deserve it', "You're right, remove it", 'Add to watchlist'] } });
      }
      return;
    }
    if (out.expense && out.expense.total > 0) {
      if (out.reply) push({ role: 'agent', type: 'text', text: out.reply });
      await sleep(380);
      pushExpenseCard(out.expense, out.live);
      await maybeSuggest(out);
    } else {
      push({ role: 'agent', type: 'text', text: out.reply || 'Hmm, tell me a bit more — what was it and how much?' });
      await maybeSuggest(out);
    }
  }

  // ---------- MCQ routing ----------
  async function handleChip(msgId: string, tag: string | undefined, option: string) {
    patch(msgId, (mm) => ({ ...mm, data: { ...mm.data, picked: option } }));
    if (tag === 'starter') {
      if (/receipt/i.test(option)) return flowReceipt('library');
      if (/sms/i.test(option)) return demoSMS();
      return handleText(option);
    }
    if (tag === 'suggest') {
      if (/^not now$/i.test(option)) return;
      const m = msgsRef.current.find((x) => x.id === msgId);
      const action = m?.data?.suggestAction;
      if (action === 'ledger') {
        await agentSay('Opening it up for you…', 350);
        app.openLedger(normalizeFilters(m?.data?.suggestFilters ?? undefined));
      } else if (action === 'money_map') {
        await agentSay('Here\'s your money map…', 350);
        app.openMoney();
      } else if (action === 'new_list') {
        app.newShoppingList();
        await agentSay('Fresh shopping list started — just tell me what to add. 🛒', 450);
      } else if (action === 'watch') {
        await agentSay("Done — I'll keep an eye on that and flag it when it moves. 👀", 550);
      }
      return;
    }
    if (tag === 'soda') {
      if (/remove/i.test(option)) {
        app.removeGroceryByName('ginger ale');
        await agentSay('Done — off the list. Your future self says thanks.', 600);
      } else if (/watchlist/i.test(option)) {
        await agentSay("On the watchlist. I'll nudge you if soda crosses AED 80 this month.", 650);
      } else await agentSay('Fair enough — life needs fizz sometimes. It stays.', 600);
      return;
    }
    if (tag === 'receiptWatch') {
      if (/watch/i.test(option)) await agentSay('Watching it. Current soda total this month: AED 66. I\'ll flag the next one.', 700);
      else await agentSay('Noted — no judgement, just bookkeeping. 🙂', 600);
      return;
    }
    if (tag === 'stmtImport') {
      if (/import/i.test(option)) {
        setThinking(true);
        await sleep(1300);
        setThinking(false);
        push({
          role: 'agent',
          type: 'text',
          text:
            'Imported 42 transactions into ENBD Credit ✓\n\nWhile reading it I noticed 3 recurring charges: Netflix (AED 39), Anghami (AED 19.99) and a forgotten one — "CloudVault Pro" AED 36.75/mo since January. That\'s AED 220 so far.',
        });
        push({ role: 'agent', type: 'chips', data: { tag: 'cloudvault', options: ['Cancel CloudVault', 'Keep — I use it', 'Remind me next renewal'] } });
        app.toast('42 transactions imported');
      } else await agentSay('Okay, skipping the import. The statement stays attached to ENBD if you change your mind.', 700);
      return;
    }
    if (tag === 'cloudvault') {
      if (/cancel/i.test(option)) await agentSay("Added a cancellation reminder with the merchant's link — and I'll watch for the next charge. That's AED 441/yr back in your pocket.", 800);
      else if (/remind/i.test(option)) await agentSay("Will do — I'll nudge you 2 days before the next charge on the 4th.", 650);
      else await agentSay('Kept. I\'ll stop side-eyeing it. 👀', 600);
      return;
    }
  }

  // ---------- real attachment flows (camera / file) ----------
  async function flowReceipt(source: 'camera' | 'library', supplied?: PickedImage, hint?: string) {
    setSheet(false);
    const img = supplied || (await captureImage(source));
    if (!img) return;
    push({ role: 'user', type: 'receipt', data: { dataUrl: img.dataUrl } });
    setThinking(true);
    const res = await parseReceipt(img.base64, img.mime, hint);
    setThinking(false);
    push({ role: 'agent', type: 'text', text: res.reply });
    if (res.items && res.items.length) app.learnPrices(res.items.map((i) => ({ n: i.n, a: i.a })));
    await sleep(420);
    push({ role: 'agent', type: 'analysis', data: { items: res.items } });
    await sleep(500);
    pushExpenseCard(res.expense, res.live);
    if (res.followUp) {
      await agentSay(res.followUp, 900);
      push({ role: 'agent', type: 'chips', data: { tag: 'receiptWatch', options: ['Yes, watch it', 'Let it slide'] } });
    }
  }

  async function flowStatement(supplied?: PickedFile, hint?: string) {
    setSheet(false);
    const file = supplied || (await pickFile());
    if (!file) return;
    const kb = file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : (file.mime || 'file').split('/').pop()?.toUpperCase();
    push({ role: 'user', type: 'file', text: file.name, data: { fileSize: kb } });
    setThinking(true);
    const res = await parseStatement(file.base64, file.mime, file.name, hint);
    setThinking(false);
    push({ role: 'agent', type: 'text', text: res.reply });
    push({ role: 'agent', type: 'chips', data: { tag: res.followUpTag, options: res.followUpOptions } });
  }

  // SMS demo — scripted bank alert; also reachable by pasting SMS text into the composer
  async function demoSMS() {
    setSheet(false);
    await sleep(300);
    push({
      role: 'user',
      type: 'sms',
      text: 'Your Credit Card ending 7812 was used for AED 187.50 at NOON COM on 12/06/26 09:14. Avl Limit AED 11,815.',
    });
    setThinking(true);
    await sleep(1400);
    setThinking(false);
    push({
      role: 'agent',
      type: 'text',
      text: "Got it from the SMS — Noon order, AED 187.50 on your ENBD card. I've guessed Shopping; fix me if it was something boring like printer ink.",
    });
    await sleep(380);
    pushExpenseCard({
      merchant: 'Noon.com',
      total: 187.5,
      currency: 'AED',
      category: 'shopping',
      account: 'enbd',
      items: [],
      necessity: 4,
      necessityNote: "Second Noon order in 8 days — this month's online shopping: AED 346.",
    });
  }

  // Send the composer: an attachment (with the typed text as a hint) or plain text.
  function send() {
    const text = input.trim();
    if (pending) {
      const p = pending;
      setPending(null);
      setInput('');
      if (text) push({ role: 'user', type: 'text', text });
      if (p.kind === 'image') void flowReceipt('library', p.img, text || undefined);
      else void flowStatement(p.file, text || undefined);
      return;
    }
    if (text && !thinking) handleText(text);
  }

  // ---------- render ----------
  const canSend = !thinking && (input.trim().length > 0 || !!pending);
  const updateAccount = (id: string, a: ParsedAccount) =>
    patch(id, (mm) => ({ ...mm, data: { ...mm.data, account: a } }));

  return (
    <div className={`chat-overlay${open ? ' open' : ''}`}>
      <div className="chat-head">
        <button
          onClick={app.closeChat}
          style={{
            border: 0,
            background: 'var(--surface)',
            width: 36,
            height: 36,
            borderRadius: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-soft)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Icons.chevD size={18} />
        </button>
        <AgentAvatar size={42} thinking={thinking} />
        <div style={{ flex: 1 }}>
          <div className="h-display" style={{ fontSize: 17, lineHeight: 1.15 }}>
            Penny
          </div>
          <div style={{ fontSize: 11.5, color: thinking ? 'var(--amber-deep)' : 'var(--sage-deep)', fontWeight: 600, transition: 'color 0.3s' }}>
            {thinking ? 'thinking…' : 'your money companion'}
          </div>
        </div>
        <span className="eyebrow" style={{ fontSize: 9.5, background: 'var(--accent-tint)', color: 'var(--accent-deep)', padding: '4px 9px', borderRadius: 999 }}>
          {live ? 'haiku live' : 'demo mode'}
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {msgs.map((m) => {
          const enter = m.enter ? ' msg-enter' : '';
          if (m.type === 'text')
            return (
              <div key={m.id} className={`msg-row ${m.role}${enter}`}>
                <div className={`bubble ${m.role}`}>
                  {m.text}
                  {m.role === 'agent' && m.data?.model && <ModelTag model={m.data.model} label={m.data.label} />}
                </div>
              </div>
            );
          if (m.type === 'chart')
            return (
              <div key={m.id} className={`msg-row agent${enter}`}>
                <ChartMsg k={m.data!.k!} currency={app.currency} />
              </div>
            );
          if (m.type === 'account')
            return (
              <div key={m.id} className={`msg-row agent${enter}`}>
                <AccountCard msg={m} onUpdate={(a) => updateAccount(m.id, a)} onSave={() => saveAccount(m.id)} />
              </div>
            );
          if (m.type === 'sms')
            return (
              <div key={m.id} className={`msg-row user${enter}`}>
                <div className="bubble user">
                  <div className="sms-quote">Forwarded SMS · Emirates NBD</div>
                  {m.text}
                </div>
              </div>
            );
          if (m.type === 'file')
            return (
              <div key={m.id} className={`msg-row user${enter}`}>
                <div className="bubble user" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: 'rgba(252,250,242,0.18)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icons.filetext size={18} />
                  </span>
                  <span>
                    <span style={{ fontWeight: 700, display: 'block', fontSize: 13.5 }}>{m.text}</span>
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{m.data?.fileSize || 'PDF'}</span>
                  </span>
                </div>
              </div>
            );
          if (m.type === 'receipt')
            return (
              <div key={m.id} className={`msg-row user${enter}`}>
                <ReceiptPhoto dataUrl={m.data?.dataUrl} />
              </div>
            );
          if (m.type === 'analysis')
            return (
              <div key={m.id} className={`msg-row agent${enter}`}>
                <AnalysisCard items={m.data!.items!} currency={app.currency} />
              </div>
            );
          if (m.type === 'expense')
            return (
              <div key={m.id} className={`msg-row agent${enter}`}>
                <ExpenseCard msg={m} currency={app.currency} onUpdate={(e) => editExpense(m.id, e)} onUndo={() => undoExpense(m.id)} />
              </div>
            );
          if (m.type === 'chips')
            return (
              <div key={m.id} className={`msg-row agent${enter}`}>
                <div className="mcq-wrap">
                  {m.data!.options!.map((o) => (
                    <button
                      key={o}
                      className={`chip-btn${m.data!.picked === o ? ' primary' : ''}`}
                      disabled={!!m.data!.picked}
                      style={m.data!.picked && m.data!.picked !== o ? { opacity: 0.4 } : undefined}
                      onClick={() => handleChip(m.id, m.data!.tag, o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            );
          return null;
        })}
        {(thinking || trace) && (
          <div className="msg-row agent msg-enter">
            {trace ? (
              <TraceBubble trace={trace} />
            ) : (
              <div className="bubble agent" style={{ padding: '8px 14px' }}>
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="composer">
        {msgs.length > 2 && !thinking && (
          <div className="composer-chips">
            {COMPOSER_SUGGESTIONS.map((s) => (
              <button key={s} className="chip-btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => handleText(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {pending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 4px 8px', padding: 8, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            {pending.kind === 'image' ? (
              <img src={pending.img.dataUrl} alt="attachment" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover' }} />
            ) : (
              <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 42, height: 42, borderRadius: 10 }}><Icons.filetext size={20} /></span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pending.kind === 'image' ? 'Photo attached' : pending.file.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>Add a note, then send</span>
            </span>
            <button onClick={() => setPending(null)} aria-label="Remove attachment" style={{ border: 0, background: 'var(--surface-2, #ECE6D8)', width: 28, height: 28, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}><Icons.close size={14} /></button>
          </div>
        )}
        <div className="composer-bar">
          <button className="attach-btn" onClick={() => setSheet(true)} aria-label="Attach">
            <Icons.plus size={19} />
          </button>
          <textarea
            rows={1}
            placeholder={pending ? 'Add a note (optional)…' : 'had tea and snack 2+3, 5 aed…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && canSend) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="send-btn" disabled={!canSend} onClick={send} aria-label="Send">
            <Icons.send size={17} />
          </button>
        </div>
      </div>

      {/* attach sheet */}
      <div className={`sheet-dim${sheet ? ' open' : ''}`} onClick={() => setSheet(false)} />
      <div className={`sheet${sheet ? ' open' : ''}`}>
        <div className="h-display" style={{ fontSize: 16, padding: '0 10px 10px' }}>
          Send Penny something to read
        </div>
        {SHEET_OPTIONS.map((o) => {
          const Ico = o.Icon;
          const onClick = o.key === 'receipt' ? () => flowReceipt('camera') : o.key === 'sms' ? demoSMS : () => flowStatement();
          return (
            <button className="sheet-opt" key={o.key} onClick={onClick}>
              <span className="icon-bub" style={{ background: o.tint, color: o.color, width: 42, height: 42, borderRadius: 15 }}>
                <Ico size={20} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{o.t}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{o.s}</span>
              </span>
              <Icons.chevR size={15} color="var(--muted)" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
