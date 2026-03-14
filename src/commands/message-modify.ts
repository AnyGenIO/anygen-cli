/**
 * `anygen message +chat` — L3 composite (helper) command
 *
 * Combines: message.send → message.list --wait
 *
 * Designed for AI agent use. Sends a modification message to a completed
 * task, then polls until the modification is finished.
 *
 * Example:
 *   anygen message +chat --task-id <id> --content "Change the title to Overview"
 */

import { Command } from 'commander';
import type { DiscoveryDocument, Method } from '../discovery/types.js';
import { callApi } from '../api/client.js';
import type { AnygenConfig } from '../config/config.js';
import { pollMessages } from './poll.js';
import { printResult } from './result.js';
import { sanitizeResponse, getSanitizeMode } from '../security/sanitize.js';
import { CLI_VERSION } from '../version.js';
import { ensureAuth } from '../api/auth.js';

/**
 * Register `message +chat` as a helper subcommand under the `message` resource command.
 * Called before buildResourceMethods so +commands appear first in --help.
 */
export function registerMessageHelpers(
  messageCmd: Command,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  const sendMethod = doc.resources.message?.methods.send;
  const listMethod = doc.resources.message?.methods.list;
  if (!sendMethod || !listMethod) return;

  messageCmd
    .command('+chat')
    .description('Send a modification message and wait for completion')
    .requiredOption('--task-id <id>', 'Task ID to modify')
    .requiredOption('--content <text>', 'Modification message')
    .option('--file-tokens <json>', 'File tokens from file.upload (JSON array)')
    .option('--timeout <ms>', 'Polling timeout in milliseconds')
    .action(async (opts: Record<string, string>) => {
      await executeMessageModify(sendMethod, listMethod, opts, config);
    });
}

async function executeMessageModify(
  sendMethod: Method,
  listMethod: Method,
  opts: Record<string, string>,
  config: AnygenConfig,
): Promise<void> {
  // Verify API key before any API call
  const auth = await ensureAuth(config.apiKey || undefined);
  if (!auth) {
    process.exit(1);
  }
  const verifiedKey = auth.apiKey;

  const taskId = opts.taskId;

  // Build request body from individual flags
  const body: Record<string, unknown> = {};

  body.content = opts.content;

  if (opts.fileTokens) {
    try {
      body.file_tokens = JSON.parse(opts.fileTokens);
    } catch {
      console.error('Error: --file-tokens must be a valid JSON array');
      process.exit(1);
    }
  }

  if (!body.extra) body.extra = {};
  const extra = body.extra as Record<string, unknown>;
  extra.create_from ??= 'anygen-cli';
  extra.version ??= CLI_VERSION;

  // Step 1: message.send
  console.log(`[INFO] Sending modification message to task: ${taskId}`);
  let sendResult;
  try {
    sendResult = await callApi({
      baseUrl: config.baseUrl,
      apiKey: verifiedKey,
      method: sendMethod,
      params: { task_id: taskId },
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: message.send failed: ${message}`);
    process.exit(1);
  }

  if (!sendResult.success) {
    console.error('[ERROR] message.send failed:');
    console.log(JSON.stringify(sendResult.data, null, 2));
    process.exit(1);
  }

  sanitizeResponse(sendResult.data, getSanitizeMode());
  console.log(`[INFO] Message sent successfully`);

  // Step 2: message.list --wait (poll until no messages are running)
  const timeout = Number(opts.timeout) || undefined;
  const authConfig = { ...config, apiKey: verifiedKey };
  const pollResult = await pollMessages(authConfig, listMethod, { task_id: taskId }, timeout);

  // Final result — compact JSON for background exec notification
  const result: Record<string, unknown> = {
    status: 'completed',
    task_id: taskId,
  };
  // Extract useful fields from the latest message
  const messages = (pollResult.data?.messages ?? pollResult.data?.data ?? []) as Array<Record<string, unknown>>;
  const latest = messages[0] as Record<string, unknown> | undefined;
  if (latest?.preview_url) result.preview_url = latest.preview_url;
  if (latest?.task_url) result.preview_url ??= latest.task_url;
  if (latest?.thumbnail_url) result.thumbnail_url = latest.thumbnail_url;
  await printResult(result);
}
