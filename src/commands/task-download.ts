/**
 * `anygen task +download` — helper command
 *
 * Download artifacts from a completed task.
 * Supports multi-file download, selective download by name, and thumbnail.
 *
 * Example:
 *   anygen task +download --task-id <id> --output-dir ./output
 *   anygen task +download --task-id <id> --file report.pptx --file data.xlsx
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

interface OutputFile {
  url: string;
  name: string;
  expires_at?: number;
}

interface DownloadOpts {
  taskId: string;
  outputDir?: string;
  thumbnail?: boolean;
  file?: string[];
}

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
    .option('--file <name...>', 'Download specific file(s) by name (repeatable)')
    .action(async (opts: DownloadOpts) => {
      await executeTaskDownload(getMethod, opts, config);
    });
}

async function executeTaskDownload(
  getMethod: Method,
  opts: DownloadOpts,
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

  // Handle thumbnail download
  if (opts.thumbnail) {
    if (!output.thumbnail_url) {
      outputError(apiError('No thumbnail available for this task.'));
    }
    const files = parseOutputFiles(output);
    const stem = files.length > 0
      ? path.basename(files[0].name, path.extname(files[0].name))
      : 'output';
    const downloadedFile = await downloadToLocal(
      output.thumbnail_url as string,
      `${stem}_thumbnail.png`,
      outputDir,
    );
    const result: Record<string, unknown> = {
      status: 'completed',
      task_id: taskId,
    };
    if (downloadedFile) result.file = downloadedFile;
    if (output.task_url) result.task_url = output.task_url;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Parse files from output.files[] (new API) with fallback to file_url (legacy)
  const allFiles = parseOutputFiles(output);
  if (allFiles.length === 0) {
    outputError(apiError('No downloadable file found in task output.'));
  }

  // Filter by --file names if specified
  let filesToDownload = allFiles;
  if (opts.file && opts.file.length > 0) {
    const requestedNames = new Set(opts.file);
    filesToDownload = allFiles.filter(f => requestedNames.has(f.name));
    if (filesToDownload.length === 0) {
      const available = allFiles.map(f => f.name).join(', ');
      outputError(validationError(
        `No matching files found for: ${opts.file.join(', ')}`,
        `Available files: ${available}`,
      ));
    }
  }

  // Download all selected files
  const downloadedFiles: Array<{ file: string; name: string }> = [];
  for (const f of filesToDownload) {
    const filePath = await downloadToLocal(f.url, f.name, outputDir);
    if (!filePath) continue;

    // smart_draw: render diagram files to PNG
    if (operation === 'smart_draw') {
      const rendered = await renderAndCleanup(filePath);
      downloadedFiles.push({
        file: rendered ?? filePath,
        name: rendered ? path.basename(rendered) : f.name,
      });
    } else {
      downloadedFiles.push({ file: filePath, name: f.name });
    }
  }

  // Output result
  const result: Record<string, unknown> = {
    status: 'completed',
    task_id: taskId,
    files: downloadedFiles,
  };
  if (output.task_url) result.task_url = output.task_url;
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Parse output files from the API response.
 * Prefers output.files[] (new API), falls back to file_url/file_name (legacy).
 */
function parseOutputFiles(output: Record<string, unknown>): OutputFile[] {
  // New API: output.files[]
  const files = output.files as OutputFile[] | undefined;
  if (Array.isArray(files) && files.length > 0) {
    return files.filter(f => f.url && f.name);
  }

  // Legacy fallback: output.file_url + output.file_name
  const fileUrl = output.file_url as string | undefined;
  if (fileUrl) {
    return [{
      url: fileUrl,
      name: (output.file_name as string) || 'output',
      expires_at: output.expires_at as number | undefined,
    }];
  }

  return [];
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
