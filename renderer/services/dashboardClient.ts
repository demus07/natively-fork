import { DASHBOARD_WEB_CONFIG } from '../../src/config';
import type {
  DashboardSession,
  DashboardSessionSummary,
  DashboardSummary,
  IPCResult,
  Settings
} from '../types';

const API_BASE = `http://${DASHBOARD_WEB_CONFIG.host}:${DASHBOARD_WEB_CONFIG.port}${DASHBOARD_WEB_CONFIG.apiBasePath}`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<IPCResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    });

    const payload = (await response.json()) as IPCResult<T>;
    if (!response.ok) {
      return {
        ok: false,
        error: payload.error || {
          code: 'HTTP_ERROR',
          message: `Request failed with HTTP ${response.status}`
        }
      };
    }

    return payload;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed'
      }
    };
  }
}

export const dashboardClient = {
  listSessions(limit?: number): Promise<IPCResult<DashboardSessionSummary[]>> {
    const query = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';
    return requestJson<DashboardSessionSummary[]>(`/sessions${query}`);
  },

  getSession(sessionId: string): Promise<IPCResult<DashboardSession>> {
    return requestJson<DashboardSession>(`/sessions/${encodeURIComponent(sessionId)}`);
  },

  renameSession(sessionId: string, title: string): Promise<IPCResult<null>> {
    return requestJson<null>(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    });
  },

  getSettings(): Promise<IPCResult<Settings>> {
    return requestJson<Settings>('/settings');
  },

  saveSettings(settings: Settings): Promise<IPCResult<Settings>> {
    return requestJson<Settings>('/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  onSessionSummaryUpdate(callback: (payload: { sessionId: string; summary: DashboardSummary }) => void): () => void {
    const source = new EventSource(`${API_BASE}/events`);
    const handler = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { sessionId: string; summary: DashboardSummary };
        callback(payload);
      } catch {
        // Ignore malformed event data.
      }
    };

    source.addEventListener('session-summary-update', handler as EventListener);
    return () => {
      source.removeEventListener('session-summary-update', handler as EventListener);
      source.close();
    };
  }
};
