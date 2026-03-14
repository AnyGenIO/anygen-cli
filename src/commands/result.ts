/**
 * Result output utility for L3 commands
 *
 * Background exec notifies the agent with the tail ~400 chars of output.
 * This utility ensures the final result fits within that budget.
 * If the JSON exceeds the inline limit, it is saved to a temp file
 * and the output directs the agent to read that file.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const MAX_INLINE_CHARS = 350;

export async function printResult(data: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(data);

  if (json.length <= MAX_INLINE_CHARS) {
    console.log(`[RESULT] ${json}`);
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `anygen-result-${Date.now()}.json`);
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
  console.log(`[RESULT] Output saved to ${tmpFile}`);
}
