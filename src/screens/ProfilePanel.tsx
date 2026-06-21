// Penny — profile side panel: a light slide-in for editing the user's details
// (name, display currency), with a link through to full Settings.
import { useState } from 'react';
import type { CurrencyCode } from '../lib/types';
import { Icons } from '../components/Icons';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useApp } from '../state/AppContext';

const CURRENCIES: CurrencyCode[] = ['AED', 'USD', 'EUR', 'INR'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '🙂';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function ProfilePanel() {
  const app = useApp();
  const open = app.profileOpen;
  const [name, setName] = useState(app.profile.name);
  const [cur, setCur] = useState<CurrencyCode>(app.currency);
  const [confirmClear, setConfirmClear] = useState(false);
  // re-seed when (re)opened
  const [seed, setSeed] = useState(open);
  if (open !== seed) {
    setSeed(open);
    if (open) { setName(app.profile.name); setCur(app.currency); }
  }

  const save = () => {
    app.updateProfile({ name: name.trim() || app.profile.name });
    app.setCurrency(cur);
    app.toast('Profile saved');
    app.closeProfile();
  };

  return (
    <>
      <div onClick={app.closeProfile} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,0.4)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.25s', zIndex: 80 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(340px, 88%)', background: 'var(--bg)', boxShadow: '-8px 0 30px rgba(0,0,0,0.14)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)', zIndex: 81, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 16px 6px' }}>
          <div className="h-display" style={{ fontSize: 18, flex: 1 }}>Your profile</div>
          <button onClick={app.closeProfile} style={{ border: 0, background: 'var(--surface)', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-card)' }}><Icons.close size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 18px' }}>
          {/* avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 18px' }}>
            <div style={{ width: 78, height: 78, borderRadius: 40, background: 'linear-gradient(135deg, var(--accent), var(--coral))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-display)', boxShadow: 'var(--shadow-card)' }}>
              {initials(name)}
            </div>
            <div style={{ fontWeight: 800, fontSize: 17 }} className="h-display">{name || 'You'}</div>
          </div>

          <div className="eyebrow" style={{ marginBottom: 6 }}>Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{ width: '100%', border: '1px solid var(--line-strong)', background: 'var(--surface)', borderRadius: 12, padding: '11px 14px', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none', color: 'var(--ink)' }}
          />

          <div className="eyebrow" style={{ margin: '16px 0 6px' }}>Display currency</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {CURRENCIES.map((c) => (
              <button key={c} className="chip-btn" style={{ flex: 1, padding: '8px 0', justifyContent: 'center', ...(cur === c ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setCur(c)}>{c}</button>
            ))}
          </div>

          <button
            className="chip-btn"
            style={{ width: '100%', padding: 12, marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start' }}
            onClick={() => { app.closeProfile(); app.openSettings(); }}
          >
            <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 32, height: 32, borderRadius: 10 }}><Icons.bolt size={16} /></span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>More settings</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>AI key · sync · categories · usage</span>
            </span>
            <Icons.chevR size={15} color="var(--muted)" />
          </button>

          {/* danger zone */}
          <button
            className="chip-btn"
            style={{ width: '100%', padding: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start', borderColor: 'var(--coral)', color: 'var(--coral-deep)' }}
            onClick={() => setConfirmClear(true)}
          >
            <span className="icon-bub" style={{ background: 'var(--coral-tint, #F8E2D8)', color: 'var(--coral-deep)', width: 32, height: 32, borderRadius: 10 }}><Icons.trash size={16} /></span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>Clear all data</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>Reset Penny &amp; close the app</span>
            </span>
          </button>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <button className="xp-save" style={{ width: '100%', borderRadius: 13, padding: 12 }} onClick={save}>Save profile</button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        opts={{
          title: 'Clear all data?',
          danger: true,
          confirmLabel: 'Clear & exit',
          message: <>This permanently erases all your accounts, transactions, savings and settings on this device. The app will close — reopen it to start fresh. This can’t be undone.</>,
        }}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); app.clearAllData(); }}
      />
    </>
  );
}
