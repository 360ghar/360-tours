import { apiClient, extractData } from './client';
import { clampLimit } from './pagination';
import { API_LIMITS } from '@/lib/api/limits.gen';
import type { components } from '@/lib/api/schema.gen';
import type {
  FileUploadResponse,
  MediaFile,
  MediaVisibility,
  StorageFolderType,
  CursorPaginatedResponse,
} from '@/types';

/** Every key is present: the schema marks them optional only because they default to `[]`. */
export type BatchDeleteResponse = Required<components['schemas']['BatchDeleteResponse']>;
type UploadStatus = components['schemas']['UploadStatus'];

export interface UploadOptions {
  /**
   * What the file is for. `/upload` accepts `generic`, `avatar`, the document
   * folders and, with `tourId`, `tour_thumbnail` and `tour_original`. The
   * property and scene folders need an id this route does not take.
   */
  folderType?: StorageFolderType;
  /** Required with `tour_thumbnail` and `tour_original`. */
  tourId?: string;
  visibility?: MediaVisibility;
  onProgress?: (progress: number) => void;
}

export interface MediaListParams {
  cursor?: string | null;
  limit?: number;
  tour_id?: string;
  mime_type?: string;
  visibility?: MediaVisibility;
  is_processed?: boolean;
  upload_status?: UploadStatus;
  /** Filename substring, 1 to 100 characters. */
  search?: string;
  include_total?: boolean;
}

export const uploadApi = {
  /** `POST /upload` (201). The result carries the new MediaFile in `media`. */
  async uploadFile(file: File, options: UploadOptions = {}): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.folderType) {
      formData.append('folder_type', options.folderType);
    }
    if (options.tourId) {
      formData.append('tour_id', options.tourId);
    }
    if (options.visibility) {
      formData.append('visibility', options.visibility);
    }

    // No explicit Content-Type: the request interceptor clears it for FormData
    // bodies so the browser sets `multipart/form-data` WITH the boundary.
    // Setting it by hand here would send a boundary-less multipart header, and
    // leaving the instance default would make axios serialize the file to JSON.
    const response = await apiClient.post<FileUploadResponse>('/upload', formData, {
      onUploadProgress: progressEvent => {
        if (options.onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          options.onProgress(progress);
        }
      },
    });
    return extractData(response);
  },

  /** One page of the caller's media. Follow `next_cursor` for more. */
  async getMediaFiles(params?: MediaListParams): Promise<CursorPaginatedResponse<MediaFile>> {
    const response = await apiClient.get<CursorPaginatedResponse<MediaFile>>('/upload/media', {
      params: {
        ...params,
        cursor: params?.cursor ?? undefined,
        limit: clampLimit(params?.limit),
      },
    });
    return extractData(response);
  },

  /** Delete one file (204). A storage failure is 503 `STORAGE_DELETE_FAILED`; the row is kept. */
  async deleteMediaFile(id: string): Promise<void> {
    await apiClient.delete(`/upload/media/${id}`);
  },

  /**
   * Delete many files through `POST /upload/media/batch-delete`, in groups of at
   * most 50 ids. Rejects when any id failed or a storage object was not removed;
   * the error carries the ids that were deleted.
   */
  async deleteMediaFiles(ids: string[]): Promise<BatchDeleteResponse> {
    const deleted: string[] = [];
    const failed: string[] = [];
    const storageWarnings: string[] = [];
    const size = API_LIMITS.media.batchDeleteMax;

    for (let start = 0; start < ids.length; start += size) {
      const group = ids.slice(start, start + size);
      try {
        const response = await apiClient.post<Partial<BatchDeleteResponse>>('/upload/media/batch-delete', {
          media_ids: group,
        });
        const body = extractData(response);
        deleted.push(...(body.deleted ?? []));
        failed.push(...(body.failed ?? []));
        storageWarnings.push(...(body.storage_warnings ?? []));
      } catch {
        failed.push(...group);
      }
    }

    const result: BatchDeleteResponse = {
      deleted,
      failed,
      storage_warnings: storageWarnings,
    };
    if (failed.length > 0 || storageWarnings.length > 0) {
      const problems = new Set([...failed, ...storageWarnings]);
      const err = new Error(
        `Failed to delete ${problems.size} file(s): ${[...problems].join(', ')}`
      ) as Error & { result: BatchDeleteResponse };
      err.result = result;
      throw err;
    }
    return result;
  },
};
