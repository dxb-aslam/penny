// Penny — account dashboard: balance, recent transactions, view-all, edit.
import { useState } from 'react';
import { CATS, acctMask, accountInitials, cardDue, dayLabel, fmt, txnDir, txnTouchesAccount } from '../lib/data';
import { cardCredit } from '../lib/finance';
import { categoryBreakdown } from '../lib/ledger';
import type { CurrencyCode } from '../lib/types';
import { CatIcon, Icons } from '../components/Icons';
import { Bar, TxnRow } from '../components/ui';
import { AccountForm } from '../components/AccountForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Account, Txn } from '../lib/types';
import { useApp } from '../state/AppContext';

// Move money between accounts, with an optional charge that's auto-suggested
// (~1.05%) when paying a credit card, then booked as its own linked fee row.
function TransferSheet({ open, fromAccount, accounts, currency, onClose, onSubmit }: {
  open: boolean;
  fromAccount: Account;
  accounts: Account[];
  currency: CurrencyCode;
  onClose: () => void;
  onSubmit: (to: string, amount: number, charge: number, note?: string) => void;
}) {
  const others = accounts.filter((a) => a.id !== fromAccount.id);
  const [to, setTo] = useState(others[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [charge, setCharge] = useState('');
  const [chargeTouched, setChargeTouched] = useState(false);
  const [note, setNote] = useState('');
  const [seed, setSeed] = useState(open);
  if (open !== seed) { setSeed(open); if (open) { setTo(others[0]?.id || ''); setAmount(''); setCharge(''); setChargeTouched(false); setNote(''); } }

  const toAcct = accounts.find((a) => a.id === to);
  const toIsCard = (toAcct?.group || '') === 'card';
  const amt = Number(amount) || 0;
  const suggested = toIsCard && amt > 0 ? Math.round(amt * 0.0105 * 100) / 100 : 0;
  const effCharge = chargeTouched ? Number(charge) || 0 : suggested;

  return (
    <>
      <div className={`sheet-dim${open ? ' open' : ''}`} style={{ zIndex: 70 }} onClick={onClose} />
      <div className={`sheet${open ? ' open' : ''}`} style={{ zIndex: 71, maxHeight: '85%', overflowY: 'auto' }}>
        <div className="h-display" style={{ fontSize: 17, padding: '0 6px 12px' }}>Move money from {fromAccount.name}</div>
        <div className="es-field"><span className="lab">To account</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {others.map((a) => (
              <button key={a.id} className="chip-btn" style={{ padding: '4px 10px', fontSize: 11.5, ...(to === a.id ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setTo(a.id)}>{a.name}</button>
            ))}
          </span>
        </div>
        <div className="es-field"><span className="lab">Amount</span>
          <input className="es-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="es-field"><span className="lab">Charge / fee{toIsCard ? ' (≈1.05%)' : ''}</span>
          <input className="es-input" inputMode="decimal" value={chargeTouched ? charge : (suggested ? String(suggested) : '')} onChange={(e) => { setChargeTouched(true); setCharge(e.target.value); }} placeholder="0" />
        </div>
        {toIsCard && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '2px 4px 0', lineHeight: 1.4 }}>
            Paying a credit card — banks usually charge ~1.05%. Booked as a separate fee on {fromAccount.name}.
          </div>
        )}
        <div className="es-field"><span className="lab">Note</span>
          <input className="es-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, padding: '8px 4px 0' }}>
          {amt > 0 ? `${fmt(amt, currency)} to ${toAcct?.name}${effCharge ? ` + ${fmt(effCharge, currency)} fee` : ''}` : ' '}
        </div>
        <button className="xp-save" style={{ width: '100%', borderRadius: 14, marginTop: 14 }} disabled={!to || amt <= 0} onClick={() => onSubmit(to, amt, effCharge, note || undefined)}>Transfer</button>
      </div>
    </>
  );
}

// Balance immediately after each transaction, computed from the current balance
// backwards (newest→oldest). Module-level so it isn't render-mutated state.
function runningBalances(txns: Txn[], currentBalance: number, accountId: string): { t: Txn; after: number }[] {
  const desc = [...txns].sort((a, b) => b.ts - a.ts);
  let running = currentBalance;
  return desc.map((t) => {
    const after = running;
    const d = txnDir(t, accountId);
    running = after - (d === 'in' ? t.amount : d === 'out' ? -t.amount : 0);
    return { t, after };
  });
}

export function AccountView() {
  const app = useApp();
  const { accountViewId, currency } = app;
  const account = app.accounts.find((a) => a.id === accountViewId) || null;
  const [editing, setEditing] = useState(false);
  const isCard = (account?.group || 'bank') === 'card';
  const due = isCard && account ? cardDue(account) : null;
  const acctChanges = account ? app.acctHistoryFor(account.id) : [];

  const acctTxns = account ? app.txns.filter((t) => txnTouchesAccount(t, account.id)) : [];
  const recent = account ? runningBalances(acctTxns, account.balance, account.id).slice(0, 6) : [];
  const breakdown = categoryBreakdown(acctTxns).slice(0, 6);
  const bdMax = breakdown.length ? breakdown[0].total : 1;
  const totalOut = account ? acctTxns.filter((t) => txnDir(t, account.id) === 'out').reduce((s, t) => s + t.amount, 0) : 0;
  const totalIn = account ? acctTxns.filter((t) => txnDir(t, account.id) === 'in').reduce((s, t) => s + t.amount, 0) : 0;
  const interestFees = acctTxns.filter((t) => t.tag === 'interest' || t.tag === 'fee').reduce((s, t) => s + t.amount, 0);
  const eppTotal = acctTxns.filter((t) => t.tag === 'epp').reduce((s, t) => s + t.amount, 0);
  const [transferring, setTransferring] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const open = !!accountViewId && !!account;
  // Credit headline: line-level when the card shares a limit, per-card otherwise.
  const credit = account ? cardCredit(account, app.creditLines, app.accounts) : null;
  const util = credit?.utilization ?? 0;
  const otherMembers = credit?.line ? credit.members.filter((m) => m.id !== account!.id) : [];

  return (
    <div className={`ledger-overlay${open ? ' open' : ''}`}>
      {account && (
        <>
          <div className="ledger-head" style={{ background: account.bg, color: account.fg, borderBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={app.closeAccount}
                style={{ border: 0, background: 'rgba(255,255,255,0.2)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: account.fg }}
              >
                <Icons.chevD size={18} />
              </button>
              <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>
                {accountInitials(account.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="h-display" style={{ fontSize: 17 }}>{account.name}</div>
                <div style={{ fontSize: 11.5, opacity: 0.8, fontWeight: 600 }}>
                  {account.note}{acctMask(account) ? ` · ${acctMask(account)}` : ''}
                </div>
              </div>
              <button className="chip-btn" style={{ background: 'rgba(255,255,255,0.22)', border: 0, color: account.fg, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setTransferring(true)}>
                <Icons.loop size={14} /> Move
              </button>
              <button className="chip-btn" style={{ background: 'rgba(255,255,255,0.22)', border: 0, color: account.fg, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setEditing(true)}>
                <Icons.pencil size={14} /> Edit
              </button>
            </div>
            <div className="amount h-display" style={{ fontSize: 32, fontWeight: 700, marginTop: 12 }}>
              {fmt(account.balance, account.currency || currency)}
            </div>
            {credit ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                  <div style={{ width: `${util * 100}%`, height: '100%', background: util < 0.3 ? '#9ED88B' : util < 0.7 ? '#F2C879' : '#F1A38C' }} />
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 4 }}>
                  {fmt(credit.available, account.currency || currency)} available · {Math.round(util * 100)}% used
                </div>
                {credit.line ? (
                  <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, marginTop: 4, lineHeight: 1.45 }}>
                    Shares a {fmt(credit.limit, account.currency || currency)} limit{otherMembers.length ? ` with ${otherMembers.map((m) => m.name).join(', ')}` : ''} · {fmt(credit.available, account.currency || currency)} available across the line.
                    {credit.subCap != null ? ` This card capped at ${fmt(credit.subCap, account.currency || currency)}.` : ''}
                  </div>
                ) : null}
              </div>
            ) : null}
            {isCard && due ? (
              <div style={{ fontSize: 11.5, opacity: 0.85, fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icons.calendar size={13} /> Payment {due.label}{due.inDays >= 0 && due.inDays <= 31 ? ` · in ${due.inDays}d` : ''}
              </div>
            ) : null}
          </div>

          <div className="ledger-scroll">
            {/* graphical dashboard */}
            {acctTxns.length > 0 && (
              <div className="card" style={{ margin: '14px 16px 0', padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 18, marginBottom: breakdown.length ? 14 : 0 }}>
                  <div><div className="eyebrow" style={{ fontSize: 9.5 }}>Total out</div><div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--coral-deep)' }}>{fmt(totalOut, currency)}</div></div>
                  <div><div className="eyebrow" style={{ fontSize: 9.5 }}>Total in</div><div className="amount h-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--sage-deep)' }}>{fmt(totalIn, currency)}</div></div>
                  <div><div className="eyebrow" style={{ fontSize: 9.5 }}>Entries</div><div className="amount h-display" style={{ fontSize: 17, fontWeight: 700 }}>{acctTxns.length}</div></div>
                </div>
                {(interestFees > 0 || eppTotal > 0) && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: breakdown.length ? 14 : 0, flexWrap: 'wrap' }}>
                    {interestFees > 0 && (
                      <span style={{ background: 'var(--coral-tint)', color: 'var(--coral-deep)', fontWeight: 700, fontSize: 11.5, padding: '5px 11px', borderRadius: 999 }}>
                        Interest &amp; fees: {fmt(interestFees, currency)}
                      </span>
                    )}
                    {eppTotal > 0 && (
                      <span style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', fontWeight: 700, fontSize: 11.5, padding: '5px 11px', borderRadius: 999 }}>
                        EPP: {fmt(eppTotal, currency)}
                      </span>
                    )}
                  </div>
                )}
                {breakdown.length > 0 && (
                  <>
                    <div className="eyebrow" style={{ marginBottom: 10 }}>Spending by category</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {breakdown.map((b) => (
                        <div key={b.cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <CatIcon cat={b.cat} size={15} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
                              <span>{(CATS[b.cat] || CATS.other).label}</span>
                              <span className="amount">{fmt(b.total, currency)}</span>
                            </div>
                            <Bar value={b.total} max={bdMax} color={(CATS[b.cat] || CATS.other).color} height={5} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '16px 20px 6px' }}>
              <span className="eyebrow">Recent activity</span>
              <button
                onClick={() => { app.closeAccount(); app.openLedger({ accounts: [account.id], preset: 'all', type: 'all' }); }}
                style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--accent-deep)', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 700 }}
              >
                View all history
              </button>
            </div>
            {recent.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 30px', fontSize: 13.5 }}>No transactions on this account yet.</div>
            ) : (
              <div className="card" style={{ margin: '0 16px', padding: '6px 0' }}>
                {recent.map(({ t, after }) => (
                  <TxnRow key={t.id} txn={t} currency={currency} accountId={account.id} balanceAfter={after} onClick={() => app.openTxnEditor(t.id)} />
                ))}
              </div>
            )}

            {/* change history (credit limit / due date) */}
            {acctChanges.length > 0 && (
              <>
                <div className="eyebrow" style={{ padding: '18px 20px 6px' }}>Changes</div>
                <div className="card" style={{ margin: '0 16px 16px', padding: '6px 16px' }}>
                  {acctChanges.slice(0, 8).map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                      <Icons.flag size={14} color="var(--muted)" />
                      <span style={{ flex: 1, fontSize: 12.5 }}>
                        {c.kind === 'limit' ? 'Credit limit' : 'Payment due'} {Number(c.to) > Number(c.from) && c.kind === 'limit' ? 'increased' : c.kind === 'limit' ? 'decreased' : 'changed'} from <b>{c.kind === 'limit' ? fmt(Number(c.from), currency) : c.from}</b> to <b>{c.kind === 'limit' ? fmt(Number(c.to), currency) : c.to}</b>
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{dayLabel(c.ts)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <AccountForm
            state={editing ? { mode: 'edit', account } : null}
            onClose={() => setEditing(false)}
            onDelete={() => setConfirmDel(true)}
          />

          <ConfirmDialog
            open={confirmDel}
            opts={{ title: 'Delete account?', danger: true, confirmLabel: 'Delete', message: <>“{account.name}” and all its transactions will be permanently removed. This can’t be undone.</> }}
            onConfirm={() => { setConfirmDel(false); const id = account.id; app.closeAccount(); app.removeAccount(id); app.toast('Account deleted'); }}
            onCancel={() => setConfirmDel(false)}
          />

          <TransferSheet
            open={transferring}
            fromAccount={account}
            accounts={app.accounts}
            currency={currency}
            onClose={() => setTransferring(false)}
            onSubmit={(to, amt, charge, note) => { app.addTransfer(account.id, to, amt, note, charge); app.toast(charge ? 'Transfer + charge logged' : 'Transfer logged'); setTransferring(false); }}
          />
        </>
      )}
    </div>
  );
}
