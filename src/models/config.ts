/**
 * TLV configuration data structures.
 *
 * These interfaces map directly to the firmware's TLV packet structures.
 * Reference: OpenDisplayFirmware/src/structs.h
 */

import { ColorScheme } from '@opendisplay/epaper-dithering';
import { BusType, ICType, PowerMode, Rotation } from './enums.js';

/**
 * System configuration (TLV packet type 0x01).
 *
 * Size: 22 bytes (packed struct from firmware)
 */
export interface SystemConfig {
  /** uint16 - IC type identifier */
  icType: number;
  /** uint8 bitfield - Supported communication modes */
  communicationModes: number;
  /** uint8 bitfield - Device capability flags */
  deviceFlags: number;
  /** uint8 - External power pin (0xFF = none) */
  pwrPin: number;
  /** 17 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for SystemConfig
 */
export namespace SystemConfig {
  export const SIZE = 22;

  /**
   * Check if device has external power management pin (DEVICE_FLAG_PWR_PIN).
   */
  export function hasPwrPin(config: SystemConfig): boolean {
    return !!(config.deviceFlags & 0x01);
  }

  /**
   * Check if xiaoinit() should be called after config load - nRF52840 only (DEVICE_FLAG_XIAOINIT).
   */
  export function needsXiaoinit(config: SystemConfig): boolean {
    return !!(config.deviceFlags & 0x02);
  }

  /**
   * Get IC type as enum, or raw int if unknown.
   */
  export function icTypeEnum(config: SystemConfig): ICType | number {
    if (Object.values(ICType).includes(config.icType)) {
      return config.icType as ICType;
    }
    return config.icType;
  }

  /**
   * Parse SystemConfig from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): SystemConfig {
    if (data.length < SIZE) {
      throw new Error(`Invalid SystemConfig size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      icType: view.getUint16(0, true), // little-endian
      communicationModes: view.getUint8(2),
      deviceFlags: view.getUint8(3),
      pwrPin: view.getUint8(4),
      reserved: data.slice(5, 22),
    };
  }
}

/**
 * Manufacturer data (TLV packet type 0x02).
 *
 * Size: 22 bytes (packed struct from firmware)
 */
export interface ManufacturerData {
  /** uint16 - Manufacturer identifier */
  manufacturerId: number;
  /** uint8 - Board type */
  boardType: number;
  /** uint8 - Board revision */
  boardRevision: number;
  /** 18 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for ManufacturerData
 */
export namespace ManufacturerData {
  export const SIZE = 22;

  /**
   * Parse ManufacturerData from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): ManufacturerData {
    if (data.length < SIZE) {
      throw new Error(`Invalid ManufacturerData size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      manufacturerId: view.getUint16(0, true), // little-endian
      boardType: view.getUint8(2),
      boardRevision: view.getUint8(3),
      reserved: data.slice(4, 22),
    };
  }
}

/**
 * Power configuration (TLV packet type 0x04).
 *
 * Size: 30 bytes (packed struct from firmware - corrected from 32)
 */
export interface PowerOption {
  /** uint8 - Power mode identifier */
  powerMode: number;
  /** 3 bytes (24-bit value) - Battery capacity in mAh */
  batteryCapacityMah: number;
  /** uint16 - Sleep timeout in milliseconds */
  sleepTimeoutMs: number;
  /** uint8 - TX power level */
  txPower: number;
  /** uint8 bitfield - Sleep configuration flags */
  sleepFlags: number;
  /** uint8 - Battery sense pin (0xFF = none) */
  batterySensePin: number;
  /** uint8 - Battery sense enable pin (0xFF = none) */
  batterySenseEnablePin: number;
  /** uint8 bitfield - Battery sense flags */
  batterySenseFlags: number;
  /** uint8 - Capacity estimator type */
  capacityEstimator: number;
  /** uint16 - Voltage scaling factor */
  voltageScalingFactor: number;
  /** uint32 - Deep sleep current in microamps */
  deepSleepCurrentUa: number;
  /** uint16 - Deep sleep time in seconds */
  deepSleepTimeSeconds: number;
  /** 10 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for PowerOption
 */
export namespace PowerOption {
  export const SIZE = 30;

  /**
   * Get battery capacity in mAh (already converted from 3-byte array).
   */
  export function batteryMah(config: PowerOption): number {
    return config.batteryCapacityMah;
  }

  /**
   * Get power mode as enum, or raw int if unknown.
   */
  export function powerModeEnum(config: PowerOption): PowerMode | number {
    if (Object.values(PowerMode).includes(config.powerMode)) {
      return config.powerMode as PowerMode;
    }
    return config.powerMode;
  }

  /**
   * Parse PowerOption from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): PowerOption {
    if (data.length < SIZE) {
      throw new Error(`Invalid PowerOption size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Parse 3-byte battery capacity (little-endian)
    const batteryMah = data[1] | (data[2] << 8) | (data[3] << 16);

    return {
      powerMode: view.getUint8(0),
      batteryCapacityMah: batteryMah,
      sleepTimeoutMs: view.getUint16(4, true), // little-endian
      txPower: view.getInt8(6),
      sleepFlags: view.getUint8(7),
      batterySensePin: view.getUint8(8),
      batterySenseEnablePin: view.getUint8(9),
      batterySenseFlags: view.getUint8(10),
      capacityEstimator: view.getUint8(11),
      voltageScalingFactor: view.getUint16(12, true), // little-endian
      deepSleepCurrentUa: view.getUint32(14, true), // little-endian
      deepSleepTimeSeconds: view.getUint16(18, true), // little-endian
      reserved: data.slice(20, 30),
    };
  }
}

/**
 * Display configuration (TLV packet type 0x20, repeatable max 4).
 *
 * Size: 46 bytes (packed struct from firmware - corrected from 66)
 */
export interface DisplayConfig {
  /** uint8 - Display instance number (0-3) */
  instanceNumber: number;
  /** uint8 - Display technology type */
  displayTechnology: number;
  /** uint16 - Panel IC type */
  panelIcType: number;
  /** uint16 - Display width in pixels */
  pixelWidth: number;
  /** uint16 - Display height in pixels */
  pixelHeight: number;
  /** uint16 - Active area width in millimeters */
  activeWidthMm: number;
  /** uint16 - Active area height in millimeters */
  activeHeightMm: number;
  /** uint16 - Tag type (legacy) */
  tagType: number;
  /** uint8 - Display rotation in degrees */
  rotation: number;
  /** uint8 - Reset pin (0xFF = none) */
  resetPin: number;
  /** uint8 - Busy pin (0xFF = none) */
  busyPin: number;
  /** uint8 - Data/Command pin (0xFF = none) */
  dcPin: number;
  /** uint8 - Chip select pin (0xFF = none) */
  csPin: number;
  /** uint8 - Data pin */
  dataPin: number;
  /** uint8 - Partial update support level */
  partialUpdateSupport: number;
  /** uint8 - Color scheme identifier */
  colorScheme: number;
  /** uint8 bitfield - Supported transmission modes */
  transmissionModes: number;
  /** uint8 - Clock pin */
  clkPin: number;
  /** 7 bytes - Reserved pin slots */
  reservedPins: Uint8Array;
  /** 15 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for DisplayConfig
 */
export namespace DisplayConfig {
  export const SIZE = 46;

  /**
   * Check if display supports raw image transmission (TRANSMISSION_MODE_RAW).
   */
  export function supportsRaw(config: DisplayConfig): boolean {
    return !!(config.transmissionModes & 0x01);
  }

  /**
   * Check if display supports ZIP compressed transmission (TRANSMISSION_MODE_ZIP).
   */
  export function supportsZip(config: DisplayConfig): boolean {
    return !!(config.transmissionModes & 0x02);
  }

  /**
   * Check if display supports Group 5 compression (TRANSMISSION_MODE_G5).
   */
  export function supportsG5(config: DisplayConfig): boolean {
    return !!(config.transmissionModes & 0x04);
  }

  /**
   * Check if display supports direct write mode - bufferless (TRANSMISSION_MODE_DIRECT_WRITE).
   */
  export function supportsDirectWrite(config: DisplayConfig): boolean {
    return !!(config.transmissionModes & 0x08);
  }

  /**
   * Check if display should clear screen at bootup (TRANSMISSION_MODE_CLEAR_ON_BOOT).
   */
  export function clearOnBoot(config: DisplayConfig): boolean {
    return !!(config.transmissionModes & 0x80);
  }

  /**
   * Get color scheme as enum, or raw int if unknown.
   */
  export function colorSchemeEnum(config: DisplayConfig): ColorScheme | number {
    if (Object.values(ColorScheme).includes(config.colorScheme)) {
      return config.colorScheme as ColorScheme;
    }
    return config.colorScheme;
  }

  /**
   * Get rotation as enum, or raw int if unknown.
   */
  export function rotationEnum(config: DisplayConfig): Rotation | number {
    if (Object.values(Rotation).includes(config.rotation)) {
      return config.rotation as Rotation;
    }
    return config.rotation;
  }

  /**
   * Parse DisplayConfig from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): DisplayConfig {
    if (data.length < SIZE) {
      throw new Error(`Invalid DisplayConfig size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      instanceNumber: view.getUint8(0),
      displayTechnology: view.getUint8(1),
      panelIcType: view.getUint16(2, true), // little-endian
      pixelWidth: view.getUint16(4, true), // little-endian
      pixelHeight: view.getUint16(6, true), // little-endian
      activeWidthMm: view.getUint16(8, true), // little-endian
      activeHeightMm: view.getUint16(10, true), // little-endian
      tagType: view.getUint16(12, true), // little-endian
      rotation: view.getUint8(14),
      resetPin: view.getUint8(15),
      busyPin: view.getUint8(16),
      dcPin: view.getUint8(17),
      csPin: view.getUint8(18),
      dataPin: view.getUint8(19),
      partialUpdateSupport: view.getUint8(20),
      colorScheme: view.getUint8(21),
      transmissionModes: view.getUint8(22),
      clkPin: view.getUint8(23),
      reservedPins: data.slice(24, 31), // 7 pins
      reserved: data.slice(31, 46), // 15 bytes
    };
  }
}

/**
 * LED configuration (TLV packet type 0x21, repeatable max 4).
 *
 * Size: 22 bytes (packed struct from firmware)
 */
export interface LedConfig {
  /** uint8 - LED instance number */
  instanceNumber: number;
  /** uint8 - LED type */
  ledType: number;
  /** uint8 - Red channel pin */
  led1R: number;
  /** uint8 - Green channel pin */
  led2G: number;
  /** uint8 - Blue channel pin */
  led3B: number;
  /** uint8 - 4th channel pin */
  led4: number;
  /** uint8 bitfield - LED configuration flags */
  ledFlags: number;
  /** 15 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for LedConfig
 */
export namespace LedConfig {
  export const SIZE = 22;

  /**
   * Parse LedConfig from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): LedConfig {
    if (data.length < SIZE) {
      throw new Error(`Invalid LedConfig size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      instanceNumber: view.getUint8(0),
      ledType: view.getUint8(1),
      led1R: view.getUint8(2),
      led2G: view.getUint8(3),
      led3B: view.getUint8(4),
      led4: view.getUint8(5),
      ledFlags: view.getUint8(6),
      reserved: data.slice(7, 22),
    };
  }
}

/**
 * Sensor configuration (TLV packet type 0x23, repeatable max 4).
 *
 * Size: 30 bytes (packed struct from firmware)
 */
export interface SensorData {
  /** uint8 - Sensor instance number */
  instanceNumber: number;
  /** uint16 - Sensor type identifier */
  sensorType: number;
  /** uint8 - Data bus ID */
  busId: number;
  /** 26 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for SensorData
 */
export namespace SensorData {
  export const SIZE = 30;

  /**
   * Parse SensorData from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): SensorData {
    if (data.length < SIZE) {
      throw new Error(`Invalid SensorData size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      instanceNumber: view.getUint8(0),
      sensorType: view.getUint16(1, true), // little-endian
      busId: view.getUint8(3),
      reserved: data.slice(4, 30),
    };
  }
}

/**
 * Data bus configuration (TLV packet type 0x24, repeatable max 4).
 *
 * Size: 30 bytes (packed struct from firmware - corrected from 28)
 */
export interface DataBus {
  /** uint8 - Bus instance number */
  instanceNumber: number;
  /** uint8 - Bus type identifier */
  busType: number;
  /** uint8 - Pin 1 (SCL for I2C) */
  pin1: number;
  /** uint8 - Pin 2 (SDA for I2C) */
  pin2: number;
  /** uint8 - Pin 3 */
  pin3: number;
  /** uint8 - Pin 4 */
  pin4: number;
  /** uint8 - Pin 5 */
  pin5: number;
  /** uint8 - Pin 6 */
  pin6: number;
  /** uint8 - Pin 7 */
  pin7: number;
  /** uint32 - Bus speed in Hz */
  busSpeedHz: number;
  /** uint8 bitfield - Bus configuration flags */
  busFlags: number;
  /** uint8 bitfield - Pullup resistors configuration */
  pullups: number;
  /** uint8 bitfield - Pulldown resistors configuration */
  pulldowns: number;
  /** 14 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for DataBus
 */
export namespace DataBus {
  export const SIZE = 30;

  /**
   * Get bus type as enum, or raw int if unknown.
   */
  export function busTypeEnum(config: DataBus): BusType | number {
    if (Object.values(BusType).includes(config.busType)) {
      return config.busType as BusType;
    }
    return config.busType;
  }

  /**
   * Parse DataBus from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): DataBus {
    if (data.length < SIZE) {
      throw new Error(`Invalid DataBus size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      instanceNumber: view.getUint8(0),
      busType: view.getUint8(1),
      pin1: view.getUint8(2),
      pin2: view.getUint8(3),
      pin3: view.getUint8(4),
      pin4: view.getUint8(5),
      pin5: view.getUint8(6),
      pin6: view.getUint8(7),
      pin7: view.getUint8(8),
      busSpeedHz: view.getUint32(9, true), // little-endian
      busFlags: view.getUint8(13),
      pullups: view.getUint8(14),
      pulldowns: view.getUint8(15),
      reserved: data.slice(16, 30),
    };
  }
}

/**
 * Binary inputs configuration (TLV packet type 0x25, repeatable max 4).
 *
 * Size: 30 bytes (packed struct from firmware - corrected from 29)
 */
export interface BinaryInputs {
  /** uint8 - Input instance number */
  instanceNumber: number;
  /** uint8 - Input type */
  inputType: number;
  /** uint8 - Display representation type */
  displayAs: number;
  /** 8 bytes - Reserved pin slots */
  reservedPins: Uint8Array;
  /** uint8 bitfield - Input configuration flags */
  inputFlags: number;
  /** uint8 bitfield - Invert flags */
  invert: number;
  /** uint8 bitfield - Pullup resistors configuration */
  pullups: number;
  /** uint8 bitfield - Pulldown resistors configuration */
  pulldowns: number;
  /** 15 bytes - Reserved for future use */
  reserved: Uint8Array;
}

/**
 * Helper functions for BinaryInputs
 */
export namespace BinaryInputs {
  export const SIZE = 30;

  /**
   * Parse BinaryInputs from TLV packet data.
   */
  export function fromBytes(data: Uint8Array): BinaryInputs {
    if (data.length < SIZE) {
      throw new Error(`Invalid BinaryInputs size: ${data.length} < ${SIZE}`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
      instanceNumber: view.getUint8(0),
      inputType: view.getUint8(1),
      displayAs: view.getUint8(2),
      reservedPins: data.slice(3, 11), // 8 pins
      inputFlags: view.getUint8(11),
      invert: view.getUint8(12),
      pullups: view.getUint8(13),
      pulldowns: view.getUint8(14),
      reserved: data.slice(15, 30),
    };
  }
}

/**
 * Complete device configuration parsed from TLV data.
 *
 * Corresponds to GlobalConfig struct in firmware.
 */
export interface GlobalConfig {
  /** System configuration (single instance) */
  system?: SystemConfig;
  /** Manufacturer data (single instance) */
  manufacturer?: ManufacturerData;
  /** Power configuration (single instance) */
  power?: PowerOption;

  /** Display configurations (max 4) */
  displays: DisplayConfig[];
  /** LED configurations (max 4) */
  leds: LedConfig[];
  /** Sensor configurations (max 4) */
  sensors: SensorData[];
  /** Data bus configurations (max 4) */
  dataBuses: DataBus[];
  /** Binary input configurations (max 4) */
  binaryInputs: BinaryInputs[];

  /** Configuration version from device */
  version: number;
  /** Minor version (not stored in device) */
  minorVersion: number;
  /** Whether config was successfully loaded */
  loaded: boolean;
}