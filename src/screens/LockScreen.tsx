// Penny — biometric lock. When enabled, the app launches locked and re-locks on
// resume; the only way in is biometrics (no PIN). A manual button re-prompts in
// case the sheet didn't appear automatically.
import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { LS } from '../lib/data';
import { authenticate, biometryAvailable } from '../lib/biometric';
import { AgentAvatar } from '../components/Avatar';
import { Icons } from '../components/Icons';

const readBioLock = () => LS.read<boolean>('bioLock', false);

export function BiometricGate() {
  const [locked, setLocked] = useState(() => readBioLock());
  const [busy, setBusy] = useState(false);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    if (await biometryAvailable()) {
      const ok = await authenticate('Unlock Penny');
      setBusy(false);
      if (ok) setLocked(false);
    } else {
      // No biometric hardware/enrollment (or web preview). We never fall back to a
      // PIN, so there's nothing to gate against — let the user in.
      setBusy(false);
      setLocked(false);
    }
  }, []);

  // Auto-prompt on native whenever we (re)lock; on web we wait for the manual tap.
  // Deferred so the effect body itself doesn't trigger a synchronous state update.
  useEffect(() => {
    if (!(locked && Capacitor.isNativePlatform())) return;
    const t = setTimeout(() => { void tryUnlock(); }, 0);
    return () => clearTimeout(t);
  }, [locked, tryUnlock]);

  // Re-lock when the app returns to the foreground.
  useEffect(() => {
    let remove: (() => void) | undefined;
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && readBioLock()) setLocked(true);
    }).then((h) => { remove = () => h.remove(); });
    return () => remove?.();
  }, []);

  if (!locked) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 30 }}>
      <AgentAvatar size={92} thinking={busy} />
      <div style={{ textAlign: 'center' }}>
        <div className="h-display" style={{ fontSize: 24 }}>Penny is locked</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, marginTop: 6 }}>Unlock with your fingerprint or face.</div>
      </div>
      <button
        className="xp-save"
        disabled={busy}
        style={{ borderRadius: 14, padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 9, opacity: busy ? 0.6 : 1 }}
        onClick={() => void tryUnlock()}
      >
        <Icons.shield size={17} /> {busy ? 'Waiting…' : 'Unlock'}
      </button>
    </div>
  );
}
