import { useEffect, useRef } from 'react';

interface TranscriptPanelProps {
  transcript: string;
  interimText?: string;
  isRecording: boolean;
  statusText?: string;
}

export default function TranscriptPanel({ transcript, interimText, isRecording, statusText }: TranscriptPanelProps) {
  const lines = transcript.split('\n').map((line) => line.trim()).filter(Boolean);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rollingText = lines.slice(-20).join('   ·   ');
  const latest = rollingText || statusText || 'Waiting for live transcript';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [transcript, interimText]);

  return (
    <div className="transcript-panel">
      <div ref={scrollRef} className="transcript-inline">
        <span className={`transcript-live-dot ${isRecording ? 'transcript-live-dot-active' : ''}`} />
        <div className="ticker-window">
          <span className="transcript-inline-text">
            <span>{latest}</span>
            {interimText ? <span style={{ opacity: 0.45 }}>{` ${interimText}`}</span> : null}
          </span>
        </div>
      </div>
    </div>
  );
}
