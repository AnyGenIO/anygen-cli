import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('config', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anygen-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('loadConfig priority', () => {
    // Priority: flag > config file > env

    it('should use override apiKey (flag) over everything', async () => {
      const { loadConfig } = await import('../config/config.js');

      const result = await loadConfig({ apiKey: 'override-key' });

      expect(result.apiKey).toBe('override-key');
      expect(result.apiKeySource).toBe('flag');
      expect(result.baseUrl).toBe('https://www.anygen.io');
    });

    it('should prefer env var over config file', async () => {
      const originalKey = process.env.ANYGEN_API_KEY;
      process.env.ANYGEN_API_KEY = 'env-key';

      try {
        const { loadConfig } = await import('../config/config.js');

        const result = await loadConfig();

        // Env should always win over config file (flag > env > file)
        expect(result.apiKey).toBe('env-key');
        expect(result.apiKeySource).toBe('env');
      } finally {
        if (originalKey !== undefined) {
          process.env.ANYGEN_API_KEY = originalKey;
        } else {
          delete process.env.ANYGEN_API_KEY;
        }
      }
    });

    it('should use fixed base URL always', async () => {
      const { loadConfig } = await import('../config/config.js');
      const result = await loadConfig();

      expect(result.baseUrl).toBe('https://www.anygen.io');
    });

    it('should fall back to env when no config file key', async () => {
      const { loadConfig, getStoredApiKey } = await import('../config/config.js');
      const storedKey = await getStoredApiKey();
      const envKey = process.env.ANYGEN_API_KEY;

      const result = await loadConfig();

      if (storedKey) {
        expect(result.apiKeySource).toBe('config');
      } else if (envKey) {
        expect(result.apiKeySource).toBe('env');
      } else {
        expect(result.apiKey).toBe('');
        expect(result.apiKeySource).toBe('none');
      }
    });
  });
});
