/**
 * Discovery Document 拉取 + 本地缓存（24 小时）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { DiscoveryDocument } from './types.js';

const CACHE_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'anygen', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'discovery.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  fetchedAt: number;
  document: DiscoveryDocument;
}

/**
 * 获取 Discovery Document（优先读缓存，过期则重新拉取）
 */
export async function getDiscoveryDocument(baseUrl: string): Promise<DiscoveryDocument> {
  // 尝试读取缓存
  const cached = await readCache();
  if (cached) {
    return cached;
  }

  // 从服务端拉取
  const doc = await fetchFromServer(baseUrl);

  // 写入缓存
  await writeCache(doc);

  return doc;
}

/**
 * 清除本地缓存（强制下次从服务端拉取）
 */
export async function clearCache(): Promise<void> {
  try {
    await fs.unlink(CACHE_FILE);
  } catch {
    // 文件不存在，忽略
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
    // 缓存不存在或损坏，忽略
  }
  return null;
}

async function writeCache(doc: DiscoveryDocument): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = { fetchedAt: Date.now(), document: doc };
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry, null, 2));
  } catch {
    // 缓存写入失败不影响主流程
  }
}

async function fetchFromServer(baseUrl: string): Promise<DiscoveryDocument> {
  const url = `${baseUrl}/v1/openapi/document`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch Discovery Document: ${resp.status} ${resp.statusText}`);
  }

  return await resp.json() as DiscoveryDocument;
}
