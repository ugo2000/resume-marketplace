import { describe, expect, it } from 'vitest';
import { detectDocumentType } from '../../src/lib/file-validation';

describe('detectDocumentType', () => {
  it('detects PDF, PNG, and JPEG magic bytes', () => {
    expect(detectDocumentType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
    expect(detectDocumentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectDocumentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });
  it('rejects unknown signatures', () => {
    expect(() => detectDocumentType(new Uint8Array([1, 2, 3, 4]))).toThrow(
      'unsupported_file_signature',
    );
  });
});
