export type SplatJobStatus =
  | 'pending'
  | 'uploading'
  | 'extracting'
  | 'converting'
  | 'sfm'
  | 'training'
  | 'compressing'
  | 'collision'
  | 'ready'
  | 'failed';

export type QualityPreset = 'fast' | 'balanced' | 'quality';

export interface SplatJob {
  id: string;
  title: string;
  status: SplatJobStatus;
  progress: number;
  stage_message: string;
  is_360_video: boolean;
  mask_people: boolean;
  quality_preset: QualityPreset;
  video_path?: string;
  splat_url?: string;
  collision_url?: string;
  supersplat_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSplatJobRequest {
  title: string;
  is_360_video: boolean;
  mask_people: boolean;
  quality_preset: QualityPreset;
}

/** What actually goes over the wire — `filenames` is derived from the picked files, not caller-supplied. */
export interface CreateSplatJobPayload extends CreateSplatJobRequest {
  filenames: string[];
}

export interface SplatPipelineStage {
  id: SplatJobStatus;
  label: string;
  description: string;
}
