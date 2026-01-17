/**
 * BLE protocol constants for OpenDisplay devices.
 */

export const SERVICE_UUID = '00002446-0000-1000-8000-00805f9b34fb';
export const MANUFACTURER_ID = 0x2446;
export const RESPONSE_HIGH_BIT_FLAG = 0x8000;

// Chunking constants
export const CHUNK_SIZE = 230; // Maximum data bytes per chunk
export const CONFIG_CHUNK_SIZE = 200; // Maximum config chunk size
export const PIPELINE_CHUNKS = 1; // Wait for ACK after each chunk

// Upload protocol constants
export const MAX_COMPRESSED_SIZE = 50 * 1024; // 50KB firmware buffer limit
export const MAX_START_PAYLOAD = 200; // Maximum bytes in START command

/**
 * BLE command codes for OpenDisplay protocol.
 */
export enum CommandCode {
  // Configuration commands
  READ_CONFIG = 0x0040,
  WRITE_CONFIG = 0x0041,
  WRITE_CONFIG_CHUNK = 0x0042,

  // Firmware commands
  READ_FW_VERSION = 0x0043,
  REBOOT = 0x000f,

  // Image upload commands (direct write mode)
  DIRECT_WRITE_START = 0x0070,
  DIRECT_WRITE_DATA = 0x0071,
  DIRECT_WRITE_END = 0x0072,
}