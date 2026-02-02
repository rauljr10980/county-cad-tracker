/**
 * Zone Manager Component
 * UI for creating, editing, and deleting predefined service zones
 */

import { useState, useEffect, useMemo } from 'react';
import { Trash2, Edit, Plus, Save, X, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Rectangle, Circle, Polygon, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SavedZone, loadZones, deleteZone, ZONE_COLORS } from '@/lib/zones';
import { cn } from '@/lib/utils';

interface PropertyLike {
  id?: string;
  latitude: number | null;
  longitude: number | null;
}

interface ZoneManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectZone: (zone: SavedZone) => void;
  onEditZone?: (zone: SavedZone) => void;
  properties: PropertyLike[];
  unavailablePropertyIds?: Set<string>;
}

// Helper to check if point is inside polygon
function isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Helper to check if point is inside circle
function isPointInCircle(point: { lat: number; lng: number }, center: { lat: number; lng: number }, radiusKm: number): boolean {
  const R = 6371; // Earth's radius in km
  const dLat = (point.lat - center.lat) * Math.PI / 180;
  const dLng = (point.lng - center.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(center.lat * Math.PI / 180) * Math.cos(point.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance <= radiusKm;
}

// Helper to check if point is inside bounds
function isPointInBounds(point: { lat: number; lng: number }, bounds: { north: number; south: number; east: number; west: number }): boolean {
  return point.lat >= bounds.south && point.lat <= bounds.north &&
    point.lng >= bounds.west && point.lng <= bounds.east;
}

// Map bounds adjuster
function MapBoundsAdjuster({ zones }: { zones: SavedZone[] }) {
  const map = useMap();

  useEffect(() => {
    if (zones.length === 0) return;

    // Calculate combined bounds of all zones
    const allBounds: L.LatLngBounds[] = [];

    zones.forEach(zone => {
      if (zone.type === 'polygon' && zone.polygon) {
        const polygonBounds = L.latLngBounds(zone.polygon.map(p => [p.lat, p.lng]));
        allBounds.push(polygonBounds);
      } else if (zone.type === 'circle' && zone.center && zone.radius) {
        const center = L.latLng(zone.center.lat, zone.center.lng);
        const circle = L.circle(center, { radius: zone.radius });
        allBounds.push(circle.getBounds());
      } else if (zone.type === 'rectangle') {
        const bounds = L.latLngBounds(
          [zone.bounds.south, zone.bounds.west],
          [zone.bounds.north, zone.bounds.east]
        );
        allBounds.push(bounds);
      }
    });

    if (allBounds.length > 0) {
      let combinedBounds = allBounds[0];
      allBounds.slice(1).forEach(bounds => {
        combinedBounds.extend(bounds);
      });
      map.fitBounds(combinedBounds, { padding: [50, 50] });
    }
  }, [map, zones]);

  return null;
}

export function ZoneManager({ isOpen, onClose, onSelectZone, onEditZone, properties, unavailablePropertyIds = new Set() }: ZoneManagerProps) {
  const [zones, setZones] = useState<SavedZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      loadZones()
        .then(setZones)
        .catch(error => {
          console.error('Failed to load zones:', error);
          setZones([]);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  // Calculate property counts for each zone
  // Track both total properties and available properties (not in routes)
  const zoneCounts = useMemo(() => {
    const counts: Record<string, { total: number; available: number }> = {};

    zones.forEach(zone => {
      let totalCount = 0;
      let availableCount = 0;

      properties.forEach(p => {
        if (!p.latitude || !p.longitude) return;

        const point = { lat: p.latitude, lng: p.longitude };
        let isInZone = false;

        if (zone.type === 'polygon' && zone.polygon) {
          isInZone = isPointInPolygon(point, zone.polygon);
        } else if (zone.type === 'circle' && zone.center && zone.radius) {
          const radiusKm = zone.radius / 1000;
          isInZone = isPointInCircle(point, zone.center, radiusKm);
        } else if (zone.type === 'rectangle') {
          isInZone = isPointInBounds(point, zone.bounds);
        }

        if (isInZone) {
          totalCount++;
          // Count as available if not in unavailablePropertyIds (not already in a route)
          if (!p.id || !unavailablePropertyIds.has(p.id)) {
            availableCount++;
          }
        }
      });

      counts[zone.id] = { total: totalCount, available: availableCount };
    });

    return counts;
  }, [zones, properties, unavailablePropertyIds]);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this zone?')) {
      try {
        await deleteZone(id);
        const updatedZones = await loadZones();
        setZones(updatedZones);
      } catch (error) {
        console.error('Failed to delete zone:', error);
        alert('Failed to delete zone. Please try again.');
      }
    }
  };

  const handleSelect = (zone: SavedZone) => {
    setSelectedZoneId(zone.id);
    onSelectZone(zone);
    onClose();
  };

  const getZoneTypeIcon = (type: string) => {
    switch (type) {
      case 'rectangle':
        return '▭';
      case 'circle':
        return '●';
      case 'polygon':
        return '⬟';
      default:
        return '▢';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-3xl md:max-w-5xl lg:max-w-7xl max-h-[85vh] h-[80vh]">
        <DialogHeader>
          <DialogTitle>Saved Service Zones</DialogTitle>
          <DialogDescription>
            Select a zone to see properties within it. Click on a zone card or the map to select.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full overflow-hidden">
          {/* Left side: Zone list */}
          <div className="space-y-3 overflow-y-auto pr-2">
            {zones.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No saved zones yet</p>
                <p className="text-xs mt-1">
                  Create zones by drawing areas and saving them for future use
                </p>
              </div>
            ) : (
              zones.map((zone) => {
                const counts = zoneCounts[zone.id] || { total: 0, available: 0 };
                return (
                  <div
                    key={zone.id}
                    className={cn(
                      "p-4 border rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer",
                      selectedZoneId === zone.id && "ring-2 ring-primary bg-secondary/50"
                    )}
                    onClick={() => handleSelect(zone)}
                    onMouseEnter={() => setSelectedZoneId(zone.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className="w-10 h-10 rounded flex items-center justify-center text-white text-xl flex-shrink-0"
                          style={{ backgroundColor: zone.color }}
                        >
                          {getZoneTypeIcon(zone.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium text-sm">{zone.name}</h3>
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                              {counts.available}/{counts.total}
                            </span>
                          </div>
                          {zone.description && (
                            <p className="text-xs text-muted-foreground mt-1">{zone.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="capitalize">{zone.type}</span>
                            <span>•</span>
                            <span>Created {formatDate(zone.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {onEditZone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditZone(zone);
                              onClose();
                            }}
                            title="Edit zone"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(zone.id);
                          }}
                          title="Delete zone"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right side: Map */}
          <div className="h-full rounded-lg overflow-hidden border">
            {zones.length > 0 ? (
              <MapContainer
                center={[29.4241, -98.4936]}
                zoom={11}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapBoundsAdjuster zones={zones} />
                {zones.map((zone) => {
                  const isHovered = selectedZoneId === zone.id;
                  const opacity = isHovered ? 0.4 : 0.2;
                  const weight = isHovered ? 3 : 2;

                  if (zone.type === 'rectangle') {
                    const bounds = new LatLngBounds(
                      [zone.bounds.south, zone.bounds.west],
                      [zone.bounds.north, zone.bounds.east]
                    );
                    return (
                      <Rectangle
                        key={zone.id}
                        bounds={bounds}
                        pathOptions={{
                          color: zone.color,
                          fillColor: zone.color,
                          fillOpacity: opacity,
                          weight: weight
                        }}
                        eventHandlers={{
                          click: () => handleSelect(zone),
                          mouseover: () => setSelectedZoneId(zone.id),
                        }}
                      />
                    );
                  } else if (zone.type === 'circle' && zone.center && zone.radius) {
                    return (
                      <Circle
                        key={zone.id}
                        center={[zone.center.lat, zone.center.lng]}
                        radius={zone.radius}
                        pathOptions={{
                          color: zone.color,
                          fillColor: zone.color,
                          fillOpacity: opacity,
                          weight: weight
                        }}
                        eventHandlers={{
                          click: () => handleSelect(zone),
                          mouseover: () => setSelectedZoneId(zone.id),
                        }}
                      />
                    );
                  } else if (zone.type === 'polygon' && zone.polygon) {
                    return (
                      <Polygon
                        key={zone.id}
                        positions={zone.polygon.map(p => [p.lat, p.lng])}
                        pathOptions={{
                          color: zone.color,
                          fillColor: zone.color,
                          fillOpacity: opacity,
                          weight: weight
                        }}
                        eventHandlers={{
                          click: () => handleSelect(zone),
                          mouseover: () => setSelectedZoneId(zone.id),
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-secondary/20">
                <p className="text-muted-foreground text-sm">No zones to display</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
