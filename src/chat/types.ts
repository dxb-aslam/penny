// Penny — chat message model
import type { ModelId, ParsedAccount, ParsedExpense, RawLedgerFilters, SuggestionAction } from '../lib/types';

export type MsgRole = 'user' | 'agent';

export type MsgType =
  | 'text'
  | 'chips'
  | 'chart'
  | 'account'
  | 'sms'
  | 'file'
  | 'receipt'
  | 'analysis'
  | 'expense';

export interface AnalysisItem {
  n: string;
  a: number;
  nec: number;
  note?: string;
}

export interface ChatMsg {
  id: string;
  role: MsgRole;
  type: MsgType;
  enter?: boolean;
  text?: string;
  data?: {
    // text
    model?: ModelId;
    label?: string;
    // chips
    tag?: string;
    options?: string[];
    picked?: string;
    // suggestive action (tag='suggest'): what the accept-chip does
    suggestAction?: SuggestionAction;
    suggestFilters?: RawLedgerFilters | null;
    // chart
    k?: 'grocery_months' | 'spend_months';
    // account
    account?: ParsedAccount;
    // expense
    expense?: ParsedExpense;
    saved?: boolean;
    live?: boolean;
    flash?: boolean;
    txnId?: string; // the persisted transaction this card logged (auto-saved)
    undone?: boolean; // user tapped Undo → transaction removed
    // analysis
    items?: AnalysisItem[];
    // receipt preview
    dataUrl?: string;
    // file
    fileSize?: string;
  };
}
