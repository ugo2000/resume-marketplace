import { describe, expect, it } from 'vitest';
import { originAllowed } from '../../src/middleware/csrf';

describe('originAllowed', () => {
  it('accepts only the configured origin for unsafe methods', () => {
    expect(originAllowed('https://jobs.example.com', 'https://jobs.example.com')).toBe(true);
    expect(originAllowed('https://evil.example', 'https://jobs.example.com')).toBe(false);
  });
});
