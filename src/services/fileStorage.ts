/**
 * File Storage Service
 * Uses IndexedDB (via localforage) to store file metadata and processed data
 */

import localforage from 'localforage';
import { UploadedFile, Property } from '@/types/property';

// Configure localforage
const filesStore = localforage.createInstance({
  name: 'county-cad-tracker',
  storeName: 'files',
});

const propertiesStore = localforage.createInstance({
  name: 'county-cad-tracker',
  storeName: 'properties',
});

const metadataStore = localforage.createInstance({
  name: 'county-cad-tracker',
  storeName: 'metadata',
});

export interface FileMetadata extends UploadedFile {
  gcsFileName?: string;
  gcsUrl?: string;
}

/**
 * Save file metadata
 */
export async function saveFileMetadata(file: FileMetadata): Promise<void> {
  await filesStore.setItem(file.id, file);
}

/**
 * Get all file metadata
 */
export async function getAllFiles(): Promise<FileMetadata[]> {
  const files: FileMetadata[] = [];
  await filesStore.iterate((value: FileMetadata) => {
    files.push(value);
  });

  // Sort by upload date (newest first)
  return files.sort((a, b) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

/**
 * Get file metadata by ID
 */
export async function getFileById(id: string): Promise<FileMetadata | null> {
  return await filesStore.getItem(id);
}

/**
 * Delete file metadata
 */
export async function deleteFile(id: string): Promise<void> {
  await filesStore.removeItem(id);
  await propertiesStore.removeItem(id); // Also remove associated properties
}

/**
 * Save properties for a file
 */
export async function saveProperties(fileId: string, properties: Property[]): Promise<void> {
  await propertiesStore.setItem(fileId, properties);
}

/**
 * Get properties for a file
 */
export async function getProperties(fileId: string): Promise<Property[] | null> {
  return await propertiesStore.getItem(fileId);
}

/**
 * Get all properties from all files
 */
export async function getAllProperties(): Promise<Property[]> {
  const allProperties: Property[] = [];
  await propertiesStore.iterate((value: Property[]) => {
    allProperties.push(...value);
  });
  return allProperties;
}

/**
 * Save metadata (upload quota, etc.)
 */
export async function saveMetadata(key: string, value: any): Promise<void> {
  await metadataStore.setItem(key, value);
}

/**
 * Get metadata
 */
export async function getMetadata(key: string): Promise<any> {
  return await metadataStore.getItem(key);
}

/**
 * Track upload quota
 */
export interface UploadQuota {
  month: string; // YYYY-MM format
  count: number;
  limit: number;
}

export async function getUploadQuota(): Promise<UploadQuota> {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const quota = await getMetadata('uploadQuota') as UploadQuota;

  if (!quota || quota.month !== currentMonth) {
    // Reset quota for new month
    const limit = parseInt(import.meta.env.VITE_MAX_UPLOADS_PER_MONTH || '5000');
    const newQuota: UploadQuota = {
      month: currentMonth,
      count: 0,
      limit,
    };
    await saveMetadata('uploadQuota', newQuota);
    return newQuota;
  }

  return quota;
}

export async function incrementUploadQuota(): Promise<UploadQuota> {
  const quota = await getUploadQuota();
  quota.count += 1;
  await saveMetadata('uploadQuota', quota);
  return quota;
}

export async function canUpload(): Promise<{ allowed: boolean; quota: UploadQuota }> {
  const quota = await getUploadQuota();
  return {
    allowed: quota.count < quota.limit,
    quota,
  };
}
