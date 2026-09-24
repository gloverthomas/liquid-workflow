import type { TriggerIssue } from "./liq-9.js";
import { HUMAN_WRITE_GATE, VISUAL_PROOF_GATE } from "../guardrails.js";

export function isLiq17(issue: TriggerIssue) {
  return issue.identifier.toUpperCase() === "LIQ-17";
}

export function buildLiq17PlanPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `You are the Liquid convergence planner running via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}
- Linear: ${issue.url ?? "(local trigger)"}

## Repos
1. liquid-accounting-core
2. liquid-accounting-reporting

## Model routing
${rosterBlock}

Spawn **security-reviewer** and **quality-reviewer** before finalizing.

## Bounded scope (LIQ-17 only)
Bug: Core header Notifications (bell) opens a working inbox popover.
Reporting shows the same bell but the control is dead — click fails, Sentry fires, /signal opens this curated ticket for triage.

Fix ONLY:
1. Reporting: implement Notifications popover parity with Core (open/close, Escape/outside click, sample items).
2. Remove the intentional failure path (error toast + auto-signal) from the happy path once fixed — or gate signal behind demo env.
3. Playwright assertion that Notifications opens in both apps.
4. Do NOT extract a shared package / merge shells / touch BFF / rebuild Help.

## Required plan output
Exact files, specialist findings, out-of-scope, end with "Await approval before implementing."
Stay in plan mode.

${HUMAN_WRITE_GATE}
If later approved (Linear **In Review**): PRs only — never merge or deploy.`;
}

export function buildLiq17ImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `Implement LIQ-17 via the Cursor SDK.

## Model routing
${rosterBlock}

Spawn security-reviewer + quality-reviewer on the diff before PRs.

## Implement ONLY
1. Reporting Notifications bell opens a popover matching Core behaviour.
2. Remove broken-notifications demo failure from the default click path.
3. Update Playwright parity / proof screenshots under e2e/proof + docs/pr-proof.
4. Open PRs. No shared package / shell merge / BFF / Help regress.

${HUMAN_WRITE_GATE}

${VISUAL_PROOF_GATE}`;
}
