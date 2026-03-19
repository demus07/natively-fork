import { useEffect, useMemo, useState } from 'react';
import HelperSettingsView from './components/dashboard/HelperSettingsView';
import EmptyState from './components/dashboard/EmptyState';
import SessionDetail from './components/dashboard/SessionDetail';
import Sidebar from './components/dashboard/Sidebar';
import { dashboardClient } from './services/dashboardClient';
import type { DashboardSession, DashboardSessionSummary, DashboardSummary, Settings } from './types';

type SidebarMode = 'sessions' | 'settings';

function getRequestedSessionId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('sessionId');
}

export default function DashboardApp() {
  const [sessions, setSessions] = useState<DashboardSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(getRequestedSessionId());
  const [selectedSession, setSelectedSession] = useState<DashboardSession | null>(null);
  const [mode, setMode] = useState<SidebarMode>('sessions');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const offSummary = dashboardClient.onSessionSummaryUpdate(({ sessionId, summary }) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, hasSummary: true } : session
        )
      );
      setSelectedSession((current) =>
        current && current.id === sessionId
          ? { ...current, summary: summary as DashboardSummary, hasSummary: true }
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

  if (error) {
    return <div className="dashboard-empty-state"><h2>Dashboard error</h2><p>{error}</p></div>;
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
      />

      <main className="dashboard-main">
        {mode === 'settings' && settings ? (
          <HelperSettingsView settings={settings} onSettingsSaved={setSettings} />
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : selectedSession ? (
          <SessionDetail session={selectedSession} onSessionPatched={patchSelectedSession} />
        ) : selectedSummary ? (
          <div className="dashboard-empty-state"><h2>Loading session…</h2></div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
