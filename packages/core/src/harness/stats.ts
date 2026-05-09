// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

/**
 * Pure-math helpers used by the benchmark aggregation in
 * `./run-benchmark.ts` (Stage D). Kept in their own file so they can be
 * unit-tested without spinning up the full benchmark machinery.
 *
 * Reverse-engineered from `_reference/from-kodax/harness/harness.ts`.
 */

/**
 * Median of a pre-sorted ascending array. Returns 0 for an empty array
 * (caller-friendly default — most call sites would multiply by 0 anyway).
 */
export function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Linear-interpolation percentile of a pre-sorted ascending array.
 * `p` is in [0, 100]. Returns 0 for empty array; returns the sole value
 * for a 1-length array regardless of `p`.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * Population standard deviation. Returns 0 for empty array.
 *
 * (Population, not sample — the bench aggregation uses the full set of
 * observed runs as the population, not a sample of a larger one.)
 */
export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
