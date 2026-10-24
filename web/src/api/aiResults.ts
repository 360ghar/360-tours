/**
 * Readers for the `result` of a finished AI job.
 *
 * The OpenAPI document types `result` as a union of one model per job type, but
 * the analysis, description and hotspot models hold free-form objects. Each
 * reader checks the keys the UI uses and drops an item that does not fit, so
 * one bad row cannot break a screen.
 */
import type { HotspotPosition, TourGenerationSceneSummary } from '@/types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// ─── generate_tour ─────────────────────────────────────────────────────

/** Linking-quality report of a finished spatial job, shown in the review step. */
export interface SpatialLinkSummary {
  sceneCount: number;
  linkCount: number;
  warnings: string[];
}

/** What the wizard shows for a finished `generate_tour` job. */
export interface GeneratedTourSummary {
  tour_id: string;
  title: string;
  scenes: TourGenerationSceneSummary[];
  /** Null when the job ran without spatial linking or the server sent none. */
  spatial_summary: SpatialLinkSummary | null;
}

function readSpatialSummary(value: unknown): SpatialLinkSummary | null {
  if (!isRecord(value)) return null;
  const sceneCount = asNumber(value.scene_count);
  const linkCount = asNumber(value.link_count);
  if (sceneCount === undefined || linkCount === undefined) return null;
  // A run that could not analyse any scene reports zeros. Showing that as a
  // result would read as "every room is reachable", which is a claim the run
  // never made, so an empty report is treated as no report.
  if (sceneCount === 0) return null;
  return { sceneCount, linkCount, warnings: readStringList(value.warnings) };
}

function readGeneratedScene(item: unknown): TourGenerationSceneSummary | null {
  if (!isRecord(item)) return null;
  const id = asString(item.id);
  const imageUrl = asString(item.image_url);
  if (!id || !imageUrl) return null;
  return {
    id,
    image_url: imageUrl,
    title: asString(item.title) ?? null,
    description: asString(item.description) ?? null,
    thumbnail_url: asString(item.thumbnail_url) ?? null,
    hotspot_count: asNumber(item.hotspot_count) ?? 0,
  };
}

/**
 * `generate_tour` result: `{tour_id, tour, scenes[], generated[], created_hotspots[]}`.
 * Returns null when `tour_id` or `tour` is missing, so the wizard can report it.
 */
export function readTourGenerationResult(result: unknown): GeneratedTourSummary | null {
  if (!isRecord(result)) return null;
  const tourId = asString(result.tour_id);
  if (!tourId || !isRecord(result.tour)) return null;
  const scenes = Array.isArray(result.scenes) ? result.scenes : [];
  return {
    tour_id: tourId,
    title: asString(result.tour.title) ?? '',
    scenes: scenes.flatMap(item => {
      const scene = readGeneratedScene(item);
      return scene ? [scene] : [];
    }),
    spatial_summary: readSpatialSummary(result.spatial_summary),
  };
}

/** `spatial_connect` (and optimization) result: `{spatial_summary}` when spatial linking ran. */
export function readSpatialLinkSummary(result: unknown): SpatialLinkSummary | null {
  if (!isRecord(result)) return null;
  return readSpatialSummary(result.spatial_summary);
}

// ─── analyze_scenes ────────────────────────────────────────────────────

export interface SceneAnalysisResult {
  scene_id: string;
  room_type: string;
  room_confidence: number;
  suggested_title: string;
  suggested_description: string;
  quality_score: number;
  quality_issues?: string[];
  features_detected: string[];
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** `analyze_scene(s)` result: `{analysis: [...]}`. A row with an `error` key failed and is dropped. */
export function readSceneAnalysis(result: unknown): SceneAnalysisResult[] | null {
  if (!isRecord(result) || !Array.isArray(result.analysis)) return null;
  const rows: SceneAnalysisResult[] = [];
  for (const item of result.analysis) {
    if (!isRecord(item) || item.error !== undefined) continue;
    const sceneId = asString(item.scene_id);
    if (!sceneId) continue;
    rows.push({
      scene_id: sceneId,
      room_type: asString(item.room_type) ?? 'unknown',
      room_confidence: asNumber(item.room_confidence) ?? 0,
      suggested_title: asString(item.suggested_title) ?? '',
      suggested_description: asString(item.suggested_description) ?? '',
      quality_score: asNumber(item.quality_score) ?? 0,
      quality_issues: readStringList(item.quality_issues),
      features_detected: readStringList(item.features_detected),
    });
  }
  return rows;
}

// ─── generate_description(s) ───────────────────────────────────────────

/**
 * `generate_description(s)` result: `{descriptions}`. The schema lists objects
 * `{scene_id, description}`; a `{scene_id: text}` map is read too.
 */
export function readDescriptions(result: unknown): Record<string, string> | null {
  if (!isRecord(result)) return null;
  const raw = result.descriptions;
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const sceneId = asString(item.scene_id);
      const text = asString(item.description);
      if (sceneId && text !== undefined) out[sceneId] = text;
    }
    return out;
  }
  if (isRecord(raw)) {
    for (const [sceneId, text] of Object.entries(raw)) {
      if (typeof text === 'string') out[sceneId] = text;
    }
    return out;
  }
  return null;
}

// ─── suggest_hotspots / suggest_tour_hotspots ──────────────────────────

export interface HotspotSuggestion {
  id: string;
  scene_id: string;
  type: 'navigation' | 'info';
  position: Required<Pick<HotspotPosition, 'yaw' | 'pitch'>>;
  /** Present only for navigation suggestions: a scene of the same tour. */
  target_scene_id?: string;
  suggested_title?: string;
  reasoning: string;
  /** 0 to 1. */
  confidence: number;
}

/** `suggest_hotspots` result: `{hotspots: [...]}` holding only valid suggestions. */
export function readHotspotSuggestions(result: unknown): HotspotSuggestion[] | null {
  if (!isRecord(result) || !Array.isArray(result.hotspots)) return null;
  const rows: HotspotSuggestion[] = [];
  for (const item of result.hotspots) {
    if (!isRecord(item) || !isRecord(item.position)) continue;
    const id = asString(item.id);
    const sceneId = asString(item.scene_id);
    const yaw = asNumber(item.position.yaw);
    const pitch = asNumber(item.position.pitch);
    const type = item.type;
    if (!id || !sceneId || yaw === undefined || pitch === undefined) continue;
    if (type !== 'navigation' && type !== 'info') continue;
    const target = asString(item.target_scene_id);
    if (type === 'navigation' && !target) continue;
    rows.push({
      id,
      scene_id: sceneId,
      type,
      position: { yaw, pitch },
      target_scene_id: target,
      suggested_title: asString(item.suggested_title),
      reasoning: asString(item.reasoning) ?? '',
      confidence: asNumber(item.confidence) ?? 0,
    });
  }
  return rows;
}
