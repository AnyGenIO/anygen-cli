/**
 * Schema introspection command
 *
 * `anygen schema <resource.method>` — displays method parameters, request/response schemas.
 * Supports --pretty for human-readable colored output.
 */

import { Command } from 'commander';
import type { DiscoveryDocument, Method, Schema } from '../discovery/types.js';
import { validationError, outputError } from '../errors.js';
import { INTERNAL_FIELDS } from '../config/internal-fields.js';

export function buildSchemaCommand(program: Command, doc: DiscoveryDocument): void {
  const availableMethods = listAvailableMethods(doc);
  const knownResources = Object.keys(doc.resources);

  program
    .command('schema [path]')
    .description('Inspect API schema (e.g. anygen schema task.create)')
    .option('--pretty', 'Human-readable formatted output')
    .action((_path: string | undefined, opts: { pretty?: boolean }) => {
      if (!_path) {
        schemaError(
          "Usage: anygen schema <resource.method> (e.g., anygen schema task.create)",
          availableMethods,
        );
      }

      const parts = _path.split('.');

      if (parts.length < 2) {
        schemaError(
          `Schema path must be 'resource.method', got '${_path}'`,
          availableMethods,
        );
      }

      if (!doc.resources[parts[0]]) {
        schemaError(
          `Unknown resource '${parts[0]}'. Known resources: ${knownResources.join(', ')}`,
          availableMethods,
        );
      }

      const method = resolveMethod(doc, parts);
      if (!method) {
        schemaError(
          `Method '${_path}' not found`,
          availableMethods,
        );
      }

      if (opts.pretty) {
        printMethodSchemaPretty(method, doc);
      } else {
        printMethodSchema(method, doc);
      }
    });
}

function listAvailableMethods(doc: DiscoveryDocument): string[] {
  const methods: string[] = [];
  for (const [rName, resource] of Object.entries(doc.resources)) {
    if (resource.methods) {
      for (const mName of Object.keys(resource.methods)) {
        methods.push(`${rName}.${mName}`);
      }
    }
    if (resource.resources) {
      for (const [sName, sub] of Object.entries(resource.resources)) {
        if (sub.methods) {
          for (const mName of Object.keys(sub.methods)) {
            methods.push(`${rName}.${sName}.${mName}`);
          }
        }
      }
    }
  }
  return methods;
}

function schemaError(message: string, available: string[]): never {
  outputError(validationError(message, `Available methods: ${available.join(', ')}`));
}

function resolveMethod(doc: DiscoveryDocument, parts: string[]): Method | null {
  if (parts.length < 2) return null;

  const resource = doc.resources[parts[0]];
  if (!resource) return null;

  // resource.method
  if (parts.length === 2) {
    return resource.methods?.[parts[1]] ?? null;
  }

  // resource.subresource.method
  if (parts.length === 3) {
    return resource.resources?.[parts[1]]?.methods?.[parts[2]] ?? null;
  }

  return null;
}

function printMethodSchema(method: Method, doc: DiscoveryDocument): void {
  const output: Record<string, unknown> = {
    id: method.id,
    description: method.description,
    httpMethod: method.httpMethod,
    path: method.path,
  };

  if (method.parameters && Object.keys(method.parameters).length > 0) {
    output.parameters = method.parameters;
  }

  if (method.request) {
    output.request = stripInternalProps(resolveRef(method.request, doc));
  }

  if (method.response) {
    output.response = resolveRef(method.response, doc);
  }

  console.log(JSON.stringify(output, null, 2));
}

/** Resolve a $ref schema to its full definition from doc.schemas. */
function resolveRef(schema: Schema, doc: DiscoveryDocument): Schema {
  if (schema.$ref && doc.schemas?.[schema.$ref]) {
    return doc.schemas[schema.$ref];
  }
  return schema;
}

/** Strip internal properties from a schema for display */
function stripInternalProps(schema: Schema): Schema {
  if (!schema.properties) return schema;
  const cleaned = { ...schema };
  const filteredProps: Record<string, Schema> = {};
  for (const [key, val] of Object.entries(schema.properties)) {
    if (!INTERNAL_FIELDS.has(key)) {
      filteredProps[key] = val;
    }
  }
  cleaned.properties = filteredProps;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Pretty schema output (human-readable, like larksuite-cli schema --pretty)
// ---------------------------------------------------------------------------

function printMethodSchemaPretty(method: Method, doc: DiscoveryDocument): void {
  const httpColor = method.httpMethod === 'GET' ? '\x1b[32m' : '\x1b[33m'; // green or yellow
  const bold = '\x1b[1m';
  const dim = '\x1b[2m';
  const cyan = '\x1b[36m';
  const red = '\x1b[31m';
  const reset = '\x1b[0m';

  // Header
  console.log(`${bold}${method.id}${reset}`);
  console.log();
  console.log(`  ${httpColor}${method.httpMethod}${reset} ${method.path}`);
  if (method.description) {
    console.log(`  ${method.description}`);
  }
  console.log();

  // Parameters (--params)
  const params = method.parameters ? Object.entries(method.parameters) : [];
  if (params.length > 0) {
    console.log(`${bold}Parameters:${reset}`);
    console.log();
    console.log(`  ${cyan}--params${reset}  <json>  ${dim}optional${reset}`);
    // Sort: required first
    const sorted = [...params].sort(([, a], [, b]) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return 0;
    });
    for (const [name, param] of sorted) {
      const reqStr = param.required
        ? `${red}required${reset}`
        : `${dim}optional${reset}`;
      const locColor = param.location === 'path' ? '\x1b[33m' : dim;
      console.log(`      - ${cyan}${name}${reset} (${param.type || 'string'}, ${locColor}${param.location}${reset}, ${reqStr})`);
      if (param.description) {
        console.log(`        ${dim}${param.description}${reset}`);
      }
    }
    console.log();
  }

  // Request body (--data)
  if (method.request) {
    const schema = stripInternalProps(resolveRef(method.request, doc));
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      if (params.length === 0) {
        console.log(`${bold}Parameters:${reset}`);
        console.log();
      }
      console.log(`  ${cyan}--data${reset}  <json>  ${dim}optional${reset}`);
      printPrettyFields(schema.properties, '      ', bold, dim, cyan, red, reset);
      console.log();
    }
  }

  // Response
  if (method.response) {
    const schema = resolveRef(method.response, doc);
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      console.log(`${bold}Response:${reset}`);
      console.log();
      printPrettyFields(schema.properties, '  ', bold, dim, cyan, red, reset);
      console.log();
    }
  }

  // CLI example
  console.log(`${bold}CLI:${reset}      anygen ${method.id.replace(/\./g, ' ')}`);
}

function printPrettyFields(
  properties: Record<string, Schema>,
  indent: string,
  _bold: string, dim: string, cyan: string, red: string, reset: string,
): void {
  // Sort: required first, then alphabetical
  const sorted = Object.entries(properties)
    .filter(([key]) => !INTERNAL_FIELDS.has(key))
    .sort(([ka, a], [kb, b]) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return ka.localeCompare(kb);
    });

  for (const [name, field] of sorted) {
    const reqStr = field.required
      ? `${red}required${reset}`
      : `${dim}optional${reset}`;
    const typeStr = field.type || 'object';
    const enumStr = field.enum && field.enum.length > 0
      ? ` ${dim}— ${field.enum.join(' | ')}${reset}`
      : '';
    console.log(`${indent}- ${cyan}${name}${reset} (${typeStr}, ${reqStr})${enumStr}`);
    if (field.description) {
      console.log(`${indent}  ${dim}${field.description}${reset}`);
    }
    // Recurse into nested properties
    if (field.properties) {
      printPrettyFields(field.properties, indent + '  ', _bold, dim, cyan, red, reset);
    }
  }
}
