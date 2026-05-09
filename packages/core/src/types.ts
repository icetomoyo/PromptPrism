/**
 * PromptPrism core types — first-draft contract.
 *
 * Source: reverse-engineered from KodaX `benchmark/harness/` (see
 * `_reference/from-kodax/`). This is the abstraction surface the rest
 * of the framework codes against. Expect breaking churn until the
 * second reference adapter (Aider / ClaudeCode shim) is wired —
 * abstractions designed from one adapter alone leak adapter-isms.
 *
 * Positioning (DESIGN.md, broadened 2026-05-08):
 *   PromptPrism is a universal agent-aware prompt eval framework. The
 *   default mode (AgentAdapter + Judge + AliasResolver) works for any
 *   AI agent — coding, support, content, routing. Validators are an
 *   *optional* power feature for agents that emit code in a language
 *   we have a native toolchain runner for (TS / Python / Rust / Go).
 *   Non-coding cases simply omit `EvalCase.language` and skip
 *   validation; the judge contract still applies.
 *
 * Not yet implemented. See `PROJECT_PLAN.md` Phase 1 W1 for the
 * reverse-engineering schedule.
 */

// =============================================================================
// AgentAdapter — pluggable coding agent that runs in a worktree
// =============================================================================

export interface AgentAdapter {
  readonly name: string;
  readonly description?: string;

  /**
   * Run the agent against a prompt inside a prepared worktree.
   *
   * Contract:
   * - The framework prepares `cwd` (a clean git worktree) before calling.
   * - The framework writes `opts.files` into `cwd` before calling.
   * - The adapter does ALL its work inside `cwd`.
   * - The adapter MUST honor `opts.signal` and abort cleanly.
   * - The framework reads artifacts FROM `cwd` after the adapter returns
   *   (the adapter does not need to enumerate them).
   */
  run(prompt: string, opts: AgentRunOpts): Promise<AgentRunResult>;
}

export interface AgentRunOpts {
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly files?: ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly env?: Readonly<Record<string, string>>;
  /** Optional max turn budget; adapters should hard-stop when exceeded. */
  readonly maxTurns?: number;
}

export interface AgentRunResult {
  readonly trace: AgentTrace;
  readonly cost?: AgentRunCost;
}

export interface AgentRunCost {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly usd?: number;
}

export interface AgentTrace {
  readonly turns: ReadonlyArray<AgentTurn>;
  readonly finalReason: 'completed' | 'aborted' | 'error' | 'budget_exhausted';
  readonly errorMessage?: string;
}

export interface AgentTurn {
  readonly role: 'assistant' | 'tool';
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly toolOutput?: unknown;
  readonly text?: string;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

// =============================================================================
// Validator — language-specific output validation (optional power feature)
// =============================================================================

/**
 * Languages PromptPrism ships a native validator for. Phase 1 ships
 * `ts` and `python`; `rust` and `go` are stub interfaces awaiting
 * external PRs (D2). Non-coding agent cases omit this entirely
 * (`EvalCase.language` is optional) and run in validator-less mode.
 */
export type ValidatorLanguage = 'ts' | 'python' | 'rust' | 'go';

export interface Validator {
  readonly language: ValidatorLanguage;
  /** Spawn the language toolchain inside `cwd` and report pass/fail. */
  validate(cwd: string, signal: AbortSignal): Promise<ValidationResult>;
}

export interface ValidationResult {
  readonly pass: boolean;
  readonly failures: ReadonlyArray<ValidationFailure>;
  readonly durationMs: number;
}

export interface ValidationFailure {
  readonly kind: 'compile' | 'test' | 'lint' | 'runtime';
  readonly detail: string;
  /** Optional source location reference (file:line). */
  readonly location?: string;
}

// =============================================================================
// Judge — assertion against agent output
// =============================================================================

export type JudgeKind = 'mechanical' | 'llm';

export type JudgeCategory = 'format' | 'correctness' | 'style' | 'safety' | 'custom';

export interface JudgeRubric {
  readonly id: string;
  readonly category: JudgeCategory;
  readonly kind: JudgeKind;
  /** Mechanical judges are cheaper + more reliable; prefer them when possible. */
  evaluate(input: JudgeInput): Promise<JudgeVerdict>;
}

export interface JudgeInput {
  readonly trace: AgentTrace;
  readonly artifacts: ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly validation?: ValidationResult;
  readonly prompt: string;
}

export interface JudgeVerdict {
  readonly pass: boolean;
  /** Free-form rationale; surfaced in reports. */
  readonly rationale?: string;
  /** Optional 0..1 score for ranking; pass-fail still authoritative. */
  readonly score?: number;
}

// =============================================================================
// Alias — multi-provider sweep target
// =============================================================================

export interface ProviderAlias {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  /** Env var name; resolver skips alias when env var is unset. */
  readonly apiKeyEnv: string;
  /** Optional family tag for cross-family bias dampening. */
  readonly family?: string;
}

export interface AliasResolver {
  resolve(id: string): ProviderAlias;
  available(...preferred: string[]): ReadonlyArray<ProviderAlias>;
}

// =============================================================================
// Case — what gets run end-to-end
// =============================================================================

export interface EvalCase {
  readonly id: string;
  readonly description?: string;
  /**
   * Target language for the optional code validator. Omit for
   * non-coding agent cases (support, routing, content, etc.); the
   * framework will then skip validation and rely on judges alone.
   * Required when `validate: true`.
   */
  readonly language?: ValidatorLanguage;
  readonly seedFiles?: ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly prompt: string;
  readonly judges: ReadonlyArray<JudgeRubric>;
  /**
   * Whether to spawn a Validator (typecheck/test) and feed result to
   * judges. Defaults to `false`. Setting `true` requires `language`
   * to be set; the framework should reject the case at load time
   * otherwise.
   */
  readonly validate?: boolean;
  readonly maxTurns?: number;
}
