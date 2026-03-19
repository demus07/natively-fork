import type { DashboardSessionSummary } from '../../types';

interface SidebarProps {
  sessions: DashboardSessionSummary[];
  selectedSessionId: string | null;
  showHelperSettings: boolean;
  onSelectSession: (sessionId: string) => void;
  onSelectHelperSettings: () => void;
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) {
    return '0m';
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function Sidebar({
  sessions,
  selectedSessionId,
  showHelperSettings,
  onSelectSession,
  onSelectHelperSettings
}: SidebarProps) {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar-header">
        <div className="dashboard-sidebar-brand">
          <span className="dashboard-sidebar-brand-mark">N</span>
          <div>
            <h1 className="dashboard-title">Natively</h1>
            <p className="dashboard-sidebar-subtitle">Session review</p>
          </div>
        </div>

        <button type="button" className="dashboard-sidebar-cta" disabled>
          New session
        </button>
      </div>

      <div className="dashboard-sidebar-section">
        <p className="dashboard-sidebar-section-label">Workspace</p>
        <button
          type="button"
          className={`dashboard-session-item dashboard-sidebar-link ${showHelperSettings ? 'dashboard-session-item-active' : ''}`}
          onClick={onSelectHelperSettings}
        >
          <div className="dashboard-session-item-title">Helper Settings</div>
          <div className="dashboard-session-item-meta">
            <span>Providers</span>
            <span>Preferences</span>
          </div>
        </button>
      </div>

      <div className="dashboard-sidebar-section dashboard-sidebar-section-fill">
        <p className="dashboard-sidebar-section-label">Sessions</p>

        <div className="dashboard-session-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`dashboard-session-item ${selectedSessionId === session.id && !showHelperSettings ? 'dashboard-session-item-active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="dashboard-session-item-title">{session.title}</div>
              <div className="dashboard-session-item-meta">
                <span>{formatDate(session.createdAt)}</span>
                <span>{formatDuration(session.durationMs)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
