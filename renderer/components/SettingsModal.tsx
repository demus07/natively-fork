import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { APP_METADATA, PROVIDER_DEFAULTS, UI_LIMITS } from '../../src/config';
import { useSettings } from '../hooks/useSettings';
import type { Settings } from '../types';

interface SettingsModalProps {
  onClose: () => void;
}

const LANGUAGE_OPTIONS = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['ja', 'Japanese'],
  ['auto', 'Auto']
] as const;

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, saveSettings } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [codexStatus, setCodexStatus] = useState<{ found: boolean; path: string | null }>({
    found: false,
    path: null
  });

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    void window.electronAPI.getCodexStatus?.().then((status) => {
      if (status) {
        setCodexStatus(status);
      }
    });
  }, []);

  const handleSave = async () => {
    await saveSettings(draft);
    await window.electronAPI.setWindowOpacity?.(draft.windowOpacity);
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      onClose();
    }, 900);
  };

  return (
    <div className="settings-overlay no-drag" onClick={onClose}>
      <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="settings-close-btn" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="settings-section-title">AI</div>
        <div className="settings-status-row">
          <span className={`settings-status-dot ${codexStatus.found ? 'settings-status-dot-ok' : 'settings-status-dot-bad'}`} />
          <span>{codexStatus.found ? 'Codex CLI detected' : 'Codex CLI not found'}</span>
        </div>
        <div className="settings-help-text">{codexStatus.path ?? 'No executable path detected.'}</div>
        <label className="settings-field">
          <span className="settings-label">Codex model</span>
          <input
            className="settings-input"
            type="text"
            value={draft.codexModel}
            onChange={(event) => setDraft((current) => ({ ...current, codexModel: event.target.value }))}
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">Extra flags</span>
          <input
            className="settings-input"
            type="text"
            value={draft.codexExtraFlags}
            placeholder="Optional additional codex exec flags"
            onChange={(event) => setDraft((current) => ({ ...current, codexExtraFlags: event.target.value }))}
          />
        </label>

        <div className="settings-section-title">Transcript</div>
        <label className="settings-field settings-select-wrap">
          <span className="settings-label">Language</span>
          <select
            className="settings-input settings-select"
            value={draft.transcriptLanguage}
            onChange={(event) => setDraft((current) => ({ ...current, transcriptLanguage: event.target.value }))}
          >
            {LANGUAGE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="settings-select-icon" />
        </label>
        <label className="settings-field settings-select-wrap">
          <span className="settings-label">Transcript backend</span>
          <input className="settings-input" type="text" value="faster-whisper (local)" readOnly />
        </label>
        <label className="settings-field settings-select-wrap">
          <span className="settings-label">Model</span>
          <select
            className="settings-input settings-select"
            value={draft.whisperModel}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                whisperModel: event.target.value as Settings['whisperModel']
              }))
            }
          >
            <option value="base.en">base.en</option>
            <option value="tiny.en">tiny.en</option>
          </select>
          <ChevronDown size={14} className="settings-select-icon" />
        </label>
        <div className="settings-help-text">Local faster-whisper model served through the Python transcription process.</div>

        <div className="settings-section-title">Interface</div>
        <label className="settings-field">
          <span className="settings-label">Window opacity ({Math.round(draft.windowOpacity * 100)}%)</span>
          <input
            className="settings-range"
            type="range"
            min="0.7"
            max="1"
            step="0.01"
            value={draft.windowOpacity}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDraft((current) => ({ ...current, windowOpacity: next }));
              void window.electronAPI.setWindowOpacity?.(next);
            }}
          />
        </label>
        <label className="settings-field">
          <span className="settings-label">Rolling context size</span>
          <input
            className="settings-input"
            type="number"
            min={UI_LIMITS.rollingContextMin}
            max={UI_LIMITS.rollingContextMax}
            value={draft.rollingContextSize}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                rollingContextSize: Math.max(
                  UI_LIMITS.rollingContextMin,
                  Math.min(UI_LIMITS.rollingContextMax, Number(event.target.value) || UI_LIMITS.rollingContextDefault)
                )
              }))
            }
          />
        </label>

        <div className="settings-section-title">About</div>
        <div className="settings-help-text">Version {APP_METADATA.version}</div>
        <a
          className="settings-link"
          href={APP_METADATA.referenceRepository}
          target="_blank"
          rel="noreferrer"
        >
          Reference repository
        </a>

        <div style={{ borderTop: '1px solid var(--color-border-tertiary)', paddingTop: '16px', marginTop: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>AI Providers</p>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            LLM: {draft.llmProvider || 'ollama'} —{' '}
            {draft.llmProvider === 'gemini'
              ? draft.geminiModel || PROVIDER_DEFAULTS.geminiModel
              : draft.ollamaModel || PROVIDER_DEFAULTS.ollamaModel}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
            STT: {draft.sttProvider || 'whisper'}
          </p>
          <button
            onClick={() => void window.electronAPI.openDashboard?.()}
            style={{
              width: '100%',
              marginBottom: '10px',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Open session dashboard ↗
          </button>
          <button
            onClick={() => void window.electronAPI.openSetup?.()}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid var(--color-border-secondary)',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Reconfigure Providers
          </button>
        </div>

        <button type="button" className="settings-save-btn" onClick={() => void handleSave()}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}
