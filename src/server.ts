import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildSpecialistAgents } from "./agents.js";
import { config } from "./config.js";
import { evaluateRun, latestEvalForIssue } from "./eval/harness.js";
import { shouldTriggerFromWebhook, verifyLinearSignature, type LinearWebhookPayload } from "./linear-webhook.js";
import { notifyPlanComplete, notifySignalReceived, LINEAR_ISSUE_UUID } from "./notify.js";
import { getRun, listRuns, startImplementRun, startPlanRun } from "./sdk-planner.js";
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

function notFound(res: ServerResponse) {
  sendJson(res, 404, { error: "not_found" });
}

function parseIssue(body: Partial<TriggerIssue>): TriggerIssue {
  const identifier = (body.identifier ?? "LIQ-16").toUpperCase();
  return {
    id: LINEAR_ISSUE_UUID[identifier] ?? body.id ?? "manual",
    identifier,
    title:
      body.title ??
      "[Hero] Help centre works in Core but is dead in Reporting",
    url: body.url ?? `https://linear.app/liquid-accounting/issue/${identifier}`,
    stateName: body.stateName ?? "In Progress",
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

async function handleTrigger(issue: TriggerIssue, res: ServerResponse) {
  const record = await startPlanRun(issue);
  const notifications = await notifyPlanComplete(record);
  sendJson(res, record.status === "failed" ? 500 : 200, { record, notifications });
}

async function handleImplement(issue: TriggerIssue, res: ServerResponse) {
  const record = await startImplementRun(issue);
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
    identifier: body.issueIdentifier ?? "LIQ-16",
    title: body.title,
    stateName: "In Progress",
  });

  console.log(
    JSON.stringify({
      event: "signal_received",
      issue: issue.identifier,
      source: body.source,
      hash: body.hash,
    }),
  );

  // Ack fast so the browser does not time out waiting on a cloud agent.
  const ackNotifications = await notifySignalReceived({
    issue,
    source: body.source,
    hash: body.hash,
  });
  sendJson(res, 202, {
    accepted: true,
    queued: true,
    signal: {
      source: body.source,
      hash: body.hash,
      reportingUrl: body.reportingUrl,
    },
    notifications: ackNotifications,
  });

  void (async () => {
    try {
      const record = await startPlanRun(issue);
      await notifyPlanComplete(record);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "signal_plan_failed",
          issue: issue.identifier,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  })();
}

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? `${config.host}:${config.port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "liquid-workflow",
        dryRun: config.dryRun,
        evalGate: config.evalGate,
        host: config.host,
        port: config.port,
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
      sendJson(res, 200, { runs: listRuns() });
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
      const body = raw.length ? (JSON.parse(raw.toString("utf8")) as Partial<TriggerIssue>) : {};
      await handleImplement(parseIssue(body), res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhooks/linear") {
      const rawBuffer = await readBody(req);
      const raw = rawBuffer.toString("utf8");
      const signature = req.headers["linear-signature"];
      const signatureValue = Array.isArray(signature) ? signature[0] : signature;
      if (!verifyLinearSignature(raw, signatureValue)) {
        sendJson(res, 401, { error: "invalid_signature" });
        return;
      }

      const payload = JSON.parse(raw) as LinearWebhookPayload;
      const issue = shouldTriggerFromWebhook(payload);
      if (!issue) {
        sendJson(res, 200, { ignored: true });
        return;
      }

      // Respond quickly then continue? For demo we await so the caller sees the plan.
      await handleTrigger(issue, res);
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
  console.log(
    JSON.stringify({
      event: "server_started",
      service: "liquid-workflow",
      host: config.host,
      port: config.port,
      dryRun: config.dryRun,
    }),
  );
});
