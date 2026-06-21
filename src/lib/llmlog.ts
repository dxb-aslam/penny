// Penny — raw LLM call log: every Claude request with full context, token
// counts, model, cost, and the output. Viewable in Settings, clearable, and
// exportable to CSV. This is the meter we use to drive token/cost minimization.
import { LS } from './data';
import type { ModelId } from './types';

// USD per 1,000,000 tokens (input / output). Source: Anthropic pricing.
export const MODEL_PRICES: Record<ModelId, { in: number; out: number }> = {
  haiku: { in: 1.0, out: 5.0 },
  sonnet: { in: 3.0, out: 15.0 },
  opus: { in: 5.0, out: 25.0 },
};

export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface LlmLogEntry {
  t: number;
  iso: string;
  model: ModelId;
  modelId: string;
  label: string; // which call: parse / receipt / statement / digest / crud …
  path: 'direct' | 'proxy' | 'heuristic';
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreate: number;
  costUSD: number;
  ms: number;
  system: string; // the system prompt (may be long)
  input: string; // the user-content sent (images noted as [image])
  output: string; // the model's reply text
  ok: boolean;
  error?: string;
}

const MAX_LOG = 500;

/** Cost in USD for a usage object on a given model (cache-aware). */
export function costOf(model: ModelId, u: LlmUsage): number {
  const p = MODEL_PRICES[model] || MODEL_PRICES.haiku;
  const inTok = u.input_tokens || 0;
  const outTok = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cacheCreate = u.cache_creation_input_tokens || 0;
  // cache reads ~0.1x input, cache writes ~1.25x input
  return (
    (inTok * p.in + outTok * p.out + cacheRead * p.in * 0.1 + cacheCreate * p.in * 1.25) / 1_000_000
  );
}

export function logLlm(e: Omit<LlmLogEntry, 't' | 'iso' | 'costUSD'> & { costUSD?: number }): void {
  try {
    const log = LS.read<LlmLogEntry[]>('llmlog', []);
    const entry: LlmLogEntry = {
      t: Date.now(),
      iso: new Date().toISOString(),
      costUSD: e.costUSD ?? costOf(e.model, { input_tokens: e.inputTokens, output_tokens: e.outputTokens, cache_read_input_tokens: e.cacheRead, cache_creation_input_tokens: e.cacheCreate }),
      ...e,
    };
    log.push(entry);
    LS.write('llmlog', log.slice(-MAX_LOG));
  } catch {
    /* never let logging break a call */
  }
}

export function readLlmLog(): LlmLogEntry[] {
  return LS.read<LlmLogEntry[]>('llmlog', []);
}

export function clearLlmLog(): void {
  LS.write('llmlog', []);
}

export interface LlmLogTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}
export function llmLogTotals(log = readLlmLog()): LlmLogTotals {
  return log.reduce<LlmLogTotals>(
    (acc, e) => ({
      calls: acc.calls + 1,
      inputTokens: acc.inputTokens + (e.inputTokens || 0),
      outputTokens: acc.outputTokens + (e.outputTokens || 0),
      costUSD: acc.costUSD + (e.costUSD || 0),
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 },
  );
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function llmLogCsv(log = readLlmLog()): string {
  const cols: (keyof LlmLogEntry)[] = [
    'iso', 'label', 'path', 'model', 'modelId', 'inputTokens', 'outputTokens', 'cacheRead', 'cacheCreate', 'costUSD', 'ms', 'ok', 'error', 'system', 'input', 'output',
  ];
  const header = cols.join(',');
  const rows = log.map((e) => cols.map((c) => csvCell(e[c])).join(','));
  return [header, ...rows].join('\n');
}
