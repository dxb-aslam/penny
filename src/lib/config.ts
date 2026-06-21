// Penny — local config defaults.
//
// BYOK: no secrets are committed here. The user enters their own Anthropic key
// (and Supabase creds) inside the app — onboarding or Settings — and it's stored
// ONLY on their device (localStorage 'penny.apiKey'), read first by getApiKey().
// These constants are blank fallbacks; the app runs in demo mode until a key is added.
//
// ⚠️ Keep this file secret-free — never hard-code real keys here.

export interface PennyConfig {
  /** Anthropic API key — leave blank; the user adds their own in-app (on-device only). */
  anthropicApiKey: string;
  /** Supabase (shared Space sync). Leave blank; entered in-app when used. */
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const PENNY_CONFIG: PennyConfig = {
  anthropicApiKey: '', // user enters their own key in-app (stored on device only)
  supabaseUrl: '',
  supabaseAnonKey: '',
};

// Runtime credentials: a key the user entered in-app (localStorage) overrides the
// hard-coded config. (For the public release this moves to Keychain/Keystore.)
function lsGet(k: string): string {
  try {
    return (localStorage.getItem(k) || '').trim();
  } catch {
    return '';
  }
}

export function getApiKey(): string {
  return lsGet('penny.apiKey') || PENNY_CONFIG.anthropicApiKey.trim();
}

export function hasAnthropicKey(): boolean {
  return getApiKey().length > 0;
}

export interface SupabaseCreds {
  url: string;
  anonKey: string;
}

export function getSupabase(): SupabaseCreds {
  const url = lsGet('penny.supabaseUrl') || PENNY_CONFIG.supabaseUrl.trim();
  const anonKey = lsGet('penny.supabaseAnonKey') || PENNY_CONFIG.supabaseAnonKey.trim();
  return { url, anonKey };
}

export function hasSupabase(): boolean {
  const s = getSupabase();
  return s.url.length > 0 && s.anonKey.length > 0;
}
