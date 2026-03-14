import { describe, it, expect } from 'vitest';
import { maskKey } from '../api/auth.js';

describe('maskKey', () => {
  it('should mask short keys completely', () => {
    expect(maskKey('abc')).toBe('****');
    expect(maskKey('12345678')).toBe('****');
  });

  it('should show first 6 and last 4 characters for long keys', () => {
    expect(maskKey('sk-test-key-value-123')).toBe('sk-tes****-123');
  });

  it('should handle exactly 9 character keys', () => {
    expect(maskKey('123456789')).toBe('123456****6789');
  });

  it('should handle typical API key format', () => {
    const key = 'sk-abc123def456ghi789';
    const masked = maskKey(key);
    expect(masked.startsWith('sk-abc')).toBe(true);
    expect(masked.endsWith('i789')).toBe(true);
    expect(masked).toContain('****');
    // Should not expose the full key
    expect(masked.length).toBeLessThan(key.length);
  });
});
