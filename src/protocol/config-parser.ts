/**
 * TLV configuration parser for OpenDisplay devices.
 */

import { ConfigParseError } from '../exceptions.js';
import {
  BinaryInputs,
  DataBus,
  DisplayConfig,
  GlobalConfig,
  LedConfig,
  ManufacturerData,
  PowerOption,
  SensorData,
  SystemConfig,
} from '../models/config.js';

// TLV packet type IDs
export const PACKET_TYPE_SYSTEM = 0x01;
export const PACKET_TYPE_MANUFACTURER = 0x02;
export const PACKET_TYPE_POWER = 0x04;
export const PACKET_TYPE_DISPLAY = 0x20;
export const PACKET_TYPE_LED = 0x21;
export const PACKET_TYPE_SENSOR = 0x23;
export const PACKET_TYPE_DATABUS = 0x24;
export const PACKET_TYPE_BINARY_INPUT = 0x25;

/**
 * Parse complete TLV config response from device.
 *
 * Firmware sends config data with a wrapper: [length:2][version:1][packets...][crc:2]
 * This function strips the wrapper and passes clean packet data to the TLV parser.
 *
 * @param rawData - Complete TLV data assembled from all BLE chunks
 * @returns Parsed GlobalConfig
 * @throws {ConfigParseError} If data is too short or invalid
 */
export function parseConfigResponse(rawData: Uint8Array): GlobalConfig {
  if (rawData.length < 5) {
    // Min: 2 (length) + 1 (version) + 0 (packets) + 2 (crc)
    throw new ConfigParseError(
      `Config data too short: ${rawData.length} bytes (need at least 5)`
    );
  }

  // Parse TLV wrapper header
  const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
  const configLength = view.getUint16(0, true); // little-endian
  const configVersion = view.getUint8(2);

  console.debug(
    `TLV wrapper: length=${configLength} bytes, version=${configVersion}`
  );

  // Extract packet data (skip 3-byte header, ignore 2-byte CRC at end)
  let packetData: Uint8Array;
  if (rawData.length > 5) {
    packetData = rawData.slice(3, -2); // Skip header, ignore CRC
  } else {
    packetData = rawData.slice(3); // Skip header only
  }

  console.debug(`Packet data after wrapper strip: ${packetData.length} bytes`);

  // Parse TLV packets
  return parseTlvConfig(packetData, configVersion);
}

/**
 * Parse complete TLV configuration from device response.
 *
 * BLE format: [TLV packets...] (raw TLV data, no header)
 *
 * Each TLV packet: [packet_number:1][packet_type:1][data:fixed_size]
 *
 * @param data - Raw TLV data from device (after echo bytes stripped)
 * @param version - Config version from wrapper (default 1 if called directly)
 * @returns GlobalConfig with all parsed configuration
 * @throws {ConfigParseError} If parsing fails
 */
export function parseTlvConfig(data: Uint8Array, version: number = 1): GlobalConfig {
  if (data.length < 2) {
    throw new ConfigParseError(
      `TLV data too short: ${data.length} bytes (need at least 2)`
    );
  }

  console.debug(`Parsing TLV config, ${data.length} bytes`);

  // Parse TLV packets (OEPL format: [packet_number:1][packet_id:1][fixed_data])
  let offset = 0;
  const packets = new Map<string, Uint8Array>();

  while (offset < data.length - 1) {
    if (offset + 2 > data.length) {
      break; // Not enough data for packet header
    }

    const packetNumber = data[offset];
    const packetType = data[offset + 1];
    offset += 2;

    // Determine packet size based on type
    const packetSize = getPacketSize(packetType);
    if (packetSize === null) {
      console.warn(
        `Unknown packet type 0x${packetType.toString(16).padStart(2, '0')} at offset ${offset - 2}, skipping`
      );
      break;
    }

    // Extract packet data
    if (offset + packetSize > data.length) {
      throw new ConfigParseError(
        `Packet type 0x${packetType.toString(16).padStart(2, '0')} truncated: ` +
          `need ${packetSize} bytes, have ${data.length - offset}`
      );
    }

    const packetData = data.slice(offset, offset + packetSize);
    offset += packetSize;

    // Store packet (use type and number as key)
    const key = `${packetType}-${packetNumber}`;
    packets.set(key, packetData);

    console.debug(
      `Parsed packet: type=0x${packetType.toString(16).padStart(2, '0')}, num=${packetNumber}, size=${packetSize}`
    );
  }

  // Parse packets in a single pass
  // Note: Firmware uses global sequential numbering across all packet types
  let system: SystemConfig | undefined;
  let manufacturer: ManufacturerData | undefined;
  let power: PowerOption | undefined;
  const displays: DisplayConfig[] = [];
  const leds: LedConfig[] = [];
  const sensors: SensorData[] = [];
  const dataBuses: DataBus[] = [];
  const binaryInputs: BinaryInputs[] = [];

  for (const [key, packetData] of packets) {
    const [packetTypeStr] = key.split('-');
    const packetType = parseInt(packetTypeStr, 10);

    switch (packetType) {
      case PACKET_TYPE_SYSTEM:
        system = parseSystemConfig(packetData);
        break;
      case PACKET_TYPE_MANUFACTURER:
        manufacturer = parseManufacturerData(packetData);
        break;
      case PACKET_TYPE_POWER:
        power = parsePowerOption(packetData);
        break;
      case PACKET_TYPE_DISPLAY:
        displays.push(parseDisplayConfig(packetData));
        break;
      case PACKET_TYPE_LED:
        leds.push(parseLedConfig(packetData));
        break;
      case PACKET_TYPE_SENSOR:
        sensors.push(parseSensorData(packetData));
        break;
      case PACKET_TYPE_DATABUS:
        dataBuses.push(parseDataBus(packetData));
        break;
      case PACKET_TYPE_BINARY_INPUT:
        binaryInputs.push(parseBinaryInputs(packetData));
        break;
    }
  }

  return {
    system,
    manufacturer,
    power,
    displays,
    leds,
    sensors,
    dataBuses,
    binaryInputs,
    version, // From firmware wrapper
    minorVersion: 1, // Not stored in device (only single version byte exists)
    loaded: true,
  };
}

/**
 * Get expected size for a packet type.
 *
 * @param packetType - TLV packet type ID
 * @returns Expected packet size in bytes, or null if unknown type
 */
function getPacketSize(packetType: number): number | null {
  const sizes: Record<number, number> = {
    [PACKET_TYPE_SYSTEM]: 22,
    [PACKET_TYPE_MANUFACTURER]: 22,
    [PACKET_TYPE_POWER]: 30, // Fixed: was 32
    [PACKET_TYPE_DISPLAY]: 46, // Fixed: was 66
    [PACKET_TYPE_LED]: 22,
    [PACKET_TYPE_SENSOR]: 30,
    [PACKET_TYPE_DATABUS]: 30, // Fixed: was 28
    [PACKET_TYPE_BINARY_INPUT]: 30, // Fixed: was 29
  };
  return sizes[packetType] ?? null;
}

/**
 * Parse SystemConfig packet (0x01, 22 bytes).
 */
function parseSystemConfig(data: Uint8Array): SystemConfig {
  if (data.length < 22) {
    throw new ConfigParseError(
      `SystemConfig too short: ${data.length} bytes (need 22)`
    );
  }

  return SystemConfig.fromBytes(data);
}

/**
 * Parse ManufacturerData packet (0x02, 22 bytes).
 */
function parseManufacturerData(data: Uint8Array): ManufacturerData {
  if (data.length < 22) {
    throw new ConfigParseError(
      `ManufacturerData too short: ${data.length} bytes (need 22)`
    );
  }

  return ManufacturerData.fromBytes(data);
}

/**
 * Parse PowerOption packet (0x04, 30 bytes).
 */
function parsePowerOption(data: Uint8Array): PowerOption {
  if (data.length < 30) {
    throw new ConfigParseError(
      `PowerOption too short: ${data.length} bytes (need 30)`
    );
  }

  return PowerOption.fromBytes(data);
}

/**
 * Parse DisplayConfig packet (0x20, 46 bytes).
 */
function parseDisplayConfig(data: Uint8Array): DisplayConfig {
  if (data.length < 46) {
    throw new ConfigParseError(
      `DisplayConfig too short: ${data.length} bytes (need 46)`
    );
  }

  return DisplayConfig.fromBytes(data);
}

/**
 * Parse LedConfig packet (0x21, 22 bytes).
 */
function parseLedConfig(data: Uint8Array): LedConfig {
  if (data.length < 22) {
    throw new ConfigParseError(
      `LedConfig too short: ${data.length} bytes (need 22)`
    );
  }

  return LedConfig.fromBytes(data);
}

/**
 * Parse SensorData packet (0x23, 30 bytes).
 */
function parseSensorData(data: Uint8Array): SensorData {
  if (data.length < 30) {
    throw new ConfigParseError(
      `SensorData too short: ${data.length} bytes (need 30)`
    );
  }

  return SensorData.fromBytes(data);
}

/**
 * Parse DataBus packet (0x24, 30 bytes).
 */
function parseDataBus(data: Uint8Array): DataBus {
  if (data.length < 30) {
    throw new ConfigParseError(
      `DataBus too short: ${data.length} bytes (need 30)`
    );
  }

  return DataBus.fromBytes(data);
}

/**
 * Parse BinaryInputs packet (0x25, 30 bytes).
 */
function parseBinaryInputs(data: Uint8Array): BinaryInputs {
  if (data.length < 30) {
    throw new ConfigParseError(
      `BinaryInputs too short: ${data.length} bytes (need 30)`
    );
  }

  return BinaryInputs.fromBytes(data);
}