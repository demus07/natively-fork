import { useEffect, useRef } from 'react';

interface TranscriptPanelProps {
  transcript: string;
  isRecording: boolean;
  statusText?: string;
}

export default function TranscriptPanel({ transcript, isRecording, statusText }: TranscriptPanelProps) {
  const lines = transcript.split('\n').map((line) => line.trim()).filter(Boolean);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rollingText = lines.slice(-20).join('   ·   ');
  const latest = rollingText || statusText || 'Waiting for live transcript';

  useEffect(() => {
    if (viewportRef.current) {
      const target = viewportRef.current;
      target.scrollTo({ left: target.scrollWidth, behavior: 'smooth' });
    }
  }, [latest]);

  return (
    <div className="transcript-panel">
      <div ref={viewportRef} className="transcript-inline">
        <span className={`transcript-live-dot ${isRecording ? 'transcript-live-dot-active' : ''}`} />
        <div className="ticker-window">
          <span className="transcript-inline-text">{latest}</span>
        </div>
      </div>
    </div>
  );
}
