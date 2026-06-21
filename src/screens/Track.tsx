// Penny — Track: EMIs, Subscriptions (watchdog), Grocery list
import { useState } from 'react';
import { CATS, CAT_IDS, INCOME_MO, LS, dayLabel, fmt } from '../lib/data';
import { itemsOfKind } from '../lib/money';
import type { Emi, Sub, SubDecision } from '../lib/types';
import { AgentAvatar } from '../components/Avatar';
import { CatIcon, Icons } from '../components/Icons';
import { EditSheet } from '../components/EditSheet';
import type { Field, FormValues } from '../components/EditSheet';
import { Bar, Gauge, SectionHead, Segmented } from '../components/ui';
import { useApp } from '../state/AppContext';

function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <div className="amount h-display" style={{ fontSize: 18, fontWeight: 700, marginTop: 3, color: color || 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

const EMI_FIELDS: Field[] = [
  { key: 'name', label: 'Name', type: 'text', placeholder: 'Car loan' },
  { key: 'lender', label: 'Lender', type: 'text', placeholder: 'FAB Auto' },
  { key: 'monthly', label: 'Monthly', type: 'number' },
  { key: 'remaining', label: 'Remaining', type: 'number' },
  { key: 'months', label: 'Total months', type: 'number' },
  { key: 'monthsLeft', label: 'Months left', type: 'number' },
  { key: 'rate', label: 'Rate % (flat)', type: 'number' },
  { key: 'interestMo', label: 'Interest/mo', type: 'number' },
];

function EmiPane() {
  const app = useApp();
  const cur = app.currency;
  const emis = app.emis;
  const [editing, setEditing] = useState<Emi | 'new' | null>(null);
  const totalMo = emis.reduce((s, e) => s + e.monthly, 0);
  const interestMo = emis.reduce((s, e) => s + e.interestMo, 0);
  const outstanding = emis.reduce((s, e) => s + e.remaining, 0);
  const ratio = INCOME_MO ? totalMo / INCOME_MO : 0;

  const initial = editing && editing !== 'new'
    ? { name: editing.name, lender: editing.lender, monthly: editing.monthly, remaining: editing.remaining, months: editing.months, monthsLeft: editing.monthsLeft, rate: editing.rate, interestMo: editing.interestMo }
    : { name: '', lender: '', monthly: 0, remaining: 0, months: 12, monthsLeft: 12, rate: 0, interestMo: 0 };

  const onSave = (v: FormValues) => {
    const e = {
      name: String(v.name || 'Plan'),
      lender: String(v.lender || ''),
      monthly: Number(v.monthly) || 0,
      principal: Number(v.remaining) || 0,
      remaining: Number(v.remaining) || 0,
      months: Number(v.months) || 1,
      monthsLeft: Number(v.monthsLeft) || 0,
      rate: Number(v.rate) || 0,
      interestMo: Number(v.interestMo) || 0,
    };
    if (editing === 'new') app.addEmi(e);
    else if (editing) app.updateEmi(editing.id, e);
    setEditing(null);
  };

  return (
    <div>
      <div className="card" style={{ margin: '0 20px', padding: '18px 18px 16px', display: 'flex', gap: 18, alignItems: 'center' }}>
        <Gauge value={ratio} max={0.5} size={104} stroke={10} color={ratio < 0.25 ? 'var(--sage)' : ratio < 0.35 ? 'var(--amber)' : 'var(--coral)'}>
          <div className="amount h-display" style={{ fontSize: 21, fontWeight: 700 }}>{(ratio * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em' }}>EMI / INCOME</div>
        </Gauge>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <StatCell label="Monthly EMIs" value={fmt(totalMo, cur)} sub={`of ${fmt(INCOME_MO, cur)} income`} />
          <StatCell label="Interest / income" value={((interestMo / INCOME_MO) * 100).toFixed(2) + '%'} sub={fmt(interestMo, cur) + '/mo to interest'} color="var(--amber-deep)" />
        </div>
      </div>

      <SectionHead title="Active plans" action="+ Add plan" onAction={() => setEditing('new')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
        {emis.map((e) => {
          const done = e.months ? (e.months - e.monthsLeft) / e.months : 0;
          return (
            <div key={e.id} className="card" style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setEditing(e)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
                    {e.lender} · {e.rate > 0 ? e.rate + '% flat' : '0% interest'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="amount h-display" style={{ fontSize: 16, fontWeight: 700 }}>{fmt(e.monthly, cur)}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>/mo</span>
                </div>
              </div>
              <div style={{ marginTop: 11 }}>
                <Bar value={done} max={1} color={e.rate > 0 ? 'var(--amber)' : 'var(--sage)'} height={7} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>
                <span>{e.monthsLeft} of {e.months} months left</span>
                <span className="amount">{fmt(e.remaining, cur)} remaining</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ margin: '12px 20px 0' }}>
        <StatCell label="Total outstanding" value={fmt(outstanding, cur)} sub={`across ${emis.length} plan${emis.length === 1 ? '' : 's'} · tap any to edit`} />
      </div>

      <EditSheet
        open={editing !== null}
        title={editing === 'new' ? 'Add EMI / plan' : 'Edit plan'}
        fields={EMI_FIELDS}
        initial={initial}
        onSave={onSave}
        onClose={() => setEditing(null)}
        onDelete={editing && editing !== 'new' ? () => { app.removeEmi(editing.id); setEditing(null); } : undefined}
      />
    </div>
  );
}

function SubsPane() {
  const app = useApp();
  const cur = app.currency;
  const [decided, setDecided] = useState<Record<string, SubDecision>>(() => LS.read('subsDecided', {}));
  const decide = (id: string, v: SubDecision) => {
    const next = { ...decided, [id]: v };
    setDecided(next);
    LS.write('subsDecided', next);
    app.toast(v === 'cancel' ? 'Cancellation reminder set' : v === 'keep' ? "Kept — I'll stop asking" : 'Will re-check next month');
  };
  const subs = app.subs;
  const [editing, setEditing] = useState<Sub | 'new' | null>(null);
  const totalMo = subs.reduce((s, x) => s + x.amount, 0);
  const wasteMo = subs.filter((x) => x.flag && decided[x.id] !== 'keep').reduce((s, x) => s + x.amount, 0);

  const subInitial = editing && editing !== 'new'
    ? { name: editing.name, amount: editing.amount, nextIn: editing.nextIn, cat: editing.cat, lastUsed: editing.lastUsed, flag: editing.flag, attrMode: editing.attribution?.mode || 'self', attrWho: editing.attribution?.who || '' }
    : { name: '', amount: 0, nextIn: 30, cat: 'subs', lastUsed: '', flag: '', attrMode: 'self', attrWho: '' };
  const onSaveSub = (v: FormValues) => {
    const mode = String(v.attrMode || 'self') as 'self' | 'company' | 'person' | 'lent';
    const s = {
      name: String(v.name || 'Subscription'),
      amount: Number(v.amount) || 0,
      every: 'month',
      nextIn: Number(v.nextIn) || 30,
      cat: (String(v.cat || 'subs')) as Sub['cat'],
      lastUsed: v.lastUsed === '' || v.lastUsed == null ? undefined : Number(v.lastUsed),
      flag: v.flag ? String(v.flag) : undefined,
      attribution: mode !== 'self' ? { mode, who: v.attrWho ? String(v.attrWho) : undefined } : undefined,
    };
    if (editing === 'new') app.addSub(s);
    else if (editing) app.updateSub(editing.id, s);
    setEditing(null);
  };

  // variable income (business owner — inconsistent salary): expected range vs received this month
  const incomeItems = itemsOfKind(app.tracked, 'income');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const receivedThisMonth = app.txns.filter((t) => t.income && t.ts >= monthStart).reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      {/* income (variable) */}
      <div style={{ margin: '0 20px 14px' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Income · this month</div>
        {incomeItems.length ? (
          incomeItems.map((it) => {
            const min = it.expectedMin || it.amount || 0;
            const max = it.expectedMax || it.amount || min;
            return (
              <div key={it.id} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{it.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
                      Expected {fmt(min, cur)}{max > min ? `–${fmt(max, cur)}` : ''}/mo · variable
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--sage-deep)' }}>{fmt(receivedThisMonth, cur)}</span>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>received</div>
                  </div>
                </div>
                <div style={{ marginTop: 11 }}>
                  <Bar value={receivedThisMonth} max={max || 1} color="var(--sage)" height={7} />
                </div>
              </div>
            );
          })
        ) : (
          <div className="ai-note sage">
            <span style={{ flexShrink: 0, marginTop: 1 }}><AgentAvatar size={16} /></span>
            <span>
              <b>Track your income.</b> It varies — tell Penny your typical range (e.g. “my income is usually 15,000–20,000”) and log each payment (“received 16,000 from the business”). I’ll show expected vs received here.
            </span>
          </div>
        )}
      </div>

      <div className="card" style={{ margin: '0 20px', padding: '16px 18px', display: 'flex', gap: 12 }}>
        <StatCell label="Recurring / month" value={fmt(totalMo, cur)} sub={`${subs.length} commitments incl. rent`} />
        <StatCell label="Possibly idle" value={fmt(wasteMo, cur)} sub={fmt(wasteMo * 12, cur) + '/yr if cancelled'} color="var(--coral-deep)" />
      </div>
      <SectionHead title="Watchdog" action="+ Add" onAction={() => setEditing('new')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
        {subs.map((s) => (
          <div key={s.id} className="card" style={{ padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }} onClick={() => setEditing(s)}>
              <CatIcon cat={s.cat} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
                  renews in {s.nextIn}d{s.lastUsed != null ? ` · used ${s.lastUsed === 0 ? 'today' : s.lastUsed + 'd ago'}` : ''}
                </div>
              </div>
              <div className="amount h-display" style={{ fontWeight: 700, fontSize: 15 }}>{fmt(s.amount, cur)}</div>
            </div>
            {s.flag && (
              <div style={{ marginTop: 10 }}>
                <div className="ai-note coral">
                  <span style={{ flexShrink: 0, marginTop: 1 }}><Icons.flag size={14} /></span>
                  <span>{s.flag}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                  {decided[s.id] ? (
                    <span className="nec-pill" style={{ background: 'var(--sage-tint)', color: 'var(--sage-deep)' }}>
                      <Icons.check size={12} /> {decided[s.id] === 'cancel' ? 'Cancelling' : decided[s.id] === 'keep' ? 'Keeping' : 'Snoozed'}
                    </span>
                  ) : (
                    <>
                      <button className="chip-btn" style={{ fontSize: 12 }} onClick={() => decide(s.id, 'cancel')}>Cancel it</button>
                      <button className="chip-btn" style={{ fontSize: 12 }} onClick={() => decide(s.id, 'keep')}>I use it</button>
                      <button className="chip-btn" style={{ fontSize: 12 }} onClick={() => decide(s.id, 'snooze')}>Ask later</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <EditSheet
        open={editing !== null}
        title={editing === 'new' ? 'Add subscription' : 'Edit subscription'}
        fields={SUB_FIELDS}
        initial={subInitial}
        onSave={onSaveSub}
        onClose={() => setEditing(null)}
        onDelete={editing && editing !== 'new' ? () => { app.removeSub(editing.id); setEditing(null); } : undefined}
      />
    </div>
  );
}

const SUB_FIELDS: Field[] = [
  { key: 'name', label: 'Name', type: 'text', placeholder: 'Netflix' },
  { key: 'amount', label: 'Amount / mo', type: 'number' },
  { key: 'nextIn', label: 'Renews in (days)', type: 'number' },
  { key: 'cat', label: 'Category', type: 'select', options: CAT_IDS.filter((c) => c !== 'income').map((c) => ({ value: c, label: CATS[c].label })) },
  { key: 'lastUsed', label: 'Last used (days ago)', type: 'number' },
  { key: 'flag', label: 'Flag note', type: 'text', placeholder: 'optional' },
  { key: 'attrMode', label: 'For', type: 'select', options: [{ value: 'self', label: 'Just me' }, { value: 'company', label: 'My business' }, { value: 'person', label: 'Someone else' }, { value: 'lent', label: 'Lent out' }] },
  { key: 'attrWho', label: 'Who (if not me)', type: 'text', placeholder: 'business / name' },
];

function ShoppingPane() {
  const app = useApp();
  const cur = app.currency;
  const [input, setInput] = useState('');
  const [estimate, setEstimate] = useState<{ total: number; priced: number; unknown: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const open = app.openList;
  const items = open?.items || [];
  const toBuy = items.filter((i) => !i.done).length;
  const completed = [...app.shoppingLists.filter((l) => l.status === 'done')].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const suggestions = app.master
    .filter((m) => !items.some((it) => it.name.toLowerCase() === m.label.toLowerCase()))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const add = (name: string) => {
    if (name.trim()) {
      app.addShoppingItem(name.trim());
      setInput('');
      setEstimate(null);
    }
  };

  const accountFields: Field[] = [
    { key: 'amount', label: 'Total bill', type: 'number' },
    { key: 'merchant', label: 'Where', type: 'text', placeholder: 'Carrefour' },
    { key: 'account', label: 'Paid with', type: 'select', options: app.accounts.map((a) => ({ value: a.id, label: a.name })) },
  ];

  return (
    <div>
      {open ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 20px 8px' }}>
            <span>
              <span className="h-display" style={{ fontSize: 17 }}>{open.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}><Icons.calendar size={12} /> Started {dayLabel(open.createdAt)}</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{toBuy} to buy</span>
          </div>

          <div style={{ padding: '0 16px' }}>
            {items.length === 0 ? (
              <div className="card" style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Empty — add items below or tell Penny.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => app.toggleShoppingItem(it.id)}
                    style={{
                      position: 'relative', textAlign: 'left', cursor: 'pointer', border: it.done ? '1.5px solid var(--sage)' : '1px solid var(--line)',
                      background: it.done ? 'var(--sage-tint)' : 'var(--surface)', borderRadius: 14, padding: '12px 12px 11px', minHeight: 64,
                      display: 'flex', flexDirection: 'column', gap: 4, boxShadow: it.done ? 'none' : 'var(--shadow-card)', transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <span style={{ position: 'absolute', top: 8, right: 8 }} onClick={(e) => { e.stopPropagation(); app.removeShoppingItem(it.id); }} role="button" aria-label="remove">
                      <Icons.close size={13} color="var(--muted)" />
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span className={`groc-check${it.done ? ' on' : ''}`} style={{ width: 18, height: 18, flexShrink: 0 }}>
                        {it.done && <Icons.check size={11} color="#fff" sw={2.8} />}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.2, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--sage-deep)' : 'var(--ink)', paddingRight: 12 }}>{it.name}</span>
                    </span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 25 }}>
                      {it.estPrice != null && it.estPrice > 0 && <span className="amount" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>≈{fmt(it.estPrice, cur)}</span>}
                      {it.qty && <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, background: 'var(--surface-2)', borderRadius: 999, padding: '2px 8px' }}>{it.qty}</span>}
                    </span>
                    {it.note && !it.done && (
                      <span className={`ai-note ${it.noteKind === 'skip' ? '' : 'coral'}`} style={{ fontSize: 11, marginTop: 2 }}>
                        <span style={{ flexShrink: 0 }}><AgentAvatar size={14} /></span>
                        <span>{it.note}</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(input); }}
                placeholder="Add an item…"
                style={{ flex: 1, border: '1px solid var(--line-strong)', background: 'var(--surface)', borderRadius: 999, padding: '9px 16px', fontFamily: 'var(--font-body)', fontSize: 13.5, outline: 'none', color: 'var(--ink)' }}
              />
              <button className="chip-btn primary" style={{ padding: '9px 16px' }} onClick={() => add(input)}>Add</button>
            </div>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {suggestions.map((m) => (
                  <button key={m.key} className="chip-btn" style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={() => add(m.label)}>
                    + {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* estimate result */}
          {estimate && (
            <div style={{ margin: '12px 20px 0' }}>
              <div className="ai-note sage">
                <span style={{ flexShrink: 0, marginTop: 1 }}><Icons.coins size={15} /></span>
                <span>
                  <b>Estimated basket ≈ {fmt(estimate.total, cur)}.</b> {estimate.priced} item{estimate.priced === 1 ? '' : 's'} priced from your history{estimate.unknown ? `, ${estimate.unknown} not seen before (no price yet)` : ''}. Budget before you go.
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0' }}>
            <button className="chip-btn" style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEstimate(app.estimateOpenList())}>
              <Icons.coins size={15} /> Estimate basket
            </button>
            <button className="chip-btn primary" style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setFinishing(true)}>
              <Icons.check size={15} color="#FBF7EC" /> Finish &amp; log bill
            </button>
          </div>
        </>
      ) : (
        <div style={{ padding: '0 20px' }}>
          <div className="ai-note sage" style={{ marginBottom: 14 }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}><Icons.basket size={15} /></span>
            <span><b>No open list.</b> Start a fresh one — add items here or in chat, estimate the basket from your price history, then log the bill when you're done.</span>
          </div>
          <button className="chip-btn primary" style={{ width: '100%', padding: '11px', justifyContent: 'center', display: 'flex' }} onClick={() => app.newShoppingList()}>
            Start a new list
          </button>
        </div>
      )}

      {/* history of completed lists */}
      {completed.length > 0 && (
        <>
          <SectionHead title="Past lists" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
            {completed.map((l) => {
              const over = l.actualAED != null && l.estimateAED != null && l.estimateAED > 0 && l.actualAED > l.estimateAED * 1.12;
              const under = l.actualAED != null && l.estimateAED != null && l.estimateAED > 0 && l.actualAED < l.estimateAED * 0.95;
              return (
                <div key={l.id} className="card" style={{ padding: '13px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.merchant || l.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                        {l.completedAt ? dayLabel(l.completedAt) : ''} · {l.items.length} items
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="amount h-display" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(l.actualAED || 0, cur)}</div>
                      {l.estimateAED ? <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>est {fmt(l.estimateAED, cur)}</div> : null}
                    </div>
                  </div>
                  {(over || under) && (
                    <div className={`ai-note ${over ? 'coral' : 'sage'}`} style={{ marginTop: 9, fontSize: 12 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><Icons.flag size={13} /></span>
                      <span>
                        {over
                          ? `Spent ${fmt((l.actualAED || 0) - (l.estimateAED || 0), cur)} over your estimate — likely unplanned add-ons. Worth a look at what crept in.`
                          : `Came in under your estimate by ${fmt((l.estimateAED || 0) - (l.actualAED || 0), cur)} — disciplined trip.`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <EditSheet
        open={finishing}
        title="Finish & log the bill"
        fields={accountFields}
        initial={{ amount: estimate?.total || open?.estimateAED || 0, merchant: '', account: app.accounts[0]?.id }}
        saveLabel="Log & archive list"
        onSave={(v) => {
          app.finishShopping({ amount: Number(v.amount) || 0, merchant: v.merchant ? String(v.merchant) : undefined, account: v.account ? String(v.account) : undefined });
          setFinishing(false);
          setEstimate(null);
          app.toast('Shopping logged & list archived');
        }}
        onClose={() => setFinishing(false)}
      />
    </div>
  );
}

export function TrackScreen() {
  const [tab, setTab] = useState('EMIs');
  return (
    <div className="screen">
      <div className="home-head">
        <div className="h-display" style={{ fontSize: 24 }}>Track</div>
      </div>
      <Segmented options={['EMIs', 'Recurring', 'Shopping']} value={tab} onChange={setTab} />
      {tab === 'EMIs' && <EmiPane />}
      {tab === 'Recurring' && <SubsPane />}
      {tab === 'Shopping' && <ShoppingPane />}
      <div style={{ height: 10 }} />
    </div>
  );
}
