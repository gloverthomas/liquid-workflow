# 0007 — Kill switches, idempotency, dead letters, PII scrub and retention

- **Status:** Accepted · recorded 2026-09-26

## Context

An automated system that reacts to webhooks needs a way to stop instantly, must not double-run on retries, must keep failures for replay, and mustn't leak secrets or personal data into Slack briefs or logs.

## Decision

- **Kill switches** (env, then restart): `WORKFLOW_ENABLED`, `SIGNAL_ENABLED`, `LINEAR_AUTO_ENABLED`, `GITHUB_AUTO_DONE_ENABLED`. They pause behaviour without touching DNS or the tunnel. `/status` shows their state.
- **Idempotency:** webhook delivery ids are recorded in `runs/ops/webhook-deliveries.json`, plus per-issue locks.
- **Dead letter:** failed plan, implement or done steps are appended to `runs/ops/dead-letter.jsonl` for replay and audit. Failures and gate blocks also raise a Slack ops alert (`src/ops-alert.ts`).
- **PII/secret scrub** (`src/pii.ts`) on outbound briefs and access logs: emails, GitHub/Linear/Cursor/AWS keys, Slack webhook URLs, bearer tokens and JWTs are replaced with placeholders.
- **Retention:** run records and access logs are pruned after `RUN_RETENTION_DAYS` (14).

## Consequences

- "Stop everything" is one env var and a restart.
- Scrubbing is pattern-based: new secret formats need a new pattern.
- Evidence older than 14 days is gone; export anything needed for a longer investigation.

## Alternatives considered

- **Feature flags in a hosted service** — nicer, but depends on the hosting move (0005).

## Where it lives

`WRITE-POLICY.md` "Encoded controls", `src/ops.ts`, `src/ops-alert.ts`, `src/pii.ts`, `src/retention.ts`.
