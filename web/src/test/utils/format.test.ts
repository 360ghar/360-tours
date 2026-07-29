import { describe, expect, it } from 'vitest';
import {
  formatDateOnlyForApi,
  getLocalDateKey,
  localInputToServerTimestamp,
  parseServerTimestamp,
  serverTimestampToLocalInput,
} from '@/utils/format';

describe('datetime helpers', () => {
  it('parses naive backend timestamps as UTC', () => {
    expect(parseServerTimestamp('2026-03-12T10:15:30').toISOString()).toBe(
      '2026-03-12T10:15:30.000Z'
    );
  });

  it('parses aware backend timestamps with offsets', () => {
    expect(parseServerTimestamp('2026-03-12T10:15:30+00:00').toISOString()).toBe(
      '2026-03-12T10:15:30.000Z'
    );
  });

  it('converts server timestamps to local datetime-local inputs', () => {
    const date = new Date('2026-03-12T10:15:30Z');
    const expected = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-') + `T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    expect(serverTimestampToLocalInput('2026-03-12T10:15:30+00:00')).toBe(expected);
  });

  it('converts local datetime-local values to UTC ISO strings', () => {
    expect(localInputToServerTimestamp('2026-03-12T15:45')).toBe(
      new Date('2026-03-12T15:45').toISOString()
    );
  });

  it('returns null for invalid local datetime-local values', () => {
    expect(localInputToServerTimestamp('not-a-date')).toBeNull();
  });

  it('formats date-only values without timezone shifting', () => {
    expect(formatDateOnlyForApi(new Date(2026, 2, 12, 23, 59))).toBe('2026-03-12');
  });

  it('builds stable local date keys for grouping', () => {
    expect(getLocalDateKey('2026-03-12T10:15:30Z')).toMatch(/2026-03-\d{2}/);
  });
});
