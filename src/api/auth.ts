/**
 * Authentication: verify API key and online login flow
 *
 * verify  → GET /v1/openapi/key/verify  (check key validity + credits)
 * getKey  → GET /v1/openapi/key/get     (poll for allocated key after web login)
 *
 * ensureAuth() is the main entry point — called automatically before every
 * API command. It verifies the key and, if missing/invalid, silently triggers
 * the web login flow (print URL → poll → save key → continue).
 */

import { loadConfig, saveApiKey, type ApiKeySource } from '../config/config.js';

const AUTH_POLL_INTERVAL_MS = 10_000; // 10 seconds
const AUTH_MAX_WAIT_MS = 900_000;     // 15 minutes

const BASE_URL = 'https://www.anygen.io';

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
export async function verifyKey(apiKey?: string): Promise<VerifyResult | null> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  }

  try {
    const resp = await fetch(`${BASE_URL}/v1/openapi/key/verify`, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });
    if (!resp.ok) return null;
    return await resp.json() as VerifyResult;
  } catch {
    return null;
  }
}

/**
 * Call /v1/openapi/key/get to fetch allocated key after web login.
 */
export async function getKey(fetchToken: string): Promise<{ allocated: boolean; api_key?: string; error?: string } | null> {
  try {
    const resp = await fetch(`${BASE_URL}/v1/openapi/key/get?fetch_token=${encodeURIComponent(fetchToken)}`, {
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

function parseCredits(credits: unknown): number {
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

const SOURCE_LABELS: Record<ApiKeySource, string> = {
  flag: '--api-key flag',
  env: 'ANYGEN_API_KEY env',
  config: '~/.config/anygen/config.json',
  none: '',
};

/**
 * Ensure a valid API key is available before executing an API command.
 *
 * Full automatic flow:
 * 1. Load key from config (flag > env > file)
 * 2. Verify with server
 * 3. If valid + credits > 0 → return key + source
 * 4. If invalid / missing → print auth URL, poll for key, save, return key
 * 5. If credits exhausted → print error, return null
 * 6. If network error / timeout → print error, return null
 */
export async function ensureAuth(apiKeyOverride?: string): Promise<AuthResult | null> {
  const config = await loadConfig({ apiKey: apiKeyOverride });
  const currentKey = config.apiKey || undefined;
  const source = config.apiKeySource;

  const result = await verifyKey(currentKey);
  if (!result) {
    console.error('[ERROR] Failed to verify API key. Check your network connection.');
    return null;
  }

  // Key is valid
  if (result.verified) {
    const credits = parseCredits(result.credits);
    if (credits <= 0) {
      console.error('[ERROR] API key is valid but has no credits remaining.');
      return null;
    }
    if (!currentKey) {
      // Server verified (e.g. by IP) but we don't have the key locally
      // Fall through to login flow
    } else {
      return { apiKey: currentKey, source };
    }
  }

  // Not verified or no local key — enter login flow
  if (!result.auth_url || !result.fetch_token) {
    if (currentKey) {
      console.error(`[ERROR] API key from ${SOURCE_LABELS[source]} is invalid. Run \`anygen auth\` to re-authenticate.`);
    } else {
      console.error('[ERROR] API key is not configured. Run `anygen auth login` to authenticate.');
    }
    return null;
  }

  console.error(`[AUTH] Open this URL to authorize:`);
  console.error(`[AUTH] ${result.auth_url}`);
  if (result.api_key_name) {
    console.error(`[AUTH] This will create an API key named: ${result.api_key_name}`);
  }
  console.error('[AUTH] Waiting for authorization...');

  const key = await waitForKey(result.fetch_token);
  if (!key) {
    console.error('[ERROR] Authorization failed or timed out.');
    console.error('[ERROR] You can also run: anygen auth login --api-key sk-xxx');
    return null;
  }

  return { apiKey: key, source: 'config' }; // waitForKey saves to config file
}

/**
 * Poll /v1/openapi/key/get until key is allocated or timeout.
 * Also checks config file for manually configured key.
 * On success, saves the key and returns it.
 */
export async function waitForKey(
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
    const config = await loadConfig();
    if (config.apiKey && config.apiKey !== lastCheckedKey) {
      lastCheckedKey = config.apiKey;
      const verifyResult = await verifyKey(config.apiKey);
      if (verifyResult?.verified && parseCredits(verifyResult.credits) > 0) {
        console.error('[AUTH] API key configured successfully.');
        return config.apiKey;
      }
    }

    // Poll server for key allocation via web login
    const result = await getKey(fetchToken);
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
