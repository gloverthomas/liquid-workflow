# 0003 — Plans are scored by a deterministic rubric, not an LLM judge or MCP

- **Status:** Accepted · recorded 2026-09-26

## Context

Before an agent writes code, we want a cheap, repeatable signal that its plan is in-bounds: right repos, right files, tests named, scope limits and the human gate stated. An LLM grading an LLM is non-deterministic and hard to argue with when it fails.

## Decision

`src/eval/harness.ts` scores each plan artifact against fixed, pass/fail checks, for example: names the repos/files, proves parity with Playwright, calls out what's out of scope, states the human write gate (`human-write-gate`), notes the specialist review, and rejects "big-bang" or shared-BFF language. Reports are saved per run and shown at `/evals`.

- `EVAL_GATE=true` (default) blocks implementation until the latest plan eval **passes**.
- `IMPLEMENT_BYPASS_EVAL_ON_LINEAR` defaults to **false**; a demo may turn it on, production must not.
- It is plain code inside the service, **not an MCP server**: the agent can't call it, see its internals, or negotiate with it.

## Consequences

- Same plan, same score, every time; a failure names the exact check.
- Checks are keyword/structure based, so a plan can pass while being wrong in substance. The eval is a floor, not a review; humans still approve (0001), and BugBot and CI remain independent evidence.
- Rubric changes need code changes and should be re-run against saved plans (`npm run eval`).

## Alternatives considered

- **LLM-as-judge** — rejected for non-determinism and cost; may be added later as advisory only.
- **Exposing the eval as an MCP tool** — rejected: the agent would optimise for the grader instead of the task.

## Where it lives

`src/eval/`, `/evals` dashboard, `EVAL_GATE`, Liquid Insights "How are our evals tracking?".
