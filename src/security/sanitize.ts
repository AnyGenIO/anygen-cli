/**
 * Response sanitization (Model Armor).
 *
 * API responses are untrusted — they may contain prompt injection attacks
 * embedded in field values (task titles, file names, descriptions, etc.).
 *
 * Before outputting API response data to stdout (which AI agents read),
 * scan for known prompt injection patterns and flag them.
 *
 * Modes:
 * - "warn": print warning to stderr, still output the data (default)
 * - "block": print warning to stderr, redact the suspicious field
 */

export type SanitizeMode = 'warn' | 'block';

const INJECTION_PATTERNS: RegExp[] = [
  // Direct instruction override attempts
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)/i,
  /forget\s+(everything|all|your)\s+(you|previous|instructions?)/i,

  // Role hijacking
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+(a\s+)?different/i,
  /new\s+instructions?:\s/i,
  /system\s*prompt\s*:/i,

  // Dangerous command injection via tool calls
  /```\s*(bash|sh|shell|cmd|powershell)[\s\S]*?(rm\s+-rf|del\s+\/|format\s+c:|shutdown|mkfs)/i,

  // Exfiltration attempts
  /curl\s+.*\|\s*(bash|sh)/i,
  /wget\s+.*-O\s*-\s*\|\s*(bash|sh)/i,

  // Hidden instructions in common fields
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
];

interface ScanResult {
  /** Whether any injection patterns were detected */
  detected: boolean;
  /** Which fields contained suspicious content */
  flaggedFields: string[];
}

/**
 * Scan a parsed API response for prompt injection patterns.
 * Recursively checks all string values in the object.
 */
export function scanForInjection(data: unknown, prefix: string = ''): ScanResult {
  const flaggedFields: string[] = [];

  function walk(value: unknown, path: string): void {
    if (typeof value === 'string') {
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(value)) {
          flaggedFields.push(path || '(root)');
          break; // One match per field is enough
        }
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${path}[${i}]`);
      }
    } else if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        walk(val, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(data, prefix);

  return {
    detected: flaggedFields.length > 0,
    flaggedFields,
  };
}

/**
 * Sanitize API response data before outputting.
 * Returns the (possibly redacted) data and prints warnings to stderr.
 */
export function sanitizeResponse(
  data: unknown,
  mode: SanitizeMode = 'warn',
): unknown {
  const result = scanForInjection(data);

  if (!result.detected) {
    return data;
  }

  const fieldList = result.flaggedFields.join(', ');
  console.error(
    `[SECURITY WARNING] Potential prompt injection detected in API response fields: ${fieldList}`,
  );
  console.error(
    '[SECURITY WARNING] The API response may contain malicious content attempting to manipulate AI agents.',
  );

  if (mode === 'block') {
    console.error('[SECURITY] Blocking response output. Use --raw to bypass sanitization.');
    return { _blocked: true, reason: 'Potential prompt injection detected', fields: result.flaggedFields };
  }

  // In "warn" mode, still output the data but warn was printed to stderr
  return data;
}

/**
 * Get the sanitization mode from environment or default.
 */
export function getSanitizeMode(): SanitizeMode {
  const env = process.env.ANYGEN_SANITIZE_MODE?.toLowerCase();
  if (env === 'block') return 'block';
  return 'warn';
}
