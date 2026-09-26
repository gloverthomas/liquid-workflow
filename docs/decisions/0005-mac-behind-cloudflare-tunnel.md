# 0005 — Run on a Mac behind a named Cloudflare tunnel

- **Status:** Accepted for now; revisit before wider use · recorded 2026-09-26

## Context

The service needs the local repo checkouts and the Cursor SDK environment, and it has to receive Linear and GitHub webhooks and calls from Liquid Insights. Hosting it properly (secrets, storage for `runs/`, a runner with both repos) was more work than the prototype justified.

## Decision

Run liquid-workflow on a developer Mac, bound to `127.0.0.1` (it refuses a non-loopback host outside development/test), and expose it through a **named** Cloudflare tunnel at `https://workflow.liquid-accounting.world`. The tunnel runs as two LaunchAgents with KeepAlive (`npm run tunnel:ha:install`). Ephemeral `trycloudflare.com` tunnels are avoided because their URL changes every run.

## Consequences

- Cheap and fast to iterate; the agent works against real local checkouts.
- **Availability depends on one Mac.** The tunnel restarts itself but the **service does not**; if the Mac sleeps or the service isn't running, the tunnel returns 502, webhooks do nothing, and Liquid Insights reports the workflow as unavailable.
- Because the tunnel makes it internet-reachable, the service must authenticate every route itself (0006). "Loopback only" describes the bind address, not who can reach it.
- Run history lives on that Mac's disk (`runs/`), pruned after 14 days (0007).

## Alternatives considered

- **Hosted service (container + persistent volume)** — the right next step for a team; not done yet.
- **Polling Linear instead of webhooks** — avoids inbound traffic but adds lag and API load.

## Where it lives

README "Named Cloudflare Tunnel", `scripts/`, `src/config.ts` (`host`).
