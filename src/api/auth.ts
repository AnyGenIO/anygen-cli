/**
 * Authentication: verify API key and online login flow
 *
 * verify  → GET /v1/openapi/key/verify  (check key validity + credits)
 * getKey  → GET /v1/openapi/key/get     (poll for allocated key after web login)
 *
 * ensureAuth() is the main entry point — called automatically before every
 * API command. It trusts the local key without server verification, tries to
 * exchange a pending fetchToken, or starts the web login flow.
 */

import { saveApiKey, clearFetchToken, getStoredApiKey, type ApiKeySource } from '../config/config.js';
import type { AnygenConfig } from '../config/config.js';
import { authError } from '../errors.js';

const AUTH_POLL_INTERVAL_MS = 10_000; // 10 seconds
const AUTH_MAX_WAIT_MS = 900_000;     // 15 minutes

// ---- Types ----

export interface VerifyResult {
  verified: boolean;
  credits?: number;
  auth_url?: string;
  fetch_token?: string;
  api_key_name?: string;
}

// ---- API calls ----

/**
 * Call /v1/openapi/key/verify to validate key and credits.
 */
export type VerifyError = { error: 'network' } | { error: 'server'; status: number };

export async function verifyKey(baseUrl: string, apiKey?: string): Promise<VerifyResult | VerifyError> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  }

  try {
    const resp = await fetch(`${baseUrl}/v1/openapi/key/verify`, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });
    if (!resp.ok) {
      return { error: 'server', status: resp.status };
    }
    return await resp.json() as VerifyResult;
  } catch {
    return { error: 'network' };
  }
}

export function isVerifyError(result: VerifyResult | VerifyError): result is VerifyError {
  return 'error' in result && (result.error === 'network' || result.error === 'server');
}

/**
 * Call /v1/openapi/key/get to fetch allocated key after web login.
 */
export async function getKey(baseUrl: string, fetchToken: string): Promise<{ allocated: boolean; api_key?: string; error?: string } | null> {
  try {
    const resp = await fetch(`${baseUrl}/v1/openapi/key/get?fetch_token=${encodeURIComponent(fetchToken)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'manual',
    });
    if (!resp.ok) return null;
    return await resp.json() as { allocated: boolean; api_key?: string; error?: string };
  } catch {
    return null;
  }
}

// ---- High-level flows ----

export function parseCredits(credits: unknown): number {
  try {
    return parseInt(String(credits ?? '0'), 10) || 0;
  } catch {
    return 0;
  }
}

export interface AuthResult {
  apiKey: string;
  source: ApiKeySource;
}

export const SOURCE_LABELS: Record<ApiKeySource, string> = {
  flag: '--api-key flag',
  env: 'ANYGEN_API_KEY env',
  config: '~/.config/anygen/config.json',
  none: '',
};

/**
 * Ensure a valid API key is available before executing an API command.
 *
 * Accepts an already-loaded config object (no duplicate loadConfig calls).
 * Does NOT start interactive login — returns an error if not authenticated.
 * Interactive login is only available via `anygen auth login`.
 *
 * Flow:
 * 1. Has apiKey → trust it locally (401 handled at API call site)
 * 2. Has fetchToken (from prior interrupted login) → try getKey to exchange
 * 3. Neither → throw auth error with hint to run `anygen auth login`
 */
export async function ensureAuth(config: AnygenConfig): Promise<AuthResult> {
  const currentKey = config.apiKey || undefined;
  const source = config.apiKeySource;

  // Path 1: Have an API key — trust it locally
  if (currentKey) {
    return { apiKey: currentKey, source };
  }

  // Path 2: Have a fetchToken — try to exchange for API key
  if (config.fetchToken) {
    const result = await getKey(config.baseUrl, config.fetchToken);
    if (result?.allocated && result.api_key) {
      await saveApiKey(result.api_key);
      await clearFetchToken();
      return { apiKey: result.api_key, source: 'config' };
    }
    if (result?.error) {
      // fetchToken explicitly rejected — clear it
      await clearFetchToken();
    }
    // Otherwise keep fetchToken for next attempt (user may not have authorized yet)
    throw authError(
      'Authorization pending. Complete login in browser, then retry.',
      'Or run: anygen auth login --api-key sk-xxx',
    );
  }

  // Path 3: No key, no fetchToken — not authenticated at all
  throw authError(
    'Not authenticated.',
    'Run: anygen auth login --no-wait, or set ANYGEN_API_KEY, or pass --api-key.',
  );
}

/**
 * Poll /v1/openapi/key/get until key is allocated or timeout.
 * Also checks config file for manually configured key.
 * On success, saves the key and returns it.
 */
export async function waitForKey(
  baseUrl: string,
  fetchToken: string,
  timeoutMs: number = AUTH_MAX_WAIT_MS,
  intervalMs: number = AUTH_POLL_INTERVAL_MS,
): Promise<string | null> {
  const start = Date.now();
  let lastCheckedKey: string | null = null;

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      console.error('[ERROR] Authorization timed out.');
      return null;
    }

    // Check if user manually configured a key in config file
    const storedKey = await getStoredApiKey();
    if (storedKey && storedKey !== lastCheckedKey) {
      lastCheckedKey = storedKey;
      const verifyResult = await verifyKey(baseUrl, storedKey);
      if (!isVerifyError(verifyResult) && verifyResult.verified && parseCredits(verifyResult.credits) > 0) {
        console.error('[AUTH] API key configured successfully.');
        return storedKey;
      }
    }

    // Poll server for key allocation via web login
    const result = await getKey(baseUrl, fetchToken);
    if (result?.allocated && result.api_key) {
      await saveApiKey(result.api_key);
      console.error('[AUTH] API key configured successfully.');
      return result.api_key;
    }
    if (result?.error) {
      console.error(`[ERROR] API key allocation failed: ${result.error}`);
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * maskKey for display — show first 6 and last 4 chars.
 */
export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 6) + '****' + key.slice(-4);
}
