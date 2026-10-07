export type ErrorCode =
  | 'PDF_LOAD' | 'PDF_ENCRYPTED' | 'FILE_TOO_LARGE' | 'FILE_UNSUPPORTED' | 'FILE_READ'
  | 'CAMERA_PERMISSION' | 'SCANNER_UNAVAILABLE' | 'IMAGE_PROCESS' | 'STORAGE' | 'SHARE' | 'UNKNOWN';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fileName?: string;
  readonly cause?: unknown;

  constructor(code: ErrorCode, opts?: { fileName?: string; cause?: unknown; message?: string }) {
    super(opts?.message ?? code);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AppError';
    this.code = code;
    this.fileName = opts?.fileName;
    this.cause = opts?.cause;
  }
}

export class PdfLoadError extends AppError {
  readonly index?: number;

  constructor(opts?: { index?: number; fileName?: string; cause?: unknown }) {
    super('PDF_LOAD', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PdfLoadError';
    this.index = opts?.index;
  }
}

export class PdfEncryptedError extends AppError {
  readonly index?: number;

  constructor(opts?: { index?: number; fileName?: string; cause?: unknown }) {
    super('PDF_ENCRYPTED', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PdfEncryptedError';
    this.index = opts?.index;
  }
}

export class FileTooLargeError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('FILE_TOO_LARGE', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'FileTooLargeError';
  }
}

export class UnsupportedFileError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('FILE_UNSUPPORTED', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'UnsupportedFileError';
  }
}

export class FileReadError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('FILE_READ', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'FileReadError';
  }
}

export class CameraPermissionError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('CAMERA_PERMISSION', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CameraPermissionError';
  }
}

export class ScannerUnavailableError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('SCANNER_UNAVAILABLE', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ScannerUnavailableError';
  }
}

export class ImageProcessError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('IMAGE_PROCESS', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ImageProcessError';
  }
}

export class StorageError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('STORAGE', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'StorageError';
  }
}

export class ShareError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('SHARE', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ShareError';
  }
}

export class UnknownError extends AppError {
  constructor(opts?: { fileName?: string; cause?: unknown }) {
    super('UNKNOWN', opts);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'UnknownError';
  }
}

// The pdf library's EncryptedPDFError keeps name 'Error' and is identifiable by its constructor name.
function isEncryptedPdfError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === 'EncryptedPDFError' || e.constructor?.name === 'EncryptedPDFError';
}

/** Normalizes anything thrown. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (isEncryptedPdfError(e)) return new PdfEncryptedError({ cause: e });
  return new UnknownError({ cause: e });
}
