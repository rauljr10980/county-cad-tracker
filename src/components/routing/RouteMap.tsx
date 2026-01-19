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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createRoute } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

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
  recordIds?: string[]; // Optional: pre-foreclosure record IDs for route tracking
  onRouteSaved?: () => void; // Optional: callback when route is saved
  routeType?: 'PROPERTY' | 'PREFORECLOSURE'; // Type of records in the route
  compact?: boolean; // Whether to render in compact mode (no save button)
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

export function RouteMap({ routes, numVehicles, totalDistance, isOpen, onClose, recordIds, onRouteSaved, routeType = 'PREFORECLOSURE', compact = false }: RouteMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allWaypoints, setAllWaypoints] = useState<Waypoint[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<'Luciano' | 'Raul' | ''>('');
  const [isSavingRoute, setIsSavingRoute] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    try {
      // Extract all waypoints from all routes (include depot for bounds calculation)
      const waypoints: Waypoint[] = [];
      routes.forEach(route => {
        route.waypoints.forEach(wp => {
          waypoints.push(wp);
        });
      });

      // Check if we have any non-depot waypoints
      const nonDepotWaypoints = waypoints.filter(wp => wp.id !== 'depot');
      
      if (nonDepotWaypoints.length === 0 && waypoints.length === 0) {
        setError('No waypoints to display');
        setIsLoading(false);
        return;
      }

      // If we only have depot waypoints, that's an error
      if (nonDepotWaypoints.length === 0) {
        console.error('[RouteMap] Route has only depot waypoints, no properties in route');
        setError('Route generated but contains no properties. Please check your selection.');
        setIsLoading(false);
        return;
      }

      setAllWaypoints(waypoints);
      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error('[RouteMap] Error processing routes:', err);
      setError(err instanceof Error ? err.message : 'Failed to process routes');
      setIsLoading(false);
    }
  }, [isOpen, routes]);

  const handleOpenInMaps = (routeIndex: number) => {
    const route = routes[routeIndex];
    // Include depot as the first waypoint (it's the starting point)
    // The route.waypoints array already has depot as the first element
    // We need to include it in the Google Maps URL so the route starts at the starting point
    const waypoints = route.waypoints; // Include all waypoints including depot
    
    if (waypoints.length === 0) return;

    // Google Maps URL format: /dir/{origin}/{waypoint1}/{waypoint2}/.../{destination}
    // Limit to 25 waypoints total (Google Maps limit) - this includes the depot as the first waypoint
    // With depot + 24 stops = 25 total waypoints (our new limit)
    const limitedWaypoints = waypoints.slice(0, 25);
    
    // Build URL with all waypoints (including depot as first waypoint)
    const waypointStrings = limitedWaypoints.map(wp => `${wp.lat},${wp.lon}`);
    const mapsUrl = `https://www.google.com/maps/dir/${waypointStrings.join('/')}`;
    
    window.open(mapsUrl, '_blank');
  };

  const handleSaveRoute = async () => {
    if (!selectedDriver) {
      toast({
        title: "Driver Required",
        description: "Please select a driver before saving the route.",
        variant: "destructive",
      });
      return;
    }

    if (!recordIds || recordIds.length === 0) {
      toast({
        title: "No Records",
        description: "No records available to save route.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingRoute(true);
    try {
      // Prepare route data (full VRP solution)
      const routeData = {
        routes: routes,
        totalDistance: totalDistance,
        numVehicles: numVehicles,
      };

      await createRoute(selectedDriver, routeData, recordIds, routeType);
      
      toast({
        title: "Route Saved",
        description: `Route assigned to ${selectedDriver} and saved successfully.`,
      });

      // Call callback if provided
      if (onRouteSaved) {
        onRouteSaved();
      }
    } catch (error) {
      console.error('[RouteMap] Error saving route:', error);
      toast({
        title: "Failed to Save Route",
        description: error instanceof Error ? error.message : 'Failed to save route. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsSavingRoute(false);
    }
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

                  const path = uniqueWaypoints.map(wp => new LatLng(wp.lat, wp.lon));
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
                      {uniqueWaypoints.map((wp, wpIndex) => {
                        const isDepot = wp.id === 'depot';
                        const stopNumber = isDepot ? 0 : wpIndex; // Depot is stop 0, others are numbered
                        const displayNumber = isDepot ? 'START' : stopNumber;
                        
                        return (
                          <Marker
                            key={`${routeIndex}-${wpIndex}`}
                            position={[wp.lat, wp.lon]}
                            icon={L.divIcon({
                              className: 'custom-marker',
                              html: `<div style="
                                background-color: ${isDepot ? '#10B981' : color};
                                width: ${isDepot ? '28px' : '24px'};
                                height: ${isDepot ? '28px' : '24px'};
                                border-radius: 50%;
                                border: 2px solid white;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: bold;
                                font-size: ${isDepot ? '10px' : '12px'};
                              ">${displayNumber}</div>`,
                              iconSize: [isDepot ? 28 : 24, isDepot ? 28 : 24],
                              iconAnchor: [isDepot ? 14 : 12, isDepot ? 14 : 12],
                            })}
                          >
                            <Popup>
                              <div style={{ padding: '4px' }}>
                                <strong>{isDepot ? 'Starting Point' : `Stop ${stopNumber}`}</strong><br/>
                                {wp.address || wp.originalId || 'No address'}<br/>
                                {wp.accountNumber && <><small>Account: {wp.accountNumber}</small><br/></>}
                                {!isDepot && <small>Route {routeIndex + 1}</small>}
                              </div>
                            </Popup>
                          </Marker>
                        );
                      })}
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
          <div className="flex gap-2 items-center">
            {recordIds && recordIds.length > 0 && (
              <>
                <Select value={selectedDriver} onValueChange={(value) => setSelectedDriver(value as 'Luciano' | 'Raul')}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Luciano">Luciano</SelectItem>
                    <SelectItem value="Raul">Raul</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSaveRoute}
                  disabled={!selectedDriver || isSavingRoute}
                  className="bg-primary text-primary-foreground"
                >
                  {isSavingRoute ? 'Saving...' : 'Save Route'}
                </Button>
              </>
            )}
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

