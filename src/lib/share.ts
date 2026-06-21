// Penny — receive files/text shared INTO the app from Android's share sheet.
// Uses the send-intent plugin; reads the shared content URI to base64 so it can
// be handed to the chat as a pending attachment.
import { Capacitor } from '@capacitor/core';
import type { PickedFile, PickedImage } from './media';

export interface SharedPayload {
  text?: string;
  image?: PickedImage;
  file?: PickedFile;
}

function fileName(url: string, fallback: string): string {
  try {
    const clean = decodeURIComponent(url).split('?')[0];
    const last = clean.split('/').pop() || '';
    return last && last.includes('.') ? last : fallback;
  } catch {
    return fallback;
  }
}

/** Check whether the app was launched/resumed via a share, and normalize the payload. */
export async function checkShared(): Promise<SharedPayload | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { SendIntent } = await import('send-intent');
    const res = await SendIntent.checkSendIntentReceived();
    if (!res || (!res.url && !res.title && !res.description)) {
      try { SendIntent.finish(); } catch { /* ignore */ }
      return null;
    }

    const type = (res.type || '').toLowerCase();
    const url = res.url ? decodeURIComponent(res.url) : '';
    const isFileUri = /^(content:|file:|\/)/i.test(url);

    // Plain text or a shared web link → drop into the composer as text.
    if (!isFileUri || type.startsWith('text/')) {
      const text = (url && !isFileUri ? url : '') || res.description || res.title || '';
      try { SendIntent.finish(); } catch { /* ignore */ }
      return text ? { text } : null;
    }

    // A file: read its bytes to base64.
    const { Filesystem } = await import('@capacitor/filesystem');
    const read = await Filesystem.readFile({ path: url });
    const base64 = typeof read.data === 'string' ? read.data : '';
    const mime = type || 'application/octet-stream';
    try { SendIntent.finish(); } catch { /* ignore */ }
    if (!base64) return null;

    if (mime.startsWith('image/')) {
      return { image: { base64, mime, dataUrl: `data:${mime};base64,${base64}` } };
    }
    return { file: { base64, mime, name: res.title || fileName(url, 'shared-file'), size: 0 } };
  } catch {
    return null;
  }
}
