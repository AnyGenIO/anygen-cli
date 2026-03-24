/**
 * Strip deprecated fields from API response data based on Discovery Document schema.
 *
 * When the server marks a response field as `deprecated: true` in the Discovery
 * Document schema, this function removes it from the response data before output.
 * This keeps the actual API response unchanged (for backward-compatible consumers)
 * while giving CLI/Agent users a clean view.
 */

import type { DiscoveryDocument, Method, Schema } from '../discovery/types.js';

/**
 * Remove deprecated fields from response data, mutating in place.
 * Returns the same `data` reference for convenience.
 */
export function stripDeprecatedFields(
  data: Record<string, unknown>,
  method: Method,
  doc: DiscoveryDocument,
): Record<string, unknown> {
  if (!method.response) return data;

  const schema = resolveRef(method.response, doc);
  if (!schema?.properties) return data;

  stripRecursive(data, schema, doc);
  return data;
}

function stripRecursive(
  obj: Record<string, unknown>,
  schema: Schema,
  doc: DiscoveryDocument,
): void {
  if (!schema.properties) return;

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const resolved = resolveRef(propSchema, doc);

    if (resolved.deprecated) {
      delete obj[key];
      continue;
    }

    // Recurse into nested objects
    if (obj[key] != null && typeof obj[key] === 'object' && !Array.isArray(obj[key]) && resolved.properties) {
      stripRecursive(obj[key] as Record<string, unknown>, resolved, doc);
    }

    // Recurse into arrays of objects
    if (Array.isArray(obj[key]) && resolved.items) {
      const itemSchema = resolveRef(resolved.items, doc);
      if (itemSchema.properties) {
        for (const item of obj[key] as unknown[]) {
          if (item != null && typeof item === 'object' && !Array.isArray(item)) {
            stripRecursive(item as Record<string, unknown>, itemSchema, doc);
          }
        }
      }
    }
  }
}

function resolveRef(schema: Schema, doc: DiscoveryDocument): Schema {
  if (schema.$ref && doc.schemas?.[schema.$ref]) {
    return doc.schemas[schema.$ref];
  }
  return schema;
}
