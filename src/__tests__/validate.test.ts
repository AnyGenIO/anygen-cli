import { describe, it, expect } from 'vitest';
import {
  validateSafeOutputDir,
  validateResourceName,
  sanitizeFileName,
  validateDownloadUrl,
  validateJsonParams,
  ValidationError,
} from '../security/validate.js';

describe('validateSafeOutputDir', () => {
  it('should accept a valid relative directory', () => {
    const result = validateSafeOutputDir('./output');
    expect(result).toContain('output');
  });

  it('should accept an absolute directory', () => {
    const result = validateSafeOutputDir('/tmp/download');
    expect(result).toBe('/tmp/download');
  });

  it('should reject empty string', () => {
    expect(() => validateSafeOutputDir('')).toThrow(ValidationError);
    expect(() => validateSafeOutputDir('')).toThrow('must not be empty');
  });

  it('should reject whitespace-only string', () => {
    expect(() => validateSafeOutputDir('   ')).toThrow(ValidationError);
  });

  it('should reject control characters', () => {
    expect(() => validateSafeOutputDir('dir\x00name')).toThrow('control characters');
    expect(() => validateSafeOutputDir('dir\x1fname')).toThrow('control characters');
  });
});

describe('validateResourceName', () => {
  it('should accept valid resource names', () => {
    expect(validateResourceName('task_abc123')).toBe('task_abc123');
    expect(validateResourceName('file-token-xyz')).toBe('file-token-xyz');
  });

  it('should reject empty name', () => {
    expect(() => validateResourceName('')).toThrow('must not be empty');
  });

  it('should reject path traversal', () => {
    expect(() => validateResourceName('../../etc/passwd')).toThrow('path traversal');
    expect(() => validateResourceName('task..id')).toThrow('path traversal');
  });

  it('should reject URL-breaking characters', () => {
    expect(() => validateResourceName('id?admin=true')).toThrow('invalid characters');
    expect(() => validateResourceName('id#fragment')).toThrow('invalid characters');
    expect(() => validateResourceName('id&extra=1')).toThrow('invalid characters');
    expect(() => validateResourceName('path/inject')).toThrow('invalid characters');
    expect(() => validateResourceName('path\\inject')).toThrow('invalid characters');
  });

  it('should reject control characters', () => {
    expect(() => validateResourceName('id\x00null')).toThrow('control characters');
  });

  it('should reject names exceeding max length', () => {
    const longName = 'a'.repeat(257);
    expect(() => validateResourceName(longName)).toThrow('exceeds maximum length');
  });

  it('should use custom label in error message', () => {
    expect(() => validateResourceName('', 'Task ID')).toThrow('Task ID must not be empty');
  });
});

describe('sanitizeFileName', () => {
  it('should return the name unchanged for safe names', () => {
    expect(sanitizeFileName('report.pdf')).toBe('report.pdf');
    expect(sanitizeFileName('my-doc_v2.pptx')).toBe('my-doc_v2.pptx');
  });

  it('should return fallback for empty/null/undefined', () => {
    expect(sanitizeFileName(undefined)).toBe('output');
    expect(sanitizeFileName(null)).toBe('output');
    expect(sanitizeFileName('')).toBe('output');
    expect(sanitizeFileName('   ')).toBe('output');
  });

  it('should use custom fallback', () => {
    expect(sanitizeFileName(undefined, 'download')).toBe('download');
  });

  it('should strip directory components (path traversal prevention)', () => {
    expect(sanitizeFileName('../../.bashrc')).toBe('bashrc');
    expect(sanitizeFileName('/etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('../../../etc/shadow')).toBe('shadow');
  });

  it('should strip leading dots (hidden files)', () => {
    expect(sanitizeFileName('.bashrc')).toBe('bashrc');
    expect(sanitizeFileName('...hidden')).toBe('hidden');
  });

  it('should replace dangerous characters with underscore', () => {
    expect(sanitizeFileName('file<name>.txt')).toBe('file_name_.txt');
    expect(sanitizeFileName('file:name.txt')).toBe('file_name.txt');
  });

  it('should remove control characters', () => {
    expect(sanitizeFileName('file\x00name.txt')).toBe('filename.txt');
  });

  it('should collapse multiple underscores/spaces', () => {
    expect(sanitizeFileName('file___name.txt')).toBe('file_name.txt');
    expect(sanitizeFileName('file   name.txt')).toBe('file_name.txt');
  });

  it('should enforce length limit', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

describe('validateDownloadUrl', () => {
  it('should accept valid HTTPS URLs', () => {
    expect(validateDownloadUrl('https://cdn.example.com/file.pdf')).toBe('https://cdn.example.com/file.pdf');
    expect(validateDownloadUrl('https://files.anygen.io/download/abc')).toBe('https://files.anygen.io/download/abc');
  });

  it('should reject empty URL', () => {
    expect(() => validateDownloadUrl('')).toThrow('must not be empty');
  });

  it('should reject invalid URLs', () => {
    expect(() => validateDownloadUrl('not-a-url')).toThrow('Invalid download URL');
  });

  it('should reject non-HTTPS protocols', () => {
    expect(() => validateDownloadUrl('http://example.com/file')).toThrow('must use HTTPS');
    expect(() => validateDownloadUrl('ftp://example.com/file')).toThrow('must use HTTPS');
    expect(() => validateDownloadUrl('file:///etc/passwd')).toThrow('must use HTTPS');
  });

  // SSRF prevention: private/local addresses
  it('should reject localhost', () => {
    expect(() => validateDownloadUrl('https://localhost/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://127.0.0.1/file')).toThrow('private/local');
  });

  it('should reject IPv4 private ranges', () => {
    expect(() => validateDownloadUrl('https://10.0.0.1/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://192.168.1.1/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://172.16.0.1/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://172.31.255.255/file')).toThrow('private/local');
  });

  it('should reject link-local IPv4 (169.254.x.x)', () => {
    expect(() => validateDownloadUrl('https://169.254.1.1/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://169.254.169.254/latest/meta-data')).toThrow('private/local');
  });

  it('should reject IPv6 loopback and private addresses', () => {
    expect(() => validateDownloadUrl('https://[::1]/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://[fe80::1]/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://[fc00::1]/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://[fd00::1]/file')).toThrow('private/local');
  });

  it('should reject .local and .internal domains', () => {
    expect(() => validateDownloadUrl('https://myserver.local/file')).toThrow('private/local');
    expect(() => validateDownloadUrl('https://myserver.internal/file')).toThrow('private/local');
  });

  it('should reject 0.0.0.0', () => {
    expect(() => validateDownloadUrl('https://0.0.0.0/file')).toThrow('private/local');
  });

  it('should allow valid public IPs that are NOT in private ranges', () => {
    // 172.15.x.x is NOT in the 172.16-31 private range
    expect(validateDownloadUrl('https://172.15.0.1/file')).toBe('https://172.15.0.1/file');
    // 172.32.x.x is NOT in the 172.16-31 private range
    expect(validateDownloadUrl('https://172.32.0.1/file')).toBe('https://172.32.0.1/file');
  });
});

describe('validateJsonParams', () => {
  it('should parse valid JSON objects', () => {
    expect(validateJsonParams('{"key":"value"}')).toEqual({ key: 'value' });
    expect(validateJsonParams('{"a":1,"b":true}')).toEqual({ a: 1, b: true });
  });

  it('should reject invalid JSON', () => {
    expect(() => validateJsonParams('not json')).toThrow('not valid JSON');
    expect(() => validateJsonParams('{broken')).toThrow('not valid JSON');
  });

  it('should reject JSON arrays', () => {
    expect(() => validateJsonParams('[1,2,3]')).toThrow('must be a JSON object');
  });

  it('should reject JSON primitives', () => {
    expect(() => validateJsonParams('"string"')).toThrow('must be a JSON object');
    expect(() => validateJsonParams('42')).toThrow('must be a JSON object');
    expect(() => validateJsonParams('true')).toThrow('must be a JSON object');
    expect(() => validateJsonParams('null')).toThrow('must be a JSON object');
  });
});
