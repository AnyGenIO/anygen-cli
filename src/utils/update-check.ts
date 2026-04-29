/**
 * Non-blocking version update checker.
 *
 * Compares CLI_VERSION against the npm registry, caches results for 24h.
 * All errors are silently swallowed — this must never break the CLI.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CLI_VERSION } from '../version.js';

const CACHE_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'anygen',
  'cache',
);
const CACHE_FILE = path.join(CACHE_DIR, 'update-check.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const PACKAGE_NAME = '@anygen/cli';

export interface UpdateNotice {
  update: {
    current: string;
    latest: string;
    message: string;
  };
}

interface CacheEntry {
  checkedAt: number;
  latest: string;
}

let resolvedNotice: UpdateNotice | null = null;

/** Kick off a background version check. Call once at CLI startup. */
export function startUpdateCheck(): void {
  doCheck().then(n => { resolvedNotice = n; }).catch(() => {});
}

/** Return the notice synchronously if the check has already resolved. */
export function getResolvedNotice(): UpdateNotice | null {
  return resolvedNotice;
}

function newerThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

async function doCheck(): Promise<UpdateNotice | null> {
  // Try cache first
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.checkedAt < CACHE_TTL_MS) {
      return buildNotice(entry.latest);
    }
  } catch {
    // Cache miss — continue to fetch
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { version?: string };
    const latest = data.version;
    if (!latest) return null;

    // Write cache (fire-and-forget)
    writeCache(latest).catch(() => {});

    return buildNotice(latest);
  } finally {
    clearTimeout(timer);
  }
}

function buildNotice(latest: string): UpdateNotice | null {
  if (!newerThan(latest, CLI_VERSION)) return null;
  return {
    update: {
      current: CLI_VERSION,
      latest,
      message: `${PACKAGE_NAME} ${latest} available, current ${CLI_VERSION}`,
    },
  };
}

async function writeCache(latest: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { checkedAt: Date.now(), latest };
  await fs.writeFile(CACHE_FILE, JSON.stringify(entry));
}
