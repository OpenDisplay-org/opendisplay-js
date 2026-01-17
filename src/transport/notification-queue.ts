/**
 * Notification queue for BLE responses.
 *
 * Web Bluetooth delivers notifications asynchronously via events.
 * This queue buffers notifications and provides a Promise-based interface
 * for consuming them, with timeout support.
 */

import { BLETimeoutError } from '../exceptions';

interface PendingResolver {
  resolve: (data: Uint8Array) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

/**
 * Queue for managing BLE notification responses.
 *
 * Handles the asynchronous nature of Web Bluetooth notifications by:
 * - Buffering notifications that arrive before being requested
 * - Queuing requests that wait for future notifications
 * - Providing timeout support for all operations
 */
export class NotificationQueue {
  private queue: Uint8Array[] = [];
  private pendingResolvers: PendingResolver[] = [];

  /**
   * Add a notification to the queue.
   *
   * If there are pending consumers waiting, immediately resolve the oldest one.
   * Otherwise, buffer the notification for future consumption.
   *
   * @param data - Notification data received from BLE characteristic
   */
  enqueue(data: Uint8Array): void {
    if (this.pendingResolvers.length > 0) {
      // Immediately resolve a waiting consumer
      const pending = this.pendingResolvers.shift()!;
      clearTimeout(pending.timeoutId);
      pending.resolve(data);
    } else {
      // Buffer for later
      this.queue.push(data);
    }
  }

  /**
   * Get the next notification from the queue.
   *
   * If a notification is already buffered, return it immediately.
   * Otherwise, wait for the next notification or timeout.
   *
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns Promise that resolves with notification data
   * @throws {BLETimeoutError} If timeout expires before notification arrives
   */
  async dequeue(timeoutMs: number): Promise<Uint8Array> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const index = this.pendingResolvers.findIndex(
          (p) => p.resolve === resolve
        );
        if (index !== -1) {
          this.pendingResolvers.splice(index, 1);
          reject(
            new BLETimeoutError(
              `No response received within ${timeoutMs}ms timeout`
            )
          );
        }
      }, timeoutMs);

      this.pendingResolvers.push({ resolve, reject, timeoutId });
    });
  }

  /**
   * Clear the queue and reject all pending requests.
   *
   * Called when the connection is closed or reset.
   *
   * @param reason - Reason for clearing (default: "Connection closed")
   */
  clear(reason: string = 'Connection closed'): void {
    this.queue = [];

    for (const pending of this.pendingResolvers) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }

    this.pendingResolvers = [];
  }

  /**
   * Get the number of buffered notifications.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Get the number of pending consumers waiting for notifications.
   */
  get pendingCount(): number {
    return this.pendingResolvers.length;
  }
}