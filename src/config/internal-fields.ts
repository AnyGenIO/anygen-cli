/**
 * Internal fields configuration.
 *
 * These fields are managed by the CLI internally and should not be
 * exposed to users or agents in schema output, help text, or dry-run.
 *
 * - auth_token: handled via Authorization header
 * - extra: auto-injected CLI tracking metadata (create_from, version)
 */
export const INTERNAL_FIELDS = new Set(['auth_token', 'extra']);
