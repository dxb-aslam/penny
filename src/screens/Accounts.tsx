// Penny — Accounts screen (account creation happens in chat)
import { useState } from 'react';
import { CATS, accountInitials, acctMask, fmt, toAED } from '../lib/data';
import { applyFilters, categoryBreakdown } from '../lib/ledger';
import type { AccountGroup, CategoryId } from '../lib/types';
import { CatIcon, Icons } from '../components/Icons';
import { Bar, SectionHead } from '../components/ui';
import { AccountForm } from '../components/AccountForm';
import type { AccountFormState } from '../components/AccountForm';
import { useApp } from '../state/AppContext';

const GROUPS: [AccountGroup, string][] = [
  ['bank', 'Banks'],
  ['card', 'Cards'],
  ['wallet', 'Wallets & cash'],
];

export function AccountsScreen() {
  const app = useApp();
  const cur = app.currency;
  const accounts = app.accounts;
  const net = accounts.reduce((s, a) => s + toAED(a), 0);
  const [form, setForm] = useState<AccountFormState | null>(null);
  // Real spend-by-category this month (no demo data).
  const byCategory = categoryBreakdown(applyFilters(app.txns, { preset: 'month', type: 'out' }))
    .map((c) => [c.cat, c.total] as [CategoryId, number])
    .slice(0, 8);
  const catMax = Math.max(1, ...byCategory.map(([, v]) => v));

  return (
    <div className="screen">
      <div className="home-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div className="eyebrow">Net across {accounts.length} accounts</div>
          <div className="amount h-display" style={{ fontSize: 32, fontWeight: 700, marginTop: 3, whiteSpace: 'nowrap' }}>
            {fmt(net, cur)}
          </div>
        </div>
        <button className="chip-btn accent" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }} onClick={app.openChat}>
          <Icons.plus size={14} /> Ask Penny
        </button>
      </div>

      {GROUPS.map(([gid, glabel]) => {
        const list = accounts.filter((a) => (a.group || 'bank') === gid);
        if (!list.length) return null;
        const sub = list.reduce((s, a) => s + toAED(a), 0);
        const cardUsed = list.reduce((s, a) => s + (a.creditLimit ? Math.max(0, -a.balance) : 0), 0);
        const cardLimit = list.reduce((s, a) => s + (a.creditLimit || 0), 0);
        const cardUtil = cardLimit ? cardUsed / cardLimit : 0;
        return (
          <div key={gid}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px 8px', gap: 10 }}>
              <span className="eyebrow">
                {glabel} · {list.length}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="amount" style={{ fontSize: 12, fontWeight: 700, color: sub < 0 ? 'var(--coral-deep)' : 'var(--muted)' }}>
                  {fmt(sub, cur)}
                </span>
                <button onClick={() => setForm({ mode: 'create', group: gid })} aria-label={`Add ${glabel}`} style={{ border: 0, background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 24, height: 24, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={14} /></button>
              </span>
            </div>
            {gid === 'card' && cardLimit > 0 && (
              <div className="card" style={{ margin: '0 16px 10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                  <span>Credit used</span>
                  <span className="amount">{fmt(cardUsed, cur)} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>of {fmt(cardLimit, cur)}</span></span>
                </div>
                <Bar value={cardUsed} max={cardLimit} color={cardUtil < 0.3 ? 'var(--sage)' : cardUtil < 0.7 ? 'var(--amber)' : 'var(--coral)'} height={7} />
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>{Math.round(cardUtil * 100)}% of total limit · {fmt(Math.max(0, cardLimit - cardUsed), cur)} available</div>
              </div>
            )}
            <div className="acct-grid">
              {list.map((a) => {
                const used = a.creditLimit ? Math.max(0, -a.balance) : 0;
                const util = a.creditLimit ? Math.min(1, used / a.creditLimit) : 0;
                const utilColor = util < 0.3 ? '#9ED88B' : util < 0.7 ? '#F2C879' : '#F1A38C';
                return (
                  <div
                    key={a.id}
                    className="acct-mini"
                    style={{ background: a.bg, color: a.fg, width: 'auto', padding: '12px 13px' }}
                    onClick={() => app.openAccount(a.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: 26,
                          height: 26,
                          borderRadius: 9,
                          background: 'rgba(255,255,255,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: 11,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {accountInitials(a.name)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                        {acctMask(a) && <span className="amount" style={{ flexShrink: 0 }}>{acctMask(a)}</span>}
                      </div>
                    </div>
                    <div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, marginTop: 7, whiteSpace: 'nowrap' }}>
                      {fmt(a.balance, a.currency || cur)}
                    </div>
                    {a.creditLimit ? (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                          <div style={{ width: `${util * 100}%`, height: '100%', background: utilColor, borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 9.5, opacity: 0.82, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap' }}>
                          {fmt(Math.max(0, a.creditLimit - used), a.currency || cur)} left · {Math.round(util * 100)}% used
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, opacity: 0.72, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.note}
                        {a.currency && a.currency !== 'AED' ? ` · ${a.currency}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ padding: '16px 16px 0', display: 'flex', gap: 8 }}>
        {GROUPS.map(([gid, glabel]) => (
          <button key={gid} className="chip-btn" style={{ flex: 1, justifyContent: 'center', padding: '11px 0', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700 }} onClick={() => setForm({ mode: 'create', group: gid })}>
            <Icons.plus size={14} /> {gid === 'wallet' ? 'Cash' : glabel.replace(/s$/, '')}
          </button>
        ))}
      </div>

      {byCategory.length > 0 && (
        <>
          <SectionHead title="This month by category" />
          <div className="card" style={{ margin: '0 16px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {byCategory.map(([c, v]) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CatIcon cat={c} size={16} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                    <span>{CATS[c].label}</span>
                    <span className="amount">{fmt(v, cur)}</span>
                  </div>
                  <Bar value={v} max={catMax} color={CATS[c].color} height={6} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 8 }} />
      <AccountForm state={form} onClose={() => setForm(null)} />
    </div>
  );
}
