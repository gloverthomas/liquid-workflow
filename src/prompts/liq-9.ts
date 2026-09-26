import { HUMAN_WRITE_GATE, visualProofGate } from "../guardrails.js";
import { LIQUID_FEATURE_MAP } from "../feature-map.js";

export type TriggerIssue = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url?: string;
  stateName: string;
};

export function buildPlanPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `You are the Liquid convergence planner running via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}
- Linear: ${issue.url ?? "(local trigger)"}

## Repos in this cloud sandbox
1. liquid-accounting-core (canonical product shell)
2. liquid-accounting-reporting (duplicated reporting shell)

## Model routing (Liquid policy)
Use the right capability for the job. You have named subagents — spawn them:
${rosterBlock}

Required specialist passes before you finalize the plan:
1. Spawn **security-reviewer** (Intelligence / high capability) on the LIQ-9 seam + BFF/auth/deep-link abuse surface.
2. Spawn **quality-reviewer** (Cost-effective) for route parity, Playwright flips, and out-of-scope diff risk.
Incorporate both PASS/FAIL findings into your plan. Do not skip them.

${LIQUID_FEATURE_MAP}

## Bounded scope (do not expand)
Fix ONLY the LIQ-9 deep-link miss:
- Reporting renamed Sales summary → Revenue summary (#revenue-summary).
- Core still deep-links to #sales-summary from Reports nav and the dashboard task.
- Reporting already shows an alert for the legacy hash.

## Required plan output
Produce a reviewable plan (not a big-bang merge) that:
1. Classifies shared shell vs report-only code for this seam.
2. Lists exact files to change in Core (and whether Reporting needs any change).
3. Names Playwright assertions in liquid-accounting-core/e2e/cross-repo-parity.spec.ts that should flip.
4. Calls out out-of-scope work (status pills, full shell extraction, shared BFF) that must NOT ship in this PR.
5. Summarizes security-reviewer and quality-reviewer findings (PASS/FAIL).
6. Names CI jobs that must pass (\`parity-proof\` / \`smoke\` / \`build\`).
7. Ends with a clear human write-gate: "Await approval before implementing."

Do not invent a shared BFF. Do not migrate all reporting into Core in this run.
Stay in plan mode — investigate and plan only. Prefer runtime/feature-map paths over code-only guesses.

${HUMAN_WRITE_GATE}
If later approved to implement: PRs only — never merge or deploy.`;
}

export function buildImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `You are implementing a bounded Liquid convergence fix via the Cursor SDK.

## Ticket
- ${issue.identifier}: ${issue.title}
- Linear: ${issue.url ?? "(local trigger)"}

## Repos
1. liquid-accounting-core
2. liquid-accounting-reporting

## Model routing
${rosterBlock}

Before opening PRs, spawn **security-reviewer** and **quality-reviewer** on the diff. If either FAILs on a blocking finding, stop and report — do not open PRs.

## Implement ONLY LIQ-9
1. In Core: change Reports deep-links from #sales-summary to #revenue-summary (nav + dashboard task).
2. In Reporting: treat legacy #sales-summary as an alias that rewrites to #revenue-summary and opens Revenue summary (no stale alert for that hash).
3. Update liquid-accounting-core/e2e/cross-repo-parity.spec.ts accordingly.
4. Open PRs (autoCreatePR is enabled). Include PR URLs and any Vercel preview URLs in your final message.
5. Do NOT expand into shell extraction, status pills, or a shared BFF.

${HUMAN_WRITE_GATE}

${visualProofGate(issue.identifier)}`;
}
