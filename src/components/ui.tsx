// Penny — shared widgets: necessity meter, gauges, bars, segmented control, toast, txn row
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CATS, TXN_TAGS, fmt, findAccount, necLevel, txnDir } from '../lib/data';
import type { CurrencyCode, Txn } from '../lib/types';
import { CatIcon, Icons } from './Icons';

/** Half-donut necessity gauge — arc fills with score/10 and a red→amber→green gradient. */
export function NecGauge({ score, width = 30 }: { score: number; width?: number }) {
  const lvl = necLevel(score);
  const r = width / 2 - 2;
  const cx = width / 2;
  const cy = r + 2;
  const len = Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 10));
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <span title={`Necessity ${score}/10`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <svg width={width} height={cy + 1} viewBox={`0 0 ${width} ${cy + 1}`} fill="none">
        <path d={arc} stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
        <path d={arc} stroke={lvl.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${frac * len} ${len}`} />
      </svg>
      <span style={{ fontSize: 8.5, fontWeight: 800, color: lvl.deep, marginTop: -1 }}>{score}</span>
    </span>
  );
}

export function NecMeter({ score, height = 14 }: { score: number; height?: number }) {
  const lvl = necLevel(score);
  return (
    <span className="nec-meter" style={{ height }} title={`Necessity ${score}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} style={{ height: `${30 + i * 7}%`, background: i < score ? lvl.color : undefined }} />
      ))}
    </span>
  );
}

export function NecPill({ score }: { score: number }) {
  const lvl = necLevel(score);
  return (
    <span className="nec-pill" style={{ background: lvl.tint, color: lvl.deep }}>
      <NecMeter score={score} height={11} />
      {lvl.label} · {score}/10
    </span>
  );
}

export function Gauge({
  value,
  max = 1,
  size = 92,
  stroke = 9,
  color = 'var(--sage)',
  track = 'var(--bg-deep)',
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(value), 80);
    return () => clearTimeout(t);
  }, [value]);
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, v / max));
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Bar({
  value,
  max = 1,
  color = 'var(--sage)',
  height = 8,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(value), 80);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="bar-track" style={{ height }}>
      <div className="bar-fill" style={{ width: `${Math.min(100, (v / max) * 100)}%`, background: color }} />
    </div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const idx = options.indexOf(value);
  const n = options.length;
  return (
    <div className="seg-control">
      <div className="seg-thumb" style={{ left: `calc(${(idx / n) * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)` }} />
      {options.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function SectionHead({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '0 20px',
        margin: '22px 0 10px',
        ...style,
      }}
    >
      <span className="h-display" style={{ fontSize: 17 }}>
        {title}
      </span>
      {action && (
        <button
          onClick={onAction}
          style={{
            border: 0,
            background: 'none',
            cursor: 'pointer',
            color: 'var(--accent-deep)',
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

export function Toast({ toast }: { toast: string | null }) {
  return (
    <div className={`toast${toast ? ' show' : ''}`}>
      {toast && <Icons.check size={15} color="#A9C796" />}
      {toast || ''}
    </div>
  );
}

export function useToast(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: string) => {
    setToast(msg);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), 2400);
  };
  return [toast, show];
}

// The one transaction row used everywhere (Home, Ledger, account view).
// `accountId` gives the per-account context (transfer direction + running balance);
// `balanceAfter` shows the account balance immediately after this transaction.
export function TxnRow({
  txn,
  currency,
  onClick,
  accountId,
  balanceAfter,
}: {
  txn: Txn;
  currency: CurrencyCode;
  onClick?: () => void;
  accountId?: string;
  balanceAfter?: number;
}) {
  const cat = CATS[txn.cat] || CATS.other;
  const dir = txnDir(txn, accountId);
  const fromAcct = findAccount(txn.account);
  const toAcct = txn.counterAccount ? findAccount(txn.counterAccount) : null;
  const short = (n?: string) => (n ? n.split(' ')[0] : '');

  // direction → colour + sign
  const amountColor = dir === 'in' ? 'var(--sage-deep)' : dir === 'out' ? 'var(--coral-deep)' : 'var(--amber-deep)';
  const sign = dir === 'in' ? '+' : dir === 'out' ? '−' : '⇄';

  let subLabel: string;
  if (txn.transfer) {
    if (accountId) subLabel = dir === 'out' ? `Transfer to ${short(toAcct?.name)}` : `Transfer from ${short(fromAcct?.name)}`;
    else subLabel = `${short(fromAcct?.name)} → ${short(toAcct?.name)}`;
  } else {
    subLabel = `${cat.label}${fromAcct ? ` · ${short(fromAcct.name)}` : ''}${
      txn.attribution && txn.attribution.mode !== 'self'
        ? ` · ↩ ${txn.attribution.who || (txn.attribution.mode === 'company' ? 'company' : 'reimbursable')}`
        : txn.byPenny ? ' · via Penny' : ''
    }`;
  }

  return (
    <div className="txn-row" onClick={onClick}>
      {txn.transfer ? (
        <span className="icon-bub" style={{ background: 'var(--amber-tint)', color: 'var(--amber-deep)', width: 36, height: 36, borderRadius: 12, flexShrink: 0 }}><Icons.loop size={17} /></span>
      ) : (
        <CatIcon cat={txn.cat} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {txn.transfer && !accountId ? 'Transfer' : txn.merchant}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
          {txn.tag && (
            <span style={{ background: TXN_TAGS[txn.tag].tint, color: TXN_TAGS[txn.tag].color, fontWeight: 700, fontSize: 9.5, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>{TXN_TAGS[txn.tag].label}</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{subLabel}</span>
        </div>
      </div>
      {/* necessity gauge — only for real spending (not income/transfers) */}
      {dir === 'out' && !txn.transfer && (
        <div style={{ flexShrink: 0, marginRight: 4 }}><NecGauge score={txn.nec} /></div>
      )}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="amount" style={{ fontWeight: 700, fontSize: 14.5, color: amountColor }}>
          {sign}{fmt(txn.amount, currency)}
        </div>
        {balanceAfter != null && (
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
            Bal {fmt(balanceAfter, currency)}
          </div>
        )}
      </div>
    </div>
  );
}
