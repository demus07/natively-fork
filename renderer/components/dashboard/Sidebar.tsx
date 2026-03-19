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
        <div>
          <p className="dashboard-eyebrow">Review</p>
          <h1 className="dashboard-title">Sessions</h1>
        </div>
      </div>

      <button
        type="button"
        className={`dashboard-sidebar-link ${showHelperSettings ? 'dashboard-sidebar-link-active' : ''}`}
        onClick={onSelectHelperSettings}
      >
        Helper Settings
      </button>

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
    </aside>
  );
}
