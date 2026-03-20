import { useEffect, useMemo, useState } from 'react';
import EmptyState from './components/dashboard/EmptyState';
import HelperSettingsView from './components/dashboard/HelperSettingsView';
import SessionDetail from './components/dashboard/SessionDetail';
import Sidebar from './components/dashboard/Sidebar';
import ToastContainer from './components/dashboard/ToastContainer';
import { useToast } from './hooks/useToast';
import { dashboardActions } from './services/dashboardActions';
import { dashboardClient } from './services/dashboardClient';
import type { DashboardSession, DashboardSessionSummary, DashboardSummary, Settings } from './types';

type SidebarMode = 'sessions' | 'settings';

function getRequestedSessionId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('sessionId');
}

function getRequestedMode(): SidebarMode {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'settings' ? 'settings' : 'sessions';
}

export default function DashboardApp() {
  const [sessions, setSessions] = useState<DashboardSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(getRequestedSessionId());
  const [selectedSession, setSelectedSession] = useState<DashboardSession | null>(null);
  const [mode, setMode] = useState<SidebarMode>(getRequestedMode());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toasts, pushToast, removeToast } = useToast();

  useEffect(() => {
    void dashboardClient.getSettings().then((result) => {
      if (!result.ok || !result.data) {
        setError(result.error?.message || 'Failed to load settings');
        return;
      }
      setSettings(result.data);
    });
  }, []);

  useEffect(() => {
    void dashboardClient.listSessions().then((result) => {
      if (!result.ok || !result.data) {
        setError(result.error?.message || 'Failed to load sessions');
        return;
      }

      setSessions(result.data);
      if (!selectedSessionId && result.data[0]) {
        setSelectedSessionId(result.data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedSessionId || mode !== 'sessions') {
      return;
    }

    setSelectedSession(null);

    void dashboardClient.getSession(selectedSessionId).then((result) => {
      if (!result.ok || !result.data) {
        setError(result.error?.message || 'Failed to load session');
        return;
      }
      setSelectedSession(result.data);
    });
  }, [selectedSessionId, mode]);

  useEffect(() => {
    const offSummary = dashboardClient.onSessionSummaryUpdate(({ sessionId, summary, title }) => {
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? { ...session, hasSummary: true, title } : session))
      );
      setSelectedSession((current) =>
        current && current.id === sessionId
          ? { ...current, title, summary: summary as DashboardSummary, hasSummary: true }
          : current
      );
    });

    return () => {
      offSummary();
    };
  }, []);

  const selectedSummary = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const patchSelectedSession = (next: DashboardSession) => {
    setSelectedSession(next);
    setSessions((current) =>
      current.map((session) =>
        session.id === next.id ? { ...session, title: next.title, hasSummary: next.hasSummary } : session
      )
    );
  };

  const handleLaunchOverlay = async () => {
    const result = await dashboardActions.launchOverlay();
    if (!result.ok) {
      pushToast('Could not reach the Sync. app. Make sure it is running.', 'error');
      return;
    }

    pushToast('Overlay launch requested.');
  };

  const handleDeleteSession = async (sessionId: string) => {
    const currentSessions = sessions;
    const nextSessions = currentSessions.filter((session) => session.id !== sessionId);
    const deletedWasSelected = selectedSessionId === sessionId;

    setSessions(nextSessions);

    if (deletedWasSelected) {
      setSelectedSession(null);
      setSelectedSessionId(nextSessions[0]?.id ?? null);
      if (!nextSessions.length) {
        setMode('sessions');
      }
    }

    const result = await dashboardActions.deleteSession(sessionId);
    if (!result.ok) {
      setSessions(currentSessions);
      if (deletedWasSelected) {
        setSelectedSessionId(sessionId);
      }
      pushToast(result.error?.message || 'Could not delete the session.', 'error');
      return;
    }

    pushToast('Deleted');
  };

  if (error) {
    return (
      <div className="dashboard-shell">
        <main className="dashboard-main">
          <div className="dashboard-empty-state">
            <h2>Dashboard error</h2>
            <p>{error}</p>
          </div>
        </main>
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <Sidebar
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        showHelperSettings={mode === 'settings'}
        onSelectSession={(sessionId) => {
          setMode('sessions');
          setSelectedSessionId(sessionId);
        }}
        onSelectHelperSettings={() => setMode('settings')}
        onLaunchOverlay={handleLaunchOverlay}
        onDeleteSession={handleDeleteSession}
      />

      <main className="dashboard-main">
        {mode === 'settings' && !settings ? (
          <div className="dashboard-empty-state">
            <h2>Loading settings…</h2>
          </div>
        ) : mode === 'settings' && settings ? (
          <HelperSettingsView settings={settings} onSettingsSaved={setSettings} />
        ) : sessions.length === 0 ? (
          <EmptyState onLaunchOverlay={() => void handleLaunchOverlay()} />
        ) : selectedSession ? (
          <SessionDetail session={selectedSession} onSessionPatched={patchSelectedSession} onToast={pushToast} />
        ) : selectedSummary ? (
          <div className="dashboard-empty-state">
            <h2>Loading session…</h2>
          </div>
        ) : (
          <EmptyState onLaunchOverlay={() => void handleLaunchOverlay()} />
        )}
      </main>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
