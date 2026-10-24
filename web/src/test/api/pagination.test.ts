import { describe, it, expect, vi } from 'vitest';
import { clampLimit, fetchAllPages, MAX_PAGE_LIMIT } from '@/api/pagination';
import type { CursorPaginatedResponse } from '@/types';

function page<T>(items: T[], next: string | null): CursorPaginatedResponse<T> {
  return { items, next_cursor: next, has_more: next !== null, limit: 2, total: null };
}

describe('fetchAllPages', () => {
  it('follows next_cursor while has_more is true and returns every row in order', async () => {
    const fetchPage = vi
      .fn<(cursor: string | null) => Promise<CursorPaginatedResponse<number>>>()
      .mockResolvedValueOnce(page([1, 2], 'c1'))
      .mockResolvedValueOnce(page([3, 4], 'c2'))
      .mockResolvedValueOnce(page([5], null));

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([null, 'c1', 'c2']);
  });

  it('stops after one page when has_more is false', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(['a'], null));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual(['a']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops when the server repeats a cursor, instead of looping forever', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1], 'same'));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe('clampLimit', () => {
  it('keeps a limit inside 1 to 100 and leaves an undefined limit to the server default', () => {
    expect(MAX_PAGE_LIMIT).toBe(100);
    expect(clampLimit(undefined)).toBeUndefined();
    expect(clampLimit(200)).toBe(100);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(24.9)).toBe(24);
  });
});
