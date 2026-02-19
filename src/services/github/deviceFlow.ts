import type { AccessTokenResponse, DeviceCodeResponse } from '../../types/github';
import type { NativeHttpResult } from './nativeHttp';
import { postForm } from './nativeHttp';

const DEVICE_CODE_PATH = '/login/device/code';
const ACCESS_TOKEN_PATH = '/login/oauth/access_token';
const PROXY_PREFIX = '/__github';
const GITHUB_OAUTH_BASE_URL = 'https://github.com';
const DEFAULT_GITHUB_CLIENT_ID = '01ab8ac9400c4e429b23';
const LEGACY_CLIENT_ID_KEY = 'grassmate.github.client_id';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function resolveOAuthUrls(path: string): string[] {
  const directUrl = `${GITHUB_OAUTH_BASE_URL}${path}`;

  if (isTauriRuntime()) {
    return [directUrl];
  }

  return [`${PROXY_PREFIX}${path}`, directUrl];
}

function parseOAuthBody(body: string): Record<string, unknown> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('GitHub OAuth response parsing failed.');
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    if (!trimmed.includes('=')) {
      throw new Error('GitHub OAuth response parsing failed.');
    }

    const entries = Array.from(new URLSearchParams(trimmed).entries());
    if (entries.length === 0) {
      throw new Error('GitHub OAuth response parsing failed.');
    }

    return Object.fromEntries(entries);
  }
}

function resolveClientId(): string {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(LEGACY_CLIENT_ID_KEY)?.trim();
    if (stored) return stored;
  }

  return DEFAULT_GITHUB_CLIENT_ID;
}

function getHeader(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';

  const lowerName = name.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lowerName) {
      return headerValue;
    }
  }

  return '';
}

function isLikelyHtmlResponse(response: NativeHttpResult): boolean {
  const contentType = getHeader(response.headers, 'content-type').toLowerCase();
  const trimmedBody = response.body.trim().toLowerCase();

  return (
    contentType.includes('text/html') ||
    trimmedBody.startsWith('<!doctype html') ||
    trimmedBody.startsWith('<html')
  );
}

function parseNumberField(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
}

async function postWithFallback(
  urls: string[],
  createBody: () => URLSearchParams,
): Promise<NativeHttpResult> {
  let lastError: unknown;
  let lastStatus: number | null = null;

  for (const url of urls) {
    try {
      const response = await postForm(url, createBody());
      if (
        url.startsWith(PROXY_PREFIX) &&
        (response.status === 404 || isLikelyHtmlResponse(response))
      ) {
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
  const response = await postWithFallback(resolveOAuthUrls(DEVICE_CODE_PATH), () =>
    new URLSearchParams({
      client_id: clientId,
      scope: 'read:user',
    }),
  );
  if (response.status < 200 || response.status >= 300) {
    const bodyMessage = response.body?.slice(0, 180);
    throw new Error(`Device code request failed (${response.status}). ${bodyMessage}`);
  }

  const parsed = parseOAuthBody(response.body);
  if (typeof parsed.error_description === 'string') {
    throw new Error(parsed.error_description);
  }
  if (typeof parsed.error === 'string') {
    throw new Error(`GitHub 로그인 요청 실패: ${parsed.error}`);
  }

  const device_code = typeof parsed.device_code === 'string' ? parsed.device_code : '';
  const user_code = typeof parsed.user_code === 'string' ? parsed.user_code : '';
  const verification_uri =
    typeof parsed.verification_uri === 'string' ? parsed.verification_uri : '';
  const expires_in = parseNumberField(parsed.expires_in);
  const interval = parseNumberField(parsed.interval);

  if (
    !device_code ||
    !user_code ||
    !verification_uri ||
    !Number.isFinite(expires_in) ||
    !Number.isFinite(interval)
  ) {
    throw new Error('GitHub OAuth response parsing failed.');
  }

  return {
    device_code,
    user_code,
    verification_uri,
    expires_in,
    interval,
  };
}

export async function pollAccessToken(deviceCode: string): Promise<AccessTokenResponse> {
  const clientId = resolveClientId();
  const response = await postWithFallback(resolveOAuthUrls(ACCESS_TOKEN_PATH), () =>
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

  const parsed = parseOAuthBody(response.body);
  const tokenResponse: AccessTokenResponse = {};

  if (typeof parsed.access_token === 'string') tokenResponse.access_token = parsed.access_token;
  if (typeof parsed.token_type === 'string') tokenResponse.token_type = parsed.token_type;
  if (typeof parsed.scope === 'string') tokenResponse.scope = parsed.scope;
  if (typeof parsed.error === 'string') {
    tokenResponse.error = parsed.error as AccessTokenResponse['error'];
  }
  if (typeof parsed.error_description === 'string') {
    tokenResponse.error_description = parsed.error_description;
  }

  if (!tokenResponse.access_token && !tokenResponse.error) {
    throw new Error('GitHub OAuth response parsing failed.');
  }

  return tokenResponse;
}
