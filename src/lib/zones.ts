/**
 * Predefined Service Zones Management
 * Allows saving, loading, and managing custom geographic zones
 */

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

const STORAGE_KEY = 'county-cad-zones';

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
 * Load all saved zones from localStorage
 */
export function loadZones(): SavedZone[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const zones = JSON.parse(stored) as SavedZone[];
    return zones;
  } catch (error) {
    console.error('[Zones] Failed to load zones:', error);
    return [];
  }
}

/**
 * Save a new zone
 */
export function saveZone(zone: Omit<SavedZone, 'id' | 'createdAt' | 'updatedAt'>): SavedZone {
  const zones = loadZones();

  const newZone: SavedZone = {
    ...zone,
    id: `zone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  zones.push(newZone);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));

  return newZone;
}

/**
 * Update an existing zone
 */
export function updateZone(id: string, updates: Partial<Omit<SavedZone, 'id' | 'createdAt'>>): SavedZone | null {
  const zones = loadZones();
  const index = zones.findIndex(z => z.id === id);

  if (index === -1) return null;

  zones[index] = {
    ...zones[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
  return zones[index];
}

/**
 * Delete a zone
 */
export function deleteZone(id: string): boolean {
  const zones = loadZones();
  const filtered = zones.filter(z => z.id !== id);

  if (filtered.length === zones.length) return false;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

/**
 * Get a specific zone by ID
 */
export function getZone(id: string): SavedZone | null {
  const zones = loadZones();
  return zones.find(z => z.id === id) || null;
}

/**
 * Get next available color
 */
export function getNextColor(existingZones: SavedZone[]): string {
  const usedColors = new Set(existingZones.map(z => z.color));
  const availableColor = ZONE_COLORS.find(c => !usedColors.has(c));
  return availableColor || ZONE_COLORS[existingZones.length % ZONE_COLORS.length];
}
