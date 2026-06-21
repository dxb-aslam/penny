// Penny — Space invite encode/decode + QR. An invite carries the Supabase URL +
// anon key so a second device (the wife's phone) joins the same Space by scanning.
import QRCode from 'qrcode';

export interface SpaceInvite {
  t: 'penny-space';
  url: string;
  anonKey: string;
}

export function encodeInvite(url: string, anonKey: string): string {
  const payload: SpaceInvite = { t: 'penny-space', url, anonKey };
  return JSON.stringify(payload);
}

/** Accepts either the raw invite JSON or a bare "url|anonKey" string. */
export function decodeInvite(raw: string): SpaceInvite | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    if (o && o.t === 'penny-space' && o.url && o.anonKey) {
      return { t: 'penny-space', url: String(o.url), anonKey: String(o.anonKey) };
    }
  } catch {
    /* not JSON — try the pipe form */
  }
  const m = s.split('|');
  if (m.length === 2 && /^https?:\/\//.test(m[0])) {
    return { t: 'penny-space', url: m[0].trim(), anonKey: m[1].trim() };
  }
  return null;
}

export async function inviteQrDataUrl(url: string, anonKey: string): Promise<string> {
  return QRCode.toDataURL(encodeInvite(url, anonKey), {
    margin: 1,
    width: 320,
    color: { dark: '#2b2b28', light: '#fcfaf2' },
  });
}
