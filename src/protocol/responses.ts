/**
 * BLE response validation and parsing.
 */

import { InvalidResponseError } from '../exceptions';
import { FirmwareVersion } from '../models/firmware';
import { CommandCode, RESPONSE_HIGH_BIT_FLAG } from './constants';

/**
 * Extract 2-byte big-endian command code from response data.
 *
 * @param data - Response data from device
 * @param offset - Byte offset to read from (default: 0)
 * @returns Command code as integer
 */
export function unpackCommandCode(data: Uint8Array, offset: number = 0): number {
  const view = new DataView(data.buffer, data.byteOffset + offset, 2);
  return view.getUint16(0, false); // false = big-endian
}

/**
 * Strip command echo from response data.
 *
 * Firmware echoes commands in responses, sometimes with high bit set.
 * This function removes the 2-byte echo if present.
 *
 * @param data - Response data from device
 * @param expectedCmd - Expected command echo
 * @returns Data with echo stripped (if present), otherwise original data
 */
export function stripCommandEcho(
  data: Uint8Array,
  expectedCmd: CommandCode
): Uint8Array {
  if (data.length >= 2) {
    const echo = unpackCommandCode(data);
    if (echo === expectedCmd || echo === (expectedCmd | RESPONSE_HIGH_BIT_FLAG)) {
      return data.subarray(2);
    }
  }
  return data;
}

/**
 * Check response type and whether it's an ACK.
 *
 * @param response - Raw response data from device
 * @returns Tuple of [commandCode, isAck]
 *   - commandCode: The command code (without high bit)
 *   - isAck: True if response has high bit set (RESPONSE_HIGH_BIT_FLAG)
 */
export function checkResponseType(
  response: Uint8Array
): [CommandCode, boolean] {
  const code = unpackCommandCode(response);
  const isAck = Boolean(code & RESPONSE_HIGH_BIT_FLAG);
  const command = (code & ~RESPONSE_HIGH_BIT_FLAG) as CommandCode;
  return [command, isAck];
}

/**
 * Validate ACK response from device.
 *
 * ACK responses echo the command code (sometimes with high bit set).
 *
 * @param data - Raw response data
 * @param expectedCommand - Command code that was sent
 * @throws {InvalidResponseError} If response invalid or doesn't match command
 */
export function validateAckResponse(
  data: Uint8Array,
  expectedCommand: number
): void {
  if (data.length < 2) {
    throw new InvalidResponseError(
      `ACK too short: ${data.length} bytes (need at least 2)`
    );
  }

  const responseCode = unpackCommandCode(data);

  // Response can be exact echo or with high bit set (RESPONSE_HIGH_BIT_FLAG | cmd)
  const validResponses = new Set([
    expectedCommand,
    expectedCommand | RESPONSE_HIGH_BIT_FLAG,
  ]);

  if (!validResponses.has(responseCode)) {
    throw new InvalidResponseError(
      `ACK mismatch: expected 0x${expectedCommand.toString(16).padStart(4, '0')}, ` +
        `got 0x${responseCode.toString(16).padStart(4, '0')}`
    );
  }
}

/**
 * Parse firmware version response.
 *
 * Format: [echo:2][major:1][minor:1][shaLength:1][sha:variable]
 *
 * @param data - Raw firmware version response
 * @returns FirmwareVersion object with major, minor, and sha fields
 * @throws {InvalidResponseError} If response format invalid
 */
export function parseFirmwareVersion(data: Uint8Array): FirmwareVersion {
  if (data.length < 5) {
    throw new InvalidResponseError(
      `Firmware version response too short: ${data.length} bytes (need at least 5)`
    );
  }

  // Validate echo
  const echo = unpackCommandCode(data);
  if (
    echo !== 0x0043 &&
    echo !== (0x0043 | RESPONSE_HIGH_BIT_FLAG)
  ) {
    throw new InvalidResponseError(
      `Firmware version echo mismatch: expected 0x0043, ` +
        `got 0x${echo.toString(16).padStart(4, '0')}`
    );
  }

  const major = data[2];
  const minor = data[3];
  const shaLength = data[4];

  // SHA hash is always present in firmware responses
  if (shaLength === 0) {
    throw new InvalidResponseError(
      'Firmware version missing SHA hash (shaLength is 0)'
    );
  }

  // Validate sufficient bytes for SHA
  const expectedTotalLength = 5 + shaLength;
  if (data.length < expectedTotalLength) {
    throw new InvalidResponseError(
      `Firmware version response incomplete: expected ${expectedTotalLength} bytes ` +
        `(5 header + ${shaLength} SHA), got ${data.length}`
    );
  }

  // Extract SHA bytes and decode as ASCII string
  const shaBytes = data.subarray(5, 5 + shaLength);
  const textDecoder = new TextDecoder('ascii');
  let sha: string;

  try {
    sha = textDecoder.decode(shaBytes);
  } catch (e) {
    throw new InvalidResponseError(
      `Invalid SHA hash encoding (expected ASCII): ${e}`
    );
  }

  return {
    major,
    minor,
    sha,
  };
}