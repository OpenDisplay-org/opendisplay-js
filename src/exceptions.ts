/**
 * Exception classes for OpenDisplay library.
 */

export class OpenDisplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenDisplayError';
  }
}

export class BLEConnectionError extends OpenDisplayError {
  constructor(message: string) {
    super(message);
    this.name = 'BLEConnectionError';
  }
}

export class BLETimeoutError extends OpenDisplayError {
  constructor(message: string) {
    super(message);
    this.name = 'BLETimeoutError';
  }
}

export class ProtocolError extends OpenDisplayError {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export class ConfigParseError extends ProtocolError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

export class InvalidResponseError extends ProtocolError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResponseError';
  }
}

export class ImageEncodingError extends OpenDisplayError {
  constructor(message: string) {
    super(message);
    this.name = 'ImageEncodingError';
  }
}