// Penny — Supabase sync engine (shared "Space" + realtime, last-write-wins).
//
// Model: the Supabase PROJECT *is* the Space. Anyone holding its URL + anon key
// is a member, so a husband+wife pair point both devices at the same project and
// automatically share the same financial data. Per-device things (chat, the
// display name) stay local — that's the "same accounts, separate chat" design.
//
// Every shared localStorage namespace is mirrored to one row in `penny_entities`
// (kind='doc', id=<namespace>, owner='space') as a JSONB blob with an epoch-ms
// `updated_at`. Conflicts resolve last-write-wins by `updated_at`. Two docs that
// see heavy concurrent appends (transactions, money-map items) are MERGED by
// item id instead of clobbered, so a spend logged on one phone is never lost when
// the other phone writes at the same moment.
//
// Requires the schema in lib/sync-schema.ts to be run once in the Supabase SQL
// editor (also surfaced, copyable, in Settings).
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, hasSupabase } from './config';
import { LS, lsWriteSilent } from './data';
import { logEvent } from './diag';

// How often to pull the Space when realtime isn't delivering (or as a safety net).
const POLL_MS = 15000;
// Don't let an unreachable server hang the UI on "Connecting…" forever.
const NET_TIMEOUT_MS = 12000;

// Supabase returns plain error objects (PostgrestError) — flatten to a real Error
// so message/code survive `instanceof Error` checks and diagnostics logging.
function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(Boolean).map(String);
    return new Error(parts.join(' · ') || JSON.stringify(e));
  }
  return new Error(String(e));
}

function withTimeout<T>(p: PromiseLike<T>, ms = NET_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Can't reach Supabase — network timeout")), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const TABLE = 'penny_entities';
const OWNER = 'space';

// localStorage namespaces that belong to the shared Space (no 'penny.' prefix —
// that's added inside LS). Deliberately excludes profile + chat + diagnostics,
// which stay device-local.
export const SHARED_DOCS = [
  'userTxns',
  'txnOverrides',
  'removedTxns',
  'acctHistory',
  'tracked',
  'settledReimb',
  'userAccounts',
  'accountOverrides',
  'removedAccounts',
  'userEmis',
  'emiOverrides',
  'removedEmis',
  'userSubs',
  'subOverrides',
  'removedSubs',
  'shoppingLists',
  'shoppingMaster',
  'grocery',
  'currency',
  'subsDecided',
  'catTree',
  'savingsAccountId',
] as const;
const SHARED_SET = new Set<string>(SHARED_DOCS);

// Append-heavy collections: merged by item id rather than whole-doc overwrite, so
// simultaneous additions on two devices both survive.
const MERGE_DOCS: Record<string, string> = { userTxns: 'id', tracked: 'id' };

export type SyncState = 'off' | 'connecting' | 'live' | 'error';

interface EntityRow {
  kind: string;
  id: string;
  owner: string;
  data: unknown;
  updated_at: number;
  deleted?: boolean;
}

type ApplyCb = () => void;
type StateCb = (s: SyncState, detail?: string) => void;

function readMeta(): Record<string, number> {
  return LS.read<Record<string, number>>('syncMeta', {});
}
function writeMeta(m: Record<string, number>): void {
  lsWriteSilent('syncMeta', m); // never sync the sync bookkeeping
}

class SyncEngine {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private state: SyncState = 'off';
  private detail = '';
  private onApply: ApplyCb = () => {};
  private onState: StateCb = () => {};
  private applyTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  getState(): SyncState {
    return this.state;
  }
  getDetail(): string {
    return this.detail;
  }
  setStateCb(cb: StateCb): void {
    this.onState = cb;
    cb(this.state, this.detail);
  }

  private set(s: SyncState, detail = ''): void {
    if (s !== this.state || detail !== this.detail) logEvent('sync', { state: s, detail });
    this.state = s;
    this.detail = detail;
    this.onState(s, detail);
  }

  /** Connect, pull everything, subscribe to realtime, and start the polling safety net. */
  async start(onApply: ApplyCb): Promise<void> {
    this.onApply = onApply;
    if (!hasSupabase()) {
      this.set('off');
      return;
    }
    if (this.started) return;
    this.started = true;
    const { url, anonKey } = getSupabase();
    this.set('connecting');
    try {
      this.client = createClient(url, anonKey, { auth: { persistSession: false } });
      await this.pullAll(); // throws on a real failure (bad creds / missing table)
      this.set('live');
      this.subscribe(); // realtime is best-effort — failures don't break sync
      this.startPolling();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logEvent('sync', { state: 'error', where: 'start', detail: msg });
      this.set('error', friendlyError(msg));
      this.started = false;
      // keep trying — the table may appear once they run the SQL, or the network recovers
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.started = false;
      void this.start(this.onApply);
    }, 8000);
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      // Skip while backgrounded to save battery/quota; foreground resumes pulling.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void this.pullAll().catch((e) => {
        logEvent('sync', { state: 'error', where: 'poll', detail: e instanceof Error ? e.message : String(e) });
      });
    }, POLL_MS);
  }

  /** Tear down (e.g. creds removed). */
  stop(): void {
    if (this.channel) {
      void this.client?.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.client = null;
    this.started = false;
    this.set('off');
  }

  /** Re-read creds and reconnect from scratch. */
  async restart(onApply: ApplyCb): Promise<void> {
    this.stop();
    await this.start(onApply);
  }

  private async pullAll(): Promise<void> {
    if (!this.client) return;
    const { data, error } = await withTimeout(this.client.from(TABLE).select('*').eq('owner', OWNER));
    if (error) throw asError(error);
    let changed = false;
    for (const row of (data || []) as EntityRow[]) {
      if (this.applyRow(row)) changed = true;
    }
    // After the very first pull, push anything local that the server doesn't have
    // yet (or that's newer locally) so a fresh device seeds the Space.
    await this.pushAllLocal();
    if (changed) this.scheduleApply();
    // A successful pull means sync is working, even if realtime is flaky.
    if (this.state !== 'live') this.set('live');
  }

  private subscribe(): void {
    if (!this.client) return;
    if (this.channel) { void this.client.removeChannel(this.channel); this.channel = null; }
    this.channel = this.client
      .channel('penny-space')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `owner=eq.${OWNER}` },
        (payload) => {
          const row = payload.new as EntityRow | undefined;
          if (!row || !row.id) return;
          if (this.applyRow(row)) this.scheduleApply();
        },
      )
      .subscribe((status) => {
        logEvent('sync', { realtime: status });
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Realtime is just an accelerator — polling keeps data in sync. Don't
          // flip the user-facing status to "error" for a websocket hiccup; retry quietly.
          if (this.started && !this.retryTimer) {
            this.retryTimer = setTimeout(() => {
              this.retryTimer = null;
              if (this.started) this.subscribe();
            }, 6000);
          }
        }
      });
  }

  /** Merge a remote row into local storage if it wins LWW. Returns true if local changed. */
  private applyRow(row: EntityRow): boolean {
    if (row.owner !== OWNER || !SHARED_SET.has(row.id)) return false;
    const meta = readMeta();
    const localTs = meta[row.id] || 0;
    const mergeKey = MERGE_DOCS[row.id];

    if (mergeKey && Array.isArray(row.data)) {
      const local = LS.read<Record<string, unknown>[]>(row.id, []);
      const remote = row.data as Record<string, unknown>[];
      const byId = new Map<string, Record<string, unknown>>();
      // start from local; remote wins per-item only when its doc is newer
      for (const it of local) byId.set(String(it[mergeKey]), it);
      for (const it of remote) {
        const k = String(it[mergeKey]);
        if (!byId.has(k) || row.updated_at >= localTs) byId.set(k, it);
      }
      const merged = [...byId.values()];
      if (merged.length === local.length && row.updated_at <= localTs) return false;
      lsWriteSilent(row.id, merged);
      meta[row.id] = Math.max(localTs, row.updated_at);
      writeMeta(meta);
      return true;
    }

    // whole-doc last-write-wins
    if (row.updated_at <= localTs) return false;
    lsWriteSilent(row.id, row.data);
    meta[row.id] = row.updated_at;
    writeMeta(meta);
    return true;
  }

  private scheduleApply(): void {
    if (this.applyTimer) clearTimeout(this.applyTimer);
    this.applyTimer = setTimeout(() => this.onApply(), 120);
  }

  /** Called by the LS write-hook on every local mutation of a shared doc. */
  push(docKey: string, value: unknown): void {
    if (!this.client || !SHARED_SET.has(docKey)) return;
    const ts = Date.now();
    const meta = readMeta();
    meta[docKey] = ts;
    writeMeta(meta);
    const row: EntityRow = { kind: 'doc', id: docKey, owner: OWNER, data: value, updated_at: ts };
    void this.client
      .from(TABLE)
      .upsert(row, { onConflict: 'kind,id,owner' })
      .then(({ error }) => {
        if (error) {
          logEvent('sync', { state: 'error', where: 'push', doc: docKey, detail: error.message });
          this.set('error', friendlyError(error.message));
        } else if (this.state !== 'live') this.set('live');
      });
  }

  /** Push every shared doc currently in local storage (seed a fresh Space / manual sync). */
  async pushAllLocal(): Promise<void> {
    if (!this.client) return;
    const meta = readMeta();
    const rows: EntityRow[] = [];
    for (const key of SHARED_DOCS) {
      const raw = localStorage.getItem('penny.' + key);
      if (raw == null) continue;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        continue;
      }
      const ts = meta[key] || Date.now();
      meta[key] = ts;
      rows.push({ kind: 'doc', id: key, owner: OWNER, data: value, updated_at: ts });
    }
    if (!rows.length) return;
    writeMeta(meta);
    const { error } = await withTimeout(this.client.from(TABLE).upsert(rows, { onConflict: 'kind,id,owner' }));
    if (error) {
      logEvent('sync', { state: 'error', where: 'pushAll', detail: error.message });
      throw asError(error); // surface to start()/syncNow() so the user sees a real failure
    }
  }

  /** Manual "Sync now": pull latest then push local. */
  async syncNow(): Promise<void> {
    if (!this.client) {
      this.started = false;
      return this.start(this.onApply);
    }
    this.set('connecting');
    try {
      await this.pullAll();
      this.set('live');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logEvent('sync', { state: 'error', where: 'syncNow', detail: msg });
      this.set('error', friendlyError(msg));
    }
  }
}

// Turn raw Postgres/Supabase errors into a one-line hint the user can act on.
function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('does not exist') || m.includes('relation') || m.includes('schema cache')) {
    return "Table not found — run the setup SQL in Supabase (Settings → Setup SQL), then Sync now.";
  }
  if (m.includes('row-level security') || m.includes('permission') || m.includes('policy')) {
    return 'Permission denied — re-run the setup SQL so the access policy is created.';
  }
  if (m.includes('jwt') || m.includes('api key') || m.includes('invalid') || m.includes('401') || m.includes('apikey')) {
    return 'Key rejected — double-check the anon public key (not the service key) and URL.';
  }
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('fetch')) {
    return "Can't reach Supabase — check the project URL and your connection.";
  }
  return msg.slice(0, 120);
}

export const sync = new SyncEngine();

/** The hook installed on LS so every local write to a shared doc is pushed. */
export function syncWriteHook(key: string, value: unknown): void {
  sync.push(key, value);
}
