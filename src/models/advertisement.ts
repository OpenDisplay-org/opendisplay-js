/**
 * BLE advertisement data structures.
 */

/**
 * Parsed BLE advertisement manufacturer data.
 *
 * Advertisement format (11 bytes, manufacturer ID already stripped by Web Bluetooth):
 *
 * - [0-6]: Fixed protocol bytes
 * - [7-8]: Battery voltage in millivolts (little-endian uint16)
 * - [9]: Chip temperature in Celsius (signed int8)
 * - [10]: Loop counter (uint8, increments each advertisement)
 *
 * Note: Web Bluetooth provides manufacturer data without the manufacturer ID prefix.
 */
export interface AdvertisementData {
  /** Battery voltage in millivolts */
  batteryMv: number;

  /** Chip temperature in Celsius */
  temperatureC: number;

  /** Incrementing counter for each advertisement */
  loopCounter: number;
}

/**
 * Parse BLE advertisement manufacturer data.
 *
 * Note: The manufacturer ID (0x2446) is already stripped by Web Bluetooth
 * and provided as the key in manufacturerData.
 *
 * @param data - Raw manufacturer data (11 bytes, without the manufacturer ID prefix)
 * @returns AdvertisementData with parsed values
 * @throws {Error} If data is too short
 */
export function parseAdvertisement(data: Uint8Array): AdvertisementData {
  if (data.length < 11) {
    throw new Error(
      `Advertisement data too short: ${data.length} bytes (need 11)`
    );
  }

  const view = new DataView(data.buffer, data.byteOffset);

  // Parse sensor data
  // Bytes 0-6 are fixed protocol bytes (ignored)
  const batteryMv = view.getUint16(7, true); // uint16, little-endian
  const temperatureC = view.getInt8(9); // int8, signed
  const loopCounter = data[10]; // uint8

  return {
    batteryMv,
    temperatureC,
    loopCounter,
  };
}