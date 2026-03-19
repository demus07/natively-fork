import { useEffect, useMemo, useState } from 'react';
import { dashboardClient } from '../../services/dashboardClient';
import type { DashboardSession } from '../../types';
import OverviewTab from './OverviewTab';
import TranscriptTab from './TranscriptTab';

type ActiveTab = 'overview' | 'transcript';

interface SessionDetailProps {
  session: DashboardSession;
  onSessionPatched: (session: DashboardSession) => void;
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

export default function SessionDetail({ session, onSessionPatched }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [draftTitle, setDraftTitle] = useState(session.title);

  useEffect(() => {
    setDraftTitle(session.title);
  }, [session.id, session.title]);

  useEffect(() => {
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle || trimmedTitle === session.title) {
      return;
    }

    const timer = window.setTimeout(() => {
      void dashboardClient.renameSession(session.id, trimmedTitle).then((result) => {
        if (result.ok) {
          onSessionPatched({ ...session, title: trimmedTitle });
        }
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draftTitle, session, onSessionPatched]);

  const providerBadges = useMemo(
    () => [session.providerLlm, session.providerStt],
    [session.providerLlm, session.providerStt]
  );

  return (
    <div className="dashboard-detail">
      <div className="dashboard-detail-header">
        <div className="dashboard-detail-header-main">
          <input
            className="dashboard-title-input"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
          />
          <div className="dashboard-detail-meta">
            <span>{formatDate(session.createdAt)}</span>
            <span>{formatDuration(session.durationMs)}</span>
          </div>
        </div>
        <div className="dashboard-badges">
          {providerBadges.map((badge) => (
            <span key={badge} className="dashboard-badge">
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className="dashboard-tabbar">
        <button
          type="button"
          className={activeTab === 'overview' ? 'dashboard-tab-active' : 'dashboard-tab'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={activeTab === 'transcript' ? 'dashboard-tab-active' : 'dashboard-tab'}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
      </div>

      <div className="dashboard-detail-body">
        {activeTab === 'overview' ? (
          <OverviewTab summary={session.summary} />
        ) : (
          <TranscriptTab utterances={session.utterances} />
        )}
      </div>
    </div>
  );
}
