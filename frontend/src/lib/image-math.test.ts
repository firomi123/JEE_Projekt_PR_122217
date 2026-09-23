import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  needsCompression,
  nextQuality,
  normalizeRotation,
  rotatedSize,
  TARGET_BYTES,
} from './image-math';

describe('fitWithin', () => {
  it('scales a 12 MP landscape photo to 2000 px on the longer side, keeping the ratio', () => {
    const size = fitWithin({ width: 4000, height: 3000 });

    expect(size).toEqual({ width: 2000, height: 1500 });
    expect(size.width / size.height).toBeCloseTo(4 / 3);
  });

  it('scales a portrait photo by its height', () => {
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1500, height: 2000 });
  });

  it('never enlarges a smaller image', () => {
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });

  it('keeps an extreme panorama at least 1 px high', () => {
    expect(fitWithin({ width: 100_000, height: 10 })).toEqual({ width: 2000, height: 1 });
  });

  it('respects a custom limit', () => {
    expect(fitWithin({ width: 1000, height: 500 }, 400)).toEqual({ width: 400, height: 200 });
  });
});

describe('rotatedSize', () => {
  it.each([
    [0, { width: 400, height: 300 }],
    [90, { width: 300, height: 400 }],
    [180, { width: 400, height: 300 }],
    [270, { width: 300, height: 400 }],
  ])('rotating 400×300 by %d° gives %o', (rotation, expected) => {
    expect(rotatedSize({ width: 400, height: 300 }, rotation)).toEqual(expected);
  });

  it('computes the bounding box for 45°', () => {
    expect(rotatedSize({ width: 100, height: 100 }, 45)).toEqual({ width: 141, height: 141 });
  });
});

describe('normalizeRotation', () => {
  it.each([
    [0, 0],
    [90, 90],
    [360, 0],
    [450, 90],
    [-90, 270],
  ])('%d° → %d°', (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });
});

describe('nextQuality', () => {
  it('steps the JPEG quality down by 0.1 until the minimum', () => {
    expect(nextQuality(0.8)).toBe(0.7);
    expect(nextQuality(0.6)).toBe(0.5);
    expect(nextQuality(0.5)).toBeNull();
  });
});

describe('needsCompression', () => {
  it('is needed for a file over 1 MB or an image over 2000 px', () => {
    expect(needsCompression(TARGET_BYTES + 1, { width: 800, height: 600 })).toBe(true);
    expect(needsCompression(200_000, { width: 2001, height: 1000 })).toBe(true);
  });

  it('is not needed for a small image', () => {
    expect(needsCompression(TARGET_BYTES, { width: 2000, height: 1500 })).toBe(false);
  });
});
