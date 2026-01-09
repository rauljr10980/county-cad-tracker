/**
 * Google Maps TypeScript definitions
 * Extends the global window object with Google Maps types
 */

declare global {
  interface Window {
    google: typeof google;
  }
}

export {};

