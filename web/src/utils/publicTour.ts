import type { Tour } from '@/types';

/**
 * A tour is playable on `/view/:id` and `/embed/:id` only when it is published
 * and not private. Drafts, archives, and private tours must not render as a
 * public viewer even if the API payload leaks through.
 */
export function isPlayablePublicTour(
  tour: Pick<Tour, 'status' | 'visibility'> | null | undefined
): boolean {
  if (!tour) return false;
  if (tour.status !== 'published') return false;
  if (tour.visibility === 'private') return false;
  return true;
}
