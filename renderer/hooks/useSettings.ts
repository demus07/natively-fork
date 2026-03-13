import { useEffect, useState } from 'react';
import type { Settings } from '../types';

const defaultSettings: Settings = {
  aiProvider: 'codex',
  googleServiceAccountPath: '',
  codexModel: 'codex-4',
  codexExtraFlags: '',
  transcriptLanguage: 'en',
  whisperModel: 'base.en',
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
