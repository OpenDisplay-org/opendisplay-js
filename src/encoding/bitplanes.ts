/**
 * Bitplane encoding for multi-color e-paper displays.
 */

import { ColorScheme, PaletteImageBuffer } from '@opendisplay/epaper-dithering';
import { ImageEncodingError } from '../exceptions';

/**
 * Encode image to bitplane format for BWR/BWY displays.
 *
 * BWR/BWY displays use two bitplanes:
 * - Plane 1 (BW): Black/White layer
 * - Plane 2 (R/Y): Red/Yellow accent color layer
 *
 * Palette mapping:
 * - Index 0 = Black -> BW=0, R/Y=0
 * - Index 1 = White -> BW=1, R/Y=0
 * - Index 2 = Red/Yellow -> BW=0, R/Y=1
 *
 * @param paletteImage - Dithered palette image from epaper-dithering
 * @param colorScheme - Must be BWR or BWY
 * @returns Tuple of [plane1Bytes, plane2Bytes]
 * @throws {ImageEncodingError} If color scheme is not BWR or BWY
 */
export function encodeBitplanes(
  paletteImage: PaletteImageBuffer,
  colorScheme: ColorScheme
): [Uint8Array, Uint8Array] {
  if (colorScheme !== ColorScheme.BWR && colorScheme !== ColorScheme.BWY) {
    throw new ImageEncodingError(
      `Bitplane encoding only supports BWR/BWY, got ${ColorScheme[colorScheme]}`
    );
  }

  const { width, height, indices: pixels } = paletteImage;

  // Calculate output size (1bpp, 8 pixels per byte)
  const bytesPerRow = Math.ceil(width / 8);
  const plane1 = new Uint8Array(bytesPerRow * height); // BW plane
  const plane2 = new Uint8Array(bytesPerRow * height); // R/Y plane

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIdx = y * bytesPerRow + Math.floor(x / 8);
      const bitIdx = 7 - (x % 8); // MSB first

      const paletteIdx = pixels[y * width + x];

      if (paletteIdx === 1) {
        // White - set BW plane
        plane1[byteIdx] |= 1 << bitIdx;
      } else if (paletteIdx === 2) {
        // Red/Yellow - set R/Y plane
        plane2[byteIdx] |= 1 << bitIdx;
      }
      // else: paletteIdx === 0 (black) - both planes stay 0
    }
  }

  return [plane1, plane2];
}