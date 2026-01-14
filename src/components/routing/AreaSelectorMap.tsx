/**
 * Area Selector Map Component using Leaflet - Wizard Version
 * Step-by-step wizard: 1. Starting Point -> 2. Draw Area -> 3. Preview -> 4. Optimize
 */

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, Rectangle, Circle, Polygon, useMapEvents } from 'react-leaflet';
import { LatLngBounds, LatLng } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Square, Circle as CircleIcon, Check, X, PenTool, MapPin, ArrowRight, ArrowLeft, List, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Marker, Popup } from 'react-leaflet';
import { cn } from '@/lib/utils';

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
    }
  }, [isOpen]);

  const handleRectangleComplete = (bounds: LatLngBounds) => {
    setDrawnRectangle(bounds);
    setDrawnCircle(null);
    setDrawnPolygon(null);
    setSelectedShape({ type: 'rectangle', bounds });
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
    setSelectedShape({ type: 'circle', bounds, center, radius });
    setDrawingMode(null);
  };

  const handlePolygonComplete = (points: LatLng[]) => {
    if (points.length < 3) return;
    const uniquePoints = points[0].equals(points[points.length - 1]) ? points.slice(0, -1) : points;
    const bounds = new LatLngBounds(uniquePoints);
    setDrawnPolygon(uniquePoints);
    setDrawnRectangle(null);
    setDrawnCircle(null);
    setSelectedShape({ type: 'polygon', bounds, polygon: uniquePoints });
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
      // Validate starting point is selected
      if (!closestProperty || !pinLocation) {
        return;
      }
      setStep(2);
      setDrawingMode(null);
    } else if (step === 2) {
      // Validate area is drawn and starting point is inside
      if (!selectedShape || !closestProperty || !pinLocation) {
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

      // Filter properties within the area
      const propsInArea = properties.filter(p => {
        if (!p.latitude || !p.longitude) return false;
        const point = { lat: p.latitude, lng: p.longitude };

        if (selectedShape.type === 'polygon' && selectedShape.polygon) {
          return isPointInPolygon(point, selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })));
        } else if (selectedShape.type === 'circle' && selectedShape.center && selectedShape.radius) {
          const radiusKm = selectedShape.radius / 1000;
          return isPointInCircle(point, { lat: selectedShape.center.lat, lng: selectedShape.center.lng }, radiusKm);
        } else if (selectedShape.type === 'rectangle') {
          const ne = selectedShape.bounds.getNorthEast();
          const sw = selectedShape.bounds.getSouthWest();
          return isPointInBounds(point, { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng });
        }
        return false;
      });

      // Ensure starting point property is included
      const startingPointProp = propsInArea.find(p => p.id === closestProperty.id) || closestProperty;
      
      // Remove starting point from the list if it exists, we'll add it back first
      const propsWithoutStart = propsInArea.filter(p => p.id !== startingPointProp.id);
      
      // Sort remaining properties by distance from starting point (closest first)
      // Use the existing startingPoint variable defined earlier
      const sortedProps = propsWithoutStart.sort((a, b) => {
        const distA = calculateDistance(startingPoint.lat, startingPoint.lng, a.latitude!, a.longitude!);
        const distB = calculateDistance(startingPoint.lat, startingPoint.lng, b.latitude!, b.longitude!);
        return distA - distB;
      });
      
      // Limit to 24 properties to optimize (starting point/depot is excluded from optimization list)
      // Total selected: 1 depot (starting point) + 24 properties to visit = 25 total
      // After excluding depot from optimization list, we'll have exactly 24 properties to optimize
      const limitedProps = sortedProps.slice(0, 24);
      
      // Add starting point as the first property (will be excluded from optimization list later)
      const finalProps = [startingPointProp, ...limitedProps];

      setSelectedProperties(finalProps);
      const totalFound = propsInArea.length;
      const propertiesToOptimize = Math.min(24, totalFound - (propsInArea.find(p => p.id === closestProperty.id) ? 1 : 0));
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
    switch (step) {
      case 1: return 'Step 1: Select Starting Point';
      case 2: return 'Step 2: Draw Area';
      case 3: return 'Step 3: Preview Results';
      case 4: return 'Step 4: Optimize Routes';
      default: return 'Route Optimization Wizard';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>
            {step === 1 && 'Drop a pin on the map to set the starting point for your route.'}
            {step === 2 && 'Draw a polygon, rectangle, or circle around the area. The starting point must be inside this area.'}
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

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Controls Sidebar - Left side */}
          <div className="w-80 flex flex-col gap-4">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Click on the map to drop a pin. The route will start from the closest property to your pin location.
                  </div>
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

            {step === 2 && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Draw a shape around the area. The starting point must be inside the drawn area.
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

            {/* Navigation buttons */}
            <div className="mt-auto space-y-2">
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
                      (step === 1 && (!closestProperty || !pinLocation)) ||
                      (step === 2 && !selectedShape) ||
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

          {/* Map - Right side */}
          <div className="flex-1 relative min-h-0">
            <MapContainer
              center={[initialCenter.lat, initialCenter.lng]}
              zoom={initialZoom}
              style={{ height: '100%', width: '100%' }}
              className="rounded-lg z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ShapeDrawer
                drawingMode={step === 1 ? (drawingMode === 'pin' ? 'pin' : null) : (step === 2 ? drawingMode : null)}
                onRectangleComplete={handleRectangleComplete}
                onCircleComplete={handleCircleComplete}
                onPolygonComplete={handlePolygonComplete}
                onPolygonPointAdd={handlePolygonPointAdd}
                onPinDrop={step === 1 ? handlePinDrop : undefined}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
