export interface NativeHttpResult {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

const OAUTH_POST_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded',
} as const;

function toHeaderRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

async function tryTauriPostForm(url: string, body: URLSearchParams): Promise<NativeHttpResult | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<NativeHttpResult>('oauth_post_form', {
      url,
      body: body.toString(),
      headers: OAUTH_POST_HEADERS,
    });
  } catch {
    return null;
  }
}

async function tryElectronPostForm(url: string, body: URLSearchParams): Promise<NativeHttpResult | null> {
  const electronApi = (window as Window & {
    electronAPI?: {
      oauthPostForm?: (payload: {
        url: string;
        body: string;
        headers: Record<string, string>;
      }) => Promise<NativeHttpResult>;
    };
  }).electronAPI;

  if (!electronApi?.oauthPostForm) return null;

  try {
    return await electronApi.oauthPostForm({
      url,
      body: body.toString(),
      headers: OAUTH_POST_HEADERS,
    });
  } catch {
    return null;
  }
}

async function browserPostForm(url: string, body: URLSearchParams): Promise<NativeHttpResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: OAUTH_POST_HEADERS,
    body,
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text,
    headers: toHeaderRecord(response.headers),
  };
}

export async function postForm(url: string, body: URLSearchParams): Promise<NativeHttpResult> {
  const tauriResult = await tryTauriPostForm(url, body);
  if (tauriResult) return tauriResult;

  const electronResult = await tryElectronPostForm(url, body);
  if (electronResult) return electronResult;

  return browserPostForm(url, body);
}
