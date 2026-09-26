# 0002 — Linear ticket states drive the workflow

- **Status:** Accepted · recorded 2026-09-26

## Context

We wanted the team to start, approve and finish agent work from the tools they already use, without a new dashboard, and with every step visible on the ticket.

## Decision

The workflow is a state machine on the Linear ticket:

| Ticket moves to | Who | What liquid-workflow does |
| --- | --- | --- |
| **Todo** | `/signal` from a broken Reporting surface, or a person | Triage only: Slack + Linear notice. **No plan is started.** |
| **In Progress** | A person | Linear webhook → Cursor SDK **plan** (both repos) → deterministic **eval** |
| **In Review** | A person, after a recorded approval | Linear webhook → Cursor SDK **implement** → PRs (eval must have passed) |
| **Done** | GitHub webhook when a PR mentioning the ticket merges into `main` | Moves the ticket to Done, posts a brief |

Webhook deliveries are de-duplicated and each issue is locked while it runs, so a retried webhook can't start two plans.

## Consequences

- Linear is the audit trail: the plan and outcome are commented on the ticket.
- Anything that moves a ticket can start agent work, including other integrations. Liquid Insights moves tickets only after a confirm click, and In Review still requires the recorded approval (0001).
- A PR that merely *mentions* a ticket id can move it to Done. Keep ticket ids out of unrelated PR bodies.

## Alternatives considered

- **A button-only UI in the workflow service** — rejected: another place to look, and no natural audit trail.
- **Starting plans automatically from `/signal`** — rejected: a user-facing error isn't a decision to spend agent time; a human triages first.

## Where it lives

`src/linear-webhook.ts`, `src/github-webhook.ts`, `src/linear-done.ts`, README "Demo state machine".
