import { useState } from 'react';

export interface AppSettings {
  defaultPageSize: 25 | 50 | 100;
  showMergeCommits: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultPageSize: 50,
  showMergeCommits: true,
};

const STORAGE_KEY = 'gne-settings';

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<AppSettings>) };
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  function updateSettings(updates: Partial<AppSettings>) {
    const next = { ...settings, ...updates };
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  return { settings, updateSettings };
}
