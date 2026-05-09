// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

import { describe, expect, it } from 'vitest';

import { mustContainAll, mustNotContain, type PromptJudge } from './judges.js';
import { runJudges } from './run-judges.js';

describe('runJudges', () => {
  it('returns passed: true when every judge passes', () => {
    const result = runJudges('hello world', [
      mustContainAll('hello'),
      mustNotContain('forbidden'),
    ]);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('returns passed: false when any judge fails', () => {
    const result = runJudges('only hello', [
      mustContainAll('hello'),
      mustContainAll('goodbye'),
    ]);
    expect(result.passed).toBe(false);
    expect(result.results.filter((r) => !r.passed)).toHaveLength(1);
  });

  it('defaults missing category to correctness', () => {
    const judge: PromptJudge = {
      name: 'no-category',
      judge: () => ({ passed: true }),
    };
    const result = runJudges('x', [judge]);
    expect(result.results[0]?.category).toBe('correctness');
    expect(result.byCategory.correctness).toEqual({ passed: 1, total: 1 });
  });

  it('preserves explicit category and aggregates per-category', () => {
    const styleOk: PromptJudge = {
      name: 'style-pass',
      category: 'style',
      judge: () => ({ passed: true }),
    };
    const styleBad: PromptJudge = {
      name: 'style-fail',
      category: 'style',
      judge: () => ({ passed: false, reason: 'meh' }),
    };
    const correctnessOk: PromptJudge = {
      name: 'correct-pass',
      category: 'correctness',
      judge: () => ({ passed: true }),
    };

    const r = runJudges('whatever', [styleOk, styleBad, correctnessOk]);
    expect(r.byCategory.style).toEqual({ passed: 1, total: 2 });
    expect(r.byCategory.correctness).toEqual({ passed: 1, total: 1 });
  });

  it('formatPassed: true when no format-category judges supplied', () => {
    const r = runJudges('ok', [mustContainAll('ok')]);
    expect(r.formatPassed).toBe(true);
  });

  it('formatPassed: true when all format-category judges pass', () => {
    const formatOk: PromptJudge = {
      name: 'format-ok',
      category: 'format',
      judge: () => ({ passed: true }),
    };
    const r = runJudges('x', [formatOk]);
    expect(r.formatPassed).toBe(true);
  });

  it('formatPassed: false when any format-category judge fails', () => {
    const formatOk: PromptJudge = {
      name: 'format-ok',
      category: 'format',
      judge: () => ({ passed: true }),
    };
    const formatBad: PromptJudge = {
      name: 'format-bad',
      category: 'format',
      judge: () => ({ passed: false }),
    };
    const r = runJudges('x', [formatOk, formatBad]);
    expect(r.formatPassed).toBe(false);
  });

  it('preserves judge order in results', () => {
    const a: PromptJudge = { name: 'a', judge: () => ({ passed: true }) };
    const b: PromptJudge = { name: 'b', judge: () => ({ passed: true }) };
    const c: PromptJudge = { name: 'c', judge: () => ({ passed: true }) };
    const r = runJudges('x', [a, b, c]);
    expect(r.results.map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('returns vacuously passed for empty judge list', () => {
    const r = runJudges('anything', []);
    expect(r.passed).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.formatPassed).toBe(true);
  });

  it('omits reason when judge does not provide one', () => {
    const j: PromptJudge = { name: 'j', judge: () => ({ passed: true }) };
    const r = runJudges('x', [j]);
    expect(r.results[0]).not.toHaveProperty('reason');
  });
});
