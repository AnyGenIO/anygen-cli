/**
 * Command execution engine
 *
 * Handles the full lifecycle of executing a dynamic API command:
 * auth → parse params → validate → dry-run → callApi → poll → output
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import type { DiscoveryDocument, Method } from '../discovery/types.js';
import { callApi } from '../api/client.js';
import type { AnygenConfig } from '../config/config.js';
import { pollTask, pollMessages, methodSupportsPolling } from './poll.js';
import { validateJsonParams } from '../security/validate.js';
import { CLI_VERSION } from '../version.js';
import { ensureAuth } from '../api/auth.js';
import { CliError, validationError, outputError, toCliError, classifyServerError } from '../errors.js';
import { INTERNAL_FIELDS } from '../config/internal-fields.js';
import { stripDeprecatedFields } from '../utils/strip-deprecated.js';
import { getDebugHeaders } from '../config/config.js';

interface MethodOpts {
  params?: string;
  data?: string;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: string;
}

export async function executeMethod(
  method: Method,
  opts: MethodOpts,
  config: AnygenConfig,
  doc: DiscoveryDocument,
  cmd: Command,
): Promise<void> {
  // Verify API key before any API call (no interactive login — just error)
  let verifiedKey: string;
  try {
    const auth = await ensureAuth(config);
    verifiedKey = auth.apiKey;
  } catch (err) {
    const cliErr = toCliError(err);
    errorWithHelp(cmd, cliErr);
  }

  // Parse --params (URL/path parameters)
  const params: Record<string, unknown> = {};
  if (opts.params) {
    try {
      Object.assign(params, validateJsonParams(opts.params));
    } catch (err) {
      outputError(validationError(`Invalid --params JSON: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  // Parse --data (request body)
  let body: Record<string, unknown> | undefined;
  let files: Record<string, { data: Buffer; filename: string }> | undefined;
  if (opts.data) {
    try {
      body = validateJsonParams(opts.data);
    } catch (err) {
      outputError(validationError(`Invalid --data JSON: ${err instanceof Error ? err.message : String(err)}`));
    }

    // Handle binary body params: read files from paths
    const methodParams = method.parameters ?? {};
    for (const [key, paramDef] of Object.entries(methodParams)) {
      if (paramDef.location === 'body' && paramDef.type === 'binary' && body[key]) {
        const filePath = String(body[key]);
        try {
          const absolutePath = path.resolve(filePath);
          const data = await fs.readFile(absolutePath);
          if (!files) files = {};
          files[key] = { data: Buffer.from(data), filename: path.basename(absolutePath) };
          if (methodParams['filename'] && !body['filename']) {
            params['filename'] = files[key].filename;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          outputError(validationError(`Cannot read file "${filePath}": ${msg}`));
        }
        delete body[key];
      }
    }
  }

  // Validate required URL parameters
  if (method.parameters) {
    for (const [paramName, param] of Object.entries(method.parameters)) {
      if (param.required && params[paramName] == null) {
        errorWithHelp(cmd, validationError(
          `Missing required parameter "${paramName}" in --params`,
          `Run: anygen schema ${method.id}`,
        ));
      }
    }
  }

  // Validate request body — intercept missing/incomplete data before hitting server
  if (method.httpMethod !== 'GET' && method.request) {
    const requestSchema = method.request.$ref && doc.schemas?.[method.request.$ref]
      ? doc.schemas[method.request.$ref]
      : method.request;

    if (requestSchema.properties) {
      const requiredFields = Object.entries(requestSchema.properties)
        .filter(([key, prop]) => prop.required && !INTERNAL_FIELDS.has(key))
        .map(([key]) => key);

      if (requiredFields.length > 0 && !body) {
        errorWithHelp(cmd, validationError(
          `Missing --data (required fields: ${requiredFields.join(', ')})`,
          `Run: anygen schema ${method.id}`,
        ));
      }

      if (body) {
        for (const field of requiredFields) {
          if (body[field] == null || body[field] === '') {
            errorWithHelp(cmd, validationError(
              `Missing required field "${field}" in --data`,
              `Run: anygen schema ${method.id}`,
            ));
          }
        }
      }
    }
  }

  // Inject CLI tracking metadata
  if (body && method.httpMethod !== 'GET') {
    if (!body.extra) body.extra = {};
    const extra = body.extra as Record<string, unknown>;
    extra.create_from ??= 'anygen-cli';
    extra.version ??= CLI_VERSION;
  }

  // --dry-run: show the request that would be sent
  if (opts.dryRun) {
    let url = `${config.baseUrl}${method.path}`;
    const queryParams: Record<string, string> = {};
    if (method.parameters) {
      for (const [paramName, param] of Object.entries(method.parameters)) {
        const value = params[paramName];
        if (param.location === 'path' && value != null) {
          url = url.replace(`:${paramName}`, encodeURIComponent(String(value)));
        } else if (param.location === 'query' && value != null) {
          queryParams[paramName] = String(value);
        }
      }
    }
    if (Object.keys(queryParams).length > 0) {
      url += '?' + Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
    // Strip internal fields from dry-run output
    let dryBody = body;
    if (dryBody) {
      dryBody = Object.fromEntries(
        Object.entries(dryBody).filter(([k]) => !INTERNAL_FIELDS.has(k)),
      );
      if (Object.keys(dryBody).length === 0) dryBody = undefined;
    }
    const debugHeaders = getDebugHeaders();
    console.log(JSON.stringify({
      dry_run: true,
      method: method.httpMethod,
      url,
      params: Object.keys(params).length > 0 ? params : undefined,
      body: dryBody,
      ...(Object.keys(debugHeaders).length > 0 ? { debug_headers: debugHeaders } : {}),
    }, null, 2));
    return;
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

    // Unified error check: HTTP-level (!result.success) or application-level (success=false in body)
    const data = result.data as Record<string, unknown> | undefined;
    if (!result.success || (data && data.success === false)) {
      const errMsg = (data?.error as string) ?? (result.success ? 'Unknown error' : `HTTP ${result.statusCode}`);
      const errCode = (data?.code as number) ?? undefined;
      errorWithHelp(cmd, classifyServerError(errCode, errMsg));
    }

    // --wait: re-poll the SAME endpoint until terminal state
    if (opts.wait && methodSupportsPolling(method)) {
      const timeout = Number(opts.timeout) || undefined;
      const authConfig = { ...config, apiKey: verifiedKey };

      // Task-level polling: track by task_id with progress reporting
      const taskId = params.task_id as string | undefined;
      if (taskId && method.httpMethod === 'GET' && method.path.endsWith('/tasks/:task_id')) {
        await pollTask(authConfig, method, taskId, timeout, doc);
      } else {
        // Generic message/list polling: re-poll until no running items
        const msgResult = await pollMessages(authConfig, method, params, timeout);
        stripDeprecatedFields(msgResult.data, method, doc);
        console.log(JSON.stringify(msgResult.data, null, 2));
      }
      return;
    }

    // Normal output — strip deprecated fields before display
    if (data) stripDeprecatedFields(data, method, doc);
    console.log(JSON.stringify(data, null, 2));

  } catch (err: unknown) {
    outputError(toCliError(err));
  }
}

/** Print "Error: <message>" + usage to stderr, then output JSON error to stdout and exit. */
export function errorWithHelp(cmd: Command, err: CliError): never {
  process.stderr.write(`Error: ${err.message}\n`);
  const helpText = cmd.helpInformation();
  const usageIdx = helpText.indexOf('Usage:');
  if (usageIdx >= 0) {
    process.stderr.write(helpText.slice(usageIdx));
  }
  process.stderr.write('\n');
  outputError(err);
}
