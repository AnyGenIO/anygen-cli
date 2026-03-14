/**
 * Configuration: ~/.config/anygen/config.json
 *
 * Priority: --api-key flag > config file > ANYGEN_API_KEY env
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
}

/**
 * Load config (merge flag > config file > env)
 */
export async function loadConfig(overrides?: { apiKey?: string }): Promise<AnygenConfig> {
  const fileConfig = await loadConfigFile();

  let apiKey: string;
  let apiKeySource: ApiKeySource;

  if (overrides?.apiKey) {
    apiKey = overrides.apiKey;
    apiKeySource = 'flag';
  } else if (fileConfig.apiKey) {
    apiKey = fileConfig.apiKey;
    apiKeySource = 'config';
  } else if (process.env.ANYGEN_API_KEY) {
    apiKey = process.env.ANYGEN_API_KEY;
    apiKeySource = 'env';
  } else {
    apiKey = '';
    apiKeySource = 'none';
  }

  return { baseUrl: BASE_URL, apiKey, apiKeySource };
}

/**
 * Save API key to config file
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_FILE, JSON.stringify({ api_key: apiKey }, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Remove API key from config file
 */
export async function removeApiKey(): Promise<void> {
  try {
    await fs.access(CONFIG_FILE);
    // Overwrite with empty config (preserves file, clears key)
    await fs.writeFile(CONFIG_FILE, '', { mode: 0o600 });
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

async function loadConfigFile(): Promise<{ apiKey?: string }> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    // Strip trailing commas before closing braces/brackets (Python compat)
    const cleaned = raw.replace(/,\s*([\]}])/g, '$1');
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return {};
    return { apiKey: parsed.api_key || undefined };
  } catch {
    return {};
  }
}
