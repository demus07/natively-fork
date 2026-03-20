import { useEffect, useState } from 'react';
import { LEGACY_PROVIDER_VALUES, PROVIDER_DEFAULTS, UI_LIMITS } from '../../../src/config';
import { dashboardActions } from '../../services/dashboardActions';
import { dashboardClient } from '../../services/dashboardClient';
import type { LLMProvider, Settings, STTProvider } from '../../types';

interface HelperSettingsViewProps {
  settings: Settings;
  onSettingsSaved: (settings: Settings) => void;
}

export default function HelperSettingsView({ settings, onSettingsSaved }: HelperSettingsViewProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [llmTest, setLlmTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: 'Not tested yet'
  });
  const [sttTest, setSttTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: 'Not tested yet'
  });
  const [launchStatus, setLaunchStatus] = useState<{ status: 'idle' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: ''
  });

  const normalizeCodexModel = (model?: string): string => {
    const trimmedModel = (model || '').trim();
    if (trimmedModel === LEGACY_PROVIDER_VALUES.codexUnsupportedDefaultModel) {
      return '';
    }
    return trimmedModel;
  };

  useEffect(() => {
    setDraft({
      ...settings,
      codexModel: normalizeCodexModel(settings.codexModel)
    });
  }, [settings]);

  const normalizedDraft = {
    ...draft,
    codexModel: normalizeCodexModel(draft.codexModel)
  };

  const persistSettings = async (): Promise<Settings | null> => {
    setSaving(true);
    const result = await dashboardClient.saveSettings({
      ...normalizedDraft
    });
    setSaving(false);

    if (!result.ok || !result.data) {
      return null;
    }

    onSettingsSaved(result.data);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
    return result.data;
  };

  const handleSave = async () => {
    await persistSettings();
  };

  const updateDraft = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setLlmTest({ status: 'idle', message: 'Not tested yet' });
    setSttTest({ status: 'idle', message: 'Not tested yet' });
    setLaunchStatus({ status: 'idle', message: '' });
  };

  const handleTestLlm = async () => {
    setLlmTest({ status: 'testing', message: 'Testing language model…' });
    const result = await dashboardActions.testLlm(normalizedDraft);
    if (!result.ok) {
      setLlmTest({ status: 'error', message: result.error?.message || 'LLM test failed' });
      return;
    }

    const latency = result.data?.latencyMs ? ` in ${result.data.latencyMs} ms` : '';
    setLlmTest({ status: 'success', message: `Connected${latency}` });
  };

  const handleTestStt = async () => {
    setSttTest({ status: 'testing', message: 'Testing speech transcription…' });
    const result = await dashboardActions.testStt(normalizedDraft);
    if (!result.ok) {
      setSttTest({ status: 'error', message: result.error?.message || 'STT test failed' });
      return;
    }

    setSttTest({ status: 'success', message: 'Connected' });
  };

  const handleLaunchOverlay = async () => {
    setLaunching(true);
    const savedSettings = await persistSettings();
    if (!savedSettings) {
      setLaunching(false);
      return;
    }

    const result = await dashboardActions.launchOverlay();
    setLaunching(false);
    if (!result.ok) {
      setLaunchStatus({
        status: 'error',
        message: result.error?.message || 'Could not launch the overlay'
      });
      return;
    }

    setLaunchStatus({
      status: 'success',
      message: 'Overlay launch requested'
    });
  };

  const currentLlmDetail = (() => {
    switch (draft.llmProvider) {
      case 'gemini':
        return draft.geminiModel || PROVIDER_DEFAULTS.geminiModel;
      case 'ollama':
        return draft.ollamaModel || PROVIDER_DEFAULTS.ollamaModel;
      case 'codex':
        return draft.codexModel.trim() ? `OAuth (${draft.codexModel.trim()})` : 'OAuth (CLI default)';
      case 'openai':
        return draft.openaiApiKey ? 'API key configured' : 'API key missing';
      case 'anthropic':
        return draft.anthropicApiKey ? 'API key configured' : 'API key missing';
      default:
        return '';
    }
  })();

  const currentSttDetail = (() => {
    switch (draft.sttProvider) {
      case 'deepgram':
        return draft.deepgramModel || PROVIDER_DEFAULTS.deepgramModel;
      case 'sarvam':
        return draft.sarvamApiKey ? 'API key configured' : 'API key missing';
      case 'whisper':
      default:
        return draft.whisperModel || PROVIDER_DEFAULTS.whisperModel;
    }
  })();

  return (
    <div className="dashboard-settings-pane">
      <div className="dashboard-detail-header">
        <div>
          <p className="dashboard-eyebrow">Configuration</p>
          <h2 className="dashboard-detail-title">Settings</h2>
        </div>
      </div>

      <div className="dashboard-overview-grid">
        <section className="dashboard-card">
          <h3>Providers</h3>
          <p>LLM: {draft.llmProvider} ({currentLlmDetail})</p>
          <p>STT: {draft.sttProvider} ({currentSttDetail})</p>
        </section>

        <section className="dashboard-card">
          <h3>Language model</h3>
          <label className="dashboard-field">
            <span>Provider</span>
            <select
              value={draft.llmProvider}
              onChange={(event) => updateDraft('llmProvider', event.target.value as LLMProvider)}
            >
              <option value="codex">Codex via OAuth</option>
              <option value="openai">OpenAI API key</option>
              <option value="anthropic">Anthropic API key</option>
              <option value="gemini">Gemini</option>
              <option value="ollama">Ollama (default)</option>
            </select>
          </label>

          {draft.llmProvider === 'codex' && (
            <label className="dashboard-field">
              <span>Codex model</span>
              <input
                type="text"
                value={draft.codexModel}
                onChange={(event) => updateDraft('codexModel', event.target.value)}
                placeholder="Leave blank to use your Codex CLI default"
              />
              <small>Uses the signed-in Codex OAuth session. Leave this blank to use the same default model as your local Codex CLI.</small>
            </label>
          )}

          {draft.llmProvider === 'openai' && (
            <label className="dashboard-field">
              <span>OpenAI API key</span>
              <input
                type="password"
                value={draft.openaiApiKey}
                onChange={(event) => updateDraft('openaiApiKey', event.target.value)}
                placeholder="sk-..."
              />
            </label>
          )}

          {draft.llmProvider === 'anthropic' && (
            <label className="dashboard-field">
              <span>Anthropic API key</span>
              <input
                type="password"
                value={draft.anthropicApiKey}
                onChange={(event) => updateDraft('anthropicApiKey', event.target.value)}
                placeholder="sk-ant-..."
              />
            </label>
          )}

          {draft.llmProvider === 'gemini' && (
            <>
              <label className="dashboard-field">
                <span>Gemini API key</span>
                <input
                  type="password"
                  value={draft.geminiApiKey}
                  onChange={(event) => updateDraft('geminiApiKey', event.target.value)}
                  placeholder="AIza..."
                />
              </label>
              <label className="dashboard-field">
                <span>Gemini model</span>
                <input
                  type="text"
                  value={draft.geminiModel}
                  onChange={(event) => updateDraft('geminiModel', event.target.value)}
                  placeholder={PROVIDER_DEFAULTS.geminiModel}
                />
              </label>
            </>
          )}

          {draft.llmProvider === 'ollama' && (
            <>
              <label className="dashboard-field">
                <span>Ollama endpoint</span>
                <input
                  type="text"
                  value={draft.ollamaEndpoint}
                  onChange={(event) => updateDraft('ollamaEndpoint', event.target.value)}
                  placeholder={PROVIDER_DEFAULTS.ollamaEndpoint}
                />
              </label>
              <label className="dashboard-field">
                <span>Ollama model</span>
                <input
                  type="text"
                  value={draft.ollamaModel}
                  onChange={(event) => updateDraft('ollamaModel', event.target.value)}
                  placeholder={PROVIDER_DEFAULTS.ollamaModel}
                />
              </label>
            </>
          )}
        </section>

        <section className="dashboard-card">
          <h3>Voice transcription</h3>
          <label className="dashboard-field">
            <span>Provider</span>
            <select
              value={draft.sttProvider}
              onChange={(event) => updateDraft('sttProvider', event.target.value as STTProvider)}
            >
              <option value="deepgram">Deepgram</option>
              <option value="sarvam">Sarvam</option>
              <option value="whisper">Whisper (default)</option>
            </select>
          </label>

          {draft.sttProvider === 'deepgram' && (
            <>
              <label className="dashboard-field">
                <span>Deepgram API key</span>
                <input
                  type="password"
                  value={draft.deepgramApiKey}
                  onChange={(event) => updateDraft('deepgramApiKey', event.target.value)}
                  placeholder="Deepgram API key"
                />
              </label>
              <label className="dashboard-field">
                <span>Deepgram model</span>
                <input
                  type="text"
                  value={draft.deepgramModel}
                  onChange={(event) => updateDraft('deepgramModel', event.target.value)}
                  placeholder={PROVIDER_DEFAULTS.deepgramModel}
                />
              </label>
            </>
          )}

          {draft.sttProvider === 'sarvam' && (
            <label className="dashboard-field">
              <span>Sarvam API key</span>
              <input
                type="password"
                value={draft.sarvamApiKey}
                onChange={(event) => updateDraft('sarvamApiKey', event.target.value)}
                placeholder="Sarvam API key"
              />
            </label>
          )}

          {draft.sttProvider === 'whisper' && (
            <>
              <label className="dashboard-field">
                <span>Whisper model</span>
                <input
                  type="text"
                  value={draft.whisperModel}
                  onChange={(event) => updateDraft('whisperModel', event.target.value)}
                  placeholder={PROVIDER_DEFAULTS.whisperModel}
                />
              </label>
              <label className="dashboard-field">
                <span>Whisper language</span>
                <input
                  type="text"
                  value={draft.whisperLanguage}
                  onChange={(event) => updateDraft('whisperLanguage', event.target.value)}
                  placeholder={PROVIDER_DEFAULTS.whisperLanguage}
                />
              </label>
            </>
          )}
        </section>

        <section className="dashboard-card">
          <h3>Interface</h3>
          <label className="dashboard-field">
            <span>Window opacity</span>
            <input
              type="range"
              min={UI_LIMITS.opacityMin}
              max={UI_LIMITS.opacityMax}
              step={UI_LIMITS.opacityStep}
              value={draft.windowOpacity}
              onChange={(event) =>
                setDraft((current) => ({ ...current, windowOpacity: Number(event.target.value) }))
              }
            />
          </label>
          <label className="dashboard-field">
            <span>Rolling context size</span>
            <input
              type="number"
              value={draft.rollingContextSize}
              min={UI_LIMITS.rollingContextMin}
              max={UI_LIMITS.rollingContextMax}
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
        </section>

        <section className="dashboard-card dashboard-card-full">
          <h3>Current defaults</h3>
          <p>Ollama endpoint: {draft.ollamaEndpoint || PROVIDER_DEFAULTS.ollamaEndpoint}</p>
          <p>Whisper model: {draft.whisperModel || PROVIDER_DEFAULTS.whisperModel}</p>
        </section>

        <section className="dashboard-card dashboard-card-full">
          <h3>Verification</h3>
          <div className="dashboard-settings-test-grid">
            <div className={`dashboard-settings-status dashboard-settings-status-${llmTest.status}`}>
              <strong>LLM</strong>
              <span>{llmTest.message}</span>
            </div>
            <div className={`dashboard-settings-status dashboard-settings-status-${sttTest.status}`}>
              <strong>STT</strong>
              <span>{sttTest.message}</span>
            </div>
          </div>
          <div className="dashboard-settings-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={() => void handleTestLlm()} disabled={llmTest.status === 'testing'}>
              {llmTest.status === 'testing' ? 'Testing LLM…' : 'Test LLM'}
            </button>
            <button type="button" className="dashboard-secondary-btn" onClick={() => void handleTestStt()} disabled={sttTest.status === 'testing'}>
              {sttTest.status === 'testing' ? 'Testing STT…' : 'Test STT'}
            </button>
            <button type="button" className="dashboard-primary-btn" onClick={() => void handleLaunchOverlay()} disabled={launching || saving}>
              {launching ? 'Launching…' : 'Launch overlay'}
            </button>
          </div>
          {launchStatus.status !== 'idle' ? (
            <p className={`dashboard-settings-note dashboard-settings-note-${launchStatus.status}`}>
              {launchStatus.message}
            </p>
          ) : null}
        </section>
      </div>

      <div className="dashboard-settings-actions">
        <button type="button" className="dashboard-secondary-btn" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
