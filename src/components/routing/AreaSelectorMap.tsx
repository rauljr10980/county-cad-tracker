/**
 * Area Selector Map Component using Leaflet - Wizard Version
 * Step-by-step wizard: 1. Draw Area -> 2. Select Starting Point -> 3. Preview -> 4. Optimize
 */

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, Rectangle, Circle, Polygon, CircleMarker, useMapEvents } from 'react-leaflet';
import { LatLngBounds, LatLng, DivIcon } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Square, Circle as CircleIcon, Check, X, PenTool, MapPin, ArrowRight, ArrowLeft, List, Route, Save, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Marker, Popup } from 'react-leaflet';
import { cn } from '@/lib/utils';
import { ZoneManager } from './ZoneManager';
import { SavedZone, saveZone, getNextColor, loadZones } from '@/lib/zones';
import { toast } from '@/hooks/use-toast';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface PropertyLike {
  id: string;
  latitude: number;
  longitude: number;
  propertyAddress?: string;
  address?: string;
  ownerName?: string;
  accountNumber?: string;
  [key: string]: any;
}

interface AreaSelectorMapProps {
  isOpen: boolean;
  onClose: () => void;
  onOptimize: (params: {
    startingPoint: { property: PropertyLike; pinLocation: { lat: number; lng: number } };
    area: {
      north: number;
      south: number;
      east: number;
      west: number;
      center?: { lat: number; lng: number };
      radius?: number;
      polygon?: { lat: number; lng: number }[];
    };
    selectedProperties: PropertyLike[];
  }) => void;
  unavailablePropertyIds?: Set<string>; // Properties that are depots or in progress
  properties?: PropertyLike[];
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  numVehicles?: number;
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Point-in-polygon check
function isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  if (polygon.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if point is in bounds
function isPointInBounds(point: { lat: number; lng: number }, bounds: { north: number; south: number; east: number; west: number }): boolean {
  return point.lat >= bounds.south &&
         point.lat <= bounds.north &&
         point.lng >= bounds.west &&
         point.lng <= bounds.east;
}

// Check if point is in circle
function isPointInCircle(point: { lat: number; lng: number }, center: { lat: number; lng: number }, radiusKm: number): boolean {
  const distance = calculateDistance(point.lat, point.lng, center.lat, center.lng);
  return distance <= radiusKm;
}

// Component to handle drawing
function ShapeDrawer({ 
  drawingMode, 
  onRectangleComplete,
  onCircleComplete,
  onPolygonComplete,
  onPolygonPointAdd,
  onPinDrop
}: { 
  drawingMode: 'rectangle' | 'circle' | 'polygon' | 'pin' | null;
  onRectangleComplete: (bounds: LatLngBounds) => void;
  onCircleComplete: (center: LatLng, radius: number) => void;
  onPolygonComplete: (points: LatLng[]) => void;
  onPolygonPointAdd: (points: LatLng[]) => void;
  onPinDrop?: (latlng: LatLng) => void;
}) {
  const map = useMap();
  const [startPos, setStartPos] = useState<LatLng | null>(null);
  const [currentPos, setCurrentPos] = useState<LatLng | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<LatLng[]>([]);

  useMapEvents({
    mousedown(e) {
      if (drawingMode === 'pin' && onPinDrop) {
        onPinDrop(e.latlng);
        e.originalEvent.stopPropagation();
        return;
      }
      if (drawingMode === 'polygon') {
        const newPoints = [...polygonPoints, e.latlng];
        setPolygonPoints(newPoints);
        onPolygonPointAdd(newPoints);
        map.dragging.disable();
        map.doubleClickZoom.disable();
        e.originalEvent.stopPropagation();
      } else if ((drawingMode === 'rectangle' || drawingMode === 'circle') && !isDrawing) {
        setIsDrawing(true);
        setStartPos(e.latlng);
        setCurrentPos(e.latlng);
        map.dragging.disable();
        map.doubleClickZoom.disable();
      } else if (!drawingMode) {
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    },
    mousemove(e) {
      if (drawingMode === 'rectangle' && isDrawing && startPos) {
        setCurrentPos(e.latlng);
      } else if (drawingMode === 'circle' && isDrawing && startPos) {
        setCurrentPos(e.latlng);
      } else if (drawingMode === 'polygon' && polygonPoints.length > 0) {
        setCurrentPos(e.latlng);
      }
    },
    mouseup(e) {
      if ((drawingMode === 'rectangle' || drawingMode === 'circle') && isDrawing && startPos) {
        if (drawingMode === 'rectangle') {
          const bounds = new LatLngBounds([startPos, e.latlng]);
          onRectangleComplete(bounds);
        } else if (drawingMode === 'circle') {
          const radius = startPos.distanceTo(e.latlng);
          onCircleComplete(startPos, radius);
        }
        setIsDrawing(false);
        setStartPos(null);
        setCurrentPos(null);
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    },
    dblclick(e) {
      if (drawingMode === 'polygon' && polygonPoints.length >= 3) {
        const closedPoints = [...polygonPoints, polygonPoints[0]];
        onPolygonComplete(closedPoints);
        setPolygonPoints([]);
        setCurrentPos(null);
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    },
  });

  useEffect(() => {
    if (drawingMode !== 'polygon') {
      setPolygonPoints([]);
      setCurrentPos(null);
      onPolygonPointAdd([]);
    }
    if (!drawingMode || drawingMode === 'pin') {
      setTimeout(() => {
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }, 0);
    }
  }, [drawingMode, map, onPolygonPointAdd]);

  if (drawingMode === 'rectangle' && startPos && currentPos && isDrawing) {
    return <Rectangle bounds={new LatLngBounds([startPos, currentPos])} pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  if (drawingMode === 'circle' && startPos && currentPos && isDrawing) {
    const radius = startPos.distanceTo(currentPos);
    return <Circle center={startPos} radius={radius} pathOptions={{ color: '#EA4335', fillColor: '#EA4335', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  if (drawingMode === 'polygon' && polygonPoints.length > 0) {
    const previewPoints = currentPos ? [...polygonPoints, currentPos] : polygonPoints;
    return <Polygon positions={previewPoints} pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  return null;
}

function MapBoundsFitter({ bounds }: { bounds: LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds);
    }
  }, [bounds, map]);
  return null;
}

// Component to display property count within the drawn zone
function PropertyCountOverlay({
  available,
  total,
  center
}: {
  available: number;
  total: number;
  center: { lat: number; lng: number }
}) {
  const countIcon = useMemo(() => {
    return new DivIcon({
      html: `<div style="
        background: rgba(16, 185, 129, 0.95);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        white-space: nowrap;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
      ">${available}/${total}</div>`,
      className: '',
      iconSize: [60, 40],
      iconAnchor: [30, 20],
    });
  }, [available, total]);

  return (
    <Marker
      position={[center.lat, center.lng]}
      icon={countIcon}
    />
  );
}

export function AreaSelectorMap({ 
  isOpen, 
  onClose, 
  onOptimize,
  unavailablePropertyIds = new Set(),
  properties = [],
  initialCenter = { lat: 29.4241, lng: -98.4936 },
  initialZoom = 11,
  numVehicles = 1
}: AreaSelectorMapProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [drawingMode, setDrawingMode] = useState<'rectangle' | 'circle' | 'polygon' | 'pin' | null>(null);
  const [selectedShape, setSelectedShape] = useState<{ type: 'rectangle' | 'circle' | 'polygon'; bounds: LatLngBounds; center?: LatLng; radius?: number; polygon?: LatLng[] } | null>(null);
  const [drawnRectangle, setDrawnRectangle] = useState<LatLngBounds | null>(null);
  const [drawnCircle, setDrawnCircle] = useState<{ center: LatLng; radius: number } | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<LatLng[] | null>(null);
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null);
  const [closestProperty, setClosestProperty] = useState<PropertyLike | null>(null);
  const [isFindingClosest, setIsFindingClosest] = useState(false);
  const [polygonPointsBeingDrawn, setPolygonPointsBeingDrawn] = useState<LatLng[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<PropertyLike[]>([]);
  const [startingPointValidation, setStartingPointValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const [propertiesInZone, setPropertiesInZone] = useState<{ available: number; total: number }>({ available: 0, total: 0 });

  // Zone management state
  const [showZoneManager, setShowZoneManager] = useState(false);
  const [showSaveZoneDialog, setShowSaveZoneDialog] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [loadedZone, setLoadedZone] = useState<SavedZone | null>(null);
  const [allSavedZones, setAllSavedZones] = useState<SavedZone[]>([]);

  // Calculate property counts for all saved zones
  // Track both total properties and available properties (not in routes)
  const savedZoneCounts = useMemo(() => {
    const counts: Record<string, { total: number; available: number }> = {};

    console.log('=== Calculating Saved Zone Counts ===');
    console.log('Total properties to check:', properties.length);
    console.log('Unavailable property IDs:', unavailablePropertyIds.size);
    console.log('Number of saved zones:', allSavedZones.length);

    allSavedZones.forEach(zone => {
      let totalCount = 0;
      let availableCount = 0;
      let skippedNoCoords = 0;

      properties.forEach(p => {
        if (!p.latitude || !p.longitude) {
          skippedNoCoords++;
          return;
        }

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

      console.log(`Zone: ${zone.name}`);
      console.log(`  Type: ${zone.type}`);
      console.log(`  Total properties in zone: ${totalCount}`);
      console.log(`  Available properties: ${availableCount}`);
      console.log(`  Skipped (no coords): ${skippedNoCoords}`);
    });

    console.log('Final counts:', counts);
    console.log('=== End Zone Count Calculation ===');

    return counts;
  }, [allSavedZones, properties, unavailablePropertyIds]);

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setDrawingMode(null);
      setSelectedShape(null);
      setDrawnRectangle(null);
      setDrawnCircle(null);
      setDrawnPolygon(null);
      setPinLocation(null);
      setClosestProperty(null);
      setPolygonPointsBeingDrawn([]);
      setSelectedProperties([]);
      setStartingPointValidation(null);
      // Load all saved zones to display on map
      loadZones().then(setAllSavedZones).catch(error => {
        console.error('Failed to load zones:', error);
        setAllSavedZones([]);
      });
    }
  }, [isOpen]);

  // Calculate properties within the drawn area
  // IMPORTANT: This uses the 'properties' prop, which should be filteredProperties from the parent
  // This ensures we only count properties that match the current filters (e.g., 435 filtered properties)
  const calculatePropertiesInBounds = (shape: { type: 'rectangle' | 'circle' | 'polygon'; bounds: LatLngBounds; center?: LatLng; radius?: number; polygon?: LatLng[] }) => {
    // Count both total and available properties within the drawn area
    let totalCount = 0;
    let availableCount = 0;

    properties.forEach(p => {
      if (!p.latitude || !p.longitude) return;
      const point = { lat: p.latitude, lng: p.longitude };
      let isInZone = false;

      if (shape.type === 'polygon' && shape.polygon) {
        isInZone = isPointInPolygon(point, shape.polygon.map(p => ({ lat: p.lat, lng: p.lng })));
      } else if (shape.type === 'circle' && shape.center && shape.radius) {
        const radiusKm = shape.radius / 1000;
        isInZone = isPointInCircle(point, { lat: shape.center.lat, lng: shape.center.lng }, radiusKm);
      } else if (shape.type === 'rectangle') {
        const ne = shape.bounds.getNorthEast();
        const sw = shape.bounds.getSouthWest();
        isInZone = isPointInBounds(point, { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng });
      }

      if (isInZone) {
        totalCount++;
        // Count as available if not in unavailablePropertyIds (not already in a route)
        if (!p.id || !unavailablePropertyIds.has(p.id)) {
          availableCount++;
        }
      }
    });

    setPropertiesInZone({ available: availableCount, total: totalCount });
  };

  const handleRectangleComplete = (bounds: LatLngBounds) => {
    setDrawnRectangle(bounds);
    setDrawnCircle(null);
    setDrawnPolygon(null);
    const shape = { type: 'rectangle' as const, bounds };
    setSelectedShape(shape);
    calculatePropertiesInBounds(shape);
    setDrawingMode(null);
  };

  const handleCircleComplete = (center: LatLng, radius: number) => {
    setDrawnCircle({ center, radius });
    setDrawnRectangle(null);
    setDrawnPolygon(null);
    const radiusDegrees = radius / 111000;
    const bounds = new LatLngBounds(
      [center.lat - radiusDegrees, center.lng - radiusDegrees / Math.cos(center.lat * Math.PI / 180)],
      [center.lat + radiusDegrees, center.lng + radiusDegrees / Math.cos(center.lat * Math.PI / 180)]
    );
    const shape = { type: 'circle' as const, bounds, center, radius };
    setSelectedShape(shape);
    calculatePropertiesInBounds(shape);
    setDrawingMode(null);
  };

  const handlePolygonComplete = (points: LatLng[]) => {
    if (points.length < 3) return;
    const uniquePoints = points[0].equals(points[points.length - 1]) ? points.slice(0, -1) : points;
    const bounds = new LatLngBounds(uniquePoints);
    setDrawnPolygon(uniquePoints);
    setDrawnRectangle(null);
    setDrawnCircle(null);
    const shape = { type: 'polygon' as const, bounds, polygon: uniquePoints };
    setSelectedShape(shape);
    calculatePropertiesInBounds(shape);
    setDrawingMode(null);
  };

  const handlePolygonPointAdd = (points: LatLng[]) => {
    setPolygonPointsBeingDrawn(points);
  };

  const handleFinishPolygon = () => {
    if (polygonPointsBeingDrawn.length >= 3) {
      const closedPoints = [...polygonPointsBeingDrawn, polygonPointsBeingDrawn[0]];
      handlePolygonComplete(closedPoints);
      setPolygonPointsBeingDrawn([]);
    }
  };

  const handlePinDrop = (latlng: LatLng) => {
    setPinLocation(latlng);
    setIsFindingClosest(true);

    const validProperties = properties.filter(p => p.latitude != null && p.longitude != null);
    if (validProperties.length === 0) {
      setClosestProperty(null);
      setIsFindingClosest(false);
      return;
    }

    // Filter out unavailable properties (depots or in progress)
    const availableProperties = validProperties.filter(p => {
      if (!p.id) return false;
      return !unavailablePropertyIds.has(p.id);
    });

    if (availableProperties.length === 0) {
      setClosestProperty(null);
      setIsFindingClosest(false);
      return;
    }

    // Find the closest available property
    let closest: PropertyLike | null = null;
    let minDistance = Infinity;

    for (const property of availableProperties) {
      if (!property.latitude || !property.longitude) continue;
      const distance = calculateDistance(latlng.lat, latlng.lng, property.latitude, property.longitude);
      if (distance < minDistance) {
        minDistance = distance;
        closest = property;
      }
    }

    setClosestProperty(closest);
    setIsFindingClosest(false);
  };

  const handleNextStep = () => {
    if (step === 1) {
      // Validate area is drawn
      if (!selectedShape) {
        return;
      }
      setStep(2);
      setDrawingMode(null);
    } else if (step === 2) {
      // Validate starting point is selected and inside the area
      if (!closestProperty || !pinLocation || !selectedShape) {
        return;
      }

      const startingPoint = { lat: closestProperty.latitude, lng: closestProperty.longitude };
      let isInside = false;

      if (selectedShape.type === 'polygon' && selectedShape.polygon) {
        isInside = isPointInPolygon(startingPoint, selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })));
      } else if (selectedShape.type === 'circle' && selectedShape.center && selectedShape.radius) {
        const radiusKm = selectedShape.radius / 1000;
        isInside = isPointInCircle(startingPoint, { lat: selectedShape.center.lat, lng: selectedShape.center.lng }, radiusKm);
      } else if (selectedShape.type === 'rectangle') {
        const ne = selectedShape.bounds.getNorthEast();
        const sw = selectedShape.bounds.getSouthWest();
        isInside = isPointInBounds(startingPoint, { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng });
      }

      if (!isInside) {
        setStartingPointValidation({ valid: false, message: 'Starting point must be inside the drawn area. Please redraw the area.' });
        return;
      }

      // Calculate TOTAL properties in zone (for display on map)
      // IMPORTANT: 'properties' prop should be filteredProperties from parent, so we only count filtered properties
      // This ensures when you have 435 filtered properties, the map only considers those 435, not all properties
      // OPTIMIZATION: Use a more efficient approach - count first, then filter only what we need
      let totalCount = 0;
      let availableCount = 0;
      const propsInZoneForDisplay: PropertyLike[] = [];

      // First pass: Count and collect properties from the filtered set (limit collection to avoid memory issues)
      // This only considers properties that match current filters (e.g., 435 filtered properties)
      for (const p of properties) {
        if (!p.latitude || !p.longitude) continue;
        const point = { lat: p.latitude, lng: p.longitude };
        let isInZone = false;

        if (selectedShape.type === 'polygon' && selectedShape.polygon) {
          isInZone = isPointInPolygon(point, selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })));
        } else if (selectedShape.type === 'circle' && selectedShape.center && selectedShape.radius) {
          const radiusKm = selectedShape.radius / 1000;
          isInZone = isPointInCircle(point, { lat: selectedShape.center.lat, lng: selectedShape.center.lng }, radiusKm);
        } else if (selectedShape.type === 'rectangle') {
          const ne = selectedShape.bounds.getNorthEast();
          const sw = selectedShape.bounds.getSouthWest();
          isInZone = isPointInBounds(point, { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng });
        }

        if (isInZone) {
          totalCount++;

          // Count as available if not in unavailablePropertyIds (not already in a route)
          const isAvailable = !p.id || !unavailablePropertyIds.has(p.id);
          if (isAvailable) {
            availableCount++;
            // Only collect available properties for display (limit to avoid memory issues)
            if (propsInZoneForDisplay.length < 100) {
              propsInZoneForDisplay.push(p);
            }
          }
        }
      }

      // Store counts for display
      setPropertiesInZone({ available: availableCount, total: totalCount });

      // Warn user if area is too large
      if (totalCount > 1000) {
        toast({
          title: "Large Area Selected",
          description: `Found ${totalCount.toLocaleString()} properties in the area. Only the 24 closest properties will be used for route optimization. Consider selecting a smaller area for better results.`,
          variant: "default",
        });
      }

      // Filter properties within the area AND exclude visited/in-route properties (for route optimization)
      // OPTIMIZATION: Only process properties we collected (max 100), not all thousands
      // If we need more, we'll do a second pass with distance-based early termination
      let propsInArea: PropertyLike[];
      
      if (totalCount <= 100) {
        // Small area - use all collected properties
        propsInArea = propsInZoneForDisplay;
      } else {
        // Large area - do a second pass with early termination
        // We'll collect up to 50 closest properties, then sort and take top 24
        const candidateProps: Array<{ prop: PropertyLike; distance: number }> = [];
        const startingPoint = { lat: closestProperty.latitude!, lng: closestProperty.longitude! };
        
        for (const p of properties) {
          if (!p.latitude || !p.longitude) continue;
          if (p.id && unavailablePropertyIds.has(p.id)) continue;
          
          const point = { lat: p.latitude, lng: p.longitude };
          let isInZone = false;

          if (selectedShape.type === 'polygon' && selectedShape.polygon) {
            isInZone = isPointInPolygon(point, selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })));
          } else if (selectedShape.type === 'circle' && selectedShape.center && selectedShape.radius) {
            const radiusKm = selectedShape.radius / 1000;
            isInZone = isPointInCircle(point, { lat: selectedShape.center.lat, lng: selectedShape.center.lng }, radiusKm);
          } else if (selectedShape.type === 'rectangle') {
            const ne = selectedShape.bounds.getNorthEast();
            const sw = selectedShape.bounds.getSouthWest();
            isInZone = isPointInBounds(point, { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng });
          }

          if (isInZone) {
            const distance = calculateDistance(startingPoint.lat, startingPoint.lng, p.latitude!, p.longitude!);
            candidateProps.push({ prop: p, distance });
            
            // Early termination: if we have enough candidates, only keep the closest ones
            if (candidateProps.length > 50) {
              // Sort and keep only the 50 closest
              candidateProps.sort((a, b) => a.distance - b.distance);
              candidateProps.splice(50);
            }
          }
        }
        
        // Sort by distance and take top 24
        candidateProps.sort((a, b) => a.distance - b.distance);
        propsInArea = candidateProps.slice(0, 24).map(item => item.prop);
      }

      // Ensure starting point property is included
      const startingPointProp = propsInArea.find(p => p.id === closestProperty.id) || closestProperty;
      
      // Remove starting point from the list if it exists, we'll add it back first
      const propsWithoutStart = propsInArea.filter(p => p.id !== startingPointProp.id);
      
      // Sort remaining properties by distance from starting point (closest first)
      const startingPointCoords = { lat: closestProperty.latitude!, lng: closestProperty.longitude! };
      const sortedProps = propsWithoutStart.sort((a, b) => {
        const distA = calculateDistance(startingPointCoords.lat, startingPointCoords.lng, a.latitude!, a.longitude!);
        const distB = calculateDistance(startingPointCoords.lat, startingPointCoords.lng, b.latitude!, b.longitude!);
        return distA - distB;
      });
      
      // Limit to 24 properties to optimize (starting point/depot is excluded from optimization list)
      // Total selected: 1 depot (starting point) + 24 properties to visit = 25 total
      // After excluding depot from optimization list, we'll have exactly 24 properties to optimize
      const limitedProps = sortedProps.slice(0, 24);
      
      // Add starting point as the first property (will be excluded from optimization list later)
      const finalProps = [startingPointProp, ...limitedProps];

      setSelectedProperties(finalProps);
      const totalFound = totalCount; // Use the total count we calculated earlier (for display)
      const propertiesToOptimize = Math.min(24, propsInArea.length - (propsInArea.find(p => p.id === closestProperty.id) ? 1 : 0));
      const limitedMessage = totalFound > 25 
        ? `Found ${totalFound} properties in the area. Limiting to 24 properties for optimization (starting point is not a stop).`
        : totalFound > 1
        ? `Found ${totalFound} properties in the area. Will optimize ${propertiesToOptimize} properties (starting point is not a stop).`
        : `Found ${totalFound} property in the area. Starting point only - please select more properties.`;
      setStartingPointValidation({ valid: true, message: limitedMessage });
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handleBackStep = () => {
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3 | 4);
      if (step === 2) {
        setStartingPointValidation(null);
      }
    }
  };

  const handleLoadZone = (zone: SavedZone) => {
    setLoadedZone(zone);

    // Convert zone geometry to map shapes
    const bounds = new LatLngBounds(
      [zone.bounds.south, zone.bounds.west],
      [zone.bounds.north, zone.bounds.east]
    );

    let shape: { type: 'rectangle' | 'circle' | 'polygon'; bounds: LatLngBounds; center?: LatLng; radius?: number; polygon?: LatLng[] };

    if (zone.type === 'rectangle') {
      setDrawnRectangle(bounds);
      setDrawnCircle(null);
      setDrawnPolygon(null);
      shape = { type: 'rectangle', bounds };
      setSelectedShape(shape);
    } else if (zone.type === 'circle' && zone.center && zone.radius) {
      const center = new LatLng(zone.center.lat, zone.center.lng);
      setDrawnCircle({ center, radius: zone.radius });
      setDrawnRectangle(null);
      setDrawnPolygon(null);
      shape = { type: 'circle', bounds, center, radius: zone.radius };
      setSelectedShape(shape);
    } else if (zone.type === 'polygon' && zone.polygon) {
      const polygon = zone.polygon.map(p => new LatLng(p.lat, p.lng));
      setDrawnPolygon(polygon);
      setDrawnRectangle(null);
      setDrawnCircle(null);
      shape = { type: 'polygon', bounds, polygon };
      setSelectedShape(shape);
    } else {
      return;
    }

    // Calculate property count for the loaded zone
    calculatePropertiesInBounds(shape);

    toast({
      title: 'Zone Loaded',
      description: `Loaded "${zone.name}" zone`,
    });
  };

  const handleSaveCurrentZone = () => {
    if (!selectedShape) {
      toast({
        title: 'No Area Drawn',
        description: 'Please draw an area before saving',
        variant: 'destructive',
      });
      return;
    }

    setShowSaveZoneDialog(true);
  };

  const handleConfirmSaveZone = async () => {
    if (!selectedShape || !zoneName.trim()) {
      toast({
        title: 'Invalid Zone',
        description: 'Please provide a zone name',
        variant: 'destructive',
      });
      return;
    }

    try {
      const existingZones = await loadZones();
      const color = getNextColor(existingZones);

      const bounds = selectedShape.bounds;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const newZone = await saveZone({
        name: zoneName.trim(),
        description: zoneDescription.trim() || undefined,
        type: selectedShape.type,
        color,
        bounds: {
          north: ne.lat,
          south: sw.lat,
          east: ne.lng,
          west: sw.lng,
        },
        center: selectedShape.center ? { lat: selectedShape.center.lat, lng: selectedShape.center.lng } : undefined,
        radius: selectedShape.radius,
        polygon: selectedShape.polygon ? selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })) : undefined,
      });

      toast({
        title: 'Zone Saved',
        description: `Saved "${newZone.name}" for future use`,
      });

      setShowSaveZoneDialog(false);
      setZoneName('');
      setZoneDescription('');
      setLoadedZone(newZone);

      // Reload all zones to update the displayed zones on the map
      const updatedZones = await loadZones();
      setAllSavedZones(updatedZones);
    } catch (error) {
      console.error('Failed to save zone:', error);
      toast({
        title: 'Error',
        description: 'Failed to save zone. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleOptimize = () => {
    if (!closestProperty || !pinLocation || !selectedShape) return;

    const bounds = selectedShape.bounds;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const area = {
      north: ne.lat,
      south: sw.lat,
      east: ne.lng,
      west: sw.lng,
      center: selectedShape.center ? { lat: selectedShape.center.lat, lng: selectedShape.center.lng } : {
        lat: (ne.lat + sw.lat) / 2,
        lng: (ne.lng + sw.lng) / 2
      },
      radius: selectedShape.radius ? selectedShape.radius / 1000 : undefined,
      polygon: selectedShape.polygon ? selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })) : undefined
    };

    // CRITICAL: Ensure selectedProperties is limited to 25 (depot + 24 properties to optimize)
    // After excluding depot, this gives us 24 properties for optimization
    // This is a safety check in case the state was somehow modified
    let finalSelectedProperties = selectedProperties;
    if (finalSelectedProperties.length > 25) {
      console.warn('[AreaSelectorMap] WARNING: selectedProperties has more than 25 properties. Limiting now.');
      // Find and keep depot first
      const depotIndex = finalSelectedProperties.findIndex(p => p.id === closestProperty.id);
      const depot = depotIndex >= 0 ? finalSelectedProperties[depotIndex] : closestProperty;
      const others = finalSelectedProperties.filter(p => p.id !== closestProperty.id).slice(0, 24);
      finalSelectedProperties = [depot, ...others];
      console.log('[AreaSelectorMap] Limited to:', finalSelectedProperties.length, 'properties (1 depot + 24 to optimize)');
    }

    console.log('[AreaSelectorMap] handleOptimize called with:', {
      selectedPropertiesCount: finalSelectedProperties.length,
      areaType: area.polygon ? 'polygon' : area.radius !== undefined ? 'circle' : 'rectangle',
      depotId: closestProperty.id
    });

    onOptimize({
      startingPoint: {
        property: closestProperty,
        pinLocation: { lat: pinLocation.lat, lng: pinLocation.lng }
      },
      area,
      selectedProperties: finalSelectedProperties
    });

    onClose();
  };

  if (!isOpen) return null;

  const getStepTitle = () => {
    // Step 1: Draw Area (user draws area first)
    // Step 2: Select Starting Point (user drops pin within the drawn area)
    switch (step) {
      case 1: return 'Step 1: Draw Area';
      case 2: return 'Step 2: Select Starting Point';
      case 3: return 'Step 3: Preview Results';
      case 4: return 'Step 4: Optimize Routes';
      default: return 'Route Optimization Wizard';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-3xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] !flex !flex-col overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>
            {step === 1 && 'Draw a polygon, rectangle, or circle around the area, or load a saved zone.'}
            {step === 2 && 'Drop a pin on the map to set the starting point for your route. The starting point must be inside the drawn area.'}
            {step === 3 && 'Review the selected properties before optimizing the route.'}
            {step === 4 && 'Confirm and optimize your route.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full border-2",
                step >= s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-muted"
              )}>
                {s}
              </div>
              {s < 4 && (
                <div className={cn(
                  "flex-1 h-1 mx-2",
                  step > s ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="!flex !flex-col gap-4 flex-1 min-h-0">
          {/* Controls Section - Top (Drop Pin button) */}
          <div className="flex-shrink-0 w-full">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Draw a shape around the area, or load a saved zone. The starting point must be inside this area.
                  </div>
                  {loadedZone && (
                    <div className="text-xs p-2 bg-primary/10 rounded border border-primary/20">
                      <div className="font-medium text-primary">Using saved zone: {loadedZone.name}</div>
                      {loadedZone.description && (
                        <div className="text-muted-foreground mt-1">{loadedZone.description}</div>
                      )}
                    </div>
                  )}
                  
                  {/* Zone management buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 justify-start"
                      onClick={() => setShowZoneManager(true)}
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Load Saved Zone
                    </Button>
                    {selectedShape && (
                      <Button
                        variant="outline"
                        className="flex-1 justify-start"
                        onClick={handleSaveCurrentZone}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Zone
                      </Button>
                    )}
                  </div>

                  {!loadedZone && (
                    <div className="border-t pt-4">
                      <div className="text-xs text-muted-foreground mb-2">Or draw a custom area:</div>
                    </div>
                  )}

                  <Button
                    variant={drawingMode === 'rectangle' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      setDrawingMode('rectangle');
                      setSelectedShape(null);
                      setDrawnRectangle(null);
                      setDrawnCircle(null);
                      setDrawnPolygon(null);
                      setPolygonPointsBeingDrawn([]);
                    }}
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Draw Rectangle
                  </Button>
                  <Button
                    variant={drawingMode === 'circle' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      setDrawingMode('circle');
                      setSelectedShape(null);
                      setDrawnRectangle(null);
                      setDrawnCircle(null);
                      setDrawnPolygon(null);
                      setPolygonPointsBeingDrawn([]);
                    }}
                  >
                    <CircleIcon className="h-4 w-4 mr-2" />
                    Draw Circle
                  </Button>
                  <Button
                    variant={drawingMode === 'polygon' ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={() => {
                      setDrawingMode('polygon');
                      setSelectedShape(null);
                      setDrawnRectangle(null);
                      setDrawnCircle(null);
                      setDrawnPolygon(null);
                      setPolygonPointsBeingDrawn([]);
                    }}
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Custom Drawing
                  </Button>
                  {drawingMode === 'polygon' && (
                    <div className="pt-2 text-xs text-muted-foreground">
                      Click on the map to add points. Double-click or click "Finish" to complete.
                    </div>
                  )}
                  {drawingMode === 'polygon' && polygonPointsBeingDrawn.length >= 3 && (
                    <Button
                      variant="secondary"
                      className="w-full mt-2"
                      onClick={handleFinishPolygon}
                    >
                      Finish Polygon ({polygonPointsBeingDrawn.length} points)
                    </Button>
                  )}
                  {selectedShape && (
                    <div className="text-xs text-green-600 p-2 bg-green-500/10 rounded">
                      Area drawn successfully!
                    </div>
                  )}
                  {/* Map Legend */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-full bg-[#10B981]" />
                      Available
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-full bg-[#F59E0B]" />
                      Visited
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-full bg-[#EF4444]" />
                      In Route
                    </div>
                  </div>
                </div>
              )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Click on the map to drop a pin. The route will start from the closest property to your pin location.
                </div>
                {startingPointValidation && !startingPointValidation.valid && (
                  <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
                    {startingPointValidation.message}
                  </div>
                )}
                {startingPointValidation && startingPointValidation.valid && (
                  <div className="text-xs text-green-600 p-2 bg-green-500/10 rounded">
                    {startingPointValidation.message}
                  </div>
                )}
                <Button
                  variant={drawingMode === 'pin' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => setDrawingMode('pin')}
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Drop Pin
                </Button>
                {pinLocation && (
                  <>
                    <div className="text-xs space-y-1 p-2 bg-muted rounded">
                      <div><strong>Pin Location:</strong></div>
                      <div className="text-muted-foreground">
                        Lat: {pinLocation.lat.toFixed(6)}<br/>
                        Lng: {pinLocation.lng.toFixed(6)}
                      </div>
                    </div>
                    {isFindingClosest ? (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="ml-2 text-xs">Finding closest...</span>
                      </div>
                    ) : closestProperty ? (
                      <div className="text-xs space-y-1 p-2 bg-muted rounded">
                        <div><strong>Closest Property:</strong></div>
                        <div className="text-muted-foreground">
                          {closestProperty.propertyAddress || closestProperty.address || 'N/A'}<br/>
                          {closestProperty.accountNumber && <span>Account: {closestProperty.accountNumber}</span>}
                          <div className="mt-1">
                            Distance: {calculateDistance(
                              pinLocation.lat,
                              pinLocation.lng,
                              closestProperty.latitude,
                              closestProperty.longitude
                            ).toFixed(2)} km
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground p-2 bg-destructive/10 rounded">
                        No properties with valid coordinates found.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

              {step === 3 && (
                <div className="space-y-4">
                <div className="text-sm font-medium">
                  Selected Properties: {selectedProperties.length} / 25
                </div>
                <div className="text-xs text-muted-foreground">
                  Starting Point: {closestProperty?.propertyAddress || closestProperty?.address || 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedProperties.length === 24 ? 'Maximum of 24 properties selected (closest to starting point)' : 'All properties within area will be optimized'}
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {selectedProperties.map((p) => (
                    <div key={p.id} className="text-xs p-2 bg-muted rounded">
                      {p.propertyAddress || p.address || 'N/A'}
                      {p.id === closestProperty?.id && (
                        <span className="ml-2 text-primary font-medium">(Starting Point)</span>
                      )}
                    </div>
                  ))}
                </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                <div className="text-sm font-medium">
                  Ready to Optimize
                </div>
                <div className="text-xs space-y-2">
                  <div>
                    <strong>Starting Point:</strong><br/>
                    {closestProperty?.propertyAddress || closestProperty?.address || 'N/A'}
                  </div>
                  <div>
                    <strong>Properties in Route:</strong> {selectedProperties.length}
                  </div>
                  <div>
                    <strong>Vehicles:</strong> {numVehicles}
                  </div>
                </div>
                </div>
              )}
          </div>

          {/* Map - DIRECTLY BELOW Drop Pin button - FULL WIDTH */}
          <div className="relative w-full flex-shrink-0" style={{ minHeight: '300px', height: '40vh', maxHeight: '400px' }}>
              <MapContainer
                center={[initialCenter.lat, initialCenter.lng]}
                zoom={initialZoom}
                style={{ height: '100%', width: '100%', touchAction: 'manipulation' }}
                className="rounded-lg z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ShapeDrawer
                  drawingMode={step === 1 ? drawingMode : (step === 2 ? (drawingMode === 'pin' ? 'pin' : null) : null)}
                  onRectangleComplete={handleRectangleComplete}
                  onCircleComplete={handleCircleComplete}
                  onPolygonComplete={handlePolygonComplete}
                  onPolygonPointAdd={handlePolygonPointAdd}
                  onPinDrop={step === 2 ? handlePinDrop : undefined}
                />
                {drawnRectangle && (
                  <Rectangle bounds={drawnRectangle} pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.2, weight: 2 }} />
                )}
                {drawnCircle && (
                  <Circle center={drawnCircle.center} radius={drawnCircle.radius} pathOptions={{ color: '#EA4335', fillColor: '#EA4335', fillOpacity: 0.2, weight: 2 }} />
                )}
                {drawnPolygon && drawnPolygon.length >= 3 && (
                  <Polygon positions={[...drawnPolygon, drawnPolygon[0]]} pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 0.2, weight: 2 }} />
                )}

                {/* Display all properties as small dots on Step 1 (skip if >10k for performance) */}
                {step === 1 && properties.length <= 10000 && properties.map((p) => {
                  if (!p.latitude || !p.longitude) return null;
                  const isVisited = p.visited === true;
                  const isInRoute = p.id ? unavailablePropertyIds.has(p.id) && !isVisited : false;
                  const color = isVisited ? '#F59E0B' : isInRoute ? '#EF4444' : '#10B981';
                  const label = isVisited ? 'Visited' : isInRoute ? 'In Route' : 'Available';
                  return (
                    <CircleMarker
                      key={`prop-${p.id}`}
                      center={[p.latitude, p.longitude]}
                      radius={5}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: 0.7,
                        weight: 1,
                      }}
                    >
                      <Popup>
                        <div style={{ padding: '2px', fontSize: '12px' }}>
                          <strong>{p.propertyAddress || p.address || 'N/A'}</strong>
                          <div style={{ color }}>{label}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}

                {/* Display all saved zones as background overlays */}
                {step === 1 && allSavedZones.map((zone) => {
                  const isLoadedZone = loadedZone?.id === zone.id;
                  const opacity = isLoadedZone ? 0 : 0.15; // Hide loaded zone, show others faintly
                  const weight = 1;

                  if (zone.type === 'rectangle') {
                    const bounds = new LatLngBounds(
                      [zone.bounds.south, zone.bounds.west],
                      [zone.bounds.north, zone.bounds.east]
                    );
                    return (
                      <Rectangle
                        key={`saved-${zone.id}`}
                        bounds={bounds}
                        pathOptions={{
                          color: zone.color,
                          fillColor: zone.color,
                          fillOpacity: opacity,
                          weight: weight,
                          dashArray: '5, 5'
                        }}
                      />
                    );
                  } else if (zone.type === 'circle' && zone.center && zone.radius) {
                    return (
                      <Circle
                        key={`saved-${zone.id}`}
                        center={[zone.center.lat, zone.center.lng]}
                        radius={zone.radius}
                        pathOptions={{
                          color: zone.color,
                          fillColor: zone.color,
                          fillOpacity: opacity,
                          weight: weight,
                          dashArray: '5, 5'
                        }}
                      />
                    );
                  } else if (zone.type === 'polygon' && zone.polygon) {
                    return (
                      <Polygon
                        key={`saved-${zone.id}`}
                        positions={zone.polygon.map(p => [p.lat, p.lng])}
                        pathOptions={{
                          color: zone.color,
                          fillColor: zone.color,
                          fillOpacity: opacity,
                          weight: weight,
                          dashArray: '5, 5'
                        }}
                      />
                    );
                  }
                  return null;
                })}

                {/* Display property counts for saved zones */}
                {step === 1 && allSavedZones.map((zone) => {
                  const isLoadedZone = loadedZone?.id === zone.id;
                  if (isLoadedZone) return null; // Don't show count for loaded zone

                  const counts = savedZoneCounts[zone.id] || { total: 0, available: 0 };
                  let center: { lat: number; lng: number } | null = null;

                  if (zone.type === 'polygon' && zone.polygon && zone.polygon.length > 0) {
                    // Calculate centroid of polygon
                    const sumLat = zone.polygon.reduce((sum, p) => sum + p.lat, 0);
                    const sumLng = zone.polygon.reduce((sum, p) => sum + p.lng, 0);
                    center = {
                      lat: sumLat / zone.polygon.length,
                      lng: sumLng / zone.polygon.length
                    };
                  } else if (zone.type === 'circle' && zone.center) {
                    center = { lat: zone.center.lat, lng: zone.center.lng };
                  } else if (zone.type === 'rectangle') {
                    center = {
                      lat: (zone.bounds.north + zone.bounds.south) / 2,
                      lng: (zone.bounds.east + zone.bounds.west) / 2
                    };
                  }

                  if (!center) return null;

                  const countIcon = new DivIcon({
                    html: `<div style="
                      background: ${zone.color};
                      color: white;
                      padding: 6px 12px;
                      border-radius: 16px;
                      font-weight: bold;
                      font-size: 14px;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                      white-space: nowrap;
                      border: 2px solid white;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                    ">${counts.available}/${counts.total}</div>`,
                    className: '',
                    iconSize: [50, 32],
                    iconAnchor: [25, 16]
                  });

                  return (
                    <Marker
                      key={`count-${zone.id}`}
                      position={[center.lat, center.lng]}
                      icon={countIcon}
                    />
                  );
                })}

                {/* Property count overlay */}
                {selectedShape && propertiesInZone.total > 0 && (() => {
                  const center = selectedShape.center
                    ? { lat: selectedShape.center.lat, lng: selectedShape.center.lng }
                    : {
                        lat: (selectedShape.bounds.getNorthEast().lat + selectedShape.bounds.getSouthWest().lat) / 2,
                        lng: (selectedShape.bounds.getNorthEast().lng + selectedShape.bounds.getSouthWest().lng) / 2
                      };
                  return <PropertyCountOverlay available={propertiesInZone.available} total={propertiesInZone.total} center={center} />;
                })()}
                {pinLocation && (
                  <Marker
                    position={[pinLocation.lat, pinLocation.lng]}
                    icon={L.icon({
                      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                      iconSize: [25, 41],
                      iconAnchor: [12, 41],
                    })}
                  >
                    <Popup>
                      <div style={{ padding: '4px' }}>
                        <strong>Starting Point</strong><br/>
                        {closestProperty ? `Closest: ${closestProperty.propertyAddress || closestProperty.address || 'N/A'}` : 'Finding closest property...'}
                      </div>
                    </Popup>
                  </Marker>
                )}
                {closestProperty && pinLocation && (
                  <Marker
                    position={[closestProperty.latitude, closestProperty.longitude]}
                    icon={L.icon({
                      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                      iconSize: [25, 41],
                      iconAnchor: [12, 41],
                    })}
                  >
                    <Popup>
                      <div style={{ padding: '4px' }}>
                        <strong>Starting Property</strong><br/>
                        {closestProperty.propertyAddress || closestProperty.address || 'N/A'}<br/>
                        {closestProperty.accountNumber && <small>{closestProperty.accountNumber}</small>}
                      </div>
                    </Popup>
                  </Marker>
                )}
                {selectedShape && <MapBoundsFitter bounds={selectedShape.bounds} />}
              </MapContainer>
          </div>

          {/* Navigation buttons - below map */}
          <div className="flex-shrink-0 space-y-2 pb-4">
              <div className="flex gap-2">
                {step > 1 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleBackStep}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                )}
                {step < 4 && (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleNextStep}
                    disabled={
                      (step === 1 && !selectedShape) ||
                      (step === 2 && (!closestProperty || !pinLocation)) ||
                      (step === 3 && selectedProperties.length === 0)
                    }
                  >
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
                {step === 4 && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={handleOptimize}
                  >
                    <Route className="h-4 w-4 mr-2" />
                    Optimize Route
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={onClose}
              >
                Cancel
              </Button>
          </div>
        </div>
      </DialogContent>

      {/* Zone Manager Dialog */}
      <ZoneManager
        isOpen={showZoneManager}
        onClose={() => setShowZoneManager(false)}
        onSelectZone={handleLoadZone}
        properties={properties}
        unavailablePropertyIds={unavailablePropertyIds}
      />

      {/* Save Zone Dialog */}
      <Dialog open={showSaveZoneDialog} onOpenChange={setShowSaveZoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Service Zone</DialogTitle>
            <DialogDescription>
              Save this area as a reusable zone for future route optimization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zoneName">Zone Name *</Label>
              <Input
                id="zoneName"
                placeholder="e.g., North Zone, Downtown Area"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="zoneDescription">Description (Optional)</Label>
              <Input
                id="zoneDescription"
                placeholder="e.g., Covers residential areas in north sector"
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowSaveZoneDialog(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleConfirmSaveZone} disabled={!zoneName.trim()}>
                <Save className="h-4 w-4 mr-2" />
                Save Zone
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
