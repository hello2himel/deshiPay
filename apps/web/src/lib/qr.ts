/**
 * QR rendering and file helpers used by the app.
 *
 * Encoding/rendering itself lives in `deshiqr-qr`; this module only adapts it for
 * the page (sizes, canvas rasterisation, downloads) and decodes QR screenshots
 * with `jsqr` — the one dependency that is loaded lazily.
 */
import { encode, toSvg } from "deshiqr-qr";

export interface QrSvgOptions {
  margin?: number;
  dark?: string;
  light?: string;
  title?: string;
  ariaLabel?: string;
}

/** Render a payload to a self-contained SVG string. */
export function qrSvg(payload: string, options: QrSvgOptions = {}): string {
  const matrix = encode(payload, { level: "M" });
  return toSvg(matrix, {
    margin: options.margin ?? 2,
    dark: options.dark ?? "#14121c",
    light: options.light ?? "#ffffff",
    title: options.title,
    ariaLabel: options.ariaLabel,
  });
}

/** Rasterise a self-contained SVG string to a transparent-friendly PNG blob. */
export async function svgToRasterBlob(svg: string, width: number, height = width): Promise<Blob> {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This browser could not rasterise the SVG."));
    image.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw on a canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser could not encode the PNG."));
    }, "image/png");
  });
}

/** Rasterise a square QR SVG to a PNG blob (browser only). */
export async function svgToPngBlob(svg: string, size = 1024): Promise<Blob> {
  return svgToRasterBlob(svg, size, size);
}

/** Trigger a browser download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function downloadSvg(svg: string, filename: string): void {
  downloadText(svg, filename, "image/svg+xml;charset=utf-8");
}

export async function downloadPng(svg: string, filename: string, size = 1024): Promise<void> {
  downloadBlob(await svgToPngBlob(svg, size), filename);
}

/** Download an A4-ish poster PNG (2480 × 3508 px, 300 dpi). */
export async function downloadPosterPng(svg: string, filename: string): Promise<void> {
  downloadBlob(await svgToRasterBlob(svg, 2480, 3508), filename);
}

/** Decode the first QR code in an image file (screenshot upload). */
export async function decodeQrFromImage(file: Blob): Promise<string> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot read images. Paste the payload text instead.");
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot read the image.");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const { default: jsQR } = await import("jsqr");
    const result = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
    if (!result || !result.data) {
      throw new Error("No QR code found in that image. Try a clearer screenshot or paste the payload.");
    }
    return result.data;
  } finally {
    bitmap?.close?.();
  }
}
