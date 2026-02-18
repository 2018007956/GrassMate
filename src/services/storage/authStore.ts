import type { StoredAuth } from '../../types/github';

const AUTH_KEY = 'grassmate.auth';

// TODO: Upgrade to OS-level secure storage.
// Tauri: stronghold plugin, Electron: keytar.
export const authStore = {
  load(): StoredAuth | null {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as StoredAuth;
    } catch {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
  },

  save(auth: StoredAuth): void {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  },

  clear(): void {
    localStorage.removeItem(AUTH_KEY);
  },
};
