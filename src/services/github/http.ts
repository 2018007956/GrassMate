import type { GithubRequestError, RateLimitInfo } from '../../types/github';

export const GITHUB_API_BASE = 'https://api.github.com';

interface RequestOptions extends RequestInit {
  token?: string | null;
}

function parseRateLimit(response: Response): RateLimitInfo {
  const remainingRaw = response.headers.get('x-ratelimit-remaining');
  const resetRaw = response.headers.get('x-ratelimit-reset');

  return {
    remaining: remainingRaw ? Number(remainingRaw) : null,
    resetAt: resetRaw ? new Date(Number(resetRaw) * 1000).toISOString() : null,
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export async function githubRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `GitHub API request failed (${response.status}).`;

    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Keep default message.
    }

    const error = new Error(message) as GithubRequestError;
    error.status = response.status;
    error.rateLimit = parseRateLimit(response);
    throw error;
  }

  return parseJson<T>(response);
}
