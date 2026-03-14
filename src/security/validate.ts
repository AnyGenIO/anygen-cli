/**
 * Input validation for AI-agent safety.
 *
 * This CLI is frequently invoked by AI/LLM agents. Always assume inputs
 * can be adversarial — validate paths against traversal, restrict resource
 * IDs, and sanitize file names from API responses.
 *
 * Trust model:
 * - Environment variables / config file → trusted (set by human operator)
 * - CLI arguments → untrusted (may come from AI agent under prompt injection)
 * - API responses → untrusted (may contain malicious payloads)
 */

import * as path from 'path';

/**
 * Validate an output directory path.
 * Rejects absolute paths, traversal sequences, and control characters.
 * Intended for --output-dir flags where AI agents might pass adversarial paths.
 */
export function validateSafeOutputDir(dir: string): string {
  if (!dir || dir.trim().length === 0) {
    throw new ValidationError('Output directory must not be empty');
  }

  // Reject control characters (U+0000–U+001F, U+007F)
  if (/[\x00-\x1f\x7f]/.test(dir)) {
    throw new ValidationError('Output directory contains control characters');
  }

  // Reject absolute paths — force relative to CWD
  if (path.isAbsolute(dir)) {
    throw new ValidationError(
      `Output directory must be a relative path, got absolute: "${dir}". ` +
      'Use a relative path like "./output" or "results/"',
    );
  }

  // Reject path traversal sequences
  const normalized = path.normalize(dir);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
    throw new ValidationError(
      `Output directory contains path traversal: "${dir}". ` +
      'Use a path within the current directory',
    );
  }

  return normalized;
}

/**
 * Validate a resource name (task_id, file_token, etc.) used in URL paths.
 * Rejects traversal sequences, URL-breaking characters, and control characters.
 */
export function validateResourceName(name: string, label: string = 'Resource name'): string {
  if (!name || name.trim().length === 0) {
    throw new ValidationError(`${label} must not be empty`);
  }

  // Reject control characters
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw new ValidationError(`${label} contains control characters: "${name}"`);
  }

  // Reject path traversal
  if (name.includes('..')) {
    throw new ValidationError(`${label} contains path traversal sequence: "${name}"`);
  }

  // Reject URL-breaking characters
  if (/[?#&/\\]/.test(name)) {
    throw new ValidationError(
      `${label} contains invalid characters (?, #, &, /, \\): "${name}"`,
    );
  }

  // Reasonable length limit
  if (name.length > 256) {
    throw new ValidationError(`${label} exceeds maximum length (256): ${name.length}`);
  }

  return name;
}

/**
 * Sanitize a file name from API response for safe local storage.
 * Strips path components, traversal sequences, and dangerous characters.
 * This is critical — API responses are untrusted and could contain
 * names like "../../.bashrc" or "../../../etc/passwd".
 */
export function sanitizeFileName(name: string | undefined | null, fallback: string = 'output'): string {
  if (!name || name.trim().length === 0) {
    return fallback;
  }

  // Strip any directory components — only keep the basename
  let safe = path.basename(name);

  // Remove control characters
  safe = safe.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove leading dots (prevent hidden files like .bashrc, .ssh)
  safe = safe.replace(/^\.+/, '');

  // Remove characters that are dangerous on various OS
  safe = safe.replace(/[<>:"|?*\\]/g, '_');

  // Collapse multiple underscores/spaces
  safe = safe.replace(/[_\s]+/g, '_');

  // Trim and enforce length limit
  safe = safe.trim().slice(0, 200);

  if (safe.length === 0) {
    return fallback;
  }

  return safe;
}

/**
 * Validate a URL from API response before fetching.
 * Only allows HTTPS URLs to prevent SSRF and local file access.
 */
export function validateDownloadUrl(url: string): string {
  if (!url || url.trim().length === 0) {
    throw new ValidationError('Download URL must not be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError(`Invalid download URL: "${url}"`);
  }

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') {
    throw new ValidationError(
      `Download URL must use HTTPS, got: "${parsed.protocol}". ` +
      'Refusing to download from non-HTTPS source',
    );
  }

  // Block localhost / private IPs (SSRF prevention)
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new ValidationError(`Download URL points to private/local address: "${host}"`);
  }

  return url;
}

/**
 * Validate JSON params input.
 * Ensures it parses correctly and is an object (not array or primitive).
 */
export function validateJsonParams(input: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new ValidationError('--params is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('--params must be a JSON object (not array or primitive)');
  }

  return parsed as Record<string, unknown>;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
