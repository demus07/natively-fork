import { useMemo, useState } from 'react';
import type { DashboardSessionSummary } from '../../types';

interface SidebarProps {
  sessions: DashboardSessionSummary[];
  selectedSessionId: string | null;
  showHelperSettings: boolean;
  onSelectSession: (sessionId: string) => void;
  onSelectHelperSettings: () => void;
  onLaunchOverlay: () => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
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
  onSelectHelperSettings,
  onLaunchOverlay,
  onDeleteSession
}: SidebarProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const helperSettingsClassName = useMemo(
    () =>
      `dashboard-session-item dashboard-sidebar-link ${showHelperSettings ? 'dashboard-session-item-active dashboard-sidebar-workspace-active' : ''}`,
    [showHelperSettings]
  );

  const handleLaunch = async () => {
    setIsLaunching(true);
    try {
      await onLaunchOverlay();
    } finally {
      window.setTimeout(() => setIsLaunching(false), 1500);
    }
  };

  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar-header">
        <div className="dashboard-sidebar-brand sidebar-header">
          <img src="/logo_transparent.png" alt="logo" className="sidebar-logo" />
          <div className="sidebar-header-text">
            <h1 className="dashboard-title sidebar-app-name">Sync.</h1>
            <p className="dashboard-sidebar-subtitle sidebar-app-subtitle">Session review</p>
          </div>
        </div>

        <button
          type="button"
          className={`dashboard-sidebar-cta ${isLaunching ? 'dashboard-sidebar-cta-loading' : ''}`}
          onClick={() => void handleLaunch()}
          disabled={isLaunching}
        >
          {isLaunching ? (
            <>
              <span className="dashboard-inline-spinner" />
              Launching...
            </>
          ) : (
            'New session'
          )}
        </button>
      </div>

      <div className="dashboard-sidebar-section">
        <p className="dashboard-sidebar-section-label">Workspace</p>
        <button type="button" className={helperSettingsClassName} onClick={onSelectHelperSettings}>
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
          {sessions.map((session) => {
            const isSelected = selectedSessionId === session.id && !showHelperSettings;
            const isConfirming = confirmingDeleteId === session.id;
            const isDeleting = deletingSessionId === session.id;

            if (isConfirming) {
              return (
                <div key={session.id} className="dashboard-session-item dashboard-session-item-confirm">
                  <p className="dashboard-session-item-confirm-text">Delete this session?</p>
                  <div className="dashboard-session-item-confirm-actions">
                    <button
                      type="button"
                      className="dashboard-session-confirm-cancel"
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="dashboard-session-confirm-delete"
                      disabled={isDeleting}
                      onClick={() => {
                        setDeletingSessionId(session.id);
                        void onDeleteSession(session.id).finally(() => {
                          setDeletingSessionId(null);
                          setConfirmingDeleteId(null);
                        });
                      }}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={session.id}
                className={`dashboard-session-item ${isSelected ? 'dashboard-session-item-active' : ''}`}
              >
                <button type="button" className="dashboard-session-item-main" onClick={() => onSelectSession(session.id)}>
                  <div className="dashboard-session-item-title">{session.title}</div>
                  <div className="dashboard-session-item-meta">
                    <span>{formatDate(session.createdAt)}</span>
                    <span>{formatDuration(session.durationMs)}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="dashboard-session-delete-btn"
                  aria-label={`Delete ${session.title}`}
                  onClick={() => setConfirmingDeleteId(session.id)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
