// Penny — "money map" logic: tracked obligations, interest accrual, reimbursable expenses.
import type { RawTrackedItem, TrackKind, TrackedItem, Txn } from './types';

export const KIND_LABEL: Record<TrackKind, string> = {
  receivable: 'Owed to me',
  payable: 'I owe',
  remittance: 'Send home',
  upcoming: 'Upcoming',
  income: 'Expected income',
};

/** Direction of money flow: 'in' = coming to me, 'out' = leaving. */
export const KIND_DIR: Record<TrackKind, 'in' | 'out'> = {
  receivable: 'in',
  payable: 'out',
  remittance: 'out',
  upcoming: 'out',
  income: 'in',
};

/** Interest accrued on a payable since it was created (simple interest, annual rate). */
export function accrued(item: TrackedItem): { accrued: number; total: number } {
  if (item.kind !== 'payable' || !item.interestRate) return { accrued: 0, total: item.amount };
  const days = Math.max(0, (Date.now() - item.createdAt) / 86400000);
  const accruedAmt = item.amount * (item.interestRate / 100) * (days / 365);
  return { accrued: accruedAmt, total: item.amount + accruedAmt };
}

/** Current value of an item (payables grow with interest; others are flat). */
export function currentAmount(item: TrackedItem): number {
  return item.kind === 'payable' ? accrued(item).total : item.amount;
}

/** Reimbursable expenses (spent for someone/company/lent, not self) that aren't settled yet. */
export function reimbursableTxns(txns: Txn[], settledIds: string[]): Txn[] {
  const settled = new Set(settledIds);
  return txns.filter((t) => t.attribution && t.attribution.mode !== 'self' && !t.income && !settled.has(t.id));
}

export interface OwedRow {
  key: string;
  who: string;
  amount: number;
  detail: string;
  source: 'txn' | 'item';
  refId: string; // txn id or tracked item id
}

/** Combined "owed to me": reimbursable expenses + standalone receivable items. */
export function owedToMe(tracked: TrackedItem[], txns: Txn[], settledIds: string[]): OwedRow[] {
  const rows: OwedRow[] = [];
  for (const t of reimbursableTxns(txns, settledIds)) {
    const who = t.attribution?.who || (t.attribution?.mode === 'company' ? 'Company' : 'Someone');
    rows.push({
      key: 'txn-' + t.id,
      who,
      amount: t.amount,
      detail: `${t.merchant} · ${t.attribution?.mode === 'lent' ? 'lent' : 'reimbursable'}`,
      source: 'txn',
      refId: t.id,
    });
  }
  for (const it of tracked) {
    if (it.kind === 'receivable' && it.status === 'open') {
      const bits = [it.cheque ? 'Post-dated cheque' : null, it.dueDate ? dueLabel(it.dueDate) : null, it.note || (it.cheque ? '' : it.title)].filter(Boolean);
      rows.push({
        key: 'item-' + it.id,
        who: it.counterparty || it.title,
        amount: it.amount,
        detail: bits.join(' · ') || it.title,
        source: 'item',
        refId: it.id,
      });
    }
  }
  return rows;
}

export function itemsOfKind(tracked: TrackedItem[], kind: TrackKind): TrackedItem[] {
  return tracked.filter((t) => t.kind === kind && t.status === 'open').sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));
}

/** Map Claude's raw tracked item to a partial TrackedItem (id/createdAt/status added by caller). */
export function normalizeTracked(raw: RawTrackedItem): Omit<TrackedItem, 'id' | 'createdAt' | 'status'> {
  const due = raw.dueDate ? Date.parse(raw.dueDate) : NaN;
  return {
    kind: raw.kind,
    title: raw.title || raw.counterparty || KIND_LABEL[raw.kind] || 'Item',
    counterparty: raw.counterparty,
    amount: Math.abs(Number(raw.amount) || 0),
    currency: raw.currency,
    dueDate: isNaN(due) ? undefined : due,
    recurring: !!raw.recurring,
    interestRate: raw.interestRate ? Math.abs(raw.interestRate) : undefined,
    note: raw.note,
    expectedMin: raw.expectedMin != null ? Math.abs(raw.expectedMin) : undefined,
    expectedMax: raw.expectedMax != null ? Math.abs(raw.expectedMax) : undefined,
    cheque: !!raw.cheque,
  };
}

export function dueLabel(ms?: number): string {
  if (ms == null) return '';
  const days = Math.round((ms - Date.now()) / 86400000);
  if (days < -1) return `${-days}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 0) return 'overdue';
  if (days <= 60) return `in ${days}d`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
