# RFC 0021: Agent reflection & self-correction (F5)

- Start date: 2026-06-07
- Authors: @ziro-agent/maintainers
- Status: **accepted** (2026-06-07) — cleared for implementation (Sprint 4 / SOTA refresh item **F5**)
- Affected packages: `@ziro-agent/agent` (primary), `@ziro-agent/tools`
- Related: [RFC 0008 §SOTA-2026](./0008-roadmap-v3.md), [RFC 0015 — Resilience](./0015-resilience.md), `repairToolCall`

## Problem

When a tool call fails (validation error, thrown exception, wrong arguments),
today's loop has two blunt options: surface the error back to the model as a
plain `tool` message and hope the next step recovers, or `repairToolCall` —
which only repairs **argument parsing**, not semantic/runtime failures. 2026
reliability research ("structured reflection") shows that turning error→repair
into an **explicit, evidence-based step** — diagnose *why* it failed, then
propose a corrected call — materially raises multi-turn tool-call success and
cuts repeated identical failures. Ziro has no such hook.

## Non-goals

- Not a planner (RFC TBD) — this is reactive correction, not upfront planning.
- Not self-editing memory or self-modifying prompts (anti-roadmap).
- Not an autonomous "keep trying forever" loop — bounded by `maxReflections`
  and the existing budget/step caps.

## Design

A composable, opt-in **reflection hook** on the agent. After a step produces
one or more **errored** tool results, and before the next LLM step, the agent
may invoke a reflector that inspects the failure(s) and returns a structured
correction directive.

```ts
interface ReflectionContext {
  step: number;
  /** The tool results that errored this step. */
  errors: ToolExecutionResult[];      // isError === true
  /** Full tool calls + results for the step (for evidence). */
  step: AgentStep;
  messages: ReadonlyArray<ChatMessage>;
  /** How many reflections have already run this run. */
  reflectionCount: number;
}

type ReflectionDecision =
  | { action: 'retry'; toolCalls: ToolCallPart[]; note?: string }   // corrected calls to run now
  | { action: 'annotate'; note: string }                             // inject guidance, let the model retry
  | { action: 'stop'; reason: string };                              // give up (finishReason: 'reflectionStop')

type Reflector = (ctx: ReflectionContext) => ReflectionDecision | Promise<ReflectionDecision>;

createAgent({
  model,
  tools,
  reflect: {
    reflector,                 // custom, OR omit to use the built-in LLM reflector
    maxReflections: 2,         // hard cap per run (default 1); composes with maxSteps/budget
    on: 'tool-error',          // trigger: 'tool-error' (default) | 'no-progress'
  },
});
```

### Built-in LLM reflector

When `reflect: true` (or `{ maxReflections }` without a custom `reflector`),
the SDK ships a default reflector that calls the agent's model with a focused
prompt: the failed call(s), the error payload(s), and the tool schema, asking
for a JSON `ReflectionDecision`. It reuses `generateObject` for typed output and
runs **inside the same budget scope** (so reflection spend counts against the
cap — see RFC 0001 C2 write-back). Diverse-failure note: the reflector is told
to default to `stop` when it cannot form an evidence-based fix, to avoid
burning the budget on guesses.

### Loop integration

- Runs in `iterateLoop` after `executeToolCalls`, only when `≥1` result has
  `isError`, and only while `reflectionCount < maxReflections`.
- `retry` → execute the corrected `toolCalls` immediately (a synthesized
  sub-step, like the resume replay path), then continue.
- `annotate` → append the note as a system/tool message and let the next LLM
  step proceed.
- `stop` → terminate with `finishReason: 'reflectionStop'` + the reason on the
  result.
- Emits `reflection-start` / `reflection-finish` step events; tracing spans
  under `ziro.agent.reflection`.

## Open questions

1. Default `maxReflections`: `1` (conservative) vs `2`. Lean `1`.
2. Should `retry` corrected calls re-enter the approval gate (RFC 0002)? Yes —
   safety first; a corrected mutating call must re-approve.
3. Interaction with `repairToolCall`: repair stays for parse errors (cheaper,
   no LLM); reflection handles semantic/runtime errors. Document the ordering.

## Adoption

Ship behind `createAgent({ reflect })`; default off (no behaviour change).
Add a cookbook + an eval case showing reduced repeated-failure rate. Mark
**F5** done in ROADMAP §SOTA refresh when the hook + built-in reflector + tests
land.
