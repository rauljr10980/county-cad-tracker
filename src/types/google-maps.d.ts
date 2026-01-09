/**
 * Google Maps TypeScript definitions
 * Extends the global window object with Google Maps types
 */

declare namespace google.maps.drawing {
  enum OverlayType {
    CIRCLE = 'circle',
    MARKER = 'marker',
    POLYGON = 'polygon',
    POLYLINE = 'polyline',
    RECTANGLE = 'rectangle',
  }

  interface DrawingManagerOptions {
    drawingMode?: OverlayType | null;
    drawingControl?: boolean;
    drawingControlOptions?: DrawingControlOptions;
    circleOptions?: CircleOptions;
    markerOptions?: MarkerOptions;
    polygonOptions?: PolygonOptions;
    polylineOptions?: PolylineOptions;
    rectangleOptions?: RectangleOptions;
    map?: Map;
  }

  interface DrawingControlOptions {
    position?: ControlPosition;
    drawingModes?: OverlayType[];
  }

  interface CircleOptions {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
    clickable?: boolean;
    editable?: boolean;
    draggable?: boolean;
    zIndex?: number;
  }

  interface RectangleOptions {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
    clickable?: boolean;
    editable?: boolean;
    draggable?: boolean;
    zIndex?: number;
  }

  interface MarkerOptions {
    // Marker options
  }

  interface PolygonOptions {
    // Polygon options
  }

  interface PolylineOptions {
    // Polyline options
  }

  class DrawingManager {
    constructor(options?: DrawingManagerOptions);
    setMap(map: Map | null): void;
    setDrawingMode(overlayType: OverlayType | null): void;
    getDrawingMode(): OverlayType | null;
  }

  interface OverlayCompleteEvent {
    type: OverlayType;
    overlay: Circle | Rectangle | Polygon | Polyline | Marker;
  }
}

declare global {
  interface Window {
    google: typeof google;
  }
}

export {};

