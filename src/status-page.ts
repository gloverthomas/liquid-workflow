/**
 * Public /status markup.
 *
 * `dryRun` is a real non-executing mode: the planner skips Agent.create and
 * returns a synthetic plan. The page names the positive gate (Cursor agents)
 * so ON means the service will launch live SDK agents.
 */

export type StatusHealth = {
  service: string;
  dryRun: boolean;
  evalGate: boolean;
  ciGate: boolean;
  requireFormalApproval: boolean;
  workflowEnabled: boolean;
  signalEnabled: boolean;
  linearAutoEnabled: boolean;
  githubAutoDoneEnabled: boolean;
  githubAutoInReviewEnabled: boolean;
  implementBypassEvalOnLinear: boolean;
  host: string;
  port: number;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Presenter copy for the agent-execution gate. */
export function cursorAgentsGate(dryRun: boolean): { on: boolean; label: string; hint: string; hostNote: string } {
  if (dryRun) {
    return {
      on: false,
      label: "Cursor agents",
      hint: "SDK agents are not executing",
      hostNote: " · not executing",
    };
  }
  return {
    on: true,
    label: "Cursor agents",
    hint: "Ready to launch live Cursor SDK agents",
    hostNote: "",
  };
}

export function renderStatusPage(h: StatusHealth, pageCss: string): string {
  const agents = cursorAgentsGate(h.dryRun);
  const flag = (on: boolean, label: string, hint: string) =>
    `<div class="flag"><div><span class="label">${escapeHtml(label)}</span><span class="hint">${escapeHtml(hint)}</span></div><span class="${on ? "on" : "off"}">${on ? "ON" : "OFF"}</span></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liquid workflow · status</title>
  <style>${pageCss}</style>
</head>
<body>
  <main>
    <nav><a href="/status">Status</a><a href="/evals">Evals</a><a href="/health">Health JSON</a></nav>
    <h1>Workflow status</h1>
    <p class="lede">Live kill switches and gates for <code>liquid-workflow</code>. Linked from Linear/Slack briefs.</p>
    <article class="card">
      <header>
        <strong>${escapeHtml(h.service)}</strong>
        <span class="pass">UP</span>
        <span class="meta">${escapeHtml(h.host)}:${h.port}${agents.hostNote}</span>
      </header>
      <div class="flags">
        ${flag(h.workflowEnabled, "Workflow", "Master kill switch for signal / Linear / GitHub→Done")}
        ${flag(h.signalEnabled, "Signal", "Product Help→/signal triage")}
        ${flag(h.linearAutoEnabled, "Linear auto", "In Progress → plan, In Review → implement")}
        ${flag(h.githubAutoInReviewEnabled, "GitHub → In Review", "PR opened syncs Linear In Review")}
        ${flag(h.githubAutoDoneEnabled, "GitHub → Done", "Merge closes curated Linear issues")}
        ${flag(h.evalGate, "Eval gate", "Implement requires a passing plan eval")}
        ${flag(h.ciGate, "CI gate", "Main branch checks must be green")}
        ${flag(h.requireFormalApproval, "Formal approval", "/approve or Linear /approve before implement")}
        ${flag(h.implementBypassEvalOnLinear, "Linear bypass eval", "In Review implement skips eval (human is the gate)")}
        ${flag(agents.on, agents.label, agents.hint)}
      </div>
    </article>
    <p class="meta"><a href="/evals">Eval dashboard</a> · <a href="/health"><code>/health</code> JSON</a></p>
  </main>
</body>
</html>`;
}
