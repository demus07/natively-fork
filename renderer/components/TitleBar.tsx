import type { CSSProperties } from 'react';
import { ChevronDown, Lightbulb, Mic, Pause, Sparkles } from 'lucide-react';

interface TitleBarProps {
  isRecording: boolean;
  onAsk: () => void;
  onAnswer: () => void;
  onInsights: () => void;
  onEndAndReview: () => void;
  onHide: () => void;
  onPauseSession: () => void;
  onToggleMic: () => void;
}

export default function TitleBar({
  isRecording,
  onAsk,
  onAnswer,
  onInsights,
  onEndAndReview,
  onHide,
  onPauseSession,
  onToggleMic
}: TitleBarProps) {
  const waveformBars: CSSProperties[] = [
    { ['--delay' as string]: '0ms', ['--height' as string]: '40%' } as CSSProperties,
    { ['--delay' as string]: '150ms', ['--height' as string]: '80%' } as CSSProperties,
    { ['--delay' as string]: '75ms', ['--height' as string]: '60%' } as CSSProperties,
    { ['--delay' as string]: '225ms', ['--height' as string]: '90%' } as CSSProperties,
    { ['--delay' as string]: '50ms', ['--height' as string]: '50%' } as CSSProperties
  ];

  return (
    <div className="top-pill drag-region">
      <div className="titlebar-left">
        <button
          type="button"
          className={`pill-audio-btn no-drag ${isRecording ? 'pill-audio-btn--active' : 'pill-audio-btn--muted'}`}
          onClick={onToggleMic}
          title={isRecording ? 'Stop listening' : 'Start listening'}
        >
          <span className="audio-pulse-dot" />
          <span className="audio-pulse-ring" />
          <span className="audio-pulse-ring audio-pulse-ring--delayed" />
        </button>
        <button
          type="button"
          className="pill-action-btn no-drag"
          onClick={onInsights}
          title="Insights"
        >
          <Lightbulb size={12} />
          <span>Insights</span>
        </button>
        <button type="button" className="pill-action-btn no-drag" onClick={onAsk} title="Ask AI">
          <Sparkles size={12} />
          <span>Ask</span>
        </button>
        <button type="button" className="pill-action-btn pill-answer-btn no-drag" onClick={onAnswer} title="Answer now">
          <span>⚡</span>
          <span>Answer</span>
        </button>
      </div>
      <div className="titlebar-right">
        <div className="pill-divider" />
        <button
          type="button"
          className={`pill-record-btn no-drag ${isRecording ? 'active' : ''}`}
          onClick={onToggleMic}
          title="Pause session"
        >
          {isRecording ? <Pause size={12} /> : <Mic size={12} />}
        </button>
        <button
          type="button"
          className="pill-icon-btn pill-waveform-btn no-drag"
          onClick={onHide}
          title="More"
        >
          <span className="waveform">
            {waveformBars.map((barStyle, index) => (
              <span key={index} className="waveform-bar" style={barStyle} />
            ))}
          </span>
        </button>
        <button
          type="button"
          className="pill-icon-btn pill-hide-btn no-drag"
          onClick={onHide}
          title="Hide overlay"
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className="pill-icon-btn pill-close-btn no-drag"
          onClick={onEndAndReview}
          title="End session and open dashboard"
        >
          ×
        </button>
      </div>
    </div>
  );
}
