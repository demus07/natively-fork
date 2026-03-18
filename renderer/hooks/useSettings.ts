import { useEffect, useState } from 'react';
import { SETTINGS_DEFAULTS } from '../../src/config';
import type { Settings } from '../types';

const defaultSettings: Settings = SETTINGS_DEFAULTS;

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
