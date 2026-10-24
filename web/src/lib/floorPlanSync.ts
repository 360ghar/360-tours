/**
 * Floor plans live in the `floor_plans` table and nowhere else: the editor
 * writes them through the floor-plan routes and every viewer reads them from
 * `tour.floor_plans`. `tour.settings` carries no floor plans (the server
 * rejects the key on write and drops it on read).
 */
import { toursApi } from '@/api';
import { API_LIMITS } from '@/lib/api/limits.gen';
import type { FloorPlan, FloorPlanMarkerInput, FloorPlanUpdateInput } from '@/types';

/** A floor plan as the editor holds it. A new one has a temporary id and no server row yet. */
export interface FloorPlanDraft {
  id: string;
  name: string;
  image_url: string;
  floor_number: number;
  markers: FloorPlanMarkerInput[];
}

const NEW_FLOOR_PLAN_PREFIX = 'new-floor-plan-';

export function newFloorPlanId(): string {
  return `${NEW_FLOOR_PLAN_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isNewFloorPlan(draft: Pick<FloorPlanDraft, 'id'>): boolean {
  return draft.id.startsWith(NEW_FLOOR_PLAN_PREFIX);
}

export function toDraft(plan: FloorPlan): FloorPlanDraft {
  return {
    id: plan.id,
    name: plan.name,
    image_url: plan.image_url,
    floor_number: plan.floor_number,
    markers: plan.markers.map(({ scene_id, x, y, label }) => ({
      scene_id,
      x,
      y,
      ...(label ? { label } : {}),
    })),
  };
}

/** The first reason the drafts cannot be saved, or null. The server rejects each of these with a 422. */
export function floorPlanValidationError(drafts: FloorPlanDraft[]): string | null {
  const limits = API_LIMITS.floorPlan;
  for (const draft of drafts) {
    const label = draft.name.trim() || `Floor ${draft.floor_number}`;
    if (!draft.name.trim()) return 'Give every floor plan a name.';
    if (draft.name.length > limits.nameMax) {
      return `The name of ${label} can have at most ${limits.nameMax} characters.`;
    }
    if (!draft.image_url) return `Upload an image for ${label} before saving.`;
    if (draft.image_url.length > limits.imageUrlMax) {
      return `The image URL of ${label} is longer than ${limits.imageUrlMax} characters. Upload the image again.`;
    }
    if (draft.floor_number < limits.floorNumberMin) {
      return `The floor number of ${label} must be ${limits.floorNumberMin} or more.`;
    }
  }
  return null;
}

function sameMarkers(a: FloorPlanMarkerInput[], b: FloorPlanMarkerInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((marker, i) => {
    const other = b[i];
    return (
      marker.scene_id === other.scene_id &&
      marker.x === other.x &&
      marker.y === other.y &&
      (marker.label ?? null) === (other.label ?? null)
    );
  });
}

/** The keys of `edited` that differ from the stored plan. */
function changedKeys(stored: FloorPlanDraft, edited: FloorPlanDraft): FloorPlanUpdateInput {
  const changes: FloorPlanUpdateInput = {};
  if (stored.name !== edited.name) changes.name = edited.name.trim();
  if (stored.image_url !== edited.image_url) changes.image_url = edited.image_url;
  if (stored.floor_number !== edited.floor_number) changes.floor_number = edited.floor_number;
  if (!sameMarkers(stored.markers, edited.markers)) changes.markers = edited.markers;
  return changes;
}

/**
 * Bring the server to the edited list: delete the plans that were removed,
 * create the new ones, update the ones that changed. Stops at the first
 * failure, so the caller reloads the list to show what was stored.
 */
export async function syncFloorPlans(
  tourId: string,
  stored: FloorPlan[],
  edited: FloorPlanDraft[]
): Promise<void> {
  const storedDrafts = new Map(stored.map(plan => [plan.id, toDraft(plan)]));
  const editedIds = new Set(edited.map(draft => draft.id));

  for (const id of storedDrafts.keys()) {
    if (!editedIds.has(id)) await toursApi.deleteFloorPlan(tourId, id);
  }

  for (const draft of edited) {
    const before = storedDrafts.get(draft.id);
    if (!before || isNewFloorPlan(draft)) {
      await toursApi.createFloorPlan(tourId, {
        name: draft.name.trim(),
        image_url: draft.image_url,
        floor_number: draft.floor_number,
        markers: draft.markers,
      });
      continue;
    }
    const changes = changedKeys(before, draft);
    if (Object.keys(changes).length > 0) {
      await toursApi.updateFloorPlan(tourId, draft.id, changes);
    }
  }
}
