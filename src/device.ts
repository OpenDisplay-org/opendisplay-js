/**
 * Main OpenDisplay BLE device class.
 */

import { ColorScheme, DitherMode } from '@opendisplay/epaper-dithering';
import { prepareImageForUpload } from './encoding/images';
import { compressImageData } from './encoding/compression';
import { BLEConnectionError, BLETimeoutError, ProtocolError } from './exceptions';
import type { DeviceCapabilities } from './models/capabilities';
import type { GlobalConfig } from './models/config';
import { RefreshMode } from './models/enums';
import type { FirmwareVersion } from './models/firmware';
import {
  CHUNK_SIZE,
  MAX_COMPRESSED_SIZE,
  CommandCode,
} from './protocol/constants';
import {
  buildReadConfigCommand,
  buildReadFwVersionCommand,
  buildRebootCommand,
  buildDirectWriteStartCompressed,
  buildDirectWriteStartUncompressed,
  buildDirectWriteDataCommand,
  buildDirectWriteEndCommand,
  buildWriteConfigCommand,
} from './protocol/commands';
import {
  validateAckResponse,
  parseFirmwareVersion,
  stripCommandEcho,
  checkResponseType,
} from './protocol/responses';
import { parseConfigResponse } from './protocol/config-parser';
import { serializeConfig } from './protocol/config-serializer';
import { BLEConnection, type BLEConnectionOptions } from './transport/connection';

/**
 * OpenDisplay BLE e-paper device.
 *
 * Main API for communicating with OpenDisplay BLE tags.
 *
 * @example
 * ```typescript
 * // Auto-interrogate on first connect
 * const device = new OpenDisplayDevice();
 * await device.connect();
 * await device.uploadImage(imageData);
 * await device.disconnect();
 *
 * // Skip interrogation with cached config
 * const device = new OpenDisplayDevice({ config: cachedConfig });
 * await device.connect();
 *
 * // Skip interrogation with minimal capabilities
 * const caps: DeviceCapabilities = { width: 296, height: 128, colorScheme: ColorScheme.BWR };
 * const device = new OpenDisplayDevice({ capabilities: caps });
 * ```
 */
export class OpenDisplayDevice {
  // BLE operation timeouts (milliseconds)
  static readonly TIMEOUT_FIRST_CHUNK = 10000; // First chunk may take longer
  static readonly TIMEOUT_CHUNK = 2000; // Subsequent chunks
  static readonly TIMEOUT_ACK = 5000; // Command acknowledgments
  static readonly TIMEOUT_REFRESH = 90000; // Display refresh (firmware spec: up to 60s)

  private connection: BLEConnection | null = null;
  private _config: GlobalConfig | null = null;
  private _capabilities: DeviceCapabilities | null = null;
  private _fwVersion: FirmwareVersion | null = null;

  /**
   * Initialize OpenDisplay device.
   *
   * @param options - Device initialization options
   */
  constructor(
    private options: {
      config?: GlobalConfig;
      capabilities?: DeviceCapabilities;
      device?: BluetoothDevice;
      namePrefix?: string;
    } = {}
  ) {
    this._config = options.config ?? null;
    this._capabilities = options.capabilities ?? null;
  }

  /**
   * Get full device configuration (if interrogated).
   */
  get config(): GlobalConfig | null {
    return this._config;
  }

  /**
   * Get device capabilities (width, height, color scheme, rotation).
   */
  get capabilities(): DeviceCapabilities | null {
    return this._capabilities;
  }

  /**
   * Get display width in pixels.
   */
  get width(): number {
    return this.ensureCapabilities().width;
  }

  /**
   * Get display height in pixels.
   */
  get height(): number {
    return this.ensureCapabilities().height;
  }

  /**
   * Get display color scheme.
   */
  get colorScheme(): ColorScheme {
    return this.ensureCapabilities().colorScheme;
  }

  /**
   * Get display rotation in degrees.
   */
  get rotation(): number {
    return this.ensureCapabilities().rotation ?? 0;
  }

  /**
   * Check if currently connected to a device.
   */
  get isConnected(): boolean {
    return this.connection?.isConnected ?? false;
  }

  /**
   * Connect to an OpenDisplay device and optionally interrogate.
   *
   * @param connectionOptions - Optional connection parameters
   * @throws {BLEConnectionError} If connection fails
   */
  async connect(connectionOptions?: BLEConnectionOptions): Promise<void> {
    // Create connection
    this.connection = new BLEConnection();

    // Merge provided options with constructor options
    const mergedOptions: BLEConnectionOptions = {
      ...connectionOptions,
      device: this.options.device ?? connectionOptions?.device,
      namePrefix: this.options.namePrefix ?? connectionOptions?.namePrefix,
    };

    await this.connection.connect(mergedOptions);

    // Auto-interrogate if no config or capabilities provided
    if (!this._config && !this._capabilities) {
      console.log('No config provided, auto-interrogating device');
      await this.interrogate();
    }

    // Extract capabilities from config if available
    if (this._config && !this._capabilities) {
      this._capabilities = this.extractCapabilitiesFromConfig();
    }
  }

  /**
   * Disconnect from the device.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
  }

  /**
   * Read device configuration from device.
   *
   * @returns GlobalConfig with complete device configuration
   * @throws {ProtocolError} If interrogation fails
   */
  async interrogate(): Promise<GlobalConfig> {
    this.ensureConnected();

    console.log('Interrogating device');

    // Send read config command
    const cmd = buildReadConfigCommand();
    await this.connection!.writeCommand(cmd);

    // Read first chunk
    const response = await this.connection!.readResponse(
      OpenDisplayDevice.TIMEOUT_FIRST_CHUNK
    );
    const chunkData = stripCommandEcho(response, CommandCode.READ_CONFIG);

    // Parse first chunk header
    const view = new DataView(chunkData.buffer, chunkData.byteOffset);
    const totalLength = view.getUint16(2, true); // little-endian
    const tlvData: Uint8Array[] = [chunkData.subarray(4)];
    let currentLength = chunkData.length - 4;

    console.debug(`First chunk: ${chunkData.length} bytes, total length: ${totalLength}`);

    // Read remaining chunks
    while (currentLength < totalLength) {
      const nextResponse = await this.connection!.readResponse(
        OpenDisplayDevice.TIMEOUT_CHUNK
      );
      const nextChunkData = stripCommandEcho(nextResponse, CommandCode.READ_CONFIG);

      // Skip chunk number field (2 bytes) and append data
      tlvData.push(nextChunkData.subarray(2));
      currentLength += nextChunkData.length - 2;

      console.debug(`Received chunk, total: ${currentLength}/${totalLength} bytes`);
    }

    console.log(`Received complete TLV data: ${currentLength} bytes`);

    // Concatenate all chunks
    const completeData = new Uint8Array(currentLength);
    let offset = 0;
    for (const chunk of tlvData) {
      completeData.set(chunk, offset);
      offset += chunk.length;
    }

    // Parse complete config response (handles wrapper strip)
    this._config = parseConfigResponse(completeData);
    this._capabilities = this.extractCapabilitiesFromConfig();

    console.log(
      `Interrogated device: ${this.width}x${this.height}, ` +
        `${ColorScheme[this.colorScheme]}, rotation=${this.rotation}°`
    );

    return this._config;
  }

  /**
   * Read firmware version from device.
   *
   * @returns FirmwareVersion with major, minor, and sha fields
   */
  async readFirmwareVersion(): Promise<FirmwareVersion> {
    this.ensureConnected();

    console.log('Reading firmware version');

    // Send read firmware version command
    const cmd = buildReadFwVersionCommand();
    await this.connection!.writeCommand(cmd);

    // Read response
    const response = await this.connection!.readResponse(
      OpenDisplayDevice.TIMEOUT_ACK
    );

    // Parse version (includes SHA hash)
    this._fwVersion = parseFirmwareVersion(response);

    console.log(
      `Firmware version: ${this._fwVersion.major}.${this._fwVersion.minor} ` +
        `(SHA: ${this._fwVersion.sha.substring(0, 8)}...)`
    );

    return this._fwVersion;
  }

  /**
   * Reboot the device.
   *
   * Sends a reboot command to the device, which will cause an immediate
   * system reset. The device will NOT send an ACK response - it simply
   * resets after a 100ms delay.
   *
   * Warning: The BLE connection will be forcibly terminated when the device
   * resets. This is expected behavior. The device will restart and begin
   * advertising again after the reset completes (typically within a few seconds).
   *
   * @throws {BLEConnectionError} If command cannot be sent
   */
  async reboot(): Promise<void> {
    this.ensureConnected();

    console.log('Sending reboot command to device');

    // Build and send reboot command
    const cmd = buildRebootCommand();
    await this.connection!.writeCommand(cmd);

    // Device will reset immediately - no ACK expected
    console.log('Reboot command sent - device will reset (connection will drop)');
  }

  /**
   * Write configuration to device.
   *
   * Serializes the GlobalConfig to TLV binary format and writes it
   * to the device using the WRITE_CONFIG (0x0041) command with
   * automatic chunking for large configs.
   *
   * @param config - GlobalConfig to write to device
   * @throws {Error} If config serialization fails or exceeds size limit
   * @throws {BLEConnectionError} If write fails
   * @throws {ProtocolError} If device returns error response
   *
   * @example
   * ```typescript
   * // Read current config
   * const config = device.config;
   *
   * // Modify config
   * config.displays[0].rotation = 180;
   *
   * // Write back to device
   * await device.writeConfig(config);
   *
   * // Reboot to apply changes
   * await device.reboot();
   * ```
   */
  async writeConfig(config: GlobalConfig): Promise<void> {
    this.ensureConnected();

    console.log('Writing config to device');

    // Validate critical packets are present
    if (!config.system) {
      console.warn('Config missing system packet - device may not boot correctly');
    }
    if (!config.displays || config.displays.length === 0) {
      throw new Error('Config must have at least one display');
    }

    // Warn about optional but important packets
    const missingPackets: string[] = [];
    if (!config.manufacturer) {
      missingPackets.push('manufacturer');
    }
    if (!config.power) {
      missingPackets.push('power');
    }

    if (missingPackets.length > 0) {
      console.warn(
        `Config missing optional packets: ${missingPackets.join(', ')}. ` +
          'Device may lose these settings.'
      );
    }

    // Serialize config to binary
    const configData = serializeConfig(config);

    console.log(
      `Serialized config: ${configData.length} bytes ` +
        `(chunking ${configData.length > 200 ? 'required' : 'not needed'})`
    );

    // Build command with chunking
    const [firstCmd, chunkCmds] = buildWriteConfigCommand(configData);

    // Send first command
    console.debug(`Sending first config chunk (${firstCmd.length} bytes)`);
    await this.connection!.writeCommand(firstCmd);

    // Wait for ACK
    let response = await this.connection!.readResponse(
      OpenDisplayDevice.TIMEOUT_ACK
    );
    validateAckResponse(response, CommandCode.WRITE_CONFIG);

    // Send remaining chunks if needed
    for (let i = 0; i < chunkCmds.length; i++) {
      const chunkCmd = chunkCmds[i];
      console.debug(
        `Sending config chunk ${i + 1}/${chunkCmds.length} (${chunkCmd.length} bytes)`
      );
      await this.connection!.writeCommand(chunkCmd);

      // Wait for ACK after each chunk
      response = await this.connection!.readResponse(
        OpenDisplayDevice.TIMEOUT_ACK
      );
      validateAckResponse(response, CommandCode.WRITE_CONFIG_CHUNK);
    }

    console.log('Config written successfully');
  }

  /**
   * Upload image to device display.
   *
   * Automatically handles:
   * - Image resizing to display dimensions
   * - Dithering based on color scheme
   * - Encoding to device format
   * - Compression
   * - Direct write protocol
   *
   * @param imageData - Image as ImageData (from canvas or OffscreenCanvas)
   * @param options - Upload options
   * @throws {Error} If device not interrogated/configured
   * @throws {ProtocolError} If upload fails
   *
   * @example
   * ```typescript
   * const canvas = document.getElementById('myCanvas') as HTMLCanvasElement;
   * const ctx = canvas.getContext('2d')!;
   * const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
   *
   * await device.uploadImage(imageData, {
   *   refreshMode: RefreshMode.FULL,
   *   ditherMode: DitherMode.BURKES,
   *   compress: true,
   *   onProgress: (current, total, stage) => {
   *     console.log(`${stage}: ${current}/${total} (${Math.floor(current/total*100)}%)`);
   *   }
   * });
   * ```
   */
  async uploadImage(
    imageData: ImageData,
    options: {
      refreshMode?: RefreshMode;
      ditherMode?: DitherMode;
      compress?: boolean;
      onProgress?: (current: number, total: number, stage: string) => void;
      onStatusChange?: (message: string) => void;
      onUploadComplete?: (uploadTimeSeconds: number) => void;
      onComplete?: (uploadTime: number, refreshTime: number, totalTime: number) => void;
    } = {}
  ): Promise<void> {
    this.ensureConnected();
    this.ensureCapabilities();

    const refreshMode = options.refreshMode ?? RefreshMode.FULL;
    const ditherMode = options.ditherMode ?? DitherMode.BURKES;
    const compress = options.compress ?? true;
    const onProgress = options.onProgress;
    const onStatusChange = options.onStatusChange;
    const onUploadComplete = options.onUploadComplete;
    const onComplete = options.onComplete;

    console.log(
      `Uploading image (${this.width}x${this.height}, ${ColorScheme[this.colorScheme]})`
    );

    // Prepare image (resize, dither, encode)
    onStatusChange?.('Preparing image...');
    const encodedData = prepareImageForUpload(
      imageData,
      this.width,
      this.height,
      this.colorScheme,
      ditherMode
    );

    // Choose protocol based on compression and size
    let compressedData: Uint8Array | null = null;
    if (compress) {
      onStatusChange?.('Compressing...');
      compressedData = compressImageData(encodedData, 6);

      if (compressedData.length < MAX_COMPRESSED_SIZE) {
        console.log(`Using compressed upload protocol (size: ${compressedData.length} bytes)`);
        onStatusChange?.('Uploading...');
        await this.executeUpload({
          imageData: encodedData,
          refreshMode,
          useCompression: true,
          compressedData,
          uncompressedSize: encodedData.length,
          onProgress,
          onStatusChange,
          onUploadComplete,
          onComplete,
        });
      } else {
        console.log(
          `Compressed size exceeds ${MAX_COMPRESSED_SIZE} bytes, using uncompressed protocol`
        );
        onStatusChange?.('Uploading...');
        await this.executeUpload({
          imageData: encodedData,
          refreshMode,
          onProgress,
          onStatusChange,
          onUploadComplete,
          onComplete,
        });
      }
    } else {
      console.log('Compression disabled, using uncompressed protocol');
      onStatusChange?.('Uploading...');
      await this.executeUpload({
        imageData: encodedData,
        refreshMode,
        onProgress,
        onStatusChange,
        onUploadComplete,
        onComplete,
      });
    }

    console.log('Image upload complete');
    onStatusChange?.('Upload complete!');
  }

  /**
   * Execute image upload using compressed or uncompressed protocol.
   */
  private async executeUpload(params: {
    imageData: Uint8Array;
    refreshMode: RefreshMode;
    useCompression?: boolean;
    compressedData?: Uint8Array;
    uncompressedSize?: number;
    onProgress?: (current: number, total: number, stage: string) => void;
    onStatusChange?: (message: string) => void;
    onUploadComplete?: (uploadTimeSeconds: number) => void;
    onComplete?: (uploadTime: number, refreshTime: number, totalTime: number) => void;
  }): Promise<void> {
    const {
      imageData,
      refreshMode,
      useCompression = false,
      compressedData,
      uncompressedSize,
      onProgress,
      onStatusChange,
      onUploadComplete,
      onComplete,
    } = params;

    // Clear any stale responses from previous operations
    this.connection!.clearQueue();

    const uploadStartTime = Date.now();

    // 1. Send START command (different for each protocol)
    let startCmd: Uint8Array;
    let remainingCompressed: Uint8Array | null = null;

    if (useCompression && compressedData && uncompressedSize) {
      [startCmd, remainingCompressed] = buildDirectWriteStartCompressed(
        uncompressedSize,
        compressedData
      );
    } else {
      startCmd = buildDirectWriteStartUncompressed();
    }

    await this.connection!.writeCommand(startCmd);

    // 2. Wait for START ACK (identical for both protocols)
    let response = await this.connection!.readResponse(
      OpenDisplayDevice.TIMEOUT_ACK
    );
    validateAckResponse(response, CommandCode.DIRECT_WRITE_START);

    // 3. Send data chunks
    let autoCompleted = false;
    if (useCompression && remainingCompressed && remainingCompressed.length > 0) {
      // Compressed upload: send remaining compressed data as chunks
      autoCompleted = await this.sendDataChunks(remainingCompressed, onProgress, onStatusChange);
    } else if (!useCompression) {
      // Uncompressed upload: send raw image data as chunks
      autoCompleted = await this.sendDataChunks(imageData, onProgress, onStatusChange);
    }

    // 4. Send END command if needed (identical for both protocols)
    if (!autoCompleted) {
      const endCmd = buildDirectWriteEndCommand(refreshMode);
      await this.connection!.writeCommand(endCmd);

      // Wait for END ACK
      response = await this.connection!.readResponse(
        OpenDisplayDevice.TIMEOUT_ACK
      );
      validateAckResponse(response, CommandCode.DIRECT_WRITE_END);

      // Upload complete - chunks sent and END acknowledged
      const uploadTime = (Date.now() - uploadStartTime) / 1000;
      onUploadComplete?.(uploadTime);
      onStatusChange?.(
        `Upload complete (${uploadTime.toFixed(1)}s), refreshing display...`
      );

      // 5. Wait for refresh completion notification (0x0073 or 0x0074)
      const refreshStartTime = Date.now();
      const refreshResponse = await this.connection!.readResponse(
        OpenDisplayDevice.TIMEOUT_REFRESH
      );

      const [responseCode] = checkResponseType(refreshResponse);

      if (responseCode === CommandCode.REFRESH_COMPLETE) {
        const refreshTime = (Date.now() - refreshStartTime) / 1000;
        const totalTime = (Date.now() - uploadStartTime) / 1000;
        console.log(
          `Refresh complete (${refreshTime.toFixed(1)}s), total time: ${totalTime.toFixed(1)}s`
        );
        onStatusChange?.(
          `Refresh complete (${refreshTime.toFixed(1)}s)`
        );

        // Call completion callback with all timing info
        onComplete?.(uploadTime, refreshTime, totalTime);
      } else if (responseCode === CommandCode.REFRESH_TIMEOUT) {
        throw new ProtocolError('Display refresh timed out');
      } else {
        throw new ProtocolError(
          `Unexpected refresh response: 0x${responseCode.toString(16).padStart(4, '0')}`
        );
      }
    } else {
      // Auto-completed: device sent END response (0x0072) after receiving all chunks
      const uploadTime = (Date.now() - uploadStartTime) / 1000;
      onUploadComplete?.(uploadTime);
      onStatusChange?.(
        `Upload complete (${uploadTime.toFixed(1)}s), refreshing display...`
      );
      console.log(`Auto-completed upload in ${uploadTime.toFixed(1)}s, waiting for refresh...`);

      // CRITICAL: Still need to wait for REFRESH_COMPLETE (0x0073)!
      // The 0x0072 response only means upload is done, NOT that refresh is complete
      const refreshStartTime = Date.now();
      const refreshResponse = await this.connection!.readResponse(
        OpenDisplayDevice.TIMEOUT_REFRESH
      );

      const [responseCode] = checkResponseType(refreshResponse);

      if (responseCode === CommandCode.REFRESH_COMPLETE) {
        const refreshTime = (Date.now() - refreshStartTime) / 1000;
        const totalTime = (Date.now() - uploadStartTime) / 1000;
        console.log(
          `Refresh complete (${refreshTime.toFixed(1)}s), total time: ${totalTime.toFixed(1)}s`
        );
        onStatusChange?.(
          `Refresh complete (${refreshTime.toFixed(1)}s)`
        );

        // Call completion callback with all timing info
        onComplete?.(uploadTime, refreshTime, totalTime);
      } else if (responseCode === CommandCode.REFRESH_TIMEOUT) {
        throw new ProtocolError('Display refresh timed out');
      } else {
        throw new ProtocolError(
          `Unexpected refresh response: 0x${responseCode.toString(16).padStart(4, '0')}`
        );
      }
    }
  }

  /**
   * Send image data chunks with ACK handling.
   *
   * Sends image data in chunks via 0x0071 DATA commands. Handles:
   * - Timeout recovery when firmware starts display refresh
   * - Auto-completion detection (firmware sends 0x0072 END early)
   * - Progress logging
   *
   * @param imageData - Data to send in chunks
   * @param onProgress - Optional progress callback (current bytes, total bytes, stage)
   * @param onStatusChange - Optional status message callback
   * @returns True if device auto-completed (sent 0x0072 END early), false if all chunks sent normally
   * @throws {ProtocolError} If unexpected response received
   * @throws {BLETimeoutError} If no response within timeout
   */
  private async sendDataChunks(
    imageData: Uint8Array,
    onProgress?: (current: number, total: number, stage: string) => void,
    onStatusChange?: (message: string) => void
  ): Promise<boolean> {
    let bytesSent = 0;
    let chunksSent = 0;

    while (bytesSent < imageData.length) {
      // Get next chunk
      const chunkStart = bytesSent;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, imageData.length);
      const chunkData = imageData.subarray(chunkStart, chunkEnd);

      // Send DATA command
      const dataCmd = buildDirectWriteDataCommand(chunkData);
      await this.connection!.writeCommand(dataCmd);

      bytesSent += chunkData.length;
      chunksSent++;

      // Wait for response after every chunk (PIPELINE_CHUNKS=1)
      let response: Uint8Array;
      try {
        response = await this.connection!.readResponse(
          OpenDisplayDevice.TIMEOUT_ACK
        );
      } catch (error) {
        if (error instanceof BLETimeoutError) {
          // Timeout on response - firmware might be doing display refresh
          console.log(
            `No response after chunk ${chunksSent} ` +
              `(${((bytesSent / imageData.length) * 100).toFixed(1)}%), ` +
              'waiting for device refresh...'
          );
          onStatusChange?.('Refreshing display...');

          // Wait up to 90 seconds for the END response
          response = await this.connection!.readResponse(
            OpenDisplayDevice.TIMEOUT_REFRESH
          );
        } else {
          throw error;
        }
      }

      // Check what response we got (firmware can send 0x0072 on ANY chunk, not just last!)
      const [command, isAck] = checkResponseType(response);

      if (command === CommandCode.DIRECT_WRITE_DATA) {
        // Normal DATA ACK (0x0071) - continue sending chunks
        // Report progress
        onProgress?.(bytesSent, imageData.length, 'upload');
      } else if (command === CommandCode.DIRECT_WRITE_END) {
        // Firmware auto-triggered END (0x0072) after receiving all data
        console.log(
          `Received END response after chunk ${chunksSent} - device auto-completed`
        );
        onProgress?.(imageData.length, imageData.length, 'upload');
        // Note: 0x0072 is sent AFTER display refresh completes
        // So we're already done - no need to send our own 0x0072 END command!
        return true; // Auto-completed
      } else {
        // Unexpected response
        throw new ProtocolError(
          `Unexpected response: ${CommandCode[command]} (0x${command.toString(16).padStart(4, '0')})`
        );
      }

      // Log progress every 50 chunks to reduce spam
      if (chunksSent % 50 === 0 || bytesSent >= imageData.length) {
        console.debug(
          `Sent ${bytesSent}/${imageData.length} bytes ` +
            `(${((bytesSent / imageData.length) * 100).toFixed(1)}%)`
        );
      }
    }

    console.debug(`All data chunks sent (${chunksSent} chunks total)`);
    return false; // Normal completion, caller should send END
  }

  /**
   * Extract DeviceCapabilities from GlobalConfig.
   */
  private extractCapabilitiesFromConfig(): DeviceCapabilities {
    if (!this._config) {
      throw new Error('No config available');
    }

    if (!this._config.displays || this._config.displays.length === 0) {
      throw new Error('Config has no display information');
    }

    const display = this._config.displays[0]; // Primary display

    return {
      width: display.pixelWidth,
      height: display.pixelHeight,
      colorScheme: display.colorScheme as ColorScheme,
      rotation: display.rotation,
    };
  }

  /**
   * Ensure device capabilities are available.
   */
  private ensureCapabilities(): DeviceCapabilities {
    if (!this._capabilities) {
      throw new Error(
        'Device capabilities unknown - interrogate first or provide config/capabilities'
      );
    }
    return this._capabilities;
  }

  /**
   * Ensure device is connected.
   */
  private ensureConnected(): void {
    if (!this.connection || !this.isConnected) {
      throw new BLEConnectionError('Not connected to device');
    }
  }
}