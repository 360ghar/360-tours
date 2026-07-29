/**
 * QR Code Generator Utility
 * Generates QR codes for tour sharing
 */

import QRCode from 'qrcode';

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULT_OPTIONS: Required<QRCodeOptions> = {
  width: 256,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
  errorCorrectionLevel: 'M',
};

/**
 * Generate QR code as data URL (base64 PNG)
 */
export async function generateQRCodeDataURL(
  url: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      color: mergedOptions.color,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
    });
    return dataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(
  url: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      color: mergedOptions.color,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
    });
    return svg;
  } catch (error) {
    console.error('Failed to generate QR code SVG:', error);
    throw new Error('Failed to generate QR code SVG');
  }
}

/**
 * Download QR code as PNG file
 */
export async function downloadQRCodePNG(
  url: string,
  filename: string = 'qrcode.png',
  options: QRCodeOptions = {}
): Promise<void> {
  const dataUrl = await generateQRCodeDataURL(url, options);

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download QR code as SVG file
 */
export async function downloadQRCodeSVG(
  url: string,
  filename: string = 'qrcode.svg',
  options: QRCodeOptions = {}
): Promise<void> {
  const svg = await generateQRCodeSVG(url, options);

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.download = filename;
  link.href = blobUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(blobUrl);
}

/**
 * Render QR code to a canvas element
 */
export async function renderQRCodeToCanvas(
  canvas: HTMLCanvasElement,
  url: string,
  options: QRCodeOptions = {}
): Promise<void> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  try {
    await QRCode.toCanvas(canvas, url, {
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      color: mergedOptions.color,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
    });
  } catch (error) {
    console.error('Failed to render QR code to canvas:', error);
    throw new Error('Failed to render QR code to canvas');
  }
}
