/**
 * File download utility
 *
 * Downloads a remote file to a local directory with security validation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { validateDownloadUrl, sanitizeFileName, validateSafeOutputDir } from '../security/validate.js';
import { networkError, outputError } from '../errors.js';

/**
 * Download a file from URL to local directory.
 * Validates URL (SSRF), sanitizes filename, and avoids overwriting.
 */
export async function downloadToLocal(
  fileUrl: string,
  fileName: string | undefined,
  outputDir: string,
): Promise<string | null> {
  // Validate URL — prevent SSRF and non-HTTPS downloads
  const safeUrl = validateDownloadUrl(fileUrl);

  // Sanitize file name from API response — prevent path traversal
  const safeFileName = sanitizeFileName(fileName);

  // Validate output directory
  validateSafeOutputDir(outputDir);

  const resp = await fetch(safeUrl, { redirect: 'follow' });
  if (!resp.ok) {
    outputError(networkError(`Download failed: HTTP ${resp.status}`));
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
  return filePath;
}
