import { describe, it, expect } from 'vitest';
import {
  readDescriptions,
  readHotspotSuggestions,
  readSceneAnalysis,
  readSpatialLinkSummary,
  readTourGenerationResult,
} from '@/api/aiResults';

describe('readTourGenerationResult (generate_tour)', () => {
  it('reads tour_id, the tour title and the scene summaries', () => {
    const result = readTourGenerationResult({
      tour_id: 'tour-1',
      tour: { id: 'tour-1', title: 'Loft' },
      scenes: [
        {
          id: 's1',
          title: 'Living',
          description: null,
          image_url: 'https://cdn/s1.jpg',
          thumbnail_url: null,
          hotspot_count: 2,
        },
        { id: 's2' }, // no image_url: dropped
      ],
      generated: [],
      created_hotspots: [],
    });

    expect(result).toEqual({
      tour_id: 'tour-1',
      title: 'Loft',
      scenes: [
        {
          id: 's1',
          image_url: 'https://cdn/s1.jpg',
          title: 'Living',
          description: null,
          thumbnail_url: null,
          hotspot_count: 2,
        },
      ],
      spatial_summary: null,
    });
  });

  it('reads the snake_case linking summary of a spatial run', () => {
    const result = readTourGenerationResult({
      tour_id: 'tour-1',
      tour: { id: 'tour-1', title: 'Loft' },
      scenes: [],
      spatial_summary: {
        scene_count: 6,
        link_count: 7,
        warnings: ['2 rooms have no doorway link'],
      },
    });

    expect(result?.spatial_summary).toEqual({
      sceneCount: 6,
      linkCount: 7,
      warnings: ['2 rooms have no doorway link'],
    });
  });

  it('drops a summary that does not carry the counts, and reads a connect result the same way', () => {
    expect(
      readTourGenerationResult({
        tour_id: 'tour-1',
        tour: { id: 'tour-1' },
        scenes: [],
        spatial_summary: { warnings: ['no counts'] },
      })?.spatial_summary
    ).toBeNull();
    expect(readSpatialLinkSummary({ spatial_summary: { scene_count: 3, link_count: 2 } })).toEqual({
      sceneCount: 3,
      linkCount: 2,
      warnings: [],
    });
    expect(readSpatialLinkSummary({})).toBeNull();
    expect(readSpatialLinkSummary(null)).toBeNull();
  });

  it('treats a run that analysed no scene as no report, not as a clean graph', () => {
    expect(
      readSpatialLinkSummary({
        spatial_summary: {
          scene_count: 0,
          link_count: 0,
          warnings: [],
        },
      })
    ).toBeNull();
    expect(readSpatialLinkSummary({ spatial_summary: null })).toBeNull();
  });

  it('returns null without tour_id or tour, so the wizard can report it', () => {
    expect(readTourGenerationResult({ scenes: [] })).toBeNull();
    expect(readTourGenerationResult({ tour_id: 'tour-1' })).toBeNull();
    expect(readTourGenerationResult(null)).toBeNull();
  });
});

describe('readSceneAnalysis (analyze_scenes)', () => {
  it('reads {analysis: [...]} and drops a row that carries an error', () => {
    const rows = readSceneAnalysis({
      analysis: [
        {
          scene_id: 's1',
          room_type: 'kitchen',
          room_confidence: 0.9,
          suggested_title: 'Kitchen',
          suggested_description: 'Bright',
          quality_score: 80,
          quality_issues: ['blur', 3],
          features_detected: ['island'],
        },
        { scene_id: 's2', error: 'vision failed' },
        { room_type: 'bedroom' },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ scene_id: 's1', quality_issues: ['blur'] });
  });

  it('returns null when the result has no analysis list', () => {
    expect(readSceneAnalysis({})).toBeNull();
  });
});

describe('readDescriptions', () => {
  it('reads a list of {scene_id, description} and a {scene_id: text} map', () => {
    expect(
      readDescriptions({
        descriptions: [{ scene_id: 's1', description: 'One' }, { scene_id: 's2' }],
      })
    ).toEqual({ s1: 'One' });
    expect(readDescriptions({ descriptions: { s1: 'One', s2: 4 } })).toEqual({ s1: 'One' });
    expect(readDescriptions({})).toBeNull();
  });
});

describe('readHotspotSuggestions', () => {
  const valid = {
    id: 'h1',
    scene_id: 's1',
    type: 'navigation',
    position: { yaw: 10, pitch: 0 },
    target_scene_id: 's2',
    suggested_title: 'To kitchen',
    reasoning: 'doorway',
    confidence: 0.8,
  };

  it('keeps valid suggestions and drops a navigation suggestion with no target', () => {
    const rows = readHotspotSuggestions({
      hotspots: [
        valid,
        { ...valid, id: 'h2', target_scene_id: undefined },
        { ...valid, id: 'h3', type: 'info', target_scene_id: undefined },
        { ...valid, id: 'h4', type: 'audio' },
        { ...valid, id: 'h5', position: { yaw: 'x', pitch: 0 } },
      ],
    });

    expect(rows!.map(r => r.id)).toEqual(['h1', 'h3']);
    expect(rows![0].target_scene_id).toBe('s2');
  });
});
