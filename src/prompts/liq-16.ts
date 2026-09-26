import type { TriggerIssue } from "./liq-9.js";
import { HUMAN_WRITE_GATE, VISUAL_PROOF_GATE } from "../guardrails.js";
import { LIQUID_FEATURE_MAP } from "../feature-map.js";

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

${LIQUID_FEATURE_MAP}

## Bounded scope (LIQ-16 only)
Bug: Core Help centre opens a working dropdown (keyboard shortcuts, support, what's new, docs).
Reporting shows the same Help chrome but the control is dead — click fails, Sentry fires, /signal starts this workflow.

Fix ONLY:
1. Reporting: implement Help menu parity with Core (same items / open-close behaviour).
2. Remove the intentional failure path (error toast + auto-signal) from the happy path once fixed — or gate signal behind demo env.
3. Playwright cross-repo assertion that Help opens in both apps (runtime proof).
4. Do NOT extract a shared package / merge shells / touch BFF.

## Required plan output
Exact files, specialist findings, out-of-scope, feature-map path, CI jobs (\`help-proof\` / \`parity-proof\`), end with "Await approval before implementing."
Stay in plan mode.

${HUMAN_WRITE_GATE}
If the human later says implement / build / approve: still open PRs only — never merge or deploy.`;
}

export function buildLiq16ImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `Implement LIQ-16 via the Cursor SDK.

## Model routing
${rosterBlock}

Spawn security-reviewer + quality-reviewer on the diff before PRs.

${LIQUID_FEATURE_MAP}

## Implement ONLY
1. Reporting Help centre (sidebar + header) opens a menu matching Core (feature-map path).
2. Remove broken-help demo failure from the default click path.
3. Update Playwright parity + proof screenshots.
4. Open **atomic** PRs for this ticket only. No shared package / shell merge / BFF work.

${HUMAN_WRITE_GATE}

${VISUAL_PROOF_GATE}`;
}
