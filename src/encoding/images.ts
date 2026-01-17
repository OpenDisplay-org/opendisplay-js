/**
 * Image encoding for e-paper displays.
 */

import {
  ColorScheme,
  DitherMode,
  ditherImage,
  type PaletteImageBuffer,
} from '@opendisplay/epaper-dithering';
import { ImageEncodingError } from '../exceptions';
import { encodeBitplanes } from './bitplanes';

/**
 * Encode palette image to display format based on color scheme.
 *
 * @param paletteImage - Dithered palette image
 * @param colorScheme - Display color scheme
 * @returns Encoded image bytes
 * @throws {ImageEncodingError} For unsupported color schemes
 */
export function encodeImage(
  paletteImage: PaletteImageBuffer,
  colorScheme: ColorScheme
): Uint8Array {
  switch (colorScheme) {
    case ColorScheme.MONO:
      return encode1bpp(paletteImage);

    case ColorScheme.BWR:
    case ColorScheme.BWY:
      throw new ImageEncodingError(
        `Color scheme ${ColorScheme[colorScheme]} requires bitplane encoding, ` +
          'use encodeBitplanes() instead'
      );

    case ColorScheme.BWRY:
      return encode2bpp(paletteImage);

    case ColorScheme.BWGBRY:
      // 6-color Spectra 6 display uses 4bpp with special firmware mapping
      return encode4bpp(paletteImage, true);

    case ColorScheme.GRAYSCALE_4:
      return encode2bpp(paletteImage);

    default:
      throw new ImageEncodingError(
        `Unsupported color scheme: ${ColorScheme[colorScheme]}`
      );
  }
}

/**
 * Encode image to 1-bit-per-pixel format (monochrome).
 *
 * Format: 8 pixels per byte, MSB first
 * Palette index 0 = black (0), index 1 = white (1)
 *
 * @param paletteImage - Palette image
 * @returns Encoded bytes
 */
export function encode1bpp(paletteImage: PaletteImageBuffer): Uint8Array {
  const { width, height, indices: pixels } = paletteImage;

  // Calculate output size (round up to byte boundary)
  const bytesPerRow = Math.ceil(width / 8);
  const output = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIdx = y * bytesPerRow + Math.floor(x / 8);
      const bitIdx = 7 - (x % 8); // MSB first

      if (pixels[y * width + x] > 0) {
        // Non-zero palette index = white
        output[byteIdx] |= 1 << bitIdx;
      }
    }
  }

  return output;
}

/**
 * Encode image to 2-bits-per-pixel format (4 colors).
 *
 * Format: 4 pixels per byte, MSB first
 * Each 2-bit value maps to palette index (0-3)
 *
 * @param paletteImage - Palette image
 * @returns Encoded bytes
 */
export function encode2bpp(paletteImage: PaletteImageBuffer): Uint8Array {
  const { width, height, indices: pixels } = paletteImage;

  // Calculate output size (round up to 4-pixel boundary)
  const bytesPerRow = Math.ceil(width / 4);
  const output = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIdx = y * bytesPerRow + Math.floor(x / 4);
      const pixelInByte = x % 4;
      const bitShift = (3 - pixelInByte) * 2; // MSB first

      const paletteIdx = pixels[y * width + x] & 0x03; // 2-bit value
      output[byteIdx] |= paletteIdx << bitShift;
    }
  }

  return output;
}

/**
 * Encode image to 4-bits-per-pixel format (16 colors).
 *
 * Format: 2 pixels per byte, MSB first
 * Each 4-bit value maps to palette index (0-15)
 *
 * @param paletteImage - Palette image
 * @param bwgbryMapping - If true, remap palette indices for BWGBRY firmware
 *   (0→0, 1→1, 2→2, 3→3, 4→5, 5→6)
 * @returns Encoded bytes
 */
export function encode4bpp(
  paletteImage: PaletteImageBuffer,
  bwgbryMapping: boolean = false
): Uint8Array {
  const { width, height, indices: pixels } = paletteImage;

  // BWGBRY firmware color mapping (Spectra 6 display)
  // Palette indices to firmware values: 0→0, 1→1, 2→2, 3→3, 4→5, 5→6
  const BWGBRY_MAP: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6 };

  // Calculate output size (round up to 2-pixel boundary)
  const bytesPerRow = Math.ceil(width / 2);
  const output = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIdx = y * bytesPerRow + Math.floor(x / 2);
      const pixelInByte = x % 2;

      let paletteIdx = pixels[y * width + x] & 0x0f; // 4-bit value

      // Apply BWGBRY mapping if needed
      if (bwgbryMapping && paletteIdx in BWGBRY_MAP) {
        paletteIdx = BWGBRY_MAP[paletteIdx];
      }

      const bitShift = (1 - pixelInByte) * 4; // MSB first
      output[byteIdx] |= paletteIdx << bitShift;
    }
  }

  return output;
}

/**
 * Prepare image for upload: resize, dither, and encode.
 *
 * @param imageData - Input image as ImageData
 * @param targetWidth - Target display width
 * @param targetHeight - Target display height
 * @param colorScheme - Display color scheme
 * @param ditherMode - Dithering algorithm to use
 * @returns Encoded image data ready for upload
 */
export function prepareImageForUpload(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  colorScheme: ColorScheme,
  ditherMode: DitherMode = DitherMode.BURKES
): Uint8Array {
  // Resize if needed
  let resizedImageData = imageData;
  if (imageData.width !== targetWidth || imageData.height !== targetHeight) {
    console.warn(
      `Resizing image from ${imageData.width}x${imageData.height} to ${targetWidth}x${targetHeight}`
    );
    resizedImageData = resizeImageData(imageData, targetWidth, targetHeight);
  }

  // Apply dithering
  const paletteImage = ditherImage(resizedImageData, colorScheme, ditherMode);

  // Encode based on color scheme
  if (colorScheme === ColorScheme.BWR || colorScheme === ColorScheme.BWY) {
    // For BWR/BWY, encode to bitplanes and concatenate
    const [plane1, plane2] = encodeBitplanes(paletteImage, colorScheme);
    const result = new Uint8Array(plane1.length + plane2.length);
    result.set(plane1, 0);
    result.set(plane2, plane1.length);
    return result;
  } else {
    return encodeImage(paletteImage, colorScheme);
  }
}

/**
 * Resize ImageData to target dimensions using canvas.
 *
 * @param imageData - Source image data
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @returns Resized image data
 */
function resizeImageData(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number
): ImageData {
  // Create offscreen canvas for resizing
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImageEncodingError('Failed to get canvas context');
  }

  // Draw source image
  ctx.putImageData(imageData, 0, 0);

  // Create target canvas
  const targetCanvas = new OffscreenCanvas(targetWidth, targetHeight);
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) {
    throw new ImageEncodingError('Failed to get target canvas context');
  }

  // Resize (browser handles interpolation)
  targetCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  return targetCtx.getImageData(0, 0, targetWidth, targetHeight);
}