# Reference materials from KodaX

> **Source attribution**
>
> Files in this directory are copied verbatim from the KodaX project's
> `benchmark/harness/` directory.
>
> - **Upstream**: https://github.com/icetomoyo/KodaX
> - **Original license**: Apache License 2.0
> - **Copyright**: © 2026 icetomoyo (same copyright holder as PromptPrism)
> - **Commit pinned**: see git history of this directory for the exact KodaX
>   commit at the time of copy
>
> KodaX and PromptPrism are both authored by the same owner and both released
> under Apache-2.0, so the redistribution is license-compatible by definition.
> This attribution block exists for transparency and for future fork / transfer
> safety, not because of any third-party license obligation.
>
> These files are **NOT** part of the published `@promptprism/*` npm
> distribution. They live in `_reference/` solely as reverse-engineering
> reference. PromptPrism's own implementation under `packages/` is
> separately authored — see [`docs/proposals/harness-reverse-engineering-plan.md`](../../docs/proposals/harness-reverse-engineering-plan.md).

---

> **What this is**：PromptPrism 的 ~880 LoC 通用 eval harness 是从 KodaX `benchmark/harness/` 反向工程而来。
> 这个文件夹保留 KodaX 原始实现作为**反向工程的参考底本**，以便 contributor 理解每个抽象的真实生产源头。
>
> **Not for direct import**：本目录文件**不**进入 npm 包，**不**作为 PromptPrism 代码的依赖。
> 它们仅仅是设计 reference。Phase 1 W1 任务是把这些代码"反向工程 + 泛化 + scrub KodaX-isms"后落地到 `packages/core/src/`。

---

## 文件清单

| 文件 | LoC | 通用度 | 用途 |
|---|---|---|---|
| `EVAL_GUIDELINES.md` | — | **高** | KodaX 内部 eval 方法论文档；是 PromptPrism methodology doc 的起点 |
| `KODAX_BENCHMARK_README.md` | — | 中 | KodaX `benchmark/README.md` 原版，模块布局参考 |
| `harness/aliases.ts` | 88 | **高** | Multi-family alias resolver — 抽出概念，**不抄** KodaX 的 8 个具体 provider 表 |
| `harness/judges.ts` | 229 | **高** | LLM-as-judge framework，分类 / mechanical-first / parseAndAssert，参考 |
| `harness/harness.ts` | 585 | **高** | runOneShot / runABComparison / runBenchmark 主循环，反向工程主入口 |
| `harness/report.ts` | 331 | 中 | bootstrap CI / spread / 9-section markdown report，可大幅简化 |
| `harness/agent-task-runner.ts` | 372 | **高** | 真跑 agent 在 worktree 里的 runner — `AgentAdapter` 接口反向工程的核心源头 |
| `harness/worktree-runner.ts` | 423 | **高** | git worktree 隔离 + 收集 trace — `AgentAdapter` 的实际工作机制 |
| `harness/persist.ts` | 134 | 低 | JSON 落盘，可重写 |

合计 7 文件 ~2162 LoC，其中 ~880 LoC 真正通用。

---

## 反向工程要点

### 1. Aliases — 概念保留，配置外置

KodaX 把 8 个 provider/model alias 硬编码在 `aliases.ts:47-56`。PromptPrism 的等价物应该是：
- 抽象 `AliasResolver` interface
- 用户在自己的项目 config 里声明 alias 表（YAML / TS）
- 框架不内置任何 provider 表，避免变成 "KodaX 的 12 provider 列表 + 文档说你也可以加你的"

### 2. Harness — 拆解 single-purpose 函数

KodaX `harness.ts` 585 LoC 把 case loop / judge dispatch / variance / cost tracking 全捆在一起。PromptPrism 拆：
- `runCase()` — 单个 case 一次跑
- `runSweep()` — 跨 alias × variant × repeat 的矩阵
- `aggregate()` — 报告聚合（独立模块）

### 3. AgentAdapter — `agent-task-runner.ts` 是关键

`agent-task-runner.ts` 372 LoC 实际上把"准备 worktree → 跑 agent → 收 artifacts → 收 trace"四步全包。PromptPrism 的 `AgentAdapter.run()` 是其中"跑 agent"那一步——**worktree 准备和 artifact 收集是框架的职责，不应该是 adapter 的**。

### 4. Worktree runner — `worktree-runner.ts` 是框架基础设施

`worktree-runner.ts` 423 LoC 处理 git worktree 创建 / clean / 测试调用。这部分**完全**通用，PromptPrism 直接迁移即可，可能改名为 `WorktreeManager`。

### 5. Judge framework — `judges.ts` 范式正确，文案具体到 KodaX

`judges.ts` 的"mechanical 优先 / LLM judge 兜底 / 分类 5 类"的范式很正确，直接复用。但其中 `mustContainAll` / `mustNotContain` 用的具体字符串（"emit_scout_verdict" / "scope-creep" 之类）是 KodaX-specific，需要泛化为示例 case。

### 6. EVAL_GUIDELINES.md — 8 成可直接迁移

KodaX 的 EVAL_GUIDELINES.md 是项目级方法论沉淀，引用 KodaX 具体 feature（FEATURE_107 / H2-A / H2-B）的部分换成中性示例即可。**这是 PromptPrism methodology doc 的起点 80%**。

---

## NOT copied from KodaX benchmark

故意没复制（KodaX-specific，不通用）：

- `harness/h2-boundary-runner.ts` — H2 plan-execute boundary 专用
- `harness/plan-intent-fidelity.ts` — Scout intent 保真度专用
- `harness/*.test.ts` — KodaX 仓库内单测，PromptPrism 重写
- `datasets/*` — 14 个 dataset 全是 KodaX-specific（H0/H1/H2 routing / Pattern B / prompt-overlay / unicode normalization 等）；PromptPrism 必须独立设计语言中立的 starter pack
- `results/*` — 跑出来的临时数据
