// Copyright 2026 icetomoyo (and PromptPrism contributors).
// Licensed under the Apache License, Version 2.0 — see LICENSE.

/**
 * Bridge between sync `PromptJudge` (mechanical, cheap) and async
 * `JudgeRubric` (general, can call LLM).
 *
 * Per design decision D-RE-1 in `docs/proposals/harness-reverse-engineering-plan.md`,
 * PromptPrism core exposes both interfaces:
 *
 * - **`PromptJudge`** (in `./judges.ts`): sync, takes `output: string`,
 *   returns `JudgeResult`. Use for cheap mechanical assertions.
 * - **`JudgeRubric`** (in `../types.ts`): async, takes `JudgeInput` (full
 *   trace + artifacts + validation + prompt), returns `Promise<JudgeVerdict>`.
 *   Use for LLM-as-judge or anything that needs structured input.
 *
 * `EvalCase.judges` is typed as `ReadonlyArray<JudgeRubric>` — the general
 * async surface. To use a mechanical judge in that list, wrap it via
 * `asJudgeRubric(promptJudge, id, extract)`. Provide `extract` to tell the
 * wrapper which string in the structured `JudgeInput` to feed to the sync
 * judge — typically the agent's last assistant turn (`fromAgentText`) or
 * the agent's last tool-call payload.
 */

import type { JudgeInput, JudgeRubric, JudgeVerdict } from '../types.js';
import type { PromptJudge } from './judges.js';

/**
 * Wrap a sync `PromptJudge` as an async `JudgeRubric`.
 *
 * The `extract` callback chooses which string in the structured `JudgeInput`
 * to feed to the sync judge. For most coding-agent cases, pass `fromAgentText`
 * to grab the concatenated assistant text from the trace.
 */
export function asJudgeRubric(
  promptJudge: PromptJudge,
  id: string,
  extract: (input: JudgeInput) => string,
): JudgeRubric {
  return {
    id,
    category: promptJudge.category ?? 'correctness',
    kind: 'mechanical',
    async evaluate(input: JudgeInput): Promise<JudgeVerdict> {
      const subject = extract(input);
      const result = promptJudge.judge(subject);
      return {
        pass: result.passed,
        ...(result.reason !== undefined ? { rationale: result.reason } : {}),
      };
    },
  };
}

/**
 * Default `extract` for `asJudgeRubric`: concatenate every assistant turn's
 * text in the agent trace. Skips tool-role turns. Empty assistant turns are
 * preserved as empty lines so newline-sensitive judges still see structure.
 */
export function fromAgentText(input: JudgeInput): string {
  return input.trace.turns
    .filter((t) => t.role === 'assistant')
    .map((t) => t.text ?? '')
    .join('\n');
}

/**
 * Alternative `extract`: serialize the agent's tool calls (name + JSON
 * input) one per line. Use when judging tool-call discipline rather than
 * text content.
 */
export function fromAgentToolCalls(input: JudgeInput): string {
  return input.trace.turns
    .filter((t) => t.role === 'tool' && t.toolName !== undefined)
    .map((t) => `${t.toolName}: ${JSON.stringify(t.toolInput ?? null)}`)
    .join('\n');
}
