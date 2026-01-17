/**
 * @opendisplay/opendisplay - TypeScript library for OpenDisplay BLE e-paper displays
 *
 * Main entry point exporting the public API.
 */

// Core device API
export { OpenDisplayDevice } from './device';
export { discoverDevices } from './discovery';

// Models and types
export * from './models/enums';
export * from './models/config';
export * from './models/capabilities';
export * from './models/firmware';
export * from './models/advertisement';

// Exceptions
export * from './exceptions';

// Re-export from epaper-dithering for convenience
export { ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';