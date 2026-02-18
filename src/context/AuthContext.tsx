import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthState, DeviceFlowInfo, GithubUser, StoredAuth } from '../types/github';
import { requestDeviceCode, pollAccessToken } from '../services/github/deviceFlow';
import { fetchViewer } from '../services/github/user';
import { authStore } from '../services/storage/authStore';

interface AuthContextValue {
  state: AuthState;
  token: string | null;
  user: GithubUser | null;
  deviceFlowInfo: DeviceFlowInfo | null;
  error: string | null;
  startLogin: () => Promise<void>;
  cancelLogin: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toStoredAuth(token: string, scope: string | undefined, user: GithubUser): StoredAuth {
  return {
    access_token: token,
    token_scopes: (scope ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    token_created_at: new Date().toISOString(),
    github_user_id: user.id,
    github_login: user.login,
    avatar_url: user.avatar_url,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('signedOut');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [deviceFlowInfo, setDeviceFlowInfo] = useState<DeviceFlowInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const resetSignedOut = useCallback(() => {
    setState('signedOut');
    setToken(null);
    setUser(null);
    setDeviceFlowInfo(null);
    setError(null);
  }, []);

  const cancelLogin = useCallback(() => {
    cancelledRef.current = true;
    setDeviceFlowInfo(null);
    setState('signedOut');
  }, []);

  const logout = useCallback(() => {
    cancelledRef.current = true;
    authStore.clear();
    resetSignedOut();
  }, [resetSignedOut]);

  const refreshUser = useCallback(async () => {
    if (!token) return;

    try {
      const viewer = await fetchViewer(token);
      setUser(viewer);
      setState('signedIn');
      setError(null);

      const existing = authStore.load();
      const scope = existing?.token_scopes?.join(',') ?? '';
      authStore.save(toStoredAuth(token, scope, viewer));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh GitHub user.';
      setError(message);
      setState('error');
    }
  }, [token]);

  const startLogin = useCallback(async () => {
    cancelledRef.current = false;
    setError(null);

    try {
      const device = await requestDeviceCode();
      const expiresAt = new Date(Date.now() + device.expires_in * 1000).toISOString();

      setDeviceFlowInfo({
        userCode: device.user_code,
        verificationUri: device.verification_uri,
        expiresAt,
        intervalSeconds: device.interval,
      });
      setState('deviceFlow');

      let interval = Math.max(1, device.interval);
      const deadline = Date.now() + device.expires_in * 1000;

      while (!cancelledRef.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));

        if (cancelledRef.current) return;

        const tokenRes = await pollAccessToken(device.device_code);

        if (tokenRes.access_token) {
          const viewer = await fetchViewer(tokenRes.access_token);
          const stored = toStoredAuth(tokenRes.access_token, tokenRes.scope, viewer);
          authStore.save(stored);

          setToken(stored.access_token);
          setUser(viewer);
          setDeviceFlowInfo(null);
          setState('signedIn');
          return;
        }

        if (tokenRes.error === 'authorization_pending') {
          continue;
        }

        if (tokenRes.error === 'slow_down') {
          interval += 5;
          continue;
        }

        if (tokenRes.error === 'access_denied') {
          resetSignedOut();
          return;
        }

        if (tokenRes.error === 'expired_token') {
          setError('인증 시간이 만료되었습니다. 다시 시도해 주세요.');
          setState('error');
          return;
        }

        setError(tokenRes.error_description ?? 'GitHub 인증에 실패했습니다.');
        setState('error');
        return;
      }

      if (!cancelledRef.current) {
        setError('인증 대기 시간이 만료되었습니다. 다시 시도해 주세요.');
        setState('error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub 로그인 시작에 실패했습니다.';
      setError(message);
      setState('error');
    }
  }, [resetSignedOut]);

  useEffect(() => {
    const stored = authStore.load();
    if (!stored?.access_token) {
      resetSignedOut();
      return;
    }

    setToken(stored.access_token);
    setUser({
      id: stored.github_user_id,
      login: stored.github_login,
      avatar_url: stored.avatar_url,
    });
    setState('signedIn');
  }, [resetSignedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      token,
      user,
      deviceFlowInfo,
      error,
      startLogin,
      cancelLogin,
      logout,
      refreshUser,
    }),
    [cancelLogin, deviceFlowInfo, error, logout, refreshUser, startLogin, state, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
