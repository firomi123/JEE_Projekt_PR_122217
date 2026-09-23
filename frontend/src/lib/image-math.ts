/** Longest side of a compressed photo, in pixels. */
export const MAX_PHOTO_SIDE = 2000;
/** Initial JPEG quality of a compressed photo. */
export const START_QUALITY = 0.8;
/** Lowest JPEG quality the compression may fall back to. */
export const MIN_QUALITY = 0.5;
/** Size a compressed photo should stay under. */
export const TARGET_BYTES = 1024 * 1024;

/** Width and height in pixels. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Size of the bounding box of a rectangle rotated around its centre.
 *
 * @param size - Original width and height.
 * @param rotationDeg - Rotation in degrees (any value; typically 0, 90, 180, 270).
 * @returns Width and height of the axis-aligned box containing the rotated
 *   rectangle, rounded to whole pixels. For multiples of 90° this is either the
 *   original size or the size with width and height swapped.
 */
export function rotatedSize({ width, height }: Size, rotationDeg: number): Size {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: Math.round(width * cos + height * sin),
    height: Math.round(width * sin + height * cos),
  };
}

/**
 * Scales a size down so that its longer side is at most `maxSide`, keeping the
 * aspect ratio. Smaller images are never enlarged.
 *
 * @param size - Original size (positive).
 * @param maxSide - Maximum length of the longer side.
 * @returns The scaled size in whole pixels (each side at least 1).
 */
export function fitWithin({ width, height }: Size, maxSide = MAX_PHOTO_SIDE): Size {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Normalizes a rotation to one of 0, 90, 180, 270.
 *
 * @param rotationDeg - Any multiple of 90 (may be negative or above 360).
 * @returns The equivalent rotation in [0, 360).
 */
export function normalizeRotation(rotationDeg: number): number {
  return (((Math.round(rotationDeg / 90) * 90) % 360) + 360) % 360;
}

/**
 * Next JPEG quality to try when a compressed photo is still too large.
 *
 * @param quality - Quality that produced a too-large file.
 * @returns The quality lowered by 0.1 (rounded to one decimal), or `null` when
 *   {@link MIN_QUALITY} has already been reached.
 */
export function nextQuality(quality: number): number | null {
  const next = Math.round((quality - 0.1) * 10) / 10;
  return next >= MIN_QUALITY ? next : null;
}

/**
 * Decides whether an uploaded image should be recompressed before sending.
 *
 * @param fileSize - Size of the file in bytes.
 * @param size - Image dimensions.
 * @returns `true` if the file is larger than {@link TARGET_BYTES} or its longer
 *   side exceeds {@link MAX_PHOTO_SIDE}.
 */
export function needsCompression(fileSize: number, size: Size): boolean {
  return fileSize > TARGET_BYTES || Math.max(size.width, size.height) > MAX_PHOTO_SIDE;
}
