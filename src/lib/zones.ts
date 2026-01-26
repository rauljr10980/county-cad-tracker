/**
 * Predefined Service Zones Management
 * Allows saving, loading, and managing custom geographic zones
 * Now uses API instead of localStorage for cross-device sync
 */

import { API_BASE_URL } from './api';

export interface SavedZone {
  id: string;
  name: string;
  description?: string;
  type: 'rectangle' | 'circle' | 'polygon';
  color: string;
  createdAt: string;
  updatedAt: string;

  // Zone geometry
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  center?: { lat: number; lng: number };
  radius?: number; // in meters
  polygon?: { lat: number; lng: number }[];
}

// Predefined color palette for zones
export const ZONE_COLORS = [
  '#4285F4', // Blue
  '#EA4335', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#EF4444', // Rose
];

/**
 * Load all saved zones from API
 */
export async function loadZones(): Promise<SavedZone[]> {
  try {
    console.log('[Zones] Fetching zones from API...');
    const response = await fetch(`${API_BASE_URL}/api/zones`);

    if (!response.ok) {
      throw new Error(`Failed to fetch zones: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Zones] Zones loaded:', data.zones?.length || 0);
    return data.zones || [];
  } catch (error) {
    console.error('[Zones] Failed to load zones:', error);
    return [];
  }
}

/**
 * Save a new zone
 */
export async function saveZone(zone: Omit<SavedZone, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedZone> {
  try {
    console.log('[Zones] Creating zone:', zone.name);
    const response = await fetch(`${API_BASE_URL}/api/zones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zone),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create zone');
    }

    const data = await response.json();
    console.log('[Zones] Zone created:', data.zone.id);
    return data.zone;
  } catch (error) {
    console.error('[Zones] Failed to save zone:', error);
    throw error;
  }
}

/**
 * Update an existing zone
 */
export async function updateZone(id: string, updates: Partial<Omit<SavedZone, 'id' | 'createdAt'>>): Promise<SavedZone | null> {
  try {
    console.log('[Zones] Updating zone:', id);
    const response = await fetch(`${API_BASE_URL}/api/zones/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.json();
      throw new Error(error.error || 'Failed to update zone');
    }

    const data = await response.json();
    console.log('[Zones] Zone updated:', data.zone.id);
    return data.zone;
  } catch (error) {
    console.error('[Zones] Failed to update zone:', error);
    throw error;
  }
}

/**
 * Delete a zone
 */
export async function deleteZone(id: string): Promise<boolean> {
  try {
    console.log('[Zones] Deleting zone:', id);
    const response = await fetch(`${API_BASE_URL}/api/zones/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return false;
      }
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete zone');
    }

    console.log('[Zones] Zone deleted:', id);
    return true;
  } catch (error) {
    console.error('[Zones] Failed to delete zone:', error);
    throw error;
  }
}

/**
 * Get a specific zone by ID
 */
export async function getZone(id: string): Promise<SavedZone | null> {
  try {
    console.log('[Zones] Fetching zone:', id);
    const response = await fetch(`${API_BASE_URL}/api/zones/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch zone: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.zone;
  } catch (error) {
    console.error('[Zones] Failed to get zone:', error);
    return null;
  }
}

/**
 * Get next available color
 */
export function getNextColor(existingZones: SavedZone[]): string {
  const usedColors = new Set(existingZones.map(z => z.color));
  const availableColor = ZONE_COLORS.find(c => !usedColors.has(c));
  return availableColor || ZONE_COLORS[existingZones.length % ZONE_COLORS.length];
}
