/**
 * `anygen task +download` — helper command
 *
 * Download artifacts from a completed task.
 * Handles file download, thumbnail download, and smart_draw rendering.
 *
 * Example:
 *   anygen task +download --task-id <id> --output-dir ./output
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import type { DiscoveryDocument, Method } from '../discovery/types.js';
import type { AnygenConfig } from '../config/config.js';
import { callApi } from '../api/client.js';
import { downloadToLocal } from '../utils/download.js';
import { validateSafeOutputDir } from '../security/validate.js';
import { renderDiagram, type DiagramType } from '../render/diagram.js';
import { ensureAuth } from '../api/auth.js';
import { validationError, apiError, outputError, toCliError } from '../errors.js';

/**
 * Register `task +download` as a helper subcommand under the `task` resource command.
 */
export function registerTaskHelpers(
  taskCmd: Command,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  const getMethod = doc.resources.task?.methods?.get;
  if (!getMethod) return;

  taskCmd
    .command('+download')
    .description('[Helper] Download artifacts from a completed task')
    .requiredOption('--task-id <id>', 'Task ID')
    .option('--output-dir <dir>', 'Local directory to save files (default: current directory)')
    .option('--thumbnail', 'Download thumbnail image instead of main file')
    .action(async (opts: Record<string, string>) => {
      await executeTaskDownload(getMethod, opts, config);
    });
}

async function executeTaskDownload(
  getMethod: Method,
  opts: Record<string, string>,
  config: AnygenConfig,
): Promise<void> {
  const auth = await ensureAuth(config);
  const verifiedKey = auth.apiKey;

  const taskId = opts.taskId;
  const outputDir = opts.outputDir || '.';

  // Validate --output-dir
  try {
    validateSafeOutputDir(outputDir);
  } catch (err) {
    outputError(validationError(err instanceof Error ? err.message : String(err)));
  }

  // Fetch current task state
  let taskData: Record<string, unknown>;
  try {
    const result = await callApi({
      baseUrl: config.baseUrl,
      apiKey: verifiedKey,
      method: getMethod,
      params: { task_id: taskId },
    });
    if (!result.success) {
      outputError(apiError(`Failed to get task: ${JSON.stringify(result.data)}`));
    }
    taskData = result.data as Record<string, unknown>;
  } catch (err) {
    outputError(toCliError(err));
  }

  if (taskData.status !== 'completed') {
    outputError(validationError(
      `Task is not completed (status: ${taskData.status}).`,
      `Use 'anygen task get --params \'{"task_id":"${taskId}"}\' --wait' first.`,
    ));
  }

  const output = (taskData.output ?? {}) as Record<string, unknown>;
  const operation = taskData.operation as string | undefined;

  let downloadedFile: string | null | undefined;

  if (opts.thumbnail) {
    // Download thumbnail only
    if (!output.thumbnail_url) {
      outputError(apiError('No thumbnail available for this task.'));
    }
    const mainName = output.file_name as string | undefined;
    const mainStem = mainName ? path.basename(mainName, path.extname(mainName)) : 'output';
    downloadedFile = await downloadToLocal(output.thumbnail_url as string, `${mainStem}_thumbnail.png`, outputDir);
  } else {
    // Download main file
    if (!output.file_url) {
      outputError(apiError('No downloadable file found in task output.'));
    }
    const filePath = await downloadToLocal(output.file_url as string, output.file_name as string | undefined, outputDir);
    if (filePath && operation === 'smart_draw') {
      downloadedFile = await renderAndCleanup(filePath) ?? filePath;
    } else {
      downloadedFile = filePath;
    }
  }

  // Output result (JSON to stdout, like larksuite-cli runtime.Out)
  const result: Record<string, unknown> = {
    status: 'completed',
    task_id: taskId,
  };
  if (downloadedFile) result.file = downloadedFile;
  if (output.task_url) result.task_url = output.task_url;
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Render a downloaded diagram file to PNG and delete the source file.
 * Returns the rendered PNG path, or null on failure.
 */
async function renderAndCleanup(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  const type: DiagramType = ext === '.json' ? 'excalidraw' : 'drawio';

  const outputPath = filePath.replace(/\.[^.]+$/, '.png');

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const result = await renderDiagram({ type, content });
    await fs.writeFile(outputPath, result.data);
    await fs.unlink(filePath);
    return outputPath;
  } catch {
    return null;
  }
}
