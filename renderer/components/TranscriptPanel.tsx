import { useEffect, useRef } from 'react';
import { useTranscript } from '../hooks/useTranscript';

export default function TranscriptPanel() {
  const { finalLines, interimText } = useTranscript();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [finalLines, interimText]);

  return (
    <div
      ref={scrollRef}
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%'
      }}
      className="transcript-panel [&::-webkit-scrollbar]:hidden"
    >
      {finalLines.length === 0 && !interimText ? (
        <span className="transcript-inline-text">Waiting for live transcript</span>
      ) : null}
      {finalLines.map((line, index) => (
        <span key={`${index}-${line.slice(0, 16)}`} className="transcript-inline-text">
          {line}{' '}
        </span>
      ))}
      {interimText ? (
        <span className="transcript-inline-text" style={{ opacity: 0.6, fontStyle: 'italic' }}>
          {interimText}
        </span>
      ) : null}
    </div>
  );
}
