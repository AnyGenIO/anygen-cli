/**
 * Unified error handling for AnyGen CLI.
 *
 * Error envelope format (aligned with larksuite-cli):
 * { "success": false, "error": { "type": "validation", "message": "...", "hint": "..." } }
 *
 * Type classification (same as larksuite-cli):
 *   validation  — client-side param check failed
 *   auth        — authentication failed (invalid key, expired, login required)
 *   permission  — authenticated but insufficient permissions / credits
 *   rate_limit  — server rate limiting
 *   api_error   — general API / server error (catch-all)
 *   network     — cannot reach server
 *   internal    — CLI bug (should not happen)
 */

export type ErrorType =
  | 'validation'
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'api_error'
  | 'network'
  | 'internal';

export interface ErrorDetail {
  type: ErrorType;
  message: string;
  hint?: string;
}

/**
 * Structured CLI error. Thrown anywhere in the codebase,
 * caught at the top level and output as JSON to stdout.
 */
export class CliError extends Error {
  readonly detail: ErrorDetail;

  constructor(detail: ErrorDetail) {
    super(detail.message);
    this.name = 'CliError';
    this.detail = detail;
  }

  toJSON(): { success: false; error: ErrorDetail } {
    const obj: ErrorDetail = {
      type: this.detail.type,
      message: this.detail.message,
    };
    if (this.detail.hint) obj.hint = this.detail.hint;
    return { success: false, error: obj };
  }
}

// ---------------------------------------------------------------------------
// Convenience constructors
// ---------------------------------------------------------------------------

export function validationError(message: string, hint?: string): CliError {
  return new CliError({ type: 'validation', message, hint });
}

export function authError(message: string, hint?: string): CliError {
  return new CliError({ type: 'auth', message, hint: hint ?? 'Run: anygen auth login' });
}

export function apiError(message: string, hint?: string): CliError {
  return new CliError({ type: 'api_error', message, hint });
}

export function networkError(message: string): CliError {
  return new CliError({ type: 'network', message, hint: 'Check your network connection and retry.' });
}

export function internalError(message: string): CliError {
  return new CliError({ type: 'internal', message });
}

// ---------------------------------------------------------------------------
// Server error classification (like larksuite-cli ClassifyLarkError)
// ---------------------------------------------------------------------------

/**
 * Classify a server error code + message into a CliError with proper type and hint.
 *
 * Error code ranges (mino_server/biz/pkg/errcode/const.go):
 *   100004001       param error
 *   100004002       not found
 *   100004003       forbidden / invalid API key
 *   100004004       login required
 *   100004006/12    rate limit
 *   100004xxx       other client errors
 *   100005xxx       server internal
 *   100006029       credits insufficient
 *   100006xxx       internal (marshal, encode, etc.)
 *   100007xxx       agent runtime error
 */
export function classifyServerError(code: number | undefined, message: string): CliError {
  if (code) {
    switch (code) {
      // Auth
      case 100004003:
      case 100004004:
        return authError(message);
      // Validation
      case 100004001:
        return validationError(message);
      // Rate limit
      case 100004006:
      case 100004012:
        return new CliError({ type: 'rate_limit', message, hint: 'Please retry after a short wait.' });
      // Credits
      case 100006029:
        return new CliError({ type: 'permission', message, hint: 'Check your credits at https://www.anygen.io' });
    }

    // Range-based: 4xxx client errors → validation
    if (code >= 100004000 && code < 100005000) return validationError(message);
    // 5xxx/6xxx/7xxx server errors → api_error
    if (code >= 100005000) return apiError(message);
  }

  // Fallback: keyword detection
  const lower = message.toLowerCase();
  if (lower.includes('api key') || lower.includes('auth') || lower.includes('login')) {
    return authError(message);
  }
  if (lower.includes('permission') || lower.includes('scope')) {
    return new CliError({ type: 'permission', message, hint: 'Run: anygen auth login' });
  }

  return apiError(message);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Print error JSON to stdout and exit.
 */
export function outputError(err: CliError): never {
  console.log(JSON.stringify(err.toJSON(), null, 2));
  process.exit(1);
}

/**
 * Convert an unknown error to CliError.
 */
export function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return internalError(message);
}
