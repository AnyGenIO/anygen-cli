/**
 * Centralized JSON output with optional _notice injection.
 */

import { getResolvedNotice } from './update-check.js';

/** Print JSON to stdout, appending _notice if a version update is available. */
export function outputJson(data: unknown): void {
  const notice = getResolvedNotice();
  if (notice && data && typeof data === 'object' && !Array.isArray(data)) {
    (data as Record<string, unknown>)._notice = notice;
  }
  console.log(JSON.stringify(data, null, 2));
}
