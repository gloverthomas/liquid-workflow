# 0006 — Every control-plane route needs a token; webhooks fail closed

- **Status:** Accepted · recorded 2026-09-26 · shipped in PR #2

## Context

The service was written as a loopback-only demo, but the tunnel (0005) made it reachable from the internet. Before PR #2, anyone could read run history and plans, trigger work, and call `/approve`. An unauthenticated `POST /implement` was demonstrably possible (it was blocked only by the write gate).

## Decision

`src/access.ts` classifies every route:

| Class | Routes | Rule |
| --- | --- | --- |
| **public** | `GET /health`, `/status`, `/`, `/evals`; `POST /signal` (triage only, called from Reporting in the browser); `POST /webhooks/*` | No token. Webhooks verify their HMAC signature inside the handler and **refuse** when no secret is configured. |
| **api** | Everything else (`/runs`, `/evals/reports`, `/gates`, `/trigger`, `/implement`, …) | `Authorization: Bearer $WORKFLOW_API_TOKEN` (≥ 24 chars) |
| **approve** | `/approve` | Its own `APPROVE_TOKEN` (the API token also works for trusted callers such as Liquid Insights) |

Tokens are compared in constant time (both sides hashed first). With no token configured the service **fails closed** (503), never open. Eval is no longer bypassed on the Linear In Review path.

## Consequences

- Liquid Insights holds `WORKFLOW_API_TOKEN` server-side only and is the main reader of runs, evals and gates.
- The public `/status` and `/evals` pages are read-only dashboards; don't add anything sensitive to them.
- New routes are **api** by default; making one public needs a deliberate change in `routeAccess`.

## Alternatives considered

- **Cloudflare Access in front of the tunnel** — good defence in depth; not yet configured because webhooks and the browser-called `/signal` need exceptions.
- **IP allowlisting** — webhook sender IPs change; brittle.

## Where it lives

`src/access.ts` (+ `src/access.test.ts`), `src/server.ts`, `src/linear-webhook.ts`, `src/github-webhook.ts`.
