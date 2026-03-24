/**
 * Discovery Document fetch + local cache
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { DiscoveryDocument } from './types.js';
import { getDebugHeaders } from '../config/config.js';

const CACHE_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'anygen', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'discovery.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  fetchedAt: number;
  document: DiscoveryDocument;
}

/**
 * Get Discovery Document (reads from cache first, re-fetches if expired).
 */
export async function getDiscoveryDocument(baseUrl: string): Promise<DiscoveryDocument> {
  const cached = await readCache();
  if (cached) {
    return cached;
  }

  const doc = await fetchFromServer(baseUrl);
  await writeCache(doc);

  return doc;
}

/**
 * Clear local cache (forces re-fetch on next call).
 */
export async function clearCache(): Promise<void> {
  try {
    await fs.unlink(CACHE_FILE);
  } catch {
    // File does not exist, ignore
  }
}

async function readCache(): Promise<DiscoveryDocument | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      return entry.document;
    }
  } catch {
    // Cache missing or corrupted, ignore
  }
  return null;
}

async function writeCache(doc: DiscoveryDocument): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = { fetchedAt: Date.now(), document: doc };
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry, null, 2));
  } catch {
    // Cache write failure does not affect main flow
  }
}

async function fetchFromServer(baseUrl: string): Promise<DiscoveryDocument> {
  const url = `${baseUrl}/v1/openapi/document`;
  const headers: Record<string, string> = { 'Accept': 'application/json', ...getDebugHeaders() };
  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    throw new Error(`Failed to fetch Discovery Document: ${resp.status} ${resp.statusText}`);
  }

  return await resp.json() as DiscoveryDocument;
}

