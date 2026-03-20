/**
 * HTTP client for AnyGen OpenAPI
 *
 * Authentication via Authorization header for all methods.
 * No redirect following (allow_redirects=False).
 *
 * Supports both JSON and multipart/form-data (for file uploads).
 * When `files` is provided, automatically switches to multipart mode.
 */

import type { Method } from '../discovery/types.js';
import { validateResourceName } from '../security/validate.js';

export interface ApiRequestOptions {
  baseUrl: string;
  apiKey: string;
  method: Method;
  /** Path + query params */
  params?: Record<string, unknown>;
  /** Request body (POST JSON) */
  body?: Record<string, unknown>;
  /** File uploads — triggers multipart/form-data mode */
  files?: Record<string, { data: Buffer; filename: string }>;
}

export interface ApiResponse {
  success: boolean;
  data: unknown;
  raw: string;
  statusCode: number;
}

/**
 * Execute an API call based on Discovery Method definition.
 * Automatically handles JSON vs multipart based on presence of files.
 */
export async function callApi(opts: ApiRequestOptions): Promise<ApiResponse> {
  const { baseUrl, apiKey, method, params, body, files } = opts;

  // Build URL: substitute path params :param_name → actual value
  let url = `${baseUrl}${method.path}`;
  const queryParts: string[] = [];
  const bodyParams: Record<string, unknown> = {};

  if (method.parameters) {
    for (const [paramName, param] of Object.entries(method.parameters)) {
      const value = params?.[paramName];

      if (param.location === 'path' && value != null) {
        const pathValue = validateResourceName(String(value), paramName);
        url = url.replace(`:${paramName}`, encodeURIComponent(pathValue));
      } else if (param.location === 'query' && value != null) {
        queryParts.push(`${encodeURIComponent(paramName)}=${encodeURIComponent(String(value))}`);
      } else if (param.location === 'body' && value != null) {
        bodyParams[paramName] = value;
      }
    }
  }

  if (queryParts.length > 0) {
    url += `?${queryParts.join('&')}`;
  }

  const authToken = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': authToken,
  };

  const fetchOpts: RequestInit = {
    method: method.httpMethod,
    headers,
    redirect: 'manual',
  };

  // Build request body for non-GET methods
  if (method.httpMethod !== 'GET') {
    const hasFiles = files && Object.keys(files).length > 0;

    if (hasFiles) {
      // Multipart/form-data mode (file upload)
      const formData = new FormData();

      // Append file fields
      for (const [fieldName, file] of Object.entries(files)) {
        formData.append(fieldName, new Blob([new Uint8Array(file.data)]), file.filename);
      }

      // Append non-binary body params
      for (const [key, val] of Object.entries(bodyParams)) {
        formData.append(key, String(val));
      }

      // Append explicit body fields
      if (body) {
        for (const [key, val] of Object.entries(body)) {
          formData.append(key, typeof val === 'string' ? val : JSON.stringify(val));
        }
      }

      fetchOpts.body = formData;
      // Do NOT set Content-Type — fetch auto-sets it with multipart boundary
    } else {
      // JSON mode
      headers['Content-Type'] = 'application/json';
      const finalBody = { ...bodyParams, ...body };
      if (Object.keys(finalBody).length > 0) {
        fetchOpts.body = JSON.stringify(finalBody);
      }
    }
  }

  const resp = await fetch(url, fetchOpts);
  const raw = await resp.text();

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  return {
    success: resp.ok,
    data,
    raw,
    statusCode: resp.status,
  };
}
