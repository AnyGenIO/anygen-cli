import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callApi, type ApiRequestOptions } from '../api/client.js';
import type { Method } from '../discovery/types.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function makeMethod(overrides: Partial<Method> = {}): Method {
  return {
    id: 'task.create',
    description: 'Create a task',
    httpMethod: 'POST',
    path: '/v1/openapi/tasks',
    ...overrides,
  };
}

describe('callApi', () => {
  it('should construct correct URL for simple path', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"success":true}',
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod(),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/openapi/tasks',
      expect.any(Object),
    );
  });

  it('should replace path parameters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"status":"completed"}',
    });

    const method = makeMethod({
      httpMethod: 'GET',
      path: '/v1/openapi/tasks/:task_id',
      parameters: [
        {
          name: 'task_id',
          location: 'path',
          type: 'string',
          required: true,
          description: 'Task ID',
        },
      ],
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method,
      params: { task_id: 'task_abc123' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/openapi/tasks/task_abc123',
      expect.any(Object),
    );
  });

  it('should append query parameters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"messages":[]}',
    });

    const method = makeMethod({
      httpMethod: 'GET',
      path: '/v1/openapi/tasks/:task_id/messages',
      parameters: [
        {
          name: 'task_id',
          location: 'path',
          type: 'string',
          required: true,
          description: 'Task ID',
        },
        {
          name: 'limit',
          location: 'query',
          type: 'number',
          required: false,
          description: 'Limit',
        },
      ],
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method,
      params: { task_id: 'task_1', limit: '10' },
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://api.example.com/v1/openapi/tasks/task_1/messages?limit=10');
  });

  it('should set Authorization header for GET requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod({ httpMethod: 'GET', path: '/v1/test' }),
    });

    const fetchOpts = mockFetch.mock.calls[0][1];
    expect(fetchOpts.headers.Authorization).toBe('Bearer sk-test');
    expect(fetchOpts.body).toBeUndefined();
  });

  it('should inject auth_token in POST body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"success":true}',
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod(),
      body: { operation: 'slide', prompt: 'hello' },
    });

    const fetchOpts = mockFetch.mock.calls[0][1];
    const body = JSON.parse(fetchOpts.body);
    expect(body.auth_token).toBe('Bearer sk-test');
    expect(body.operation).toBe('slide');
    expect(body.prompt).toBe('hello');
  });

  it('should not override existing auth_token in body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"success":true}',
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod(),
      body: { auth_token: 'Bearer custom-token' },
    });

    const fetchOpts = mockFetch.mock.calls[0][1];
    const body = JSON.parse(fetchOpts.body);
    expect(body.auth_token).toBe('Bearer custom-token');
  });

  it('should handle Bearer prefix correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'Bearer sk-already-prefixed',
      method: makeMethod({ httpMethod: 'GET', path: '/test' }),
    });

    const fetchOpts = mockFetch.mock.calls[0][1];
    // Should not double-prefix
    expect(fetchOpts.headers.Authorization).toBe('Bearer sk-already-prefixed');
  });

  it('should use redirect: manual', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod({ httpMethod: 'GET', path: '/test' }),
    });

    const fetchOpts = mockFetch.mock.calls[0][1];
    expect(fetchOpts.redirect).toBe('manual');
  });

  it('should return parsed JSON data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"task_id":"task_123","success":true}',
    });

    const result = await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod(),
      body: { operation: 'slide' },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ task_id: 'task_123', success: true });
    expect(result.statusCode).toBeUndefined; // ok: true
  });

  it('should handle non-JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method: makeMethod({ httpMethod: 'GET', path: '/test' }),
    });

    expect(result.success).toBe(false);
    expect(result.data).toBe('Internal Server Error');
    expect(result.raw).toBe('Internal Server Error');
  });

  it('should encode path parameter values', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    const method = makeMethod({
      httpMethod: 'GET',
      path: '/v1/tasks/:task_id',
      parameters: [
        {
          name: 'task_id',
          location: 'path',
          type: 'string',
          required: true,
          description: '',
        },
      ],
    });

    // Valid task_id with special but allowed characters (underscores, hyphens)
    await callApi({
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      method,
      params: { task_id: 'task_abc-123' },
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://api.example.com/v1/tasks/task_abc-123');
  });

  it('should reject path parameters with traversal or URL-breaking characters', async () => {
    const method = makeMethod({
      httpMethod: 'GET',
      path: '/v1/tasks/:task_id',
      parameters: [
        {
          name: 'task_id',
          location: 'path',
          type: 'string',
          required: true,
          description: '',
        },
      ],
    });

    // Path traversal
    await expect(
      callApi({
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        method,
        params: { task_id: '../../etc/passwd' },
      }),
    ).rejects.toThrow('path traversal');

    // URL injection with ?
    await expect(
      callApi({
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        method,
        params: { task_id: 'id?admin=true' },
      }),
    ).rejects.toThrow('invalid characters');
  });
});
