import type { AgentDefinition, ModelSelection } from "@cursor/sdk";
import { resolveRoleModel, type RoleModel } from "./models.js";

export type SpecialistBundle = {
  agents: Record<string, AgentDefinition>;
  roster: RoleModel[];
};

/**
 * Named subagents the parent SDK agent can spawn via the Agent/task tool.
 * Each specialist carries its own model selection (Cost vs Intelligence).
 */
export async function buildSpecialistAgents(): Promise<SpecialistBundle> {
  const [planner, security, quality, implementer] = await Promise.all([
    resolveRoleModel("planner"),
    resolveRoleModel("security"),
    resolveRoleModel("quality"),
    resolveRoleModel("implementer"),
  ]);

  const asSelection = (m: RoleModel): ModelSelection => m.selection;

  const agents: Record<string, AgentDefinition> = {
    "security-reviewer": {
      description:
        "Security specialist for Liquid BFF/demo auth, CORS, deep-link abuse, and secret hygiene across Core + Reporting.",
      prompt: `You are the Liquid security reviewer subagent.

Scope: LIQ-9 deep-link + any adjacent auth/token/CORS risk in the two repos.
Check for:
- Demo tokens or secrets leaking into browser bundles
- Open redirects / untrusted hash → navigation
- CORS allowlist drift between Core and Reporting BFFs
- PII in Sentry/PostHog breadcrumbs for this seam

Output: PASS / FAIL with concrete file:line findings. Do not implement fixes.
Stay read-only.`,
      model: asSelection(security),
    },
    "quality-reviewer": {
      description:
        "Code-quality specialist for LIQ-9: route parity, Playwright assertions, out-of-scope diff risk, and naming consistency.",
      prompt: `You are the Liquid code-quality reviewer subagent.

Scope: LIQ-9 only (#sales-summary → #revenue-summary).
Check for:
- Exact files Core/Reporting must touch (and nothing else)
- Playwright parity assertions that should flip
- Naming consistency (Sales vs Revenue summary)
- Risk of shipping out-of-scope shell/BFF work

Output: PASS / FAIL with a short checklist. Do not implement fixes.
Prefer cheap, thorough scanning over long essays.`,
      model: asSelection(quality),
    },
  };

  return {
    agents,
    roster: [planner, security, quality, implementer],
  };
}
