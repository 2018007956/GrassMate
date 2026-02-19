import type { StoredAuth } from '../../types/github';

export const AUTH_STORAGE_KEY = 'grassmate.auth';

// TODO: Upgrade to OS-level secure storage.
// Tauri: stronghold plugin, Electron: keytar.
export const authStore = {
  load(): StoredAuth | null {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as StoredAuth;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  },

  save(auth: StoredAuth): void {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  },

  clear(): void {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },
};
