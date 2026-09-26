import type { TriggerIssue } from "./liq-9.js";
import { HUMAN_WRITE_GATE, visualProofGate } from "../guardrails.js";
import { LIQUID_FEATURE_MAP } from "../feature-map.js";

export function isLiq24(issue: TriggerIssue) {
  return issue.identifier.toUpperCase() === "LIQ-24";
}

export function buildLiq24PlanPrompt(issue: TriggerIssue, rosterBlock: string): string {
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

## Bounded scope (LIQ-24 only)
Bug: Core topbar **AI Assistant** opens a right-rail chat that answers via \`POST /api/v1/assistant/chat\` (Grok/xAI when keyed, else fixture).
Reporting shows the same skills-ported rail (welcome chips, composer) but send fails — the BFF chat route was never wired while the team shipped AI UI fast.

Fix ONLY:
1. Reporting: wire assistant chat so suggested prompts / send complete like Core (fixture or Grok — match Core contract).
2. Remove or gate the intentional broken path + /signal once fixed.
3. Keep Vitest+RTL \`assistant-unit\` green in both apps (welcome, send/reply, accordion, related questions, broken BFF miss).
4. Playwright assertion that AI Assistant can complete a suggestion in both apps.
5. Do NOT extract a shared package / merge shells / rebuild Help or Notifications in this ticket.

## Required plan output
Exact files, specialist findings, out-of-scope, feature-map path used for verification, CI jobs that must pass (\`assistant-unit\` + proof jobs), end with "Await approval before implementing."
Stay in plan mode.

${HUMAN_WRITE_GATE}
If later approved (Linear **In Review**): PRs only — never merge or deploy.`;
}

export function buildLiq24ImplementPrompt(issue: TriggerIssue, rosterBlock: string): string {
  return `Implement LIQ-24 via the Cursor SDK.

## Model routing
${rosterBlock}

Spawn security-reviewer + quality-reviewer on the diff before PRs.

${LIQUID_FEATURE_MAP}

## Implement ONLY
1. Reporting AI Assistant can send a suggestion and receive a reply (drive the feature-map path).
2. Remove broken-assistant demo failure from the default send path (or env-gate it).
3. Keep \`npm run test:unit\` / CI job \`assistant-unit\` green for AiAssistant in both apps.
4. Update Playwright parity / proof screenshots under e2e/proof + docs/pr-proof.
5. Open **atomic** PRs for this ticket only. No shared package / shell merge / Help/Notifications drive-by.
6. PR body must name CI jobs touched (\`build\` / \`assistant-unit\` / proof jobs).

${HUMAN_WRITE_GATE}

${visualProofGate(issue.identifier)}`;
}
