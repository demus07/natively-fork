export interface ActionItem {
  text: string;
  owner: string | null;
}

export interface SummaryJson {
  overview: string;
  topics: string[];
  action_items: ActionItem[];
  decisions: string[];
  follow_ups: string[];
  went_well: string[];
  to_improve: string[];
}

export interface Utterance {
  id?: number;
  sessionId: string;
  startedMs: number;
  endedMs: number;
  text: string;
  isFinal: boolean;
  source?: 'me' | 'them' | 'unknown';
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  endedAt: number | null;
  durationMs: number | null;
  providerLlm: string;
  providerStt: string;
  hasSummary: boolean;
  status: 'active' | 'completed';
}

export interface Session extends SessionSummary {
  summary: SummaryJson | null;
  transcript: string;
  utterances: Utterance[];
}

export interface SessionProviders {
  llm: string;
  stt: string;
}

export interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

export type IPCResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IPCError };
