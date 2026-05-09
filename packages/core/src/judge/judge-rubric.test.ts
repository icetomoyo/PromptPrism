// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

import { describe, expect, it } from 'vitest';

import type { AgentTrace, JudgeInput } from '../types.js';
import {
  asJudgeRubric,
  fromAgentText,
  fromAgentToolCalls,
} from './judge-rubric.js';
import { mustContainAll, mustNotContain } from './judges.js';

function makeTrace(turns: AgentTrace['turns']): AgentTrace {
  return { turns, finalReason: 'completed' };
}

function makeInput(trace: AgentTrace): JudgeInput {
  return { trace, artifacts: [], prompt: 'test-prompt' };
}

describe('fromAgentText', () => {
  it('concatenates only assistant turns, separated by newlines', () => {
    const input = makeInput(
      makeTrace([
        { role: 'assistant', text: 'first' },
        { role: 'tool', toolName: 'read_file', toolOutput: 'ignored' },
        { role: 'assistant', text: 'second' },
      ]),
    );
    expect(fromAgentText(input)).toBe('first\nsecond');
  });

  it('preserves empty assistant turns as empty lines', () => {
    const input = makeInput(
      makeTrace([
        { role: 'assistant', text: 'a' },
        { role: 'assistant' },
        { role: 'assistant', text: 'b' },
      ]),
    );
    expect(fromAgentText(input)).toBe('a\n\nb');
  });

  it('returns empty string when there are no assistant turns', () => {
    const input = makeInput(
      makeTrace([{ role: 'tool', toolName: 'x', toolOutput: 'y' }]),
    );
    expect(fromAgentText(input)).toBe('');
  });
});

describe('fromAgentToolCalls', () => {
  it('serializes tool turns with name + JSON input, one per line', () => {
    const input = makeInput(
      makeTrace([
        { role: 'tool', toolName: 'read_file', toolInput: { path: 'a.ts' } },
        { role: 'assistant', text: 'thinking' },
        { role: 'tool', toolName: 'write_file', toolInput: { path: 'b.ts' } },
      ]),
    );
    expect(fromAgentToolCalls(input)).toBe(
      'read_file: {"path":"a.ts"}\nwrite_file: {"path":"b.ts"}',
    );
  });

  it('handles missing toolInput as null', () => {
    const input = makeInput(
      makeTrace([{ role: 'tool', toolName: 'noop' }]),
    );
    expect(fromAgentToolCalls(input)).toBe('noop: null');
  });

  it('skips tool turns without a toolName', () => {
    const input = makeInput(
      makeTrace([{ role: 'tool', toolOutput: 'whatever' }]),
    );
    expect(fromAgentToolCalls(input)).toBe('');
  });
});

describe('asJudgeRubric', () => {
  it('wraps a passing PromptJudge into an async JudgeRubric (pass: true)', async () => {
    const rubric = asJudgeRubric(
      mustContainAll('hello'),
      'must-greet',
      fromAgentText,
    );
    const input = makeInput(
      makeTrace([{ role: 'assistant', text: 'hello world' }]),
    );
    const verdict = await rubric.evaluate(input);
    expect(verdict.pass).toBe(true);
  });

  it('passes the failing judge reason through as rationale', async () => {
    const rubric = asJudgeRubric(
      mustNotContain('secret'),
      'no-secret',
      fromAgentText,
    );
    const input = makeInput(
      makeTrace([{ role: 'assistant', text: 'leaked secret here' }]),
    );
    const verdict = await rubric.evaluate(input);
    expect(verdict.pass).toBe(false);
    expect(verdict.rationale).toMatch(/secret/);
  });

  it('inherits category from the wrapped PromptJudge', () => {
    const rubric = asJudgeRubric(
      { name: 'styled', category: 'style', judge: () => ({ passed: true }) },
      'styled-rubric',
      fromAgentText,
    );
    expect(rubric.category).toBe('style');
  });

  it('defaults category to correctness when wrapped judge has none', () => {
    const rubric = asJudgeRubric(
      { name: 'plain', judge: () => ({ passed: true }) },
      'plain-rubric',
      fromAgentText,
    );
    expect(rubric.category).toBe('correctness');
  });

  it('always reports kind: mechanical for sync-wrapped rubrics', () => {
    const rubric = asJudgeRubric(
      mustContainAll('x'),
      'whatever',
      fromAgentText,
    );
    expect(rubric.kind).toBe('mechanical');
  });

  it('uses the supplied extract function to choose subject', async () => {
    const rubric = asJudgeRubric(
      mustContainAll('read_file'),
      'has-read',
      fromAgentToolCalls,
    );
    const input = makeInput(
      makeTrace([
        { role: 'assistant', text: 'this should not be judged' },
        { role: 'tool', toolName: 'read_file', toolInput: { path: 'a' } },
      ]),
    );
    const verdict = await rubric.evaluate(input);
    expect(verdict.pass).toBe(true);
  });
});
