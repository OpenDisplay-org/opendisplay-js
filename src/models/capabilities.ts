/**
 * Device capabilities model.
 */

import { ColorScheme } from '@opendisplay/epaper-dithering';

/**
 * Minimal device information needed for image upload.
 */
export interface DeviceCapabilities {
  /** Display width in pixels */
  width: number;

  /** Display height in pixels */
  height: number;

  /** Display color scheme */
  colorScheme: ColorScheme;

  /** Display rotation in degrees (0, 90, 180, 270) */
  rotation?: number;
}