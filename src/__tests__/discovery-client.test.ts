import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock fs to avoid real file system operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe('getDiscoveryDocument', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch from correct URL', async () => {
    const mockDoc = {
      name: 'anygen',
      version: 'v1',
      title: 'AnyGen',
      description: 'Test',
      baseUrl: 'https://test.example.com',
      resources: {},
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDoc,
    });

    const { getDiscoveryDocument } = await import('../discovery/client.js');
    const doc = await getDiscoveryDocument('https://www.anygen.io');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.anygen.io/v1/openapi/document',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const { getDiscoveryDocument } = await import('../discovery/client.js');
    await expect(getDiscoveryDocument('https://bad.example.com')).rejects.toThrow(
      'Failed to fetch Discovery Document',
    );
  });
});

describe('clearCache', () => {
  it('should not throw when cache file does not exist', async () => {
    const { clearCache } = await import('../discovery/client.js');
    await expect(clearCache()).resolves.not.toThrow();
  });
});
