// Penny — a shared credit line: parent card (one limit, line-level available +
// utilisation) with its member cards nested under it, each keeping its OWN due
// date and balance. Sharing a limit never merges billing.
import { accountInitials, acctMask, cardDue, fmt } from '../lib/data';
import { lineAvailable, lineOutstanding, lineUtilization } from '../lib/finance';
import type { Account, CreditLine, CurrencyCode } from '../lib/types';
import { Icons } from '../components/Icons';
import { Bar } from '../components/ui';

export function CreditLineCard({ line, members, currency, onOpen, onEdit }: {
  line: CreditLine;
  members: Account[];
  currency: CurrencyCode;
  onOpen: (id: string) => void;
  onEdit?: () => void;
}) {
  const cur = line.currency || currency;
  const used = lineOutstanding(members);
  const avail = lineAvailable(line.sharedLimit, members);
  const util = Math.min(1, lineUtilization(line.sharedLimit, members));
  const utilColor = util < 0.3 ? 'var(--sage)' : util < 0.7 ? 'var(--amber)' : 'var(--coral)';

  return (
    <div className="card" style={{ margin: '0 16px 10px', padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{line.name || `${line.bank} shared line`}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{members.length} cards · one {fmt(line.sharedLimit, cur)} limit</div>
        </div>
        {onEdit && (
          <button className="chip-btn" style={{ padding: '5px 9px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={onEdit}>
            <Icons.pencil size={12} /> Edit
          </button>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, margin: '10px 0 7px' }}>
        <span>Used {fmt(used, cur)}</span>
        <span className="amount" style={{ color: 'var(--muted)' }}>{fmt(avail, cur)} available</span>
      </div>
      <Bar value={used} max={line.sharedLimit} color={utilColor} height={7} />
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>{Math.round(util * 100)}% of the shared limit used</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 11 }}>
        {members.map((m) => {
          const due = cardDue(m);
          return (
            <button
              key={m.id}
              onClick={() => onOpen(m.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%', border: '1px solid var(--line)', background: 'var(--surface)', borderRadius: 11, padding: '9px 11px', cursor: 'pointer' }}
            >
              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 8, background: m.bg, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10 }}>
                {accountInitials(m.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.name}{acctMask(m) ? ` · ${acctMask(m)}` : ''}
                </div>
                {due ? (
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icons.calendar size={11} /> {due.label}{due.inDays >= 0 && due.inDays <= 31 ? ` · in ${due.inDays}d` : ''}
                  </div>
                ) : null}
              </div>
              <span className="amount" style={{ fontSize: 13, fontWeight: 800, color: m.balance < 0 ? 'var(--coral-deep)' : 'var(--ink)' }}>{fmt(m.balance, m.currency || cur)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
