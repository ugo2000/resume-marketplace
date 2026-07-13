import { describe, expect, it } from 'vitest';
import { parseJobSearch } from '../../src/services/job-service';

describe('parseJobSearch', () => {
  it('normalizes supported filters and clamps paging', () => {
    expect(parseJobSearch({ country: 'US', page: '0', q: ' nurse ' })).toEqual({
      country: 'US',
      q: 'nurse',
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects unsupported countries', () => {
    expect(() => parseJobSearch({ country: 'GB' })).toThrow();
  });
});
