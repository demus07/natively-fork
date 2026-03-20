import { useEffect, useState } from 'react';
import { dashboardActions } from '../../services/dashboardActions';
import type { DashboardSession } from '../../types';
import AISynopsesTab from './AISynopsesTab';
import OverviewTab from './OverviewTab';
import SessionHeader from './SessionHeader';
import TabBar from './TabBar';
import TranscriptTab from './TranscriptTab';

type ActiveTab = 'overview' | 'ai' | 'transcript';

interface SessionDetailProps {
  session: DashboardSession;
  onSessionPatched: (session: DashboardSession) => void;
  onToast: (message: string, tone?: 'default' | 'error') => void;
}

export default function SessionDetail({ session, onSessionPatched, onToast }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (session.summary) {
      setIsRegenerating(false);
    }
  }, [session.summary]);

  const handleRename = async (title: string) => {
    const previousTitle = session.title;
    const optimisticSession = { ...session, title };
    onSessionPatched(optimisticSession);

    const result = await dashboardActions.renameSession(session.id, title);
    if (!result.ok || !result.data) {
      onSessionPatched({ ...optimisticSession, title: previousTitle });
      onToast(result.error?.message || 'Could not rename session.', 'error');
      return;
    }

    onSessionPatched({
      ...optimisticSession,
      title: result.data.title
    });
  };

  const handleCopyOverview = async () => {
    if (!session.summary?.overview) {
      return;
    }

    try {
      await navigator.clipboard.writeText(session.summary.overview);
      onToast('Copied!');
    } catch {
      onToast('Could not copy the overview.', 'error');
    }
  };

  const handleRegenerateSummary = async () => {
    setIsRegenerating(true);
    onSessionPatched({
      ...session,
      summary: null,
      hasSummary: false
    });

    const result = await dashboardActions.summarizeSession(session.id);
    if (!result.ok) {
      setIsRegenerating(false);
      onSessionPatched(session);
      onToast(result.error?.message || 'Could not regenerate summary.', 'error');
      return;
    }

    onToast('Regenerating summary...');
  };

  const handleResumeSession = async () => {
    const result = await dashboardActions.launchOverlay(session.id);
    if (!result.ok) {
      onToast(result.error?.message || 'Could not resume the session.', 'error');
      return;
    }

    onToast('Session resumed in overlay.');
  };

  return (
    <div className="dashboard-detail">
      <SessionHeader session={session} onRename={handleRename} onResume={handleResumeSession} />
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <div className="dashboard-detail-body">
        {activeTab === 'overview' ? (
          <OverviewTab
            sessionId={session.id}
            summary={session.summary}
            isRegenerating={isRegenerating}
            onCopyOverview={handleCopyOverview}
            onRegenerate={handleRegenerateSummary}
          />
        ) : activeTab === 'ai' ? (
          <AISynopsesTab messages={session.messages} />
        ) : (
          <TranscriptTab utterances={session.utterances} />
        )}
      </div>
    </div>
  );
}
