import type { AccessTokenResponse, DeviceCodeResponse } from '../../types/github';
import { postForm } from './nativeHttp';

const DEVICE_CODE_URLS = ['/__github/login/device/code', 'https://github.com/login/device/code'];
const ACCESS_TOKEN_URLS = ['/__github/login/oauth/access_token', 'https://github.com/login/oauth/access_token'];
const DEFAULT_GITHUB_CLIENT_ID = '01ab8ac9400c4e429b23';
const LEGACY_CLIENT_ID_KEY = 'grassmate.github.client_id';

function parseJson<T>(body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('GitHub OAuth response parsing failed.');
  }
}

function resolveClientId(): string {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(LEGACY_CLIENT_ID_KEY)?.trim();
    if (stored) return stored;
  }

  return DEFAULT_GITHUB_CLIENT_ID;
}

async function postWithFallback(
  urls: string[],
  createBody: () => URLSearchParams,
): Promise<{ status: number; body: string }> {
  let lastError: unknown;
  let lastStatus: number | null = null;

  for (const url of urls) {
    try {
      const response = await postForm(url, createBody());
      if (url.startsWith('/__github') && response.status === 404) {
        lastStatus = response.status;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`GitHub 로그인 요청 실패: ${lastError.message}`);
  }

  if (lastStatus !== null) {
    throw new Error(`GitHub 로그인 요청 실패 (${lastStatus}).`);
  }

  throw new Error('GitHub 로그인 요청 실패.');
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = resolveClientId();
  const response = await postWithFallback(DEVICE_CODE_URLS, () =>
    new URLSearchParams({
      client_id: clientId,
      scope: 'read:user',
    }),
  );
  if (response.status < 200 || response.status >= 300) {
    const bodyMessage = response.body?.slice(0, 180);
    throw new Error(`Device code request failed (${response.status}). ${bodyMessage}`);
  }

  return parseJson<DeviceCodeResponse>(response.body);
}

export async function pollAccessToken(deviceCode: string): Promise<AccessTokenResponse> {
  const clientId = resolveClientId();
  const response = await postWithFallback(ACCESS_TOKEN_URLS, () =>
    new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  );
  if (response.status < 200 || response.status >= 300) {
    const bodyMessage = response.body?.slice(0, 180);
    throw new Error(`Token polling failed (${response.status}). ${bodyMessage}`);
  }

  return parseJson<AccessTokenResponse>(response.body);
}
