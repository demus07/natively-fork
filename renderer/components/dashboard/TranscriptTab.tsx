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
  return (
    <div className="dashboard-transcript-list">
      {utterances.map((utterance) => (
        <div key={`${utterance.id ?? utterance.startedMs}-${utterance.text}`} className="dashboard-transcript-line">
          <span className="dashboard-transcript-time">{formatOffset(utterance.startedMs)}</span>
          <span className="dashboard-transcript-text">{utterance.text}</span>
        </div>
      ))}
    </div>
  );
}
