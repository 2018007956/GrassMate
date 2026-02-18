export interface NativeHttpResult {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

async function tryTauriPostForm(url: string, body: URLSearchParams): Promise<NativeHttpResult | null> {
  const tauriInvoke = (window as Window & { __TAURI__?: { core?: { invoke?: (cmd: string, args?: unknown) => Promise<NativeHttpResult> } } }).__TAURI__?.core?.invoke;

  if (!tauriInvoke) return null;

  try {
    return await tauriInvoke('oauth_post_form', {
      url,
      body: body.toString(),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } catch {
    return null;
  }
}

async function browserPostForm(url: string, body: URLSearchParams): Promise<NativeHttpResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await response.text();
  return { status: response.status, body: text };
}

export async function postForm(url: string, body: URLSearchParams): Promise<NativeHttpResult> {
  const tauriResult = await tryTauriPostForm(url, body);
  if (tauriResult) return tauriResult;

  const electronResult = await tryElectronPostForm(url, body);
  if (electronResult) return electronResult;

  return browserPostForm(url, body);
}
