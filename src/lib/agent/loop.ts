// Penny Agent v2 — the orchestration loop. route → lean (one-shot) or full
// (autonomous multi-round). Pure: the app injects the data driver + confirm + calls.
import { routeMessage } from './router';
import { runOps, resultsForModel, INPUT_COLUMNS, type AgentData, type ConfirmFn } from './executor';
import { agentCall, leanCall } from '../anthropic';
import type { AgentEnvelope, LeanResult, Op, OpResult } from '../types';

const MAX_ROUNDS = 6;

export interface AgentMsg { role: 'user' | 'assistant'; content: string }
export interface AgentRun {
  text: string;
  trail: AgentMsg[];        // prior turns (memory: recent window)
  leanBlock: string;
  fullBlock: string;
  data: AgentData;
  confirm: ConfirmFn;
}
export interface AgentTurn {
  reply: string;
  writes: { op: Op; result: OpResult }[]; // for UI cards (expense/account adds)
  close: boolean;
  live: boolean;            // false = offline/parse fallback
}

export async function runAgent(run: AgentRun): Promise<AgentTurn> {
  const route = routeMessage(run.text);

  // --- lean: one call, one (or several) INSERT, no round-trip ---
  if (route === 'lean') {
    let lean: LeanResult | null = null;
    try { lean = await leanCall(run.leanBlock, run.text); } catch { /* fall through */ }
    if (lean && !lean.more && Array.isArray(lean.add) && lean.add.length) {
      const ops: Op[] = lean.add.map((row) => ({ do: 'add', table: 'txn', values: row as unknown[] }));
      const results = await runOps(ops, run.data, run.confirm);
      return { reply: lean.reply || 'Logged.', writes: ops.map((op, i) => ({ op, result: results[i] })), close: false, live: true };
    }
    // lean returned more:true (or failed) → escalate to full
  }

  // --- full: autonomous agent loop ---
  const messages: AgentMsg[] = [...run.trail, { role: 'user', content: run.text }];
  const writes: { op: Op; result: OpResult }[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let env: AgentEnvelope | null = null;
    try { env = await agentCall(run.fullBlock, messages); } catch { /* below */ }
    if (!env) return { reply: '', writes, close: false, live: false };

    if (env.ops && env.ops.length) {
      const results = await runOps(env.ops, run.data, run.confirm);
      if (env.state === 'await') {
        messages.push({ role: 'assistant', content: JSON.stringify({ ops: env.ops, state: 'await' }) });
        messages.push({ role: 'user', content: `RESULTS:\n${resultsForModel(env.ops, results)}\n\nContinue.` });
        continue;
      }
      env.ops.forEach((op, i) => { if (op.do !== 'get') writes.push({ op, result: results[i] }); });
    }

    if (env.state === 'await') {
      // model asked to wait but gave no ops — nudge once
      messages.push({ role: 'assistant', content: JSON.stringify(env) });
      messages.push({ role: 'user', content: 'No ops were provided. Continue or ask.' });
      continue;
    }
    return { reply: env.reply || (writes.length ? 'Done.' : '…'), writes, close: env.state === 'close', live: true };
  }
  return { reply: writes.length ? 'Done.' : "Let's try that again — could you rephrase?", writes, close: false, live: true };
}

export { INPUT_COLUMNS };
