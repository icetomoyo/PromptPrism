# PromptPrism — Design (Locked Decisions)

> 本文档是项目的**已锁定**设计基线。新加 contributor / 新 thread 接手时**先读这一份**。
> 后续所有改动必须明确说明是否动了这里的 locked decisions。

---

## 1-line positioning

> **TypeScript-native, agent-aware prompt eval framework with cross-family bias dampening. Methodology applies to any AI agent (coding / support / content / routing). Coding agent is the first deep specialization, not the definitional scope.**

差异化 moat 是 **cross-family bias dampening + agent-aware harness**（worktree / tool trace / multi-turn choreographed）。Polyglot validator 降级为可选 power feature——agent 产代码且我们恰好有该语言原生工具链时启用，否则 no-op。

不抢 Promptfoo 的 stateless prompt-output eval 地盘（string in / score out 无 agent 上下文），守 agent-aware 这条 lane。不做 benchmark / leaderboard（SWE-bench 地盘）。

## 已锁定决策（不再讨论）

> **2026-05-08 修订**：owner 同会话 broaden 定位，1-line positioning + D2 + K3 已修订。原版"coding-agent eval framework"锁定的精神保留——但落到 *Phase 1 deep impl* 而非 framework 的 definitional scope。Coding agent 是首发深耕（receipts + polyglot validator），不是定义边界。
>
> **2026-05-09 修订**：owner 撤销所有 gate / kill condition / "blog 没反响就关项目" 类条款——D6（Phase 0 blog-first 硬 gate）整段删除、"何时算赢这个 niche" 表 + 0/4 关项目阈值删除、PROJECT_PLAN 风险表"blog 被忽略"行删除。**Project is committed**，不再以外部反响为存续判据。Blog 作为 methodology marketing 仍存在但非 gate。Scope 决定（D3 不做 Phase 1 auto-tune / D5 dataset effort 等）作为技术约束保留。

### D1. 单 runtime（TS），不做多语言原生 SDK

PromptPrism 框架本体**只**用 TypeScript 实现。**不**做 Python / Rust / Go 的原生 SDK。

**理由**：LangChain JS 永远滞后 Python 6-12 月、Vercel AI SDK 只 TS 真能用、OpenAI 30+ 工程师非 PY/JS 仍 lag、Inspect AI 政府背书 + ≥10 工程师**仍只做 Python**。多语言 SDK 维护成本是 4× 代码量 / 6-10× 工时，副业项目必死。

> 如果有人提"加个 Python SDK 让 Python 用户原生用"——拒绝。Python 用户通过 stdio adapter 接到 PromptPrism CLI，框架本体保持 TS。

### D2. Polyglot validator 是可选 power feature，不是定位本质

**修订于 2026-05-08**：原 D2 把 polyglot validator 列为 PromptPrism 的本质——这与 broaden 后的 "universal AI-agent prompt eval framework" 定位冲突，已降级。

**当下含义**：
- 框架默认 mode = AgentAdapter + Judge + AliasResolver，**agent-type-agnostic**——任何 agent（coding / support / routing / content）都能接，不绑死代码场景
- Validator 是**可选模块**：当 agent 产代码 + 我们恰好有该语言原生工具链（`tsc + vitest` / `mypy + pytest` / `cargo build + cargo test` / `go build + go test`）时启用，否则 no-op
- 单 validator ~150 LoC，4 语言 ~600 LoC + 4 docker image，单人可维护
- Non-coding agent 用户走 default validator-less mode（judge + trace eval 即可）

**Phase 1 只 ship TS + Python validator**。Rust + Go validator 留 stub interface，**等外部 PR**——绝不主动扩 scope。

**Polyglot 不再是差异化 moat**，差异化让位给 cross-family bias dampening + agent-aware harness。

### D3. Phase 1 = Eval framework only，Phase 2+ 才考虑 optimization

README.md 提到的 "automated refinement / A/B testing / auto-tune" 是 Phase 2+ 范围。

- **Phase 1 (3 months)**：eval / measure prompts → 跑 case → 给报告
- **Phase 2 (TBD)**：lightweight A/B 比较 + 人工迭代辅助
- **Phase 3 (可能永远不做)**：DSPy 风格自动优化（DSPy 团队几十人在做，单人副业碰这块是自杀）

→ 1.0 之前**禁止**写自动优化逻辑；先把 eval 做扎实。

### D4. AgentAdapter 是核心抽象，必须由 ≥2 个 reference adapter 验证

抽象只用 KodaX 一个 adapter 设计**必然**会泄漏 KodaX-isms。Phase 1 必须接通**第二个外部 adapter**（候选：Aider 通过 stdio shim / Claude Code subagent shim），以此为 abstraction sanity check。

如果接外部 adapter 时发现接口需要破坏性调整——**优先调整接口**，不要在 adapter 里写 workaround。

### D5. Datasets 是真正的护城河，必须独立投入

KodaX 的 14 个 dataset 是 KodaX-specific（H0/H1/H2 routing 之类），**不能**直接当 PromptPrism 的 starter pack。

Phase 1 必须独立设计 ≥10 个**语言中立**的 starter case（5 TS + 5 Python），覆盖：
- 基础 bug fix（编译错误 / 测试失败）
- 跨文件重构
- 工具调用纪律（不该用某工具时不用）
- 长上下文检索
- 反 surface-form 作弊（judge 不能被光鲜表面骗）

Budget: ≥30% Phase 1 effort。

---

## 关键抽象（first draft）

```ts
// packages/core/src/types.ts (initial sketch)

export interface AgentAdapter {
  readonly name: string;
  readonly description?: string;
  run(prompt: string, opts: AgentRunOpts): Promise<AgentRunResult>;
}

export interface AgentRunOpts {
  /** Worktree root — adapter must do all FS work inside this dir. */
  cwd: string;
  /** Cancellation signal. Adapter must abort cleanly. */
  signal: AbortSignal;
  /** Optional seed files written into cwd before run. */
  files?: { path: string; content: string }[];
  /** Env passthrough (API keys etc). */
  env?: Record<string, string>;
}

export interface AgentRunResult {
  /** All files in cwd after run, relative paths. */
  artifacts: { path: string; content: string }[];
  /** Tool calls / turns / errors observed. */
  trace: AgentTrace;
  cost?: { inputTokens: number; outputTokens: number; usd?: number };
}

export interface AgentTrace {
  turns: AgentTurn[];
  finalReason: 'completed' | 'aborted' | 'error' | 'budget_exhausted';
}

export interface AgentTurn {
  role: 'assistant' | 'tool';
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  text?: string;
}

export interface Validator {
  readonly language: 'ts' | 'python' | 'rust' | 'go';
  validate(cwd: string, signal: AbortSignal): Promise<ValidationResult>;
}

export interface ValidationResult {
  pass: boolean;
  failures: Array<{
    kind: 'compile' | 'test' | 'lint' | 'runtime';
    detail: string;
  }>;
  durationMs: number;
}

export interface JudgeRubric {
  /** Stable id for reporting. */
  id: string;
  category: 'format' | 'correctness' | 'style' | 'safety' | 'custom';
  /** Mechanical assertions preferred over LLM judges (cheaper, more reliable). */
  kind: 'mechanical' | 'llm';
  evaluate(input: JudgeInput): Promise<JudgeVerdict>;
}
```

> **First-cut source**：`_reference/from-kodax/harness/` 下 7 个文件（2162 LoC）含 KodaX 真实生产 harness 实现。Phase 1 W1 任务是**反向工程**这些文件 → 抽出 PromptPrism 的核心接口，**不是**整搬。预估 ~880 LoC 真正通用，剩余 ~1280 LoC 是 KodaX-specific 装饰物。

---

## 非目标（Non-goals）

1. **不做** 多语言原生 SDK（D1）
2. **不做** Phase 1 自动优化（D3）——Phase 1 = eval only，给可量化信号让用户自己迭代 prompt，不替用户自动调
3. **不做** stateless prompt-output eval（Promptfoo 的强项：string in / score out 不带 agent 上下文）。PromptPrism 守 *agent-aware* 这条 lane（worktree / tool trace / multi-turn choreographed / cross-family bias dampening），与 Promptfoo 是不同 lane 不是不同 scope——方法论可以同时适用，工具定位不同
4. **不做** 固定 benchmark / leaderboard（SWE-bench 地盘）
5. **不做** hosted SaaS / 商业化（至少 1.0 之前不分心）
6. **不做** Web UI / dashboard（Phase 1 CLI + JSON report 足够）
7. **不做** provider 路由 / capability 推断（KodaX FEATURE_102 范围，与 eval 正交）
8. **不做** 自家 prompt cache 基础设施（用户自己 adapter 处理）

---

## 与已有 OSS 的差异化

| 项目 | Stars | 重叠点 | 差异 |
|---|---|---|---|
| Promptfoo | ~13k | LLM-as-judge / multi-provider | PromptPrism = agent-aware（worktree / tool trace / multi-turn choreographed）+ **cross-family bias dampening**（核心 moat）。Promptfoo stateless 路线不冲突，是不同 lane |
| Inspect AI | ~5k | Agent eval | PromptPrism 是 TS（vs Python），TS-based agent 接入零摩擦 |
| SWE-bench | n/a | Coding eval | PromptPrism 是 framework + BYO case，SWE-bench 是固定 benchmark |
| Aider Polyglot | n/a | 多语言 | PromptPrism 可在多语言上 run，Aider Polyglot 是固定 case set |
| DSPy | ~17k | Prompt optimization | PromptPrism 不做 optimization（D3），不冲突 |

---

## Open decisions（开放问题，等数据再决定）

- **License**：✅ **Apache-2.0**（2026-05-09 决定）。理由：owner 要求"任何人用必须声明使用了本项目"，Apache-2.0 通过 Section 4(c)+(d) + NOTICE 文件机制给到下游 attribution 法律强制力（比 MIT 强），是合规可执行的最高 level。LICENSE + NOTICE 落在仓库根目录。所有 `@promptprism/*` 包 license 字段均为 `Apache-2.0`。
- **Governance**：BDFL until 1.0
- **Funding**：无；副业项目
- **第二个 reference adapter**：Aider 还是 Claude Code shim？等 W1 接 KodaX adapter 时根据 stdio 兼容度决定
- **CLI 名字**：`promptprism` / `pp` / `prism`？看 npm 占用情况
