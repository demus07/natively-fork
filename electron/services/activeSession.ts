import type { SessionProviders } from './types';

export interface ActiveSessionState {
  sessionId: string;
  createdAt: number;
  providerLlm: string;
  providerStt: string;
}

let activeSession: ActiveSessionState | null = null;

export function setActiveSession(session: ActiveSessionState): void {
  activeSession = session;
}

export function getActiveSession(): ActiveSessionState | null {
  return activeSession;
}

export function clearActiveSession(): void {
  activeSession = null;
}

export function hasActiveSession(): boolean {
  return activeSession !== null;
}

export function toSessionProviders(session: ActiveSessionState): SessionProviders {
  return {
    llm: session.providerLlm,
    stt: session.providerStt
  };
}
