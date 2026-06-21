// Penny — chat view: the conversational logging surface (the core experience)
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt, allAccounts } from '../lib/data';
import { classify, isLive, parseReceipt, parseStatement } from '../lib/llm';
import { logChat } from '../lib/diag';
import { runAgent, type AgentMsg } from '../lib/agent/loop';
import { makeAgentData } from '../lib/agent/appData';
import { leanUserBlock, fullUserBlock } from '../lib/agent/context';
import { captureImage, pickFile } from '../lib/media';
import type { PickedFile, PickedImage } from '../lib/media';
import type { ParsedAccount, ParsedExpense } from '../lib/types';
import { AgentAvatar } from '../components/Avatar';
import { Icons } from '../components/Icons';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  const [confirmReq, setConfirmReq] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<ChatMsg[]>(msgs);
  const lastExpenseRef = useRef<string | null>(null);
  const booted = useRef(false);
  const trailStartRef = useRef(0); // index into msgs where the current open trail begins (reset on close)
  const awaitingRef = useRef(false); // true when the agent asked a question and is waiting for the user's reply

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
  function pushExpenseCard(expense: ParsedExpense, live?: boolean, existingTxnId?: string) {
    // existingTxnId = the agent already inserted the row; show a display-only card.
    const txnId = existingTxnId || app.addTxn({
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
    // Open chat trail (since the last close) for the agent's memory window.
    const priorOpen = msgsRef.current.slice(trailStartRef.current);
    const trail: AgentMsg[] = [];
    for (const m of priorOpen) {
      if (m.type === 'text' && m.text) trail.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
      else if (m.role === 'agent' && m.type === 'expense' && m.data?.expense && !m.data?.undone) trail.push({ role: 'assistant', content: `(logged ${m.data.expense.merchant} ${m.data.expense.total} AED)` });
    }

    push({ role: 'user', type: 'text', text });
    setInput('');
    const plan = classify(text);
    const stepMs = plan.model === 'haiku' ? 480 : 800;
    setThinking(true);
    setTrace({ ...plan, idx: 0 });
    const timer = setInterval(() => setTrace((tr) => (tr && tr.idx < tr.steps.length - 1 ? { ...tr, idx: tr.idx + 1 } : tr)), stepMs);

    const data = makeAgentData(app);
    const ctx = { name: app.profile.name, currency: app.currency, accounts: app.accounts, categories: app.categories, creditLines: app.creditLines };
    const confirm = (msg: string) => new Promise<boolean>((resolve) => setConfirmReq({ msg, resolve }));

    const [out] = await Promise.all([
      runAgent({ text, trail, leanBlock: leanUserBlock(ctx), fullBlock: fullUserBlock(ctx), data, confirm, forceFull: awaitingRef.current }),
      sleep(Math.min(plan.steps.length, 3) * stepMs),
    ]);
    clearInterval(timer);
    setTrace(null);
    setThinking(false);
    awaitingRef.current = out.awaiting; // remember if the agent is waiting for the user's reply

    // No local guessing. If Penny's AI couldn't run, NEVER log from a heuristic —
    // tell the user why (no key vs transient) so nothing gets logged wrongly.
    if (!out.live) {
      push({
        role: 'agent',
        type: 'text',
        text: live
          ? "I couldn't reach my brain just now — give it a moment and send that again."
          : "I need your Anthropic API key before I can understand messages. Add it in Menu → Settings → Penny AI, then I'll handle this properly. (You can still add things manually with the + button.)",
      });
      return;
    }

    if (out.reply) push({ role: 'agent', type: 'text', text: out.reply });
    // Expense rows already inserted by the executor — show the rich card (display-only).
    for (const w of out.writes) {
      if (w.result.ok && w.result.kind === 'expense' && w.result.data) {
        await sleep(280);
        const d = w.result.data as { expense: ParsedExpense; txnId: string };
        pushExpenseCard(d.expense, true, d.txnId);
      }
    }
    if (out.close) trailStartRef.current = msgsRef.current.length;
  }

  // ---------- MCQ routing ----------
  async function handleChip(msgId: string, tag: string | undefined, option: string) {
    patch(msgId, (mm) => ({ ...mm, data: { ...mm.data, picked: option } }));
    if (tag === 'starter') {
      if (/receipt/i.test(option)) return flowReceipt('library');
      if (/sms/i.test(option)) return demoSMS();
      return handleText(option);
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

      {/* agent confirm — balance changes, deletes, settles */}
      <ConfirmDialog
        open={!!confirmReq}
        opts={confirmReq ? { title: 'Confirm', danger: true, confirmLabel: 'Yes, do it', message: <>{confirmReq.msg}</> } : null}
        onConfirm={() => { confirmReq?.resolve(true); setConfirmReq(null); }}
        onCancel={() => { confirmReq?.resolve(false); setConfirmReq(null); }}
      />
    </div>
  );
}
