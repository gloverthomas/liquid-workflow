# 0004 — Per-role model routing and read-only specialist reviewers

- **Status:** Accepted · recorded 2026-09-26

## Context

Planning across two repos needs a strong model; mechanical edits and hygiene checks don't. One model for everything either overspends or underthinks. Separately, a single agent reviewing its own plan tends to miss security and quality issues.

## Decision

- **Routing by role** through Cursor Router (`auto-smart` + `optimize_for`), when the team has Router enabled:

  | Role | Optimise for |
  | --- | --- |
  | Planner | Intelligence |
  | Security reviewer | Intelligence |
  | Quality reviewer | Cost |
  | Implementer | Balance |

  Fallbacks: per-role `CURSOR_MODEL_*`, then `CURSOR_MODEL` (default `composer-2.5`). `GET /models` / `npm run models` prints the resolved roster.
- **Specialist subagents** are created inline with the SDK: `security-reviewer` and `quality-reviewer`, both **read-only**. The parent prompt requires spawning both before finalising a plan or opening PRs.

## Consequences

- Spend follows difficulty; the roster is visible and overridable per role.
- Reviewers can't edit, so they can't "fix" their way past their own findings.
- More moving parts: if Router is off, results depend on the fallback model.

## Alternatives considered

- **One model everywhere** — simpler, but either costly or weaker on cross-repo planning.
- **Reviewers with write access** — rejected: blurs who changed what.

## Where it lives

`src/models.ts`, `src/agents.ts`, `src/sdk-planner.ts`.
