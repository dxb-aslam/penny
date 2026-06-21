// Penny Agent v2 — executor: the safety boundary. Validates and runs every op
// against a data accessor (driver). The model's rules are advisory; this is law.
import type { Op, OpResult } from '../types';

// Positional columns for `add` ops — order MUST match the prompts' INPUT COLUMNS.
export const INPUT_COLUMNS: Record<string, string[]> = {
  txn: ['merchant', 'cat', 'amount', 'account', 'nec', 'sub', 'items'],
  account: ['name', 'group', 'balance', 'last4', 'creditLimit', 'dueDate'],
  tracked_item: ['kind', 'title', 'amount', 'counterparty', 'dueDate', 'recurring', 'interestRate'],
  sub: ['name', 'amount', 'every', 'cat', 'essential'],
  emi: ['name', 'lender', 'monthly', 'principal', 'remaining', 'months', 'rate'],
  grocery_item: ['list_id', 'name', 'qty', 'note'],
  category: ['label', 'subs'],
  transfer: ['from', 'to', 'amount', 'charge'],
  credit_line: ['bank', 'name', 'sharedLimit', 'currency', 'note'],
};
export const WRITABLE_TABLES = [...Object.keys(INPUT_COLUMNS), 'shopping_list', 'profile'];
export const READABLE_TABLES = [...WRITABLE_TABLES, 'master_item', 'chat', 'chat_summary', 'account_change'];

/** The driver: the executor only talks to these; the app supplies the implementation. */
export interface AgentData {
  rows(table: string): Record<string, unknown>[];
  add(table: string, obj: Record<string, unknown>): OpResult;
  update(table: string, id: string, changes: Record<string, unknown>): boolean;
  remove(table: string, id: string): boolean;
}

export type ConfirmFn = (message: string) => Promise<boolean>;

function periodRange(p?: string): [number, number] | null {
  if (!p || p === 'all') return null;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  switch (p) {
    case 'today': return [startOfDay, startOfDay + 86400000];
    case 'week': return [startOfDay - 6 * 86400000, startOfDay + 86400000];
    case 'month': return [startOfMonth, now.getTime() + 1];
    case 'last_month': return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), startOfMonth];
    case '3m': return [new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime(), now.getTime() + 1];
    case 'year': return [new Date(now.getFullYear(), 0, 1).getTime(), now.getTime() + 1];
    default: return null;
  }
}

function rowMatches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  const range = periodRange(where.period as string | undefined);
  if (range) {
    const ts = Number(row.ts ?? row.createdAt ?? 0);
    if (ts < range[0] || ts >= range[1]) return false;
  }
  for (const [k, v] of Object.entries(where)) {
    if (k === 'period' || k === 'limit') continue;
    if (String(row[k] ?? '') !== String(v)) return false;
  }
  return true;
}

function zip(cols: string[], values: unknown[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  cols.forEach((c, i) => { if (values[i] !== undefined) o[c] = values[i]; });
  return o;
}

/** Does this op change money / delete / settle → needs a user confirm. */
function needsConfirm(op: Op): boolean {
  if (op.confirm) return true;
  if (op.do === 'del') return true;
  if (op.do === 'set' && op.values && !Array.isArray(op.values)) {
    const v = op.values as Record<string, unknown>;
    if ('balance' in v || 'status' in v) return true; // balance change / settle
  }
  return false;
}

export async function runOps(ops: Op[], data: AgentData, confirm?: ConfirmFn): Promise<OpResult[]> {
  const out: OpResult[] = [];
  for (const op of ops) {
    try {
      if (!READABLE_TABLES.includes(op.table)) { out.push({ ok: false, error: `table '${op.table}' not allowed` }); continue; }

      if (op.do === 'get') {
        let rows = data.rows(op.table);
        const where = (op.where || {}) as Record<string, unknown>;
        rows = rows.filter((r) => rowMatches(r, where));
        if (op.agg) {
          const value = op.agg.fn === 'count' ? rows.length : rows.reduce((s, r) => s + (Number(r[op.agg!.col || 'amount']) || 0), 0);
          out.push({ ok: true, value, rows: undefined });
        } else {
          const limit = Math.max(1, Math.min(50, Number(where.limit) || 25));
          out.push({ ok: true, rows: rows.slice(0, limit) });
        }
        continue;
      }

      if (!WRITABLE_TABLES.includes(op.table)) { out.push({ ok: false, error: `table '${op.table}' not writable` }); continue; }
      if (needsConfirm(op) && confirm) {
        const ok = await confirm(describeOp(op));
        if (!ok) { out.push({ ok: false, error: 'cancelled' }); continue; }
      }

      if (op.do === 'add') {
        const cols = INPUT_COLUMNS[op.table];
        if (!cols) { out.push({ ok: false, error: `no input columns for ${op.table}` }); continue; }
        const obj = Array.isArray(op.values) ? zip(cols, op.values) : (op.values as Record<string, unknown>) || {};
        out.push(data.add(op.table, obj));
        continue;
      }

      if (op.do === 'set') {
        const where = (op.where || {}) as Record<string, unknown>;
        const v = op.values as Record<string, unknown>;
        if (!v || Array.isArray(v)) { out.push({ ok: false, error: 'set needs values object' }); continue; }
        const hasTarget = where.id || Object.keys(where).some((k) => k !== 'period' && k !== 'limit');
        if (!hasTarget) { out.push({ ok: false, error: 'set needs a target (where)' }); continue; }
        const ids = data.rows(op.table).filter((r) => rowMatches(r, where)).map((r) => String(r.id));
        ids.forEach((id) => data.update(op.table, id, v));
        out.push({ ok: ids.length > 0, rows: undefined, value: ids.length, error: ids.length ? undefined : 'no rows matched' });
        continue;
      }

      if (op.do === 'del') {
        const where = (op.where || {}) as Record<string, unknown>;
        if (!Object.keys(where).some((k) => k !== 'period' && k !== 'limit')) { out.push({ ok: false, error: 'del needs where' }); continue; }
        const ids = data.rows(op.table).filter((r) => rowMatches(r, where)).map((r) => String(r.id));
        ids.forEach((id) => data.remove(op.table, id));
        out.push({ ok: ids.length > 0, value: ids.length, error: ids.length ? undefined : 'no rows matched' });
        continue;
      }

      out.push({ ok: false, error: `unknown op '${op.do}'` });
    } catch (e) {
      out.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

function describeOp(op: Op): string {
  if (op.do === 'del') return `Delete from ${op.table}?`;
  if (op.do === 'set') return `Update ${op.table}?`;
  return `Apply change to ${op.table}?`;
}

/** Compact results for feeding back to the agent on an await round. */
export function resultsForModel(ops: Op[], results: OpResult[]): string {
  return ops.map((op, i) => {
    const r = results[i];
    if (!r) return `${op.do} ${op.table}: (no result)`;
    if (!r.ok) return `${op.do} ${op.table}: ERROR ${r.error}`;
    if (op.do === 'get') {
      if (op.agg) return `get ${op.table} ${op.agg.fn}(${op.agg.col || 'amount'})${op.where?.period ? ' ' + op.where.period : ''} = ${r.value}`;
      return `get ${op.table} → ${JSON.stringify(r.rows)}`;
    }
    return `${op.do} ${op.table}: ok${r.value != null ? ` (${r.value})` : ''}`;
  }).join('\n');
}
