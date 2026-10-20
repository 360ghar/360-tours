import { describe, it, expect } from 'vitest';
import { parseServerFrame, toJobStatus } from '@/utils/realtimeFrames';
import { WS_CLOSE_NOT_FOUND, WS_CLOSE_UNAUTHORIZED } from '@/types/realtime';

describe('parseServerFrame', () => {
  it('parses a job_update frame with the five AI job statuses', () => {
    const frame = parseServerFrame(
      JSON.stringify({
        type: 'job_update',
        job_id: 'job-1',
        data: { status: 'cancelled', progress: 40, error_message: null, result: null },
      })
    );

    expect(frame).toEqual({
      type: 'job_update',
      job_id: 'job-1',
      data: { status: 'cancelled', progress: 40, error_message: null, result: null },
    });
  });

  it('maps a status outside the enum to null, never to a real status', () => {
    expect(toJobStatus('canceled')).toBeNull();
    expect(toJobStatus('queued')).toBeNull();
    expect(toJobStatus('completed')).toBe('completed');
    const frame = parseServerFrame(
      JSON.stringify({ type: 'job_update', job_id: 'j', data: { status: 'canceled' } })
    );
    expect(frame).toMatchObject({ data: { status: null } });
  });

  it('parses a notification frame and needs every key of it', () => {
    const data = {
      id: 'n1',
      type: 'job_completed',
      title: 'Tour ready',
      message: 'Your tour is ready',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(parseServerFrame(JSON.stringify({ type: 'notification', data }))).toEqual({
      type: 'notification',
      data,
    });
    const { title: _title, ...partial } = data;
    void _title;
    expect(parseServerFrame(JSON.stringify({ type: 'notification', data: partial }))).toBeNull();
  });

  it('parses the control frames', () => {
    expect(parseServerFrame('{"type":"connected","message":"ok"}')).toEqual({
      type: 'connected',
      message: 'ok',
    });
    expect(parseServerFrame('{"type":"heartbeat"}')).toEqual({ type: 'heartbeat', message: null });
  });

  it('returns null for pong, non-JSON, binary and unknown frames', () => {
    expect(parseServerFrame('pong')).toBeNull();
    expect(parseServerFrame('{broken')).toBeNull();
    expect(parseServerFrame(new ArrayBuffer(4))).toBeNull();
    expect(parseServerFrame('{"type":"job_completed","job_id":"j"}')).toBeNull();
  });
});

describe('close codes', () => {
  it('names the two codes the client never retries', () => {
    expect(WS_CLOSE_UNAUTHORIZED).toBe(4001);
    expect(WS_CLOSE_NOT_FOUND).toBe(4004);
  });
});
