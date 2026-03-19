import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { sessionService } from '../services/SessionService';
import type { IPCError, IPCResult, Session, SessionProviders, SessionSummary, SummaryJson } from '../services/types';

let handlersRegistered = false;

function toIPCError(error: unknown): IPCError {
  if (error instanceof Error) {
    return {
      code: 'SESSION_ERROR',
      message: error.message
    };
  }

  return {
    code: 'SESSION_ERROR',
    message: 'Unknown session error',
    details: error
  };
}

function withIPCResult<T>(task: Promise<T>): Promise<IPCResult<T>> {
  return task
    .then((data) => ({ ok: true, data }) as IPCResult<T>)
    .catch((error: unknown) => ({ ok: false, error: toIPCError(error) }) as IPCResult<T>);
}

export function initSessionHandlers(): void {
  if (handlersRegistered) {
    return;
  }

  handlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.SESSION_START, async (_event, providers: SessionProviders) =>
    withIPCResult<Session>(sessionService.startSession(providers))
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_END, async (_event, sessionId: string) =>
    withIPCResult<Session>(sessionService.endSession(sessionId))
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, async (_event, sessionId: string) =>
    withIPCResult<Session>(sessionService.getSession(sessionId))
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, async (_event, limit?: number) =>
    withIPCResult<SessionSummary[]>(sessionService.getSessions(limit))
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_RENAME, async (_event, payload: { sessionId: string; title: string }) =>
    withIPCResult<void>(sessionService.renameSession(payload.sessionId, payload.title))
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SUMMARY_UPDATE,
    async (_event, payload: { sessionId: string; summary: SummaryJson }) =>
      withIPCResult<void>(sessionService.updateSummary(payload.sessionId, payload.summary))
  );
}
