// Penny — one universal account form for create + edit. Type selector on top,
// then currency, then fields shown conditionally by type. Opening balance is
// posted as a dated entry (create only), defaulting to the user's opening date.
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Account, AccountGroup, CurrencyCode } from '../lib/types';
import { LS } from '../lib/data';
import { Icons } from '../components/Icons';
import { useApp } from '../state/AppContext';

const GROUPS: { id: AccountGroup; label: string }[] = [
  { id: 'bank', label: 'Bank' },
  { id: 'card', label: 'Card' },
  { id: 'wallet', label: 'Cash / Wallet' },
];
const CURRENCIES: CurrencyCode[] = ['AED', 'USD', 'EUR', 'INR'];
const todayISO = () => new Date().toISOString().slice(0, 10);
function ordinalLabel(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid var(--line-strong)', background: '#fff', borderRadius: 11, padding: '11px 13px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink)', outline: 'none' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 6, fontSize: 10.5 }}>{label}</div>
      {children}
    </div>
  );
}
function Seg({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className="chip-btn" style={{ flex: 1, justifyContent: 'center', padding: '10px 0', fontWeight: 700, ...(value === o.id ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }}>{o.label}</button>
      ))}
    </div>
  );
}

export interface AccountFormState {
  mode: 'create' | 'edit';
  account?: Account;       // edit: the record; create: undefined
  group?: AccountGroup;    // create: preselected type
}

export function AccountForm({ state, onClose, onDelete }: { state: AccountFormState | null; onClose: () => void; onDelete?: () => void }) {
  const app = useApp();
  const open = !!state;
  const a = state?.account;
  const isEdit = state?.mode === 'edit';

  const [seed, setSeed] = useState<AccountFormState | null>(null);
  const [group, setGroup] = useState<AccountGroup>('bank');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('AED');
  const [last4, setLast4] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDays, setDueDays] = useState('');
  const [balance, setBalance] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  // Shared credit line: '' = own limit (legacy), a line id, or '__new' to create one.
  const [lineChoice, setLineChoice] = useState('');
  const [newLineBank, setNewLineBank] = useState('');
  const [newLineLimit, setNewLineLimit] = useState('');

  // re-seed whenever the form (re)opens or switches record
  if (state !== seed) {
    setSeed(state);
    if (state) {
      setGroup(a?.group || state.group || 'bank');
      setName(a?.name || '');
      setCurrency(a?.currency || app.currency || 'AED');
      setLast4(a?.last4 || '');
      setCreditLimit(a?.creditLimit ? String(a.creditLimit) : '');
      setDueDate(a?.dueDate || '');
      setStatementDay(a?.statementDay ? String(a.statementDay) : '');
      setDueDays(a?.dueDays != null ? String(a.dueDays) : '');
      setBalance('');
      setOpeningDate(LS.read<string>('openingDate', '') || todayISO());
      setLineChoice(a?.creditLineId || '');
      setNewLineBank('');
      setNewLineLimit('');
    }
  }

  const isCard = group === 'card';
  const isWallet = group === 'wallet';
  const linked = isCard && lineChoice !== '';
  const canSave = name.trim().length > 0;

  const submit = () => {
    const clean4 = last4.replace(/\D/g, '').slice(0, 4) || undefined;
    const stmtDay = isCard && statementDay ? Math.max(1, Math.min(30, Math.round(Number(statementDay)))) : null;
    const dDays = isCard && dueDays !== '' ? Math.max(0, Math.round(Number(dueDays))) : null;
    // Resolve the shared line: create one if asked, else use the picked id, else none.
    let lineId: string | null = null;
    if (isCard && lineChoice === '__new') {
      lineId = app.addCreditLine({ bank: newLineBank.trim() || name.trim() || 'Card', sharedLimit: Math.abs(Number(newLineLimit)) || 0, currency });
    } else if (isCard && lineChoice) {
      lineId = lineChoice;
    }
    // creditLimit means the card's OWN limit when unlinked, an optional sub-cap when linked.
    const limitVal = isCard && creditLimit ? Math.abs(Number(creditLimit)) : undefined;
    if (isEdit && a) {
      app.updateAccount(a.id, {
        name: name.trim(),
        group,
        currency,
        last4: isWallet ? null : clean4 || null,
        creditLimit: limitVal,
        dueDate: isCard ? (dueDate || null) : null,
        statementDay: stmtDay,
        dueDays: dDays,
        creditLineId: isCard ? lineId : null,
      });
      app.toast('Account updated');
    } else {
      app.addAccount({
        name: name.trim() || 'Account',
        group,
        currency,
        balance: balance === '' ? 0 : Number(balance),
        openingDate: openingDate || undefined,
        creditLimit: limitVal,
        last4: isWallet ? undefined : clean4,
        ...(stmtDay != null ? { statementDay: stmtDay } : {}),
        ...(dDays != null ? { dueDays: dDays } : {}),
        ...(lineId ? { creditLineId: lineId } : {}),
      });
      app.toast('Account added');
    }
    onClose();
  };

  const remove = () => {
    onClose();
    if (onDelete) onDelete();
    else if (a) { app.removeAccount(a.id); app.toast('Account deleted'); }
  };

  return (
    <>
      <div className={`sheet-dim${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`sheet${open ? ' open' : ''}`} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="h-display" style={{ fontSize: 17, padding: '0 2px 14px' }}>{isEdit ? 'Edit account' : 'New account'}</div>

        <Field label="Type"><Seg options={GROUPS} value={group} onChange={(v) => setGroup(v as AccountGroup)} /></Field>
        <Field label="Currency"><Seg options={CURRENCIES.map((c) => ({ id: c, label: c }))} value={currency} onChange={(v) => setCurrency(v as CurrencyCode)} /></Field>
        <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={isCard ? 'e.g. ENBD Visa' : isWallet ? 'e.g. Cash' : 'e.g. Emirates NBD'} /></Field>

        {!isWallet && (
          <Field label="Last 4 digits (optional)"><input style={inputStyle} value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="0000" inputMode="numeric" /></Field>
        )}
        {isCard && (
          <>
            <Field label="Shares a limit with another card?">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="chip-btn" style={{ padding: '8px 11px', ...(lineChoice === '' ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setLineChoice('')}>On its own limit</button>
                {app.creditLines.map((l) => (
                  <button key={l.id} className="chip-btn" style={{ padding: '8px 11px', ...(lineChoice === l.id ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setLineChoice(l.id)}>{l.name || `${l.bank} line`}</button>
                ))}
                <button className="chip-btn" style={{ padding: '8px 11px', ...(lineChoice === '__new' ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setLineChoice('__new')}>+ New shared line</button>
              </div>
            </Field>
            {lineChoice === '__new' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Line bank / name"><input style={inputStyle} value={newLineBank} onChange={(e) => setNewLineBank(e.target.value)} placeholder="e.g. Mashreq" /></Field>
                <Field label="Shared limit"><input style={inputStyle} value={newLineLimit} onChange={(e) => setNewLineLimit(e.target.value)} placeholder="e.g. 50000" inputMode="numeric" /></Field>
              </div>
            )}
            <Field label={linked ? 'Per-card cap (optional)' : "This card's own limit"}><input style={inputStyle} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder={linked ? 'leave blank for no cap' : 'e.g. 15000'} inputMode="numeric" /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Statement day (1–30)"><input style={inputStyle} value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="e.g. 25" inputMode="numeric" /></Field>
              <Field label="Due (days after)"><input style={inputStyle} value={dueDays} onChange={(e) => setDueDays(e.target.value)} placeholder="e.g. 21" inputMode="numeric" /></Field>
            </div>
            {statementDay && dueDays !== '' && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>
                Due around the <b>{ordinalLabel((((Number(statementDay) + Number(dueDays) - 1) % 30) + 30) % 30 + 1)}</b> each month (30-day months).
              </div>
            )}
            <Field label="Or fixed due date (optional)"><input style={inputStyle} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          </>
        )}
        {!isEdit && (
          <>
            <Field label={isCard ? 'Opening balance (− if you owe)' : 'Opening balance'}><input style={inputStyle} value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" inputMode="numeric" /></Field>
            <Field label="Opening date"><input style={inputStyle} type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} /></Field>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          {isEdit && (
            <button className="chip-btn" style={{ borderColor: 'var(--coral)', color: 'var(--coral-deep)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={remove}><Icons.trash size={15} /> Delete</button>
          )}
          <button className="xp-save" disabled={!canSave} style={{ flex: 1, borderRadius: 13, padding: 13, opacity: canSave ? 1 : 0.5 }} onClick={submit}>{isEdit ? 'Save' : 'Add account'}</button>
        </div>
        <button className="chip-btn" style={{ width: '100%', padding: 11, marginTop: 8 }} onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}
