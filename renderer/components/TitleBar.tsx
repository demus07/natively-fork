import { EyeOff, Flag, Mic, Monitor } from 'lucide-react';
import iconUrl from '../assets/icon.png';

interface TitleBarProps {
  isRecording: boolean;
  includeOverlayInScreenshots: boolean;
  onEndAndReview: () => void;
  onHide: () => void;
  onToggleRecording: () => void;
  onToggleScreenshotOverlay: () => void;
}

export default function TitleBar({
  isRecording,
  includeOverlayInScreenshots,
  onEndAndReview,
  onHide,
  onToggleRecording,
  onToggleScreenshotOverlay
}: TitleBarProps) {
  return (
    <div className="top-pill drag-region">
      <div className="titlebar-left">
        <div className="capsule-app-icon-wrap">
          <img src={iconUrl} alt="Natively" className="capsule-app-icon" />
        </div>
        <button
          type="button"
          className="capsule-hide-btn no-drag"
          onClick={onHide}
          title="Hide overlay"
        >
          <EyeOff size={12} />
          <span>Hide</span>
        </button>
      </div>
      <div className="titlebar-right no-drag">
        <button
          type="button"
          className="capsule-hide-btn no-drag"
          onClick={onEndAndReview}
          title="End this session and open review"
        >
          <Flag size={12} />
          <span>End + review</span>
        </button>
        <button
          type="button"
          className={`capsule-display-btn ${includeOverlayInScreenshots ? 'capsule-display-btn-active' : ''}`}
          onClick={onToggleScreenshotOverlay}
          title={
            includeOverlayInScreenshots
              ? 'Overlay visible in screenshots'
              : 'Overlay hidden from screenshots'
          }
        >
          <Monitor size={12} />
        </button>
        <button
          type="button"
          className={`capsule-mic-btn ${isRecording ? 'capsule-mic-btn-active' : ''}`}
          onClick={onToggleRecording}
          title={isRecording ? 'Stop microphone' : 'Start microphone'}
        >
          <Mic size={12} />
        </button>
      </div>
    </div>
  );
}
