// Penny — chat message cards: expense mini-form, account form, trace, model tag, chart, analysis, receipt
import { useState } from 'react';
import { CATS, HISTORY, acctMask, allAccounts, fmt, necLevel } from '../lib/data';
import type { CurrencyCode, ModelId, ParsedAccount, ParsedExpense } from '../lib/types';
import { CatIcon, Icons } from '../components/Icons';
import { NecMeter, NecPill } from '../components/ui';
import type { AnalysisItem, ChatMsg } from './types';

interface TracePlan {
  steps: string[];
  idx: number;
}

// ---------------- expense mini-form card ----------------
export function ExpenseCard({
  msg,
  currency,
  onUpdate,
  onUndo,
}: {
  msg: ChatMsg;
  currency: CurrencyCode;
  onUpdate: (e: ParsedExpense) => void;
  onUndo: () => void;
}) {
  const e = msg.data!.expense!;
  const undone = !!msg.data!.undone;
  // Expenses auto-log; the card stays editable until undone.
  const locked = undone;
  const flash = !!msg.data!.flash;
  const [picker, setPicker] = useState<'cat' | 'acct' | null>(null);
  const cat = CATS[e.category] || CATS.other;
  const accts = allAccounts();
  const acct = accts.find((a) => a.id === e.account) || accts[0] || { id: '', name: 'No account', group: 'wallet' as const, balance: 0, last4: null, bg: '', fg: '' };
  const lvl = necLevel(e.necessity);

  return (
    <div className="xp-card" style={flash ? { boxShadow: '0 0 0 3px var(--amber-tint), var(--shadow-card)' } : undefined}>
      <div className="xp-head">
        <CatIcon cat={e.category} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.merchant}
          </div>
          <div style={{ fontSize: 11, color: undone ? 'var(--muted)' : 'var(--sage-deep)', fontWeight: 600 }}>
            {undone ? 'Removed' : 'Logged ✓ — tap a field to edit'}
          </div>
          {e.attribution && e.attribution.mode !== 'self' && (
            <span className="nec-pill" style={{ background: 'var(--sage-tint)', color: 'var(--sage-deep)', marginTop: 5, fontSize: 10.5 }}>
              ↩ {e.attribution.mode === 'lent' ? 'lent to' : e.attribution.mode === 'company' ? 'company' : 'for'}{' '}
              {e.attribution.who || (e.attribution.mode === 'company' ? '' : 'someone')} · reimbursable
            </span>
          )}
        </div>
        <div className="amount" style={{ fontSize: 19, fontWeight: 700 }}>
          {fmt(e.total, currency)}
        </div>
      </div>

      {e.items && e.items.length > 0 && (
        <div className="xp-items">
          {e.items.map((it, i) => (
            <div className="xp-item-row" key={i}>
              <span>{it.n}</span>
              <span className="amount" style={{ fontWeight: 600 }}>
                {fmt(it.a, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="xp-field">
        <span className="lab">Category</span>
        <button className="xp-select" disabled={locked} onClick={() => setPicker(picker === 'cat' ? null : 'cat')}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: cat.color }} />
          {cat.label}
          {!locked && <Icons.chevD size={11} color="var(--muted)" />}
        </button>
      </div>
      {picker === 'cat' && !locked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 15px 11px' }}>
          {Object.entries(CATS)
            .filter(([id]) => id !== 'income')
            .map(([id, c]) => (
              <button
                key={id}
                className="chip-btn"
                style={{ padding: '5px 10px', fontSize: 11.5, ...(id === e.category ? { background: c.tint, borderColor: c.color, color: c.color } : {}) }}
                onClick={() => {
                  onUpdate({ ...e, category: id as ParsedExpense['category'] });
                  setPicker(null);
                }}
              >
                {c.label}
              </button>
            ))}
        </div>
      )}

      <div className="xp-field">
        <span className="lab">Paid with</span>
        <button className="xp-select" disabled={locked} onClick={() => setPicker(picker === 'acct' ? null : 'acct')}>
          {acct.name}
          {acctMask(acct) ? ` ${acctMask(acct)}` : ''}
          {!locked && <Icons.chevD size={11} color="var(--muted)" />}
        </button>
      </div>
      {picker === 'acct' && !locked && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 15px 11px' }}>
          {allAccounts().map((a) => (
            <button
              key={a.id}
              className="chip-btn"
              style={{ padding: '5px 10px', fontSize: 11.5, ...(a.id === e.account ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }}
              onClick={() => {
                onUpdate({ ...e, account: a.id });
                setPicker(null);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      <div className="xp-field">
        <span className="lab">Amount</span>
        <input
          className="xp-input"
          inputMode="decimal"
          disabled={locked}
          value={String(e.total)}
          onChange={(ev) => onUpdate({ ...e, total: parseFloat(ev.target.value) || 0 })}
        />
      </div>

      <div className="xp-field" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span className="lab">Necessity</span>
          <NecPill score={e.necessity} />
        </div>
        {e.necessityNote && <div style={{ fontSize: 12, color: lvl.deep, lineHeight: 1.4 }}>{e.necessityNote}</div>}
      </div>

      <button
        className="xp-undo"
        onClick={() => !undone && onUndo()}
        disabled={undone}
        style={{
          width: '100%', marginTop: 4, padding: '9px 0', borderRadius: 12, cursor: undone ? 'default' : 'pointer',
          border: '1px solid var(--line-strong)', background: 'transparent',
          color: undone ? 'var(--muted)' : 'var(--ink-soft)', fontWeight: 700, fontSize: 12.5,
          fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {undone ? 'Removed from activity' : 'Undo / remove'}
      </button>
    </div>
  );
}

// ---------------- agent trace (model escalation) ----------------
export function TraceBubble({ trace }: { trace: TracePlan }) {
  return (
    <div className="bubble agent" style={{ padding: '10px 14px', minWidth: 190 }}>
      {trace.steps.slice(0, trace.idx + 1).map((s, i) => {
        const done = i < trace.idx;
        return (
          <div key={i} className="trace-step msg-enter" style={{ color: done ? 'var(--muted)' : 'var(--amber-deep)' }}>
            {done ? <Icons.check size={11} sw={2.4} color="var(--sage)" /> : <span className="trace-spin" />}
            <span>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

const MODEL_COLORS: Record<ModelId, string> = {
  haiku: 'var(--sage)',
  sonnet: 'var(--amber)',
  opus: 'var(--coral)',
};
export function ModelTag({ model, label }: { model: ModelId; label?: string }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 3, background: MODEL_COLORS[model] || 'var(--sage)' }} />
      {model}
      {label ? ` · ${label}` : ''}
    </div>
  );
}

// ---------------- mini chart reply ----------------
export function ChartMsg({ k, currency }: { k: 'grocery_months' | 'spend_months'; currency: CurrencyCode }) {
  const cfg =
    k === 'spend_months'
      ? { title: 'Total spend · last 6 months', data: HISTORY.spendByMonth }
      : { title: 'Groceries · last 6 months', data: HISTORY.groceriesByMonth };
  const max = Math.max(...cfg.data.map((d) => d.v));
  const first = cfg.data[0].v;
  const lastFull = cfg.data[cfg.data.length - 2].v;
  const delta = Math.round(((lastFull - first) / first) * 100);
  void currency;
  return (
    <div className="xp-card" style={{ width: '86%', padding: '13px 15px 11px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cfg.title}
        </span>
        <span className="nec-pill" style={{ background: 'var(--sage-tint)', color: 'var(--sage-deep)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {delta}% since Jan
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 84 }}>
        {cfg.data.map((d) => (
          <div key={d.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <span className="amount" style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>
              {d.v >= 1000 ? (d.v / 1000).toFixed(1) + 'k' : d.v}
            </span>
            <div
              style={{
                width: '100%',
                borderRadius: 6,
                height: `${(d.v / max) * 62}%`,
                minHeight: 4,
                background: (d as { partial?: boolean }).partial ? 'var(--amber-tint)' : 'var(--sage)',
                border: (d as { partial?: boolean }).partial ? '1.5px dashed var(--amber)' : 'none',
                transition: 'height 0.7s var(--ease-out)',
              }}
            />
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--muted)' }}>{d.m}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 7 }}>Dashed = month in progress</div>
    </div>
  );
}

// ---------------- account creation card ----------------
export function AccountCard({
  msg,
  onUpdate,
  onSave,
}: {
  msg: ChatMsg;
  onUpdate: (a: ParsedAccount) => void;
  onSave: () => void;
}) {
  const a = msg.data!.account!;
  const saved = !!msg.data!.saved;
  const groups: [ParsedAccount['group'], string][] = [
    ['bank', 'Bank'],
    ['card', 'Card'],
    ['wallet', 'Wallet'],
  ];
  return (
    <div className="xp-card">
      <div className="xp-head">
        <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)' }}>
          <Icons.wallet size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>New account</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            {saved ? 'Added to your accounts' : 'Draft — edit anything before saving'}
          </div>
        </div>
      </div>
      <div className="xp-field">
        <span className="lab">Name</span>
        <input
          className="xp-input"
          style={{ width: 170, fontFamily: 'var(--font-body)', fontWeight: 700 }}
          disabled={saved}
          value={a.name}
          onChange={(ev) => onUpdate({ ...a, name: ev.target.value })}
        />
      </div>
      <div className="xp-field">
        <span className="lab">Type</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {groups.map(([id, lab]) => (
            <button
              key={id}
              className="chip-btn"
              disabled={saved}
              style={{ padding: '4px 10px', fontSize: 11.5, ...(a.group === id ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }}
              onClick={() => onUpdate({ ...a, group: id })}
            >
              {lab}
            </button>
          ))}
        </span>
      </div>
      <div className="xp-field">
        <span className="lab">Currency</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {(['AED', 'USD', 'EUR', 'INR'] as CurrencyCode[]).map((c) => (
            <button
              key={c}
              className="chip-btn"
              disabled={saved}
              style={{ padding: '4px 9px', fontSize: 11, ...(a.currency === c ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }}
              onClick={() => onUpdate({ ...a, currency: c })}
            >
              {c}
            </button>
          ))}
        </span>
      </div>
      {a.group !== 'wallet' && (
        <div className="xp-field">
          <span className="lab">Last 4 digits</span>
          <input
            className="xp-input"
            inputMode="numeric"
            maxLength={4}
            disabled={saved}
            value={a.last4 || ''}
            placeholder="—"
            onChange={(ev) => onUpdate({ ...a, last4: ev.target.value.replace(/\D/g, '').slice(0, 4) })}
          />
        </div>
      )}
      <div className="xp-field">
        <span className="lab">{a.group === 'card' ? 'Current balance' : 'Opening balance'}</span>
        <input
          className="xp-input"
          inputMode="decimal"
          disabled={saved}
          value={String(a.balance)}
          onChange={(ev) => onUpdate({ ...a, balance: parseFloat(ev.target.value) || 0 })}
        />
      </div>
      {a.group === 'card' && (
        <div className="xp-field">
          <span className="lab">Credit limit</span>
          <input
            className="xp-input"
            inputMode="decimal"
            disabled={saved}
            value={a.creditLimit != null ? String(a.creditLimit) : ''}
            placeholder="—"
            onChange={(ev) => onUpdate({ ...a, creditLimit: parseFloat(ev.target.value) || 0 })}
          />
        </div>
      )}
      <button className={`xp-save${saved ? ' saved' : ''}`} onClick={() => !saved && onSave()}>
        {saved ? (
          <>
            <Icons.check size={16} /> Added
          </>
        ) : (
          'Add account'
        )}
      </button>
    </div>
  );
}

// ---------------- receipt "photo" ----------------
export function ReceiptPhoto({ dataUrl }: { dataUrl?: string }) {
  if (dataUrl) {
    return (
      <div className="receipt-photo">
        <img src={dataUrl} alt="receipt" />
      </div>
    );
  }
  const rows: [string, string][] = [
    ['BANANA 1KG', '7.50'],
    ['GREEK YOGURT 450G', '18.00'],
    ['CHICKEN BREAST 1KG', '32.00'],
    ['SOURDOUGH LOAF', '14.00'],
    ['GINGER ALE 6PK', '22.00'],
    ['CHOC WAFERS 250G', '9.50'],
  ];
  return (
    <div className="receipt-photo">
      <div className="receipt-paper">
        <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 1 }}>SPINNEYS</div>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>AL BARSHA · DUBAI</div>
        {rows.map(([n, a]) => (
          <div className="rp-row" key={n}>
            <span>{n}</span>
            <span>{a}</span>
          </div>
        ))}
        <div className="rp-row" style={{ borderTop: '1px dashed #999', marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
          <span>TOTAL AED</span>
          <span>103.00</span>
        </div>
        <div style={{ textAlign: 'center', marginTop: 5 }}>** THANK YOU **</div>
      </div>
    </div>
  );
}

// ---------------- item analysis card ----------------
export function AnalysisCard({ items, currency }: { items: AnalysisItem[]; currency: CurrencyCode }) {
  return (
    <div className="xp-card" style={{ width: '88%' }}>
      <div style={{ padding: '12px 15px 4px', fontWeight: 700, fontSize: 13.5 }}>Item by item</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 15px', borderTop: i ? '1px solid var(--line)' : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.n}</div>
            {it.note && <div style={{ fontSize: 11.5, color: necLevel(it.nec).deep, marginTop: 1 }}>{it.note}</div>}
          </div>
          <NecMeter score={it.nec} height={12} />
          <span className="amount" style={{ fontSize: 13, fontWeight: 600, width: 52, textAlign: 'right' }}>
            {fmt(it.a, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}
