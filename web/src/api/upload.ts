import { apiClient, extractData } from './client';
import type { FileUploadResponse, MediaFile, CursorPaginatedResponse } from '@/types';

export interface UploadOptions {
  folder?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  onProgress?: (progress: number) => void;
}

export const uploadApi = {
  async uploadFile(file: File, options: UploadOptions = {}): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.folder) {
      formData.append('folder', options.folder);
    }
    if (options.visibility) {
      formData.append('visibility', options.visibility);
    }

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

  async uploadFiles(
    files: File[],
    options: UploadOptions = {}
  ): Promise<FileUploadResponse[]> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    if (options.folder) {
      formData.append('folder', options.folder);
    }
    if (options.visibility) {
      formData.append('visibility', options.visibility);
    }

    const response = await apiClient.post<{ items: FileUploadResponse[] }>(
      '/upload/batch',
      formData,
      {
        onUploadProgress: progressEvent => {
          if (options.onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            options.onProgress(progress);
          }
        },
      }
    );
    return extractData(response).items;
  },

  async getMediaFiles(params?: {
    cursor?: string | null;
    limit?: number;
    folder?: string;
    mime_type?: string;
    search?: string;
  }): Promise<CursorPaginatedResponse<MediaFile>> {
    const response = await apiClient.get<CursorPaginatedResponse<MediaFile>>('/upload/media', {
      params,
    });
    return extractData(response);
  },

  async getMediaFile(id: string): Promise<MediaFile> {
    const response = await apiClient.get<MediaFile>(`/upload/media/${id}`);
    return extractData(response);
  },

  async deleteMediaFile(id: string): Promise<void> {
    await apiClient.delete(`/upload/media/${id}`);
  },

  async deleteMediaFiles(ids: string[]): Promise<{ deleted: string[]; failed: { id: string; error: string }[] }> {
    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          await apiClient.delete(`/upload/media/${id}`);
          deleted.push(id);
        } catch (err) {
          failed.push({ id, error: (err as Error).message });
        }
      })
    );
    if (failed.length > 0) {
      const err = new Error(
        `Failed to delete ${failed.length} file(s): ${failed.map((f) => f.id).join(', ')}`
      ) as Error & { deleted: string[]; failed: typeof failed };
      err.deleted = deleted;
      err.failed = failed;
      throw err;
    }
    return { deleted, failed };
  },
};
