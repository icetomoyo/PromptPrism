# PromptPrism — Project Plan

> 锁定决策见 [DESIGN.md](DESIGN.md)。本文档是 actionable schedule。

---

## Phase 0 — Methodology + scaffolding (done / rolling)

> **2026-05-09 修订**：原 Phase 0 写作"validate need + 硬 gate"——已撤销。owner committed to project，不再以外部反响为存续判据。Phase 0 现为已发生的方法论 / scaffolding 工作的归档段，blog 仍存在作为 marketing 资产但非 gate。

**已完成**：
- DESIGN.md 锁定决策 + broadened positioning + governance 修订
- 长文 [docs/blog/stop-vibe-checking-your-prompt.md](docs/blog/stop-vibe-checking-your-prompt.md)（~2300 词）首稿落盘——三大失败模式 / token-cost ROI / universal agent 视角 / KodaX 匿名实证。Owner review 中。**发布与否、发哪些渠道是 marketing 决定，不再 gate 工程进度**。
- 仓库 scaffolding（packages / adapters / datasets / docs 目录骨架；`_reference/from-kodax/` 反向工程参考底本）
- npm namespace `@promptprism/*` 占用查清空闲

---

## Phase 1 — MVP eval framework (~3 months, ~12 weeks)

### W1 — Foundation

- [ ] 锁定项目名：`promptprism` 是否 npm 可用（已确定项目名 PromptPrism，但 npm package name 待定）
- [ ] `package.json` workspace root + `tsconfig.json` + `.gitignore` + `vitest.config.ts`
- [ ] ~~CI scaffold（GitHub Actions）~~ — 删除项。2026-05-09 决定：现阶段 CI 没 ROI（无 tests / 单作者 / 未 public），增加 supply chain 攻击面但无价值。等真有 trigger（第一个 test / 第一个外部 PR / repo public 想要 badge）再加
- [ ] **反向工程** `_reference/from-kodax/harness/` 7 文件（2162 LoC）→ 抽 `AgentAdapter` / `Validator` / `JudgeRubric` interface 到 `packages/core/src/types.ts`，**先 spec 后 code**
- [ ] 把通用 ~880 LoC（aliases / harness / judges / report / persist 中通用部分）迁到 `packages/core/src/`，scrub 掉 KodaX-isms（provider 列表泛化、`@kodax/*` import 去除、`KodaXResult` 等具名 type 改名）

### W2 — First green hello world

- [ ] 第一个 reference adapter：`adapters/kodax/`（封装 KodaX 为 `AgentAdapter`）
- [ ] 第二个 reference adapter：`adapters/aider/` OR `adapters/claudecode-shim/`（W1 末根据 stdio 兼容度决定）
- [ ] TS validator: `packages/validators/src/typescript.ts`（spawn `tsc --noEmit` + `vitest run`）
- [ ] 1 个 hello world case（最小 TS bug fix，验"agent 能编译过+测试过"）
- [ ] CLI: `npx promptprism run hello.yml` 端到端跑通输出 pass/fail 报告
- [ ] README "5-minute getting started" 段落

### W3-W4 — Python validator + 5 dataset

- [ ] Python validator: `packages/validators/src/python.ts`（spawn `mypy` + `pytest`）
- [ ] 5 个**语言中立** TS dataset case（不抄 KodaX，新设计）：
  - bug-fix-compile-error / bug-fix-test-fail / cross-file-rename / tool-discipline / long-context-retrieval
- [ ] 5 个 Python dataset case（同样 5 类型）

### W5-W7 — Multi-alias + judge core

- [ ] Multi-alias provider sweep（generic `AliasResolver`，移除 KodaX-specific 8-alias 表，用户在 config 自定义）
- [ ] LLM-as-judge framework with bias-aware aggregation（cross-family judge 必须，self-judge 警告）
- [ ] Bootstrap CI / spread report
- [ ] Mechanical judges 优先（regex / JSON shape / tool name），LLM judge 是 fallback

### W8-W10 — Hardening + docs

- [ ] EVAL_GUIDELINES.md 升级版（基于 KodaX 版本去 KodaX-isms）
- [ ] Methodology doc site（GitHub Pages 或 vercel docs）
- [ ] `.eval.ts` 风格的 case 编写教程
- [ ] 自家 self-test：跑全套 dataset on KodaX adapter + 第二 adapter，作为 regression suite
- [ ] CI 跑 mock-mode self-test（不烧 API key）

### W11-W12 — Release prep + 1.0-rc

- [ ] npm publish dry-run，所有包 `@promptprism/*` 命名空间
- [ ] 1.0-rc CHANGELOG
- [ ] 二次 blog："PromptPrism 1.0-rc — what we built and why" + dataset 设计 walkthrough
- [ ] HN 二轮发布

### Phase 1 Acceptance

- 2 个 reference adapter 都能跑全套 10 dataset case
- TS + Python validator 端到端绿
- multi-alias judge 跑出 cross-family bias 报告
- 1 个外部用户成功在自家 agent 上接通 PromptPrism（哪怕只是简单 case）
- ≥3 个外部 issue / PR

---

## Phase 2 — Iterate (post-1.0, demand-driven)

只在 Phase 1 真起来后做：

- 轻量 A/B 比较（同 prompt 多版本对照）
- Rust / Go validator（**等外部 PR**）
- Web UI / dashboard（如果用户嗷嗷叫）
- 更多语言 dataset
- IDE 集成（VS Code extension）

---

## Phase 3 — Optimization (可能永远不做)

DSPy 风格自动优化。除非：
- Phase 1 stars ≥2k
- ≥2 个全职 contributor
- 真有人愿意付钱用 / sponsor

否则**保持非目标**。

---

## 风险与应对

| 风险 | 概率 | 应对 |
|---|---|---|
| AgentAdapter 抽象设计差 | 中 | W2 第二 adapter 是 sanity check，不通过就重做接口 |
| Datasets 设计不出来 | 中 | 30% Phase 1 effort 专门投入；可参考 SWE-bench-mini 思路 |
| Solo 维护 burnout | 高 | Phase 1 中期招 contributor / 严守 scope 不扩 |
| Promptfoo 跟进做 agent-aware | 中 | 加快 Phase 1 占 niche，但不慌 — 不同 lane（stateless vs agent-aware） |

---

## 当前状态

**2026-05-08 PM**：
- ✅ 项目仓库已建
- ✅ README.md 用户已写
- ✅ DESIGN.md 锁定决策已落地
- ✅ PROJECT_PLAN.md 本文档
- ✅ `_reference/from-kodax/` 复制完成（7 文件 + EVAL_GUIDELINES.md + benchmark/README.md）
- ✅ 目录骨架建好（packages/{core,validators,cli}, adapters/, datasets/, docs/）

**2026-05-08 PM 后续 — 定位 broadening + 方法论 doc 完成**：

- 🔄 **定位已 broaden**（owner 同会话决策）：从"coding-agent eval framework"扩到"universal AI-agent prompt eval framework"。Coding agent 降为首发深耕（receipts + polyglot validator），不再是 definitional scope。差异化 moat 改为 cross-family bias dampening + agent-aware（trace / multi-turn / worktree）。Polyglot validator 从"本质"降为"可选 power feature"。
- ✅ Methodology blog 首稿落盘：[docs/blog/stop-vibe-checking-your-prompt.md](docs/blog/stop-vibe-checking-your-prompt.md)（~2300 词）。
- ✅ DESIGN.md alignment 落手：1-line positioning + D2 + K3 + Promptfoo 差异化表 + 2026-05-08 修订 banner。
- ✅ package.json description 对齐 broadened positioning。
- ✅ npm namespace `@promptprism/*` 占用查清。

**2026-05-09 — Governance 修订（owner directive）**：

- 🗑️ **D6（Phase 0 blog-first 硬 gate）整段删除**——DESIGN.md 已落手。
- 🗑️ **"何时算赢这个 niche" 表 + 0/4 关项目阈值删除**——DESIGN.md 已落手。
- 🗑️ **风险表"Phase 0 blog 被忽略 → 关项目"行删除**——本文档已落手。
- 🗑️ Phase 0 段重写为已完成方法论 + scaffolding 归档，去掉 gate 框架。
- 🟢 **Project committed**：不再以外部反响为存续判据。Blog 作为 marketing 资产仍存在但非 gate。Phase 1 W1 framework 反向工程 unblocked，等 owner 拍 next step。

**2026-05-09 续 — 中文版 + W1 prep + 反向工程计划**：

- ✅ 中文版 blog 落盘：[docs/blog/stop-vibe-checking-your-prompt.zh.md](docs/blog/stop-vibe-checking-your-prompt.zh.md)（同步内容，introspective gap 框架保留，关键术语保留 inline 中文 + 英文混合写法）。英文版顶部加交叉链接。
- ✅ W1 Step 1 — Dev infra：`vitest.config.ts` + packages/cli + packages/validators stub package.json/tsconfig/index.ts + 根 tsconfig.json references 扩展到 cli+validators。`npm install` / `npm run typecheck` / `npm test` 全绿。**注**：原本起 GitHub Actions CI 的，2026-05-09 安全审计 + ROI 复审后删掉——单作者 / 无 tests / 未 public 阶段 CI 没价值，反增加 supply chain 攻击面。等真有 trigger 再加。
- ✅ W1 Step 2 — types.ts 演进：`EvalCase.language` 改 optional（non-coding agent validator-less 路径）+ doc header 更新为 broadened positioning + 加 ValidatorLanguage 注释说明 stub language 来源。
- ✅ W1 Step 3 — 反向工程 plan：[docs/proposals/harness-reverse-engineering-plan.md](docs/proposals/harness-reverse-engineering-plan.md)。逐文件分析 7 KodaX harness 文件 (~2,170 LoC) → 真实通用 ~1,560 LoC（DESIGN.md 880 LoC 估计偏低）。模块拆分到 packages/core/src/{alias,judge,llm,harness,worktree,spawn,report,persist}/，分 Stage A-E 渐进 port (~15 小时)。surface 出 5 个 open design decisions（D-RE-1 至 D-RE-5），需 owner approval gate。

**待定 / 等 owner 拍**：
- Owner blog review 反馈（English + 中文，修订点 / 是否发布 / 渠道——marketing 决定，不 gate 工程）
- README.md 内容 drift 处理（"auto-tune / Native Rust+Go" 与 D2/D3 冲）：方案 = 我准备 diff 你 apply
- W1 Step 4 启动 = harness 实际反向工程 port (Stage A-E)，~15 小时密集工作。建议先 owner review [docs/proposals/harness-reverse-engineering-plan.md](docs/proposals/harness-reverse-engineering-plan.md) §5 五个设计决定，再启动 Stage A
- Commit 时机 + 拆分粒度（仓库现 dirty 量大，建议起码切 3 commits：governance/design alignment + scaffolding/dev-infra + harness RE plan + blog）
