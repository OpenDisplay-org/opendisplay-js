/**
 * BLE protocol command builders for OpenDisplay devices.
 */

import {
  CommandCode,
  CHUNK_SIZE,
  CONFIG_CHUNK_SIZE,
  MAX_START_PAYLOAD,
} from './constants';

/**
 * Build command to read device TLV configuration.
 *
 * @returns Command bytes: 0x0040 (2 bytes, big-endian)
 */
export function buildReadConfigCommand(): Uint8Array {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, CommandCode.READ_CONFIG, false); // false = big-endian
  return new Uint8Array(buffer);
}

/**
 * Build command to read firmware version.
 *
 * @returns Command bytes: 0x0043 (2 bytes, big-endian)
 */
export function buildReadFwVersionCommand(): Uint8Array {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, CommandCode.READ_FW_VERSION, false);
  return new Uint8Array(buffer);
}

/**
 * Build command to reboot device.
 *
 * The device will perform an immediate system reset and will NOT send
 * an ACK response. The BLE connection will drop when the device resets.
 *
 * @returns Command bytes: 0x000F (2 bytes, big-endian)
 */
export function buildRebootCommand(): Uint8Array {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, CommandCode.REBOOT, false);
  return new Uint8Array(buffer);
}

/**
 * Build START command for compressed upload with chunking.
 *
 * To prevent BLE MTU issues, the START command is limited to MAX_START_PAYLOAD
 * bytes. For large compressed payloads, this returns:
 * - START command with header + first chunk of compressed data
 * - Remaining compressed data (to be sent via DATA chunks)
 *
 * @param uncompressedSize - Original uncompressed image size in bytes
 * @param compressedData - Complete compressed image data
 * @returns Tuple of [startCommand, remainingData]:
 *   - startCommand: 0x0070 + uncompressed_size (4 bytes LE) + first chunk
 *   - remainingData: Compressed data not included in START (empty if all fits)
 *
 * Format of START command:
 *   [cmd:2][uncompressed_size:4][compressed_data:up to 194 bytes]
 *   - cmd: 0x0070 (big-endian)
 *   - uncompressed_size: Original size before compression (little-endian uint32)
 *   - compressed_data: First chunk of compressed data
 */
export function buildDirectWriteStartCompressed(
  uncompressedSize: number,
  compressedData: Uint8Array
): [Uint8Array, Uint8Array] {
  // Calculate max compressed data that fits in START
  // MAX_START_PAYLOAD = 200 total bytes
  // Header uses: 2 (cmd) + 4 (size) = 6 bytes
  // Remaining for compressed data: 200 - 6 = 194 bytes
  const maxDataInStart = MAX_START_PAYLOAD - 6; // 194 bytes

  const headerSize = 6;
  const totalSize =
    compressedData.length <= maxDataInStart
      ? headerSize + compressedData.length
      : MAX_START_PAYLOAD;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Command code (big-endian)
  view.setUint16(0, CommandCode.DIRECT_WRITE_START, false);

  // Uncompressed size (little-endian)
  view.setUint32(2, uncompressedSize, true);

  // Compressed data
  const startCommand = new Uint8Array(buffer);
  const dataLength = Math.min(compressedData.length, maxDataInStart);
  startCommand.set(compressedData.subarray(0, dataLength), 6);

  // Remaining data
  const remainingData =
    compressedData.length <= maxDataInStart
      ? new Uint8Array(0)
      : compressedData.subarray(maxDataInStart);

  return [startCommand, remainingData];
}

/**
 * Build START command for uncompressed upload protocol.
 *
 * This protocol sends NO data in START - all data follows via 0x0071 chunks.
 *
 * @returns Command bytes: 0x0070 (just the command, no data!)
 *
 * Format:
 *   [cmd:2]
 *   - cmd: 0x0070 (big-endian)
 *   - NO size, NO data - everything sent via 0x0071 DATA chunks
 */
export function buildDirectWriteStartUncompressed(): Uint8Array {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, CommandCode.DIRECT_WRITE_START, false);
  return new Uint8Array(buffer);
}

/**
 * Build command to send image data chunk.
 *
 * @param chunkData - Image data chunk (max CHUNK_SIZE bytes)
 * @returns Command bytes: 0x0071 + chunk_data
 *
 * Format:
 *   [cmd:2][data:230]
 *   - cmd: 0x0071 (big-endian)
 *   - data: Image data chunk
 */
export function buildDirectWriteDataCommand(chunkData: Uint8Array): Uint8Array {
  if (chunkData.length > CHUNK_SIZE) {
    throw new Error(
      `Chunk size ${chunkData.length} exceeds maximum ${CHUNK_SIZE}`
    );
  }

  const buffer = new ArrayBuffer(2 + chunkData.length);
  const view = new DataView(buffer);
  view.setUint16(0, CommandCode.DIRECT_WRITE_DATA, false);

  const result = new Uint8Array(buffer);
  result.set(chunkData, 2);

  return result;
}

/**
 * Build command to end image transfer and refresh display.
 *
 * @param refreshMode - Display refresh mode (0 = FULL, 1 = FAST/PARTIAL)
 * @returns Command bytes: 0x0072 + refresh_mode
 *
 * Format:
 *   [cmd:2][refresh:1]
 *   - cmd: 0x0072 (big-endian)
 *   - refresh: Refresh mode (0=full, 1=fast)
 */
export function buildDirectWriteEndCommand(refreshMode: number = 0): Uint8Array {
  const buffer = new ArrayBuffer(3);
  const view = new DataView(buffer);
  view.setUint16(0, CommandCode.DIRECT_WRITE_END, false);
  view.setUint8(2, refreshMode);
  return new Uint8Array(buffer);
}

/**
 * Build WRITE_CONFIG command with chunking support.
 *
 * Protocol:
 * - Single chunk (≤200 bytes): [0x00][0x41][config_data]
 * - Multi-chunk (>200 bytes):
 *   - First: [0x00][0x41][total_size:2LE][first_198_bytes]
 *   - Rest: [0x00][0x42][chunk_data] (up to 200 bytes each)
 *
 * @param configData - Complete serialized config data
 * @returns Tuple of [firstCommand, remainingChunks]:
 *   - firstCommand: 0x0041 command with first chunk
 *   - remainingChunks: Array of 0x0042 commands for subsequent chunks
 */
export function buildWriteConfigCommand(
  configData: Uint8Array
): [Uint8Array, Uint8Array[]] {
  const configLen = configData.length;

  // Single chunk mode (≤200 bytes)
  if (configLen <= CONFIG_CHUNK_SIZE) {
    const buffer = new ArrayBuffer(2 + configLen);
    const view = new DataView(buffer);
    view.setUint16(0, CommandCode.WRITE_CONFIG, false);

    const result = new Uint8Array(buffer);
    result.set(configData, 2);

    return [result, []];
  }

  // Multi-chunk mode (>200 bytes)
  // First chunk: [cmd][total_size:2LE][first_198_bytes]
  const firstChunkDataSize = CONFIG_CHUNK_SIZE - 2; // 198 bytes
  const firstBuffer = new ArrayBuffer(2 + 2 + firstChunkDataSize);
  const firstView = new DataView(firstBuffer);

  firstView.setUint16(0, CommandCode.WRITE_CONFIG, false);
  firstView.setUint16(2, configLen, true); // total size, little-endian

  const firstCommand = new Uint8Array(firstBuffer);
  firstCommand.set(configData.subarray(0, firstChunkDataSize), 4);

  // Remaining chunks: [cmd][chunk_data] (up to 200 bytes each)
  const chunks: Uint8Array[] = [];
  let offset = firstChunkDataSize;

  while (offset < configLen) {
    const chunkSize = Math.min(CONFIG_CHUNK_SIZE, configLen - offset);
    const buffer = new ArrayBuffer(2 + chunkSize);
    const view = new DataView(buffer);
    view.setUint16(0, CommandCode.WRITE_CONFIG_CHUNK, false);

    const chunk = new Uint8Array(buffer);
    chunk.set(configData.subarray(offset, offset + chunkSize), 2);
    chunks.push(chunk);

    offset += chunkSize;
  }

  return [firstCommand, chunks];
}