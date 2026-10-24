import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  accountKey,
  purgeAccountStorage,
  readAccountItem,
  removeAccountItem,
  writeAccountItem,
} from '@/lib/accountStorage';

describe('account storage', () => {
  beforeEach(() => sessionStorage.clear());

  it('keys carry the store name, the schema version and the account id', () => {
    expect(accountKey('aiPendingJob', 7)).toBe('360viewer:acct:aiPendingJob:v1:7');
    expect(accountKey('captureFrames', 7, 'sess-1')).toBe('360viewer:acct:captureFrames:v1:7:sess-1');
  });

  it('reads back what one account wrote and nothing for another account', () => {
    writeAccountItem('aiPendingJob', 7, 'job-1');

    expect(readAccountItem('aiPendingJob', 7)).toBe('job-1');
    expect(readAccountItem('aiPendingJob', 8)).toBeNull();
    expect(readAccountItem('aiPendingJob', null)).toBeNull();
  });

  it('does nothing without an account id', () => {
    writeAccountItem('aiPendingJob', undefined, 'job-1');
    expect(sessionStorage.length).toBe(0);
  });

  it('removes one item', () => {
    writeAccountItem('aiPendingJob', 7, 'job-1');
    removeAccountItem('aiPendingJob', 7);
    expect(readAccountItem('aiPendingJob', 7)).toBeNull();
  });

  it('a payload of an older schema version reads as a miss', () => {
    sessionStorage.setItem('360viewer:acct:aiPendingJob:v0:7', 'old');
    expect(readAccountItem('aiPendingJob', 7)).toBeNull();
  });

  it('purge removes every account key and the unscoped keys of earlier builds, and keeps the rest', () => {
    writeAccountItem('aiPendingJob', 7, 'job-1');
    writeAccountItem('captureFrames', 7, '[]', 'sess-1');
    sessionStorage.setItem('360viewer_ai_pending_job', 'legacy');
    sessionStorage.setItem('360viewer_capture_frames_sess-1', 'legacy');
    sessionStorage.setItem('other', 'keep');

    purgeAccountStorage();

    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('other')).toBe('keep');
  });

  it('survives a storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeAccountItem('aiPendingJob', 7, 'job-1')).not.toThrow();
    spy.mockRestore();
  });
});
