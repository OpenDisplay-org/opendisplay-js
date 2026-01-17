/**
 * Web Bluetooth connection wrapper for OpenDisplay devices.
 *
 * Provides a clean interface for BLE operations:
 * - Device discovery and connection
 * - Command transmission
 * - Response reception with queuing
 * - Automatic reconnection handling
 */

import { BLEConnectionError, BLETimeoutError } from '../exceptions';
import { SERVICE_UUID, MANUFACTURER_ID } from '../protocol/constants';
import { NotificationQueue } from './notification-queue';

/**
 * Connection options for BLE device.
 */
export interface BLEConnectionOptions {
  /**
   * Name prefix to filter devices (e.g., "OpenDisplay")
   * If not provided, user will see all devices with the OpenDisplay service
   */
  namePrefix?: string;

  /**
   * Optional BluetoothDevice to connect to directly
   */
  device?: BluetoothDevice;
}

/**
 * BLE connection manager for OpenDisplay devices.
 *
 * Handles all low-level Web Bluetooth operations and provides a
 * command/response interface for the protocol layer.
 */
export class BLEConnection {
  private device: BluetoothDevice | null = null;
  private gattServer: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private notificationQueue = new NotificationQueue();
  private disconnectHandler: ((event: Event) => void) | null = null;

  /**
   * Check if currently connected to a device.
   */
  get isConnected(): boolean {
    return this.gattServer?.connected ?? false;
  }

  /**
   * Get the connected device name, if available.
   */
  get deviceName(): string | undefined {
    return this.device?.name;
  }

  /**
   * Connect to an OpenDisplay device.
   *
   * @param options - Connection options (device or namePrefix filter)
   * @throws {BLEConnectionError} If connection fails
   * @throws {Error} If Web Bluetooth is not supported
   */
  async connect(options: BLEConnectionOptions = {}): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error(
        'Web Bluetooth API not supported in this browser. ' +
          'Try Chrome, Edge, or Opera on desktop/Android.'
      );
    }

    try {
      // Get or request device
      if (options.device) {
        this.device = options.device;
      } else {
        // Request device with filters
        const filters: BluetoothLEScanFilter[] = [];

        // Create filter with service UUID and optional name prefix
        if (options.namePrefix) {
          filters.push({
            services: [SERVICE_UUID],
            namePrefix: options.namePrefix,
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

        this.device = await navigator.bluetooth.requestDevice({
          filters,
          optionalServices: [SERVICE_UUID],
        });
      }

      // Connect to GATT server
      if (!this.device.gatt) {
        throw new BLEConnectionError('Device does not support GATT');
      }

      this.gattServer = await this.device.gatt.connect();

      // Get service and characteristic
      const service = await this.gattServer.getPrimaryService(SERVICE_UUID);
      const characteristics = await service.getCharacteristics();

      if (characteristics.length === 0) {
        throw new BLEConnectionError(
          'No characteristics found in OpenDisplay service'
        );
      }

      // Use the first characteristic (OpenDisplay uses single characteristic)
      this.characteristic = characteristics[0];

      // Start notifications
      await this.characteristic.startNotifications();

      // Bind notification handler
      this.characteristic.addEventListener(
        'characteristicvaluechanged',
        this.handleNotification.bind(this)
      );

      // Listen for disconnection
      this.disconnectHandler = this.handleDisconnect.bind(this);
      this.device.addEventListener(
        'gattserverdisconnected',
        this.disconnectHandler
      );

      console.log(
        `Connected to ${this.device.name || 'OpenDisplay device'}`
      );
    } catch (error) {
      this.cleanup();
      if (error instanceof Error) {
        throw new BLEConnectionError(
          `Failed to connect: ${error.message}`
        );
      }
      throw new BLEConnectionError('Failed to connect to device');
    }
  }

  /**
   * Disconnect from the device.
   */
  async disconnect(): Promise<void> {
    try {
      // Stop notifications if characteristic is available
      if (this.characteristic) {
        try {
          await this.characteristic.stopNotifications();
        } catch {
          // Ignore errors during cleanup
        }
      }

      // Disconnect GATT server
      if (this.gattServer?.connected) {
        this.gattServer.disconnect();
      }
    } finally {
      this.cleanup();
    }
  }

  /**
   * Write a command to the device.
   *
   * @param data - Command data to send
   * @throws {BLEConnectionError} If not connected or write fails
   */
  async writeCommand(data: Uint8Array): Promise<void> {
    if (!this.isConnected || !this.characteristic) {
      throw new BLEConnectionError('Not connected to device');
    }

    try {
      await this.characteristic.writeValueWithResponse(data as BufferSource);
    } catch (error) {
      if (error instanceof Error) {
        throw new BLEConnectionError(
          `Failed to write command: ${error.message}`
        );
      }
      throw new BLEConnectionError('Failed to write command');
    }
  }

  /**
   * Read the next response from the device.
   *
   * @param timeoutMs - Maximum time to wait for response
   * @returns Promise that resolves with response data
   * @throws {BLETimeoutError} If timeout expires
   * @throws {BLEConnectionError} If not connected
   */
  async readResponse(timeoutMs: number): Promise<Uint8Array> {
    if (!this.isConnected) {
      throw new BLEConnectionError('Not connected to device');
    }

    return this.notificationQueue.dequeue(timeoutMs);
  }

  /**
   * Clear the notification queue.
   *
   * Useful for clearing any stale responses before starting a new operation.
   * This drains any buffered notifications and cancels pending read requests.
   */
  clearQueue(): void {
    console.debug(`Clearing notification queue (${this.notificationQueue.size} buffered)`);
    this.notificationQueue.clear('Queue cleared by request');
  }

  /**
   * Handle incoming BLE notifications.
   *
   * @param event - Characteristic value changed event
   */
  private handleNotification(event: Event): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (!characteristic.value) {
      return;
    }

    const data = new Uint8Array(characteristic.value.buffer);
    this.notificationQueue.enqueue(data);
  }

  /**
   * Handle device disconnection.
   */
  private handleDisconnect(): void {
    console.log('Device disconnected');
    this.cleanup();
  }

  /**
   * Clean up resources and reset state.
   */
  private cleanup(): void {
    // Clear notification queue
    this.notificationQueue.clear();

    // Remove event listeners
    if (this.characteristic) {
      this.characteristic.removeEventListener(
        'characteristicvaluechanged',
        this.handleNotification.bind(this)
      );
      this.characteristic = null;
    }

    if (this.device && this.disconnectHandler) {
      this.device.removeEventListener(
        'gattserverdisconnected',
        this.disconnectHandler
      );
      this.disconnectHandler = null;
    }

    this.gattServer = null;
    this.device = null;
  }
}