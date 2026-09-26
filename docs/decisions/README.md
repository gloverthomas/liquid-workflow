# Decision records

Short records of *why* liquid-workflow works the way it does. Each one covers the context, the decision, what it costs us, and what we didn't do. Liquid Insights reads these to answer "why did we…" questions, so keep them current: when a decision changes, add a new record that supersedes the old one rather than silently editing history.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-humans-own-every-write.md) | Agents open PRs; humans approve, merge and deploy | Accepted |
| [0002](0002-linear-state-machine.md) | Linear ticket states drive the workflow | Accepted |
| [0003](0003-deterministic-eval-harness.md) | Plans are scored by a deterministic rubric, not an LLM judge or MCP | Accepted |
| [0004](0004-model-routing-and-specialists.md) | Per-role model routing and read-only specialist reviewers | Accepted |
| [0005](0005-mac-behind-cloudflare-tunnel.md) | Run on a Mac behind a named Cloudflare tunnel | Accepted (revisit) |
| [0006](0006-control-plane-access.md) | Every control-plane route needs a token; webhooks fail closed | Accepted |
| [0007](0007-operational-safety.md) | Kill switches, idempotency, dead letters, PII scrub and retention | Accepted |

Template: copy an existing record. Keep it under a page: **Context → Decision → Consequences → Alternatives considered → Where it lives**.
