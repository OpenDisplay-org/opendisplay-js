/**
 * Image compression for BLE transfer using pako (zlib).
 */

import pako from 'pako';

/**
 * Compress image data using zlib.
 *
 * @param data - Raw image data
 * @param level - Compression level (0-9, default: 6)
 *   - 0 = no compression
 *   - 1 = fastest
 *   - 6 = default balance
 *   - 9 = best compression
 * @returns Compressed data
 */
export function compressImageData(
  data: Uint8Array,
  level: number = 6
): Uint8Array {
  if (level === 0) {
    return data;
  }

  const compressed = pako.deflate(data, { level: level as pako.DeflateOptions['level'] });

  const ratio = data.length > 0 ? (compressed.length / data.length) * 100 : 0;
  console.debug(
    `Compressed ${data.length} bytes -> ${compressed.length} bytes (${ratio.toFixed(1)}%)`
  );

  return compressed;
}

/**
 * Decompress zlib-compressed image data.
 *
 * @param data - Compressed data
 * @returns Decompressed data
 * @throws {Error} If decompression fails
 */
export function decompressImageData(data: Uint8Array): Uint8Array {
  return pako.inflate(data);
}