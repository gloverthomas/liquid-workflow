import type { TriggerIssue } from "./liq-9.js";

export function isLiq15(issue: TriggerIssue) {
  return issue.identifier.toUpperCase() === "LIQ-15";
}

export function buildLiq15PlanPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `You are the Liquid convergence planner running via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}
- Linear: ${issue.url ?? "(local trigger)"}

## Repos in this cloud sandbox
1. liquid-accounting-core
2. liquid-accounting-reporting

## Model routing
${rosterBlock}

Required specialist passes before you finalize the plan:
1. Spawn **security-reviewer** on the Create Invoice → Reporting deep-link + signal bridge.
2. Spawn **quality-reviewer** for Playwright parity and out-of-scope risk.
Incorporate both PASS/FAIL findings.

## Bounded scope (LIQ-15 only)
Bug: Core Create Invoice ("Create & view report") and Reports nav deep-link to Reporting \`#invoice-performance\`, which does not exist. Reporting shows a deep-link miss alert; Sentry/PostHog fire; Core POSTs to liquid-workflow \`/signal\`.

Fix ONLY:
1. Core: retarget Create Invoice continue + Reports nav (+ dashboard task) to a real report — \`#revenue-summary\` (Revenue summary).
2. Reporting: keep miss handling for unknown hashes; optional clearer recovery is fine; do NOT invent a full Invoice performance report product.
3. Update Playwright parity assertions if present.
4. Leave the demo signal bridge in place (or gate it behind env) — do not remove observability.

## Required plan output
1. Exact files to change.
2. Playwright / parity notes.
3. Out-of-scope (shared BFF, shell merge, new Invoice performance report product).
4. Security + quality specialist findings.
5. End with: "Await approval before implementing."

Stay in plan mode.`;
}

export function buildLiq15ImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `You are implementing LIQ-15 via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}

## Model routing
${rosterBlock}

Spawn **security-reviewer** and **quality-reviewer** on the diff before opening PRs. Stop if either FAILs blocking.

## Implement ONLY
1. Core: change \`#invoice-performance\` deep-links (Reports nav, dashboard task, Create Invoice continue target) to \`#revenue-summary\`.
2. Reporting: no new report catalogue entry required; miss banner for unknown hashes may remain.
3. Update e2e parity if needed.
4. Open PRs (autoCreatePR). Do NOT merge. Do NOT build a shared BFF or Invoice performance product.

Human merges.`;
}
