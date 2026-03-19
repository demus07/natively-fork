import { DASHBOARD_WEB_CONFIG } from '../../src/config';
import type { DashboardSessionSummary, IPCResult } from '../types';

const API_BASE = `http://${DASHBOARD_WEB_CONFIG.host}:${DASHBOARD_WEB_CONFIG.port}${DASHBOARD_WEB_CONFIG.apiBasePath}`;

async function parseResponse<T>(response: Response): Promise<IPCResult<T>> {
  const payload = (await response.json()) as IPCResult<T>;
  if (response.ok) {
    return payload;
  }

  return {
    ok: false,
    error: payload.error ?? {
      code: 'HTTP_ERROR',
      message: `Request failed with status ${response.status}`
    }
  };
}

export const dashboardActions = {
  async launchOverlay(): Promise<IPCResult<null>> {
    const response = await fetch(`${API_BASE}/overlay/launch`, {
      method: 'POST'
    });
    return parseResponse<null>(response);
  },

  async deleteSession(sessionId: string): Promise<IPCResult<null>> {
    const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
    return parseResponse<null>(response);
  },

  async renameSession(sessionId: string, title: string): Promise<IPCResult<DashboardSessionSummary>> {
    const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title })
    });
    return parseResponse<DashboardSessionSummary>(response);
  },

  async summarizeSession(sessionId: string): Promise<IPCResult<null>> {
    const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/summarize`, {
      method: 'POST'
    });
    return parseResponse<null>(response);
  }
};
