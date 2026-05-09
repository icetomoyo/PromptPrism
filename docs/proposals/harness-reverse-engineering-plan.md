# KodaX Harness → PromptPrism Core: Reverse-Engineering Plan

> **Status**: spec for Step 4 (the port). Read this before touching `packages/core/src/`. Owner sign-off recommended before starting the port.
>
> **Scope**: 7 files in `_reference/from-kodax/harness/` (~2,170 LoC) → packages/core/src/. Reverse engineer = re-author with PromptPrism's broadened positioning, *not* rename-and-paste. KodaX-specific framing (H0/H1/H2 routing, KODAX_* env vars, `@kodax-ai/llm` types, etc.) gets scrubbed; generic patterns (judges, aggregation, worktree, persistence) get ported with new naming.

## 1. Source inventory

| File | LoC | Generic % (port-able) | KodaX-specific % | Notes |
|---|---:|---:|---:|---|
| [aliases.ts](../../_reference/from-kodax/harness/aliases.ts) | 89 | ~30% | ~70% | Pattern reusable; the 8-entry alias map is KodaX deployment data |
| [judges.ts](../../_reference/from-kodax/harness/judges.ts) | 230 | ~95% | ~5% | Almost direct port — judges are agent-agnostic |
| [harness.ts](../../_reference/from-kodax/harness/harness.ts) | 586 | ~70% | ~30% | Math + aggregation generic; provider integration KodaX-tied |
| [report.ts](../../_reference/from-kodax/harness/report.ts) | 332 | ~98% | ~2% | Pure markdown rendering — minimal KodaX prose to scrub |
| [persist.ts](../../_reference/from-kodax/harness/persist.ts) | 135 | ~95% | ~5% | Direct port; only outDir default is KodaX-pathy |
| [agent-task-runner.ts](../../_reference/from-kodax/harness/agent-task-runner.ts) | 373 | ~30% | ~70% | Worktree+spawn boilerplate generic; variant/env/jsonl semantics KodaX |
| [worktree-runner.ts](../../_reference/from-kodax/harness/worktree-runner.ts) | 424 | ~85% | ~15% | git worktree pattern reusable; only prefix string is KodaX |
| **Total** | **2,169** | **~1,560 LoC** | **~610 LoC** | DESIGN.md 880 LoC estimate was conservative; actual ~1,560 |

The DESIGN.md 880-LoC estimate undercounted. `harness.ts` runBenchmark's aggregation logic + `worktree-runner.ts` + `report.ts` each contain substantial generic surface that survives scrub. ~1,560 LoC port is the realistic budget.

## 2. Target structure

```
packages/core/src/
├── index.ts                           # re-exports
├── types.ts                           # existing, evolved 2026-05-09
│
├── alias/
│   ├── alias-resolver.ts              # 50 LoC — generic resolver, user-supplied table
│   └── alias-resolver.test.ts         # unit tests
│
├── judge/
│   ├── judges.ts                      # 200 LoC — mustContainAll/mustNotContain/mustMatch/lengthWithin/parseAndAssert
│   ├── run-judges.ts                  # 50 LoC — runJudges + AggregatedJudgeRun
│   ├── judge-rubric.ts                # 30 LoC — JudgeRubric (async wrapper) + bridge to PromptJudge
│   └── *.test.ts
│
├── llm/
│   ├── llm-provider.ts                # 30 LoC — LLMProvider interface (abstracted from KodaX getProvider)
│   ├── llm-message.ts                 # 20 LoC — message/tool/reasoning types (de-KodaX'd)
│   └── (no impl — adapters provide concrete LLMProvider)
│
├── harness/
│   ├── run-one-shot.ts                # 50 LoC — single (system+user) → text+toolCalls
│   ├── run-ab-comparison.ts           # 100 LoC — N variants × M models → comparison matrix
│   ├── run-benchmark.ts               # 300 LoC — N×M×K runs + aggregation + variance + dominance
│   ├── format-comparison-table.ts     # 60 LoC — pretty-print A/B comparison
│   ├── stats.ts                       # 30 LoC — median / percentile / stdDev
│   └── *.test.ts
│
├── worktree/
│   ├── setup-worktree.ts              # 100 LoC — git worktree add + handle
│   ├── cleanup-worktree.ts            # 30 LoC — remove + prune
│   ├── orphan-scan.ts                 # 50 LoC — startup leak cleanup
│   ├── snapshot-primary-repo.ts       # 80 LoC — drift detection (HEAD + untracked + tracked-modified)
│   ├── seed-node-modules.ts           # 60 LoC — opt-in node_modules copy (workspaces-aware, configurable)
│   └── *.test.ts
│
├── spawn/
│   ├── run-agent-in-worktree.ts       # 120 LoC — generic spawn-in-worktree boilerplate (NOT KodaX-specific)
│   └── *.test.ts
│
├── report/
│   ├── benchmark-md.ts                # 300 LoC — full markdown REPORT.md generator
│   ├── compact-summary.ts             # 30 LoC — one-line per-cell summary
│   └── *.test.ts
│
└── persist/
    ├── write-benchmark-result.ts      # 100 LoC — writes results.json + REPORT.md + codes/
    ├── read-benchmark-result.ts       # 10 LoC — JSON load
    └── *.test.ts
```

Module boundary discipline: framework owns harness / worktree / spawn / report / persist. Adapters own `LLMProvider` impl + KodaX-style agent integration. Validators are separate package (`@promptprism/validators`).

## 3. Per-file port table

### 3.1 aliases.ts → alias/alias-resolver.ts

**Port**: `availableAliases()` filter pattern, `resolveAlias()` validator, the typed-string alias id pattern.

**Scrub**:
- 8-entry `MODEL_ALIASES` hardcoded map → user-supplied table via constructor
- `ModelAlias` typed string union → generic `string` (user defines their own union if they want type safety)
- `apiKeyEnv` field stays generic
- KodaX provider names (zhipu-coding / kimi-code / mimo-coding / ...) → gone

**Naming**:
- `ModelAliasTarget` → `ProviderAlias` (already in types.ts; align)
- `ModelAlias` → `string` (alias id)
- `MODEL_ALIASES` → user-supplied via `new AliasResolver({ aliases: { ... } })`

**Deliverable**:
```ts
// alias-resolver.ts
import type { ProviderAlias, AliasResolver as IAliasResolver } from '../types.js';

export class AliasResolver implements IAliasResolver {
  constructor(private readonly table: Readonly<Record<string, ProviderAlias>>) {}
  resolve(id: string): ProviderAlias { /* ... */ }
  available(...preferred: string[]): readonly ProviderAlias[] { /* ... */ }
}
```

### 3.2 judges.ts → judge/judges.ts + judge/run-judges.ts

**Port**: All 5 judge factories (`mustContainAll` / `mustNotContain` / `mustMatch` / `mustNotMatch` / `lengthWithin` / `parseAndAssert`), `runJudges` + `AggregatedJudgeRun` aggregation, `JudgeCategory` enum, format-gates-quality logic.

**Scrub**: Doc comments mentioning "KodaX, kimi, 智谱" → generic examples.

**Naming**:
- `PromptJudge` (sync, mechanical) → keep as `PromptJudge` in PromptPrism core (it's the cheap judge interface)
- `JudgeResult` → keep
- `JudgeRunResult` → keep
- `AggregatedJudgeRun` → keep

**Bridge to existing types.ts `JudgeRubric`**: PromptPrism core has BOTH:
- `PromptJudge` (sync, mechanical, ~10-50 LoC each — direct from KodaX) — for cheap mechanical assertions
- `JudgeRubric` (async, general, can call LLM) — for LLM-as-judge scenarios

`runJudges(output, judges: PromptJudge[]): AggregatedJudgeRun` stays as-is. A separate `runJudgeRubrics(input, rubrics: JudgeRubric[]): Promise<...>` handles the async case. This preserves the cheap-and-sync mechanical path that EVAL_GUIDELINES §F demands.

### 3.3 harness.ts → harness/* (split)

**Port** the structural pieces:
- `runOneShot(alias, input)` → `run-one-shot.ts` (50 LoC). Abstracts `getProvider(target.provider).stream(...)` behind `LLMProvider` interface.
- `runABComparison(input)` → `run-ab-comparison.ts` (100 LoC).
- `runBenchmark(input)` → `run-benchmark.ts` (300 LoC). The big one — N×M×K runs + per-cell aggregation + variance + dominance + format-gating.
- `formatComparisonTable(result)` → `format-comparison-table.ts` (60 LoC).
- `median` / `percentile` / `stdDev` → `stats.ts` (30 LoC, exported).

**Scrub**:
- Imports from `@kodax-ai/llm` → replaced by PromptPrism's `LLMProvider` interface
- `KodaXMessage` / `KodaXReasoningRequest` / `KodaXToolDefinition` types → become `LLMMessage` / `LLMReasoningRequest` / `LLMToolDefinition` in `llm/`
- LiveCanvas-recipe prose mentioning "KodaX is a coding agent" → generalize to "agents where slow-correct beats fast-wrong" (still applies as Methodology rationale, just not KodaX-named)
- `DEFAULT_BENCHMARK_RUNS = 3` stays — solid default

**Note**: `runBenchmark`'s "quality is the only scoring metric, latency informational" choice was a KodaX-specific one. PromptPrism keeps the choice but documents it as a *configurable* default. Adapters that want speed-scored could later add a `BenchmarkConfig.scoringMode: 'quality-only' | 'composite'` option (Phase 2+).

### 3.4 report.ts → report/benchmark-md.ts + report/compact-summary.ts

**Port**: Entire 9-section markdown rendering (`renderBenchmarkReport`), `renderCompactSummary`. All 9 section renderers (run summary, methodology, score matrix, sub-dimensions, latency, variance, ranking, failure patterns, reproduction).

**Scrub**:
- Section 2 "KodaX is a coding agent..." prose → generalize to *"For agent classes where slow-correct beats fast-wrong, quality-only ranking is the right primitive. Configurable; switch via BenchmarkConfig if your agent class differs."*
- Section 9 reproduction commands `npm run test:eval -- <path>` → generic `promptprism run <case>`

**Naming**: `renderBenchmarkReport` and `renderCompactSummary` stay.

### 3.5 persist.ts → persist/write-benchmark-result.ts + persist/read-benchmark-result.ts

**Port**: All of `writeBenchmarkReport` and `readBenchmarkResult`. The `outDir` defaults, `codes/` raw output dir, `codes-index.json` lookup map, `.gitignore` convention prose.

**Scrub**: `DEFAULT_RESULTS_ROOT = path.join(process.cwd(), 'benchmark', 'results')` → make `benchmark/` configurable (default `results/` at repo root, with `.gitignore` template suggested in docs).

**Naming**: `writeBenchmarkReport` → `writeBenchmarkResult` (matches the data shape better; was misnamed in KodaX).

### 3.6 agent-task-runner.ts → spawn/run-agent-in-worktree.ts

**This is the HARDEST file to port.** ~70% is KodaX-specific (variants H1-ref/H2-A/H2-B, KODAX_FORCE_MAX_HARNESS env, `~/.kodax/sessions/` jsonl format). The generic ~30% is the worktree+isolated-HOME+spawn boilerplate.

**Port** (the generic skeleton):
- Setup worktree (delegates to `worktree/setup-worktree.ts`)
- Setup isolated HOME at `<worktree>.home/` so spawned process can't leak into user's real `~/.kodax/...` (or any tool's home)
- Spawn a configurable subprocess with worktree as cwd, isolated HOME, supplied env
- Capture stdout/stderr (truncated to last 64KB), exit code, timeout-killed flag, duration
- Diff worktree against base SHA to enumerate `filesChanged`
- Cleanup hook (worktree teardown is automatic via setup-worktree; isolated HOME teardown is deferred so caller can post-mortem session artifacts)

**Scrub** (the KodaX-specific layer):
- `EvalVariant = 'H2-A' | 'H2-B' | 'H1-ref'` → REMOVE (KodaX experiment terminology)
- `variantEnv()` switch on KODAX_FORCE_MAX_HARNESS / KODAX_PLANNER_INPUTFILTER → REMOVE (replaced by user-supplied env)
- `findEvalSessionJsonl()` reading KodaX-specific `~/.kodax/sessions/*.jsonl` format → REMOVE (adapter responsibility — the adapter that wraps KodaX in `adapters/kodax/` does this; framework provides the isolated HOME, doesn't read its contents)
- `kodax -p <userMessage>` spawn convention → REPLACED by user-supplied `binOverride` always (no default `kodax`)

**Refactored API**:
```ts
// run-agent-in-worktree.ts
export interface SpawnAgentInput {
  readonly caseId: string;
  readonly gitHeadSha: string | null;
  readonly repoRoot?: string;
  readonly bin: { command: string; args?: readonly string[] };  // user always supplies
  readonly userMessage: string;
  readonly extraEnv?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly seedNodeModules?: boolean;
}

export interface SpawnAgentResult {
  readonly caseId: string;
  readonly exitCode: number | null;
  readonly processOk: boolean;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly isolatedHomePath: string;  // caller reads adapter-specific artifacts here
  readonly filesChanged: readonly string[];
  readonly stdoutTail: string;
  readonly stderrTail: string;
}
```

The `isolatedHomePath` is the key handoff: framework prepares it, adapter (e.g., `adapters/kodax/`) reads its own session jsonl from there.

### 3.7 worktree-runner.ts → worktree/* (split into 5 files)

**Port** almost everything:
- `setupWorktree` → `setup-worktree.ts` (100 LoC). Parameterize prefix (default `promptprism-eval-`).
- `cleanupWorktree` + `runInWorktree` → `cleanup-worktree.ts` (30 LoC).
- `scanAndCleanOrphanWorktrees` → `orphan-scan.ts` (50 LoC). Generic prefix.
- `snapshotPrimaryRepo` + `assertPrimaryUnchanged` + `assertPrimaryHeadUnchanged` → `snapshot-primary-repo.ts` (80 LoC). All generic.
- `seedNodeModulesIntoWorktree` → `seed-node-modules.ts` (60 LoC). Generalize to a configurable pre-run hook (current behavior: workspaces-aware copy; could become user-supplied `preSpawnHook(worktree)` callback in framework).

**Scrub**:
- `WORKTREE_PREFIX = 'kodax-eval-'` → `'promptprism-eval-'` (default; configurable via setup option)
- KodaX-specific error messages mentioning v0.7.32 / FEATURE_107 / "P5 second pollution incident" → generic prose explaining what the check guards against
- Comments referencing KodaX feature numbers → drop

## 4. Naming map (KodaX → PromptPrism)

| KodaX | PromptPrism |
|---|---|
| `KodaXMessage` | `LLMMessage` |
| `KodaXReasoningRequest` | `LLMReasoningRequest` |
| `KodaXToolDefinition` | `LLMToolDefinition` |
| `KodaXResult` (returned by getProvider) | `LLMStreamResult` |
| `getProvider(name)` | `LLMProvider` interface; user supplies impl |
| `ModelAlias` (typed union of 8 KodaX ids) | `string` (user defines own type if wanted) |
| `MODEL_ALIASES` constant | constructor arg to `AliasResolver` |
| `EvalVariant` (`H2-A` / `H2-B` / `H1-ref`) | REMOVED — KodaX-internal experiment vocabulary |
| `KODAX_FORCE_MAX_HARNESS` / `KODAX_PLANNER_INPUTFILTER` env vars | REMOVED — user supplies env via SpawnAgentInput.extraEnv |
| `kodax-eval-` worktree prefix | `promptprism-eval-` (default; configurable) |
| `~/.kodax/sessions/` jsonl reading | REMOVED — adapter-side concern |
| `@kodax-ai/llm` import | REMOVED — provider is interface, adapter implements |
| `KODAX_DISABLE_BANNER` | REMOVED — KodaX-specific |

## 5. Open design decisions surfaced by RE

### D-RE-1. PromptJudge (sync) + JudgeRubric (async) coexist

**Decision**: Both interfaces in PromptPrism core. `PromptJudge` for cheap mechanical assertions (regex / substring / shape — KodaX's design), `JudgeRubric` for async LLM-as-judge or hybrid. `runJudges(output, PromptJudge[])` returns sync. `runJudgeRubrics(input, JudgeRubric[])` returns Promise. `EvalCase.judges` field becomes `ReadonlyArray<JudgeRubric>` (the async general one); mechanical judges get wrapped via `mechanicalJudge(promptJudge): JudgeRubric` adapter.

**Rationale**: EVAL_GUIDELINES §F insists mechanical-first / LLM-fallback. Forcing all judges to be async gates *every* eval on a Promise even when the judge is `regex.test(output)`. Bad latency + bad ergonomics. Keep both surfaces.

### D-RE-2. LLMProvider abstraction shape

**Decision**: `LLMProvider.stream(messages, tools, system, reasoning?): Promise<LLMStreamResult>`. Mirrors KodaX's `provider.stream` signature with renamed types. Adapters implement against their LLM SDK (Anthropic / OpenAI / Vercel AI SDK / etc.). PromptPrism core never directly imports any vendor SDK.

**Rationale**: Single interface keeps the harness math agnostic. Vendor lock-in is at adapter layer.

### D-RE-3. Worktree is opt-in for non-coding cases

**Decision**: Add `EvalCase.requiresWorktree?: boolean`. Defaults: `true` if `language` is set (coding case), `false` otherwise. Framework only creates a worktree when `requiresWorktree === true`. Non-coding cases (support / routing / content) skip the ~28s worktree setup entirely.

**Rationale**: Broadened positioning means non-coding agents are first-class; forcing them through worktree setup is wasteful and confusing.

### D-RE-4. AgentAdapter contract — isolated HOME handoff

**Decision**: Framework creates `<worktree>.home/` and passes its absolute path to adapter via `AgentRunOpts.env['HOME'] = path` (and `USERPROFILE` on Windows). Adapter spawns its agent as a subprocess with that env; the agent's filesystem effects (sessions, config) land in isolated HOME. After adapter returns, framework leaves isolated HOME in place so judges can read adapter-specific artifacts (e.g., session jsonl). Cleanup is owner-explicit via `cleanupAgentArtifacts(result)`.

**Rationale**: Generic enough to handle any agent. Adapter-side artifacts (session formats) stay in adapter; framework only knows "here's an isolated dir, your agent's writes go here, you can read your stuff back later".

### D-RE-5. Bench scoring mode

**Decision**: Phase 1 ships quality-only scoring (current KodaX choice — slow-correct > fast-wrong for coding agent). `BenchmarkConfig.scoringMode` field exists but only `'quality-only'` accepted in Phase 1. Phase 2+ adds `'composite'` for interactive UI agent class.

**Rationale**: Don't pre-build alternate scoring modes; add when an actual non-coding adapter demands it.

## 6. Recommended port order

Five-stage incremental port. Each stage compiles + has tests + ships to packages/core before next stage starts.

### Stage A (~3 hours): Pure logic — no LLM dependency
1. `judge/judges.ts` (5 factories direct port)
2. `judge/run-judges.ts` (runJudges + AggregatedJudgeRun)
3. `judge/judge-rubric.ts` (async wrapper + bridge)
4. `harness/stats.ts` (median / percentile / stdDev)
5. Tests for all of above (unit, no LLM, no fs)

**Acceptance**: `npm test` runs unit tests on judges + stats. `npm run typecheck` green.

### Stage B (~3 hours): Filesystem + git — no LLM
1. `worktree/setup-worktree.ts`
2. `worktree/cleanup-worktree.ts`
3. `worktree/orphan-scan.ts`
4. `worktree/snapshot-primary-repo.ts`
5. `worktree/seed-node-modules.ts`
6. Tests using temp-dir fixtures + a throwaway git repo

**Acceptance**: Tests can create + tear down worktrees; orphan scan works.

### Stage C (~2 hours): LLM provider abstraction
1. `llm/llm-provider.ts` (interface only)
2. `llm/llm-message.ts` (types)
3. `alias/alias-resolver.ts` (with constructor table)
4. Tests: alias resolver + a mock LLMProvider that echoes input

**Acceptance**: Mock provider can be plugged into harness later.

### Stage D (~4 hours): Harness math
1. `harness/run-one-shot.ts` (uses LLMProvider)
2. `harness/run-ab-comparison.ts`
3. `harness/run-benchmark.ts` (the big one)
4. `harness/format-comparison-table.ts`
5. Tests using mock LLMProvider with deterministic fake outputs

**Acceptance**: A 2-variant × 2-mock-model × 3-run benchmark runs end-to-end and produces a `BenchmarkResult`.

### Stage E (~3 hours): Reporting + persistence + spawn
1. `report/benchmark-md.ts`
2. `report/compact-summary.ts`
3. `persist/write-benchmark-result.ts`
4. `persist/read-benchmark-result.ts`
5. `spawn/run-agent-in-worktree.ts` (depends on Stage B worktree primitives)
6. Tests for each

**Acceptance**: A complete bench run can be written to disk, re-read, and re-rendered to markdown. spawn can run a fake binary in a worktree end-to-end.

### Total: ~15 hours of focused porting work + tests

DESIGN.md said 3-5 days. With tests, Stage A-E is 2-3 days of focused work. Stretch to a week including tests + edge case fixes.

## 7. Files NOT being ported (intentional)

From the 7 source files, **nothing wholesale skipped** — every file contributes generic logic. But these specific *pieces* don't make the trip:

- KodaX-specific variant types (`H1-ref` / `H2-A` / `H2-B`) and their forcing-env logic (lines 42-141 of `agent-task-runner.ts`) — KodaX's H2 plan-execute boundary experiment vocabulary
- KodaX session jsonl reader `findEvalSessionJsonl()` (lines 158-177 of `agent-task-runner.ts`) — KodaX-private session format
- 8-entry `MODEL_ALIASES` map (lines 47-56 of `aliases.ts`) — KodaX deployment data
- `@kodax-ai/llm` imports (lines 22-27 of `harness.ts`) — replaced by `LLMProvider` interface
- All "KodaX is a coding agent..." prose justifying scoring choices — preserved as logic, generalized as prose

## 8. Risk + mitigation

- **Risk**: AgentAdapter contract still leaks KodaX-isms via `isolatedHomePath` semantics. **Mitigation**: D4 sanity check — second adapter (Aider or ClaudeCode shim) at end of Phase 1 W2; if interface needs breaking, break the interface, don't workaround in adapter.
- **Risk**: Sync-vs-async judge bridge (`mechanicalJudge(promptJudge): JudgeRubric` adapter) introduces ~30 LoC of glue. **Mitigation**: Keep glue in `judge/judge-rubric.ts`; don't proliferate.
- **Risk**: Scope creep during port — temptation to refactor or improve while reading KodaX code. **Mitigation**: Two-pass discipline. Pass 1: port with as-faithful-as-feasible re-author + new naming. Pass 2 (later): refactor based on real adapter feedback, not pre-emptive guessing.

## 9. After the port

- Run all unit tests across stages → 100% green
- `tsc -b` builds packages/core → declarations emitted, no errors
- File / dir count check: ~25 source files + ~25 test files in packages/core/src/
- LoC check: ~1,560 LoC source + ~800 LoC tests = ~2,400 total. Reasonable for a typed eval framework.
- Update `packages/core/src/index.ts` to re-export the public surface
- Update `packages/core/package.json` description if needed
- W2 work (first reference adapter — KodaX wrap) starts against the stable interface

## 10. Approval gate

Before starting Stage A, owner should review:
1. Module structure (§2)
2. The 5 design decisions surfaced (§5) — especially D-RE-1 (sync+async judges) and D-RE-3 (worktree opt-in)
3. Ordering (§6)

Once approved, port proceeds linearly through stages; each stage's commit hits main with green CI.
