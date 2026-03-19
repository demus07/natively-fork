import type { DashboardUtterance } from '../../types';

interface TranscriptTabProps {
  utterances: DashboardUtterance[];
}

function formatOffset(startedMs: number): string {
  const totalSeconds = Math.floor(startedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
}

export default function TranscriptTab({ utterances }: TranscriptTabProps) {
  if (utterances.length === 0) {
    return (
      <div className="dashboard-transcript-list dashboard-transcript-list-empty">
        <p className="dashboard-card-empty">No transcript lines were captured for this session.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-transcript-list">
      {utterances.map((utterance) => (
        <div key={`${utterance.id ?? utterance.startedMs}-${utterance.text}`} className="dashboard-transcript-line">
          <span className="dashboard-transcript-time">{formatOffset(utterance.startedMs)}</span>
          <div className="dashboard-transcript-content">
            <span className="dashboard-transcript-speaker dashboard-transcript-speaker-you">You</span>
            <span className="dashboard-transcript-text">{utterance.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
