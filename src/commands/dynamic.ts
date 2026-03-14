/**
 * Dynamic command generation from Discovery Document
 *
 * resources → commander subcommands
 * methods   → subcommands under each resource
 *
 * Example:
 *   anygen task create --params '{"operation":"slide",...}'
 *   anygen task get --task-id xxx
 *   anygen message send --task-id xxx --params '{"content":"hello"}'
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import type { DiscoveryDocument, Resource, Method, Schema } from '../discovery/types.js';
import { callApi } from '../api/client.js';
import type { AnygenConfig } from '../config/config.js';
import { pollTask, pollMessages, downloadToLocal } from './poll.js';
import { registerTaskHelpers } from './task-run.js';
import { registerMessageHelpers } from './message-modify.js';
import { validateSafeOutputDir, validateJsonParams, ValidationError } from '../security/validate.js';
import { sanitizeResponse, getSanitizeMode } from '../security/sanitize.js';
import { CLI_VERSION } from '../version.js';
import { ensureAuth } from '../api/auth.js';

export function buildDynamicCommands(
  program: Command,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  for (const [resourceName, resource] of Object.entries(doc.resources)) {
    const desc = resource.description || `${resourceName} operations`;
    const resourceCmd = program
      .command(resourceName)
      .description(desc);

    // Register + helper commands first so they appear at the top of --help
    if (resourceName === 'task') {
      registerTaskHelpers(resourceCmd, doc, config);
    }
    if (resourceName === 'message') {
      registerMessageHelpers(resourceCmd, doc, config);
    }

    buildResourceMethods(resourceCmd, resource, doc, config);
  }
}

function buildResourceMethods(
  resourceCmd: Command,
  resource: Resource,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  for (const [methodName, method] of Object.entries(resource.methods)) {
    const methodCmd = resourceCmd
      .command(methodName)
      .description(method.description);

    if (method.parameters) {
      for (const param of method.parameters) {
        if (param.name === 'Authorization') continue;

        const flagName = param.name.replace(/_/g, '-');
        // Binary params accept a file path, not raw binary
        const typeLabel = param.type === 'binary' ? 'path' : param.type;
        const flag = param.required
          ? `--${flagName} <${typeLabel}>`
          : `--${flagName} [${typeLabel}]`;
        methodCmd.option(flag, param.description);
      }
    }

    if (method.request) {
      methodCmd.option('--params <json>', 'Request body (JSON string)');
    }

    methodCmd.option('--raw', 'Output raw JSON (unformatted)');

    if (method.id === 'task.get' || method.id === 'message.list') {
      methodCmd.option('--wait', 'Re-poll until terminal state (completed/failed)');
      methodCmd.option('--timeout <ms>', 'Polling timeout in milliseconds');
    }
    if (method.id === 'task.get') {
      methodCmd.option('--output-dir <dir>', 'Download output file to local directory');
    }

    methodCmd.action(async (opts: Record<string, string>) => {
      await executeMethod(method, opts, config, doc);
    });
  }
}

async function executeMethod(
  method: Method,
  opts: Record<string, string>,
  config: AnygenConfig,
  doc: DiscoveryDocument,
): Promise<void> {
  // Verify API key before any API call
  const auth = await ensureAuth(config.apiKey || undefined);
  if (!auth) {
    process.exit(1);
  }
  const verifiedKey = auth.apiKey;

  const params: Record<string, unknown> = {};
  const binaryParams = method.parameters?.filter(
    (p) => p.location === 'body' && p.type === 'binary',
  ) ?? [];

  const hasBinaryParams = binaryParams.length > 0;

  if (method.parameters) {
    for (const param of method.parameters) {
      if (param.name === 'Authorization') continue;
      const flagName = param.name.replace(/_/g, '-');
      const value = opts[toCamelCase(flagName)];
      if (value != null) {
        params[param.name] = value;
      } else if (param.required && param.type !== 'binary') {
        // Skip required check for body params that can be auto-filled from binary params
        if (hasBinaryParams && param.location === 'body') continue;
        console.error(`Error: Missing required parameter --${flagName}`);
        process.exit(1);
      }
    }
  }

  // Handle binary body params: read files from paths
  let files: Record<string, { data: Buffer; filename: string }> | undefined;
  if (binaryParams.length > 0) {
    files = {};
    for (const bp of binaryParams) {
      const flagName = bp.name.replace(/_/g, '-');
      const filePath = params[bp.name] as string | undefined;
      if (!filePath) {
        if (bp.required) {
          console.error(`Error: Missing required file --${flagName} <path>`);
          process.exit(1);
        }
        continue;
      }
      try {
        const absolutePath = path.resolve(filePath);
        const data = await fs.readFile(absolutePath);
        files[bp.name] = { data: Buffer.from(data), filename: path.basename(absolutePath) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: Cannot read file "${filePath}": ${msg}`);
        process.exit(1);
      }
      delete params[bp.name];

      // Auto-fill filename param from file path if not explicitly provided
      const filenameParam = method.parameters?.find(
        (p) => p.name === 'filename' && p.location === 'body' && p.type !== 'binary',
      );
      if (filenameParam && !params[filenameParam.name]) {
        params[filenameParam.name] = files[bp.name].filename;
      }
    }
  }

  // Validate --output-dir before making any API calls
  if (opts.outputDir) {
    try {
      validateSafeOutputDir(opts.outputDir);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  let body: Record<string, unknown> | undefined;
  if (opts.params) {
    try {
      body = validateJsonParams(opts.params);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  if (body && method.httpMethod !== 'GET') {
    if (!body.extra) body.extra = {};
    const extra = body.extra as Record<string, unknown>;
    extra.create_from ??= 'anygen-cli';
    extra.version ??= CLI_VERSION;
  }

  try {
    const result = await callApi({
      baseUrl: config.baseUrl,
      apiKey: verifiedKey,
      method,
      params,
      body,
      files,
    });

    if (!result.success) {
      if (opts.raw) {
        console.log(result.raw);
      } else {
        console.log(JSON.stringify(result.data, null, 2));
      }
      process.exit(1);
    }

    // Sanitize API response (Model Armor) — scan for prompt injection
    const sanitizedData = opts.raw ? result.data : sanitizeResponse(result.data, getSanitizeMode());
    const data = sanitizedData as Record<string, unknown>;

    // --wait: re-poll the SAME endpoint until terminal state
    if (opts.wait) {
      const timeout = Number(opts.timeout) || undefined;
      const authConfig = { ...config, apiKey: verifiedKey };

      if (method.id === 'task.get') {
        const taskId = params.task_id as string;
        if (taskId) {
          await pollTask(authConfig, method, taskId, opts.outputDir, timeout);
        }
      } else if (method.id === 'message.list') {
        await pollMessages(authConfig, method, params, timeout);
      }
      return;
    }

    // Normal output
    if (opts.raw) {
      console.log(result.raw);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }

    // --output-dir: download from completed task response
    if (opts.outputDir) {
      const output = (data?.output ?? data) as Record<string, unknown>;
      if (output?.file_url) {
        await downloadToLocal(output.file_url as string, output.file_name as string, opts.outputDir);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

export function toCamelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function buildSchemaCommand(program: Command, doc: DiscoveryDocument): void {
  program
    .command('schema [path]')
    .description('Inspect API schema (e.g. anygen schema task.create)')
    .action((_path?: string) => {
      if (!_path) {
        console.log('Available resources:');
        for (const [name, resource] of Object.entries(doc.resources)) {
          const methods = Object.keys(resource.methods).join(', ');
          console.log(`  ${name}: ${methods}`);
        }
        return;
      }

      const parts = _path.split('.');
      if (parts.length === 1) {
        const resource = doc.resources[parts[0]];
        if (!resource) {
          console.error(`Error: Unknown resource "${parts[0]}"`);
          process.exit(1);
        }
        for (const [name, method] of Object.entries(resource.methods)) {
          console.log(`\n${parts[0]}.${name}:`);
          printMethodSchema(method);
        }
      } else {
        const resource = doc.resources[parts[0]];
        const method = resource?.methods[parts[1]];
        if (!method) {
          console.error(`Error: Unknown method "${_path}"`);
          process.exit(1);
        }
        printMethodSchema(method);
      }
    });
}

function printMethodSchema(method: Method): void {
  console.log(`  ${method.httpMethod} ${method.path}`);
  console.log(`  ${method.description}`);

  if (method.parameters?.length) {
    console.log('\n  Parameters:');
    for (const p of method.parameters) {
      const req = p.required ? '(required)' : '(optional)';
      console.log(`    ${p.name} [${p.location}] ${p.type} ${req} - ${p.description}`);
    }
  }

  if (method.request) {
    console.log('\n  Request schema:');
    printSchema(method.request, '    ');
  }

  if (method.response) {
    console.log('\n  Response schema:');
    printSchema(method.response, '    ');
  }
}

function printSchema(schema: Schema, indent: string): void {
  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const [name, prop] of Object.entries(schema.properties)) {
      const req = required.has(name) ? '*' : ' ';
      const typeStr = prop.format ? `${prop.type}(${prop.format})` : prop.type;
      const desc = prop.description ? ` - ${prop.description}` : '';
      const enumStr = prop.enum?.length ? ` [${prop.enum.join('|')}]` : '';
      console.log(`${indent}${req} ${name}: ${typeStr}${enumStr}${desc}`);

      if (prop.properties) {
        printSchema(prop, indent + '  ');
      }
      if (prop.items?.properties) {
        console.log(`${indent}  [item]:`);
        printSchema(prop.items, indent + '    ');
      }
    }
  }
}
