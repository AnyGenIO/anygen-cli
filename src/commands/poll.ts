/**
 * Polling utilities for --wait flag
 */

import { callApi } from '../api/client.js';
import type { AnygenConfig } from '../config/config.js';
import type { Method } from '../discovery/types.js';
import { apiError, outputError } from '../errors.js';

/**
 * Fallback set for methods that support --wait polling.
 * Used when Discovery Document does not yet declare supportsPolling.
 * Once the server adds the field, this fallback is bypassed via nullish coalescing.
 */
const POLLABLE_METHOD_IDS = new Set(['task.get', 'task.message.list']);

/** Check whether a method supports --wait polling. */
export function methodSupportsPolling(method: Method): boolean {
  return method.supportsPolling ?? POLLABLE_METHOD_IDS.has(method.id);
}

const POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // 20 min
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Poll task.get until status is completed or failed.
 * Outputs the final task JSON to stdout.
 */
export async function pollTask(
  config: AnygenConfig,
  taskGetMethod: Method,
  taskId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  process.stderr.write(`  Polling task ${taskId}...\n`);
  const startTime = Date.now();
  let lastProgress = -1;
  let lastHeartbeat = startTime;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      outputError(apiError(`Polling timeout after ${timeoutMs / 1000}s`));
    }

    let result;
    try {
      result = await callApi({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        method: taskGetMethod,
        params: { task_id: taskId },
      });
    } catch {
      process.stderr.write(`  Network error, retrying...\n`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // Retry on server errors (5xx)
    if (result.statusCode >= 500) {
      process.stderr.write(`  Server error (HTTP ${result.statusCode}), retrying...\n`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const data = result.data as Record<string, unknown>;
    if (!data) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const status = data.status as string;
    const progress = (data.progress as number) ?? 0;

    if (progress !== lastProgress) {
      process.stderr.write(`  ${status} ${progress}%\n`);
      lastProgress = progress;
    }

    const now = Date.now();
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      process.stderr.write(`  ${ts} elapsed ${mins}m${String(secs).padStart(2, '0')}s | ${status} ${progress}%\n`);
      lastHeartbeat = now;
    }

    if (status === 'completed') {
      process.stderr.write(`  \x1b[32m✓\x1b[0m Task completed\n`);
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (status === 'failed') {
      outputError(apiError(`Task failed: ${data.error || 'Unknown error'}`));
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
      outputError(apiError(`Message polling timeout after ${timeoutMs / 1000}s`));
    }

    let result;
    try {
      result = await callApi({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        method: messageListMethod,
        params,
      });
    } catch {
      process.stderr.write(`  Network error, retrying...\n`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (result.statusCode >= 500) {
      process.stderr.write(`  Server error (HTTP ${result.statusCode}), retrying...\n`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const data = result.data as Record<string, unknown>;
    const messages = (data?.messages ?? data?.data ?? []) as Array<Record<string, unknown>>;
    const hasRunning = messages.some((m) => m.status === 'running');

    if (!hasRunning && messages.length > 0) {
      process.stderr.write(`  \x1b[32m✓\x1b[0m Modification completed\n`);
      return { data };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
