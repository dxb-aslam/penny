// Penny — Notifications center: nudges + alerts, surfaced from the Home bell.
import { useMemo } from 'react';
import { Icons } from '../components/Icons';
import { notificationsFor } from '../lib/notifications';
import type { NotifAction, NotifItem, NotifTone } from '../lib/notifications';
import { useApp } from '../state/AppContext';

const TONE: Record<NotifTone, { color: string; tint: string }> = {
  warn: { color: 'var(--coral-deep)', tint: 'var(--coral-tint, #F8E2D8)' },
  good: { color: 'var(--sage-deep)', tint: 'var(--sage-tint)' },
  info: { color: 'var(--accent-deep)', tint: 'var(--accent-tint)' },
};

export function Notifications() {
  const app = useApp();
  const open = app.notificationsOpen;
  const items = useMemo(
    () => notificationsFor(app),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.txns, app.accounts, app.emis, app.subs, app.currency, app.savingsAccountId],
  );

  const run = (a?: NotifAction) => {
    app.closeNotifications();
    switch (a) {
      case 'ledger': app.openLedger(); break;
      case 'track': app.go('track'); break;
      case 'savings': app.go('coach'); break;
      case 'coach': app.go('coach'); break;
      case 'accounts': app.go('accounts'); break;
      case 'money': app.openMoney(); break;
    }
  };

  return (
    <div className={`ledger-overlay${open ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={app.closeNotifications}
            style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}
          >
            <Icons.chevD size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="h-display" style={{ fontSize: 19 }}>Notifications</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{items.length ? `${items.length} thing${items.length === 1 ? '' : 's'} to look at` : 'Nudges & alerts'}</div>
          </div>
        </div>
      </div>

      <div className="ledger-scroll">
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 30px', fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 10 }}><Icons.check size={28} color="var(--sage)" /></div>
            All clear — nothing needs your attention right now.
          </div>
        ) : (
          <div style={{ margin: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((n: NotifItem) => {
              const Ico = Icons[n.icon];
              const tone = TONE[n.tone];
              return (
                <div key={n.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span className="icon-bub" style={{ background: tone.tint, color: tone.color, width: 36, height: 36, borderRadius: 11, flexShrink: 0 }}><Ico size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.45 }}>{n.body}</div>
                    {n.action && (
                      <button className="chip-btn" style={{ marginTop: 9, padding: '5px 11px', fontSize: 11.5 }} onClick={() => run(n.action)}>
                        {n.actionLabel || 'Open'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
