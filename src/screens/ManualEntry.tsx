// Penny — manual (non-AI) expense entry with an on-screen calculator and the
// business/someone-else attribution selector. Opened from the FAB toggle.
import { useState } from 'react';
import type { AttributionMode, CategoryId, TxnTag } from '../lib/types';
import { fmt } from '../lib/data';
import { Icons } from '../components/Icons';
import { useApp } from '../state/AppContext';

type Calc = { acc: number | null; op: string | null; buf: string; done?: boolean };
const apply = (a: number, op: string, b: number): number => (op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? (b === 0 ? a : a / b) : b);
function press(c: Calc, key: string): Calc {
  if (/[0-9]/.test(key)) {
    if (c.done) return { acc: null, op: null, buf: key };
    return { ...c, buf: (c.buf === '0' ? '' : c.buf) + key };
  }
  if (key === '.') {
    if (c.done) return { acc: null, op: null, buf: '0.' };
    return { ...c, buf: c.buf.includes('.') ? c.buf : (c.buf || '0') + '.' };
  }
  if (key === 'del') return { ...c, buf: c.buf.slice(0, -1) };
  if (key === 'C') return { acc: null, op: null, buf: '' };
  if (['+', '-', '*', '/'].includes(key)) {
    if (c.done) return { acc: parseFloat(c.buf) || 0, op: key, buf: '' };
    if (c.op && c.buf !== '') return { acc: apply(c.acc ?? 0, c.op, parseFloat(c.buf)), op: key, buf: '' };
    if (c.buf !== '') return { acc: parseFloat(c.buf), op: key, buf: '' };
    return { ...c, op: key };
  }
  if (key === '=') {
    if (c.op && c.buf !== '') return { acc: null, op: null, buf: String(Math.round(apply(c.acc ?? 0, c.op, parseFloat(c.buf)) * 100) / 100), done: true };
    return c;
  }
  return c;
}
const calcValue = (c: Calc): number => {
  if (c.op && c.buf !== '') return apply(c.acc ?? 0, c.op, parseFloat(c.buf));
  if (c.buf !== '') return parseFloat(c.buf) || 0;
  return c.acc ?? 0;
};
const calcDisplay = (c: Calc): string => (c.buf !== '' ? c.buf + (c.op ? '' : '') : c.acc != null ? String(c.acc) : '0');

const KEYS: { k: string; label: string; kind?: 'op' | 'eq' | 'fn' }[] = [
  { k: 'C', label: 'C', kind: 'fn' }, { k: 'del', label: '⌫', kind: 'fn' }, { k: '/', label: '÷', kind: 'op' }, { k: '*', label: '×', kind: 'op' },
  { k: '7', label: '7' }, { k: '8', label: '8' }, { k: '9', label: '9' }, { k: '-', label: '−', kind: 'op' },
  { k: '4', label: '4' }, { k: '5', label: '5' }, { k: '6', label: '6' }, { k: '+', label: '+', kind: 'op' },
  { k: '1', label: '1' }, { k: '2', label: '2' }, { k: '3', label: '3' }, { k: '=', label: '=', kind: 'eq' },
  { k: '0', label: '0' }, { k: '.', label: '.' },
];

const ATTR_MODES: { v: AttributionMode; label: string }[] = [
  { v: 'company', label: 'My business' },
  { v: 'person', label: 'For someone' },
  { v: 'lent', label: 'Lent out' },
];
const TAGS: { v: '' | TxnTag; label: string }[] = [
  { v: '', label: 'None' }, { v: 'interest', label: 'Interest' }, { v: 'epp', label: 'EPP' }, { v: 'cash_advance', label: 'Cash adv' }, { v: 'fee', label: 'Fee' },
];

export function ManualEntry() {
  const app = useApp();
  const open = app.manualOpen;
  const [calc, setCalc] = useState<Calc>({ acc: null, op: null, buf: '' });
  const [merchant, setMerchant] = useState('');
  const [cat, setCat] = useState<string>('food');
  const [account, setAccount] = useState(app.accounts[0]?.id || '');
  const [toAccount, setToAccount] = useState(app.accounts[1]?.id || '');
  const [nec, setNec] = useState(5);
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tag, setTag] = useState<'' | TxnTag>('');
  const [attrOn, setAttrOn] = useState(false);
  const [attrMode, setAttrMode] = useState<AttributionMode>('company');
  const [who, setWho] = useState('');
  const [seed, setSeed] = useState(open);
  if (open !== seed) {
    setSeed(open);
    if (open) { setCalc({ acc: null, op: null, buf: '' }); setMerchant(''); setCat('food'); setAccount(app.accounts[0]?.id || ''); setToAccount(app.accounts[1]?.id || ''); setNec(5); setKind('expense'); setDate(new Date().toISOString().slice(0, 10)); setTag(''); setAttrOn(false); setAttrMode('company'); setWho(''); }
  }

  const income = kind === 'income';
  const isTransfer = kind === 'transfer';
  const amount = calcValue(calc);
  const save = () => {
    if (amount <= 0) { app.toast('Enter an amount'); return; }
    const ts = Date.parse(date) || undefined; // NaN → undefined → addTxn defaults to now
    if (isTransfer) {
      if (!account || !toAccount || account === toAccount) { app.toast('Pick two different accounts'); return; }
      app.addTransfer(account, toAccount, amount, merchant.trim() || undefined);
      app.toast('Transfer logged');
    } else {
      app.addTxn({
        merchant: merchant.trim() || (income ? 'Income' : 'Expense'),
        cat: (income ? 'income' : cat) as CategoryId,
        amount,
        account,
        nec,
        ts,
        byPenny: false,
        ...(income ? { income: true } : {}),
        ...(tag ? { tag } : {}),
        ...(attrOn && attrMode !== 'self' ? { attribution: { mode: attrMode, who: who.trim() || undefined } } : {}),
      });
      app.toast('Logged ' + fmt(amount, app.currency));
    }
    app.closeManual();
  };

  return (
    <div className={`ledger-overlay${open ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={app.closeManual} style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}><Icons.chevD size={18} /></button>
          <div style={{ flex: 1 }}>
            <div className="h-display" style={{ fontSize: 19 }}>Add manually</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>No AI — quick keypad entry</div>
          </div>
        </div>
        {/* income / expense / transfer */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {(['expense', 'income', 'transfer'] as const).map((k) => {
            const on = kind === k;
            const c = k === 'income' ? 'var(--sage)' : k === 'transfer' ? 'var(--amber)' : 'var(--coral)';
            const tint = k === 'income' ? 'var(--sage-tint)' : k === 'transfer' ? 'var(--amber-tint)' : 'var(--coral-tint, #F8E2D8)';
            return (
              <button key={k} onClick={() => setKind(k)} className="chip-btn" style={{ flex: 1, justifyContent: 'center', padding: '9px 0', fontWeight: 800, textTransform: 'capitalize', ...(on ? { background: tint, borderColor: c, color: c } : {}) }}>{k}</button>
            );
          })}
        </div>
        <div className="amount h-display" style={{ fontSize: 36, fontWeight: 700, marginTop: 10, textAlign: 'right', color: income ? 'var(--sage-deep)' : isTransfer ? 'var(--amber-deep)' : 'var(--coral-deep)' }}>
          {income ? '+' : isTransfer ? '⇄' : '−'}{calcDisplay(calc)}<span style={{ fontSize: 16, color: 'var(--muted)', marginLeft: 6 }}>{app.currency}</span>
        </div>
      </div>

      <div className="ledger-scroll">
        {/* keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '14px 16px 6px' }}>
          {KEYS.map((key) => {
            const isZero = key.k === '0';
            const isEq = key.kind === 'eq';
            const bg = isEq ? 'var(--accent)' : key.kind === 'op' ? 'var(--amber-tint)' : key.kind === 'fn' ? 'var(--surface-2)' : 'var(--surface)';
            const color = isEq ? '#fff' : key.kind === 'op' ? 'var(--amber-deep)' : 'var(--ink)';
            return (
              <button
                key={key.k}
                onClick={() => setCalc((c) => press(c, key.k))}
                style={{ gridColumn: isZero ? 'span 2' : undefined, gridRow: isEq ? 'span 2' : undefined, border: '1px solid var(--line)', background: bg, color, borderRadius: 14, padding: '16px 0', fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: 'pointer', boxShadow: 'var(--shadow-card)' }}
              >
                {key.label}
              </button>
            );
          })}
        </div>

        {/* details */}
        <div style={{ padding: '8px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="es-input" style={{ width: 'auto', textAlign: 'left' }} placeholder={isTransfer ? 'Note (optional)' : income ? 'Source (e.g. Salary)' : 'Merchant'} value={merchant} onChange={(e) => setMerchant(e.target.value)} />

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Date</div>
            <input className="es-input" type="date" style={{ width: 'auto', textAlign: 'left' }} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {kind === 'expense' && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Category</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {app.categories.filter((c) => c.id !== 'income').map((c) => (
                  <button key={c.id} className="chip-btn" style={{ padding: '5px 11px', fontSize: 12, ...(cat === c.id ? { background: c.tint, borderColor: c.color, color: c.color } : {}) }} onClick={() => setCat(c.id)}>{c.label}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{isTransfer ? 'From' : 'Account'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {app.accounts.map((a) => (
                <button key={a.id} className="chip-btn" style={{ padding: '5px 11px', fontSize: 12, ...(account === a.id ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setAccount(a.id)}>{a.name}</button>
              ))}
            </div>
          </div>

          {isTransfer && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>To</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {app.accounts.filter((a) => a.id !== account).map((a) => (
                  <button key={a.id} className="chip-btn" style={{ padding: '5px 11px', fontSize: 12, ...(toAccount === a.id ? { background: 'var(--amber-tint)', borderColor: 'var(--amber)', color: 'var(--amber-deep)' } : {}) }} onClick={() => setToAccount(a.id)}>{a.name}</button>
                ))}
              </div>
            </div>
          )}

          {kind === 'expense' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="eyebrow">Necessity</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: nec >= 8 ? 'var(--sage-deep)' : nec >= 5 ? 'var(--amber-deep)' : 'var(--coral-deep)' }}>{nec}/10 · {nec >= 8 ? 'Essential' : nec >= 5 ? 'Reasonable' : 'Impulse'}</span>
              </div>
              <input type="range" min={1} max={10} value={nec} onChange={(e) => setNec(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
          )}

          {/* attribution */}
          {kind === 'expense' && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span className={`groc-check${attrOn ? ' on' : ''}`} onClick={() => setAttrOn((v) => !v)} style={{ width: 20, height: 20, flexShrink: 0 }}>{attrOn && <Icons.check size={12} color="#fff" sw={2.8} />}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5 }} onClick={() => setAttrOn((v) => !v)}>This was for my business / someone else</span>
              </label>
              {attrOn && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {ATTR_MODES.map((m) => (
                      <button key={m.v} className="chip-btn" style={{ padding: '5px 11px', fontSize: 12, ...(attrMode === m.v ? { background: 'var(--sage-tint)', borderColor: 'var(--sage)', color: 'var(--sage-deep)' } : {}) }} onClick={() => setAttrMode(m.v)}>{m.label}</button>
                    ))}
                  </div>
                  <input className="es-input" style={{ width: 'auto', textAlign: 'left', display: 'block' }} placeholder={attrMode === 'company' ? 'Business name (optional)' : "Who? (name)"} value={who} onChange={(e) => setWho(e.target.value)} />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Tracked under “Owed to me” so you can get it back.</div>
                </div>
              )}
            </div>
          )}

          {/* optional debt tag */}
          {kind === 'expense' && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Tag (optional)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TAGS.map((t) => (
                  <button key={t.v} className="chip-btn" style={{ padding: '5px 11px', fontSize: 12, ...(tag === t.v ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setTag(t.v)}>{t.label}</button>
                ))}
              </div>
            </div>
          )}

          <button className="xp-save" style={{ width: '100%', borderRadius: 14, padding: 13, marginTop: 4 }} onClick={save}>Save {kind} · {fmt(amount, app.currency)}</button>
        </div>
      </div>
    </div>
  );
}
