import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { checkApiAccess, checkApproveAccess, routeAccess } from "./access.js";
import { buildSpecialistAgents } from "./agents.js";
import { config } from "./config.js";
import { evaluateRun, latestEvalForIssue, listRecentEvals } from "./eval/harness.js";
import {
  verifyLinearSignature,
  routeLinearWebhook,
  routeLinearCommentApproval,
  type LinearWebhookPayload,
} from "./linear-webhook.js";
import { shouldCloseFromMerge, verifyGitHubSignature, type GitHubPullRequestPayload } from "./github-webhook.js";
import { markIssueDone } from "./linear-done.js";
import { notifyPlanComplete, notifySignalReceived, LINEAR_ISSUE_UUID } from "./notify.js";
import { alertOps } from "./ops-alert.js";
import {
  alreadyProcessed,
  acquireIssueLock,
  deadLetter,
  log,
  markProcessed,
  releaseIssueLock,
} from "./ops.js";
import { accessLog, pruneRetention } from "./retention.js";
import { recordApproval, latestValidApproval } from "./write-gate.js";
import { checkMainCiGreen } from "./github-checks.js";
import { getRun, hydrateRunsFromDisk, listRuns, startImplementRun, startPlanRun, summarizeRun } from "./sdk-planner.js";
import type { TriggerIssue } from "./prompts/liq-9.js";

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  const headers: Record<string, string | number | string[]> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  // Preserve CORS headers set earlier (writeHead replaces the header map).
  for (const key of [
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "vary",
  ]) {
    const value = res.getHeader(key);
    if (value !== undefined) headers[key] = value as string | number | string[];
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function sendHtml(res: ServerResponse, status: number, html: string) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

function sharedPageCss(): string {
  return `
    :root { color-scheme: light; font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f4f1ea; color: #1c1917; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
    nav { display: flex; gap: 14px; margin: 0 0 22px; font-size: 0.9rem; }
    h1 { font-size: 1.6rem; letter-spacing: -0.03em; margin: 0 0 8px; }
    .lede { color: #57534e; margin: 0 0 28px; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 16px 18px; margin: 0 0 14px; }
    .card header { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin-bottom: 6px; }
    .meta { color: #78716c; font-size: 0.85rem; }
    .pass, .fail, .on, .off { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px; }
    .pass, .on { background: #dcfce7; color: #166534; }
    .fail, .off { background: #fee2e2; color: #991b1b; }
    ul { margin: 10px 0 0; padding: 0; list-style: none; }
    li { font-size: 0.92rem; padding: 3px 0; }
    li.ok { color: #166534; }
    li.bad { color: #991b1b; }
    a { color: #9a3412; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
    .empty { padding: 24px; border: 1px dashed #d6d3d1; border-radius: 12px; color: #78716c; }
    .flags { display: grid; gap: 10px; }
    .flag { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f5f5f4; }
    .flag:last-child { border-bottom: 0; }
    .flag span.label { font-size: 0.95rem; }
    .flag span.hint { display: block; color: #78716c; font-size: 0.8rem; margin-top: 2px; }
  `;
}

function healthPayload() {
  return {
    ok: true as const,
    service: "liquid-workflow",
    dryRun: config.dryRun,
    evalGate: config.evalGate,
    ciGate: config.ciGate,
    requireFormalApproval: config.requireFormalApproval,
    workflowEnabled: config.workflowEnabled,
    signalEnabled: config.signalEnabled,
    linearAutoEnabled: config.linearAutoEnabled,
    githubAutoDoneEnabled: config.githubAutoDoneEnabled,
    implementBypassEvalOnLinear: config.implementBypassEvalOnLinear,
    host: config.host,
    port: config.port,
  };
}

function renderStatusPage(): string {
  const h = healthPayload();
  const flag = (on: boolean, label: string, hint: string) =>
    `<div class="flag"><div><span class="label">${escapeHtml(label)}</span><span class="hint">${escapeHtml(hint)}</span></div><span class="${on ? "on" : "off"}">${on ? "ON" : "OFF"}</span></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liquid workflow · status</title>
  <style>${sharedPageCss()}</style>
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
        <span class="meta">${escapeHtml(h.host)}:${h.port}${h.dryRun ? " · dry-run" : ""}</span>
      </header>
      <div class="flags">
        ${flag(h.workflowEnabled, "Workflow", "Master kill switch for signal / Linear / GitHub→Done")}
        ${flag(h.signalEnabled, "Signal", "Product Help→/signal triage")}
        ${flag(h.linearAutoEnabled, "Linear auto", "In Progress → plan, In Review → implement")}
        ${flag(h.githubAutoDoneEnabled, "GitHub → Done", "Merge closes curated Linear issues")}
        ${flag(h.evalGate, "Eval gate", "Implement requires a passing plan eval")}
        ${flag(h.ciGate, "CI gate", "Main branch checks must be green")}
        ${flag(h.requireFormalApproval, "Formal approval", "/approve or Linear /approve before implement")}
        ${flag(h.implementBypassEvalOnLinear, "Linear bypass eval", "In Review implement skips eval (human is the gate)")}
        ${flag(h.dryRun, "Dry run", "No live Cursor SDK agents")}
      </div>
    </article>
    <p class="meta"><a href="/evals">Eval dashboard</a> · <a href="/health"><code>/health</code> JSON</a></p>
  </main>
</body>
</html>`;
}

function renderEvalsDashboard(): string {
  const reports = listRecentEvals(50);
  const rows = reports
    .map((r) => {
      const badge = r.passed
        ? `<span class="pass">PASS</span>`
        : `<span class="fail">FAIL</span>`;
      const checks = (r.checks ?? [])
        .map((c) => `<li class="${c.passed ? "ok" : "bad"}">${c.passed ? "✓" : "✕"} ${escapeHtml(c.description)}</li>`)
        .join("");
      return `<article class="card">
  <header>
    <strong>${escapeHtml(r.issueId)}</strong>
    ${badge}
    <span class="meta">${escapeHtml(r.kind)} · ${escapeHtml(r.checkedAt)}</span>
  </header>
  <p class="meta">eval <code>${escapeHtml(r.evalId)}</code> · run <code>${escapeHtml(r.runId)}</code></p>
  <ul>${checks}</ul>
  <p><a href="/evals/latest?issue=${encodeURIComponent(r.issueId)}&kind=${encodeURIComponent(r.kind)}">JSON</a>
     · <a href="/runs/${encodeURIComponent(r.runId)}">run</a></p>
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Liquid workflow · evals</title>
  <style>${sharedPageCss()}</style>
</head>
<body>
  <main>
    <nav><a href="/status">Status</a><a href="/evals">Evals</a><a href="/health">Health JSON</a></nav>
    <h1>Eval harness</h1>
    <p class="lede">Deterministic plan/implement checks from <code>liquid-workflow/runs</code>. Not pushed to GitHub — linked from Slack/Linear briefs.</p>
    ${rows || `<p class="empty">No eval reports yet. Run a plan (Linear → In Progress) first.</p>`}
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function notFound(res: ServerResponse) {
  sendJson(res, 404, { error: "not_found" });
}

function parseIssue(body: Partial<TriggerIssue>): TriggerIssue {
  const identifier = (body.identifier ?? "LIQ-24").toUpperCase();
  return {
    id: LINEAR_ISSUE_UUID[identifier] ?? body.id ?? "manual",
    identifier,
    title:
      body.title ??
      "[Hero] AI Assistant works in Core but is dead in Reporting",
    url: body.url ?? `https://linear.app/liquid-accounting/issue/${identifier}`,
    stateName: body.stateName ?? "Todo",
  };
}

function cors(res: ServerResponse, origin: string | undefined) {
  const allowed = new Set([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "https://liquid-accounting.world",
    "https://www.liquid-accounting.world",
    "https://reporting.liquid-accounting.world",
  ]);
  const ok =
    Boolean(origin) &&
    (allowed.has(origin!) ||
      origin!.endsWith(".liquid-accounting.world") ||
      origin!.endsWith(".vercel.app"));
  if (ok && origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("vary", "Origin");
  }
}

async function handleImplement(
  issue: TriggerIssue,
  res: ServerResponse,
  options: { bypassEval?: boolean } = {},
) {
  if (!config.workflowEnabled) {
    sendJson(res, 503, { error: "workflow_disabled" });
    return;
  }
  const record = await startImplementRun(issue, options);
  const notifications = await notifyPlanComplete(record);
  if (record.status === "failed" && record.error?.includes("EVAL_GATE")) {
    await alertOps({
      title: `Eval gate blocked implement — ${issue.identifier}`,
      event: "eval_gate_blocked",
      severity: "warning",
      fields: { issue: issue.identifier, error: record.error, runId: record.runId },
    });
  }
  sendJson(res, record.status === "failed" ? 500 : 200, { record, notifications });
}

async function handleTrigger(issue: TriggerIssue, res: ServerResponse) {
  if (!config.workflowEnabled) {
    sendJson(res, 503, { error: "workflow_disabled" });
    return;
  }
  const record = await startPlanRun(issue);
  const notifications = await notifyPlanComplete(record);
  sendJson(res, record.status === "failed" ? 500 : 200, { record, notifications });
}

async function handleSignal(req: IncomingMessage, res: ServerResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  cors(res, origin);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!config.workflowEnabled || !config.signalEnabled) {
    log("warn", "signal_rejected_kill_switch", {
      workflowEnabled: config.workflowEnabled,
      signalEnabled: config.signalEnabled,
    });
    sendJson(res, 503, { error: "workflow_disabled", signalEnabled: config.signalEnabled });
    return;
  }

  const raw = await readBody(req);
  const body = raw.length
    ? (JSON.parse(raw.toString("utf8")) as {
        issueIdentifier?: string;
        title?: string;
        source?: string;
        hash?: string;
        reportingUrl?: string;
        url?: string;
      })
    : {};

  const issue = parseIssue({
    identifier: body.issueIdentifier ?? "LIQ-24",
    title: body.title,
    stateName: "Todo",
  });

  log("info", "signal_received", {
    issue: issue.identifier,
    source: body.source,
    hash: body.hash,
    mode: "triage_only",
  });
  accessLog({
    route: "/signal",
    issue: issue.identifier,
    source: body.source,
    hash: body.hash,
    origin,
  });

  // Triage only — do NOT start the SDK plan. Humans move Linear → In Progress.
  const ackNotifications = await notifySignalReceived({
    issue,
    source: body.source,
    hash: body.hash,
  });
  sendJson(res, 202, {
    accepted: true,
    queued: false,
    triage: true,
    signal: {
      source: body.source,
      hash: body.hash,
      reportingUrl: body.reportingUrl,
    },
    notifications: ackNotifications,
    next: "Move Linear issue to In Progress to start the Cursor SDK plan.",
  });
}

hydrateRunsFromDisk();

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? `${config.host}:${config.port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);

  try {
    // Public tunnel: everything except dashboards, /signal and signed webhooks needs the API token.
    if (routeAccess(req.method ?? "GET", url.pathname) === "api") {
      const decision = checkApiAccess(req.headers.authorization, config);
      if (!decision.ok) {
        accessLog({ route: url.pathname, denied: decision.error });
        sendJson(res, decision.status, { error: decision.error });
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, healthPayload());
      return;
    }

    if (req.method === "GET" && (url.pathname === "/status" || url.pathname === "/")) {
      sendHtml(res, 200, renderStatusPage());
      return;
    }

    if (
      (req.method === "GET" || req.method === "POST") &&
      (url.pathname === "/approve" || url.pathname.startsWith("/approve/"))
    ) {
      const issueFromPath = url.pathname.startsWith("/approve/")
        ? url.pathname.slice("/approve/".length).split("/")[0]
        : "";
      let body: { issue?: string; actor?: string; note?: string; token?: string } = {};
      if (req.method === "POST") {
        const raw = await readBody(req);
        if (raw.length) body = JSON.parse(raw.toString("utf8")) as typeof body;
      }
      const issueId = (
        body.issue ||
        url.searchParams.get("issue") ||
        issueFromPath ||
        ""
      ).toUpperCase();
      const token = body.token || url.searchParams.get("token") || "";
      const approveDecision = checkApproveAccess(req.headers.authorization, token, config);
      if (!approveDecision.ok) {
        sendJson(res, approveDecision.status, { error: approveDecision.error });
        return;
      }
      if (!issueId) {
        sendJson(res, 400, { error: "issue_required" });
        return;
      }
      const actor =
        body.actor ||
        url.searchParams.get("actor") ||
        (typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"]
          : "http");
      const approval = recordApproval({
        issueId,
        actor,
        source: "http",
        note: body.note || url.searchParams.get("note") || undefined,
      });
      accessLog({ route: "/approve", issue: issueId, actor, approvalId: approval.approvalId });
      if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
        sendHtml(
          res,
          200,
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
            <h1>Approved ${issueId}</h1>
            <p>Approval <code>${approval.approvalId}</code> recorded until ${approval.expiresAt}.</p>
            <p>Next: Linear → <strong>In Review</strong> to start implement.</p>
          </body></html>`,
        );
        return;
      }
      sendJson(res, 200, { approved: true, approval });
      return;
    }

    if (req.method === "GET" && url.pathname === "/gates") {
      const issue = (url.searchParams.get("issue") ?? "LIQ-17").toUpperCase();
      const approval = latestValidApproval(issue);
      const ci = config.ciGate ? await checkMainCiGreen() : { ok: true, repos: [] };
      sendJson(res, 200, {
        issue,
        formalApproval: approval ?? null,
        requireFormalApproval: config.requireFormalApproval,
        ciGate: config.ciGate,
        ci,
        planEval: latestEvalForIssue(issue, "plan") ?? null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/models") {
      const specialists = await buildSpecialistAgents();
      sendJson(res, 200, {
        roster: specialists.roster,
        specialists: Object.keys(specialists.agents),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/evals") {
      sendHtml(res, 200, renderEvalsDashboard());
      return;
    }

    if (req.method === "GET" && url.pathname === "/evals/reports") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);
      sendJson(res, 200, { reports: listRecentEvals(limit) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/evals/latest") {
      const issue = (url.searchParams.get("issue") ?? "LIQ-9").toUpperCase();
      const kind = (url.searchParams.get("kind") ?? "plan") as "plan" | "implement";
      const report = latestEvalForIssue(issue, kind);
      if (!report) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { report });
      return;
    }

    if (req.method === "POST" && url.pathname === "/evals/rerun") {
      const raw = await readBody(req);
      const body = raw.length ? (JSON.parse(raw.toString("utf8")) as { runId?: string }) : {};
      if (!body.runId) {
        sendJson(res, 400, { error: "runId_required" });
        return;
      }
      const record = getRun(body.runId);
      if (!record) {
        notFound(res);
        return;
      }
      const report = evaluateRun(record);
      record.eval = report;
      sendJson(res, 200, { report, record });
      return;
    }

    if (req.method === "GET" && url.pathname === "/runs") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
      sendJson(res, 200, { runs: listRuns().slice(0, limit).map(summarizeRun) });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/runs/")) {
      const runId = url.pathname.slice("/runs/".length);
      const record = getRun(runId);
      if (!record) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { record });
      return;
    }

    if (req.method === "POST" && url.pathname === "/trigger") {
      const raw = await readBody(req);
      const body = raw.length ? (JSON.parse(raw.toString("utf8")) as Partial<TriggerIssue>) : {};
      await handleTrigger(parseIssue(body), res);
      return;
    }

    if (
      (req.method === "POST" || req.method === "OPTIONS") &&
      url.pathname === "/signal"
    ) {
      await handleSignal(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/implement") {
      const raw = await readBody(req);
      const body = raw.length
        ? (JSON.parse(raw.toString("utf8")) as Partial<TriggerIssue> & { bypassEval?: boolean })
        : {};
      // Never let a caller skip the eval gate over HTTP (the Linear webhook path has its own env switch).
      await handleImplement(parseIssue(body), res, { bypassEval: false });
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhooks/linear") {
      if (!config.workflowEnabled || !config.linearAutoEnabled) {
        log("warn", "linear_webhook_rejected_kill_switch");
        sendJson(res, 503, { error: "workflow_disabled" });
        return;
      }

      const rawBuffer = await readBody(req);
      const raw = rawBuffer.toString("utf8");
      const signature = req.headers["linear-signature"];
      const signatureValue = Array.isArray(signature) ? signature[0] : signature;
      if (!verifyLinearSignature(raw, signatureValue)) {
        sendJson(res, 401, { error: "invalid_signature" });
        return;
      }

      const deliveryHeader = req.headers["linear-delivery"];
      const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader;
      if (alreadyProcessed(deliveryId)) {
        log("info", "linear_webhook_duplicate", { deliveryId });
        sendJson(res, 200, { duplicate: true, deliveryId });
        return;
      }

      const payload = JSON.parse(raw) as LinearWebhookPayload;

      const commentApproval = routeLinearCommentApproval(payload);
      if (commentApproval) {
        markProcessed(deliveryId, `approve:${commentApproval.approvalId}`);
        accessLog({
          route: "/webhooks/linear",
          kind: "comment_approve",
          issue: commentApproval.issueId,
          approvalId: commentApproval.approvalId,
          actor: commentApproval.actor,
        });
        sendJson(res, 200, {
          approved: true,
          issue: commentApproval.issueId,
          approvalId: commentApproval.approvalId,
        });
        return;
      }

      const routed = routeLinearWebhook(payload);
      if (!routed) {
        markProcessed(deliveryId, "ignored");
        sendJson(res, 200, { ignored: true });
        return;
      }

      accessLog({
        route: "/webhooks/linear",
        action: routed.action,
        issue: routed.issue.identifier,
        deliveryId,
      });

      const lockKey = `${routed.action}:${routed.issue.identifier}`;
      if (!acquireIssueLock(lockKey, deliveryId)) {
        log("warn", "linear_webhook_inflight", { lockKey, deliveryId });
        sendJson(res, 200, { skipped: true, reason: "inflight", issue: routed.issue.identifier });
        return;
      }

      if (routed.action === "plan") {
        sendJson(res, 202, { accepted: true, action: "plan", issue: routed.issue.identifier, deliveryId });
        void (async () => {
          try {
            const record = await startPlanRun(routed.issue);
            await notifyPlanComplete(record);
            markProcessed(deliveryId, `plan:${record.status}:${record.runId}`);
            if (record.status === "failed") {
              await alertOps({
                title: `Plan failed — ${routed.issue.identifier}`,
                event: "linear_plan_failed",
                fields: {
                  issue: routed.issue.identifier,
                  runId: record.runId,
                  error: record.error?.slice(0, 240),
                },
              });
              deadLetter({ kind: "plan", issue: routed.issue.identifier, runId: record.runId, error: record.error });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            deadLetter({ kind: "plan", issue: routed.issue.identifier, deliveryId, error: message });
            await alertOps({
              title: `Plan crashed — ${routed.issue.identifier}`,
              event: "linear_plan_crashed",
              fields: { issue: routed.issue.identifier, deliveryId, error: message },
            });
          } finally {
            releaseIssueLock(lockKey);
          }
        })();
        return;
      }

      sendJson(res, 202, {
        accepted: true,
        action: "implement",
        issue: routed.issue.identifier,
        deliveryId,
      });
      void (async () => {
        try {
          const record = await startImplementRun(routed.issue, {
            bypassEval: config.implementBypassEvalOnLinear,
          });
          await notifyPlanComplete(record);
          markProcessed(deliveryId, `implement:${record.status}:${record.runId}`);
          if (record.status === "failed") {
            await alertOps({
              title: `Implement failed — ${routed.issue.identifier}`,
              event: "linear_implement_failed",
              fields: {
                issue: routed.issue.identifier,
                runId: record.runId,
                error: record.error?.slice(0, 240),
                evalGate: config.evalGate,
                bypassEval: config.implementBypassEvalOnLinear,
              },
            });
            deadLetter({
              kind: "implement",
              issue: routed.issue.identifier,
              runId: record.runId,
              error: record.error,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          deadLetter({ kind: "implement", issue: routed.issue.identifier, deliveryId, error: message });
          await alertOps({
            title: `Implement crashed — ${routed.issue.identifier}`,
            event: "linear_implement_crashed",
            fields: { issue: routed.issue.identifier, deliveryId, error: message },
          });
        } finally {
          releaseIssueLock(lockKey);
        }
      })();
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhooks/github") {
      if (!config.workflowEnabled || !config.githubAutoDoneEnabled) {
        log("warn", "github_webhook_rejected_kill_switch");
        sendJson(res, 503, { error: "workflow_disabled" });
        return;
      }

      const rawBuffer = await readBody(req);
      const raw = rawBuffer.toString("utf8");
      const signature = req.headers["x-hub-signature-256"];
      const signatureValue = Array.isArray(signature) ? signature[0] : signature;
      if (!verifyGitHubSignature(raw, signatureValue)) {
        sendJson(res, 401, { error: "invalid_signature" });
        return;
      }

      const deliveryHeader = req.headers["x-github-delivery"];
      const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader;
      if (alreadyProcessed(deliveryId)) {
        log("info", "github_webhook_duplicate", { deliveryId });
        sendJson(res, 200, { duplicate: true, deliveryId });
        return;
      }

      const event = req.headers["x-github-event"];
      const eventName = Array.isArray(event) ? event[0] : event;
      if (eventName !== "pull_request") {
        markProcessed(deliveryId, "ignored:not_pull_request");
        sendJson(res, 200, { ignored: true, reason: "not_pull_request" });
        return;
      }

      const payload = JSON.parse(raw) as GitHubPullRequestPayload;
      const close = shouldCloseFromMerge(payload);
      if (!close) {
        markProcessed(deliveryId, "ignored");
        sendJson(res, 200, { ignored: true });
        return;
      }

      const lockKey = `done:${close.identifier}`;
      if (!acquireIssueLock(lockKey, deliveryId)) {
        sendJson(res, 200, { skipped: true, reason: "inflight", issue: close.identifier });
        return;
      }

      try {
        const result = await markIssueDone(close);
        markProcessed(deliveryId, `done:${close.identifier}`);
        sendJson(res, 200, { closed: true, deliveryId, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deadLetter({ kind: "github_done", issue: close.identifier, deliveryId, error: message });
        await alertOps({
          title: `Merge→Done failed — ${close.identifier}`,
          event: "github_done_failed",
          fields: { issue: close.identifier, deliveryId, error: message, pr: close.prUrl },
        });
        sendJson(res, 500, { error: "done_failed", message });
      } finally {
        releaseIssueLock(lockKey);
      }
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

if (!["development", "test"].includes(process.env.NODE_ENV ?? "development")) {
  throw new Error("liquid-workflow refuses to start outside development/test (demo boundary).");
}

server.listen(config.port, config.host, () => {
  pruneRetention();
  log("info", "server_started", {
    host: config.host,
    port: config.port,
    dryRun: config.dryRun,
    workflowEnabled: config.workflowEnabled,
    evalGate: config.evalGate,
    ciGate: config.ciGate,
    requireFormalApproval: config.requireFormalApproval,
  });
});
