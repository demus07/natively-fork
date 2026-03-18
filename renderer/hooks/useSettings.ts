import { useEffect, useState } from 'react';
import type { Settings } from '../types';

const defaultSettings: Settings = {
  aiProvider: 'codex',
  llmProvider: 'ollama',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  ollamaEndpoint: 'http://192.168.29.234:11434',
  ollamaModel: 'qwen3.5:35b',
  sttProvider: 'whisper',
  deepgramApiKey: '',
  deepgramModel: 'nova-2-meeting',
  googleServiceAccountPath: '',
  codexModel: 'codex-4',
  codexExtraFlags: '',
  transcriptLanguage: 'en',
  whisperModel: 'turbo',
  whisperLanguage: 'en',
  whisperComputeType: 'int8',
  whisperDevice: 'cpu',
  whisperPythonBin: '',
  windowOpacity: 0.9,
  rollingContextSize: 20,
  includeOverlayInScreenshots: false
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.electronAPI.getSettings().then((result) => {
      setSettings(result);
      setLoading(false);
    });
  }, []);

  const saveSettings = async (next: Settings) => {
    await window.electronAPI.saveSettings(next);
    setSettings(next);
  };

  return { settings, setSettings, saveSettings, loading };
}
