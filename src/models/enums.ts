/**
 * Enums for OpenDisplay device configuration.
 */

/**
 * Display refresh modes.
 */
export enum RefreshMode {
  FULL = 0,
  FAST = 1,
  PARTIAL = 2,
  PARTIAL2 = 3,
}

/**
 * Microcontroller IC types.
 */
export enum ICType {
  NRF52840 = 1,
  ESP32_S3 = 2,
  ESP32_C3 = 3,
  ESP32_C6 = 4,
}

/**
 * Power source types.
 */
export enum PowerMode {
  BATTERY = 1,
  USB = 2,
  SOLAR = 3,
}

/**
 * Data bus types for sensors.
 */
export enum BusType {
  I2C = 0,
  SPI = 1,
}

/**
 * Display rotation angles in degrees.
 */
export enum Rotation {
  ROTATE_0 = 0,
  ROTATE_90 = 90,
  ROTATE_180 = 180,
  ROTATE_270 = 270,
}