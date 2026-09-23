import {
  fitWithin,
  needsCompression,
  nextQuality,
  rotatedSize,
  START_QUALITY,
  TARGET_BYTES,
  type Size,
} from './image-math';

/** Rectangle in pixels (as reported by the cropper). */
export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Result of compressing a photo. */
export interface CompressedPhoto {
  /** The JPEG file to upload. */
  file: File;
  /** Size of the input in bytes (before compression). */
  originalBytes: number;
  width: number;
  height: number;
  /** JPEG quality that was used. */
  quality: number;
}

/**
 * Decodes an image Blob into an `<img>` element.
 *
 * @param blob - JPEG or PNG data.
 * @returns The loaded image (EXIF orientation is applied by the browser).
 * @throws {Error} If the data cannot be decoded as an image.
 */
export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Cannot decode image'));
    };
    image.src = url;
  });
}

/**
 * Creates a 2D canvas of a given size.
 *
 * @param size - Canvas size in pixels.
 * @returns The canvas and its 2D context.
 * @throws {Error} If the browser cannot create a 2D context.
 */
function createCanvas({ width, height }: Size) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  return { canvas, context };
}

/**
 * Rotates an image by a multiple of 90° and cuts out the chosen area.
 *
 * The cropper reports the area in the coordinates of the rotated image, so the
 * image is first drawn rotated onto a canvas of the rotated bounding box, and the
 * area is then copied from that canvas.
 *
 * @param image - Source image.
 * @param rotationDeg - Rotation (0, 90, 180 or 270).
 * @param area - Area to keep, in rotated-image pixels; the whole image if omitted.
 * @returns A canvas with the rotated, cropped image.
 */
export function rotateAndCrop(
  image: CanvasImageSource & Size,
  rotationDeg: number,
  area?: PixelArea,
): HTMLCanvasElement {
  const bounds = rotatedSize({ width: image.width, height: image.height }, rotationDeg);
  const rotated = createCanvas(bounds);
  rotated.context.translate(bounds.width / 2, bounds.height / 2);
  rotated.context.rotate((rotationDeg * Math.PI) / 180);
  rotated.context.drawImage(image, -image.width / 2, -image.height / 2);
  if (!area) return rotated.canvas;

  const x = Math.max(0, Math.round(area.x));
  const y = Math.max(0, Math.round(area.y));
  const width = Math.max(1, Math.min(Math.round(area.width), bounds.width - x));
  const height = Math.max(1, Math.min(Math.round(area.height), bounds.height - y));
  const cropped = createCanvas({ width, height });
  cropped.context.drawImage(rotated.canvas, x, y, width, height, 0, 0, width, height);
  return cropped.canvas;
}

/**
 * Encodes a canvas as JPEG.
 *
 * @param canvas - Source canvas.
 * @param quality - JPEG quality 0–1.
 * @returns The JPEG Blob.
 * @throws {Error} If the browser fails to encode.
 */
function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Compresses an image for upload: scales it so the longer side is at most 2000 px
 * (never enlarging, keeping the aspect ratio) and encodes it as JPEG, starting at
 * quality 0.8 and lowering it in steps of 0.1 (down to 0.5) while the result is
 * larger than 1 MB. A white background replaces transparency (JPEG has none).
 *
 * @param source - Image or canvas to compress.
 * @param originalBytes - Size of the input file, reported back for statistics.
 * @param fileName - Base name for the resulting `.jpg` file.
 * @returns The JPEG file with its dimensions and the quality used.
 */
export async function compressImage(
  source: CanvasImageSource & Size,
  originalBytes: number,
  fileName = 'zdjecie',
): Promise<CompressedPhoto> {
  const size = fitWithin({ width: source.width, height: source.height });
  const { canvas, context } = createCanvas(size);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size.width, size.height);

  let quality = START_QUALITY;
  let blob = await toJpeg(canvas, quality);
  for (
    let lower = nextQuality(quality);
    blob.size > TARGET_BYTES && lower !== null;
    lower = nextQuality(lower)
  ) {
    quality = lower;
    blob = await toJpeg(canvas, quality);
  }
  const base = fileName.replace(/\.[^.]+$/, '') || 'zdjecie';
  return {
    file: new File([blob], `${base}.jpg`, { type: 'image/jpeg' }),
    originalBytes,
    width: size.width,
    height: size.height,
    quality,
  };
}

/**
 * Prepares a file chosen by the user for upload: JPEG and PNG images that are
 * larger than 1 MB or 2000 px are compressed to JPEG; PDFs and small images are
 * sent unchanged.
 *
 * @param file - The chosen file.
 * @returns The file to upload and, if it was compressed, the compression result.
 */
export async function prepareUpload(
  file: File,
): Promise<{ file: File; compressed: CompressedPhoto | null }> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return { file, compressed: null };
  const image = await loadImage(file).catch(() => null);
  if (!image || !needsCompression(file.size, image)) return { file, compressed: null };
  const compressed = await compressImage(image, file.size, file.name);
  return { file: compressed.file, compressed };
}
