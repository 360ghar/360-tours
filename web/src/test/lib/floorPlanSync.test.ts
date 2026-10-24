import { describe, it, expect, vi, beforeEach } from 'vitest';

const toursApiMock = vi.hoisted(() => ({
  createFloorPlan: vi.fn(),
  updateFloorPlan: vi.fn(),
  deleteFloorPlan: vi.fn(),
}));
vi.mock('@/api', () => ({ toursApi: toursApiMock }));

import {
  floorPlanValidationError,
  isNewFloorPlan,
  newFloorPlanId,
  syncFloorPlans,
  toDraft,
  type FloorPlanDraft,
} from '@/lib/floorPlanSync';
import { makeFloorPlan } from '@/test/fixtures';

const stored = [
  makeFloorPlan({
    id: 'fp-1',
    name: 'Ground',
    floor_number: 1,
    markers: [{ scene_id: 's1', x: 10, y: 20 }],
  }),
  makeFloorPlan({ id: 'fp-2', name: 'First', floor_number: 2 }),
];

describe('syncFloorPlans: the floor_plans table is the only source', () => {
  beforeEach(() => {
    Object.values(toursApiMock).forEach(fn => fn.mockReset().mockResolvedValue(undefined));
  });

  it('deletes the removed plan, creates the new one and updates only the changed keys', async () => {
    const drafts: FloorPlanDraft[] = [
      { ...toDraft(stored[0]), name: 'Ground floor' }, // renamed
      { id: newFloorPlanId(), name: 'Roof', image_url: 'https://cdn/roof.png', floor_number: 3, markers: [] },
    ]; // fp-2 is gone

    await syncFloorPlans('tour-1', stored, drafts);

    expect(toursApiMock.deleteFloorPlan).toHaveBeenCalledWith('tour-1', 'fp-2');
    expect(toursApiMock.createFloorPlan).toHaveBeenCalledWith('tour-1', {
      name: 'Roof',
      image_url: 'https://cdn/roof.png',
      floor_number: 3,
      markers: [],
    });
    // Only `name` changed: the PUT carries that key and nothing else.
    expect(toursApiMock.updateFloorPlan).toHaveBeenCalledWith('tour-1', 'fp-1', {
      name: 'Ground floor',
    });
  });

  it('sends no request for a plan that did not change', async () => {
    await syncFloorPlans('tour-1', stored, stored.map(toDraft));

    expect(toursApiMock.deleteFloorPlan).not.toHaveBeenCalled();
    expect(toursApiMock.createFloorPlan).not.toHaveBeenCalled();
    expect(toursApiMock.updateFloorPlan).not.toHaveBeenCalled();
  });

  it('sends the markers when they change, with scene_id, x, y and label only', async () => {
    const draft = toDraft(stored[0]);
    await syncFloorPlans('tour-1', [stored[0]], [
      { ...draft, markers: [...draft.markers, { scene_id: 's2', x: 50, y: 60, label: 'Kitchen' }] },
    ]);

    expect(toursApiMock.updateFloorPlan).toHaveBeenCalledWith('tour-1', 'fp-1', {
      markers: [
        { scene_id: 's1', x: 10, y: 20 },
        { scene_id: 's2', x: 50, y: 60, label: 'Kitchen' },
      ],
    });
  });

  it('stops at the first failure', async () => {
    toursApiMock.deleteFloorPlan.mockRejectedValue(new Error('boom'));

    await expect(
      syncFloorPlans('tour-1', stored, [toDraft(stored[0])])
    ).rejects.toThrow('boom');
    expect(toursApiMock.createFloorPlan).not.toHaveBeenCalled();
  });
});

describe('floorPlanValidationError', () => {
  const ok: FloorPlanDraft = toDraft(stored[0]);

  it('accepts a valid plan', () => {
    expect(floorPlanValidationError([ok])).toBeNull();
  });

  it('rejects what the server rejects with a 422', () => {
    expect(floorPlanValidationError([{ ...ok, name: ' ' }])).toMatch(/name/i);
    expect(floorPlanValidationError([{ ...ok, name: 'x'.repeat(256) }])).toMatch(/255/);
    expect(floorPlanValidationError([{ ...ok, image_url: '' }])).toMatch(/Upload an image/);
    expect(floorPlanValidationError([{ ...ok, image_url: 'u'.repeat(513) }])).toMatch(/512/);
    expect(floorPlanValidationError([{ ...ok, floor_number: 0 }])).toMatch(/1 or more/);
  });

  it('marks a plan with a temporary id as new', () => {
    expect(isNewFloorPlan({ id: newFloorPlanId() })).toBe(true);
    expect(isNewFloorPlan({ id: 'fp-1' })).toBe(false);
  });
});
