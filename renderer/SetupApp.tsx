import { useEffect, useState, type CSSProperties } from 'react';
import { APP_METADATA, LEGACY_PROVIDER_VALUES, PROVIDER_DEFAULTS } from '../src/config';
import type { LLMProvider, STTProvider } from './types';
type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

interface TestState {
  status: TestStatus;
  message: string;
}

const isSupportedSetupLlmProvider = (value: LLMProvider): value is 'codex' | 'gemini' | 'ollama' =>
  value === 'codex' || value === 'gemini' || value === 'ollama';

const isSupportedSetupSttProvider = (value: STTProvider): value is 'deepgram' | 'whisper' =>
  value === 'deepgram' || value === 'whisper';

const normalizeCodexModel = (model?: string): string => {
  const trimmedModel = (model || '').trim();
  if (trimmedModel === LEGACY_PROVIDER_VALUES.codexUnsupportedDefaultModel) {
    return '';
  }
  return trimmedModel;
};

export default function SetupApp() {
  const [llmProvider, setLLMProvider] = useState<'codex' | 'gemini' | 'ollama'>('ollama');
  const [codexModel, setCodexModel] = useState<string>(PROVIDER_DEFAULTS.codexModel);
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState<string>(PROVIDER_DEFAULTS.geminiModel);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState<string>(PROVIDER_DEFAULTS.ollamaModel);
  const [llmTest, setLLMTest] = useState<TestState>({ status: 'idle', message: '' });

  const [sttProvider, setSTTProvider] = useState<'deepgram' | 'whisper'>('whisper');
  const [deepgramKey, setDeepgramKey] = useState('');
  const [whisperModel, setWhisperModel] = useState('turbo');
  const [sttTest, setSTTTest] = useState<TestState>({ status: 'idle', message: '' });

  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    void window.electronAPI.getSettings?.().then((s) => {
      if (!s) return;
      if (s.llmProvider && isSupportedSetupLlmProvider(s.llmProvider)) setLLMProvider(s.llmProvider);
      setCodexModel(normalizeCodexModel(s.codexModel));
      if (s.geminiApiKey) setGeminiKey(s.geminiApiKey);
      if (s.geminiModel) setGeminiModel(s.geminiModel);
      if (s.ollamaEndpoint) setOllamaEndpoint(s.ollamaEndpoint);
      if (s.ollamaModel) setOllamaModel(s.ollamaModel);
      if (s.sttProvider && isSupportedSetupSttProvider(s.sttProvider)) setSTTProvider(s.sttProvider);
      if (s.deepgramApiKey) setDeepgramKey(s.deepgramApiKey);
      if (s.whisperModel) setWhisperModel(s.whisperModel);
    });
  }, []);

  const resetLLMTest = () => setLLMTest({ status: 'idle', message: '' });
  const resetSTTTest = () => setSTTTest({ status: 'idle', message: '' });

  const testLLM = async () => {
    setLLMTest({ status: 'testing', message: '' });
    const config = llmProvider === 'codex'
      ? { provider: 'codex', codexModel: normalizeCodexModel(codexModel) }
      : llmProvider === 'gemini'
        ? { provider: 'gemini', geminiApiKey: geminiKey, geminiModel }
        : { provider: 'ollama', ollamaEndpoint, ollamaModel };
    try {
      const result = await window.electronAPI.testLLMConnection?.(config);
      setLLMTest({
        status: result?.ok ? 'ok' : 'error',
        message: result?.ok
          ? `Connected${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`
          : result?.error || 'Unknown error'
      });
    } catch (err) {
      setLLMTest({ status: 'error', message: String(err) });
    }
  };

  const testSTT = async () => {
    setSTTTest({ status: 'testing', message: '' });
    const config = sttProvider === 'deepgram'
      ? { provider: 'deepgram', deepgramApiKey: deepgramKey, deepgramModel: PROVIDER_DEFAULTS.deepgramModel }
      : { provider: 'whisper', whisperModel };
    try {
      const result = await window.electronAPI.testSTTConnection?.(config);
      setSTTTest({
        status: result?.ok ? 'ok' : 'error',
        message: result?.ok ? 'Connected' : result?.error || 'Unknown error'
      });
    } catch (err) {
      setSTTTest({ status: 'error', message: String(err) });
    }
  };

  const launch = async () => {
    setLaunching(true);
    try {
      await persistProviderSettings();
      await window.electronAPI.launchOverlay?.();
    } catch (err) {
      setLaunching(false);
      alert(`Launch failed: ${err}`);
    }
  };

  const persistProviderSettings = async () => {
    await window.electronAPI.saveProviderSettings?.({
      ...((await window.electronAPI.getSettings()) || {}),
      llmProvider,
      codexModel: normalizeCodexModel(codexModel),
      geminiApiKey: geminiKey,
      geminiModel,
      ollamaEndpoint,
      ollamaModel,
      sttProvider,
      deepgramApiKey: deepgramKey,
      deepgramModel: PROVIDER_DEFAULTS.deepgramModel,
      whisperModel,
      whisperLanguage: PROVIDER_DEFAULTS.whisperLanguage,
      whisperComputeType: PROVIDER_DEFAULTS.whisperComputeType,
      whisperDevice: PROVIDER_DEFAULTS.whisperDevice
    });
  };

  const openDashboard = async () => {
    try {
      await persistProviderSettings();
      await window.electronAPI.openDashboard?.({ mode: 'settings' });
    } catch (err) {
      alert(`Could not open dashboard: ${err}`);
    }
  };

  const canLaunch = llmTest.status === 'ok' && sttTest.status === 'ok' && !launching;

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.92)',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: '8px'
  };

  const selectStyle: CSSProperties = { ...inputStyle, cursor: 'pointer' };

  const btnStyle = (enabled: boolean): CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: enabled ? '#2563eb' : 'rgba(255,255,255,0.1)',
    color: enabled ? '#fff' : 'rgba(255,255,255,0.5)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: '13px',
    fontWeight: 500
  });

  const statusEl = (test: TestState) => {
    if (test.status === 'idle') return null;
    if (test.status === 'testing') {
      return <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', marginLeft: '10px' }}>Testing…</span>;
    }
    if (test.status === 'ok') {
      return <span style={{ color: '#16a34a', fontSize: '13px', marginLeft: '10px' }}>OK {test.message}</span>;
    }
    return <span style={{ color: '#dc2626', fontSize: '13px', marginLeft: '10px' }}>{test.message}</span>;
  };

  const helpStyle: CSSProperties = { fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '12px' };
  const linkStyle: CSSProperties = { color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' };

  return (
    <div
      style={{
        fontFamily: 'sans-serif',
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(37,99,235,0.15), transparent 35%), linear-gradient(180deg, #111827 0%, #0b1220 100%)',
        padding: '28px 32px',
        color: 'rgba(255,255,255,0.92)'
      }}
    >
      <div style={{ maxWidth: '580px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '6px' }}>Welcome to {APP_METADATA.name}</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '28px', fontSize: '14px' }}>
          Configure your AI and speech recognition providers to get started.
        </p>

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>AI Provider</h2>
          <select
            value={llmProvider}
            onChange={(e) => {
              setLLMProvider(e.target.value as 'codex' | 'gemini' | 'ollama');
              resetLLMTest();
            }}
            style={selectStyle}
          >
            <option value="codex">Codex via OAuth</option>
            <option value="ollama">Ollama (local — private)</option>
            <option value="gemini">Google Gemini (cloud)</option>
          </select>

          {llmProvider === 'codex' && (
            <>
              <input
                type="text"
                placeholder="Leave blank to use your Codex CLI default"
                value={codexModel}
                onChange={(e) => {
                  setCodexModel(e.target.value);
                  resetLLMTest();
                }}
                style={inputStyle}
              />
              <p style={helpStyle}>
                Uses your signed-in local Codex CLI session. Make sure{' '}
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                  codex login
                </code>
                {' '}has already been completed in Terminal. Leave the model blank to use whatever model your local Codex session already defaults to.
              </p>
            </>
          )}

          {llmProvider === 'gemini' && (
            <>
              <input
                type="password"
                placeholder="Gemini API key"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  resetLLMTest();
                }}
                style={inputStyle}
              />
              <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} style={selectStyle}>
                <option value="gemini-2.5-flash">gemini-2.5-flash (recommended)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
              </select>
              <p style={helpStyle}>
                Free key at{' '}
                <span style={linkStyle} onClick={() => window.open('https://aistudio.google.com', '_blank')}>
                  aistudio.google.com
                </span>
              </p>
            </>
          )}

          {llmProvider === 'ollama' && (
            <>
              <input
                type="text"
                placeholder="Ollama endpoint"
                value={ollamaEndpoint}
                onChange={(e) => {
                  setOllamaEndpoint(e.target.value);
                  resetLLMTest();
                }}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="Model name (e.g. qwen3.5:35b)"
                value={ollamaModel}
                onChange={(e) => {
                  setOllamaModel(e.target.value);
                  resetLLMTest();
                }}
                style={inputStyle}
              />
              <p style={helpStyle}>
                Install from{' '}
                <span style={linkStyle} onClick={() => window.open('https://ollama.ai', '_blank')}>
                  ollama.ai
                </span>
                {', then run: '}
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                  ollama pull {ollamaModel}
                </code>
              </p>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => void testLLM()} disabled={llmTest.status === 'testing'} style={btnStyle(llmTest.status !== 'testing')}>
              {llmTest.status === 'testing' ? 'Testing…' : 'Test Connection'}
            </button>
            {statusEl(llmTest)}
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0 0 28px' }} />

        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Speech Recognition</h2>
          <select
            value={sttProvider}
            onChange={(e) => {
              setSTTProvider(e.target.value as 'deepgram' | 'whisper');
              resetSTTTest();
            }}
            style={selectStyle}
          >
            <option value="whisper">faster-whisper (local — private)</option>
            <option value="deepgram">Deepgram (cloud — recommended for speed)</option>
          </select>

          {sttProvider === 'deepgram' && (
            <>
              <input
                type="password"
                placeholder="Deepgram API key"
                value={deepgramKey}
                onChange={(e) => {
                  setDeepgramKey(e.target.value);
                  resetSTTTest();
                }}
                style={inputStyle}
              />
              <p style={helpStyle}>
                Free key at{' '}
                <span style={linkStyle} onClick={() => window.open('https://deepgram.com', '_blank')}>
                  deepgram.com
                </span>
                {' — 200 hours free'}
              </p>
            </>
          )}

          {sttProvider === 'whisper' && (
            <>
              <select value={whisperModel} onChange={(e) => setWhisperModel(e.target.value)} style={selectStyle}>
                <option value="turbo">turbo (fastest, recommended)</option>
                <option value="base">base</option>
                <option value="small">small (more accurate, slower)</option>
                <option value="tiny">tiny (fastest, least accurate)</option>
              </select>
              <p style={helpStyle}>
                Requires Python 3.8+. Install:{' '}
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                  pip install faster-whisper
                </code>
              </p>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => void testSTT()} disabled={sttTest.status === 'testing'} style={btnStyle(sttTest.status !== 'testing')}>
              {sttTest.status === 'testing' ? 'Testing…' : 'Test Connection'}
            </button>
            {statusEl(sttTest)}
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0 0 28px' }} />

        <section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => void openDashboard()}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'transparent',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Open dashboard
            </button>
            <button
              onClick={() => void launch()}
              disabled={!canLaunch}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                border: 'none',
                background: canLaunch ? '#2563eb' : 'rgba(255,255,255,0.1)',
                color: canLaunch ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: canLaunch ? 'pointer' : 'not-allowed'
              }}
            >
              {launching ? 'Launching…' : 'Open Sync.'}
            </button>
          </div>
          {!canLaunch && !launching && (
            <p style={{ ...helpStyle, textAlign: 'center', marginTop: '8px' }}>
              Test both connections above to continue
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
