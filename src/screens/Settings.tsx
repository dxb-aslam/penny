// Penny — settings / onboarding: profile, your own AI key, and Supabase sync setup.
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import jsQR from 'jsqr';
import { getApiKey, getSupabase, hasAnthropicKey, hasSupabase } from '../lib/config';
import { SYNC_SCHEMA_SQL } from '../lib/sync-schema';
import { decodeInvite, inviteQrDataUrl } from '../lib/invite';
import { captureImage } from '../lib/media';
import { LS } from '../lib/data';
import { biometryAvailable } from '../lib/biometric';
import { clearLlmLog, llmLogCsv, llmLogTotals, readLlmLog } from '../lib/llmlog';
import { downloadOrShare } from '../lib/download';
import type { CurrencyCode } from '../lib/types';
import { Icons } from '../components/Icons';
import { useApp } from '../state/AppContext';

const SUPABASE_SQL = SYNC_SCHEMA_SQL;

const SYNC_LABEL: Record<string, { txt: string; col: string }> = {
  off: { txt: 'Not connected', col: 'var(--muted)' },
  connecting: { txt: 'Connecting…', col: 'var(--amber-deep)' },
  live: { txt: 'Live · synced', col: 'var(--sage-deep)' },
  error: { txt: 'Sync error', col: 'var(--coral-deep)' },
};

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-strong)',
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '10px 14px',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  color: 'var(--ink)',
};

// Decode a QR code from a photo by drawing it to a canvas and reading pixels.
async function decodeQrFromDataUrl(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 1000;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h);
        const code = jsQR(data.data, w, h);
        resolve(code?.data || null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ margin: '16px 16px 0' }}>
      <div className="eyebrow" style={{ marginBottom: 8, paddingLeft: 4 }}>{title}</div>
      <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

export function Settings() {
  const app = useApp();
  const { settingsOpen } = app;

  const [name, setName] = useState(app.profile.name);
  const [cur, setCur] = useState<CurrencyCode>(app.currency);
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('penny.apiKey') || '';
    } catch {
      return '';
    }
  });
  const [supaUrl, setSupaUrl] = useState<string>(() => { try { return localStorage.getItem('penny.supabaseUrl') || ''; } catch { return ''; } });
  const [supaKey, setSupaKey] = useState<string>(() => { try { return localStorage.getItem('penny.supabaseAnonKey') || ''; } catch { return ''; } });
  const [showSql, setShowSql] = useState(false);
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [bioLock, setBioLock] = useState<boolean>(() => LS.read<boolean>('bioLock', false));

  const toggleBioLock = async () => {
    const nextVal = !bioLock;
    if (nextVal && !(await biometryAvailable())) {
      app.toast('No biometrics enrolled on this device');
      return;
    }
    setBioLock(nextVal);
    LS.write('bioLock', nextVal);
    app.toast(nextVal ? 'Biometric lock on — applies next launch' : 'Biometric lock off');
  };
  const [qr, setQr] = useState<string | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [joinText, setJoinText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [logVer, setLogVer] = useState(0); // bump to re-read the LLM log
  const [logExpanded, setLogExpanded] = useState<number | null>(null);
  const llmLog = readLlmLog();
  const llmTotals = llmLogTotals(llmLog);
  void logVer; // re-read keyed on logVer

  const live = hasAnthropicKey();
  const connected = hasSupabase();
  const status = SYNC_LABEL[app.syncState] || SYNC_LABEL.off;

  const saveProfile = () => {
    app.updateProfile({ name: name.trim() || app.profile.name });
    app.setCurrency(cur);
    app.toast('Profile saved');
  };
  const saveApiKey = () => {
    try {
      if (apiKey.trim()) localStorage.setItem('penny.apiKey', apiKey.trim());
      else localStorage.removeItem('penny.apiKey');
    } catch { /* ignore */ }
    setTest('idle');
    app.toast(apiKey.trim() ? 'API key saved' : 'API key cleared');
  };
  const testKey = async () => {
    const k = apiKey.trim() || getApiKey();
    if (!k) { setTest('fail'); return; }
    setTest('testing');
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
      });
      setTest(r.ok ? 'ok' : 'fail');
    } catch {
      setTest('fail');
    }
  };
  const persistSupabase = (url: string, key: string) => {
    try {
      if (url.trim()) localStorage.setItem('penny.supabaseUrl', url.trim());
      else localStorage.removeItem('penny.supabaseUrl');
      if (key.trim()) localStorage.setItem('penny.supabaseAnonKey', key.trim());
      else localStorage.removeItem('penny.supabaseAnonKey');
    } catch { /* ignore */ }
  };
  const saveSupabase = () => {
    persistSupabase(supaUrl, supaKey);
    setQr(null);
    if (supaUrl.trim() && supaKey.trim()) {
      app.reconnectSync();
      app.toast('Connected — syncing this device');
    } else {
      app.toast('Supabase cleared');
    }
  };
  const copySql = () => {
    try {
      navigator.clipboard?.writeText(SUPABASE_SQL);
      app.toast('Setup SQL copied');
    } catch { /* ignore */ }
  };

  const exportLlmCsv = async () => {
    const stamp = (llmLog[llmLog.length - 1]?.iso || '').slice(0, 10) || 'export';
    const status = await downloadOrShare(`penny-ai-usage-${stamp}.csv`, llmLogCsv(llmLog));
    app.toast(status);
  };
  const clearLog = () => {
    clearLlmLog();
    setLogExpanded(null);
    setLogVer((v) => v + 1);
    app.toast('AI log cleared');
  };

  // Show this device's Space as a QR the other phone can scan to join.
  const shareAccess = async () => {
    const s = getSupabase();
    if (!s.url || !s.anonKey) { app.toast('Save your Supabase connection first'); return; }
    if (qr) { setQr(null); return; }
    try {
      setQr(await inviteQrDataUrl(s.url, s.anonKey));
    } catch { app.toast("Couldn't make the QR"); }
  };

  const applyInvite = (raw: string) => {
    const inv = decodeInvite(raw);
    if (!inv) { app.toast("That didn't look like a Penny invite"); return; }
    setSupaUrl(inv.url);
    setSupaKey(inv.anonKey);
    persistSupabase(inv.url, inv.anonKey);
    app.reconnectSync();
    setShowJoin(false);
    setJoinText('');
    app.toast('Joined the Space — pulling shared data');
  };

  // Scan a QR by taking a photo of it and decoding the pixels (no extra native plugin).
  const scanInvite = async () => {
    setScanning(true);
    try {
      const img = await captureImage('camera');
      if (!img) { setScanning(false); return; }
      const decoded = await decodeQrFromDataUrl(img.dataUrl);
      if (decoded) applyInvite(decoded);
      else app.toast("Couldn't read a QR — try the paste option");
    } catch {
      app.toast('Scan failed — paste the invite instead');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className={`ledger-overlay${settingsOpen ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={app.closeSettings} style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}>
            <Icons.chevD size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="h-display" style={{ fontSize: 19 }}>Settings</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Profile · AI key · sync</div>
          </div>
        </div>
      </div>

      <div className="ledger-scroll">
        {/* Profile */}
        <Section title="Profile">
          <input style={inputStyle} value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['AED', 'USD', 'EUR', 'INR'] as CurrencyCode[]).map((c) => (
              <button key={c} className="chip-btn" style={{ padding: '6px 12px', fontSize: 12.5, ...(cur === c ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setCur(c)}>
                {c}
              </button>
            ))}
          </div>
          <button className="xp-save" style={{ borderRadius: 12 }} onClick={saveProfile}>Save profile</button>
        </Section>

        {/* Setup / data management */}
        <Section title="Setup">
          <button className="chip-btn" style={{ width: '100%', padding: 12, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start' }} onClick={() => app.openSetup()}>
            <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 34, height: 34, borderRadius: 11 }}>
              <Icons.dots size={17} />
            </span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>Categories & subcategories</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Edit the tree · generate with AI</span>
            </span>
            <Icons.chevR size={15} color="var(--muted)" />
          </button>
        </Section>

        {/* Security */}
        <Section title="Security">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 34, height: 34, borderRadius: 11 }}><Icons.shield size={17} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>Biometric app lock</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Require fingerprint / face on launch</span>
            </span>
            <button
              role="switch"
              aria-checked={bioLock}
              onClick={toggleBioLock}
              style={{ width: 46, height: 28, borderRadius: 14, border: 0, cursor: 'pointer', background: bioLock ? 'var(--accent)' : 'var(--line-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: 3, left: bioLock ? 21 : 3, width: 22, height: 22, borderRadius: 11, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
            </button>
          </div>
        </Section>

        {/* AI key */}
        <Section title="Penny AI — your own key">
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Penny runs on your own Anthropic (Claude) key — it stays on your device and calls Claude directly.{' '}
            <span style={{ fontWeight: 700, color: live ? 'var(--sage-deep)' : 'var(--coral-deep)', display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
              {live ? <><Icons.check size={13} /> Live</> : 'Offline — no key'}
            </span>
          </div>
          <input style={inputStyle} type="password" value={apiKey} placeholder="sk-ant-…" onChange={(e) => { setApiKey(e.target.value); setTest('idle'); }} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="chip-btn" onClick={testKey} disabled={test === 'testing'}>
              {test === 'testing' ? 'Testing…' : 'Test key'}
            </button>
            {test === 'ok' && <span style={{ color: 'var(--sage-deep)', fontWeight: 700, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icons.check size={14} /> Works</span>}
            {test === 'fail' && <span style={{ color: 'var(--coral-deep)', fontWeight: 700, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icons.close size={14} /> Invalid / failed</span>}
            <button className="xp-save" style={{ borderRadius: 12, flex: 1, padding: 10 }} onClick={saveApiKey}>Save key</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Get a key at console.anthropic.com → API Keys. Set a spend limit on it. It's stored only on this phone.
          </div>
        </Section>

        {/* Supabase sync */}
        <Section title="Sync across devices — your Space">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: status.col, boxShadow: app.syncState === 'live' ? '0 0 0 4px color-mix(in srgb, var(--sage-deep) 18%, transparent)' : 'none' }} />
            <span style={{ fontWeight: 800, fontSize: 13, color: status.col }}>{status.txt}</span>
            {connected && (
              <button className="chip-btn" style={{ marginLeft: 'auto', padding: '5px 11px', fontSize: 12 }} onClick={app.syncNow} disabled={app.syncState === 'connecting'}>
                Sync now
              </button>
            )}
          </div>
          {app.syncState === 'error' && app.syncDetail && (
            <div style={{ fontSize: 11, color: 'var(--coral-deep)', lineHeight: 1.4 }}>{app.syncDetail}</div>
          )}
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            Connect your own Supabase project — both phones that share it see the same accounts &amp; transactions live, while each keeps its own chat.
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
            <li>Create a free project at supabase.com</li>
            <li>Project Settings → API → copy the <b>Project URL</b> and <b>anon public key</b></li>
            <li>Run the setup SQL once (SQL editor)</li>
            <li>Paste URL + key below and connect</li>
          </ol>
          <input style={inputStyle} value={supaUrl} placeholder="https://xxxx.supabase.co" onChange={(e) => setSupaUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <input style={inputStyle} type="password" value={supaKey} placeholder="anon public key" onChange={(e) => setSupaKey(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="chip-btn" style={{ flex: 1 }} onClick={() => setShowSql((s) => !s)}>{showSql ? 'Hide SQL' : 'Setup SQL'}</button>
            <button className="xp-save" style={{ borderRadius: 12, flex: 1, padding: 10 }} onClick={saveSupabase}>Connect</button>
          </div>
          {showSql && (
            <div>
              <pre style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 12, fontSize: 10.5, lineHeight: 1.45, overflowX: 'auto', color: 'var(--ink-soft)', margin: 0 }}>{SUPABASE_SQL}</pre>
              <button className="chip-btn" style={{ marginTop: 8 }} onClick={copySql}>Copy SQL</button>
            </div>
          )}

          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />

          {/* Pair a second device */}
          <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ink)' }}>Add your partner's phone</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="chip-btn" style={{ flex: 1 }} onClick={shareAccess} disabled={!connected}>{qr ? 'Hide QR' : 'Share access (QR)'}</button>
            <button className="chip-btn" style={{ flex: 1 }} onClick={() => setShowJoin((s) => !s)}>Join a Space</button>
          </div>
          {qr && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '6px 0' }}>
              <img src={qr} alt="Space invite QR" style={{ width: 220, height: 220, borderRadius: 14, border: '1px solid var(--line)' }} />
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Scan on the other phone → Settings → Join a Space</div>
            </div>
          )}
          {showJoin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="chip-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={scanInvite} disabled={scanning}>{scanning ? 'Reading…' : <><Icons.camera size={14} /> Scan invite QR</>}</button>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'none' }} value={joinText} placeholder="…or paste the invite text" onChange={(e) => setJoinText(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button className="xp-save" style={{ borderRadius: 12, padding: 10 }} onClick={() => applyInvite(joinText)} disabled={!joinText.trim()}>Join with pasted invite</button>
            </div>
          )}
        </Section>

        {/* AI usage & cost log */}
        <Section title="AI usage & cost">
          <div style={{ display: 'flex', gap: 10, textAlign: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{llmTotals.calls}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>calls</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{(llmTotals.inputTokens + llmTotals.outputTokens).toLocaleString()}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>tokens (in+out)</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--accent-deep)' }}>${llmTotals.costUSD.toFixed(4)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>cost</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="chip-btn" style={{ flex: 1 }} onClick={exportLlmCsv} disabled={!llmLog.length}>Download CSV</button>
            <button className="chip-btn" style={{ flex: 1, color: 'var(--coral-deep)' }} onClick={clearLog} disabled={!llmLog.length}>Clear log</button>
          </div>
          {!llmLog.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No AI calls logged yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {llmLog.slice().reverse().slice(0, 60).map((e, i) => {
              const idx = llmLog.length - 1 - i;
              const open = logExpanded === idx;
              return (
                <div key={e.t + '-' + i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface)' }}>
                  <button
                    onClick={() => setLogExpanded(open ? null : idx)}
                    style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 7, background: e.ok ? 'var(--sage-deep)' : 'var(--coral-deep)' }} />
                    <span style={{ fontWeight: 700, fontSize: 12.5 }}>{e.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.model}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                      {e.inputTokens}+{e.outputTokens}t · ${e.costUSD.toFixed(4)} · {e.ms}ms
                    </span>
                  </button>
                  {open && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                      <div style={{ color: 'var(--muted)', fontWeight: 700, marginBottom: 2 }}>{new Date(e.t).toLocaleString()}</div>
                      {e.error && <div style={{ color: 'var(--coral-deep)' }}>error: {e.error}</div>}
                      <div style={{ fontWeight: 700, marginTop: 6 }}>Input</div>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '2px 0', fontSize: 10.5, maxHeight: 160, overflowY: 'auto' }}>{e.input}</pre>
                      <div style={{ fontWeight: 700, marginTop: 6 }}>Output</div>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '2px 0', fontSize: 10.5, maxHeight: 160, overflowY: 'auto' }}>{e.output}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
