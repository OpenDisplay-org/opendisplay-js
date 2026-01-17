/**
 * BLE device discovery for OpenDisplay devices.
 *
 * Note: Web Bluetooth API does not provide general scanning like Python's Bleak.
 * Instead, we use requestDevice() which shows a browser picker dialog.
 */

import { MANUFACTURER_ID, SERVICE_UUID } from './protocol/constants';

/**
 * Discover OpenDisplay BLE devices using browser picker.
 *
 * Shows the browser's device picker dialog filtered to OpenDisplay devices.
 * User selects a device, and we return it for connection.
 *
 * @param namePrefix - Optional name prefix filter (e.g., "OpenDisplay")
 * @returns Selected BluetoothDevice
 * @throws {Error} If Web Bluetooth not supported or user cancels
 *
 * @example
 * ```typescript
 * const device = await discoverDevices();
 * // or with name filter:
 * const device = await discoverDevices('OpenDisplay');
 * ```
 */
export async function discoverDevices(
  namePrefix?: string
): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error(
      'Web Bluetooth API not supported in this browser. ' +
        'Try Chrome, Edge, or Opera on desktop/Android.'
    );
  }

  const filters: BluetoothLEScanFilter[] = [];

  // Create filter with service UUID and optional name prefix
  if (namePrefix) {
    filters.push({
      services: [SERVICE_UUID],
      namePrefix,
    });
  } else {
    filters.push({
      services: [SERVICE_UUID],
    });
  }

  // Add manufacturer data filter
  filters.push({
    manufacturerData: [
      {
        companyIdentifier: MANUFACTURER_ID,
      },
    ],
  });

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices: [SERVICE_UUID],
    });

    console.log(`Selected device: ${device.name || 'Unknown'}`);
    return device;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Device selection failed: ${error.message}`);
    }
    throw new Error('Device selection cancelled or failed');
  }
}