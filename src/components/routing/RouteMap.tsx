/**
 * Route Map Component
 * Renders optimized routes using Google Maps JavaScript SDK
 * Supports unlimited waypoints with polylines and markers
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Waypoint {
  lat: number;
  lon: number;
  id: string;
  address?: string;
  [key: string]: any;
}

interface Route {
  waypoints: Waypoint[];
  cost: number;
  distance: number;
}

interface RouteMapProps {
  routes: Route[];
  numVehicles: 1 | 2;
  totalDistance: number;
  isOpen: boolean;
  onClose: () => void;
}

// Google Maps colors for different vehicles
const ROUTE_COLORS = [
  '#4285F4', // Google Blue
  '#EA4335', // Google Red
];

export function RouteMap({ routes, numVehicles, totalDistance, isOpen, onClose }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);

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
      // Calculate bounds to fit all waypoints
      const allWaypoints: Waypoint[] = [];
      routes.forEach(route => {
        route.waypoints.forEach(wp => {
          if (wp.id !== 'depot') {
            allWaypoints.push(wp);
          }
        });
      });

      if (allWaypoints.length === 0) {
        setError('No waypoints to display');
        setIsLoading(false);
        return;
      }

      // Create map
      const newMap = new google.maps.Map(mapRef.current, {
        zoom: 10,
        center: { lat: allWaypoints[0].lat, lng: allWaypoints[0].lon },
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      // Fit bounds to show all waypoints
      const bounds = new google.maps.LatLngBounds();
      allWaypoints.forEach(wp => {
        bounds.extend({ lat: wp.lat, lng: wp.lon });
      });
      newMap.fitBounds(bounds);

      setMap(newMap);
      setIsLoading(false);
    } catch (err) {
      console.error('[RouteMap] Error initializing map:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize map');
      setIsLoading(false);
    }
  }, [isOpen, routes]);

  // Render routes as polylines
  useEffect(() => {
    if (!map || !isOpen) return;

    // Clear existing polylines and markers
    polylinesRef.current.forEach(polyline => polyline.setMap(null));
    markersRef.current.forEach(marker => marker.setMap(null));
    polylinesRef.current = [];
    markersRef.current = [];

    try {
      routes.forEach((route, routeIndex) => {
        const waypoints = route.waypoints.filter(wp => wp.id !== 'depot');
        if (waypoints.length < 2) return;

        // Create polyline path
        const path = waypoints.map(wp => ({
          lat: wp.lat,
          lng: wp.lon
        }));

        // Create polyline
        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length],
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map
        });

        polylinesRef.current.push(polyline);

        // Create markers for each waypoint
        waypoints.forEach((wp, wpIndex) => {
          const marker = new google.maps.Marker({
            position: { lat: wp.lat, lng: wp.lon },
            map,
            label: {
              text: (wpIndex + 1).toString(),
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 'bold'
            },
            title: wp.address || `Stop ${wpIndex + 1}`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length],
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            }
          });

          // Add info window
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="padding: 8px;">
                <strong>Stop ${wpIndex + 1}</strong><br/>
                ${wp.address || 'No address'}<br/>
                <small>Route ${routeIndex + 1}</small>
              </div>
            `
          });

          marker.addListener('click', () => {
            infoWindow.open(map, marker);
          });

          markersRef.current.push(marker);
        });
      });
    } catch (err) {
      console.error('[RouteMap] Error rendering routes:', err);
      setError(err instanceof Error ? err.message : 'Failed to render routes');
    }
  }, [map, routes, isOpen]);

  const handleOpenInGoogleMaps = (routeIndex: number) => {
    const route = routes[routeIndex];
    const waypoints = route.waypoints.filter(wp => wp.id !== 'depot');
    
    if (waypoints.length === 0) return;

    // For Google Maps URLs, limit to 25 waypoints
    const limitedWaypoints = waypoints.slice(0, 25);
    const origin = `${limitedWaypoints[0].lat},${limitedWaypoints[0].lon}`;
    const destination = `${limitedWaypoints[limitedWaypoints.length - 1].lat},${limitedWaypoints[limitedWaypoints.length - 1].lon}`;
    const middleWaypoints = limitedWaypoints.slice(1, -1);

    let mapsUrl = `https://www.google.com/maps/dir/${origin}/`;
    if (middleWaypoints.length > 0) {
      mapsUrl += middleWaypoints.map(wp => `${wp.lat},${wp.lon}`).join('/') + '/';
    }
    mapsUrl += destination;

    window.open(mapsUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Optimized Route</DialogTitle>
          <DialogDescription>
            {numVehicles === 1 ? 'Single vehicle route' : `${numVehicles} vehicle routes`} • 
            Total distance: {totalDistance.toFixed(2)} km • 
            {routes.reduce((sum, r) => sum + r.waypoints.filter(wp => wp.id !== 'depot').length, 0)} stops
          </DialogDescription>
        </DialogHeader>

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

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            {routes.map((route, index) => (
              <div key={index} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }}
                />
                <span className="text-sm">
                  Route {index + 1}: {route.waypoints.filter(wp => wp.id !== 'depot').length} stops ({route.distance.toFixed(2)} km)
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {routes.map((route, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleOpenInGoogleMaps(index)}
                title="Open first 25 stops in Google Maps for navigation"
              >
                Open Route {index + 1} in Maps
              </Button>
            ))}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

