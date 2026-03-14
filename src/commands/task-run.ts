/**
 * `anygen task +run` — L3 composite (helper) command
 *
 * Combines: task.create → task.get --wait → download
 *
 * Designed for AI agent use. The prepare phase (multi-turn requirements
 * gathering) is NOT included — agents handle that loop themselves via
 * `anygen task prepare`.
 *
 * Example:
 *   anygen task +run --operation slide --prompt "Q4 deck" --output-dir .
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import type { DiscoveryDocument, Method } from '../discovery/types.js';
import { callApi } from '../api/client.js';
import type { AnygenConfig } from '../config/config.js';
import { pollTask } from './poll.js';
import { printResult } from './result.js';
import { validateSafeOutputDir } from '../security/validate.js';
import { sanitizeResponse, getSanitizeMode } from '../security/sanitize.js';
import { renderDiagram, type DiagramType } from '../render/diagram.js';
import { CLI_VERSION } from '../version.js';
import { ensureAuth } from '../api/auth.js';

/**
 * Register `task +run` as a helper subcommand under the `task` resource command.
 * Called before buildResourceMethods so +commands appear first in --help.
 */
export function registerTaskHelpers(
  taskCmd: Command,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  const createMethod = doc.resources.task?.methods.create;
  const getMethod = doc.resources.task?.methods.get;
  if (!createMethod || !getMethod) return;

  taskCmd
    .command('+run')
    .description('Create a task, wait for completion, and download the result')
    .requiredOption('--operation <name>', 'Operation type (e.g. slide, doc, smart_draw)')
    .requiredOption('--prompt <text>', 'Task description / prompt')
    .option('--file-tokens <json>', 'File tokens from file.upload (JSON array)')
    .option('--export-format <format>', 'Export format (e.g. docx, drawio, excalidraw)')
    .option('--output-dir <dir>', 'Download output file to local directory')
    .option('--timeout <ms>', 'Polling timeout in milliseconds')
    .action(async (opts: Record<string, string>) => {
      await executeTaskRun(createMethod, getMethod, opts, config);
    });
}

async function executeTaskRun(
  createMethod: Method,
  getMethod: Method,
  opts: Record<string, string>,
  config: AnygenConfig,
): Promise<void> {
  // Verify API key before any API call
  const auth = await ensureAuth(config.apiKey || undefined);
  if (!auth) {
    process.exit(1);
  }
  const verifiedKey = auth.apiKey;

  // Validate --output-dir early
  if (opts.outputDir) {
    try {
      validateSafeOutputDir(opts.outputDir);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // Build request body from individual flags
  const body: Record<string, unknown> = {};

  body.operation = opts.operation;
  body.prompt = opts.prompt;

  if (opts.fileTokens) {
    try {
      body.file_tokens = JSON.parse(opts.fileTokens);
    } catch {
      console.error('Error: --file-tokens must be a valid JSON array');
      process.exit(1);
    }
  }

  if (opts.exportFormat) {
    body.export_format = opts.exportFormat;
  }

  if (!body.extra) body.extra = {};
  const extra = body.extra as Record<string, unknown>;
  extra.create_from ??= 'anygen-cli';
  extra.version ??= CLI_VERSION;

  // Step 1: task.create
  console.log('[INFO] Creating task...');
  let createResult;
  try {
    createResult = await callApi({
      baseUrl: config.baseUrl,
      apiKey: verifiedKey,
      method: createMethod,
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: task.create failed: ${message}`);
    process.exit(1);
  }

  if (!createResult.success) {
    console.error('[ERROR] task.create failed:');
    console.log(JSON.stringify(createResult.data, null, 2));
    process.exit(1);
  }

  const createData = sanitizeResponse(createResult.data, getSanitizeMode()) as Record<string, unknown>;
  const taskId = (createData.task_id ?? createData.id) as string | undefined;

  if (!taskId) {
    console.error('[ERROR] No task_id in create response:');
    console.log(JSON.stringify(createData, null, 2));
    process.exit(1);
  }

  console.log(`[INFO] Task created: ${taskId}`);

  // Step 2: task.get --wait (poll until completed/failed)
  // Step 3: download (handled inside pollTask when outputDir is set)
  const timeout = Number(opts.timeout) || undefined;
  const authConfig = { ...config, apiKey: verifiedKey };
  const pollResult = await pollTask(authConfig, getMethod, taskId, opts.outputDir, timeout);

  // Step 4: auto-render for smart_draw — convert drawio/excalidraw to PNG, delete source
  const operation = body.operation as string | undefined;
  if (operation === 'smart_draw' && pollResult.downloadedFile) {
    const rendered = await renderAndCleanup(pollResult.downloadedFile, body.export_format as string | undefined);
    if (rendered) pollResult.downloadedFile = rendered;
  }

  // Final result — compact JSON for background exec notification
  const output = pollResult.output;
  const result: Record<string, unknown> = {
    status: 'completed',
    task_id: taskId,
  };
  if (output.task_url) result.preview_url = output.task_url;
  if (output.thumbnail_url) result.thumbnail_url = output.thumbnail_url;
  if (output.slide_count) result.slide_count = output.slide_count;
  if (output.word_count) result.word_count = output.word_count;
  if (pollResult.downloadedFile) result.file_path = pollResult.downloadedFile;
  await printResult(result);
}

/**
 * Render a downloaded diagram file to PNG and delete the source file.
 * Returns the rendered PNG path, or null on failure.
 */
async function renderAndCleanup(filePath: string, exportFormat?: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  let type: DiagramType;
  if (exportFormat === 'excalidraw' || ext === '.json') {
    type = 'excalidraw';
  } else {
    type = 'drawio';
  }

  const outputPath = filePath.replace(/\.[^.]+$/, '.png');

  console.log(`[INFO] Rendering ${type} → PNG...`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const result = await renderDiagram({ type, content });
    await fs.writeFile(outputPath, result.data);

    console.log(`[SUCCESS] Rendered: ${outputPath}`);

    // Delete source file
    await fs.unlink(filePath);
    return outputPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[WARN] Render failed: ${msg}`);
    return null;
  }
}
