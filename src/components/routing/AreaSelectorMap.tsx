/**
 * Area Selector Map Component using Leaflet
 * Allows user to draw a circle or rectangle on the map to select a geographic area
 * Then filters properties within that area for route optimization
 */

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, Rectangle, Circle, useMapEvents } from 'react-leaflet';
import { LatLngBounds, LatLng } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Loader2, Square, Circle as CircleIcon, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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
  }) => void;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
}

// Component to handle drawing (both rectangle and circle)
function ShapeDrawer({ 
  drawingMode, 
  onRectangleComplete,
  onCircleComplete
}: { 
  drawingMode: 'rectangle' | 'circle' | null;
  onRectangleComplete: (bounds: LatLngBounds) => void;
  onCircleComplete: (center: LatLng, radius: number) => void;
}) {
  const map = useMap();
  const [startPos, setStartPos] = useState<LatLng | null>(null);
  const [currentPos, setCurrentPos] = useState<LatLng | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useMapEvents({
    mousedown(e) {
      if (drawingMode && !isDrawing) {
        setIsDrawing(true);
        setStartPos(e.latlng);
        setCurrentPos(e.latlng);
        // Prevent map panning while drawing
        map.dragging.disable();
        map.doubleClickZoom.disable();
      }
    },
    mousemove(e) {
      if (drawingMode && isDrawing && startPos) {
        setCurrentPos(e.latlng);
      }
    },
    mouseup(e) {
      if (drawingMode && isDrawing && startPos) {
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
  });

  // Render preview shape while drawing
  if (drawingMode === 'rectangle' && startPos && currentPos && isDrawing) {
    return <Rectangle bounds={new LatLngBounds([startPos, currentPos])} pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
  }

  if (drawingMode === 'circle' && startPos && currentPos && isDrawing) {
    const radius = startPos.distanceTo(currentPos);
    return <Circle center={startPos} radius={radius} pathOptions={{ color: '#EA4335', fillColor: '#EA4335', fillOpacity: 0.2, weight: 2, dashArray: '5, 5' }} />;
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
  initialCenter = { lat: 29.4241, lng: -98.4936 }, // San Antonio default
  initialZoom = 11
}: AreaSelectorMapProps) {
  const [drawingMode, setDrawingMode] = useState<'rectangle' | 'circle' | null>(null);
  const [selectedShape, setSelectedShape] = useState<{ type: 'rectangle' | 'circle'; bounds: LatLngBounds; center?: LatLng; radius?: number } | null>(null);
  const [drawnRectangle, setDrawnRectangle] = useState<LatLngBounds | null>(null);
  const [drawnCircle, setDrawnCircle] = useState<{ center: LatLng; radius: number } | null>(null);

  const handleRectangleComplete = (bounds: LatLngBounds) => {
    setDrawnRectangle(bounds);
    setDrawnCircle(null);
    setSelectedShape({ type: 'rectangle', bounds });
    setDrawingMode(null);
  };

  const handleCircleComplete = (center: LatLng, radius: number) => {
    setDrawnCircle({ center, radius });
    setDrawnRectangle(null);
    // For circle, create bounds from center and radius
    const radiusDegrees = radius / 111000; // Approximate conversion: 1 degree ≈ 111 km
    const bounds = new LatLngBounds(
      [center.lat - radiusDegrees, center.lng - radiusDegrees / Math.cos(center.lat * Math.PI / 180)],
      [center.lat + radiusDegrees, center.lng + radiusDegrees / Math.cos(center.lat * Math.PI / 180)]
    );
    setSelectedShape({ type: 'circle', bounds, center, radius });
    setDrawingMode(null);
  };

  const handleClearSelection = () => {
    setSelectedShape(null);
    setDrawingMode(null);
    setDrawnRectangle(null);
    setDrawnCircle(null);
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
      radius: selectedShape.radius ? selectedShape.radius / 1000 : undefined // Convert to km
    };

    onAreaSelected(result);
    onClose();
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="draw">Draw</TabsTrigger>
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
              />
              {drawnRectangle && (
                <Rectangle bounds={drawnRectangle} pathOptions={{ color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.2, weight: 2 }} />
              )}
              {drawnCircle && (
                <Circle center={drawnCircle.center} radius={drawnCircle.radius} pathOptions={{ color: '#EA4335', fillColor: '#EA4335', fillOpacity: 0.2, weight: 2 }} />
              )}
              {selectedShape && <MapBoundsFitter bounds={selectedShape.bounds} />}
            </MapContainer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

