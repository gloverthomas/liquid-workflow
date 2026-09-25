# Write policy (agents vs humans)

Liquid workflow agents may **open pull requests** and comment on Linear/Slack.
They must **never** merge to `main`, push production deploys, or bypass required checks.

## Encoded controls

| Control | Where | Intent |
| --- | --- | --- |
| Implement prompts | `src/prompts/*`, `src/guardrails.ts` | PR only; no merge/deploy language |
| Eval gate | `EVAL_GATE=true` | Plan rubric must pass before implement |
| Linear bypass | `IMPLEMENT_BYPASS_EVAL_ON_LINEAR` | **Off in production**; demo may enable |
| Kill switches | `WORKFLOW_ENABLED`, `SIGNAL_ENABLED`, `LINEAR_AUTO_ENABLED`, `GITHUB_AUTO_DONE_ENABLED` | Instant pause without tearing down DNS |
| Idempotency | `runs/ops/webhook-deliveries.json` + issue locks | Webhook retries do not double-plan |
| Dead letter | `runs/ops/dead-letter.jsonl` | Failed plan/implement/done for replay/audit |
| Branch protection | GitHub `main` (public repos) | Required CI contexts; no force-push; linear history; enforce_admins. Core: `build`/`assistant-unit`/`smoke`/`parity-proof`. Reporting: `build`/`assistant-unit`/`help-proof`. |

## Human path

1. `/signal` → triage (Todo) only  
2. Human → **In Progress** → plan + eval  
3. Human reviews plan → **In Review** → implement/PRs (eval required when bypass=false)  
4. Human merges after BugBot/CI/preview  
5. GitHub webhook → Linear **Done**

## Poteto / pstack practices we encode (no auto-merge)

- **Feature map** (`src/feature-map.ts`) — agents must drive real UI paths (bell / Help / hashes).
- **Runtime proof** — Playwright + \`docs/pr-proof\` screenshots; CI jobs named in plans/PRs.
- **Atomic PRs** — one LIQ-* hero per PR pair.
- **Hard CI on \`main\`** — branch protection requires status checks; implement also checks CI green via \`CI_GATE\`.
- **Formal write-gate** — Slack **Approve implement** / Linear \`/approve\` / \`POST /approve\` before In Review implement (\`REQUIRE_FORMAL_APPROVAL\`).
- **PII scrub + retention** — outbound briefs scrubbed; \`runs/\` + access logs pruned (\`RUN_RETENTION_DAYS\`).
- **pstack** (Cursor plugin) — use \`/poteto-mode\` / \`/setup-pstack\` for rigorous *human* review sessions; webhook autopilot still follows this write policy (humans merge).

## Panic

```bash
# In .env.local (or platform env), then restart liquid-workflow:
WORKFLOW_ENABLED=false
# or finer:
SIGNAL_ENABLED=false
LINEAR_AUTO_ENABLED=false
GITHUB_AUTO_DONE_ENABLED=false
```
