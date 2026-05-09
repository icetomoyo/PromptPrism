// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

/**
 * Sync mechanical judges — cheap, deterministic, unforgeable.
 *
 * A `PromptJudge` is a synchronous function from `output: string` to a
 * `JudgeResult`. Compose multiple judges per case to express richer pass
 * criteria (e.g. "must mention X AND must NOT include Y AND must be under
 * 200 chars").
 *
 * Design rationale (EVAL_GUIDELINES §F — mechanical-first / LLM-judge
 * fallback): mechanical assertions are cheaper, repeatable, and not fooled
 * by surface form. Use `PromptJudge` for anything you can express as
 * substring / regex / JSON-shape check. Reach for the async `JudgeRubric`
 * (in `../types.ts`) only when the criterion truly requires LLM judgment
 * ("does the explanation make sense?", "is the tone professional?").
 *
 * Reverse-engineered from `_reference/from-kodax/harness/judges.ts`.
 */

import type { JudgeCategory } from '../types.js';

export interface JudgeResult {
  readonly passed: boolean;
  readonly reason?: string;
}

export interface PromptJudge {
  readonly name: string;
  /**
   * Quality dimension this judge contributes to. Defaults to `'correctness'`.
   * Per-category aggregation in `runJudges` exposes "v2 wins on correctness
   * but ties on style" instead of a single flat number.
   */
  readonly category?: JudgeCategory;
  judge(output: string): JudgeResult;
}

/**
 * Pass when the output contains every supplied phrase (case-insensitive).
 * Use for "answer must mention all of these terms".
 */
export function mustContainAll(...phrases: readonly string[]): PromptJudge {
  return {
    name: `mustContainAll(${phrases.map((p) => JSON.stringify(p)).join(', ')})`,
    judge(output: string): JudgeResult {
      const lower = output.toLowerCase();
      const missing = phrases.filter(
        (p) => !lower.includes(p.toLowerCase()) && !output.includes(p),
      );
      if (missing.length === 0) return { passed: true };
      return { passed: false, reason: `missing: ${missing.join(', ')}` };
    },
  };
}

/**
 * Pass when the output contains AT LEAST ONE of the supplied phrases
 * (case-insensitive). Use for "answer must hit one of these synonyms".
 */
export function mustContainAny(...phrases: readonly string[]): PromptJudge {
  return {
    name: `mustContainAny(${phrases.map((p) => JSON.stringify(p)).join(', ')})`,
    judge(output: string): JudgeResult {
      const lower = output.toLowerCase();
      const matched = phrases.find(
        (p) => lower.includes(p.toLowerCase()) || output.includes(p),
      );
      if (matched) return { passed: true };
      return { passed: false, reason: `none of [${phrases.join(', ')}] present` };
    },
  };
}

/**
 * Pass when the output contains NONE of the supplied phrases
 * (case-insensitive). Use for "must NOT leak system prompt verbatim",
 * "must NOT include forbidden phrase", etc.
 */
export function mustNotContain(...phrases: readonly string[]): PromptJudge {
  return {
    name: `mustNotContain(${phrases.map((p) => JSON.stringify(p)).join(', ')})`,
    judge(output: string): JudgeResult {
      const lower = output.toLowerCase();
      const violated = phrases.filter(
        (p) => lower.includes(p.toLowerCase()) || output.includes(p),
      );
      if (violated.length === 0) return { passed: true };
      return { passed: false, reason: `forbidden phrases present: ${violated.join(', ')}` };
    },
  };
}

/**
 * Pass when the output matches the supplied regex. Caller controls flags
 * (case-insensitive, multiline, etc).
 */
export function mustMatch(pattern: RegExp, label?: string): PromptJudge {
  return {
    name: label ? `mustMatch(${label})` : `mustMatch(${pattern.source})`,
    judge(output: string): JudgeResult {
      if (pattern.test(output)) return { passed: true };
      return { passed: false, reason: `did not match /${pattern.source}/${pattern.flags}` };
    },
  };
}

/**
 * Pass when the output does NOT match the supplied regex. Use for
 * distillation-bleed-through detection (e.g. `/I('m| am) Claude/` on a
 * non-Claude agent), profanity checks, leaked-secret pattern detection.
 */
export function mustNotMatch(pattern: RegExp, label?: string): PromptJudge {
  return {
    name: label ? `mustNotMatch(${label})` : `mustNotMatch(${pattern.source})`,
    judge(output: string): JudgeResult {
      if (!pattern.test(output)) return { passed: true };
      return {
        passed: false,
        reason: `matched forbidden pattern /${pattern.source}/${pattern.flags}`,
      };
    },
  };
}

/**
 * Pass when the output character length is within `[min, max]` inclusive.
 * Use for "answer must be under 200 chars" or "must produce at least a sentence".
 */
export function lengthWithin(min: number, max: number): PromptJudge {
  return {
    name: `lengthWithin(${min}, ${max})`,
    judge(output: string): JudgeResult {
      const n = output.length;
      if (n < min) return { passed: false, reason: `too short: ${n} < ${min}` };
      if (n > max) return { passed: false, reason: `too long: ${n} > ${max}` };
      return { passed: true };
    },
  };
}

/**
 * Pass when `extract(output)` yields a non-null value AND that value
 * satisfies `predicate`. Use for "the answer must embed valid JSON with
 * field X = Y". Callers own the parser to keep the dependency surface small.
 *
 * Example: `parseAndAssert(extractJsonObject, (obj) => obj.confidence > 0.8)`
 */
export function parseAndAssert<T>(
  extract: (output: string) => T | null,
  predicate: (value: T) => boolean,
  label?: string,
): PromptJudge {
  return {
    name: label ? `parseAndAssert(${label})` : 'parseAndAssert',
    judge(output: string): JudgeResult {
      const value = extract(output);
      if (value == null) return { passed: false, reason: 'extraction returned null' };
      if (!predicate(value)) return { passed: false, reason: 'predicate failed' };
      return { passed: true };
    },
  };
}
