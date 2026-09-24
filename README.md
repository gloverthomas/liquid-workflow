# Liquid workflow service (Cursor SDK)

Governed agent-execution layer for the Liquid × Cursor demo.

**Trigger** → **Cursor SDK planner** (both repos) + **specialist subagents** (security / quality) with **per-role model routing** → **deterministic eval** → human write-gate → **implement / PR**.

This is intentionally a thin demo BFF: loopback-only, development/test only, secrets via env, no production auth invention.

## Why this exists

The SpaceXAI exercise requires the **prototype itself** to use the Cursor SDK (not only the Cursor IDE). This service is that call site — including model routing and specialist fan-out reviewers will ask about.

## Model routing (Cost / Balance / Intelligence)

Liquid picks capability by role via **Cursor Router** (`auto-smart` + `optimize_for`) when the API key’s team has Router enabled:

| Role | Optimize for | Why |
| --- | --- | --- |
| Planner | Intelligence | Cross-repo classification + bounded plan |
| Security reviewer | Intelligence | Auth / CORS / deep-link abuse surface |
| Quality reviewer | Cost | Parity + out-of-scope diff hygiene |
| Implementer | Balance | Mechanical LIQ-9 edits + PR throughput |

Fallbacks: per-role `CURSOR_MODEL_*` env overrides, else `CURSOR_MODEL` (default `composer-2.5`) when Router is unavailable.

```bash
npm run models          # print resolved roster
curl localhost:4100/models
```

## Specialist subagents

The planner/implementer agents are created with inline SDK `agents`:

- `security-reviewer` — read-only security pass
- `quality-reviewer` — read-only code-quality / Playwright pass

The parent prompt **requires** spawning both before finalizing a plan or opening PRs.

## Eval harness (not an MCP)

Deterministic rubric over the plan artifact (`src/eval/harness.ts`):

- Mentions `#revenue-summary` + legacy `#sales-summary`
- Names repos/files + Playwright parity
- Calls out out-of-scope + human write-gate
- Notes specialist review
- Rejects big-bang / shared-BFF language

`EVAL_GATE=true` (default) blocks `/implement` until the latest plan eval **passes**.

```bash
npm run trigger   # plan + auto-eval
npm run eval      # re-score latest plan artifact
```

## Setup

```bash
cd liquid-workflow
cp .env.example .env.local
# Set CURSOR_API_KEY from https://cursor.com/dashboard → API Keys
# Leave DRY_RUN=true until the key is set
npm install
```

## Run

```bash
# Terminal A — workflow service
NODE_ENV=development DRY_RUN=true npm start

# Terminal B — simulate Linear "In Progress"
npm run trigger
npm run eval
npm run implement   # only after eval pass + human review
```

Endpoints (loopback):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/models` | Resolved model roster + specialist names |
| GET | `/evals/latest?issue=LIQ-9` | Latest eval report |
| POST | `/evals/rerun` | `{ "runId" }` re-score |
| POST | `/trigger` | Manual demo trigger (LIQ-9 by default) |
| POST | `/implement` | Human write-gate → implement + PR |
| POST | `/webhooks/linear` | Linear webhook receiver |
| GET | `/runs` | In-memory + `runs/*.json` history |
| GET | `/runs/:id` | One run (includes `eval` + `modelRoster`) |

## Live SDK (not dry-run)

1. Put `CURSOR_API_KEY` in `.env.local`
2. Set `DRY_RUN=false`
3. Restart `npm start`
4. `npm run trigger`

Filter Cursor Agents UI → Source → **SDK** to see the run (and nested specialist calls).

## Linear webhook (optional)

1. Linear → Settings → API → Webhooks → URL `https://<tunnel>/webhooks/linear`
2. For local demos, use `npm run trigger` instead of exposing the tunnel.
3. Set `LINEAR_WEBHOOK_SECRET` to verify signatures (unsigned accepted only when secret is empty — loopback demo only).

Trigger filter defaults: state **In Progress**, issue **LIQ-9**.

## Notifications (optional)

- `SLACK_WEBHOOK_URL` — incoming webhook posts the plan/implement brief (PR + preview links when present)
- `LINEAR_API_KEY` — comments the plan onto the issue

## Guardrails

- Binds `127.0.0.1` only
- Refuses to start outside `development` / `test`
- Bounded LIQ-9 prompt — no big-bang reporting merge, no shared BFF
- Plan mode first; eval gate; humans approve before implement/PR; humans merge before prod
- BugBot + CI remain independent PR evidence (not a substitute for the eval rubric)

## Related

- Product apps: `Accounting-core`, `Accounting-reporting`
- Demo PRs: Core https://github.com/gloverthomas/liquid-accounting-core/pull/1 · Reporting https://github.com/gloverthomas/liquid-accounting-reporting/pull/1
- Prod sandboxes: https://liquid-accounting.world · https://reporting.liquid-accounting.world
- Deck + runbook: `accounting-presentation/DEMO-RUNBOOK.md`
- Ticket: [LIQ-9](https://linear.app/liquid-accounting/issue/LIQ-9)
