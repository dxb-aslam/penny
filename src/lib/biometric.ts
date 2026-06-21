// Penny — biometric gate. Thin, guarded wrapper around the native plugin so the
// web build never breaks if it's unavailable. Always biometric, no PIN fallback.
import { Capacitor } from '@capacitor/core';

/** True only on a native device with enrolled biometrics. */
export async function biometryAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const r = await BiometricAuth.checkBiometry();
    return !!r.isAvailable;
  } catch {
    return false;
  }
}

/** Prompt the OS biometric sheet. Resolves true on success, false on cancel/fail/unavailable. */
export async function authenticate(reason = 'Unlock Penny'): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: false, // biometric only — no device PIN/pattern
      androidTitle: 'Unlock Penny',
      androidSubtitle: "Verify it's you",
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}
