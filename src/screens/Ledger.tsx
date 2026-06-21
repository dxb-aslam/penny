// Penny — transaction ledger overlay. Search stays on top; filters live in a
// slide-in side panel; a calendar view shows daily spend totals at a glance.
import { useMemo, useState } from 'react';
import { CATS, CAT_IDS, dayLabel, fmt } from '../lib/data';
import { PERIOD_LABELS, applyFilters, categoryBreakdown, summarize } from '../lib/ledger';
import type { CategoryId, CurrencyCode, LedgerFilters, PeriodPreset, Txn } from '../lib/types';
import { CatIcon, Icons } from '../components/Icons';
import { Bar, TxnRow } from '../components/ui';
import { useApp } from '../state/AppContext';

const PERIODS: PeriodPreset[] = ['all', 'today', 'week', 'month', 'last_month', '3m', 'year'];
const TYPES: { v: 'all' | 'out' | 'in'; label: string }[] = [
  { v: 'all', label: 'All' },
  { v: 'out', label: 'Money out' },
  { v: 'in', label: 'Money in' },
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BOOT = Date.now();

const startOfMonth = (ts: number): number => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const shiftMonth = (ts: number, by: number): number => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth() + by, 1).getTime(); };

export function Ledger() {
  const app = useApp();
  const { ledgerOpen, ledgerFilters, currency } = app;
  const [f, setF] = useState<LedgerFilters>(ledgerFilters);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const [appliedRef, setAppliedRef] = useState(ledgerFilters);
  if (ledgerFilters !== appliedRef) {
    setAppliedRef(ledgerFilters);
    setF(ledgerFilters);
    setSearch('');
  }

  const filtered = useMemo(() => applyFilters(app.txns, f), [app.txns, f]);
  const txns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filtered.filter((t) => t.merchant.toLowerCase().includes(q)) : filtered;
  }, [filtered, search]);
  const sum = useMemo(() => summarize(txns), [txns]);
  const breakdown = useMemo(() => categoryBreakdown(txns), [txns]);
  const breakdownMax = breakdown.length ? breakdown[0].total : 1;
  const groups = useMemo(() => {
    const out: { label: string; items: Txn[] }[] = [];
    for (const t of txns) {
      const lab = dayLabel(t.ts);
      let g = out[out.length - 1];
      if (!g || g.label !== lab) { g = { label: lab, items: [] }; out.push(g); }
      g.items.push(t);
    }
    return out;
  }, [txns]);

  const toggle = <T,>(arr: T[] | undefined, v: T): T[] | undefined => {
    const set = new Set(arr || []);
    if (set.has(v)) set.delete(v); else set.add(v);
    const next = [...set];
    return next.length ? next : undefined;
  };
  const activePreset = f.from == null && f.to == null ? f.preset || 'all' : null;
  // Count an account/category facet as "active" only when a strict subset is chosen
  // (selecting all = no real filter, so it shouldn't inflate the badge).
  const acctActive = !!f.accounts?.length && f.accounts.length < app.accounts.length;
  const catActive = !!f.categories?.length && f.categories.length < CAT_IDS.length;
  const filterCount = (acctActive ? 1 : 0) + (catActive ? 1 : 0) + ((f.type && f.type !== 'all') ? 1 : 0) + ((activePreset && activePreset !== 'all') || f.from ? 1 : 0);
  const clearAll = () => setF({ preset: 'all', type: 'all' });

  return (
    <div className={`ledger-overlay${ledgerOpen ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={app.closeLedger} style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}>
            <Icons.chevD size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h-display" style={{ fontSize: 19 }}>Ledger</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{sum.count} {sum.count === 1 ? 'entry' : 'entries'}</div>
          </div>
          {/* list / calendar toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 11, padding: 3 }}>
            <button onClick={() => setView('list')} aria-label="List" style={{ border: 0, borderRadius: 9, padding: '6px 9px', cursor: 'pointer', background: view === 'list' ? 'var(--surface)' : 'transparent', boxShadow: view === 'list' ? 'var(--shadow-card)' : 'none' }}>
              <Icons.filetext size={16} color={view === 'list' ? 'var(--ink)' : 'var(--muted)'} />
            </button>
            <button onClick={() => setView('calendar')} aria-label="Calendar" style={{ border: 0, borderRadius: 9, padding: '6px 9px', cursor: 'pointer', background: view === 'calendar' ? 'var(--surface)' : 'transparent', boxShadow: view === 'calendar' ? 'var(--shadow-card)' : 'none' }}>
              <Icons.calendar size={16} color={view === 'calendar' ? 'var(--ink)' : 'var(--muted)'} />
            </button>
          </div>
        </div>

        {/* search + filter button */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 12, padding: '8px 12px' }}>
            <Icons.chart size={15} color="var(--muted)" style={{ opacity: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions…"
              style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 13.5, fontFamily: 'var(--font-body)', color: 'var(--ink)', marginLeft: -20 }}
            />
            {search && <button onClick={() => setSearch('')} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}><Icons.close size={15} /></button>}
          </div>
          <button onClick={() => setShowFilters(true)} style={{ position: 'relative', border: 0, background: filterCount ? 'var(--accent-tint)' : 'var(--surface-2)', borderRadius: 12, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: filterCount ? 'var(--accent-deep)' : 'var(--ink-soft)', fontWeight: 700, fontSize: 13 }}>
            <Icons.bolt size={15} /> Filters
            {filterCount > 0 && <span style={{ background: 'var(--accent-deep)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{filterCount}</span>}
          </button>
        </div>

        {/* summary */}
        <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
          <div><div className="eyebrow" style={{ fontSize: 9.5 }}>Out</div><div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--coral-deep)' }}>{fmt(sum.outAED, currency)}</div></div>
          <div><div className="eyebrow" style={{ fontSize: 9.5 }}>In</div><div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--sage-deep)' }}>{fmt(sum.inAED, currency)}</div></div>
          <div><div className="eyebrow" style={{ fontSize: 9.5 }}>Net</div><div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: sum.net >= 0 ? 'var(--sage-deep)' : 'var(--ink)' }}>{sum.net >= 0 ? '+' : '−'}{fmt(Math.abs(sum.net), currency)}</div></div>
        </div>
      </div>

      <div className="ledger-scroll">
        {view === 'calendar' ? (
          <CalendarView txns={filtered} currency={currency} onPickDay={(from, to) => { setF((cur) => ({ ...cur, from, to, preset: undefined })); setView('list'); }} />
        ) : (
          <>
            {breakdown.length > 1 && (
              <div className="card" style={{ margin: '12px 16px 0', padding: '12px 16px 14px' }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>By category · total {fmt(sum.outAED, currency)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {breakdown.map((b) => (
                    <div key={b.cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CatIcon cat={b.cat} size={15} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                          <span>{CATS[b.cat].label}</span>
                          <span className="amount">{fmt(b.total, currency)}</span>
                        </div>
                        <Bar value={b.total} max={breakdownMax} color={CATS[b.cat].color} height={5} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {groups.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 30px', fontSize: 14 }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><Icons.coins size={32} color="var(--line-strong)" /></div>
                {search ? `No transactions match “${search}”.` : 'No transactions match these filters.'}
              </div>
            ) : (
              <div className="card" style={{ margin: '12px 16px', padding: '6px 0' }}>
                {groups.map((g, gi) => (
                  <div key={g.label}>
                    <div className="eyebrow" style={{ padding: '10px 16px 4px', fontSize: 10.5 }}>{g.label}</div>
                    {g.items.map((t) => (
                      <TxnRow key={t.id} txn={t} currency={currency} onClick={() => app.openTxnEditor(t.id)} />
                    ))}
                    {gi < groups.length - 1 && <div style={{ height: 1, background: 'var(--line)', margin: '4px 16px' }} />}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* slide-in filter panel */}
      <div onClick={() => setShowFilters(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,14,0.35)', opacity: showFilters ? 1 : 0, pointerEvents: showFilters ? 'auto' : 'none', transition: 'opacity 0.25s', zIndex: 40 }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(330px, 86%)', background: 'var(--bg)', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', transform: showFilters ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)', zIndex: 41, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 16px 10px', gap: 10 }}>
          <div className="h-display" style={{ fontSize: 17, flex: 1 }}>Filters</div>
          {filterCount > 0 && <button onClick={clearAll} className="chip-btn" style={{ padding: '5px 11px', fontSize: 12 }}>Clear all</button>}
          <button onClick={() => setShowFilters(false)} style={{ border: 0, background: 'var(--surface)', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-card)' }}><Icons.close size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }}>
          <div className="lf-row-label" style={{ paddingLeft: 0 }}>Period</div>
          <div className="ledger-filters" style={{ padding: '0 0 6px', flexWrap: 'wrap', overflowX: 'visible' }}>
            {PERIODS.map((p) => (
              <button key={p} className={`lf-chip${activePreset === p ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, preset: p, from: undefined, to: undefined }))}>{PERIOD_LABELS[p]}</button>
            ))}
          </div>
          <div className="lf-row-label" style={{ paddingLeft: 0 }}>Type</div>
          <div className="ledger-filters" style={{ padding: '0 0 6px', flexWrap: 'wrap', overflowX: 'visible' }}>
            {TYPES.map((t) => (<button key={t.v} className={`lf-chip${(f.type || 'all') === t.v ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, type: t.v }))}>{t.label}</button>))}
          </div>
          <div className="lf-row-label" style={{ paddingLeft: 0 }}>Accounts</div>
          <div className="ledger-filters" style={{ padding: '0 0 6px', flexWrap: 'wrap', overflowX: 'visible' }}>
            {app.accounts.map((a) => {
              const on = !!f.accounts?.includes(a.id);
              return (<button key={a.id} className={`lf-chip${on ? ' on' : ''}`} onClick={() => setF((cur) => ({ ...cur, accounts: toggle(cur.accounts, a.id) }))}>{a.name}</button>);
            })}
          </div>
          <div className="lf-row-label" style={{ paddingLeft: 0 }}>Categories</div>
          <div className="ledger-filters" style={{ padding: '0 0 6px', flexWrap: 'wrap', overflowX: 'visible' }}>
            {CAT_IDS.map((c) => {
              const on = !!f.categories?.includes(c);
              return (
                <button key={c} className={`lf-chip cat${on ? ' on' : ''}`} style={on ? { background: CATS[c].color, borderColor: CATS[c].color, color: '#fff' } : undefined} onClick={() => setF((cur) => ({ ...cur, categories: toggle<CategoryId>(cur.categories, c) }))}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: on ? '#fff' : CATS[c].color }} />
                  {CATS[c].label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <button className="xp-save" style={{ width: '100%', borderRadius: 13, padding: 12 }} onClick={() => setShowFilters(false)}>Show {sum.count} {sum.count === 1 ? 'result' : 'results'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- calendar (daily totals) ----------------
function CalendarView({ txns, currency, onPickDay }: { txns: Txn[]; currency: CurrencyCode; onPickDay: (from: number, to: number) => void }) {
  const latest = txns.length ? Math.max(...txns.map((t) => t.ts || 0)) : BOOT;
  const [anchor, setAnchor] = useState(() => startOfMonth(latest || BOOT));
  const d = new Date(anchor);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first

  const totals = useMemo(() => {
    const dd = new Date(anchor);
    const y = dd.getFullYear();
    const mo = dd.getMonth();
    const out: Record<number, { out: number; in: number }> = {};
    for (const t of txns) {
      const dt = new Date(t.ts);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo) continue;
      const day = dt.getDate();
      out[day] = out[day] || { out: 0, in: 0 };
      if (t.income) out[day].in += t.amount; else out[day].out += t.amount;
    }
    return out;
  }, [txns, anchor]);
  const monthOut = Object.values(totals).reduce((s, v) => s + v.out, 0);

  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => setAnchor((a) => shiftMonth(a, -1))} style={navBtn} aria-label="Previous month"><Icons.chevR size={16} style={{ transform: 'rotate(180deg)' }} /></button>
        <div style={{ textAlign: 'center' }}>
          <div className="h-display" style={{ fontSize: 16 }}>{MONTHS[month]} {year}</div>
          <div style={{ fontSize: 11, color: 'var(--coral-deep)', fontWeight: 700 }}>{fmt(monthOut, currency)} out</div>
        </div>
        <button onClick={() => setAnchor((a) => shiftMonth(a, 1))} style={navBtn} aria-label="Next month"><Icons.chevR size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAYS.map((w) => (<div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', paddingBottom: 4 }}>{w}</div>))}
        {cells.map((day, i) => {
          if (day == null) return <div key={'e' + i} />;
          const tot = totals[day];
          const from = new Date(year, month, day).getTime();
          const to = from + 86399999;
          return (
            <button
              key={day}
              onClick={() => tot && onPickDay(from, to)}
              style={{ aspectRatio: '1', borderRadius: 10, border: '1px solid var(--line)', background: tot ? 'var(--surface)' : 'transparent', cursor: tot ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 2, boxShadow: tot ? 'var(--shadow-card)' : 'none' }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>{day}</span>
              {tot?.out ? <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--coral-deep)', lineHeight: 1 }}>{Math.round(tot.out).toLocaleString()}</span> : null}
              {tot?.in ? <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--sage-deep)', lineHeight: 1 }}>+{Math.round(tot.in).toLocaleString()}</span> : null}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 14 }}>Tap a day to see its transactions.</div>
    </div>
  );
}

const navBtn: React.CSSProperties = { border: 0, background: 'var(--surface)', width: 34, height: 34, borderRadius: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-card)', color: 'var(--ink-soft)' };
