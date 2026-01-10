/**
 * Area Selector Map Component using Leaflet
 * Allows user to draw a circle or rectangle on the map to select a geographic area
 * Then filters properties within that area for route optimization
 */

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, Rectangle, Circle, Polygon, useMapEvents } from 'react-leaflet';
import { LatLngBounds, LatLng } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Loader2, Square, Circle as CircleIcon, Check, X, PenTool, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Marker, Popup } from 'react-leaflet';

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
  onAreaSelected: (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
    center?: { lat: number; lng: number };
    radius?: number; // For circle
    polygon?: LatLng[]; // For custom polygon
  }) => void;
  onStartingPointSelected?: (property: PropertyLike, pinLocation: { lat: number; lng: number }) => void;
  properties?: PropertyLike[];
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
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

// Component to handle drawing (rectangle, circle, and polygon)
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
        // Add point to polygon
        const newPoints = [...polygonPoints, e.latlng];
        setPolygonPoints(newPoints);
        onPolygonPointAdd(newPoints);
        // Prevent map panning while drawing polygon
        map.dragging.disable();
        map.doubleClickZoom.disable();
        e.originalEvent.stopPropagation();
      } else if (drawingMode && !isDrawing) {
        setIsDrawing(true);
        setStartPos(e.latlng);
        setCurrentPos(e.latlng);
        // Prevent map panning while drawing
        map.dragging.disable();
        map.doubleClickZoom.disable();
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
        // Re-enable map interactions
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    },
    dblclick(e) {
      // Double-click to finish polygon
      if (drawingMode === 'polygon' && polygonPoints.length >= 3) {
        // Close the polygon by adding the first point again
        const closedPoints = [...polygonPoints, polygonPoints[0]];
        onPolygonComplete(closedPoints);
        setPolygonPoints([]);
        setCurrentPos(null);
        // Re-enable map interactions
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    },
  });

  // Reset polygon when mode changes
  useEffect(() => {
    if (drawingMode !== 'polygon') {
      setPolygonPoints([]);
      setCurrentPos(null);
      onPolygonPointAdd([]);
      map.dragging.enable();
      map.doubleClickZoom.enable();
    }
  }, [drawingMode, map, onPolygonPointAdd]);

  // Render preview shape while drawing
  if (drawingMode === 'rectangle' && startPos && currentPos && isDrawing) {
    return <Rectangle bounds={new LatLngBounds([startPos, currentPos])} pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  if (drawingMode === 'circle' && startPos && currentPos && isDrawing) {
    const radius = startPos.distanceTo(currentPos);
    return <Circle center={startPos} radius={radius} pathOptions={{ color: '#EA4335', fillColor: '#EA4335', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  // Render polygon preview
  if (drawingMode === 'polygon' && polygonPoints.length > 0) {
    const previewPoints = currentPos ? [...polygonPoints, currentPos] : polygonPoints;
    return <Polygon positions={previewPoints} pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  return null;
}

// Component to fit map bounds
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
  onAreaSelected,
  onStartingPointSelected,
  properties = [],
  initialCenter = { lat: 29.4241, lng: -98.4936 }, // San Antonio default
  initialZoom = 11
}: AreaSelectorMapProps) {
  const [drawingMode, setDrawingMode] = useState<'rectangle' | 'circle' | 'polygon' | 'pin' | null>(null);
  const [selectedShape, setSelectedShape] = useState<{ type: 'rectangle' | 'circle' | 'polygon'; bounds: LatLngBounds; center?: LatLng; radius?: number; polygon?: LatLng[] } | null>(null);
  const [drawnRectangle, setDrawnRectangle] = useState<LatLngBounds | null>(null);
  const [drawnCircle, setDrawnCircle] = useState<{ center: LatLng; radius: number } | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<LatLng[] | null>(null);
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null);
  const [closestProperty, setClosestProperty] = useState<PropertyLike | null>(null);
  const [isFindingClosest, setIsFindingClosest] = useState(false);

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
    // For circle, create bounds from center and radius
    const radiusDegrees = radius / 111000; // Approximate conversion: 1 degree ≈ 111 km
    const bounds = new LatLngBounds(
      [center.lat - radiusDegrees, center.lng - radiusDegrees / Math.cos(center.lat * Math.PI / 180)],
      [center.lat + radiusDegrees, center.lng + radiusDegrees / Math.cos(center.lat * Math.PI / 180)]
    );
    setSelectedShape({ type: 'circle', bounds, center, radius });
    setDrawingMode(null);
  };

  const handlePolygonComplete = (points: LatLng[]) => {
    // Calculate bounds from polygon points
    if (points.length < 3) return;
    
    // Remove the duplicate closing point if present
    const uniquePoints = points[0].equals(points[points.length - 1]) 
      ? points.slice(0, -1) 
      : points;
    
    const bounds = new LatLngBounds(uniquePoints);
    setDrawnPolygon(uniquePoints);
    setDrawnRectangle(null);
    setDrawnCircle(null);
    setSelectedShape({ type: 'polygon', bounds, polygon: uniquePoints });
    setDrawingMode(null);
  };

  const handleClearSelection = () => {
    setSelectedShape(null);
    setDrawingMode(null);
    setDrawnRectangle(null);
    setDrawnCircle(null);
    setDrawnPolygon(null);
    setPolygonPointsBeingDrawn([]);
  };

  const handleDone = () => {
    if (!selectedShape) return;

    const bounds = selectedShape.bounds;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const result = {
      north: ne.lat,
      south: sw.lat,
      east: ne.lng,
      west: sw.lng,
      center: selectedShape.center ? { lat: selectedShape.center.lat, lng: selectedShape.center.lng } : {
        lat: (ne.lat + sw.lat) / 2,
        lng: (ne.lng + sw.lng) / 2
      },
      radius: selectedShape.radius ? selectedShape.radius / 1000 : undefined, // Convert to km
      polygon: selectedShape.polygon ? selectedShape.polygon.map(p => ({ lat: p.lat, lng: p.lng })) : undefined
    };

    onAreaSelected(result);
    onClose();
  };

  // Track polygon points being drawn (for showing finish button)
  const [polygonPointsBeingDrawn, setPolygonPointsBeingDrawn] = useState<LatLng[]>([]);

  const handlePolygonPointAdd = (points: LatLng[]) => {
    setPolygonPointsBeingDrawn(points);
  };

  const handleFinishPolygon = () => {
    // Manual finish button for polygon (alternative to double-click)
    if (polygonPointsBeingDrawn.length >= 3) {
      const closedPoints = [...polygonPointsBeingDrawn, polygonPointsBeingDrawn[0]];
      handlePolygonComplete(closedPoints);
      setPolygonPointsBeingDrawn([]);
    }
  };

  const handlePinDrop = (latlng: LatLng) => {
    setPinLocation(latlng);
    setIsFindingClosest(true);

    // Find the closest property to the pin location
    const validProperties = properties.filter(p => 
      p.latitude != null && 
      p.longitude != null
    );

    if (validProperties.length === 0) {
      setClosestProperty(null);
      setIsFindingClosest(false);
      return;
    }

    let closest: PropertyLike | null = null;
    let minDistance = Infinity;

    for (const property of validProperties) {
      if (!property.latitude || !property.longitude) continue;

      const distance = calculateDistance(
        latlng.lat,
        latlng.lng,
        property.latitude,
        property.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        closest = property;
      }
    }

    setClosestProperty(closest);
    setIsFindingClosest(false);
  };

  const handleConfirmStartingPoint = () => {
    if (!closestProperty || !pinLocation || !onStartingPointSelected) return;
    onStartingPointSelected(closestProperty, { lat: pinLocation.lat, lng: pinLocation.lng });
    setPinLocation(null);
    setClosestProperty(null);
    setDrawingMode(null);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Area for Route Optimization</DialogTitle>
          <DialogDescription>
            Draw a rectangle or circle on the map to select the area. Properties within this area will be included in route optimization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Controls Sidebar */}
          <div className="w-64 flex flex-col gap-4">
            <Tabs defaultValue="draw" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="draw">Draw</TabsTrigger>
                <TabsTrigger value="starting">Starting Point</TabsTrigger>
                <TabsTrigger value="clear">Clear</TabsTrigger>
              </TabsList>
              
              <TabsContent value="draw" className="space-y-2 mt-4">
                <Button
                  variant={drawingMode === 'rectangle' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    handleClearSelection();
                    setDrawingMode('rectangle');
                  }}
                >
                  <Square className="h-4 w-4 mr-2" />
                  Draw Rectangle
                </Button>
                <Button
                  variant={drawingMode === 'circle' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    handleClearSelection();
                    setDrawingMode('circle');
                  }}
                >
                  <CircleIcon className="h-4 w-4 mr-2" />
                  Draw Circle
                </Button>
                <Button
                  variant={drawingMode === 'polygon' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    handleClearSelection();
                    setDrawingMode('polygon');
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
              </TabsContent>

              <TabsContent value="starting" className="mt-4 space-y-4">
                {onStartingPointSelected && properties.length > 0 ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      Click on the map to drop a pin. The route will start from the closest property to your pin location.
                    </div>
                    <Button
                      variant={drawingMode === 'pin' ? 'default' : 'outline'}
                      className="w-full justify-start"
                      onClick={() => {
                        handleClearSelection();
                        setDrawingMode('pin');
                        setPinLocation(null);
                        setClosestProperty(null);
                      }}
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Drop Pin
                    </Button>
                    {pinLocation && (
                      <>
                        <div className="text-xs space-y-1">
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
                          <div className="text-xs space-y-1">
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
                          <div className="text-xs text-muted-foreground">
                            No properties with valid coordinates found.
                          </div>
                        )}
                        {closestProperty && (
                          <Button
                            className="w-full"
                            onClick={handleConfirmStartingPoint}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Use as Starting Point
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setPinLocation(null);
                            setClosestProperty(null);
                            setDrawingMode(null);
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Clear Pin
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Starting point selection requires properties with coordinates.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="clear" className="mt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleClearSelection}
                  disabled={!selectedShape}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Selection
                </Button>
              </TabsContent>
            </Tabs>

            {selectedShape && (
              <div className="mt-auto space-y-2">
                <Button
                  className="w-full"
                  onClick={handleDone}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Done - Optimize Routes
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Map */}
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
                drawingMode={drawingMode}
                onRectangleComplete={handleRectangleComplete}
                onCircleComplete={handleCircleComplete}
                onPolygonComplete={handlePolygonComplete}
                onPolygonPointAdd={handlePolygonPointAdd}
                onPinDrop={drawingMode === 'pin' ? handlePinDrop : undefined}
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
              {/* Show starting point pin */}
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
              {/* Show closest property marker */}
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
                      <strong>Closest Property</strong><br/>
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

