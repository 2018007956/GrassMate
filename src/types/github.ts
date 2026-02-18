export type AuthState = 'signedOut' | 'deviceFlow' | 'signedIn' | 'error';

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string;
}

export interface StoredAuth {
  access_token: string;
  token_scopes: string[];
  token_created_at: string;
  github_user_id: number;
  github_login: string;
  avatar_url: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?:
    | 'authorization_pending'
    | 'slow_down'
    | 'expired_token'
    | 'unsupported_grant_type'
    | 'incorrect_client_credentials'
    | 'incorrect_device_code'
    | 'access_denied'
    | 'device_flow_disabled';
  error_description?: string;
}

export interface DeviceFlowInfo {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  intervalSeconds: number;
}

export interface RateLimitInfo {
  remaining: number | null;
  resetAt: string | null;
}

export interface GithubRequestError extends Error {
  status?: number;
  rateLimit?: RateLimitInfo;
}

export interface Mate {
  username: string;
  nickname?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

export interface MateMetrics {
  username: string;
  nickname?: string;
  additions: number;
  deletions: number;
  changeScore: number;
  net: number;
  lastActivityAt: string | null;
  sparklineData: number[];
  comparedEvents: number;
  skippedEvents: number;
}
