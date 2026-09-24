import type { TriggerIssue } from "./liq-9.js";

export function isLiq16(issue: TriggerIssue) {
  return issue.identifier.toUpperCase() === "LIQ-16";
}

export function buildLiq16PlanPrompt(issue: TriggerIssue, rosterBlock: string): string {
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

## Bounded scope (LIQ-16 only)
Bug: Core Help centre opens a working dropdown (keyboard shortcuts, support, what's new, docs).
Reporting shows the same Help chrome but the control is dead — click fails, Sentry fires, /signal starts this workflow.

Fix ONLY:
1. Reporting: implement Help menu parity with Core (same items / open-close behaviour).
2. Remove the intentional failure path (error toast + auto-signal) from the happy path once fixed — or gate signal behind demo env.
3. Playwright cross-repo assertion that Help opens in both apps.
4. Do NOT extract a shared package / merge shells / touch BFF.

## Required plan output
Exact files, specialist findings, out-of-scope, end with "Await approval before implementing."
Stay in plan mode.`;
}

export function buildLiq16ImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `Implement LIQ-16 via the Cursor SDK.

## Model routing
${rosterBlock}

Spawn security-reviewer + quality-reviewer on the diff before PRs.

## Implement ONLY
1. Reporting Help centre (sidebar + header) opens a menu matching Core.
2. Remove broken-help demo failure from the default click path.
3. Update Playwright parity if present.
4. Open PRs. Do NOT merge. No shared package / shell merge / BFF work.

Human merges.`;
}
