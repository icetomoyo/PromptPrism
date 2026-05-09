# PromptPrism — 已考虑事项交接

> 这份是**已经想清楚的事情**的清单，不是任务列表。具体实施方案 owner 会和你讨论。
> 接手时把这些当作"前置共识"——后面遇到具体决策点先翻这里。
> 复制下方 ``` 包围的整段给主持线程，作为 [HANDOFF_PROMPT.md](HANDOFF_PROMPT.md) 的补充。

---

```
PromptPrism 设计前置共识 brief。这是已经想清楚的事情清单，不是任务列表。具体怎么做、哪周做，跟 owner 讨论。

⚠️ **2026-05-09 修订**：本文件是 quick-read brief，**canonical source 是 DESIGN.md + PROJECT_PLAN.md**，遇冲突以 DESIGN.md 为准。同时 owner 已撤销所有 gate / kill condition 类条款（详见 DESIGN.md "已锁定决策" 顶部 2026-05-09 修订 banner + PROJECT_PLAN.md 当前状态段）。本文件下方 J / L / N 节里的"gate / 0-4 关项目 / Phase 0 blog 被忽略 → 关项目"语言已 stale，请以 canonical 文档为准。Project is committed regardless of 外部信号。

## A. Reference materials 的反向工程定位

_reference/from-kodax/ 里 7 个 harness 文件 (~2162 LoC) 是反向工程参考底本，不是直接依赖。

KodaX-isms 分 3 类，处理策略不同：

| 类别 | 例子 | 处理 |
|---|---|---|
| 名字层 | KodaXResult / KodaXProvider / @kodax/* import | 改名即可 |
| 配置层 | 8 provider alias 表 / 12 provider 列表 / KIMI_API_KEY 等具体 env | 抽接口让用户配，框架不内置 |
| 语义层 | emit_scout_verdict / scope-creep / H0/H1/H2 / FEATURE_* | 删除或泛化为示例 |

通用 ~880 LoC，剩余 ~1280 LoC 是 KodaX-specific 装饰物。反向工程 ≠ 改名 —— 重写，引入新命名体系，扔掉 KodaX 包袱。

## B. 架构职责切分

避免 KodaX 把"准备 worktree → 跑 agent → 收 artifacts → 收 trace"全捆在 agent-task-runner.ts 的大锅烩。PromptPrism 各角色职责分清：

- 框架：worktree 准备 / 写 seed files / adapter 跑完后扫 artifacts / 跑 validator / 跑 judge / 聚合报告
- AgentAdapter：只负责"在给定 cwd 里跑 agent，返回 trace"
- Validator：跑目标语言原生工具链（tsc+vitest / mypy+pytest / cargo / go test）
- Judge：mechanical 优先 / LLM judge 兜底，对 trace + artifacts + validation 给 verdict
- AliasResolver：用户在 config 里声明 alias 表，框架不硬编码任何 provider

## C. Dataset 设计哲学

KodaX 14 个 dataset 全 KodaX-specific，一个不能抄。PromptPrism starter pack 必须语言中立，每语言 5 case 共 10 个，覆盖 5 类型：

| 类型 | 测什么 |
|---|---|
| bug-fix-compile | agent 能修编译错误 |
| bug-fix-test | agent 能修单元测试失败 |
| cross-file-rename | agent 能跨文件重命名 |
| tool-discipline | agent 不该用某工具时不用（反 surface form 作弊） |
| long-context-retrieval | agent 在大 context 中找到 must-touch 信息 |

每个 case 应该是 Layer 2（single-turn LLM probe）或 Layer 3（multi-turn choreographed）—— 不做 Layer 4（free agent loop）。Layer 4 是 KodaX 反模式教训（信号被淹没、成本高、不可重复），见 _reference/from-kodax/EVAL_GUIDELINES.md。

Datasets 是真护城河，是 Phase 1 最重的一块工作（参考 30% effort）。

## D. 真正的差异化：cross-family bias dampening

PromptPrism 的差异化不在"多 provider"（Promptfoo 也有），而在跨 family LLM-as-judge bias 处理。

KodaX 实证：same-family judge 给自家模型 +18pp 偏好（kimi 当 judge 给 kimi 多打 8/10 通过，给 deepseek 8/10 失败的 case 也打 8/10 通过）。任何用 LLM judge 不做 family 分离的 eval 都是 garbage data。

PromptPrism 必须做：
- judge 声明 family
- 默认跨 family 多数投票（不是分数平均）
- self-judge default warn（不禁止，让用户决定）
- 报告 cross_family_pass_rate vs same_family_pass_rate，差 >15pp 警告 "potential family bias"

## E. 三层实验金字塔（永远先尝试上层）

来自 KodaX EVAL_GUIDELINES.md：

- Layer 1: 代码 reading + unit test（成本 $0）
- Layer 2: Single-turn LLM probe（$0.01-0.10/probe）
- Layer 3: Multi-turn choreographed（$1-10/case）
- Layer 4: Free agent loop ❌（KodaX 反模式，PromptPrism 不做）

每个 LLM eval 提案先回答"为什么这个问题不能用 Layer 1 回答"。回答不出来 → 不该跑 LLM。

## F. Mechanical 优先 / LLM-judge 兜底

KodaX judges.ts 范式 PromptPrism 完全继承：

- 能用 regex / JSON shape / tool-name presence 验的，不用 LLM judge
- LLM judge 只在 mechanical 真不可行时上（"输出文风是否专业"之类）
- 理由：mechanical 便宜 + 可重复 + 不被 surface form 骗

## G. AgentAdapter 抽象的 sanity check 机制

Phase 1 必须接通第二个外部 reference adapter（Aider 或 Claude Code shim 二选一）。用一个 adapter 设计接口必然泄漏 KodaX-isms，第二 adapter 是抽象的 sanity check。

接第二 adapter 时若发现接口要破，优先改接口不要在 adapter 里 workaround。改完同步改 KodaX adapter。

## H. Self-test 纪律

npm test 干净环境无 API key 必须全绿（mock 模式）。npm run test:eval 才烧 API key（默认 skip）。CI 只跑 npm test。这是 contributor onboarding 的硬要求—— OSS 项目第一个外部贡献者打不开 npm test 是劝退第一名。

## I. 故意没复制的 KodaX 资料及理由

| 没复制 | 理由 |
|---|---|
| harness/h2-boundary-runner.ts | KodaX H2 plan-execute boundary 专用 |
| harness/plan-intent-fidelity.ts | KodaX Scout intent 保真度专用 |
| harness/*.test.ts | KodaX 仓内单测耦合，PromptPrism 重写 |
| datasets/* 14 个 | 全 KodaX-specific（H0/H1/H2 / Pattern B / prompt-overlay 等） |
| results/* | 临时数据 |

## J. Phase 划分已锁定的策略

| Phase | 时长 | 范围 | Gate |
|---|---|---|---|
| 0 | rolling | methodology doc + scaffolding（主体已完成 2026-05-09） | 无 gate（2026-05-09 撤销） |
| 1 | ~3 月 | TS+Python eval MVP，2 reference adapter，10 dataset，cross-family bias | acceptance 信号见下，但非 gate |
| 2 | demand-driven | 轻量 A/B / Rust+Go validator / Web UI / IDE 集成 | sequencing：等 Phase 1 主体收敛 + 至少 1 个外部 PR |
| 3 | scope-guarded（D3） | DSPy 风格 auto-optimization | scope 决定，不在 1.0 之前做（D3） |

Phase 1 acceptance 信号：
- 2 reference adapter 跑全 10 dataset
- TS + Python validator 端到端绿
- multi-alias sweep + cross-family bias 报告完整
- ≥1 外部用户接通自家 agent
- ≥3 外部 issue / PR
- npm 4 包公开：@promptprism/core / validators-typescript / validators-python / cli

## K. Phase 1 之后的非目标（locked，不接受 scope creep）

- 多语言原生 SDK
- DSPy 风格自动优化
- 通用 prompt eval（Promptfoo 地盘）
- 固定 benchmark / leaderboard（SWE-bench 地盘）
- Hosted SaaS / 商业化
- Web UI / dashboard（Phase 1 内）
- Provider 路由 / capability 推断
- 自家 prompt cache 基础设施

Phase 2/3 候选项进 GitHub Discussions 排队，不直接进 roadmap。

## L. 风险与应对（已识别）

| 风险 | 应对 |
|---|---|
| AgentAdapter 抽象设计差 | 第二 adapter 是 sanity check，不通过就重做接口 |
| Datasets 设计不出来 | Phase 1 重投入；可参考 SWE-bench-mini 思路 |
| Solo 维护 burnout | Phase 1 中期招 contributor / 严守 scope 不扩 |
| Promptfoo 跟进做 agent-aware | 加快 Phase 1 占 niche，但不慌——不同 lane（stateless vs agent-aware） |

## M. 留给 owner 决定的开放问题

- license：MIT vs Apache-2.0（默认 MIT）
- npm namespace：promptprism / @promptprism / 备选 @prism-eval / @pp-eval（看占用）
- 第二个 reference adapter：Aider 还是 Claude Code shim
- governance：BDFL until 1.0（默认）
- 何时招 contributor / 公开宣传节奏

## N. 健康信号（参考用，非 gate）

> **2026-05-09 修订**：原表名"项目'赢/关'的健康信号"含 0/4 关项目阈值——owner 撤销了 kill condition，整段改为信息性参考。

| 信号 | 参考量级 | 含义 |
|---|---|---|
| GitHub stars | ≥500 in 6 months | 健康度 |
| 外部 adapter PR | ≥1 in 6 months | 抽象通过率检验 |
| 其他项目引用 PromptPrism | ≥1 in 12 months | 渗透率 |

这些是参考信号——达标好，不达标继续做。

---

以上是 owner 已经想清楚的事情。具体怎么实施、每周做什么、interface 怎么 evolve、CI 怎么搭、release pipeline 走 changesets 还是 release-please，这些 owner 跟你讨论。
```
