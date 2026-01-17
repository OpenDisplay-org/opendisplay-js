/**
 * Firmware version data structure.
 */

export interface FirmwareVersion {
  /**
   * Major version number (0-255)
   */
  major: number;

  /**
   * Minor version number (0-255)
   */
  minor: number;

  /**
   * Git commit SHA hash
   */
  sha: string;
}