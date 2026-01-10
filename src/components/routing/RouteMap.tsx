/**
 * Route Map Component using Leaflet
 * Renders optimized routes using OpenStreetMap tiles
 * Supports unlimited waypoints with polylines and markers
 */

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { LatLng, LatLngBounds } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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

// Route colors for different vehicles
const ROUTE_COLORS = [
  '#4285F4', // Blue
  '#EA4335', // Red
];

// Component to fit map bounds to show all waypoints
function MapBoundsFitter({ waypoints }: { waypoints: Waypoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (waypoints.length === 0) return;

    const bounds = new LatLngBounds(
      waypoints.map(wp => new LatLng(wp.lat, wp.lon))
    );
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [waypoints, map]);

  return null;
}

export function RouteMap({ routes, numVehicles, totalDistance, isOpen, onClose }: RouteMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allWaypoints, setAllWaypoints] = useState<Waypoint[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    try {
      // Extract all waypoints from all routes
      const waypoints: Waypoint[] = [];
      routes.forEach(route => {
        route.waypoints.forEach(wp => {
          if (wp.id !== 'depot') {
            waypoints.push(wp);
          }
        });
      });

      if (waypoints.length === 0) {
        setError('No waypoints to display');
        setIsLoading(false);
        return;
      }

      setAllWaypoints(waypoints);
      setIsLoading(false);
    } catch (err) {
      console.error('[RouteMap] Error processing routes:', err);
      setError(err instanceof Error ? err.message : 'Failed to process routes');
      setIsLoading(false);
    }
  }, [isOpen, routes]);

  const handleOpenInMaps = (routeIndex: number) => {
    const route = routes[routeIndex];
    const waypoints = route.waypoints.filter(wp => wp.id !== 'depot');
    
    if (waypoints.length === 0) return;

    // Google Maps URL format: /dir/{origin}/{waypoint1}/{waypoint2}/.../{destination}
    // Limit to 25 waypoints (Google Maps limit)
    const limitedWaypoints = waypoints.slice(0, 25);
    
    // Build URL with all waypoints
    const waypointStrings = limitedWaypoints.map(wp => `${wp.lat},${wp.lon}`);
    const mapsUrl = `https://www.google.com/maps/dir/${waypointStrings.join('/')}`;
    
    window.open(mapsUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Optimized Route</DialogTitle>
          <DialogDescription>
            {routes.length === 1 ? 'Single vehicle route' : `${routes.length} vehicle routes`} • 
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
                  Failed to display routes. Please try again.
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
              <MapContainer
                center={allWaypoints[0] ? [allWaypoints[0].lat, allWaypoints[0].lon] : [29.4241, -98.4936]}
                zoom={11}
                style={{ height: '100%', width: '100%' }}
                className="rounded-lg z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapBoundsFitter waypoints={allWaypoints} />
                
                {/* Render routes */}
                {routes.map((route, routeIndex) => {
                  // Include depot in the route path (it's the starting point)
                  // Filter out only duplicate depots (depot appears at start and end)
                  const waypoints = route.waypoints;
                  if (waypoints.length < 2) return null;

                  // Remove duplicate depot at the end if present
                  const uniqueWaypoints = waypoints.length > 1 && 
                    waypoints[0].id === 'depot' && 
                    waypoints[waypoints.length - 1].id === 'depot'
                    ? waypoints.slice(0, -1) // Remove last depot
                    : waypoints;

                  const path = uniqueWaypoints.map(wp => [wp.lat, wp.lon] as LatLng);
                  const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];

                  return (
                    <div key={routeIndex}>
                      {/* Polyline for route */}
                      <Polyline
                        positions={path}
                        pathOptions={{
                          color,
                          weight: 4,
                          opacity: 0.8,
                        }}
                      />
                      {/* Markers for waypoints */}
                      {waypoints.map((wp, wpIndex) => (
                        <Marker
                          key={`${routeIndex}-${wpIndex}`}
                          position={[wp.lat, wp.lon]}
                          icon={L.divIcon({
                            className: 'custom-marker',
                            html: `<div style="
                              background-color: ${color};
                              width: 24px;
                              height: 24px;
                              border-radius: 50%;
                              border: 2px solid white;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              color: white;
                              font-weight: bold;
                              font-size: 12px;
                            ">${wpIndex + 1}</div>`,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12],
                          })}
                        >
                          <Popup>
                            <div style={{ padding: '4px' }}>
                              <strong>Stop {wpIndex + 1}</strong><br/>
                              {wp.address || 'No address'}<br/>
                              <small>Route {routeIndex + 1}</small>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                    </div>
                  );
                })}
              </MapContainer>
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
            {routes.map((route, index) => {
              const stopCount = route.waypoints.filter(wp => wp.id !== 'depot').length;
              const limitedCount = Math.min(stopCount, 25);
              return (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenInMaps(index)}
                  title={stopCount > 25 ? 
                    `Open route in Google Maps with first ${limitedCount} stops (out of ${stopCount} total. Google Maps limit is 25 waypoints)` :
                    `Open route in Google Maps with ${stopCount} stops`}
                >
                  Open Route {index + 1} in Maps ({stopCount > 25 ? `first ${limitedCount}/${stopCount}` : stopCount} stops)
                </Button>
              );
            })}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

