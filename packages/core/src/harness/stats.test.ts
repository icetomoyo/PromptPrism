// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

import { describe, expect, it } from 'vitest';

import { median, percentile, stdDev } from './stats.js';

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the sole value for a 1-length array', () => {
    expect(median([42])).toBe(42);
  });

  it('returns the middle value for odd-length arrays', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns the mean of the two middle values for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('handles negative numbers', () => {
    expect(median([-5, -1, 0, 1, 5])).toBe(0);
  });
});

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns the sole value for a 1-length array regardless of p', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it('returns min at p=0 and max at p=100', () => {
    const data = [1, 2, 3, 4, 5];
    expect(percentile(data, 0)).toBe(1);
    expect(percentile(data, 100)).toBe(5);
  });

  it('linear-interpolates between adjacent values', () => {
    const data = [10, 20];
    expect(percentile(data, 50)).toBe(15);
  });

  it('handles standard p95 case for a 100-element array', () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    expect(percentile(data, 95)).toBeCloseTo(94.05, 2);
  });
});

describe('stdDev', () => {
  it('returns 0 for empty array', () => {
    expect(stdDev([])).toBe(0);
  });

  it('returns 0 when all values are identical', () => {
    expect(stdDev([5, 5, 5, 5])).toBe(0);
  });

  it('returns 0 for a 1-length array', () => {
    expect(stdDev([42])).toBe(0);
  });

  it('returns expected population stddev for a known set', () => {
    // Population stddev of [2, 4, 4, 4, 5, 5, 7, 9] is 2 (textbook example).
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });

  it('handles two-value array as half-range', () => {
    // [0, 10] → mean = 5, deviations = [-5, 5], variance = 25, stddev = 5.
    expect(stdDev([0, 10])).toBeCloseTo(5, 5);
  });
});
