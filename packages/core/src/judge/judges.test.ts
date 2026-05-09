// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

import { describe, expect, it } from 'vitest';

import {
  lengthWithin,
  mustContainAll,
  mustContainAny,
  mustMatch,
  mustNotContain,
  mustNotMatch,
  parseAndAssert,
} from './judges.js';

describe('mustContainAll', () => {
  it('passes when every phrase is present (case-insensitive)', () => {
    const j = mustContainAll('hello', 'world');
    expect(j.judge('Hello, World!')).toEqual({ passed: true });
  });

  it('fails and lists missing phrases when any are absent', () => {
    const j = mustContainAll('alpha', 'beta', 'gamma');
    const r = j.judge('alpha and beta only');
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('gamma');
  });

  it('passes vacuously when no phrases supplied', () => {
    const j = mustContainAll();
    expect(j.judge('anything').passed).toBe(true);
  });

  it('respects case-sensitive exact match for non-letter phrases', () => {
    const j = mustContainAll('{ "key": "value" }');
    expect(j.judge('payload: { "key": "value" }').passed).toBe(true);
  });

  it('encodes phrases into the judge name for reporting', () => {
    const j = mustContainAll('foo', 'bar');
    expect(j.name).toBe('mustContainAll("foo", "bar")');
  });
});

describe('mustContainAny', () => {
  it('passes when at least one phrase matches', () => {
    expect(mustContainAny('a', 'b', 'c').judge('only b here').passed).toBe(true);
  });

  it('fails when none match, listing the alternatives', () => {
    const r = mustContainAny('foo', 'bar').judge('xyz');
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('foo');
    expect(r.reason).toContain('bar');
  });
});

describe('mustNotContain', () => {
  it('passes when none of the phrases appear', () => {
    expect(mustNotContain('secret').judge('safe output').passed).toBe(true);
  });

  it('fails when forbidden phrases appear, listing them', () => {
    const r = mustNotContain('apikey', 'password').judge(
      'leaked apikey here',
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('apikey');
  });
});

describe('mustMatch', () => {
  it('passes on regex match', () => {
    expect(mustMatch(/\d+/).judge('answer is 42').passed).toBe(true);
  });

  it('fails on regex non-match with /pattern/flags in reason', () => {
    const r = mustMatch(/foo/i, 'foo-label').judge('bar');
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/foo/);
  });

  it('uses custom label in name when provided', () => {
    expect(mustMatch(/^x/, 'starts-with-x').name).toBe('mustMatch(starts-with-x)');
  });
});

describe('mustNotMatch', () => {
  it('passes when pattern does not match', () => {
    expect(mustNotMatch(/I am Claude/i).judge('hello').passed).toBe(true);
  });

  it('fails when pattern matches', () => {
    expect(mustNotMatch(/I am Claude/i).judge("I'm Claude").passed).toBe(true);
    expect(mustNotMatch(/I am Claude/i).judge('I am Claude').passed).toBe(false);
  });
});

describe('lengthWithin', () => {
  it('passes when length is within inclusive bounds', () => {
    expect(lengthWithin(0, 100).judge('hello').passed).toBe(true);
  });

  it('fails when too short', () => {
    const r = lengthWithin(10, 100).judge('hi');
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/too short/);
  });

  it('fails when too long', () => {
    const r = lengthWithin(0, 5).judge('hello world');
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/too long/);
  });

  it('handles boundary equality', () => {
    expect(lengthWithin(5, 5).judge('hello').passed).toBe(true);
  });
});

describe('parseAndAssert', () => {
  it('passes when extract returns value and predicate holds', () => {
    const j = parseAndAssert<{ x: number }>(
      (s) => {
        try {
          return JSON.parse(s) as { x: number };
        } catch {
          return null;
        }
      },
      (v) => v.x > 0,
    );
    expect(j.judge('{"x": 7}').passed).toBe(true);
  });

  it('fails when extract returns null', () => {
    const j = parseAndAssert<unknown>(() => null, () => true);
    expect(j.judge('whatever').passed).toBe(false);
    expect(j.judge('whatever').reason).toMatch(/null/);
  });

  it('fails when predicate rejects extracted value', () => {
    const j = parseAndAssert<number>(
      () => 5,
      (n) => n > 100,
    );
    expect(j.judge('input').passed).toBe(false);
    expect(j.judge('input').reason).toMatch(/predicate/);
  });
});
