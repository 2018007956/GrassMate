import type { GithubRequestError, Mate, MateMetrics } from '../../types/github';
import { githubRequest } from './http';

interface PublicEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload?: {
    before?: string;
    head?: string;
  };
}

interface CompareFile {
  additions: number;
  deletions: number;
}

interface CompareResponse {
  files?: CompareFile[];
}

interface RepoSummary {
  full_name: string;
  pushed_at: string | null;
  private?: boolean;
}

interface CommitListItem {
  sha: string;
  commit?: {
    author?: {
      date?: string;
    } | null;
  } | null;
}

interface CommitDetailResponse {
  stats?: {
    additions?: number;
    deletions?: number;
  };
  commit?: {
    author?: {
      date?: string;
    } | null;
  };
}

interface CompareCacheEntry {
  additions: number;
  deletions: number;
  updatedAt: string;
}

type CompareCache = Record<string, CompareCacheEntry>;

const CACHE_KEY = 'grassmate.compareCache.v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MATE_SPARKLINE_POINTS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getUtcDayStartMs(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

function getDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getKstDayKeyFromMs(ms: number): string {
  const shifted = new Date(ms + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getKstDayStartMs(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
}

function buildGrassGrid(dayCounts: Map<string, number>): number[] {
  const result: number[] = [];
  const todayStartMs = getUtcDayStartMs();

  for (let offset = 34; offset >= 0; offset -= 1) {
    const day = new Date(todayStartMs - offset * DAY_MS);
    result.push(dayCounts.get(getDayKey(day)) ?? 0);
  }

  return result;
}

function calculateStreak(dayCounts: Map<string, number>): number {
  let cursorMs = getUtcDayStartMs();

  let streak = 0;
  while ((dayCounts.get(getDayKey(new Date(cursorMs))) ?? 0) > 0) {
    streak += 1;
    cursorMs -= DAY_MS;
  }

  return streak;
}

function buildMateSparkline(dayScores: Map<string, number>): number[] {
  const result: number[] = [];
  const todayStartMs = getUtcDayStartMs();

  for (let offset = MATE_SPARKLINE_POINTS - 1; offset >= 0; offset -= 1) {
    const day = new Date(todayStartMs - offset * DAY_MS);
    result.push(dayScores.get(getDayKey(day)) ?? 0);
  }

  return result;
}

function buildDailyStats(
  dayCommitCounts: Map<string, number>,
  dayAdditions: Map<string, number>,
  dayDeletions: Map<string, number>,
): MyGrassDailyStat[] {
  const stats: MyGrassDailyStat[] = [];
  const todayStartMs = getUtcDayStartMs();

  for (let offset = 34; offset >= 0; offset -= 1) {
    const day = new Date(todayStartMs - offset * DAY_MS);
    const key = getDayKey(day);
    const additions = dayAdditions.get(key) ?? 0;
    const deletions = dayDeletions.get(key) ?? 0;

    stats.push({
      date: key,
      commits: dayCommitCounts.get(key) ?? 0,
      additions,
      deletions,
      change: additions + deletions,
    });
  }

  return stats;
}

function loadCache(): CompareCache {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as CompareCache;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return {};
  }
}

function saveCache(cache: CompareCache): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function cacheKey(repo: string, before: string, head: string): string {
  return `${repo}::${before}::${head}`;
}

function isFresh(entry: CompareCacheEntry): boolean {
  return Date.now() - new Date(entry.updatedAt).getTime() < CACHE_TTL_MS;
}

function daysToSince(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export interface MyGrassMetrics {
  additions: number;
  deletions: number;
  changeScore: number;
  net: number;
  commitCount: number;
  grid: number[];
  streakDays: number;
  dailyStats: MyGrassDailyStat[];
  topRepo: MyGrassTopRepo | null;
  dayCommits: number;
  nightCommits: number;
  syncedAt: string;
}

export interface MyGrassDailyStat {
  date: string;
  commits: number;
  additions: number;
  deletions: number;
  change: number;
}

export interface MyGrassTopRepo {
  name: string;
  commits: number;
  additions: number;
  deletions: number;
  change: number;
}

export interface KstDailyCommitCheck {
  yesterdayCommits: number;
  todayCommits: number;
  yesterdayKst: string;
  todayKst: string;
  checkedAt: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  });

  await Promise.all(workers);
  return results;
}

function asGithubError(error: unknown): GithubRequestError {
  return error as GithubRequestError;
}

async function fetchCompareTotals(
  token: string,
  repo: string,
  before: string,
  head: string,
  cache: CompareCache,
): Promise<{ additions: number; deletions: number; skipped: boolean }> {
  const key = cacheKey(repo, before, head);
  const cached = cache[key];

  if (cached && isFresh(cached)) {
    return { additions: cached.additions, deletions: cached.deletions, skipped: false };
  }

  try {
    const compare = await githubRequest<CompareResponse>(
      `/repos/${repo}/compare/${before}...${head}`,
      { token },
    );

    const totals = (compare.files ?? []).reduce(
      (acc, file) => ({
        additions: acc.additions + (file.additions ?? 0),
        deletions: acc.deletions + (file.deletions ?? 0),
      }),
      { additions: 0, deletions: 0 },
    );

    cache[key] = {
      additions: totals.additions,
      deletions: totals.deletions,
      updatedAt: new Date().toISOString(),
    };

    return { ...totals, skipped: false };
  } catch (error) {
    const githubError = asGithubError(error);

    if (githubError.status === 403 || githubError.status === 404) {
      return { additions: 0, deletions: 0, skipped: true };
    }

    throw error;
  }
}

export async function fetchMateMetrics(
  token: string,
  mates: Mate[],
  days: number,
): Promise<{ metrics: MateMetrics[]; syncedAt: string }> {
  const since = daysToSince(days);
  const cache = loadCache();

  const metrics = await mapWithConcurrency(mates, 3, async (mate) => {
    const events = await githubRequest<PublicEvent[]>(
      `/users/${encodeURIComponent(mate.username)}/events/public?per_page=100`,
      { token },
    );

    const lastActivityAt =
      events
        .filter((event) => event.type === 'PushEvent')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        ?.created_at ?? null;

    const pushEvents = events.filter((event) => {
      if (event.type !== 'PushEvent') return false;
      return new Date(event.created_at).getTime() >= since;
    });

    const compareResults = await mapWithConcurrency(pushEvents, 3, async (event) => {
      const before = event.payload?.before;
      const head = event.payload?.head;
      const repo = event.repo?.name;

      if (!before || !head || !repo || before === head) {
        return { additions: 0, deletions: 0, skipped: true };
      }

      return fetchCompareTotals(token, repo, before, head, cache);
    });

    const totals = compareResults.reduce(
      (acc, result) => {
        acc.additions += result.additions;
        acc.deletions += result.deletions;
        if (result.skipped) acc.skippedEvents += 1;
        return acc;
      },
      { additions: 0, deletions: 0, skippedEvents: 0 },
    );

    const dayScores = new Map<string, number>();
    pushEvents.forEach((event, index) => {
      const compare = compareResults[index];
      const changeScore = (compare?.additions ?? 0) + (compare?.deletions ?? 0);
      const activityScore = changeScore > 0 ? changeScore : 1;
      const dayKey = getDayKey(new Date(event.created_at));
      dayScores.set(dayKey, (dayScores.get(dayKey) ?? 0) + activityScore);
    });

    return {
      username: mate.username,
      nickname: mate.nickname,
      additions: totals.additions,
      deletions: totals.deletions,
      changeScore: totals.additions + totals.deletions,
      net: totals.additions - totals.deletions,
      lastActivityAt,
      sparklineData: buildMateSparkline(dayScores),
      comparedEvents: compareResults.length - totals.skippedEvents,
      skippedEvents: totals.skippedEvents,
    } satisfies MateMetrics;
  });

  saveCache(cache);

  return {
    metrics: metrics.sort((a, b) => b.changeScore - a.changeScore),
    syncedAt: new Date().toISOString(),
  };
}

export async function fetchMyGrassMetrics(
  token: string,
  username: string,
  days: number,
): Promise<MyGrassMetrics> {
  const sinceMs = daysToSince(days);
  const sinceIso = new Date(sinceMs).toISOString();

  const repos = await githubRequest<RepoSummary[]>(
    '/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
    { token },
  );

  const targetRepos = repos.filter((repo) => {
    if (repo.private) return false;
    if (!repo.pushed_at) return false;
    return new Date(repo.pushed_at).getTime() >= sinceMs;
  });

  const dayCommitCounts = new Map<string, number>();
  const dayAdditions = new Map<string, number>();
  const dayDeletions = new Map<string, number>();
  const repoStats = new Map<string, { commits: number; additions: number; deletions: number; change: number }>();
  let dayCommits = 0;
  let nightCommits = 0;
  let additions = 0;
  let deletions = 0;
  let commitCount = 0;

  await mapWithConcurrency(targetRepos, 3, async (repo) => {
    const commits = await githubRequest<CommitListItem[]>(
      `/repos/${repo.full_name}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(sinceIso)}&per_page=100`,
      { token },
    );

    await mapWithConcurrency(commits, 3, async (commit) => {
      try {
        const detail = await githubRequest<CommitDetailResponse>(
          `/repos/${repo.full_name}/commits/${commit.sha}`,
          { token },
        );

        const commitAdditions = detail.stats?.additions ?? 0;
        const commitDeletions = detail.stats?.deletions ?? 0;
        const commitDate = detail.commit?.author?.date
          ? new Date(detail.commit.author.date)
          : new Date();

        additions += commitAdditions;
        deletions += commitDeletions;
        commitCount += 1;

        const key = getDayKey(commitDate);
        dayCommitCounts.set(key, (dayCommitCounts.get(key) ?? 0) + 1);
        dayAdditions.set(key, (dayAdditions.get(key) ?? 0) + commitAdditions);
        dayDeletions.set(key, (dayDeletions.get(key) ?? 0) + commitDeletions);

        const hour = commitDate.getHours();
        if (hour >= 6 && hour < 18) {
          dayCommits += 1;
        } else {
          nightCommits += 1;
        }

        const currentRepo = repoStats.get(repo.full_name) ?? {
          commits: 0,
          additions: 0,
          deletions: 0,
          change: 0,
        };
        const nextRepo = {
          commits: currentRepo.commits + 1,
          additions: currentRepo.additions + commitAdditions,
          deletions: currentRepo.deletions + commitDeletions,
          change: currentRepo.change + commitAdditions + commitDeletions,
        };
        repoStats.set(repo.full_name, nextRepo);
      } catch (error) {
        const githubError = asGithubError(error);
        if (githubError.status === 403 || githubError.status === 404) return;
        throw error;
      }
    });
  });

  const topRepoEntry = [...repoStats.entries()].sort((a, b) => {
    const byChange = b[1].change - a[1].change;
    if (byChange !== 0) return byChange;
    return b[1].commits - a[1].commits;
  })[0];

  return {
    additions,
    deletions,
    changeScore: additions + deletions,
    net: additions - deletions,
    commitCount,
    grid: buildGrassGrid(dayCommitCounts),
    streakDays: calculateStreak(dayCommitCounts),
    dailyStats: buildDailyStats(dayCommitCounts, dayAdditions, dayDeletions),
    topRepo: topRepoEntry
      ? {
          name: topRepoEntry[0],
          commits: topRepoEntry[1].commits,
          additions: topRepoEntry[1].additions,
          deletions: topRepoEntry[1].deletions,
          change: topRepoEntry[1].change,
        }
      : null,
    dayCommits,
    nightCommits,
    syncedAt: new Date().toISOString(),
  };
}

export async function fetchMyKstDailyCommitCheck(
  token: string,
  username: string,
): Promise<KstDailyCommitCheck> {
  const todayStartMsKst = getKstDayStartMs();
  const yesterdayStartMsKst = todayStartMsKst - DAY_MS;
  const sinceIso = new Date(yesterdayStartMsKst).toISOString();
  const todayKst = getKstDayKeyFromMs(todayStartMsKst);
  const yesterdayKst = getKstDayKeyFromMs(yesterdayStartMsKst);

  const repos = await githubRequest<RepoSummary[]>(
    '/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
    { token },
  );

  const targetRepos = repos.filter((repo) => {
    if (repo.private) return false;
    if (!repo.pushed_at) return false;
    return new Date(repo.pushed_at).getTime() >= yesterdayStartMsKst;
  });

  let todayCommits = 0;
  let yesterdayCommits = 0;

  await mapWithConcurrency(targetRepos, 3, async (repo) => {
    const commits = await githubRequest<CommitListItem[]>(
      `/repos/${repo.full_name}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(sinceIso)}&per_page=100`,
      { token },
    );

    commits.forEach((commit) => {
      const rawDate = commit.commit?.author?.date;
      if (!rawDate) return;

      const commitMs = new Date(rawDate).getTime();
      if (Number.isNaN(commitMs) || commitMs < yesterdayStartMsKst) return;

      const dayKey = getKstDayKeyFromMs(commitMs);
      if (dayKey === todayKst) todayCommits += 1;
      if (dayKey === yesterdayKst) yesterdayCommits += 1;
    });
  });

  return {
    yesterdayCommits,
    todayCommits,
    yesterdayKst,
    todayKst,
    checkedAt: new Date().toISOString(),
  };
}
