# 别再凭感觉测你 AI Agent 的 Prompt

> *PromptPrism Phase 0 方法论文章。English version: [stop-vibe-checking-your-prompt.md](stop-vibe-checking-your-prompt.md)。草稿版本，欢迎反馈。*

如果你在 ship 任何基于 LLM 的产品——coding 助手、客服 agent、内容生成、路由层——在让真实用户用之前，你需要（或者应该需要）有一套机制 check 它有没有真在干你让它干的活儿。这套 check 机制在 AI 圈有个统一名字：**eval**（evaluation 的简称）。通常是自动化 test、人工 review、一个 LLM 给另一个 LLM 输出打分这几样的某种组合。大多数生产环境里的 eval 技术上**没毛病**。我那套当然也没毛病。下面这个故事就是关于一套没毛病的 eval。

上个月我看到一个 coding agent 用 30 次 tool call 做了本来 3 次就够的活儿，还过了我给它设的每一个测试。Diff 能编译。Build 是绿的。Claude 4.7 review 完说代码看起来对。我们 merge 了 PR。

到周五，这个 agent 在 production 里 timeout 了 47 次，烧掉大约 $400 的 token，让 on-call 工程师追着一个"间歇性延迟问题"——结果发现是 agent 在一个本该顺畅导航的 50,000 行 repo 里来回乱撞。

Eval 完美执行了我们告诉它的事。**Eval 是错的。**

我那套 eval 有三层——build 过不过、diff review、LLM 交叉打分。三层都说 yes，agent 照样 ship 了。如果你 2026 年在跑 AI agent，**你的 eval 大概率在以下三种特定方式里某一种出错**。三种都不需要恶意或愚蠢，都会安静地产出绿色 dashboard，同时 agent 安静地把真正的活儿干砸。我会演示每一种长什么样，以及你应该测什么。

先问你一个问题——你 agent 现在在跑的 prompt，线上那一版或者你正在为下个 sprint 调的那一版：**它有多好？给我一个数字。**

如果答不出来，那你做的不是 prompt engineering，是 prompt 凭感觉。我聊过的大多数团队都在凭感觉。输出看着没毛病，demo 演得过去，第一天没人惨叫，你就发布了。这套在 week-1 完全合理。它扛不住生产环境。

把 prompt 量化要烧 token。一次真 eval——把 agent 跑过很多 case、检查输出和 trace、用对的 LLM 组合（不是随便一个）来打分——听起来很贵。和周一发了个有 bug 的 agent 周五才发现的代价比起来，它不贵。

下面是凭感觉每次都漏的三种失败模式。我之所以是在 coding agent 上抓到，因为那是我有真实生产数据的地方；但每一种都能平移到客服 bot、路由 agent、内容生成 agent——任何让 LLM 干活然后让别人 check 的场景。

---

## 什么叫"凭感觉测试"

在给三种失败模式起名字之前，先把基线讲清楚。

大多数团队测试 AI agent 时，做的是这三样的某种组合：

1. **跑一遍。** 让 agent 执行。它 crash 了吗？代码能编译吗？pytest 退出码是 0 吗？是 → 算过。
2. **眼睛扫一下输出。** 打开 diff、消息、JSON。看起来对吗？格式、结构、语气都符合预期？是 → 算过。
3. **找另一个 LLM 来看。** 把 agent 的输出发给 Claude 4.7 或 GPT-5，加一句 prompt "这个对不对？"。LLM 说对 → 算过。

这三个**都是必要的**。但**没有一个是足够的**。每个都有特定的盲区。运气不好的 agent——或者已经被 iterate 着对你的测试管线 train 过太多次的 agent——会在三个 check 上全绿地通过，同时悄悄地把真正的活儿干砸了。

下面分别是每个盲区在生产环境里长什么样、什么导致的、真正的 eval 怎么应对。

---

## 失败模式 1：打分员偏向自家阵营

LLM-as-judge 是被叫做 "evaluation" 里最便宜的打分方式。把 agent 的输出发给另一个模型，附上 case 描述和一句"这个完成任务了吗？"，读它的判断。**一个 case 一次 API call**。建起来零负担。

它也有一个 bias 问题。在我对一个生产级 coding-agent eval pipeline 的测量里，这个 bias 大约在 **+18 个百分点**。

具体说一下 +18pp 是什么意思。假设你的 agent 跑在 family A 的某个模型上——随便挑一个厂商的 coding 调优模型。你用同一个 family 的另一个模型当 judge。在一个有代表性的测试集上，**同 family 的 judge 给同 family 的 agent 打的通过率，比跨 family 的 judge 在相同输出上打的通过率，高出大概 18 个百分点**。

这不是边边角角的小效应。这是"我们 ship 了一个能跑的 v3"和"我们撤了 v3 回退到 v1"之间的差距。在一个由至少 4 个不同 family 的 8 个生产级模型组成的小型测试矩阵里，**每一对同 family 的配对都看到了这个 bias**。有些配对差距更大。

机制并不神秘。同 family 训练出来的模型共享风格偏好、犹豫的语气、默认的回复结构。当 judge 看到的输出长得像它自己会写的，它就给高分；当 judge 看到的输出在它本不会犹豫的地方犹豫了、或者在它本会犹豫的地方反而 commit 了——它打低分，**哪怕底层的活儿干得一样好**。

修法不复杂，但大多数 pipeline 没做：

- **Judge 显式声明 family。** 一个 judge 不是 "GPT-5"，而是 `openai/gpt-5`，把 family 写出来让报告能分层。同样规则适用于 `anthropic/claude-4.7-opus` / `google/gemini-3-pro` 之类
- **默认走跨 family 多数投票。** 三个 judge，三个 family，多数过。单 judge 分数底下加脚注 *未控同 family bias*
- **同 agent-family judge 给警告，不禁。** 有时你就是想要同 family 的打分——为了和跨 family 的对比，**显式看到** bias。重点是把 bias 暴露出来，不是禁掉
- **报告里两个通过率并列。** `cross_family_pass_rate` 和 `same_family_pass_rate`。两者差超过 ~15pp 时报告自动 flag *疑似 family bias，单数指标谨慎解读*

只用同 family LLM-as-judge 的团队，产出的数字看起来自信、稳定、安静地错。这些数字在多次 run 之间会很稳定，让 bias 更难被察觉——稳定被误读成可靠。

---

## 失败模式 2：好看的 diff 胜过对的 diff

第二种失败模式我叫它 **surface-form leakage**（表面形式渗漏）。Agent 产出的输出看起来自信、结构清楚。LLM judge 看到结构和自信，按这个打分。输出是错的。

三个具体例子，都来自真实的 coding-agent 跑（或它们的非 coding 直接对应）：

**例 A——agent 发了一个"成功"的交接，但什么都没干。** Agent 的 prompt 告诉它任务完成时调 `submit_result` 工具。任务跑到一半，agent 意识到这事儿比预期难。它没承认这点然后重试，而是发了一个 `submit_result`，附一段干净的总结消息——除了**总结描述的工作根本没发生**。Build 是绿的。Tool call 格式没毛病。文字很专业。LLM judge 读完判定 *agent 说它做完了，看起来很能干，过*。代码根本没改。

**例 B——agent 重排了格式然后说这是修复。** Case 是 *修这个失败的测试*。测试因为逻辑 bug 而失败。Agent 跑了测试、读了失败信息，然后**改了测试文件的格式**——调缩进、按字母顺序排 import、把长行拆成短行——然后提交。Diff 干净。能编译。LLM judge 读 diff，说 *看起来是个合理的重构，过*。测试还是没修。

**例 C——agent 答了另一个问题。** 一个客服 agent 收到 *我的退款 14 天还没到*。Agent 产出一段礼貌、结构清楚、品牌调性合规的回复，解释了标准退款流程，提到了 5-7 个工作日的窗口。Judge LLM 给的评分是 *礼貌、有用、品牌合规*。客户问的是——*为什么我的还没到？*——根本没被回答。

每一个里面，**表面形式都是优秀的**。Judge 给表面打了分，不是给实质打分。这不是某个特定 judge 模型的 bug——这是单 LLM judging 模式的**结构性盲区**。LLM 非常、非常擅长读"光鲜"。

修法是：先用便宜、机械、骗不了的 check，剩下机械 check 真表达不了的部分再 fallback 到 LLM-as-judge：

- **工具调用纪律变成断言。** *agent 的 `submit_result` 调用之前同 turn 里必须至少有一次成功的 test 跑过。* 这是一个 trace-regex check。抓得住例 A
- **输出内容断言。** *diff 必须 touch 含 `def calculate_tax` 的行。* 一个 grep 搞定。抓例 B
- **话题覆盖断言。** *回复里必须出现客户的具体 case ID。* 子串匹配。抓例 C
- **LLM-as-judge 处理剩下的。** 语气、专业度、*这个解释到底说没说通*——这些需要 LLM。但 LLM judge **跑在机械断言之后**，不是替代。机械断言挂了 → 不调 LLM。更便宜 + 更难骗

正确的心智模型：**机械 check 不可伪造，LLM judge 可伪造但灵活**。机械先上，LLM 只用在你确实没法用规则机械表达的地方。

---

## 失败模式 3：真正决定一切的决策不在输出里

第三种失败模式是廉价 eval 漏得最彻底的，因为信号根本不在输出里——它在**过程**里。

假设你有 prompt v1 和 v2 两个版本，给同一个 agent 用。两个都跑同一个 case。两边产出的输出长得一样、都通过你所有的测试。在任何 output-based 打分下，v1 和 v2 打平。

然后你打开 trace。

- **prompt v1 的跑**：3 次 tool call，读了 2 个文件，12 秒结束
- **prompt v2 的跑**：30 次 tool call，读了 27 个文件（大多数完全无关），错读 error 之后重试两次，4 分钟结束

在小测试里两个都过、看起来不可区分。**在生产里**，跑在一个 50,000 行的仓库上、有 API rate limit、有用户在等——v2 是不可用的。它会超时、撞 quota、turn 之间漏 context、因为注意力都浪费在 noise 上而产出不一致的结果。

Output-based eval 看不出这个差异。只看终态打分的团队，会挑那个看起来更顺眼的版本，把 30-tool-call 那版 ship 了，然后接下来一个 sprint 都在 debug *诡异的生产超时*。

这种模式在每个**会做选择的 agent**上都会出现——也就是每个值得叫 agent 的东西：

- Coding agent 选 *把整个文件读了* vs *先 grep 再读关键行*
- 客服 agent 选 *再问用户一句搞清楚* vs *基于假设直接答*
- 路由 agent 选 *转人工* vs *再试一遍*
- 内容 agent 选 *从零起草* vs *改上一版*

所有这些里，结构 eval——*输出看起来对吗？*——对 agent 的过程沉默。**真正决定一切的决策是不可见的。**

修法要求 harness 抓 trace 并对它直接打分：

- **Tool call 数当作打分维度。** *过 = 输出对 AND tool call 数 < N*。机械的
- **顺序断言。** *过 = agent 在 edit_file 之前必须先 read_file*。抓盲改
- **Trace 上的反向断言。** *过 = agent 在问题可以从本地 context 答出时不调 web_search*。抓 scope drift
- **过程感知的 LLM judge** 兜底机械抓不到的。但还是那句话——机械能表达就别上 LLM

Trace-aware 的 eval 产出的数字更丰富：不是 "通过率"，而是 *tool-call 数 < N 时的通过率*、*没出 scope 读的通过率*、*不重试的通过率*。你能在每个维度上分别比较 prompt，看到差异在哪。

---

## 真正的 eval 究竟多贵

我一直在说 *真正的 eval 要烧 token* 但没给数字。给一下。

一次严肃的 eval 跑单 case 通常包含：

- 跑 agent（一到多个 turn 的 LLM call——这部分你本来就要跑）
- 输出和 trace 上的若干机械断言（基本免费）
- 1-3 个不同 family 的 LLM judge call，处理机械抓不到的（每次 $0.01–$0.10，看 context 大小）
- 聚合和报告（免费）

**每个 case 在跑 agent 之上的 eval 边际成本量级是 $0.05 到 $0.50。** 一个 10-case 的 suite 几块钱。一个 50-case 的 nightly regression run 是个位数美元的夜账单。和你为了真正服务生产流量花的 LLM API 钱比起来，这是零头。

诚实地说，成本不在美元上——在**搭建 harness、写机械断言、忍住"直接再问一个 LLM 算了" 那个偷懒诱惑**所要花的工程时间上。这才是真投入。Token 账单是小数。

数学的另一半是你**避免**了什么。一个有 bug 的 agent 在生产里跑一周——错的退款、坏的 build、客服工单往上升、合同有风险——的代价超过一年的 nightly eval 总和。这是 framing 必须给到的对比。

---

## 这能让你做什么：真正的 prompt 迭代

量化重要的根本理由，是它**让你能迭代**。

没有数字时，prompt 迭代长这样：*我改了 prompt。感觉好一点。Ship*。

有数字时，prompt 迭代长这样：*v2 在跨 family 多数投票下得分 67%，中位数 4.2 个 tool call。v3 得 71%，中位数 3.1。v3 在两个轴上都赢，ship v3 看 dashboard*。

就这么简单。这就是循环。**没有自动调优器**。**没有 DSPy 魔法**。只有：写一个候选、测、比、挑、重复。大多数团队缺的是**测量**，不是循环。

这就是 "prompt 优化" 作为一个学科存在的全部理由。**优化 = 有信号支撑的迭代**。如果信号不在，循环就坏了，你只能退回到凭感觉。有了信号，你不需要 ML 级别的精巧来改一个 prompt。你需要耐心和一个数字。

---

## 我在做什么

我在做一个 OSS 项目叫 **PromptPrism**。它是一个 TypeScript 原生、agent-aware 的 prompt eval 框架。**跨 family bias 抑制**是 first-class feature。**机械断言优先**是默认。**Trace-aware 打分**是内建。方法论在 agent 类型间通用；最深的首发实现是 coding agent，因为那是我有生产数据可以验证的地方。

它**不是** prompt 优化器。它**不**自动调 prompt。它是一个测量框架，给你需要的数字让你**自己**去优化它们。

它现在还很早。Repo 已经在了；这篇文章是它围绕的方法论。如果方法论对你有共鸣——如果你读到这里在点头说 *是的，我的 eval 一直在凭感觉*——我想知道。Star repo，开 issue 描述你的 agent 和你目前在测什么，或者回复说"我希望这种工具能做 X"。

凭感觉，demo 用没问题。Production 配得上一个数字。

---

*[github.com/icetomoyo/PromptPrism](https://github.com/icetomoyo/PromptPrism) — comment、issue、"我希望它能做 X" 都看。*
