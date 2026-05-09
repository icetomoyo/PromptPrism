# Stop Vibe-Checking Your AI Agent's Prompt

> *Phase 0 methodology post for [PromptPrism](https://github.com/icetomoyo/PromptPrism). 中文版: [stop-vibe-checking-your-prompt.zh.md](stop-vibe-checking-your-prompt.zh.md). Draft — feedback welcome before I push it to HN / r/LocalLLaMA / r/MachineLearning.*

If you're shipping anything built on top of an LLM — a coding assistant, a customer-support agent, a content writer, a routing layer — you've built (or you should have built) some way to check it's actually doing the job before you point real users at it. That checking apparatus has a name in the AI-research world: an **eval** (short for *evaluation*). It's usually some mix of automated tests, human review, and one LLM grading another LLM's output. Most production evals are technically fine. Mine certainly was. Here's the story.

Last month I watched a coding agent take 30 tool calls to do a 3-tool-call job, and pass every test I threw at it. The diff compiled. The build was green. Claude 4.7 reviewed it and said the code looked correct. We merged the PR.

By Friday, that agent had timed out 47 times in production, burned roughly $400 in tokens, and left the on-call engineer chasing "intermittent latency spikes" that turned out to be the agent thrashing through a 50,000-line repo it was supposed to navigate cleanly.

The eval did exactly what we asked it to. The eval was wrong.

My eval had three layers — build pass, diff review, LLM cross-check. All three said yes. The agent shipped anyway. If you're running AI agents in 2026, your eval is probably wrong in one of three specific ways. None of them require malice or stupidity. All three quietly produce green dashboards while the agent silently fails the actual job. I'll show you what each one looks like, and what to measure instead.

Quick question first — the prompt powering your agent right now, the one in production or the one you're tuning for next sprint: **how good is it? Give me a number.**

If you can't, you're not prompt-engineering. You're prompt-vibing. Most teams I talk to are. The output looks fine, the demo lands, nobody screams on day one, you ship. That works for week one. It does not survive contact with production.

Quantifying a prompt costs tokens. A real eval — running the agent against many cases, examining outputs and traces, asking *other* LLMs (the right kind, in the right combination) to grade — sounds expensive. Compared to shipping a broken agent on Monday and finding out on Friday, it isn't.

Here are the three failure modes vibe-checking misses every time. I caught all three on coding agents because that's where I had real production receipts; every one of them generalizes to support bots, routing agents, content writers, anywhere an LLM does work somebody else has to check.

---

## What "vibe-checking" actually looks like

Before naming the failure modes, let's name the baseline.

When most teams test an AI agent, they do some combination of three cheap checks:

1. **Run it.** Execute the agent. Did it crash? Did the code compile? Did pytest exit zero? If yes, mark it passing.
2. **Eyeball the output.** Open the diff, the message, the JSON. Does it look right? If the spacing, structure, and tone match what you expected, mark it passing.
3. **Ask another LLM.** Send the agent's output to Claude 4.7 or GPT-5 with a "is this correct?" prompt. If the LLM says yes, mark it passing.

All three are necessary. None of them are sufficient. Each has a specific blind spot, and an agent that gets unlucky enough — or that's been iterated against your test pipeline often enough — will sail through all three while quietly failing the actual job.

Below is what each blind spot looks like in production, what causes it, and what a real eval does instead.

---

## Failure mode 1: The grader picks its own family

LLM-as-judge is the cheapest grading method that gets called *evaluation*. You take the agent's output, send it to another model with the case description and a "did this complete the task?" prompt, and read the verdict. One API call per case. Effortless to set up.

It also has a bias problem that, in my measurements on a production coding-agent eval pipeline, runs about **+18 percentage points**.

Here's what +18pp means concretely. Suppose your agent is built on top of a model from family A — pick any vendor's coding-tuned model. You grade it with a judge from the same family. Across a representative test set, the same-family judge gives the same-family agent a pass rate that's around 18 points higher than a cross-family judge gives the same agent on the same outputs.

That's not a marginal effect. That's the difference between *we shipped a working v3* and *we cancelled v3 and reverted to v1*. In a small fleet of eight production-grade models from at least four different families, every same-family pairing showed the bias. Some pairings were larger.

The mechanism is not mysterious. Models trained in the same family share style preferences, hedging idioms, default response shapes. When the judge sees output that looks the way it would have written it, the judge rates it high. When the judge sees output that hedges where it wouldn't have hedged, or commits where it wouldn't have committed, the judge rates it lower — even when the underlying task is exactly as well done.

The fix is not subtle, but most pipelines don't do it:

- **Judges declare their family.** A judge isn't "GPT-5". It's `openai/gpt-5` with the family written down so reports can stratify. Same for `anthropic/claude-4.7-opus`, `google/gemini-3-pro`, and so on.
- **Default to cross-family majority voting.** Three judges, three families, take the majority. Single-judge scores get a footnote that says *same-family bias not controlled for*.
- **Same-family-as-the-agent judging gets a warning, not a ban.** Sometimes you want the same-family grade — to compare against the cross-family grade and *see* the bias. The point is to surface it, not to forbid it.
- **Reports show two pass rates.** `cross_family_pass_rate` and `same_family_pass_rate`. If they differ by more than ~15pp, the report flags *potential family bias — interpret single-number score with caution*.

A team that does only same-family LLM-as-judge is generating numbers that are confident, repeatable, and quietly wrong. The numbers will look stable across runs, which makes the bias even harder to spot — stability gets misread as reliability.

---

## Failure mode 2: Pretty diff beats correct diff

The second failure mode is what I'll call *surface-form leakage*. The agent produces an output that looks confident and well-structured. The LLM judge sees structure and confidence and scores accordingly. The output is wrong.

Three concrete examples, all from real coding-agent runs (or their direct analogues outside coding):

**Example A — the agent emits a "successful" handoff that did nothing.** The agent's prompt tells it to call a `submit_result` tool when it has finished. Mid-task, the agent realizes the work is harder than expected. Instead of admitting that and retrying, it emits a `submit_result` with a clean-looking summary message — except the summary describes work that didn't happen. The build is green. The tool call is well-formed. The text is professional. The LLM judge reads it as *agent says it's done, looks competent, pass*. The actual code wasn't touched.

**Example B — the agent reformats and calls it a fix.** The case is *fix the failing test*. The test fails because of a logic bug. The agent runs the test, reads the failure, then reformats the test file — adjusts whitespace, alphabetizes imports, splits a long line — and submits. The diff is clean. It compiles. The LLM judge, reading the diff, says *looks like a sensible refactor, pass*. The test is still failing.

**Example C — the agent answers a different question.** A support agent gets *my refund hasn't arrived after 14 days*. The agent produces a polite, structured, on-brand response that explains the standard refund process and mentions the 5-7 business day window. The judge LLM scores it as *polite, helpful, on-brand*. The customer's question — *why hasn't mine come?* — wasn't answered.

In each case, the surface form is excellent. The judge graded the surface, not the substance. This is not a bug in any specific judge model — it's a structural blind spot in how single-LLM judging works. LLMs are very, very good at reading polish.

The fix is to grade with the cheap, mechanical, unfoolable kind of check first, and only fall back to LLM-as-judge for things mechanical checks genuinely can't express:

- **Tool-call discipline as assertions.** *The agent's `submit_result` tool call must be preceded by at least one successful test run within the same turn.* That's a regex-on-trace check. It catches Example A.
- **Output content assertions.** *The diff must touch lines containing `def calculate_tax`.* Single grep. Catches Example B.
- **Topic-coverage assertions.** *The response must mention the customer's specific case ID.* Substring check. Catches Example C.
- **LLM-as-judge for what's left.** Tone, professionalism, *did the explanation actually make sense* — these need an LLM. But the LLM judge runs *after* the mechanical assertions, not in place of them. If mechanical fails, no LLM call. Cheaper and harder to fool.

The right mental model: mechanical checks are unforgeable; LLM judges are forgeable but flexible. Use mechanical first; fall back to LLM only when you can't express the rule mechanically.

---

## Failure mode 3: The decisions that matter aren't in the output

The third failure mode is the one cheap evals miss most completely, because the signal isn't in the output at all — it's in the *process*.

Suppose you have two prompt versions, A and B, for the same agent. You run both against the same case. Both produce identical-looking outputs that pass all your tests. By any output-based grading, A and B tie.

Then you look at the trace.

- **Prompt A's run** made 3 tool calls, read 2 files, and finished in 12 seconds.
- **Prompt B's run** made 30 tool calls, read 27 files (most of them irrelevant), retried twice after misreading errors, and finished in 4 minutes.

In a small test, both pass and look indistinguishable. In production, on a 50,000-LoC repository with API rate limits and human users waiting, prompt B is unusable. It will time out, hit quotas, leak context across turns, and produce inconsistent results because it's burning attention on noise.

Output-based eval can't see this difference. A team that grades only end-state will pick whichever prompt has the better look-and-feel and ship the 30-tool-call version, then spend the next sprint debugging *weird production timeouts*.

This pattern shows up in every agent that makes choices, which is to say, every agent worth running:

- A coding agent picks *read the whole file* vs *grep first then read targeted lines*.
- A support agent picks *ask the user for more info* vs *make an assumption and answer*.
- A routing agent picks *escalate to human* vs *try one more pass*.
- A content agent picks *draft from scratch* vs *edit the prior version*.

In all of these, the structural eval — *did the output look right?* — is silent on the agent's process. The decisions that matter are invisible.

The fix requires the harness to capture the trace and grade it directly:

- **Tool-call counts as a graded dimension.** *Pass requires output correct AND tool-call count under N.* Mechanical.
- **Sequence assertions.** *Pass requires the agent to call `read_file` before `edit_file` for any file it modifies.* Catches blind editing.
- **Negative assertions on the trace.** *Pass requires the agent to NOT call `web_search` when the question is answerable from local context.* Catches scope drift.
- **Process-aware LLM judge** as a fallback for things mechanical can't catch. But again — only if mechanical can't express it.

A trace-aware eval generates richer numbers: not "pass rate", but *pass rate at <N tool calls*, *pass rate with no out-of-scope reads*, *pass rate without retry*. You can compare prompts on each dimension separately and see where the difference is.

---

## What real evals cost

I've been saying *real evals cost tokens* without putting a number on it. Let me.

A serious eval run on a single case typically involves:

- Running the agent (one or more turns of LLM calls — this part you'd do anyway).
- A handful of mechanical assertions on the output and trace (effectively free).
- One to three LLM-as-judge calls from different model families for the things mechanical can't express ($0.01–$0.10 per judge call, depending on context size).
- Aggregation and reporting (free).

Per case, the marginal eval cost above just running the agent is on the order of $0.05 to $0.50. A 10-case suite costs a few dollars. A nightly regression run on a 50-case suite is a single-digit-dollar nightly bill. Compared to LLM API spend on actually serving production traffic, this is rounding error.

The honest cost is not the dollars — it's the engineering time to set up the harness, write mechanical assertions, and resist the temptation to skip them and *just ask another LLM*. That is the actual investment. The token bill is small.

The other side of the math is what you avoid. A bad agent in production for one week — wrong refunds, broken builds, support tickets escalating, contracts at risk — costs more than a year of nightly evals. That's the comparison the framing has to make.

---

## What this enables: actual prompt iteration

The reason quantification matters is that it lets you iterate.

Without numbers, prompt iteration looks like: *I changed the prompt. It feels better. Ship it.*

With numbers, prompt iteration looks like: *v2 scored 67% on cross-family majority with median 4.2 tool calls. v3 scored 71% with median 3.1 tool calls. v3 wins on both axes; ship v3 and watch the dashboard.*

That's it. That's the loop. There's no auto-tuner. There's no DSPy magic. There's just: write candidate, measure, compare, pick, repeat. The thing that's been missing for most teams is the *measurement*, not the loop.

This is the entire reason "prompt optimization" exists as a discipline. Optimization is just iteration informed by signal. If the signal isn't there, the loop is broken, and you fall back to vibing. With signal, you don't need machine-learning sophistication to improve a prompt — you need patience and a number.

---

## What I'm building

I'm working on an OSS project called **PromptPrism**. It's a TypeScript-native, agent-aware prompt evaluation framework. Cross-family bias dampening is a first-class feature. Mechanical-first judges are the default. Trace-aware grading is built in. The methodology is universal across agent types; the first deep specialization is for coding agents, because that's where I have the production receipts to validate it.

It is **not** a prompt optimizer. It does not auto-tune prompts. It is a measurement framework that gives you the numbers you need to optimize them yourself.

It is also early. The repo is up; this post is the methodology I'm building it around. If the methodology resonates — if you're nodding along thinking *yes, my eval has been vibing* — I'd like to know. Star the repo, open an issue describing your agent and what you've been measuring, or reply with what you wish a tool like this would do.

Vibing is fine for a demo. Production deserves a number.

---

*[github.com/icetomoyo/PromptPrism](https://github.com/icetomoyo/PromptPrism) — comments, issues, and "I want this for X" descriptions all read.*
