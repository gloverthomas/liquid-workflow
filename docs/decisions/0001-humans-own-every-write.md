# 0001 — Agents open PRs; humans approve, merge and deploy

- **Status:** Accepted · recorded 2026-09-26
- **Applies to:** liquid-workflow, Core, Reporting

## Context

The Cursor SDK agents can plan and write code across Core and Reporting. Letting an agent change production directly would make one bad plan (or one prompt injection via a ticket) a production incident, and would make it unclear who is accountable for a change.

## Decision

Agents may **open pull requests** and comment on Linear/Slack. They must **never** merge to `main`, deploy, promote previews, push to protected branches, or treat a Slack/Linear comment as deploy approval. Concretely:

- The rule is injected into every SDK prompt (`HUMAN_WRITE_GATE` in `src/guardrails.ts`) so nobody has to restate it.
- Implementation needs a **formal, recorded approval** first (`REQUIRE_FORMAL_APPROVAL=true` by default): `POST /approve`, the Slack "Approve implement" button, a Linear `/approve` comment, or Liquid Insights' "Approve & implement". Approvals are stored with actor and source in `runs/ops/approvals.json` and expire after `APPROVAL_TTL_HOURS` (24 h).
- `main` is branch-protected on Core and Reporting with required CI (Core: `build`, `assistant-unit`, `smoke`, `parity-proof`; Reporting: `build`, `assistant-unit`, `help-proof`), no force-push, linear history, admins included.
- PRs stay **atomic**: one Linear hero ticket per PR pair, no drive-by refactors, with visual proof (Playwright artifacts + `docs/pr-proof/` screenshots).

## Consequences

- Every change to `main` has a named human approver and a named human merger.
- Slower than full autonomy: an agent-ready fix waits for a person twice (approve, merge).
- The eval check `human-write-gate` fails any plan that doesn't state this gate, which is why it's the most common eval failure: the agent has to say it, not just follow it.

## Alternatives considered

- **Auto-merge when CI is green** — rejected: CI proves tests pass, not that the change is the right one.
- **Approval by moving the ticket only** (status drag) — kept as an optional demo mode (`REQUIRE_FORMAL_APPROVAL=false`), off by default because a status change isn't an auditable approval.

## Where it lives

`WRITE-POLICY.md`, `src/guardrails.ts`, `src/write-gate.ts`, GitHub branch protection on both app repos.
