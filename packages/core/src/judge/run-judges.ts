// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

/**
 * `runJudges` — apply a list of `PromptJudge`s to an output and aggregate.
 *
 * Returns a flat composite pass/fail (`passed`) plus per-category counts so
 * reports can decompose quality into format / correctness / style / safety
 * dimensions instead of shipping a single number.
 *
 * Format-gates-quality rule: when one or more judges have `category: 'format'`
 * and any of them fails, `formatPassed` is false. Reporting code (in
 * `../report/`) treats a cell with `formatPassed: false` as quality 0
 * regardless of other dimensions, since unparseable output isn't comparable.
 *
 * Reverse-engineered from `_reference/from-kodax/harness/judges.ts`
 * (`runJudges` + `AggregatedJudgeRun`).
 */

import type { JudgeCategory } from '../types.js';
import type { PromptJudge } from './judges.js';

export interface JudgeRunResult {
  readonly name: string;
  readonly category: JudgeCategory;
  readonly passed: boolean;
  readonly reason?: string;
}

export interface AggregatedJudgeRun {
  /** True iff every judge passed (composite). */
  readonly passed: boolean;
  /** Detailed per-judge results, in order of invocation. */
  readonly results: readonly JudgeRunResult[];
  /**
   * Per-category pass count / total count. Empty categories are omitted.
   * Useful for "v2 wins on correctness 8/10 but ties on style 6/6".
   */
  readonly byCategory: Readonly<Record<JudgeCategory, { passed: number; total: number }>>;
  /**
   * Whether all `format`-category judges passed. When false, callers (in
   * particular `runBenchmark` aggregation) treat the cell as quality 0
   * regardless of other dimensions — unparseable output isn't comparable.
   * Defaults to `true` when no `format`-category judge is supplied.
   */
  readonly formatPassed: boolean;
}

export function runJudges(
  output: string,
  judges: readonly PromptJudge[],
): AggregatedJudgeRun {
  const results: JudgeRunResult[] = judges.map((j) => {
    const r = j.judge(output);
    return {
      name: j.name,
      category: j.category ?? 'correctness',
      passed: r.passed,
      ...(r.reason !== undefined ? { reason: r.reason } : {}),
    };
  });

  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const r of results) {
    let bucket = byCategory[r.category];
    if (!bucket) {
      bucket = { passed: 0, total: 0 };
      byCategory[r.category] = bucket;
    }
    bucket.total += 1;
    if (r.passed) bucket.passed += 1;
  }

  const formatBucket = byCategory.format;
  const formatPassed = formatBucket
    ? formatBucket.passed === formatBucket.total
    : true;

  return {
    passed: results.every((r) => r.passed),
    results,
    byCategory: byCategory as Record<JudgeCategory, { passed: number; total: number }>,
    formatPassed,
  };
}
