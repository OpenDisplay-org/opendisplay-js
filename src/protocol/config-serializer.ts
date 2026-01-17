/**
 * TLV configuration serializer for OpenDisplay devices.
 */

import type {
  BinaryInputs,
  DataBus,
  DisplayConfig,
  GlobalConfig,
  LedConfig,
  ManufacturerData,
  PowerOption,
  SensorData,
  SystemConfig,
} from '../models/config';

// Packet type IDs (same as config-parser.ts)
const PACKET_TYPE_SYSTEM = 0x01;
const PACKET_TYPE_MANUFACTURER = 0x02;
const PACKET_TYPE_POWER = 0x04;
const PACKET_TYPE_DISPLAY = 0x20;
const PACKET_TYPE_LED = 0x21;
const PACKET_TYPE_SENSOR = 0x23;
const PACKET_TYPE_DATABUS = 0x24;
const PACKET_TYPE_BINARY_INPUT = 0x25;

/**
 * Calculate CRC32 and return lower 16 bits.
 *
 * Uses standard CRC32 algorithm (same as zlib/firmware) but only returns
 * the lower 16 bits for backwards compatibility with firmware.
 *
 * @param data - Config data to calculate CRC over
 * @returns Lower 16 bits of CRC32 value
 */
export function calculateConfigCrc(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }

  const crc32 = (~crc) >>> 0;
  return crc32 & 0xffff; // Return lower 16 bits only
}

/**
 * Serialize SystemConfig to 22 bytes.
 */
export function serializeSystemConfig(config: SystemConfig): Uint8Array {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint16(0, config.icType, true);
  view.setUint8(2, config.communicationModes);
  view.setUint8(3, config.deviceFlags);
  view.setUint8(4, config.pwrPin);

  // Reserved bytes (17 bytes)
  const reserved = config.reserved || new Uint8Array(17);
  result.set(reserved.subarray(0, 17), 5);

  return result;
}

/**
 * Serialize ManufacturerData to 22 bytes.
 */
export function serializeManufacturerData(
  config: ManufacturerData
): Uint8Array {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint16(0, config.manufacturerId, true);
  view.setUint8(2, config.boardType);
  view.setUint8(3, config.boardRevision);

  // Reserved bytes (18 bytes)
  const reserved = config.reserved || new Uint8Array(18);
  result.set(reserved.subarray(0, 18), 4);

  return result;
}

/**
 * Serialize PowerOption to 30 bytes.
 */
export function serializePowerOption(config: PowerOption): Uint8Array {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, config.powerMode);

  // 3-byte battery capacity (little-endian)
  view.setUint8(1, config.batteryCapacityMah & 0xff);
  view.setUint8(2, (config.batteryCapacityMah >> 8) & 0xff);
  view.setUint8(3, (config.batteryCapacityMah >> 16) & 0xff);

  view.setUint16(4, config.sleepTimeoutMs, true);
  view.setInt8(6, config.txPower);
  view.setUint8(7, config.sleepFlags);
  view.setUint8(8, config.batterySensePin);
  view.setUint8(9, config.batterySenseEnablePin);
  view.setUint8(10, config.batterySenseFlags);
  view.setUint8(11, config.capacityEstimator);
  view.setUint16(12, config.voltageScalingFactor, true);
  view.setUint32(14, config.deepSleepCurrentUa, true);
  view.setUint16(18, config.deepSleepTimeSeconds, true);

  // Reserved bytes (10 bytes)
  const reserved = config.reserved || new Uint8Array(10);
  result.set(reserved.subarray(0, 10), 20);

  return result;
}

/**
 * Serialize DisplayConfig to 46 bytes.
 */
export function serializeDisplayConfig(config: DisplayConfig): Uint8Array {
  const buffer = new ArrayBuffer(46);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, config.instanceNumber);
  view.setUint8(1, config.displayTechnology);
  view.setUint16(2, config.panelIcType, true);
  view.setUint16(4, config.pixelWidth, true);
  view.setUint16(6, config.pixelHeight, true);
  view.setUint16(8, config.activeWidthMm, true);
  view.setUint16(10, config.activeHeightMm, true);
  view.setUint16(12, config.tagType, true);
  view.setUint8(14, config.rotation);
  view.setUint8(15, config.resetPin);
  view.setUint8(16, config.busyPin);
  view.setUint8(17, config.dcPin);
  view.setUint8(18, config.csPin);
  view.setUint8(19, config.dataPin);
  view.setUint8(20, config.partialUpdateSupport);
  view.setUint8(21, config.colorScheme);
  view.setUint8(22, config.transmissionModes);
  view.setUint8(23, config.clkPin);

  // Reserved pins (7 bytes)
  const reservedPins = config.reservedPins || new Uint8Array(7).fill(0xff);
  result.set(reservedPins.subarray(0, 7), 24);

  // Reserved bytes (15 bytes)
  const reserved = config.reserved || new Uint8Array(15);
  result.set(reserved.subarray(0, 15), 31);

  return result;
}

/**
 * Serialize LedConfig to 22 bytes.
 */
export function serializeLedConfig(config: LedConfig): Uint8Array {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, config.instanceNumber);
  view.setUint8(1, config.ledType);
  view.setUint8(2, config.led1R);
  view.setUint8(3, config.led2G);
  view.setUint8(4, config.led3B);
  view.setUint8(5, config.led4);
  view.setUint8(6, config.ledFlags);

  // Reserved bytes (15 bytes)
  const reserved = config.reserved || new Uint8Array(15);
  result.set(reserved.subarray(0, 15), 7);

  return result;
}

/**
 * Serialize SensorData to 30 bytes.
 */
export function serializeSensorData(config: SensorData): Uint8Array {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, config.instanceNumber);
  view.setUint16(1, config.sensorType, true);
  view.setUint8(3, config.busId);

  // Reserved bytes (26 bytes)
  const reserved = config.reserved || new Uint8Array(26);
  result.set(reserved.subarray(0, 26), 4);

  return result;
}

/**
 * Serialize DataBus to 30 bytes.
 */
export function serializeDataBus(config: DataBus): Uint8Array {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, config.instanceNumber);
  view.setUint8(1, config.busType);
  view.setUint8(2, config.pin1);
  view.setUint8(3, config.pin2);
  view.setUint8(4, config.pin3);
  view.setUint8(5, config.pin4);
  view.setUint8(6, config.pin5);
  view.setUint8(7, config.pin6);
  view.setUint8(8, config.pin7);
  view.setUint32(9, config.busSpeedHz, true);
  view.setUint8(13, config.busFlags);
  view.setUint8(14, config.pullups);
  view.setUint8(15, config.pulldowns);

  // Reserved bytes (14 bytes)
  const reserved = config.reserved || new Uint8Array(14);
  result.set(reserved.subarray(0, 14), 16);

  return result;
}

/**
 * Serialize BinaryInputs to 30 bytes.
 */
export function serializeBinaryInputs(config: BinaryInputs): Uint8Array {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, config.instanceNumber);
  view.setUint8(1, config.inputType);
  view.setUint8(2, config.displayAs);

  // Reserved pins (8 bytes)
  const reservedPins = config.reservedPins || new Uint8Array(8);
  result.set(reservedPins.subarray(0, 8), 3);

  view.setUint8(11, config.inputFlags);
  view.setUint8(12, config.invert);
  view.setUint8(13, config.pullups);
  view.setUint8(14, config.pulldowns);

  // Reserved bytes (15 bytes)
  const reserved = config.reserved || new Uint8Array(15);
  result.set(reserved.subarray(0, 15), 15);

  return result;
}

/**
 * Serialize complete GlobalConfig to TLV binary format.
 *
 * Format:
 * [2 bytes: padding/reserved]
 * [1 byte: version]
 * [TLV packets...]
 * [2 bytes: CRC16 (lower 16 bits of CRC32)]
 *
 * TLV Packet Format:
 * [1 byte: packet_number]  // 0-3 for repeatable types
 * [1 byte: packet_type]    // 0x01, 0x02, 0x04, 0x20-0x25
 * [N bytes: fixed-size data]
 *
 * @param config - GlobalConfig to serialize
 * @returns Complete config data ready to send to device
 * @throws {Error} If config exceeds maximum size (4096 bytes)
 */
export function serializeConfig(config: GlobalConfig): Uint8Array {
  // Build packet data in chunks
  const chunks: Uint8Array[] = [];

  // Start with 2 bytes padding and 1 byte version
  const header = new Uint8Array([0x00, 0x00, config.version]);
  chunks.push(header);

  // Serialize single-instance packets
  if (config.system) {
    chunks.push(new Uint8Array([0, PACKET_TYPE_SYSTEM]));
    chunks.push(serializeSystemConfig(config.system));
  }

  if (config.manufacturer) {
    chunks.push(new Uint8Array([0, PACKET_TYPE_MANUFACTURER]));
    chunks.push(serializeManufacturerData(config.manufacturer));
  }

  if (config.power) {
    chunks.push(new Uint8Array([0, PACKET_TYPE_POWER]));
    chunks.push(serializePowerOption(config.power));
  }

  // Serialize repeatable packets (max 4 instances each)
  for (let i = 0; i < Math.min(config.displays.length, 4); i++) {
    chunks.push(new Uint8Array([i, PACKET_TYPE_DISPLAY]));
    chunks.push(serializeDisplayConfig(config.displays[i]));
  }

  for (let i = 0; i < Math.min(config.leds.length, 4); i++) {
    chunks.push(new Uint8Array([i, PACKET_TYPE_LED]));
    chunks.push(serializeLedConfig(config.leds[i]));
  }

  for (let i = 0; i < Math.min(config.sensors.length, 4); i++) {
    chunks.push(new Uint8Array([i, PACKET_TYPE_SENSOR]));
    chunks.push(serializeSensorData(config.sensors[i]));
  }

  for (let i = 0; i < Math.min(config.dataBuses.length, 4); i++) {
    chunks.push(new Uint8Array([i, PACKET_TYPE_DATABUS]));
    chunks.push(serializeDataBus(config.dataBuses[i]));
  }

  for (let i = 0; i < Math.min(config.binaryInputs.length, 4); i++) {
    chunks.push(new Uint8Array([i, PACKET_TYPE_BINARY_INPUT]));
    chunks.push(serializeBinaryInputs(config.binaryInputs[i]));
  }

  // Calculate total size
  const totalDataSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  // Validate size (max 4096 bytes including CRC)
  if (totalDataSize + 2 > 4096) {
    throw new Error(
      `Config size ${totalDataSize + 2} bytes exceeds maximum 4096 bytes`
    );
  }

  // Concatenate all chunks
  const packetData = new Uint8Array(totalDataSize);
  let offset = 0;
  for (const chunk of chunks) {
    packetData.set(chunk, offset);
    offset += chunk.length;
  }

  // Calculate CRC over packet data (excluding CRC itself)
  const crc16 = calculateConfigCrc(packetData);

  // Append CRC as 2 bytes little-endian
  const result = new Uint8Array(totalDataSize + 2);
  result.set(packetData, 0);

  const crcView = new DataView(result.buffer, totalDataSize, 2);
  crcView.setUint16(0, crc16, true);

  return result;
}