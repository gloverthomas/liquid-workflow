import { HUMAN_WRITE_GATE, visualProofGate } from "../guardrails.js";
import { LIQUID_FEATURE_MAP } from "../feature-map.js";
import type { TriggerIssue } from "./liq-9.js";

export function buildDynamicPlanPrompt(issue: TriggerIssue, rosterBlock: string): string {
  const description = issue.description?.trim() || "(No Linear description — use the title and investigate the product seam.)";
  return `You are the Liquid convergence planner running via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}
- Linear: ${issue.url ?? "(local trigger)"}

## Linear description (source of truth for scope)
${description}

## Repos in this cloud sandbox
1. liquid-accounting-core (canonical product shell)
2. liquid-accounting-reporting (duplicated reporting shell)

## Model routing (Liquid policy)
${rosterBlock}

Required specialist passes before you finalize the plan:
1. Spawn **security-reviewer** on auth/CORS/deep-link and BFF abuse surface for this seam.
2. Spawn **quality-reviewer** for runtime parity, Playwright, and out-of-scope diff risk.
Incorporate both PASS/FAIL findings. Do not skip them.

${LIQUID_FEATURE_MAP}

## Bounded scope
Fix ONLY what ${issue.identifier} describes. Do not reuse the LIQ-9 #sales-summary / #revenue-summary playbook unless this ticket explicitly mentions those hashes.

## Required plan output
1. Restate ${issue.identifier} and key phrases from the ticket title in your plan.
2. Classify shared shell vs report-only code for this seam.
3. List exact files to change in Core and/or Reporting.
4. Name Playwright / Vitest proof that should flip for this ticket.
5. Call out out-of-scope work that must NOT ship in this PR.
6. Summarize security-reviewer and quality-reviewer findings.
7. Names CI jobs that must pass before merge.
8. End with: "Await approval before implementing."

Stay in plan mode — investigate and plan only. Prefer runtime/feature-map paths over code-only guesses.

${HUMAN_WRITE_GATE}`;
}

export function buildDynamicImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  const description = issue.description?.trim() || "(See Linear title — implement the described product seam only.)";
  return `You are implementing a bounded Liquid fix via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}
- Linear: ${issue.url ?? "(local trigger)"}

## Linear description
${description}

## Repos
1. liquid-accounting-core
2. liquid-accounting-reporting

## Model routing
${rosterBlock}

Before opening PRs, spawn **security-reviewer** and **quality-reviewer** on the diff. If either FAILs on a blocking finding, stop and report — do not open PRs.

## Implement ONLY ${issue.identifier}
1. Implement the fix described in the Linear ticket — not the LIQ-9 sales/revenue hash migration unless this ticket requires it.
2. Open PRs (autoCreatePR is enabled). Reference ${issue.identifier} in titles.
3. Include PR URLs and Vercel preview URLs in your final message.
4. Keep PRs atomic: one ticket per PR pair; no drive-by refactors.

${HUMAN_WRITE_GATE}

${visualProofGate(issue.identifier)}`;
}
