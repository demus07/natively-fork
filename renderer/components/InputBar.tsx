import { useEffect, useRef } from 'react';
import { ArrowUp, Camera, Crop, MoreHorizontal } from 'lucide-react';

interface InputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  screenshot: string | null;
  onClearScreenshot: () => void;
  onFullScreenshot: () => void;
  onSelectiveScreenshot: () => void;
  onOpenSettings: () => void;
  isStreaming: boolean;
  currentModel: string;
}

export default function InputBar({
  value,
  onChange,
  onSend,
  screenshot,
  onClearScreenshot,
  onFullScreenshot,
  onSelectiveScreenshot,
  onOpenSettings,
  isStreaming,
  currentModel
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = '20px';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 42)}px`;
  }, [value]);

  const disabled = (!value.trim() && !screenshot) || isStreaming;

  return (
    <div className="inputbar-shell">
      <div className="inputbar-row">
        <div className="hud-input-card">
          {screenshot ? (
            <div className="inputbar-preview-row">
              <div className="inputbar-preview">
                <img src={`data:image/png;base64,${screenshot}`} alt="Attached screenshot" />
                <button type="button" className="inputbar-preview-remove no-drag" onClick={onClearScreenshot}>
                  ×
                </button>
              </div>
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            className="composer-input no-drag hud-composer-input"
            rows={1}
            value={value}
            placeholder="Ask anything on screen or conversation"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                onSend();
                return;
              }

              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <div className="hud-input-hint">⌘ + H for screenshot</div>
        </div>
        <div className="hud-input-actions">
          <button type="button" className="inputbar-icon-btn no-drag" onClick={onFullScreenshot} title="Capture full screenshot">
            <Camera size={14} />
          </button>
          <button type="button" className="inputbar-icon-btn no-drag" onClick={onSelectiveScreenshot} title="Capture selective screenshot">
            <Crop size={14} />
          </button>
          <button type="button" className="inputbar-icon-btn no-drag" onClick={onOpenSettings} title={`Settings · ${currentModel}`}>
            <MoreHorizontal size={14} />
          </button>
          <button type="button" className="send-btn no-drag" disabled={disabled} onClick={onSend}>
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
