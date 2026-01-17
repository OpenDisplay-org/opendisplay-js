# @opendisplay/opendisplay

TypeScript library for OpenDisplay BLE e-paper displays using Web Bluetooth API. Control your OpenDisplay devices directly from the browser.

[![npm version](https://badge.fury.io/js/@opendisplay%2Fopendisplay.svg)](https://www.npmjs.com/package/@opendisplay/opendisplay)

## Features

- **Web Bluetooth Integration**: Control OpenDisplay devices directly from the browser
- **Complete Protocol Support**: Image upload, device configuration, firmware management
- **Automatic Image Processing**: Built-in dithering, encoding, and compression
- **Type-Safe**: Full TypeScript support with exported types
- **Device Discovery**: Browser-native device picker
## Browser Compatibility

Web Bluetooth API is required. Supported browsers:

- ✅ Chrome/Edge 56+ (Desktop & Android)
- ✅ Opera 43+ (Desktop & Android)
- ✅ Samsung Internet 6.0+
- ❌ Firefox (no Web Bluetooth support)
- ❌ Safari (no Web Bluetooth support)

**Note**: HTTPS or localhost is required for Web Bluetooth API.

## Installation

### NPM/Bun/Yarn

```bash
npm install @opendisplay/opendisplay
# or
bun add @opendisplay/opendisplay
# or
yarn add @opendisplay/opendisplay
```

### CDN (for quick prototyping)

```html
<script type="module">
  import { OpenDisplayDevice } from 'https://esm.sh/@opendisplay/opendisplay@1.0.0';
  // Your code here
</script>
```

## Quick Start

```typescript
import { OpenDisplayDevice, DitherMode, RefreshMode } from '@opendisplay/opendisplay';

// Create device instance
const device = new OpenDisplayDevice();

// Connect to device (shows browser picker)
await device.connect();

// Device is auto-interrogated on first connect
console.log(`Connected to ${device.width}x${device.height} display`);

// Load image from canvas
const canvas = document.getElementById('myCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

// Upload image
await device.uploadImage(imageData, {
  refreshMode: RefreshMode.FULL,
  ditherMode: DitherMode.FLOYD_STEINBERG,
  compress: true
});

// Disconnect when done
await device.disconnect();
```

## API Documentation

### OpenDisplayDevice

Main class for interacting with OpenDisplay devices.

#### Constructor

```typescript
new OpenDisplayDevice(options?: {
  config?: GlobalConfig;
  capabilities?: DeviceCapabilities;
  device?: BluetoothDevice;
  namePrefix?: string;
})
```

**Options:**
- `config`: Cached device configuration to skip interrogation
- `capabilities`: Minimal device info (width, height, color scheme) to skip interrogation
- `device`: Pre-selected BluetoothDevice instance
- `namePrefix`: Device name filter for picker (e.g., "OpenDisplay")

#### Methods

##### `connect(options?: BLEConnectionOptions): Promise<void>`

Connect to an OpenDisplay device. Shows browser's Bluetooth device picker if no device was provided in constructor.

```typescript
await device.connect();
// or with name filter
await device.connect({ namePrefix: 'OpenDisplay' });
```

Automatically interrogates device on first connect unless config/capabilities were provided.

##### `disconnect(): Promise<void>`

Disconnect from the device.

```typescript
await device.disconnect();
```

##### `uploadImage(imageData: ImageData, options?): Promise<void>`

Upload image to device display. Handles resizing, dithering, encoding, and compression automatically.

**Parameters:**
- `imageData`: Image as ImageData from canvas
- `options.refreshMode`: Display refresh mode (default: `RefreshMode.FULL`)
- `options.ditherMode`: Dithering algorithm (default: `DitherMode.BURKES`)
- `options.compress`: Enable zlib compression (default: `true`)

```typescript
// From canvas
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

await device.uploadImage(imageData, {
  refreshMode: RefreshMode.FULL,
  ditherMode: DitherMode.FLOYD_STEINBERG,
  compress: true
});
```

**Supported Refresh Modes:**
- `RefreshMode.FULL` - Full refresh (recommended, ~15s)
- `RefreshMode.FAST` - Fast refresh if supported (~2s, may have ghosting)
- `RefreshMode.PARTIAL` - Partial refresh if supported

**Supported Dither Modes** (from [@opendisplay/epaper-dithering](https://www.npmjs.com/package/@opendisplay/epaper-dithering)):
- `DitherMode.FLOYD_STEINBERG` - Classic error diffusion (recommended)
- `DitherMode.BURKES` - Burkes error diffusion
- `DitherMode.SIERRA` - Sierra error diffusion
- `DitherMode.ATKINSON` - Atkinson dithering (HyperCard style)
- `DitherMode.STUCKI` - Stucki error diffusion
- `DitherMode.JARVIS` - Jarvis-Judice-Ninke
- `DitherMode.SIMPLE_2D` - Fast 2D error diffusion
- `DitherMode.ORDERED_BAYER_2` - 2x2 Bayer ordered dithering
- `DitherMode.ORDERED_BAYER_4` - 4x4 Bayer ordered dithering

##### `interrogate(): Promise<GlobalConfig>`

Read complete device configuration from device. Automatically called on first connect unless config/capabilities were provided.

```typescript
const config = await device.interrogate();
console.log(`Device has ${config.displays.length} display(s)`);
```

##### `readFirmwareVersion(): Promise<FirmwareVersion>`

Read firmware version from device.

```typescript
const fw = await device.readFirmwareVersion();
console.log(`Firmware v${fw.major}.${fw.minor} (${fw.sha})`);
```

##### `writeConfig(config: GlobalConfig): Promise<void>`

Write configuration to device. Device must be rebooted for changes to take effect.

```typescript
// Read current config
const config = device.config!;

// Modify config
config.displays[0].rotation = 1;

// Write back to device
await device.writeConfig(config);

// Reboot to apply changes
await device.reboot();
```

##### `reboot(): Promise<void>`

Reboot the device. Connection will drop as device resets.

```typescript
await device.reboot();
// Device will disconnect automatically
```

#### Properties

##### `isConnected: boolean`

Check if currently connected to a device.

##### `width: number`

Display width in pixels (throws if not interrogated).

##### `height: number`

Display height in pixels (throws if not interrogated).

##### `colorScheme: ColorScheme`

Display color scheme (throws if not interrogated).

Possible values:
- `ColorScheme.MONO` - Black and white
- `ColorScheme.BWR` - Black, white, red
- `ColorScheme.BWY` - Black, white, yellow
- `ColorScheme.BWRY` - Black, white, red, yellow (4-color)
- `ColorScheme.BWGBRY` - Black, white, green, blue, red, yellow (6-color Spectra)
- `ColorScheme.GRAYSCALE_4` - 4-level grayscale

##### `rotation: number`

Display rotation steps (by 90 degrees) (0, 1, 2, 3).

##### `config: GlobalConfig | null`

Full device configuration (null if not interrogated).

##### `capabilities: DeviceCapabilities | null`

Minimal device info (width, height, colorScheme, rotation).

### Discovery

```typescript
import { discoverDevices } from '@opendisplay/opendisplay';

// Show device picker
const device = await discoverDevices();
// or with name filter
const device = await discoverDevices('OD');
```

### Types

All types are exported for TypeScript users:

```typescript
import type {
  GlobalConfig,
  DisplayConfig,
  DeviceCapabilities,
  FirmwareVersion,
  AdvertisementData
} from '@opendisplay/opendisplay';
```

## Usage Examples

### Basic Image Upload

```typescript
import { OpenDisplayDevice } from '@opendisplay/opendisplay';

const device = new OpenDisplayDevice();
await device.connect();

// Create canvas with image
const canvas = document.createElement('canvas');
canvas.width = device.width;
canvas.height = device.height;
const ctx = canvas.getContext('2d')!;

// Draw something
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = 'black';
ctx.font = '48px Arial';
ctx.fillText('Hello OpenDisplay!', 50, 100);

// Upload to device
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
await device.uploadImage(imageData);

await device.disconnect();
```

### Upload Image from File

```typescript
// HTML: <input type="file" id="imageInput" accept="image/*">

const input = document.getElementById('imageInput') as HTMLInputElement;
input.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // Load image
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  // Convert to ImageData
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Upload
  await device.uploadImage(imageData);
});
```

### Skip Interrogation with Cached Config

```typescript
import { OpenDisplayDevice } from '@opendisplay/opendisplay';

// First connection - interrogate and cache
const device = new OpenDisplayDevice();
await device.connect();
const cachedConfig = device.config!;

// Store config in localStorage
localStorage.setItem('deviceConfig', JSON.stringify(cachedConfig));

// Later - reuse cached config
const savedConfig = JSON.parse(localStorage.getItem('deviceConfig')!);
const fastDevice = new OpenDisplayDevice({ config: savedConfig });
await fastDevice.connect();
// No interrogation needed!
```

### Skip Interrogation with Minimal Capabilities

```typescript
import { OpenDisplayDevice, ColorScheme } from '@opendisplay/opendisplay';

// If you know your device specs
const device = new OpenDisplayDevice({
  capabilities: {
    width: 296,
    height: 128,
    colorScheme: ColorScheme.BWR,
    rotation: 0
  }
});

await device.connect();
// Fast connection - no interrogation!
```

### Read and Modify Device Configuration

```typescript
const device = new OpenDisplayDevice();
await device.connect();

// Read config
const config = await device.interrogate();
console.log(`Display: ${config.displays[0].pixelWidth}x${config.displays[0].pixelHeight}`);
console.log(`Battery: ${config.power?.batteryCapacityMah}mAh`);

// Modify rotation
config.displays[0].rotation = 180;

// Write back
await device.writeConfig(config);
await device.reboot(); // Reboot to apply
```

### Error Handling

```typescript
import {
  OpenDisplayDevice,
  BLEConnectionError,
  BLETimeoutError,
  ProtocolError
} from '@opendisplay/opendisplay';

try {
  const device = new OpenDisplayDevice();
  await device.connect();
  await device.uploadImage(imageData);
} catch (error) {
  if (error instanceof BLEConnectionError) {
    console.error('Failed to connect:', error.message);
  } else if (error instanceof BLETimeoutError) {
    console.error('Operation timed out:', error.message);
  } else if (error instanceof ProtocolError) {
    console.error('Protocol error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Architecture

This library mirrors the architecture of [py-opendisplay](https://github.com/OpenDisplay-org/py-opendisplay):

- **Protocol Layer**: Command builders, response parsers, TLV config handling
- **Transport Layer**: Web Bluetooth wrapper with notification queue
- **Encoding Layer**: Image encoding, compression, bitplane handling
- **Models Layer**: TypeScript interfaces for all data structures
- **Public API**: `OpenDisplayDevice` class and helper functions

## Development

```bash
# Install dependencies
npm install

# Build library
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

## Related Packages

- [@opendisplay/epaper-dithering](https://www.npmjs.com/package/@opendisplay/epaper-dithering) - Dithering algorithms for e-paper displays
- [py-opendisplay](https://github.com/OpenDisplay-org/py-opendisplay) - Python version