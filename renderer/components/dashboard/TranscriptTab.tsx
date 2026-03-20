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

function getSpeakerLabel(source: DashboardUtterance['source']): 'Me' | 'Them' | 'Captured' {
  if (source === 'me') {
    return 'Me';
  }

  if (source === 'them') {
    return 'Them';
  }

  return 'Captured';
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
            <span
              className={`dashboard-transcript-speaker ${
                utterance.source === 'me'
                  ? 'dashboard-transcript-speaker-you'
                  : utterance.source === 'them'
                    ? 'dashboard-transcript-speaker-remote'
                    : 'dashboard-transcript-speaker-captured'
              }`}
            >
              {getSpeakerLabel(utterance.source)}
            </span>
            <span className="dashboard-transcript-text">{utterance.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
