import type { CursorPaginatedResponse } from '@/types';

/** Largest `limit` any list route accepts (a larger value is a 422). */
export const MAX_PAGE_LIMIT = 100;

/** Keep a requested page size inside what the server accepts. Undefined keeps the server default. */
export function clampLimit(limit: number | undefined): number | undefined {
  return limit === undefined ? undefined : Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_LIMIT);
}

/** Hard stop so a server that keeps returning `has_more` cannot loop forever. */
const MAX_PAGES = 200;

/**
 * Read every row of a list route: follow `next_cursor` while `has_more` is true.
 * The cursor is opaque and bound to the filters of the first request, so the
 * same filters must go with every page.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<CursorPaginatedResponse<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPage(cursor);
    rows.push(...result.items);
    if (!result.has_more || !result.next_cursor || seen.has(result.next_cursor)) break;
    seen.add(result.next_cursor);
    cursor = result.next_cursor;
  }
  return rows;
}
