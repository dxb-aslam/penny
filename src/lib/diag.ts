// Penny — diagnostics + data export.
//
// Captures the chat transcript and an LLM event log (which model/path each call
// used, live vs. fallback, latency, errors), persists them to localStorage, and
// mirrors everything to `penny-export.json` on app-external storage so a debug
// build can be pulled with:
//   adb pull /sdcard/Android/data/ai.penny.app/files/penny-export.json
import { Capacitor } from '@capacitor/core';
import { LS } from './data';

export interface DiagEvent {
  t: number; // epoch ms
  type: string;
  [k: string]: unknown;
}

const MAX_EVENTS = 1000;

function readEvents(): DiagEvent[] {
  return LS.read<DiagEvent[]>('diag', []);
}

export function logEvent(type: string, data: Record<string, unknown> = {}): void {
  try {
    const evts = readEvents();
    evts.push({ t: Date.now(), type, ...data });
    LS.write('diag', evts.slice(-MAX_EVENTS));
    scheduleExport();
  } catch {
    /* never let diagnostics break the app */
  }
}

export interface PennyNote {
  t: number;
  iso: string;
  note: string;
  context?: string; // surrounding conversation, so a vague "fix this" still carries what it referred to
}

/** Record a developer note / bug report / feature request the user dictated to Penny. */
export function logNote(note: string, context?: string): void {
  try {
    const notes = LS.read<PennyNote[]>('notes', []);
    notes.push({ t: Date.now(), iso: new Date().toISOString(), note, context: context || undefined });
    LS.write('notes', notes.slice(-300));
    logEvent('note', { note, context });
  } catch {
    /* ignore */
  }
}

/** Persist the chat transcript (base64 image data stripped to keep it small). */
export function logChat(msgs: unknown[]): void {
  try {
    const slim = (msgs as Array<Record<string, unknown>>).map((m) => {
      const data = (m.data as Record<string, unknown>) || undefined;
      let cleanData = data;
      if (data && 'dataUrl' in data) {
        cleanData = { ...data, dataUrl: '[image omitted]' };
      }
      return { id: m.id, role: m.role, type: m.type, text: m.text, data: cleanData };
    });
    LS.write('chatLog', slim);
    scheduleExport();
  } catch {
    /* ignore */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleExport(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flushExport();
  }, 1500);
}

export function buildSnapshot() {
  return {
    exportedAt: new Date().toISOString(),
    platform: Capacitor.getPlatform(),
    appVersion: 'penny-debug',
    state: {
      userTxns: LS.read('userTxns', []),
      userAccounts: LS.read('userAccounts', []),
      grocery: LS.read('grocery', []),
      subsDecided: LS.read('subsDecided', {}),
      currency: LS.read('currency', 'AED'),
      digestCache: LS.read('digestCache', null),
    },
    notes: LS.read('notes', []),
    chatLog: LS.read('chatLog', []),
    diag: readEvents(),
    llmlog: LS.read('llmlog', []),
  };
}

export async function flushExport(): Promise<void> {
  const json = JSON.stringify(buildSnapshot(), null, 2);
  if (!Capacitor.isNativePlatform()) return; // web: data already in localStorage
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: 'penny-export.json',
      data: json,
      directory: Directory.External,
      encoding: Encoding.UTF8,
    });
  } catch {
    /* ignore — export is best-effort */
  }
}
