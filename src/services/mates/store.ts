import type { Mate } from '../../types/github';

const MATES_KEY = 'grassmate.mates';

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

function sanitizeMate(item: Partial<Mate>): Mate | null {
  if (typeof item.username !== 'string') return null;

  const username = normalizeUsername(item.username);
  if (!username) return null;

  return {
    username,
    nickname:
      typeof item.nickname === 'string' && item.nickname.trim().length > 0
        ? item.nickname.trim()
        : undefined,
    avatarUrl:
      typeof item.avatarUrl === 'string' && item.avatarUrl.trim().length > 0
        ? item.avatarUrl.trim()
        : undefined,
    profileUrl:
      typeof item.profileUrl === 'string' && item.profileUrl.trim().length > 0
        ? item.profileUrl.trim()
        : undefined,
  };
}

export const matesStore = {
  list(): Mate[] {
    const raw = localStorage.getItem(MATES_KEY);
    if (!raw) return [];

    try {
      const items = JSON.parse(raw) as Partial<Mate>[];
      const seen = new Set<string>();
      const result: Mate[] = [];

      for (const item of items) {
        const mate = sanitizeMate(item);
        if (!mate || seen.has(mate.username)) continue;

        seen.add(mate.username);
        result.push(mate);
      }

      return result;
    } catch {
      localStorage.removeItem(MATES_KEY);
      return [];
    }
  },

  save(mates: Mate[]): void {
    const seen = new Set<string>();
    const normalized: Mate[] = [];

    for (const item of mates) {
      const mate = sanitizeMate(item);
      if (!mate || seen.has(mate.username)) continue;

      seen.add(mate.username);
      normalized.push(mate);
    }

    localStorage.setItem(MATES_KEY, JSON.stringify(normalized));
  },
};
