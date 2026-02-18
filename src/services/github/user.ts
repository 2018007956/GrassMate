import type { GithubUser } from '../../types/github';
import { githubRequest } from './http';

export interface GithubLookupUser extends GithubUser {
  name: string | null;
  html_url: string;
}

export interface GithubViewerProfile extends GithubUser {
  name: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
  following: number;
}

export async function fetchViewer(token: string): Promise<GithubUser> {
  return githubRequest<GithubUser>('/user', { token });
}

export async function fetchUserByUsername(username: string, token?: string | null): Promise<GithubLookupUser> {
  return githubRequest<GithubLookupUser>(`/users/${encodeURIComponent(username)}`, { token });
}

export async function fetchViewerProfile(token: string): Promise<GithubViewerProfile> {
  return githubRequest<GithubViewerProfile>('/user', { token });
}
