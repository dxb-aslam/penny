// Penny — Home dashboard: budget → net summary → quick access → last 10 activity.
import { useMemo, useState } from 'react';
import { BUDGET_MO, LS, catLabel, catStyle, dayLabel, fmt } from '../lib/data';
import { categoryBreakdown } from '../lib/ledger';
import type { Txn } from '../lib/types';
import { Icons, CatIcon } from '../components/Icons';
import type { IconName } from '../components/Icons';
import { Bar, SectionHead, TxnRow } from '../components/ui';
import { useApp } from '../state/AppContext';
import type { AppApi } from '../state/AppContext';

// ---- editable quick-access catalog ----
interface QuickItem { id: string; label: string; icon: IconName; go: (a: AppApi) => void }
const QUICK_CATALOG: QuickItem[] = [
  { id: 'moneymap', label: 'Money map', icon: 'coins', go: (a) => a.openMoney() },
  { id: 'track', label: 'Track', icon: 'chart', go: (a) => a.go('track') },
  { id: 'ledger', label: 'Transactions', icon: 'filetext', go: (a) => a.openLedger() },
  { id: 'categories', label: 'Categories', icon: 'grid', go: (a) => a.openSetup('categories') },
  { id: 'coach', label: 'Coach', icon: 'leaf', go: (a) => a.go('coach') },
  { id: 'accounts', label: 'Accounts', icon: 'wallet', go: (a) => a.go('accounts') },
  { id: 'setup', label: 'Manage data', icon: 'dots', go: (a) => a.openSetup() },
  { id: 'settings', label: 'Settings', icon: 'shield', go: (a) => a.openSettings() },
];
const DEFAULT_QUICK = ['moneymap', 'track', 'ledger', 'categories'];

export function HomeScreen() {
  const app = useApp();
  const cur = app.currency;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  // ---- budget (total + category-wise) ----
  const monthSpend = useMemo(
    () => app.txns.filter((t) => !t.income && !t.transfer).reduce((s, t) => s + t.amount, 0),
    [app.txns],
  );
  const pct = Math.min(1, monthSpend / BUDGET_MO);
  const catRows = useMemo(() => categoryBreakdown(app.txns).slice(0, 5), [app.txns]);
  const catMax = catRows[0]?.total || 1;

  // ---- net summary ----
  const cashTotal = useMemo(() => app.accounts.filter((a) => a.group === 'wallet').reduce((s, a) => s + a.balance, 0), [app.accounts]);
  const bankTotal = useMemo(() => app.accounts.filter((a) => a.group === 'bank').reduce((s, a) => s + a.balance, 0), [app.accounts]);
  const credit = useMemo(() => {
    const cards = app.accounts.filter((a) => a.group === 'card' && a.creditLimit);
    const limit = cards.reduce((s, a) => s + (a.creditLimit || 0), 0);
    const used = cards.reduce((s, a) => s + Math.max(0, -a.balance), 0);
    return { limit, used, pct: limit > 0 ? used / limit : 0, available: limit - used };
  }, [app.accounts]);
  const income = useMemo(() => app.txns.filter((t) => t.income && !t.transfer).reduce((s, t) => s + t.amount, 0), [app.txns]);
  const emiTotal = useMemo(() => app.emis.reduce((s, e) => s + e.monthly, 0), [app.emis]);
  const emiRatio = income > 0 ? emiTotal / income : 0;

  // ---- quick access (editable) ----
  const [quick, setQuick] = useState<string[]>(() => LS.read('homeQuick', DEFAULT_QUICK));
  const [editingQuick, setEditingQuick] = useState(false);
  const saveQuick = (ids: string[]) => { setQuick(ids); LS.write('homeQuick', ids); };
  const toggleQuick = (id: string) => saveQuick(quick.includes(id) ? quick.filter((x) => x !== id) : [...quick, id]);
  const quickItems = quick.map((id) => QUICK_CATALOG.find((q) => q.id === id)).filter(Boolean) as QuickItem[];

  // ---- last 10 activity ----
  const recentGroups = useMemo(() => {
    const sorted = [...app.txns].sort((a, b) => b.ts - a.ts).slice(0, 10);
    const groups: { label: string; items: Txn[] }[] = [];
    for (const t of sorted) {
      const lab = dayLabel(t.ts);
      let g = groups[groups.length - 1];
      if (!g || g.label !== lab) { g = { label: lab, items: [] }; groups.push(g); }
      g.items.push(t);
    }
    return groups;
  }, [app.txns]);

  return (
    <div className="screen">
      <div className="home-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }} onClick={() => app.openProfile()}>
          <div className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="h-display" style={{ fontSize: 24, marginTop: 2, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
            Good morning, {app.profile.name}
            <Icons.pencil size={14} color="var(--muted)" />
          </div>
        </div>
        {/* Notifications bell hidden for now — alerts will return once they're driven
            by meaningful real-data triggers rather than near-empty-state noise. */}
        <button
          onClick={() => app.openProfile()}
          aria-label="Profile"
          style={{ width: 40, height: 40, borderRadius: 20, border: 0, background: 'linear-gradient(135deg, var(--accent), var(--coral))', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, fontFamily: 'var(--font-display)', boxShadow: 'var(--shadow-card)' }}
        >
          {(app.profile.name.trim()[0] || '🙂').toUpperCase()}
        </button>
      </div>

      {/* 1 · budget — total + category-wise */}
      <div className="card" style={{ margin: '0 20px', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span className="eyebrow">Spent in {monthName}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>of {fmt(BUDGET_MO, cur)} budget</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
          <div className="amount h-display" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {fmt(monthSpend, cur)}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', color: pct < 0.75 ? 'var(--sage-deep)' : 'var(--coral-deep)' }}>
            {Math.round(pct * 100)}% · {monthSpend <= BUDGET_MO ? 'on pace' : 'over'}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Bar value={monthSpend} max={BUDGET_MO} color={pct < 0.75 ? 'var(--sage)' : 'var(--coral)'} />
        </div>

        {catRows.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Where it went</span>
            {catRows.map((c) => {
              const style = catStyle(c.cat);
              return (
                <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="icon-bub" style={{ background: style.tint, color: style.color, width: 30, height: 30, borderRadius: 9, flexShrink: 0 }}>
                    <CatIcon cat={c.cat} size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{catLabel(c.cat)}</span>
                      <span className="amount" style={{ fontSize: 12.5, fontWeight: 700 }}>{fmt(c.total, cur)}</span>
                    </div>
                    <Bar value={c.total} max={catMax} color={style.color} height={5} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2 · net summary */}
      <SectionHead title="Summary" />
      <div className="card" style={{ margin: '0 20px', padding: '4px 0' }}>
        <SummaryRow label="Cash & wallets" value={fmt(cashTotal, cur)} />
        <SummaryRow label="Bank balance" value={fmt(bankTotal, cur)} valueColor={bankTotal >= 0 ? 'var(--sage-deep)' : 'var(--coral-deep)'} />
        <SummaryRow
          label="Credit cards"
          value={`${fmt(credit.used, cur)} of ${fmt(credit.limit, cur)}`}
          sub={`${Math.round(credit.pct * 100)}% used · ${fmt(credit.available, cur)} available`}
          bar={{ value: credit.used, max: credit.limit || 1, color: credit.pct < 0.5 ? 'var(--sage)' : credit.pct < 0.8 ? 'var(--amber)' : 'var(--coral)' }}
        />
        <SummaryRow
          label="EMIs / month"
          value={fmt(emiTotal, cur)}
          valueColor="var(--coral-deep)"
          sub={income > 0 ? `${Math.round(emiRatio * 100)}% of monthly income` : 'set income to see ratio'}
        />
        <SummaryRow label="Income / month" value={fmt(income, cur)} valueColor="var(--sage-deep)" sub="salary & inflows" last />
        <div style={{ padding: '10px 16px 12px' }}>
          <button className="chip-btn" style={{ width: '100%', padding: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => app.go('accounts')}>
            <Icons.wallet size={15} /> See accounts
          </button>
        </div>
      </div>

      {/* 3 · quick access (editable) */}
      <SectionHead title="Quick access" action={editingQuick ? 'Done' : 'Edit'} onAction={() => setEditingQuick((e) => !e)} />
      {editingQuick ? (
        <div style={{ margin: '0 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_CATALOG.map((q) => {
            const on = quick.includes(q.id);
            const Ico = Icons[q.icon];
            return (
              <button
                key={q.id}
                onClick={() => toggleQuick(q.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)', background: on ? 'var(--accent-tint)' : 'var(--surface)', color: on ? 'var(--accent-deep)' : 'var(--muted)' }}
              >
                <Ico size={14} /> {q.label} {on ? <Icons.check size={13} /> : <Icons.plus size={13} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ margin: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {quickItems.length === 0 && <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', padding: 14 }}>Tap “Edit” to add shortcuts.</div>}
          {quickItems.map((q) => {
            const Ico = Icons[q.icon];
            return (
              <button key={q.id} onClick={() => q.go(app)} className="card" style={{ border: 0, cursor: 'pointer', padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 40, height: 40, borderRadius: 13 }}><Ico size={19} /></span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 4 · last 10 activity */}
      <SectionHead title="Recent activity" action="See all" onAction={() => app.openLedger()} />
      <div className="card" style={{ margin: '0 16px', padding: '6px 0' }}>
        {recentGroups.map((g, gi) => (
          <div key={g.label}>
            <div className="eyebrow" style={{ padding: '10px 16px 4px', fontSize: 10.5 }}>{g.label}</div>
            {g.items.map((t) => (
              <TxnRow key={t.id} txn={t} currency={cur} onClick={() => app.openTxnEditor(t.id)} />
            ))}
            {gi < recentGroups.length - 1 && <div style={{ height: 1, background: 'var(--line)', margin: '4px 16px' }} />}
          </div>
        ))}
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}

function SummaryRow({ label, value, sub, valueColor, bar, last }: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  bar?: { value: number; max: number; color: string };
  last?: boolean;
}) {
  return (
    <div style={{ padding: '11px 16px', borderBottom: last ? 0 : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>{label}</span>
        <span className="amount h-display" style={{ fontSize: 15.5, fontWeight: 700, color: valueColor || 'var(--ink)', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
      {bar && <div style={{ marginTop: 7 }}><Bar value={bar.value} max={bar.max} color={bar.color} height={5} /></div>}
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: bar ? 5 : 3 }}>{sub}</div>}
    </div>
  );
}
