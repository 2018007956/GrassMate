import { useCallback, useEffect, useMemo, useState } from 'react';
import { User, Database, Bell, Info, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { fetchViewerProfile, type GithubViewerProfile } from '../../services/github/user';
import { QUERY_CACHE_KEY } from '../../services/query/client';
import { authStore } from '../../services/storage/authStore';
import { openExternalUrl } from '../../services/platform/openExternalUrl';

interface SettingsWindowProps {
  onClose: () => void;
  standalone?: boolean;
}

type RefreshInterval = '12h' | '24h' | 'manual';

const COMPARE_CACHE_KEY = 'grassmate.compareCache.v1';
const REFRESH_INTERVAL_KEY = 'grassmate.settings.refreshInterval';
const REFRESH_INTERVAL_EVENT = 'grassmate:refresh-interval-changed';
const LAST_SYNC_KEY = 'grassmate.last_sync';
const CACHE_KEYS = [COMPARE_CACHE_KEY, QUERY_CACHE_KEY];
const SYNC_REQUEST_EVENT = 'grassmate:sync-request';
const SYNC_COMPLETE_EVENT = 'grassmate:sync-complete';
const SYNC_BATCH_COMPLETE_EVENT = 'grassmate:sync-batch-complete';

const RANK_ALERT_KEY = 'grassmate.settings.rankAlert';
const STREAK_ALERT_KEY = 'grassmate.settings.streakAlert';

function loadRefreshInterval(): RefreshInterval {
  const saved = localStorage.getItem(REFRESH_INTERVAL_KEY);
  if (saved === '12h' || saved === '24h' || saved === 'manual') return saved;
  return 'manual';
}

function loadBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function getCacheMeta(): { bytes: number } {
  const encoder = new TextEncoder();
  const bytes = CACHE_KEYS.reduce((sum, key) => {
    const value = localStorage.getItem(key);
    if (!value) return sum;
    return sum + encoder.encode(value).length;
  }, 0);

  return { bytes };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SettingsWindow({ onClose, standalone = false }: SettingsWindowProps) {
  const { token, user, refreshUser, logout } = useAuth();

  const [selectedSection, setSelectedSection] = useState('계정');
  const [viewerProfile, setViewerProfile] = useState<GithubViewerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(() => loadRefreshInterval());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => localStorage.getItem(LAST_SYNC_KEY));
  const [cacheSize, setCacheSize] = useState<string>(() => formatBytes(getCacheMeta().bytes));
  const [tokenCreatedAt, setTokenCreatedAt] = useState<string | null>(null);
  const [tokenScopes, setTokenScopes] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  const [rankAlert, setRankAlert] = useState(() => loadBoolean(RANK_ALERT_KEY, true));
  const [streakAlert, setStreakAlert] = useState(() => loadBoolean(STREAK_ALERT_KEY, false));

  const sections = [
    { id: '계정', icon: User },
    { id: '데이터', icon: Database },
    { id: '알림', icon: Bell },
    { id: '정보', icon: Info },
  ];

  const currentLogin = viewerProfile?.login ?? user?.login ?? '-';
  const currentAvatar = viewerProfile?.avatar_url ?? user?.avatar_url ?? '';
  const currentName = viewerProfile?.name ?? currentLogin;

  const refreshCacheMeta = useCallback(() => {
    const cacheMeta = getCacheMeta();
    const storedAuth = authStore.load();

    setLastSyncAt(localStorage.getItem(LAST_SYNC_KEY));
    setCacheSize(formatBytes(cacheMeta.bytes));
    setTokenCreatedAt(storedAuth?.token_created_at ?? null);
    setTokenScopes(storedAuth?.token_scopes ?? []);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!token) {
      setViewerProfile(null);
      setProfileError(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const profile = await fetchViewerProfile(token);
      setViewerProfile(profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필을 불러오지 못했습니다.');
    } finally {
      setProfileLoading(false);
    }
  }, [token]);

  const waitForSyncCompletion = useCallback((requestId: string, timeoutMs = 30000): Promise<void> => {
    return new Promise((resolve, reject) => {
      let timeoutId = 0;

      const onComplete = (event: Event) => {
        const detail = (event as CustomEvent<{ requestId?: string; error?: string }>).detail;
        if (detail?.requestId !== requestId) return;

        window.clearTimeout(timeoutId);
        window.removeEventListener(SYNC_BATCH_COMPLETE_EVENT, onComplete as EventListener);
        if (detail?.error) {
          reject(new Error(detail.error));
          return;
        }

        resolve();
      };

      timeoutId = window.setTimeout(() => {
        window.removeEventListener(SYNC_BATCH_COMPLETE_EVENT, onComplete as EventListener);
        reject(new Error('동기화 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'));
      }, timeoutMs);

      window.addEventListener(SYNC_BATCH_COMPLETE_EVENT, onComplete as EventListener);
    });
  }, []);

  useEffect(() => {
    void loadProfile();
    refreshCacheMeta();
  }, [loadProfile, refreshCacheMeta]);

  useEffect(() => {
    const onSyncComplete = () => {
      refreshCacheMeta();
    };

    window.addEventListener(SYNC_COMPLETE_EVENT, onSyncComplete);
    return () => {
      window.removeEventListener(SYNC_COMPLETE_EVENT, onSyncComplete);
    };
  }, [refreshCacheMeta]);

  useEffect(() => {
    localStorage.setItem(REFRESH_INTERVAL_KEY, refreshInterval);
    window.dispatchEvent(
      new CustomEvent(REFRESH_INTERVAL_EVENT, {
        detail: { interval: refreshInterval },
      }),
    );
  }, [refreshInterval]);

  useEffect(() => {
    localStorage.setItem(RANK_ALERT_KEY, String(rankAlert));
  }, [rankAlert]);

  useEffect(() => {
    localStorage.setItem(STREAK_ALERT_KEY, String(streakAlert));
  }, [streakAlert]);

  const syncNow = async () => {
    setSyncing(true);
    setProfileError(null);

    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const syncPromise = waitForSyncCompletion(requestId);
      window.dispatchEvent(
        new CustomEvent(SYNC_REQUEST_EVENT, {
          detail: { force: true, source: 'manual', requestId },
        }),
      );
      await syncPromise;
      await refreshUser();
      await loadProfile();
      refreshCacheMeta();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const clearCache = () => {
    CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
    refreshCacheMeta();
  };

  const accountStatus = useMemo(() => {
    if (profileLoading) return '프로필 동기화 중...';
    if (profileError) return profileError;
    if (!token) return '연결되지 않음';
    return '✓ 연결됨';
  }, [profileError, profileLoading, token]);

  const panelHeightClass = standalone ? 'h-[calc(100vh-57px)]' : 'h-[calc(520px-57px)]';

  const panel = (
    <div
      className={
        standalone
          ? 'h-full w-full overflow-hidden bg-white dark:bg-zinc-800'
          : 'bg-white dark:bg-zinc-800 rounded-xl shadow-2xl overflow-hidden'
      }
      style={standalone ? undefined : { width: '680px', height: '520px' }}
      onClick={standalone ? undefined : (event) => event.stopPropagation()}
    >
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
          <div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">환경설정</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </button>
        </div>

        <div className={`flex ${panelHeightClass}`}>
          <div className="w-48 border-r border-black/5 dark:border-white/5 bg-black/2 dark:bg-white/2 p-2">
            {sections.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSelectedSection(id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  selectedSection === id
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {id}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {selectedSection === '계정' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-4">GitHub 연결</h3>
                    <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                      {currentAvatar ? (
                        <img src={currentAvatar} alt={currentLogin} className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-900 dark:text-white">{currentName}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">@{currentLogin}</div>
                        <div className="text-[10px] text-green-600 dark:text-green-400 mt-1">{accountStatus}</div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                          GitHub ID {viewerProfile?.id ?? user?.id ?? '-'}
                          {tokenScopes.length > 0 ? ` · 권한 ${tokenScopes.join(', ')}` : ''}
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          토큰 발급: {formatDateTime(tokenCreatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => void loadProfile()}
                        className="px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/20 rounded-md transition-colors"
                      >
                        프로필 새로고침
                      </button>
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() => {
                        logout();
                        onClose();
                      }}
                      className="w-full px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      연결 해제
                    </button>
                  </div>
                </div>
              )}

              {selectedSection === '데이터' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-4">새로고침 간격</h3>
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(e.target.value as RefreshInterval)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-zinc-900 dark:text-white"
                    >
                      <option value="12h">12시간</option>
                      <option value="24h">24시간</option>
                      <option value="manual">수동</option>
                    </select>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">자동 새로고침으로 잔디 상태를 최신으로 유지합니다.</p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">동기화</h3>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">마지막 동기화: {formatDateTime(lastSyncAt)}</div>
                      <button
                        onClick={() => void syncNow()}
                        disabled={syncing}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {syncing ? (
                          <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> 동기화 중</span>
                        ) : (
                          '전체 동기화'
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">전체 동기화의 경우 시간이 오래 소요될 수 있습니다.</div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">캐시</h3>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">캐시 크기: {cacheSize}</div>
                      <button
                        onClick={clearCache}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-md transition-colors"
                      >
                        캐시 지우기
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedSection === '알림' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-4">알림 설정</h3>

                  <label className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm text-zinc-900 dark:text-white">순위 변동(Top 3) 알림</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">상위 3명의 순위가 바뀌면 알려드립니다.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={rankAlert}
                      onChange={(e) => setRankAlert(e.target.checked)}
                      className="w-11 h-6 appearance-none bg-zinc-300 dark:bg-zinc-600 rounded-full relative cursor-pointer transition-colors checked:bg-green-600 dark:checked:bg-green-500 before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-5"
                    />
                  </label>

                  <label className="flex items-center justify-between py-3 border-t border-black/5 dark:border-white/5">
                    <div>
                      <div className="text-sm text-zinc-900 dark:text-white">내 잔디 연속 기록 끊길 때 알림</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">커밋 기록이 끊기면 오후 6시(KST)에 알려드립니다.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={streakAlert}
                      onChange={(e) => setStreakAlert(e.target.checked)}
                      className="w-11 h-6 appearance-none bg-zinc-300 dark:bg-zinc-600 rounded-full relative cursor-pointer transition-colors checked:bg-green-600 dark:checked:bg-green-500 before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-5"
                    />
                  </label>
                </div>
              )}

              {selectedSection === '정보' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-2xl">🌱</div>
                      <div>
                        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">GrassMate</h3>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">함께 잔디를 심는 친구들</div>
                      </div>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">버전 1.0.0</div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">프로젝트 링크</h3>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void openExternalUrl('https://github.com/2018007956/GrassMate')}
                        className="text-sm text-green-600 dark:text-green-400 hover:underline"
                      >
                        저장소: 2018007956/GrassMate
                      </button>
                      <button
                        type="button"
                        onClick={() => void openExternalUrl('https://github.com/2018007956/GrassMate/issues')}
                        className="inline-flex w-fit items-center rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400"
                      >
                        이슈 제보하기
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-black/5 dark:border-white/5">
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">© 2026 GrassMate. All rights reserved.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );

  if (standalone) {
    return <div className="h-screen w-screen overflow-hidden">{panel}</div>;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      {panel}
    </div>
  );
}
