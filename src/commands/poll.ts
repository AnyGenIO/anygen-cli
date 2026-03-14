/**
 * Polling and download utilities for --wait / --output-dir flags
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { callApi } from '../api/client.js';
import type { AnygenConfig } from '../config/config.js';
import type { Method } from '../discovery/types.js';
import { validateDownloadUrl, sanitizeFileName, validateSafeOutputDir } from '../security/validate.js';

const POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // 20 min
const HEARTBEAT_INTERVAL_MS = 30_000;

export interface TaskPollResult {
  taskId: string;
  output: Record<string, unknown>;
  downloadedFile: string | null;
}

/**
 * Poll task.get until status is completed or failed.
 * Optionally downloads the output file.
 * Returns structured result for the caller to format.
 */
export async function pollTask(
  config: AnygenConfig,
  taskGetMethod: Method,
  taskId: string,
  outputDir?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TaskPollResult> {
  console.log(`[INFO] Polling task: ${taskId}`);
  const startTime = Date.now();
  let lastProgress = -1;
  let lastHeartbeat = startTime;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      console.error(`[ERROR] Polling timeout (${timeoutMs / 1000}s)`);
      process.exit(1);
    }

    const result = await callApi({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      method: taskGetMethod,
      params: { task_id: taskId },
    });

    const data = result.data as Record<string, unknown>;
    if (!data) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const status = data.status as string;
    const progress = (data.progress as number) ?? 0;

    if (progress !== lastProgress) {
      console.log(`[PROGRESS] Status: ${status}, Progress: ${progress}%`);
      lastProgress = progress;
    }

    const now = Date.now();
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      console.log(`[HEARTBEAT] ${ts} | elapsed ${mins}m${String(secs).padStart(2, '0')}s | status: ${status} | progress: ${progress}%`);
      lastHeartbeat = now;
    }

    if (status === 'completed') {
      const output = (data.output ?? {}) as Record<string, unknown>;
      console.log(`[SUCCESS] Task completed`);

      let downloadedFile: string | null = null;
      if (outputDir && output.file_url) {
        downloadedFile = await downloadToLocal(output.file_url as string, output.file_name as string, outputDir);
      }

      return { taskId, output, downloadedFile };
    }

    if (status === 'failed') {
      console.error(`[ERROR] Task failed: ${data.error || 'Unknown error'}`);
      process.exit(1);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

export interface MessagePollResult {
  data: Record<string, unknown>;
}

/**
 * Poll message.list until no messages have status='running'.
 * Returns the final response data for the caller to format.
 */
export async function pollMessages(
  config: AnygenConfig,
  messageListMethod: Method,
  params: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MessagePollResult> {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      console.error('[ERROR] Wait timeout');
      process.exit(1);
    }

    const result = await callApi({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      method: messageListMethod,
      params,
    });

    const data = result.data as Record<string, unknown>;
    const messages = (data?.messages ?? data?.data ?? []) as Array<Record<string, unknown>>;
    const hasRunning = messages.some((m) => m.status === 'running');

    if (!hasRunning && messages.length > 0) {
      console.log(`[SUCCESS] Modification completed`);
      return { data };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Download a file from URL to local directory.
 */
export async function downloadToLocal(
  fileUrl: string,
  fileName: string | undefined,
  outputDir: string,
): Promise<string | null> {
  console.log('[INFO] Downloading file...');

  try {
    // Validate URL — prevent SSRF and non-HTTPS downloads
    const safeUrl = validateDownloadUrl(fileUrl);

    // Sanitize file name from API response — prevent path traversal
    const safeFileName = sanitizeFileName(fileName);

    // Validate output directory
    validateSafeOutputDir(outputDir);

    const resp = await fetch(safeUrl, { redirect: 'manual' });
    if (!resp.ok) {
      console.error(`[ERROR] Download failed: HTTP ${resp.status}`);
      return null;
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    await fs.mkdir(outputDir, { recursive: true });

    let filePath = path.join(outputDir, safeFileName);

    // Avoid overwriting existing files
    try {
      await fs.access(filePath);
      const ext = path.extname(filePath);
      const stem = path.basename(filePath, ext);
      let counter = 1;
      while (true) {
        filePath = path.join(outputDir, `${stem}_${counter}${ext}`);
        try {
          await fs.access(filePath);
          counter++;
        } catch {
          break;
        }
      }
    } catch {
      // File doesn't exist, use as-is
    }

    await fs.writeFile(filePath, buffer);
    console.log(`[SUCCESS] File saved: ${filePath}`);
    return filePath;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Download failed: ${message}`);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
