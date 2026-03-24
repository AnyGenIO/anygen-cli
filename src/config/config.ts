/**
 * Configuration: ~/.config/anygen/config.json
 *
 * Priority: --api-key flag > ANYGEN_API_KEY env > config file
 *
 * File permissions 0600 (owner-only) since it contains API key.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'anygen');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const BASE_URL = 'https://www.anygen.io';

export type ApiKeySource = 'flag' | 'env' | 'config' | 'none';

export interface AnygenConfig {
  baseUrl: string;
  apiKey: string;
  apiKeySource: ApiKeySource;
  fetchToken?: string;
}

/**
 * Load config (merge flag > env > config file)
 */
export async function loadConfig(overrides?: { apiKey?: string }): Promise<AnygenConfig> {
  const fileConfig = await loadConfigFile();

  let apiKey: string;
  let apiKeySource: ApiKeySource;

  if (overrides?.apiKey) {
    apiKey = overrides.apiKey;
    apiKeySource = 'flag';
  } else if (process.env.ANYGEN_API_KEY) {
    apiKey = process.env.ANYGEN_API_KEY;
    apiKeySource = 'env';
  } else if (fileConfig.apiKey) {
    apiKey = fileConfig.apiKey;
    apiKeySource = 'config';
  } else {
    apiKey = '';
    apiKeySource = 'none';
  }

  const baseUrl = process.env.ANYGEN_BASE_URL || BASE_URL;
  return { baseUrl, apiKey, apiKeySource, fetchToken: fileConfig.fetchToken };
}

/**
 * Save API key to config file (clears fetch_token)
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_FILE, JSON.stringify({ api_key: apiKey }, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Save fetch_token to config file (preserves existing api_key)
 */
export async function saveFetchToken(fetchToken: string): Promise<void> {
  const existing = await loadConfigFile();
  const data: Record<string, string> = {};
  if (existing.apiKey) data.api_key = existing.apiKey;
  data.fetch_token = fetchToken;
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Clear fetch_token from config file (preserves existing api_key)
 */
export async function clearFetchToken(): Promise<void> {
  const existing = await loadConfigFile();
  const data: Record<string, string> = {};
  if (existing.apiKey) data.api_key = existing.apiKey;
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Remove API key and fetch_token from config file
 */
export async function removeApiKey(): Promise<void> {
  try {
    await fs.access(CONFIG_FILE);
    await fs.writeFile(CONFIG_FILE, '{}\n', { mode: 0o600 });
  } catch {
    // File doesn't exist, nothing to remove
  }
}

/**
 * Get current API key from config file (without env/flag override)
 */
export async function getStoredApiKey(): Promise<string> {
  const config = await loadConfigFile();
  return config.apiKey || '';
}

/**
 * Parse extra headers from ANYGEN_HEADERS env var for debug/PPE routing.
 * Format: "key1:value1,key2:value2"
 * Example: ANYGEN_HEADERS="x-use-ppe:1,x-tt-env:ppe_aidoc_xxx"
 */
export function getDebugHeaders(): Record<string, string> {
  const raw = process.env.ANYGEN_HEADERS;
  if (!raw) return {};

  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf(':');
    if (idx > 0) {
      headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  return headers;
}

async function loadConfigFile(): Promise<{ apiKey?: string; fetchToken?: string }> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    // Strip trailing commas before closing braces/brackets (Python compat)
    const cleaned = raw.replace(/,\s*([\]}])/g, '$1');
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      apiKey: parsed.api_key || undefined,
      fetchToken: parsed.fetch_token || undefined,
    };
  } catch {
    return {};
  }
}
