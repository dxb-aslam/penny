// Penny — the single "Menu" surface. The bottom bar stays minimal (Home · Chat ·
// Add · Menu); every other section lives here as a flat, easily-extensible list so
// navigation never gets confused by in-page toggles or hidden subsections.
import { Icons } from '../components/Icons';
import type { IconName } from '../components/Icons';
import { useApp } from '../state/AppContext';
import type { AppApi } from '../state/AppContext';

interface MenuRow {
  id: string;
  label: string;
  sub: (app: AppApi) => string;
  icon: IconName;
  go: (app: AppApi) => void;
}

// Ordered top→bottom. Profile first, Coach next, then everything else.
// Add new sections here — one row is all it takes.
const ROWS: MenuRow[] = [
  { id: 'profile', label: 'Profile', icon: 'user', sub: (a) => a.profile.name || 'You', go: (a) => a.openProfile() },
  { id: 'coach', label: 'Coach', icon: 'leaf', sub: () => 'Insights & nudges', go: (a) => a.go('coach') },
  { id: 'accounts', label: 'Accounts', icon: 'wallet', sub: (a) => `${a.accounts.length} accounts & cards`, go: (a) => a.go('accounts') },
  { id: 'track', label: 'Track', icon: 'chart', sub: () => 'EMIs · recurring · shopping', go: (a) => a.go('track') },
  { id: 'ledger', label: 'Transactions', icon: 'filetext', sub: () => 'Full ledger · filters · calendar', go: (a) => a.openLedger() },
  { id: 'money', label: 'Money map', icon: 'coins', sub: () => 'Owed · owing · upcoming', go: (a) => a.openMoney() },
  { id: 'categories', label: 'Categories', icon: 'grid', sub: (a) => `${a.categories.length} categories & subcategories`, go: (a) => a.openSetup('categories') },
  { id: 'setup', label: 'Manage data', icon: 'dots', sub: () => 'Edit every table · setup hub', go: (a) => a.openSetup() },
  { id: 'settings', label: 'Settings', icon: 'shield', sub: () => 'AI key · sync · usage & cost', go: (a) => a.openSettings() },
];

export function MenuPanel() {
  const app = useApp();
  const open = app.menuOpen;

  const pick = (row: MenuRow) => {
    app.closeMenu();
    row.go(app);
  };

  return (
    <div className={`ledger-overlay${open ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={app.closeMenu}
            style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}
          >
            <Icons.chevD size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="h-display" style={{ fontSize: 19 }}>Menu</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>All of Penny, one tap away</div>
          </div>
        </div>
      </div>

      <div className="ledger-scroll">
        <div style={{ margin: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ROWS.map((r) => {
            const Ico = Icons[r.icon];
            return (
              <button
                key={r.id}
                className="card"
                style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', border: 0, textAlign: 'left' }}
                onClick={() => pick(r)}
              >
                <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 38, height: 38, borderRadius: 12 }}><Ico size={18} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{r.sub(app)}</span>
                </span>
                <Icons.chevR size={15} color="var(--muted)" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
