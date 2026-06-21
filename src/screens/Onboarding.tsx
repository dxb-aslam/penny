// Penny — first-run onboarding wizard. Shown when the app hasn't been set up
// (fresh install, or after "Clear data"). Collects the basics, then starts.
import { useState } from 'react';
import type { CurrencyCode } from '../lib/types';
import { AgentAvatar } from '../components/Avatar';
import { Icons } from '../components/Icons';
import { useApp } from '../state/AppContext';

const CURRENCIES: CurrencyCode[] = ['AED', 'USD', 'EUR', 'INR'];
const STEPS = 4;

export function Onboarding() {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [cur, setCur] = useState<CurrencyCode>('AED');
  const [key, setKey] = useState('');
  const [openDate, setOpenDate] = useState(() => new Date().toISOString().slice(0, 10));

  if (app.onboarded) return null;

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = () => {
    app.updateProfile({ name: name.trim() || 'there' });
    app.setCurrency(cur);
    try {
      if (key.trim()) localStorage.setItem('penny.apiKey', key.trim());
      // Default opening date for new accounts + the "first use" anchor for Coach's 3-day gate.
      localStorage.setItem('penny.openingDate', JSON.stringify(openDate));
      localStorage.setItem('penny.firstUse', JSON.stringify(new Date().toISOString().slice(0, 10)));
    } catch {
      /* ignore */
    }
    app.completeOnboarding();
  };

  const canContinue = step === 1 ? name.trim().length > 0 : true;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* progress dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: 'calc(env(safe-area-inset-top, 0px) + 22px) 0 8px' }}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <span key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--line-strong)', transition: 'all 0.3s' }} />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column' }}>
        {step === 0 && (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}><AgentAvatar size={86} /></div>
            <div className="h-display" style={{ fontSize: 30, lineHeight: 1.15 }}>Meet Penny</div>
            <div style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 14, maxWidth: 320, marginInline: 'auto' }}>
              Your money, in plain language. Just tell Penny what you spent — she logs it, tracks your accounts, debts and savings, and keeps your financial health in view.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginTop: 18 }}>Takes about a minute to set up.</div>
          </div>
        )}

        {step === 1 && (
          <div style={{ margin: 'auto 0' }}>
            <div className="h-display" style={{ fontSize: 25 }}>What should I call you?</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6, marginBottom: 22 }}>And the currency you think in.</div>

            <div className="eyebrow" style={{ marginBottom: 6 }}>Your name</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aslam"
              className="es-input"
              style={{ width: '100%', fontSize: 16, padding: '13px 15px' }}
            />

            <div className="eyebrow" style={{ margin: '20px 0 8px' }}>Display currency</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {CURRENCIES.map((c) => (
                <button key={c} className="chip-btn" style={{ flex: 1, padding: '11px 0', justifyContent: 'center', fontWeight: 800, ...(cur === c ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }} onClick={() => setCur(c)}>{c}</button>
              ))}
            </div>

            <div className="eyebrow" style={{ margin: '20px 0 8px' }}>Tracking from</div>
            <input
              type="date"
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
              className="es-input"
              style={{ width: '100%', fontSize: 15, padding: '13px 15px' }}
            />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Your accounts' opening balances will be dated here (you can change it per account).</div>
          </div>
        )}

        {step === 2 && (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 54, height: 54, borderRadius: 18 }}><Icons.spark size={26} /></span>
            </div>
            <div className="h-display" style={{ fontSize: 25, textAlign: 'center' }}>Connect Penny's brain</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 10, marginBottom: 20, textAlign: 'center' }}>
              Paste your Anthropic API key to power the AI chat. It stays on your device. You can skip this and add it later in Settings — the app still works for manual entry.
            </div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Anthropic API key (optional)</div>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              className="es-input"
              style={{ width: '100%', fontSize: 14, padding: '13px 15px' }}
            />
          </div>
        )}

        {step === 3 && (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <span style={{ width: 76, height: 76, borderRadius: 38, background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-card)' }}><Icons.check size={36} /></span>
            </div>
            <div className="h-display" style={{ fontSize: 28 }}>You're all set{name.trim() ? `, ${name.trim()}` : ''}</div>
            <div style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 12, maxWidth: 320, marginInline: 'auto' }}>
              Add your accounts and start logging. Try saying <b>“coffee 18”</b> or tap <b>Add</b> for a manual entry. Set a savings account in Coach to track your milestones.
            </div>
          </div>
        )}
      </div>

      {/* footer controls */}
      <div style={{ padding: '14px 24px calc(env(safe-area-inset-bottom, 0px) + 18px)', display: 'flex', gap: 12, alignItems: 'center' }}>
        {step > 0 ? (
          <button className="chip-btn" style={{ padding: '13px 18px' }} onClick={back}>Back</button>
        ) : <span style={{ flex: 0 }} />}
        {step < STEPS - 1 ? (
          <button className="xp-save" disabled={!canContinue} style={{ flex: 1, borderRadius: 14, padding: 14, opacity: canContinue ? 1 : 0.5 }} onClick={next}>
            {step === 0 ? 'Get started' : step === 2 && !key.trim() ? 'Skip for now' : 'Continue'}
          </button>
        ) : (
          <button className="xp-save" style={{ flex: 1, borderRadius: 14, padding: 14 }} onClick={finish}>Start using Penny</button>
        )}
      </div>
    </div>
  );
}
