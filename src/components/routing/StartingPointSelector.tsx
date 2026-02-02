/**
 * Starting Point Selector Component
 * Allows user to drop a pin on the map to select a starting point
 * Finds the closest property to that pin and uses it as the depot
 */

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { LatLng } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Property } from '@/types/property';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icon for starting point pin
const startingPointIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface StartingPointSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onStartingPointSelected: (property: PropertyLike, pinLocation: { lat: number; lng: number }) => void;
  properties: PropertyLike[];
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
}

// Component to handle map clicks
function MapClickHandler({ 
  onPinDrop, 
  pinLocation 
}: { 
  onPinDrop: (latlng: LatLng) => void;
  pinLocation: LatLng | null;
}) {
  useMapEvents({
    click(e) {
      onPinDrop(e.latlng);
    },
  });

  return null;
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

// Component to fit map bounds to show all properties
function MapBoundsFitter({ properties, pinLocation }: { properties: PropertyLike[]; pinLocation: LatLng | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const validProperties = properties.filter(p => p.latitude != null && p.longitude != null);
    if (validProperties.length === 0 && !pinLocation) return;

    try {
      const { LatLngBounds } = require('leaflet');
      const bounds = new LatLngBounds();
      
      validProperties.forEach(p => {
        if (p.latitude && p.longitude) {
          bounds.extend([p.latitude, p.longitude]);
        }
      });
      
      if (pinLocation) {
        bounds.extend([pinLocation.lat, pinLocation.lng]);
      }
      
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    } catch (err) {
      console.error('[MapBoundsFitter] Error:', err);
    }
  }, [map, properties, pinLocation]);

  return null;
}

export function StartingPointSelector({
  isOpen,
  onClose,
  onStartingPointSelected,
  properties,
  initialCenter = { lat: 29.4241, lng: -98.4936 }, // San Antonio default
  initialZoom = 11
}: StartingPointSelectorProps) {
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null);
  const [closestProperty, setClosestProperty] = useState<PropertyLike | null>(null);
  const [isFindingClosest, setIsFindingClosest] = useState(false);

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

  const handleConfirm = () => {
    if (!closestProperty || !pinLocation) return;
    onStartingPointSelected(closestProperty, { lat: pinLocation.lat, lng: pinLocation.lng });
    onClose();
  };

  const handleClear = () => {
    setPinLocation(null);
    setClosestProperty(null);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-3xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Starting Point</DialogTitle>
          <DialogDescription>
            Click on the map to drop a pin. The route will start from the closest property to your pin location.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Controls Sidebar */}
          <div className="w-64 flex flex-col gap-4">
            {pinLocation ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Pin Location</div>
                  <div className="text-xs text-muted-foreground">
                    Lat: {pinLocation.lat.toFixed(6)}<br/>
                    Lng: {pinLocation.lng.toFixed(6)}
                  </div>
                </div>

                {isFindingClosest ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 text-sm">Finding closest property...</span>
                  </div>
                ) : closestProperty ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Closest Property</div>
                    <div className="text-xs space-y-1">
                      {closestProperty.accountNumber && <div><strong>Account:</strong> {closestProperty.accountNumber}</div>}
                      <div><strong>Address:</strong> {closestProperty.propertyAddress || closestProperty.address || 'N/A'}</div>
                      {closestProperty.ownerName && <div><strong>Owner:</strong> {closestProperty.ownerName}</div>}
                      <div className="text-muted-foreground">
                        Distance: {calculateDistance(
                          pinLocation.lat,
                          pinLocation.lng,
                          closestProperty.latitude!,
                          closestProperty.longitude!
                        ).toFixed(2)} km
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No properties with valid coordinates found.
                  </div>
                )}

                <div className="mt-auto space-y-2">
                  <Button
                    className="w-full"
                    onClick={handleConfirm}
                    disabled={!closestProperty}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Use as Starting Point
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleClear}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Pin
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Click anywhere on the map to drop a pin and find the closest property.
                </div>
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
              <MapClickHandler onPinDrop={handlePinDrop} pinLocation={pinLocation} />
              <MapBoundsFitter properties={properties} pinLocation={pinLocation} />
              
              {/* Show all properties as small dots */}
              {properties
                .filter(p => p.latitude != null && p.longitude != null)
                .map((property) => (
                  <Marker
                    key={property.id}
                    position={[property.latitude!, property.longitude!]}
                    icon={property.id === closestProperty?.id ? 
                      L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                      }) :
                      L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [15, 25],
                        iconAnchor: [7, 25],
                      })
                    }
                  >
                    {property.id === closestProperty?.id && (
                      <Popup>
                        <div style={{ padding: '4px' }}>
                          <strong>Closest Property</strong><br/>
                          {property.propertyAddress || property.address || 'N/A'}<br/>
                          {property.accountNumber && <small>{property.accountNumber}</small>}
                        </div>
                      </Popup>
                    )}
                  </Marker>
                ))}
              
              {/* Show starting point pin */}
              {pinLocation && (
                <Marker
                  position={[pinLocation.lat, pinLocation.lng]}
                  icon={startingPointIcon}
                >
                  <Popup>
                    <div style={{ padding: '4px' }}>
                      <strong>Starting Point</strong><br/>
                      {closestProperty ? `Closest: ${closestProperty.propertyAddress || closestProperty.address || 'N/A'}` : 'Finding closest property...'}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

