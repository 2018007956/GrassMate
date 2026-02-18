import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { MacOSPopover } from './components/MacOSPopover';
import { PopoverHeader } from './components/PopoverHeader';
import { SegmentedControl } from './components/SegmentedControl';
import { TimeRangePills } from './components/TimeRangePills';
import { MateRow } from './components/MateRow';
import { GrassGrid } from './components/GrassGrid';
import { LeaderboardRow } from './components/LeaderboardRow';
import { AddMateModal } from './components/AddMateModal';
import { SettingsWindow } from './components/SettingsWindow';
import { AutoFitText } from './components/AutoFitText';
import { EmptyState } from './components/EmptyState';
import { LoadingState } from './components/LoadingState';
import { ErrorState } from './components/ErrorState';
import { useAuth } from '../hooks/useAuth';
import {
  fetchMateMetrics,
  fetchMyKstDailyCommitCheck,
  fetchMyGrassMetrics,
  type MyGrassMetrics,
  type MyGrassDailyStat,
} from '../services/github/metrics';
import { fetchUserByUsername, type GithubLookupUser } from '../services/github/user';
import { matesStore } from '../services/mates/store';
import { ONE_HOUR_MS } from '../services/query/client';
import type { GithubRequestError, Mate, MateMetrics } from '../types/github';

// Generate mock grass grid data (35 days)
type AutoRefreshInterval = '12h' | '24h' | 'manual';
const TIME_RANGE_OPTIONS = ['오늘', '7일', '30일'] as const;

const EMPTY_GRASS_GRID = Array.from({ length: 35 }, () => 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_SYNC_KEY = 'grassmate.last_sync';
const REFRESH_INTERVAL_KEY = 'grassmate.settings.refreshInterval';
const REFRESH_INTERVAL_EVENT = 'grassmate:refresh-interval-changed';
const SYNC_REQUEST_EVENT = 'grassmate:sync-request';
const SYNC_COMPLETE_EVENT = 'grassmate:sync-complete';
const SYNC_BATCH_COMPLETE_EVENT = 'grassmate:sync-batch-complete';
const FOLLOW_PINNED_KEY = 'grassmate.follow.pinned.v1';
const FOLLOW_PINNED_LIMIT = 2;
const EMPTY_SPARKLINE = Array.from({ length: 14 }, () => 0);
const STREAK_LOOKBACK_DAYS = 365;
const RANK_ALERT_KEY = 'grassmate.settings.rankAlert';
const STREAK_ALERT_KEY = 'grassmate.settings.streakAlert';
const STREAK_KST_CHECKED_DAY_KEY_PREFIX = 'grassmate.alert.streakKst18Checked.v1';

interface SyncRequestDetail {
  force?: boolean;
  source?: 'auto' | 'manual';
  requestId?: string;
}

interface RefreshIntervalChangeDetail {
  interval?: string;
}

interface InAppNotification {
  id: number;
  title: string;
  message: string;
}

function getLocalDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthDay(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function getUtcStartOfDayMs(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

function getUtcWeekStartMs(nowMs: number = Date.now()): number {
  const startOfDayInUtcMs = getUtcStartOfDayMs(nowMs);
  const weekDayOffset = (new Date(startOfDayInUtcMs).getUTCDay() + 6) % 7; // Monday=0 ... Sunday=6
  return startOfDayInUtcMs - weekDayOffset * DAY_MS;
}

function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

function buildMateFromLookup(
  profile: GithubLookupUser,
  fallbackNickname?: string,
): Mate {
  const nickname = fallbackNickname?.trim();

  return {
    username: normalizeUsername(profile.login),
    nickname: nickname || profile.name || undefined,
    avatarUrl: profile.avatar_url,
    profileUrl: profile.html_url,
  };
}

function toAddMateErrorMessage(error: unknown): string {
  const status = (error as GithubRequestError)?.status;
  if (status === 404) return '존재하지 않는 GitHub 아이디입니다.';

  if (error instanceof Error) return error.message;
  return '메이트를 추가하지 못했어요.';
}

function formatRelativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (elapsed < 60_000) return '방금';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  return `${Math.floor(elapsed / 3_600_000)}시간 전`;
}

function getDaysSinceWeekStart(): number {
  const weekStartMs = getUtcWeekStartMs();
  return Math.max((Date.now() - weekStartMs) / DAY_MS, 0.01);
}

function getSelectedDaysForRange(range: string): number {
  if (range === '오늘') {
    const startOfTodayMs = getUtcStartOfDayMs();
    return Math.max((Date.now() - startOfTodayMs) / DAY_MS, 0.01);
  }

  if (range === '30일') return 30;
  return 7;
}

function getMyGrassQueryKey(username: string, range: 'selected' | 'weekly' | 'streak', scope: string) {
  return ['my-grass', username, range, scope] as const;
}

function getMateMetricQueryKey(username: string, weekKey: string) {
  return ['mate-metrics', username, weekKey] as const;
}

function getRankMetricQueryKey(range: string, matesSignature: string) {
  return ['rank-metrics', range, matesSignature] as const;
}

function getRankTopThreeSnapshotKey(range: string): string {
  return `grassmate.alert.rankTopThree.${range}`;
}

function loadBooleanSetting(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function isRefreshInterval(value: unknown): value is AutoRefreshInterval {
  return value === '12h' || value === '24h' || value === 'manual';
}

function loadRefreshIntervalSetting(): AutoRefreshInterval {
  const saved = localStorage.getItem(REFRESH_INTERVAL_KEY);
  if (isRefreshInterval(saved)) return saved;
  return 'manual';
}

function refreshIntervalToMs(interval: AutoRefreshInterval): number | null {
  if (interval === '12h') return 12 * 60 * 60 * 1000;
  if (interval === '24h') return 24 * 60 * 60 * 1000;
  return null;
}

function parseStoredStringArray(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function areSameOrder(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function loadPinnedMateUsernames(): string[] {
  const parsed = parseStoredStringArray(localStorage.getItem(FOLLOW_PINNED_KEY));
  const normalized = Array.from(
    new Set(parsed.map((username) => normalizeUsername(username)).filter(Boolean)),
  ).slice(0, FOLLOW_PINNED_LIMIT);

  if (!areSameOrder(parsed, normalized)) {
    localStorage.setItem(FOLLOW_PINNED_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

function getTopThreeUsernames(metricsByUsername: Record<string, MateMetrics>): string[] {
  return Object.values(metricsByUsername)
    .map((metric) => ({
      username: normalizeUsername(metric.username),
      change: metric.changeScore,
      additions: metric.additions,
    }))
    .sort((a, b) => {
      const byChange = b.change - a.change;
      if (byChange !== 0) return byChange;

      const byAdditions = b.additions - a.additions;
      if (byAdditions !== 0) return byAdditions;

      return a.username.localeCompare(b.username);
    })
    .slice(0, 3)
    .map((item) => item.username);
}

function getFirstTopThreeOvertake(
  previousTopThree: string[],
  currentTopThree: string[],
): { mover: string; overtaken: string } | null {
  for (let currentIndex = 0; currentIndex < currentTopThree.length; currentIndex += 1) {
    const mover = currentTopThree[currentIndex];
    const previousIndex = previousTopThree.indexOf(mover);
    if (previousIndex === -1 || previousIndex <= currentIndex) continue;

    const overtaken = previousTopThree[currentIndex];
    if (!overtaken || overtaken === mover) continue;
    return { mover, overtaken };
  }

  const newcomer = currentTopThree.find((username) => !previousTopThree.includes(username));
  const dropped = previousTopThree.find((username) => !currentTopThree.includes(username));

  if (newcomer && dropped) {
    return { mover: newcomer, overtaken: dropped };
  }

  return null;
}

function getDisplayNameForUsername(
  username: string,
  mates: Mate[],
  mateProfiles: Record<string, GithubLookupUser>,
  currentUserLogin?: string,
): string {
  const normalizedUsername = normalizeUsername(username);
  const normalizedCurrentUser = currentUserLogin ? normalizeUsername(currentUserLogin) : null;

  if (normalizedCurrentUser === normalizedUsername && currentUserLogin) {
    return currentUserLogin;
  }

  const matchedMate = mates.find((mate) => normalizeUsername(mate.username) === normalizedUsername);
  if (matchedMate?.nickname) return matchedMate.nickname;

  const profile = mateProfiles[normalizedUsername];
  return profile?.name ?? profile?.login ?? matchedMate?.username ?? normalizedUsername;
}

function getKstDayKey(nowMs: number = Date.now()): string {
  const shifted = new Date(nowMs + 9 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextKstSixPmMs(nowMs: number = Date.now()): number {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const dayStartMs = Math.floor((nowMs + kstOffsetMs) / DAY_MS) * DAY_MS - kstOffsetMs;
  const sixPmMs = dayStartMs + 18 * 60 * 60 * 1000;
  if (nowMs < sixPmMs) return sixPmMs;
  return sixPmMs + DAY_MS;
}

function isAfterKstSixPm(nowMs: number = Date.now()): boolean {
  const kstHour = new Date(nowMs + 9 * 60 * 60 * 1000).getUTCHours();
  return kstHour >= 18;
}

function getStreakKstCheckedDayKey(username: string): string {
  return `${STREAK_KST_CHECKED_DAY_KEY_PREFIX}.${normalizeUsername(username)}`;
}


type ViewMode = 'Follow' | 'My' | 'Rank' | 'loading' | 'error-rate' | 'error-token';

export function LegacyApp() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('Follow');
  const [selectedTab, setSelectedTab] = useState('Follow');
  const [isDark, setIsDark] = useState(false);
  const [showAddMate, setShowAddMate] = useState(false);
  const [mates, setMates] = useState<Mate[]>(() => matesStore.list());
  const [mateProfiles, setMateProfiles] = useState<Record<string, GithubLookupUser>>({});
  const [followMetrics, setFollowMetrics] = useState<Record<string, { metric: MateMetrics; syncedAt: string }>>({});
  const [followMetricLoading, setFollowMetricLoading] = useState<Record<string, boolean>>({});
  const [rankMetrics, setRankMetrics] = useState<Record<string, MateMetrics>>({});
  const [rankMetricLoading, setRankMetricLoading] = useState(false);
  const [rankManualSyncedAtByRange, setRankManualSyncedAtByRange] = useState<Record<string, string>>({});
  const [followSearchInput, setFollowSearchInput] = useState('');
  const [followAddError, setFollowAddError] = useState<string | null>(null);
  const [isAddingMate, setIsAddingMate] = useState(false);
  const [pinnedMateUsernames, setPinnedMateUsernames] = useState<string[]>(() =>
    loadPinnedMateUsernames(),
  );
  const [showSettings, setShowSettings] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<AutoRefreshInterval>(() => loadRefreshIntervalSetting());
  const [timeRange, setTimeRange] = useState('오늘');
  const [myGrassLoading, setMyGrassLoading] = useState(false);
  const [myGrassError, setMyGrassError] = useState<string | null>(null);
  const [myGrassSyncedAt, setMyGrassSyncedAt] = useState<string | null>(() => localStorage.getItem(LAST_SYNC_KEY));
  const [myGrassAdditions, setMyGrassAdditions] = useState(0);
  const [myGrassDeletions, setMyGrassDeletions] = useState(0);
  const [myGrassGrid, setMyGrassGrid] = useState<number[]>(EMPTY_GRASS_GRID);
  const [myGrassStreakDays, setMyGrassStreakDays] = useState(0);
  const [myNoActivityOverLookback, setMyNoActivityOverLookback] = useState(false);
  const [myGrassDailyStats, setMyGrassDailyStats] = useState<MyGrassDailyStat[]>([]);
  const [myWeeklyTopRepo, setMyWeeklyTopRepo] = useState<string>('-');
  const [myWeeklyDayCommits, setMyWeeklyDayCommits] = useState(0);
  const [myWeeklyNightCommits, setMyWeeklyNightCommits] = useState(0);
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);
  const notificationIdRef = useRef(1);
  const notificationTimerRef = useRef<number[]>([]);
  const rankAlertInitializedByKeyRef = useRef<Record<string, boolean>>({});
  const normalizedSelfLogin = useMemo(
    () => (user?.login ? normalizeUsername(user.login) : null),
    [user?.login],
  );

  const mateSignature = useMemo(
    () => mates.map((mate) => normalizeUsername(mate.username)).sort().join(','),
    [mates],
  );

  const currentWeekStart = useMemo(() => new Date(getUtcWeekStartMs()), []);
  const currentWeekStartKey = useMemo(() => getLocalDayKey(currentWeekStart), [currentWeekStart]);
  const currentWeekDays = useMemo(
    () => Math.max((Date.now() - currentWeekStart.getTime()) / DAY_MS, 0.01),
    [currentWeekStart],
  );
  const currentWeekRangeLabel = useMemo(() => {
    const today = new Date();
    return `${formatMonthDay(currentWeekStart)} ~ ${formatMonthDay(today)}`;
  }, [currentWeekStart]);

  const weeklySummary = useMemo(() => {
    const weekDays = myGrassDailyStats.filter((day) => day.date >= currentWeekStartKey);
    const workingDays = weekDays.filter((day) => day.commits > 0).length;
    const commitPeriod =
      myWeeklyDayCommits === 0 && myWeeklyNightCommits === 0
        ? 'none'
        : myWeeklyDayCommits === myWeeklyNightCommits
          ? 'equal'
          : myWeeklyNightCommits > myWeeklyDayCommits
            ? 'night'
            : 'day';

    return {
      workingDays,
      topRepoLabel: myWeeklyTopRepo,
      commitPeriod,
    };
  }, [currentWeekStartKey, myGrassDailyStats, myWeeklyDayCommits, myWeeklyNightCommits, myWeeklyTopRepo]);

  const isRankAlertEnabled = useCallback(
    () => loadBooleanSetting(RANK_ALERT_KEY, true),
    [],
  );
  const isStreakAlertEnabled = useCallback(
    () => loadBooleanSetting(STREAK_ALERT_KEY, false),
    [],
  );

  const dismissNotification = useCallback((id: number) => {
    setInAppNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushNotification = useCallback(
    (title: string, message: string) => {
      const id = notificationIdRef.current;
      notificationIdRef.current += 1;

      setInAppNotifications((prev) => [...prev, { id, title, message }].slice(-3));

      const timerId = window.setTimeout(() => {
        dismissNotification(id);
      }, 7000);
      notificationTimerRef.current.push(timerId);

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: message });
      }
    },
    [dismissNotification],
  );

  useEffect(() => {
    return () => {
      notificationTimerRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      notificationTimerRef.current = [];
    };
  }, []);

  useEffect(() => {
    const onRefreshIntervalChanged = (event: Event) => {
      const detail = (event as CustomEvent<RefreshIntervalChangeDetail>).detail;
      if (isRefreshInterval(detail?.interval)) {
        setRefreshInterval(detail.interval);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== REFRESH_INTERVAL_KEY) return;
      if (isRefreshInterval(event.newValue)) {
        setRefreshInterval(event.newValue);
        return;
      }
      if (event.newValue === null) {
        setRefreshInterval('manual');
      }
    };

    window.addEventListener(REFRESH_INTERVAL_EVENT, onRefreshIntervalChanged as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(REFRESH_INTERVAL_EVENT, onRefreshIntervalChanged as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const loadMyGrass = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token || !normalizedSelfLogin) return null;

      setMyGrassLoading(true);
      setMyGrassError(null);
      let syncError: string | null = null;
      let syncedAt: string | null = null;

      try {
        const selectedDays = getSelectedDaysForRange(timeRange);
        const selectedKey = getMyGrassQueryKey(normalizedSelfLogin, 'selected', timeRange);
        const weeklyKey = getMyGrassQueryKey(normalizedSelfLogin, 'weekly', currentWeekStartKey);
        const streakKey = getMyGrassQueryKey(normalizedSelfLogin, 'streak', 'recent');

        const [selectedMetric, weeklyMetric, streakMetric] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: selectedKey,
            queryFn: () => fetchMyGrassMetrics(token, normalizedSelfLogin, selectedDays),
            staleTime: force ? 0 : ONE_HOUR_MS,
            gcTime: ONE_HOUR_MS,
          }),
          queryClient.fetchQuery({
            queryKey: weeklyKey,
            queryFn: () => fetchMyGrassMetrics(token, normalizedSelfLogin, currentWeekDays),
            staleTime: force ? 0 : ONE_HOUR_MS,
            gcTime: ONE_HOUR_MS,
          }),
          queryClient.fetchQuery({
            queryKey: streakKey,
            queryFn: () => fetchMyGrassMetrics(token, normalizedSelfLogin, STREAK_LOOKBACK_DAYS),
            staleTime: force ? 0 : ONE_HOUR_MS,
            gcTime: ONE_HOUR_MS,
          }),
        ]);

        setMyGrassAdditions(selectedMetric.additions);
        setMyGrassDeletions(selectedMetric.deletions);
        setMyGrassGrid(streakMetric.grid);
        // Keep streak independent from today/7d/30d and weekly summary ranges.
        setMyGrassStreakDays(streakMetric.streakDays);
        setMyNoActivityOverLookback(streakMetric.commitCount === 0);
        setMyGrassDailyStats(weeklyMetric.dailyStats);
        setMyWeeklyTopRepo(
          weeklyMetric.topRepo
            ? (weeklyMetric.topRepo.name.split('/').pop() ?? weeklyMetric.topRepo.name)
            : '-',
        );
        setMyWeeklyDayCommits(weeklyMetric.dayCommits);
        setMyWeeklyNightCommits(weeklyMetric.nightCommits);
        syncedAt = selectedMetric.syncedAt;
        setMyGrassSyncedAt(selectedMetric.syncedAt);
        localStorage.setItem(LAST_SYNC_KEY, selectedMetric.syncedAt);
        return selectedMetric;
      } catch (error) {
        syncError = error instanceof Error ? error.message : '내 잔디 정보를 불러오지 못했습니다.';
        setMyGrassError(syncError);
        return null;
      } finally {
        window.dispatchEvent(
          new CustomEvent(SYNC_COMPLETE_EVENT, {
            detail: syncError ? { error: syncError } : { syncedAt },
          }),
        );
        setMyGrassLoading(false);
      }
    },
    [currentWeekDays, currentWeekStartKey, normalizedSelfLogin, queryClient, timeRange, token],
  );

  const prefetchMyGrassRange = useCallback(
    async (range: string, { force = false }: { force?: boolean } = {}) => {
      if (!token || !normalizedSelfLogin) return null;

      const selectedDays = getSelectedDaysForRange(range);
      const selectedKey = getMyGrassQueryKey(normalizedSelfLogin, 'selected', range);
      const selectedMetric = await queryClient.fetchQuery({
        queryKey: selectedKey,
        queryFn: () => fetchMyGrassMetrics(token, normalizedSelfLogin, selectedDays),
        staleTime: force ? 0 : ONE_HOUR_MS,
        gcTime: ONE_HOUR_MS,
      });

      return selectedMetric.syncedAt;
    },
    [normalizedSelfLogin, queryClient, token],
  );

  useEffect(() => {
    const missingProfiles = mates.filter((mate) => !mateProfiles[mate.username]);
    if (missingProfiles.length === 0) return;

    let cancelled = false;

    void Promise.all(
      missingProfiles.map(async (mate) => {
        try {
          const profile = await fetchUserByUsername(mate.username, token);
          const normalizedLogin = normalizeUsername(profile.login);

          if (cancelled) return;
          setMateProfiles((prev) => {
            if (prev[normalizedLogin]) return prev;
            return { ...prev, [normalizedLogin]: profile };
          });
        } catch {
          // Keep fallback avatar/name when lookup fails.
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [mateProfiles, mates, token]);

  const refreshMateProfiles = useCallback(async () => {
    if (!token || mates.length === 0) return;

    const results = await Promise.allSettled(
      mates.map((mate) => fetchUserByUsername(mate.username, token)),
    );

    setMateProfiles((prev) => {
      let changed = false;
      const next = { ...prev };

      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;

        const profile = result.value;
        const normalizedLogin = normalizeUsername(profile.login);
        const current = next[normalizedLogin];

        if (
          current?.id === profile.id &&
          current?.avatar_url === profile.avatar_url &&
          current?.name === profile.name &&
          current?.html_url === profile.html_url
        ) {
          return;
        }

        next[normalizedLogin] = profile;
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [mates, token]);

  const syncMateMetric = useCallback(
    async (mate: Mate, { force = false }: { force?: boolean } = {}) => {
      if (!token) return;

      const normalizedUsername = normalizeUsername(mate.username);
      setFollowMetricLoading((prev) => ({ ...prev, [normalizedUsername]: true }));

      try {
        const cached = await queryClient.fetchQuery({
          queryKey: getMateMetricQueryKey(normalizedUsername, currentWeekStartKey),
          queryFn: async () => {
            const result = await fetchMateMetrics(token, [mate], getDaysSinceWeekStart());
            const metric = result.metrics[0] ?? {
              username: normalizedUsername,
              nickname: mate.nickname,
              additions: 0,
              deletions: 0,
              changeScore: 0,
              net: 0,
              lastActivityAt: null,
              sparklineData: EMPTY_SPARKLINE,
              comparedEvents: 0,
              skippedEvents: 0,
            };

            return {
              metric,
              syncedAt: result.syncedAt,
            };
          },
          staleTime: force ? 0 : ONE_HOUR_MS,
          gcTime: ONE_HOUR_MS,
        });

        setFollowMetrics((prev) => ({
          ...prev,
          [normalizedUsername]: cached,
        }));
      } catch {
        // Keep zero value fallback when metrics sync fails.
      } finally {
        setFollowMetricLoading((prev) => {
          if (!prev[normalizedUsername]) return prev;

          const next = { ...prev };
          delete next[normalizedUsername];
          return next;
        });
      }
    },
    [currentWeekStartKey, queryClient, token],
  );

  const refreshFollowData = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (mates.length === 0) return;

      await Promise.all([
        refreshMateProfiles(),
        ...mates.map((mate) => syncMateMetric(mate, { force })),
      ]);
    },
    [mates, refreshMateProfiles, syncMateMetric],
  );

  const loadRankMetrics = useCallback(
    async ({ force = false, selfMetricOverride = null }: { force?: boolean; selfMetricOverride?: MyGrassMetrics | null } = {}) => {
      if (!token || !normalizedSelfLogin) return null;

      setRankMetricLoading(true);

      try {
        const selectedDays = getSelectedDaysForRange(timeRange);
        const selfMetricPromise = selfMetricOverride
          ? Promise.resolve(selfMetricOverride)
          : queryClient.fetchQuery({
              queryKey: getMyGrassQueryKey(normalizedSelfLogin, 'selected', timeRange),
              queryFn: () => fetchMyGrassMetrics(token, normalizedSelfLogin, selectedDays),
              staleTime: force ? 0 : ONE_HOUR_MS,
              gcTime: ONE_HOUR_MS,
            });

        if (mates.length === 0) {
          const selfMetric = await selfMetricPromise;

          setMyGrassAdditions(selfMetric.additions);
          setMyGrassDeletions(selfMetric.deletions);
          setMyGrassSyncedAt(selfMetric.syncedAt);
          localStorage.setItem(LAST_SYNC_KEY, selfMetric.syncedAt);

          setRankMetrics({
            [normalizedSelfLogin]: {
              username: normalizedSelfLogin,
              additions: selfMetric.additions,
              deletions: selfMetric.deletions,
              changeScore: selfMetric.changeScore,
              net: selfMetric.net,
              lastActivityAt: null,
              sparklineData: EMPTY_SPARKLINE,
              comparedEvents: 0,
              skippedEvents: 0,
            },
          });

          return selfMetric.syncedAt;
        }

        const [cached, selfMetric] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: getRankMetricQueryKey(timeRange, mateSignature),
            queryFn: () => fetchMateMetrics(token, mates, selectedDays),
            staleTime: force ? 0 : ONE_HOUR_MS,
            gcTime: ONE_HOUR_MS,
          }),
          selfMetricPromise,
        ]);

        const metricsByUsername = cached.metrics.reduce<Record<string, MateMetrics>>((acc, metric) => {
          acc[normalizeUsername(metric.username)] = metric;
          return acc;
        }, {});

        const existing = metricsByUsername[normalizedSelfLogin];
        metricsByUsername[normalizedSelfLogin] = {
          username: normalizedSelfLogin,
          nickname: existing?.nickname,
          additions: selfMetric.additions,
          deletions: selfMetric.deletions,
          changeScore: selfMetric.additions + selfMetric.deletions,
          net: selfMetric.additions - selfMetric.deletions,
          lastActivityAt: existing?.lastActivityAt ?? null,
          sparklineData: existing?.sparklineData ?? EMPTY_SPARKLINE,
          comparedEvents: existing?.comparedEvents ?? 0,
          skippedEvents: existing?.skippedEvents ?? 0,
        };

        const snapshotKey = getRankTopThreeSnapshotKey(timeRange);
        const currentTopThree = getTopThreeUsernames(metricsByUsername);
        const previousTopThree = parseStoredStringArray(localStorage.getItem(snapshotKey));
        localStorage.setItem(snapshotKey, JSON.stringify(currentTopThree));

        if (rankAlertInitializedByKeyRef.current[snapshotKey]) {
          if (isRankAlertEnabled() && previousTopThree.length === 3 && currentTopThree.length === 3 && !areSameOrder(previousTopThree, currentTopThree)) {
            const overtaking = getFirstTopThreeOvertake(previousTopThree, currentTopThree);

            if (overtaking) {
              const moverName = getDisplayNameForUsername(overtaking.mover, mates, mateProfiles, user?.login);
              const overtakenName = getDisplayNameForUsername(overtaking.overtaken, mates, mateProfiles, user?.login);

              pushNotification(
                'Top 3 순위 변동',
                `${moverName}님이 ${overtakenName}님을 추월했습니다.`,
              );
            }
          }
        } else {
          rankAlertInitializedByKeyRef.current[snapshotKey] = true;
        }

        setRankMetrics(metricsByUsername);
        return cached.syncedAt;
      } catch {
        if (selfMetricOverride) {
          setRankMetrics((prev) => {
            const existing = prev[normalizedSelfLogin];

            return {
              ...prev,
              [normalizedSelfLogin]: {
                username: normalizedSelfLogin,
                nickname: existing?.nickname,
                additions: selfMetricOverride.additions,
                deletions: selfMetricOverride.deletions,
                changeScore: selfMetricOverride.changeScore,
                net: selfMetricOverride.net,
                lastActivityAt: existing?.lastActivityAt ?? null,
                sparklineData: existing?.sparklineData ?? EMPTY_SPARKLINE,
                comparedEvents: existing?.comparedEvents ?? 0,
                skippedEvents: existing?.skippedEvents ?? 0,
              },
            };
          });
        }
        // Keep previous snapshot when rank sync fails.
        return null;
      } finally {
        setRankMetricLoading(false);
      }
    },
    [isRankAlertEnabled, mateProfiles, mateSignature, mates, normalizedSelfLogin, pushNotification, queryClient, timeRange, token, user?.login],
  );

  const prefetchRankRangeForMates = useCallback(
    async (range: string, matesSnapshot: Mate[], { force = false }: { force?: boolean } = {}) => {
      if (!token || !normalizedSelfLogin) return null;

      if (matesSnapshot.length === 0) {
        const selectedDays = getSelectedDaysForRange(range);
        const selfMetric = await queryClient.fetchQuery({
          queryKey: getMyGrassQueryKey(normalizedSelfLogin, 'selected', range),
          queryFn: () => fetchMyGrassMetrics(token, normalizedSelfLogin, selectedDays),
          staleTime: force ? 0 : ONE_HOUR_MS,
          gcTime: ONE_HOUR_MS,
        });
        return selfMetric.syncedAt;
      }

      const selectedDays = getSelectedDaysForRange(range);
      const matesSignatureForRange = Array.from(
        new Set(matesSnapshot.map((mate) => normalizeUsername(mate.username))),
      )
        .sort()
        .join(',');

      const cached = await queryClient.fetchQuery({
        queryKey: getRankMetricQueryKey(range, matesSignatureForRange),
        queryFn: () => fetchMateMetrics(token, matesSnapshot, selectedDays),
        staleTime: force ? 0 : ONE_HOUR_MS,
        gcTime: ONE_HOUR_MS,
      });

      return cached.syncedAt;
    },
    [normalizedSelfLogin, queryClient, token],
  );

  const prefetchRankRange = useCallback(
    async (range: string, { force = false }: { force?: boolean } = {}) => {
      return prefetchRankRangeForMates(range, mates, { force });
    },
    [mates, prefetchRankRangeForMates],
  );

  const applyRankMetricsFromCache = useCallback(
    (range: string) => {
      const normalizedSelfLogin = user?.login ? normalizeUsername(user.login) : null;

      if (mates.length === 0) {
        if (!normalizedSelfLogin) {
          setRankMetrics({});
          setRankMetricLoading(false);
          return;
        }

        const selfMetric = queryClient.getQueryData<MyGrassMetrics>(
          getMyGrassQueryKey(normalizedSelfLogin, 'selected', range),
        );

        if (!selfMetric) {
          setRankMetrics({});
          setRankMetricLoading(false);
          return;
        }

        setRankMetrics({
          [normalizedSelfLogin]: {
            username: normalizedSelfLogin,
            additions: selfMetric.additions,
            deletions: selfMetric.deletions,
            changeScore: selfMetric.changeScore,
            net: selfMetric.net,
            lastActivityAt: null,
            sparklineData: EMPTY_SPARKLINE,
            comparedEvents: 0,
            skippedEvents: 0,
          },
        });
        setRankMetricLoading(false);
        return;
      }

      const cached = queryClient.getQueryData<{ metrics: MateMetrics[]; syncedAt: string }>(
        getRankMetricQueryKey(range, mateSignature),
      );

      if (!cached) {
        setRankMetrics({});
        setRankMetricLoading(false);
        return;
      }

      const metricsByUsername = cached.metrics.reduce<Record<string, MateMetrics>>((acc, metric) => {
        acc[normalizeUsername(metric.username)] = metric;
        return acc;
      }, {});

      const selfMetric =
        normalizedSelfLogin
          ? queryClient.getQueryData<MyGrassMetrics>(
              getMyGrassQueryKey(normalizedSelfLogin, 'selected', range),
            )
          : null;

      if (normalizedSelfLogin && selfMetric) {
        const existing = metricsByUsername[normalizedSelfLogin];
        metricsByUsername[normalizedSelfLogin] = {
          username: normalizedSelfLogin,
          nickname: existing?.nickname,
          additions: selfMetric.additions,
          deletions: selfMetric.deletions,
          changeScore: selfMetric.additions + selfMetric.deletions,
          net: selfMetric.additions - selfMetric.deletions,
          lastActivityAt: existing?.lastActivityAt ?? null,
          sparklineData: existing?.sparklineData ?? EMPTY_SPARKLINE,
          comparedEvents: existing?.comparedEvents ?? 0,
          skippedEvents: existing?.skippedEvents ?? 0,
        };
      }

      setRankMetrics(metricsByUsername);
      setRankMetricLoading(false);
    },
    [mateSignature, mates, queryClient, user?.login],
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);

    const syncTasks: Promise<unknown>[] = [];

    if (selectedTab === 'Follow') {
      syncTasks.push(refreshFollowData({ force: true }));
    }

    if (selectedTab === 'My') {
      const otherRanges = TIME_RANGE_OPTIONS.filter((range) => range !== timeRange);
      syncTasks.push(
        Promise.all([
          loadMyGrass({ force: true }),
          ...otherRanges.map((range) => prefetchMyGrassRange(range, { force: true })),
        ]),
      );
    }

    if (selectedTab === 'Rank') {
      const currentRange = timeRange;
      const otherRanges = TIME_RANGE_OPTIONS.filter((range) => range !== currentRange);
      syncTasks.push(
        loadMyGrass({ force: true })
          .then((selfMetric) =>
            Promise.all([
              loadRankMetrics({ force: true, selfMetricOverride: selfMetric }).then((syncedAt) => ({
                range: currentRange,
                syncedAt,
              })),
              ...otherRanges.map((range) =>
                Promise.all([
                  prefetchMyGrassRange(range, { force: true }),
                  prefetchRankRange(range, { force: true }),
                ]).then(([, syncedAt]) => ({
                  range,
                  syncedAt,
                })),
              ),
            ]),
          )
          .then((results) => {
            setRankManualSyncedAtByRange((prev) => {
              const next = { ...prev };
              let changed = false;

              results.forEach(({ range, syncedAt }) => {
                if (!syncedAt || next[range] === syncedAt) return;
                next[range] = syncedAt;
                changed = true;
              });

              return changed ? next : prev;
            });
          }),
      );
    }

    void Promise.all(syncTasks).finally(() => {
      setIsRefreshing(false);
    });
  }, [loadMyGrass, loadRankMetrics, prefetchMyGrassRange, prefetchRankRange, refreshFollowData, selectedTab, timeRange]);

  useEffect(() => {
    const onSyncRequest = (event: Event) => {
      const detail = (event as CustomEvent<SyncRequestDetail>).detail;
      const force = Boolean(detail?.force);
      const isAutoSync = detail?.source === 'auto';
      const isManualSync = detail?.source === 'manual';
      const isGlobalSync = isAutoSync || isManualSync;
      const requestId = detail?.requestId;
      const syncTasks: Promise<unknown>[] = [];
      const shouldSyncFollow = isGlobalSync || selectedTab === 'Follow';
      const shouldSyncMyGrass =
        isGlobalSync ||
        selectedTab === 'Rank' ||
        (selectedTab !== 'My' && isStreakAlertEnabled());
      const shouldSyncRank = isGlobalSync || selectedTab === 'Rank' || (selectedTab !== 'Rank' && isRankAlertEnabled());
      let myGrassSyncPromise: Promise<MyGrassMetrics | null> | null = null;

      if (shouldSyncMyGrass) {
        myGrassSyncPromise = loadMyGrass({ force });
        syncTasks.push(myGrassSyncPromise);
      }

      if (shouldSyncFollow) {
        syncTasks.push(refreshFollowData({ force }));
      }

      if (shouldSyncRank) {
        const rankSyncPromise =
          selectedTab === 'Rank' && myGrassSyncPromise
            ? myGrassSyncPromise.then((selfMetric) =>
                loadRankMetrics({ force, selfMetricOverride: selfMetric }),
              )
            : loadRankMetrics({ force });

        syncTasks.push(
          rankSyncPromise.then((syncedAt) => {
            if ((isGlobalSync || (selectedTab === 'Rank' && force)) && syncedAt) {
              setRankManualSyncedAtByRange((prev) => ({ ...prev, [timeRange]: syncedAt }));
            }
          }),
        );
      }

      if (isManualSync) {
        TIME_RANGE_OPTIONS.filter((range) => range !== timeRange).forEach((range) => {
          syncTasks.push(prefetchMyGrassRange(range, { force }));
          syncTasks.push(
            prefetchRankRange(range, { force }).then((syncedAt) => {
              if (syncedAt) {
                setRankManualSyncedAtByRange((prev) => ({ ...prev, [range]: syncedAt }));
              }
            }),
          );
        });
      }

      void Promise.all(syncTasks)
        .then(() => {
          if (!requestId) return;
          window.dispatchEvent(
            new CustomEvent(SYNC_BATCH_COMPLETE_EVENT, {
              detail: { requestId },
            }),
          );
        })
        .catch((error) => {
          if (!requestId) return;
          window.dispatchEvent(
            new CustomEvent(SYNC_BATCH_COMPLETE_EVENT, {
              detail: {
                requestId,
                error: error instanceof Error ? error.message : '동기화에 실패했습니다.',
              },
            }),
          );
        });
    };

    window.addEventListener(SYNC_REQUEST_EVENT, onSyncRequest);
    return () => {
      window.removeEventListener(SYNC_REQUEST_EVENT, onSyncRequest);
    };
  }, [isRankAlertEnabled, isStreakAlertEnabled, loadMyGrass, loadRankMetrics, prefetchMyGrassRange, prefetchRankRange, refreshFollowData, selectedTab, timeRange]);

  useEffect(() => {
    if (!token) return;

    const intervalMs = refreshIntervalToMs(refreshInterval);
    if (!intervalMs) return;

    const timerId = window.setInterval(() => {
      window.dispatchEvent(
        new CustomEvent(SYNC_REQUEST_EVENT, {
          detail: { force: false, source: 'auto' },
        }),
      );
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [refreshInterval, token]);

  useEffect(() => {
    if (!token || !user?.login) return;
    void loadMyGrass();
  }, [currentWeekStartKey, token, user?.login]);

  useEffect(() => {
    if (!token || !normalizedSelfLogin) return;

    const cached = queryClient.getQueryData<MyGrassMetrics>(
      getMyGrassQueryKey(normalizedSelfLogin, 'selected', timeRange),
    );
    const streakCached = queryClient.getQueryData<MyGrassMetrics>(
      getMyGrassQueryKey(normalizedSelfLogin, 'streak', 'recent'),
    );

    if (!cached) {
      setMyGrassAdditions(0);
      setMyGrassDeletions(0);
      setMyGrassGrid(streakCached?.grid ?? EMPTY_GRASS_GRID);
      setMyGrassSyncedAt(null);
      return;
    }

    setMyGrassAdditions(cached.additions);
    setMyGrassDeletions(cached.deletions);
    setMyGrassGrid((prev) => streakCached?.grid ?? prev);
    setMyGrassSyncedAt(cached.syncedAt);
  }, [normalizedSelfLogin, queryClient, timeRange, token]);

  useEffect(() => {
    setFollowMetrics({});
    setFollowMetricLoading({});
  }, [currentWeekStartKey]);

  useEffect(() => {
    if (!token || mates.length === 0) return;

    const missingMates = mates.filter((mate) => {
      const normalizedUsername = normalizeUsername(mate.username);
      return !followMetrics[normalizedUsername] && !followMetricLoading[normalizedUsername];
    });

    if (missingMates.length === 0) return;

    missingMates.forEach((mate) => {
      void syncMateMetric(mate);
    });
  }, [followMetricLoading, followMetrics, mates, syncMateMetric, token]);

  useEffect(() => {
    if (!token || selectedTab !== 'Rank') return;
    applyRankMetricsFromCache(timeRange);
  }, [applyRankMetricsFromCache, rankManualSyncedAtByRange, selectedTab, timeRange, token]);

  const followRows = useMemo(
    () =>
      mates
        .map((mate, originalIndex) => {
          const username = normalizeUsername(mate.username);
          const profile = mateProfiles[username];
          const metric = followMetrics[username]?.metric;
          const isMetricLoading = Boolean(followMetricLoading[username]);
          const pinnedOrder = pinnedMateUsernames.indexOf(username);
          const isPinned = pinnedOrder !== -1;

          return {
            username,
            displayName: mate.nickname ?? profile?.name ?? profile?.login ?? username,
            avatar:
              mate.avatarUrl ??
              profile?.avatar_url ??
              `https://github.com/${encodeURIComponent(username)}.png?size=80`,
            additions: metric?.additions ?? 0,
            deletions: metric?.deletions ?? 0,
            change: metric?.changeScore ?? 0,
            trend: metric
              ? Math.round((metric.net / Math.max(metric.changeScore, 1)) * 100)
              : 0,
            sparklineData: metric?.sparklineData ?? EMPTY_SPARKLINE,
            lastUpdated: isMetricLoading
              ? '집계 중…'
              : metric
                ? metric.lastActivityAt
                  ? formatRelativeTime(metric.lastActivityAt)
                  : '작업 기록 없음'
                : '미집계',
            isPinned,
            pinnedOrder,
            originalIndex,
          };
        })
        .sort((left, right) => {
          if (left.isPinned && right.isPinned) {
            return left.pinnedOrder - right.pinnedOrder;
          }
          if (left.isPinned !== right.isPinned) {
            return left.isPinned ? -1 : 1;
          }
          return left.originalIndex - right.originalIndex;
        }),
    [followMetricLoading, followMetrics, mateProfiles, mates, pinnedMateUsernames],
  );

  const rankRows = useMemo(() => {
    const normalizedSelfLogin = user?.login ? normalizeUsername(user.login) : null;
    const participantUsernames = new Set(mates.map((mate) => normalizeUsername(mate.username)));

    if (normalizedSelfLogin) {
      participantUsernames.add(normalizedSelfLogin);
    }

    return Array.from(participantUsernames)
      .map((username) => {
        const mate = mates.find((item) => normalizeUsername(item.username) === username);
        const profile = mateProfiles[username];
        const metric = rankMetrics[username];
        const isCurrentUser = normalizedSelfLogin === username;

        const additions = metric?.additions ?? (isCurrentUser ? myGrassAdditions : 0);
        const deletions = metric?.deletions ?? (isCurrentUser ? myGrassDeletions : 0);

        return {
          username,
          displayName: mate?.nickname ?? (isCurrentUser ? user?.login : undefined) ?? profile?.name ?? profile?.login ?? username,
          avatar:
            mate?.avatarUrl ??
            (isCurrentUser ? user?.avatar_url : undefined) ??
            profile?.avatar_url ??
            `https://github.com/${encodeURIComponent(username)}.png?size=80`,
          additions,
          deletions,
          change: metric?.changeScore ?? additions + deletions,
          isCurrentUser,
        };
      })
      .sort((a, b) => {
      const byChange = b.change - a.change;
      if (byChange !== 0) return byChange;

      const byAdditions = b.additions - a.additions;
      if (byAdditions !== 0) return byAdditions;

      return a.username.localeCompare(b.username);
    });
  }, [mateProfiles, mates, myGrassAdditions, myGrassDeletions, rankMetrics, user?.avatar_url, user?.login]);

  const rankLastUpdatedLabel = useMemo(() => {
    const syncedAt = rankManualSyncedAtByRange[timeRange];
    return syncedAt ? new Date(syncedAt).toLocaleString() : '-';
  }, [rankManualSyncedAtByRange, timeRange]);

  const runStreakKstAlertCheck = useCallback(async () => {
    if (!token || !user?.login) return;
    if (!isStreakAlertEnabled()) return;

    const todayKst = getKstDayKey();
    const checkedKey = getStreakKstCheckedDayKey(user.login);
    if (localStorage.getItem(checkedKey) === todayKst) return;

    try {
      const result = await fetchMyKstDailyCommitCheck(token, user.login);
      localStorage.setItem(checkedKey, todayKst);

      if (result.yesterdayCommits <= 0) return;
      if (result.todayCommits > 0) return;

      pushNotification(
        '연속 기록 알림',
        '어제는 커밋했지만 오늘은 아직 커밋이 없어요. 연속 기록을 지키려면 오늘 한 번만 더 커밋해보세요.',
      );
    } catch {
      // Keep silent and retry on the next scheduled run.
    }
  }, [isStreakAlertEnabled, pushNotification, token, user?.login]);

  useEffect(() => {
    if (!token || !user?.login) return;

    let timerId = 0;
    let cancelled = false;

    const schedule = () => {
      const nextRunAtMs = getNextKstSixPmMs();
      const delayMs = Math.max(nextRunAtMs - Date.now(), 1000);

      timerId = window.setTimeout(() => {
        if (cancelled) return;

        void runStreakKstAlertCheck().finally(() => {
          if (!cancelled) schedule();
        });
      }, delayMs);
    };

    if (isAfterKstSixPm()) {
      void runStreakKstAlertCheck();
    }

    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [runStreakKstAlertCheck, token, user?.login]);

  const addMateByUsername = useCallback(
    async (rawUsername: string, nickname = ''): Promise<{ ok: boolean; message?: string }> => {
      const normalizedUsername = normalizeUsername(rawUsername);
      if (!normalizedUsername) {
        return { ok: false, message: 'GitHub 아이디를 입력하세요.' };
      }

      if (user?.login && normalizedUsername === normalizeUsername(user.login)) {
        return { ok: false, message: '본인은 추가할 수 없습니다.' };
      }

      if (mates.some((mate) => mate.username === normalizedUsername)) {
        return { ok: false, message: '이미 추가된 메이트입니다.' };
      }

      setIsAddingMate(true);

      try {
        const profile = await fetchUserByUsername(normalizedUsername, token);
        const login = normalizeUsername(profile.login);

        if (mates.some((mate) => mate.username === login)) {
          return { ok: false, message: '이미 추가된 메이트입니다.' };
        }

        const nextMate = buildMateFromLookup(profile, nickname);
        const nextMates = [...mates, nextMate];
        setMates(nextMates);
        matesStore.save(nextMates);
        setMateProfiles((prev) => ({ ...prev, [login]: profile }));
        void syncMateMetric(nextMate);
        void Promise.all(
          TIME_RANGE_OPTIONS.map(async (range) => ({
            range,
            syncedAt: await prefetchRankRangeForMates(range, nextMates, { force: true }),
          })),
        ).then((results) => {
          setRankManualSyncedAtByRange((prev) => {
            const next = { ...prev };
            let changed = false;

            results.forEach(({ range, syncedAt }) => {
              if (!syncedAt || next[range] === syncedAt) return;
              next[range] = syncedAt;
              changed = true;
            });

            return changed ? next : prev;
          });
        });
        setFollowSearchInput('');
        setFollowAddError(null);

        return { ok: true };
      } catch (error) {
        return { ok: false, message: toAddMateErrorMessage(error) };
      } finally {
        setIsAddingMate(false);
      }
    },
    [mates, prefetchRankRangeForMates, syncMateMetric, token, user?.login],
  );

  const handleFollowAdd = useCallback(async () => {
    const result = await addMateByUsername(followSearchInput);
    if (!result.ok) {
      setFollowAddError(result.message ?? '메이트를 추가하지 못했어요.');
      return;
    }

    setFollowAddError(null);
  }, [addMateByUsername, followSearchInput]);

  const handleModalAdd = useCallback(
    async (username: string, nickname: string) => addMateByUsername(username, nickname),
    [addMateByUsername],
  );

  const handleDeleteMate = useCallback((username: string) => {
    const normalizedUsername = normalizeUsername(username);

    setMates((prev) => {
      const next = prev.filter((mate) => mate.username !== normalizedUsername);
      matesStore.save(next);
      return next;
    });

    setMateProfiles((prev) => {
      if (!prev[normalizedUsername]) return prev;
      const next = { ...prev };
      delete next[normalizedUsername];
      return next;
    });

    setFollowMetrics((prev) => {
      if (!prev[normalizedUsername]) return prev;
      const next = { ...prev };
      delete next[normalizedUsername];
      return next;
    });

    setFollowMetricLoading((prev) => {
      if (!prev[normalizedUsername]) return prev;
      const next = { ...prev };
      delete next[normalizedUsername];
      return next;
    });

    setPinnedMateUsernames((prev) => {
      if (!prev.includes(normalizedUsername)) return prev;
      return prev.filter((item) => item !== normalizedUsername);
    });

    queryClient.removeQueries({
      queryKey: ['mate-metrics', normalizedUsername],
    });
    queryClient.removeQueries({
      queryKey: ['rank-metrics'],
    });
  }, [queryClient]);

  const handleTogglePinMate = useCallback(
    (username: string) => {
      const normalizedUsername = normalizeUsername(username);
      const isAlreadyPinned = pinnedMateUsernames.includes(normalizedUsername);

      if (isAlreadyPinned) {
        setPinnedMateUsernames((prev) => prev.filter((item) => item !== normalizedUsername));
        return;
      }

      if (pinnedMateUsernames.length >= FOLLOW_PINNED_LIMIT) {
        pushNotification('메이트 고정 안내', `메이트는 최대 ${FOLLOW_PINNED_LIMIT}명까지 고정할 수 있어요.`);
        return;
      }

      setPinnedMateUsernames((prev) => {
        if (prev.includes(normalizedUsername)) return prev;
        if (prev.length >= FOLLOW_PINNED_LIMIT) return prev;
        return [...prev, normalizedUsername];
      });
    },
    [pinnedMateUsernames, pushNotification],
  );

  const handleOpenMateProfile = useCallback(
    (username: string) => {
      const normalizedUsername = normalizeUsername(username);
      const profileUrl =
        mateProfiles[normalizedUsername]?.html_url ??
        `https://github.com/${encodeURIComponent(normalizedUsername)}`;
      window.open(profileUrl, '_blank', 'noopener,noreferrer');
    },
    [mateProfiles],
  );

  useEffect(() => {
    const currentMateUsernames = new Set(mates.map((mate) => normalizeUsername(mate.username)));

    setPinnedMateUsernames((prev) => {
      const next = prev.filter((username) => currentMateUsernames.has(username));
      if (areSameOrder(prev, next)) return prev;
      return next;
    });
  }, [mates]);

  useEffect(() => {
    localStorage.setItem(FOLLOW_PINNED_KEY, JSON.stringify(pinnedMateUsernames));
  }, [pinnedMateUsernames]);

  const renderContent = () => {
    if (viewMode === 'loading') {
      return <LoadingState />;
    }

    if (viewMode === 'error-rate') {
      return <ErrorState type="rate-limit" onRetry={handleRefresh} />;
    }

    if (viewMode === 'error-token') {
      return <ErrorState type="token-missing" onRetry={() => setShowSettings(true)} />;
    }

    if (selectedTab === 'Follow') {
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 space-y-3">
            <input
              type="text"
              value={followSearchInput}
              onChange={(e) => {
                setFollowSearchInput(e.target.value);
                setFollowAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleFollowAdd();
                }
              }}
              placeholder="깃헙 아이디 검색"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 text-zinc-900 dark:text-white placeholder:text-zinc-400"
            />
            <button
              onClick={() => void handleFollowAdd()}
              disabled={isAddingMate}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-500 dark:hover:bg-green-600 rounded-lg transition-colors"
            >
              {isAddingMate ? '추가 중…' : '+ 메이트 추가'}
            </button>
            {followAddError && (
              <p className="text-xs text-red-600 dark:text-red-400">{followAddError}</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <span>집계 기간: {currentWeekRangeLabel} (월요일 ~ 오늘)</span>
              <span>{mates.length}명</span>
            </div>
            {followRows.length === 0 ? (
              <div className="flex-1">
                <EmptyState />
              </div>
            ) : (
              followRows.map((mate) => (
                <MateRow
                  key={mate.username}
                  username={mate.username}
                  displayName={mate.displayName}
                  avatar={mate.avatar}
                  additions={mate.additions}
                  deletions={mate.deletions}
                  change={mate.change}
                  trend={mate.trend}
                  sparklineData={mate.sparklineData}
                  lastUpdated={mate.lastUpdated}
                  isPinned={mate.isPinned}
                  onDelete={() => handleDeleteMate(mate.username)}
                  onTogglePin={() => handleTogglePinMate(mate.username)}
                  onOpenProfile={() => handleOpenMateProfile(mate.username)}
                />
              ))
            )}
          </div>
        </div>
      );
    }

    if (selectedTab === 'My') {
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 space-y-3 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center justify-between">
              <TimeRangePills selected={timeRange} onChange={setTimeRange} options={['오늘', '7일', '30일']} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* My Grass Summary */}
            <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-green-700 dark:text-green-400 mb-1">
                    내 잔디 · {timeRange}
                  </div>
                  <div className="text-2xl font-semibold text-zinc-900 dark:text-white mb-1">
                    {myGrassLoading ? '동기화 중…' : `총 변경 ${(myGrassAdditions + myGrassDeletions).toLocaleString()}`}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-600 dark:text-green-400">+{myGrassAdditions.toLocaleString()}</span>
                    <span className="text-red-600 dark:text-red-400">-{myGrassDeletions.toLocaleString()}</span>
                  </div>
                </div>
                <GrassGrid data={myGrassGrid} size={6} />
              </div>
              
              <div className="pt-3 border-t border-green-200 dark:border-green-800">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  마지막 동기화: {myGrassSyncedAt ? new Date(myGrassSyncedAt).toLocaleString() : '-'}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg border border-amber-200/80 dark:border-amber-700/70 bg-amber-50/80 dark:bg-amber-900/15">
              {myGrassError ? (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  정보를 불러오지 못했어요
                </div>
              ) : myNoActivityOverLookback ? (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  작업을 안한 지 {STREAK_LOOKBACK_DAYS}일이 넘었습니다
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-700 dark:text-amber-300">
                    연속 기록 {myGrassStreakDays}일
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    오늘 한 줄만 더! 🌱
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-900/40">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs text-zinc-600 dark:text-zinc-400">이번 주 요약</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{currentWeekRangeLabel}</div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-md bg-black/3 dark:bg-white/5 p-2">
                  <div className="text-zinc-500 dark:text-zinc-400">작업 일 수</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                    {weeklySummary.workingDays}일
                  </div>
                </div>
                <div className="rounded-md bg-black/3 dark:bg-white/5 p-2">
                  <div className="text-zinc-500 dark:text-zinc-400">집중 레포</div>
                  <AutoFitText
                    text={weeklySummary.topRepoLabel}
                    className="mt-1 font-semibold text-zinc-900 dark:text-white"
                    maxFontPx={14}
                    minFontPx={10}
                  />
                </div>
                <div className="rounded-md bg-black/3 dark:bg-white/5 p-2">
                  <div className="text-zinc-500 dark:text-zinc-400">작업 시간대</div>
                  <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-zinc-900 dark:text-white">
                    {weeklySummary.commitPeriod === 'day' && (
                      <Sun className="h-4 w-4 text-amber-500" />
                    )}
                    {weeklySummary.commitPeriod === 'night' && (
                      <Moon className="h-4 w-4 text-indigo-500" />
                    )}
                    {weeklySummary.commitPeriod === 'equal' && (
                      <>
                        <Sun className="h-4 w-4 text-amber-500" />
                        <Moon className="h-4 w-4 text-indigo-500" />
                      </>
                    )}
                    {weeklySummary.commitPeriod === 'none' && <span>-</span>}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      );
    }

    if (selectedTab === 'Rank') {
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 space-y-3 border-b border-black/5 dark:border-white/5">
            <TimeRangePills selected={timeRange} onChange={setTimeRange} options={['오늘', '7일', '30일']} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {rankRows.length === 0 && (
              <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                메이트가 없습니다. Follow 탭에서 메이트를 추가해 보세요.
              </p>
            )}
            {rankRows.length > 0 && rankMetricLoading && Object.keys(rankMetrics).length === 0 && (
              <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                순위를 집계하고 있어요…
              </p>
            )}
            {rankRows.map((item, i) => (
              <LeaderboardRow
                key={item.username}
                rank={i + 1}
                username={item.username}
                displayName={item.displayName}
                avatar={item.avatar}
                change={item.change}
                additions={item.additions}
                deletions={item.deletions}
                isCurrentUser={item.isCurrentUser}
                onOpenProfile={() => handleOpenMateProfile(item.username)}
              />
            ))}
          </div>

          <div className="px-4 py-3 border-t border-black/5 dark:border-white/5 bg-black/2 dark:bg-white/2">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
              마지막 동기화: {rankLastUpdatedLabel}
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="fixed top-4 left-4 z-50 flex gap-2">
        <button
          onClick={() => setIsDark(!isDark)}
          className="px-3 py-2 text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-black/10 dark:border-white/10 rounded-lg shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isDark ? 'Light' : 'Dark'}
        </button>

        <select
          value={viewMode}
          onChange={(e) => {
            const newMode = e.target.value as ViewMode;
            setViewMode(newMode);
            if (['Follow', 'My', 'Rank'].includes(newMode)) {
              setSelectedTab(newMode);
            }
          }}
          className="px-3 py-2 text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-black/10 dark:border-white/10 rounded-lg shadow-sm"
        >
          <option value="Follow">Follow 탭</option>
          <option value="My">My 탭</option>
          <option value="Rank">Rank 탭</option>
          <option value="loading">Loading State</option>
          <option value="error-rate">Error: Rate Limit</option>
          <option value="error-token">Error: Token Missing</option>
        </select>
      </div>

      <MacOSPopover>
        <div className="flex flex-col h-full">
          <PopoverHeader
            onRefresh={handleRefresh}
            onSettings={() => setShowSettings(true)}
            isRefreshing={isRefreshing}
            subtitle={user?.login ? `@${user.login}` : undefined}
          />

          {!['loading', 'error-rate', 'error-token'].includes(viewMode) && (
            <div className="px-4 pt-3">
              <SegmentedControl
                options={['Follow', 'My', 'Rank']}
                selected={selectedTab}
                onChange={setSelectedTab}
              />
            </div>
          )}

          <div className="flex-1 overflow-hidden mt-3">
            {renderContent()}
          </div>
        </div>
      </MacOSPopover>

      {showAddMate && (
        <AddMateModal
          onClose={() => setShowAddMate(false)}
          onAdd={(username, nickname, _isPrivate) => handleModalAdd(username, nickname)}
        />
      )}

      {showSettings && (
        <SettingsWindow onClose={() => setShowSettings(false)} />
      )}

      {inAppNotifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
          {inAppNotifications.map((notification) => (
            <div
              key={notification.id}
              className="rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 shadow-lg dark:border-amber-700/70 dark:bg-zinc-800/95"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {notification.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-700 dark:text-zinc-200">
                    {notification.message}
                  </div>
                </div>
                <button
                  onClick={() => dismissNotification(notification.id)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  닫기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
