/**
 * Area Selector Map Component
 * Allows user to draw a circle or rectangle on the map to select a geographic area
 * Then filters properties within that area for route optimization
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Square, Circle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

export function AreaSelectorMap({ 
  isOpen, 
  onClose, 
  onAreaSelected,
  initialCenter = { lat: 29.4241, lng: -98.4936 }, // San Antonio default
  initialZoom = 11
}: AreaSelectorMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<'rectangle' | 'circle' | null>(null);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [selectedShape, setSelectedShape] = useState<google.maps.Rectangle | google.maps.Circle | null>(null);
  const rectangleRef = useRef<google.maps.Rectangle | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);

  // Initialize Google Maps
  useEffect(() => {
    if (!isOpen || !mapRef.current) return;

    // Check if Google Maps is loaded
    if (!window.google || !window.google.maps) {
      setError('Google Maps SDK not loaded. Please check your API key.');
      setIsLoading(false);
      return;
    }

    try {
      // Create map
      const newMap = new google.maps.Map(mapRef.current, {
        zoom: initialZoom,
        center: initialCenter,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      // Initialize Drawing Manager
      const manager = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: false, // We'll control it manually
        rectangleOptions: {
          fillColor: '#4285F4',
          fillOpacity: 0.2,
          strokeColor: '#4285F4',
          strokeWeight: 2,
          clickable: false,
          editable: true,
          draggable: true,
        },
        circleOptions: {
          fillColor: '#EA4335',
          fillOpacity: 0.2,
          strokeColor: '#EA4335',
          strokeWeight: 2,
          clickable: false,
          editable: true,
          draggable: true,
        },
      });

      manager.setMap(newMap);

      // Listen for shape completion
      google.maps.event.addListener(manager, 'overlaycomplete', (event: any) => {
        // Clear previous selection
        if (rectangleRef.current) {
          rectangleRef.current.setMap(null);
        }
        if (circleRef.current) {
          circleRef.current.setMap(null);
        }

        if (event.type === 'rectangle') {
          const rectangle = event.overlay as google.maps.Rectangle;
          rectangleRef.current = rectangle;
          setSelectedShape(rectangle);
          setDrawingMode(null);
          manager.setDrawingMode(null);
        } else if (event.type === 'circle') {
          const circle = event.overlay as google.maps.Circle;
          circleRef.current = circle;
          setSelectedShape(circle);
          setDrawingMode(null);
          manager.setDrawingMode(null);
        }
      });

      setDrawingManager(manager);
      setMap(newMap);
      setIsLoading(false);
    } catch (err) {
      console.error('[AreaSelectorMap] Error initializing map:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize map');
      setIsLoading(false);
    }
  }, [isOpen, initialCenter, initialZoom]);

  // Handle drawing mode changes
  useEffect(() => {
    if (!drawingManager || !map) return;

    if (drawingMode === 'rectangle') {
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.RECTANGLE);
    } else if (drawingMode === 'circle') {
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.CIRCLE);
    } else {
      drawingManager.setDrawingMode(null);
    }
  }, [drawingMode, drawingManager, map]);

  const handleClearSelection = () => {
    if (rectangleRef.current) {
      rectangleRef.current.setMap(null);
      rectangleRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
    setSelectedShape(null);
    setDrawingMode(null);
    if (drawingManager) {
      drawingManager.setDrawingMode(null);
    }
  };

  const handleDone = () => {
    if (!selectedShape) {
      return;
    }

    let bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
      center?: { lat: number; lng: number };
      radius?: number;
    };

    if (selectedShape instanceof google.maps.Rectangle) {
      const rectBounds = selectedShape.getBounds();
      if (!rectBounds) return;
      
      const ne = rectBounds.getNorthEast();
      const sw = rectBounds.getSouthWest();
      
      bounds = {
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng(),
        center: {
          lat: (ne.lat() + sw.lat()) / 2,
          lng: (ne.lng() + sw.lng()) / 2
        }
      };
    } else if (selectedShape instanceof google.maps.Circle) {
      const center = selectedShape.getCenter();
      const radius = selectedShape.getRadius(); // in meters
      
      // Convert radius to approximate lat/lng bounds
      // 1 degree latitude ≈ 111 km
      // 1 degree longitude ≈ 111 km * cos(latitude)
      const latRadius = radius / 111000;
      const lngRadius = radius / (111000 * Math.cos(center.lat() * Math.PI / 180));
      
      bounds = {
        north: center.lat() + latRadius,
        south: center.lat() - latRadius,
        east: center.lng() + lngRadius,
        west: center.lng() - lngRadius,
        center: {
          lat: center.lat(),
          lng: center.lng()
        },
        radius: radius / 1000 // Convert to km
      };
    } else {
      return;
    }

    onAreaSelected(bounds);
    onClose();
  };

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
                  <Circle className="h-4 w-4 mr-2" />
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
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/30 rounded-lg">
                <div className="text-center p-6">
                  <p className="text-destructive mb-4">{error}</p>
                  <p className="text-sm text-muted-foreground">
                    Make sure Google Maps JavaScript API is loaded with a valid API key.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-secondary/30 rounded-lg z-10">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                      <p className="text-sm text-muted-foreground">Loading map...</p>
                    </div>
                  </div>
                )}
                <div ref={mapRef} className="w-full h-full rounded-lg" />
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

