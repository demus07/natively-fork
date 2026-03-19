import { useEffect, useRef, useState } from 'react';
import type { DashboardSession } from '../../types';

interface SessionHeaderProps {
  session: DashboardSession;
  onRename: (title: string) => Promise<void>;
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) {
    return '0 seconds';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function SessionHeader({ session, onRename }: SessionHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftTitle(session.title);
    setIsEditing(false);
  }, [session.id, session.title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitRename = async () => {
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setDraftTitle(session.title);
      setIsEditing(false);
      return;
    }

    if (trimmedTitle !== session.title) {
      await onRename(trimmedTitle);
    }

    setIsEditing(false);
  };

  return (
    <header className="dashboard-session-header">
      <div className="dashboard-breadcrumb">
        <span>Sessions</span>
        <span className="dashboard-breadcrumb-separator">/</span>
        <span className="dashboard-breadcrumb-current">{session.title}</span>
      </div>

      {isEditing ? (
        <input
          ref={inputRef}
          className="dashboard-session-title-input"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commitRename();
            }
            if (event.key === 'Escape') {
              setDraftTitle(session.title);
              setIsEditing(false);
            }
          }}
        />
      ) : (
        <h1 className="dashboard-session-title" onDoubleClick={() => setIsEditing(true)}>
          {session.title}
        </h1>
      )}

      <div className="dashboard-session-meta">
        <span>Created {formatDate(session.createdAt)}</span>
        <span className="dashboard-session-meta-separator">·</span>
        <span>Duration {formatDuration(session.durationMs)}</span>
        <span className="dashboard-session-meta-separator">·</span>
        <span className="dashboard-provider-badge">{session.providerLlm}</span>
        <span className="dashboard-provider-badge">{session.providerStt}</span>
      </div>
    </header>
  );
}
