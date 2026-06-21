// Penny — Money map overlay: what you're owed, what you owe, remittances, upcoming.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fmt } from '../lib/data';
import { KIND_LABEL, accrued, currentAmount, dueLabel, itemsOfKind, owedToMe } from '../lib/money';
import type { TrackKind, TrackedItem } from '../lib/types';
import { AgentAvatar } from '../components/Avatar';
import { Icons } from '../components/Icons';
import { EditSheet } from '../components/EditSheet';
import type { Field, FormValues } from '../components/EditSheet';
import { useApp } from '../state/AppContext';

const TRACK_FIELDS: Field[] = [
  { key: 'kind', label: 'Type', type: 'select', options: [
    { value: 'receivable', label: 'Owed to me' },
    { value: 'payable', label: 'I owe' },
    { value: 'remittance', label: 'Send home' },
    { value: 'upcoming', label: 'Upcoming' },
  ] },
  { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Loan to Sara' },
  { key: 'counterparty', label: 'Who', type: 'text', placeholder: 'optional' },
  { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'interestRate', label: 'Interest %/yr', type: 'number', placeholder: 'payables' },
  { key: 'dueDate', label: 'Due date', type: 'date' },
  { key: 'recurring', label: 'Monthly', type: 'toggle' },
  { key: 'cheque', label: 'Post-dated cheque', type: 'toggle' },
];

export function MoneyMap() {
  const app = useApp();
  const { moneyOpen, currency, tracked, txns, settledReimbursements } = app;

  const owed = useMemo(() => owedToMe(tracked, txns, settledReimbursements), [tracked, txns, settledReimbursements]);
  const payables = useMemo(() => itemsOfKind(tracked, 'payable'), [tracked]);
  const remittances = useMemo(() => itemsOfKind(tracked, 'remittance'), [tracked]);
  const upcoming = useMemo(() => itemsOfKind(tracked, 'upcoming'), [tracked]);

  const [editing, setEditing] = useState<TrackedItem | 'new' | null>(null);
  const byId = (id: string) => tracked.find((t) => t.id === id);
  const initial: FormValues =
    editing && editing !== 'new'
      ? { kind: editing.kind, title: editing.title, counterparty: editing.counterparty, amount: editing.amount, interestRate: editing.interestRate, dueDate: editing.dueDate ? new Date(editing.dueDate).toISOString().slice(0, 10) : '', recurring: !!editing.recurring, cheque: !!editing.cheque }
      : { kind: 'receivable', title: '', counterparty: '', amount: 0, interestRate: '', dueDate: '', recurring: false, cheque: false };
  const onSave = (v: FormValues) => {
    const due = v.dueDate ? Date.parse(String(v.dueDate)) : NaN;
    const data = {
      kind: (String(v.kind || 'receivable')) as TrackKind,
      title: String(v.title || v.counterparty || 'Item'),
      counterparty: v.counterparty ? String(v.counterparty) : undefined,
      amount: Number(v.amount) || 0,
      interestRate: v.interestRate === '' || v.interestRate == null ? undefined : Number(v.interestRate),
      dueDate: isNaN(due) ? undefined : due,
      recurring: !!v.recurring,
      cheque: !!v.cheque,
    };
    if (editing === 'new') app.addTracked(data);
    else if (editing) app.updateTracked(editing.id, data);
    setEditing(null);
  };

  const owedTotal = owed.reduce((s, r) => s + r.amount, 0);
  const oweTotal = payables.reduce((s, p) => s + currentAmount(p), 0);
  const sendTotal = remittances.reduce((s, r) => s + r.amount, 0);
  const upcomingTotal = upcoming.reduce((s, u) => s + u.amount, 0);

  const empty = !owed.length && !payables.length && !remittances.length && !upcoming.length;

  return (
    <div className={`ledger-overlay${moneyOpen ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={app.closeMoney}
            style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}
          >
            <Icons.chevD size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="h-display" style={{ fontSize: 19 }}>Money map</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Owed · owing · upcoming</div>
          </div>
          <button className="chip-btn accent" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setEditing('new')}>
            <Icons.plus size={14} /> Add
          </button>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 9.5 }}>Owed to you</div>
            <div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--sage-deep)' }}>{fmt(owedTotal, currency)}</div>
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 9.5 }}>You owe</div>
            <div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--coral-deep)' }}>{fmt(oweTotal, currency)}</div>
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 9.5 }}>Upcoming</div>
            <div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--amber-deep)' }}>{fmt(upcomingTotal + sendTotal, currency)}</div>
          </div>
        </div>
      </div>

      <div className="ledger-scroll" style={{ paddingTop: 4 }}>
        {empty && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '48px 30px', fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
              <AgentAvatar size={40} />
            </div>
            Nothing tracked yet. Tell Penny things like:<br />
            <b>"lent Ahmed 500"</b> · <b>"I owe Khalid 5000 at 5%"</b><br />
            <b>"send 3000 home this month"</b> · <b>"rent 4200 due next week"</b>
          </div>
        )}

        {/* Owed to me */}
        {owed.length > 0 && (
          <Section title={`${KIND_LABEL.receivable} · ${fmt(owedTotal, currency)}`} accent="var(--sage)">
            {owed.map((r) => (
              <Row
                key={r.key}
                title={r.who}
                sub={r.detail}
                amount={fmt(r.amount, currency)}
                amountColor="var(--sage-deep)"
                actionLabel="Settle"
                onAction={() => (r.source === 'txn' ? app.settleReimbursement(r.refId) : app.settleTracked(r.refId))}
                onEdit={r.source === 'item' ? () => { const it = byId(r.refId); if (it) setEditing(it); } : undefined}
              />
            ))}
          </Section>
        )}

        {/* I owe */}
        {payables.length > 0 && (
          <Section title={`${KIND_LABEL.payable} · ${fmt(oweTotal, currency)}`} accent="var(--coral)">
            {payables.map((p) => {
              const acc = accrued(p);
              return (
                <Row
                  key={p.id}
                  title={p.title}
                  sub={p.interestRate ? `${p.interestRate}%/yr · +${fmt(acc.accrued, currency)} interest so far` : p.note || (p.counterparty ?? '')}
                  amount={fmt(acc.total, currency)}
                  amountColor="var(--coral-deep)"
                  actionLabel="Settle"
                  onAction={() => app.settleTracked(p.id)}
                  onEdit={() => setEditing(p)}
                />
              );
            })}
          </Section>
        )}

        {/* Send home */}
        {remittances.length > 0 && (
          <Section title={`${KIND_LABEL.remittance} · ${fmt(sendTotal, currency)}`} accent="var(--amber)">
            {remittances.map((r) => (
              <Row
                key={r.id}
                title={r.title}
                sub={[r.recurring ? 'monthly' : null, dueLabel(r.dueDate) || null].filter(Boolean).join(' · ') || 'planned'}
                amount={fmt(r.amount, currency)}
                amountColor="var(--amber-deep)"
                actionLabel="Sent"
                onAction={() => app.settleTracked(r.id)}
                onEdit={() => setEditing(r)}
              />
            ))}
          </Section>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <Section title={`${KIND_LABEL.upcoming} · ${fmt(upcomingTotal, currency)}`} accent="var(--amber)">
            {upcoming.map((u) => (
              <Row
                key={u.id}
                title={u.title}
                sub={dueLabel(u.dueDate) || u.note || 'expected soon'}
                amount={fmt(u.amount, currency)}
                amountColor="var(--ink)"
                actionLabel="Done"
                onAction={() => app.settleTracked(u.id)}
                onEdit={() => setEditing(u)}
              />
            ))}
          </Section>
        )}
      </div>

      <EditSheet
        open={editing !== null}
        title={editing === 'new' ? 'Add to money map' : 'Edit item'}
        fields={TRACK_FIELDS}
        initial={initial}
        onSave={onSave}
        onClose={() => setEditing(null)}
        onDelete={editing && editing !== 'new' ? () => { app.removeTracked(editing.id); setEditing(null); } : undefined}
      />
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div style={{ margin: '14px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 8px' }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: accent }} />
        <span className="h-display" style={{ fontSize: 14.5 }}>{title}</span>
      </div>
      <div className="card" style={{ padding: '4px 0' }}>{children}</div>
    </div>
  );
}

function Row({
  title,
  sub,
  amount,
  amountColor,
  actionLabel,
  onAction,
  onEdit,
}: {
  title: string;
  sub: string;
  amount: string;
  amountColor: string;
  actionLabel: string;
  onAction: () => void;
  onEdit?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', borderTop: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0, cursor: onEdit ? 'pointer' : 'default' }} onClick={onEdit}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>{sub}</div>
      </div>
      <span className="amount" style={{ fontWeight: 700, fontSize: 14.5, color: amountColor }}>{amount}</span>
      <button onClick={onAction} className="chip-btn" style={{ padding: '5px 11px', fontSize: 11.5 }}>
        {actionLabel}
      </button>
    </div>
  );
}
