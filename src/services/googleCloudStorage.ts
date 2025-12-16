/**
 * Google Cloud Storage Service
 * Handles file uploads to Google Cloud Storage using REST API
 */

const GCS_UPLOAD_URL = 'https://storage.googleapis.com/upload/storage/v1/b';
const GCS_API_URL = 'https://storage.googleapis.com/storage/v1/b';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface GCSConfig {
  apiKey: string;
  bucketName: string;
  projectId: string;
}

export class GoogleCloudStorageService {
  private config: GCSConfig;

  constructor(config: GCSConfig) {
    this.config = config;
  }

  /**
   * Upload a file to Google Cloud Storage
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ name: string; url: string; size: number }> {
    const fileName = `${Date.now()}-${file.name}`;
    const url = `${GCS_UPLOAD_URL}/${this.config.bucketName}/o?uploadType=media&name=${encodeURIComponent(fileName)}&key=${this.config.apiKey}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          resolve({
            name: response.name,
            url: this.getPublicUrl(response.name),
            size: response.size,
          });
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }

  /**
   * Download a file from Google Cloud Storage
   */
  async downloadFile(fileName: string): Promise<Blob> {
    const url = `${GCS_API_URL}/${this.config.bucketName}/o/${encodeURIComponent(fileName)}?alt=media&key=${this.config.apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * List files in the bucket
   */
  async listFiles(): Promise<Array<{ name: string; size: number; updated: string }>> {
    const url = `${GCS_API_URL}/${this.config.bucketName}/o?key=${this.config.apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Delete a file from the bucket
   */
  async deleteFile(fileName: string): Promise<void> {
    const url = `${GCS_API_URL}/${this.config.bucketName}/o/${encodeURIComponent(fileName)}?key=${this.config.apiKey}`;

    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }
  }

  /**
   * Get public URL for a file
   */
  private getPublicUrl(fileName: string): string {
    return `https://storage.googleapis.com/${this.config.bucketName}/${fileName}`;
  }
}

// Singleton instance
let gcsInstance: GoogleCloudStorageService | null = null;

export function getGCSInstance(): GoogleCloudStorageService {
  if (!gcsInstance) {
    const config: GCSConfig = {
      apiKey: import.meta.env.VITE_GCS_API_KEY || '',
      bucketName: import.meta.env.VITE_GCS_BUCKET_NAME || '',
      projectId: import.meta.env.VITE_GCS_PROJECT_ID || '',
    };

    if (!config.apiKey || !config.bucketName) {
      throw new Error('Google Cloud Storage not configured. Please set environment variables.');
    }

    gcsInstance = new GoogleCloudStorageService(config);
  }

  return gcsInstance;
}
