// Penny — Coach: financial health score (primary) + trend + recommendations,
// a savings tracker with named milestones, the daily digest, and cashflow.
// (Nudges moved to the Notifications center; reach it from the Home bell.)
import { useMemo, useState } from 'react';
import { BUDGET_MO, LS, dayLabel, fmt } from '../lib/data';
import { digest as runDigest } from '../lib/llm';
import { computeHealth, gradeOf, readHealthTarget, recommendations, recordHealth, writeHealthTarget } from '../lib/health';
import { achievedMilestone, milestoneProgress, nextMilestone, savingsBalance, savingsOutflows, visibleMilestones } from '../lib/savings';
import { AgentAvatar } from '../components/Avatar';
import { Icons } from '../components/Icons';
import { Bar, SectionHead } from '../components/ui';
import { useApp } from '../state/AppContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = Date.now(); // captured at module load — stable across renders (purity)

interface CachedDigest { text: string; live: boolean; when: string }

export function CoachScreen() {
  const app = useApp();
  const cur = app.currency;
  const [digest, setDigest] = useState<CachedDigest | null>(() => LS.read<CachedDigest | null>('digestCache', null));
  const [busy, setBusy] = useState(false);

  // ---- health score ----
  const health = useMemo(() => {
    const income = app.txns.filter((t) => t.income && !t.transfer).reduce((s, t) => s + t.amount, 0);
    const monthSpend = app.txns.filter((t) => !t.income && !t.transfer).reduce((s, t) => s + t.amount, 0);
    const emiTotal = app.emis.reduce((s, e) => s + e.monthly, 0);
    const cards = app.accounts.filter((a) => a.group === 'card' && a.creditLimit);
    const creditUsed = cards.reduce((s, a) => s + Math.max(0, -a.balance), 0);
    const creditLimit = cards.reduce((s, a) => s + (a.creditLimit || 0), 0);
    const sb = savingsBalance(app.accounts, app.savingsAccountId);
    return computeHealth({ income, monthSpend, budget: BUDGET_MO, emiTotal, creditUsed, creditLimit, savingsBalance: sb });
  }, [app.txns, app.emis, app.accounts, app.savingsAccountId]);

  // record + read history once on mount (one real point per day; seeded on first run)
  const [history] = useState(() => recordHealth(health.score));
  const [target, setTarget] = useState(() => readHealthTarget());
  const recs = recommendations(health, target);
  const setTargetPersist = (t: number) => { setTarget(t); writeHealthTarget(t); };

  const histScores = history.map((h) => h.score);
  const histDelta = histScores.length > 1 ? histScores[histScores.length - 1] - histScores[0] : 0;

  // ---- savings ----
  const savBal = savingsBalance(app.accounts, app.savingsAccountId);
  const savAcct = app.accounts.find((a) => a.id === app.savingsAccountId) || null;
  const achieved = achievedMilestone(savBal);
  const next = nextMilestone(savBal);
  const progress = milestoneProgress(savBal);
  const ladder = visibleMilestones(savBal);
  const outflows = savingsOutflows(app.txns, app.savingsAccountId, 30);
  const outflowSum = outflows.reduce((s, t) => s + t.amount, 0);
  const [pickingSavings, setPickingSavings] = useState(false);

  async function generate() {
    setBusy(true);
    const todays = app.txns.filter((t) => dayLabel(t.ts) === 'Today' && !t.income).map((t) => ({ merchant: t.merchant, amount: t.amount, cat: t.cat, nec: t.nec }));
    const out = await runDigest(todays);
    const d: CachedDigest = { ...out, when: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
    setDigest(d);
    LS.write('digestCache', d);
    setBusy(false);
  }

  // cashflow (real, last 6 months)
  const cashflow = useMemo(() => {
    const map = new Map<string, { label: string; out: number; in: number; ts: number }>();
    for (const t of app.txns) {
      if (t.transfer) continue;
      const d = new Date(t.ts);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let m = map.get(key);
      if (!m) { m = { label: MONTHS[d.getMonth()], out: 0, in: 0, ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime() }; map.set(key, m); }
      if (t.income) m.in += t.amount; else m.out += t.amount;
    }
    return [...map.values()].sort((a, b) => a.ts - b.ts).slice(-6);
  }, [app.txns]);
  const cfMax = Math.max(1, ...cashflow.map((m) => Math.max(m.out, m.in)));
  const cfNet = cashflow.reduce((s, m) => s + (m.in - m.out), 0);

  // Coach needs a few days of real entries before its read means anything.
  const firstUse = LS.read<string>('firstUse', '');
  const daysIn = firstUse ? Math.floor((NOW - Date.parse(firstUse)) / 86400000) : 999;
  const daysLeft = 3 - daysIn;
  if (daysLeft > 0) {
    return (
      <div className="screen">
        <div className="home-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AgentAvatar size={44} />
          <div>
            <div className="h-display" style={{ fontSize: 24 }}>Coach</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Your financial health, tracked</div>
          </div>
        </div>
        <div style={{ margin: 'auto 24px', textAlign: 'center', padding: '60px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <AgentAvatar size={72} />
          <div className="h-display" style={{ fontSize: 22 }}>Not enough to go on yet</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: 300 }}>
            Keep logging for a few days and I'll read your money properly — health score, savings, trends and honest nudges.
            <br /><br />Come back in <b>{daysLeft} {daysLeft === 1 ? 'day' : 'days'}</b>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="home-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AgentAvatar size={44} thinking={busy} />
        <div>
          <div className="h-display" style={{ fontSize: 24 }}>Coach</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Your financial health, tracked</div>
        </div>
      </div>

      {/* health score hero */}
      <div className="card" style={{ margin: '0 20px', padding: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <HealthRing score={health.score} color={health.color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>Financial health</div>
            <div className="h-display" style={{ fontSize: 22, color: health.color, lineHeight: 1.1, marginTop: 2 }}>{health.grade}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>
              {health.score >= target ? `Above your ${target} target 🎉` : `${target - health.score} pts to your ${target} target`}
            </div>
          </div>
        </div>

        {/* trend */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Trend</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: histDelta >= 0 ? 'var(--sage-deep)' : 'var(--coral-deep)' }}>
              {histDelta >= 0 ? '▲' : '▼'} {Math.abs(histDelta)} pts
            </span>
          </div>
          <Sparkline scores={histScores} color={health.color} target={target} />
        </div>

        {/* target control */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Target</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[70, 80, 90].map((t) => (
              <button key={t} onClick={() => setTargetPersist(t)} style={{ border: target === t ? '1.5px solid var(--accent)' : '1.5px solid var(--line)', background: target === t ? 'var(--accent-tint)' : 'var(--surface)', color: target === t ? 'var(--accent-deep)' : 'var(--muted)', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* factor breakdown */}
      <SectionHead title="What's driving it" />
      <div className="card" style={{ margin: '0 20px', padding: '6px 16px 12px' }}>
        {health.factors.map((f, i) => (
          <div key={f.key} style={{ padding: '11px 0', borderTop: i ? '1px solid var(--line)' : 0 } as React.CSSProperties}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: gradeOf(f.score).color }}>{f.score}</span>
            </div>
            <Bar value={f.score} max={100} color={gradeOf(f.score).color} height={5} />
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>{f.detail}</div>
          </div>
        ))}
      </div>

      {/* recommendations */}
      {recs.length > 0 && (
        <>
          <SectionHead title={`How to reach ${target}`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
            {recs.map((f) => (
              <div key={f.key} className="ai-note">
                <span style={{ flexShrink: 0, marginTop: 1 }}><Icons.spark size={15} /></span>
                <span><b>{f.label}.</b> {f.tip}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* savings tracker */}
      <SectionHead title="Savings tracker" action={savAcct ? 'Change' : undefined} onAction={savAcct ? () => setPickingSavings(true) : undefined} />
      <div className="card" style={{ margin: '0 20px', padding: 18 }}>
        {(!savAcct || pickingSavings) ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Pick your savings account</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 12 }}>Emergency fund + general saving, tracked together. You'll be warned whenever money leaves it.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {app.accounts.filter((a) => a.group !== 'card' || a.balance > 0).map((a) => (
                <button key={a.id} onClick={() => { app.setSavingsAccount(a.id); setPickingSavings(false); }} style={{ border: app.savingsAccountId === a.id ? '1.5px solid var(--accent)' : '1.5px solid var(--line)', background: app.savingsAccountId === a.id ? 'var(--accent-tint)' : 'var(--surface)', borderRadius: 999, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--ink-soft)' }}>
                  {a.name}
                </button>
              ))}
            </div>
            {savAcct && <button className="chip-btn" style={{ marginTop: 12, padding: '6px 12px', fontSize: 11.5 }} onClick={() => setPickingSavings(false)}>Cancel</button>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div className="eyebrow" style={{ fontSize: 10 }}>{savAcct.name} · saved</div>
                <div className="amount h-display" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{fmt(savBal, cur)}</div>
              </div>
              {achieved ? (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>Achievement</div>
                  <div className="h-display" style={{ fontSize: 15, color: 'var(--sage-deep)' }}>🏅 {achieved.name}</div>
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, textAlign: 'right', maxWidth: 130 }}>Save {fmt(100, cur)} to begin</div>
              )}
            </div>

            {next && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>Next: {next.name}</span>
                  <span>{fmt(next.amount - savBal, cur)} to go</span>
                </div>
                <Bar value={progress} max={1} color="var(--sage)" />
              </div>
            )}

            {/* milestone ladder */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ladder.map((m) => {
                const done = savBal >= m.amount;
                const isNext = next?.amount === m.amount;
                return (
                  <div key={m.amount} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: done || isNext ? 1 : 0.6 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--sage)' : isNext ? 'var(--amber-tint)' : 'var(--surface-2, #ECE6D8)', color: done ? '#fff' : 'var(--muted)', border: isNext ? '1.5px solid var(--amber)' : 0 }}>
                      {done ? <Icons.check size={13} /> : <span style={{ fontSize: 9, fontWeight: 800 }}>{isNext ? '◎' : '○'}</span>}
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: done ? 700 : 600, color: done ? 'var(--ink)' : 'var(--ink-soft)' }}>{m.name}</span>
                    <span className="amount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{fmt(m.amount, cur)}</span>
                  </div>
                );
              })}
            </div>

            {outflows.length > 0 && (
              <div className="ai-note coral" style={{ marginTop: 14 }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}><Icons.flag size={15} /></span>
                <span><b>{outflows.length} withdrawal{outflows.length === 1 ? '' : 's'}</b> from savings this month — {fmt(outflowSum, cur)} total. Try to keep this pot growing.</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* digest */}
      <SectionHead title="Today's digest" />
      <div className="digest-card" style={{ cursor: 'default', marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <span className="eyebrow" style={{ color: 'rgba(247,244,232,0.75)' }}>{digest && digest.live ? 'live model' : digest ? 'sample' : 'evening read'}</span>
          {digest && <span style={{ fontSize: 10.5, opacity: 0.65, fontWeight: 600 }}>{digest.when}</span>}
        </div>
        {digest ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 10, whiteSpace: 'pre-wrap', position: 'relative' }}>{digest.text}</div>
        ) : (
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 10, opacity: 0.9, position: 'relative' }}>
            Each evening I read the day's log and write you a short, honest debrief — what was smart, what was noise, and one thing to do differently tomorrow.
          </div>
        )}
        <button className="chip-btn" disabled={busy} style={{ marginTop: 14, background: 'rgba(247,244,232,0.14)', border: '1px solid rgba(247,244,232,0.3)', color: '#F7F4E8', position: 'relative' }} onClick={generate}>
          {busy ? 'Reading today’s log…' : digest ? 'Regenerate from today’s log' : "Generate today's digest"}
        </button>
      </div>

      {/* cashflow */}
      <SectionHead title="Cashflow" />
      <div className="card" style={{ margin: '0 16px', padding: '16px 18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--coral-deep)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--coral)' }} />Out</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage-deep)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--sage)' }} />In</span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: cfNet >= 0 ? 'var(--sage-deep)' : 'var(--coral-deep)' }}>Net {cfNet >= 0 ? '+' : '−'}{fmt(Math.abs(cfNet), cur)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
          {cashflow.map((m) => (
            <div key={m.label + m.ts} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '78%', width: '100%', justifyContent: 'center' }}>
                <div style={{ width: '38%', maxWidth: 18, borderRadius: 5, height: `${(m.out / cfMax) * 100}%`, minHeight: m.out ? 3 : 0, background: 'var(--coral)', transition: 'height 0.7s var(--ease-out)' }} />
                <div style={{ width: '38%', maxWidth: 18, borderRadius: 5, height: `${(m.in / cfMax) * 100}%`, minHeight: m.in ? 3 : 0, background: 'var(--sage)', transition: 'height 0.7s var(--ease-out)' }} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' }}>{m.label}</span>
            </div>
          ))}
        </div>
        {cashflow.length <= 1 && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 8 }}>More months will appear here as you log over time.</div>}
      </div>
      <div style={{ height: 10 }} />
    </div>
  );
}

function HealthRing({ score, color }: { score: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
      <svg width={84} height={84} viewBox="0 0 84 84">
        <circle cx={42} cy={42} r={r} fill="none" stroke="var(--line)" strokeWidth={8} />
        <circle cx={42} cy={42} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 42 42)" style={{ transition: 'stroke-dashoffset 0.9s var(--ease-out)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="h-display" style={{ fontSize: 24, lineHeight: 1, color }}>{score}</span>
        <span style={{ fontSize: 8.5, color: 'var(--muted)', fontWeight: 700 }}>/ 100</span>
      </div>
    </div>
  );
}

function Sparkline({ scores, color, target }: { scores: number[]; color: string; target: number }) {
  const W = 280, H = 48, pad = 4;
  if (scores.length < 2) {
    return <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Tracking started — your trend grows as you go.</div>;
  }
  const min = Math.min(...scores, target) - 4;
  const max = Math.max(...scores, target) + 4;
  const span = Math.max(1, max - min);
  const x = (i: number) => pad + (i / (scores.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const pts = scores.map((s, i) => `${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(' ');
  const ty = y(target);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1={pad} y1={ty} x2={W - pad} y2={ty} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(scores.length - 1)} cy={y(scores[scores.length - 1])} r={3.5} fill={color} />
    </svg>
  );
}
