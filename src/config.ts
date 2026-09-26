import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(fileName: string) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Prefer .env.local over empty inherited env (common when shells export blank keys).
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

function requiredInProd(name: string, dryRun: boolean): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value && !dryRun && name === "CURSOR_API_KEY") {
    throw new Error(`${name} must be set unless DRY_RUN=true`);
  }
  return value;
}

const explicitDryRun = process.env.DRY_RUN?.trim().toLowerCase();
const cursorApiKey = process.env.CURSOR_API_KEY?.trim() ?? "";
const dryRun =
  explicitDryRun === "true" ||
  (explicitDryRun !== "false" && cursorApiKey.length === 0);

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.PORT ?? "4100", 10),
  dryRun,
  cursorApiKey: requiredInProd("CURSOR_API_KEY", dryRun) || cursorApiKey,
  /** Fallback model when Cursor Router (auto-smart) is unavailable. */
  cursorModel: process.env.CURSOR_MODEL?.trim() || "composer-2.5",
  /** When true, /implement refuses unless the latest plan eval passed. */
  evalGate: (process.env.EVAL_GATE ?? "true").trim().toLowerCase() !== "false",
  coreRepoUrl:
    process.env.CORE_REPO_URL?.trim() ||
    "https://github.com/gloverthomas/liquid-accounting-core",
  reportingRepoUrl:
    process.env.REPORTING_REPO_URL?.trim() ||
    "https://github.com/gloverthomas/liquid-accounting-reporting",
  repoStartingRef: process.env.REPO_STARTING_REF?.trim() || "main",
  linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET?.trim() || "",
  linearApiKey: process.env.LINEAR_API_KEY?.trim() || "",
  /** When set, signal/plan notify assigns the curated Linear issue to this user id. */
  linearAssigneeId: process.env.LINEAR_ASSIGNEE_ID?.trim() || "",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL?.trim() || "",
  /** Slack user id for <@U…> mentions on briefs (optional). */
  slackMentionUserId: process.env.SLACK_MENTION_USER_ID?.trim() || "",
  /** Optional fixed Done state id; otherwise resolved from the issue's team. */
  linearDoneStateId: process.env.LINEAR_DONE_STATE_ID?.trim() || "",
  /** GitHub webhook HMAC secret for /webhooks/github (optional in demo). */
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim() || "",
  /** Repos whose merges may close curated Linear hero tickets. */
  githubMergeRepos: (
    process.env.GITHUB_MERGE_REPOS ??
    "gloverthomas/liquid-accounting-core,gloverthomas/liquid-accounting-reporting"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Public base URL for the demo tunnel (used in Slack/Linear eval links). */
  publicTunnelUrl: (process.env.PUBLIC_TUNNEL_URL ?? "").trim().replace(/\/$/, ""),
  /**
   * Master kill switch. When false: /signal, Linear plan/implement, and GitHub→Done
   * are rejected (503). /health stays up for probes.
   */
  workflowEnabled: (process.env.WORKFLOW_ENABLED ?? "true").trim().toLowerCase() !== "false",
  /** When false, product /signal triage is disabled (Linear/GitHub may still run). */
  signalEnabled: (process.env.SIGNAL_ENABLED ?? "true").trim().toLowerCase() !== "false",
  /** When false, Linear In Progress/In Review auto plan/implement is disabled. */
  linearAutoEnabled: (process.env.LINEAR_AUTO_ENABLED ?? "true").trim().toLowerCase() !== "false",
  /** When false, GitHub merge → Linear Done is disabled. */
  githubAutoDoneEnabled:
    (process.env.GITHUB_AUTO_DONE_ENABLED ?? "true").trim().toLowerCase() !== "false",
  triggerStates: (process.env.TRIGGER_STATES ?? "In Progress")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Linear states that mean "human approved plan → implement/PR". */
  implementStates: (process.env.IMPLEMENT_STATES ?? "In Review")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  triggerIssueIds: (process.env.TRIGGER_ISSUE_IDS ?? "LIQ-24,LIQ-17,LIQ-16,LIQ-15,LIQ-9")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  /**
   * When true, Linear In Review → implement bypasses eval gate.
   * Production default is false (plan eval must pass). Demo may set true.
   */
  implementBypassEvalOnLinear: (process.env.IMPLEMENT_BYPASS_EVAL_ON_LINEAR ?? "false")
    .trim()
    .toLowerCase() === "true",
  /**
   * Require formal /approve (HTTP, Slack button, or Linear comment) before implement.
   * Demo may set false to keep status-drag-only UX.
   */
  requireFormalApproval: (process.env.REQUIRE_FORMAL_APPROVAL ?? "true")
    .trim()
    .toLowerCase() !== "false",
  /** Shared secret for GET/POST /approve (optional; empty = open on loopback demo). */
  approveToken: process.env.APPROVE_TOKEN?.trim() || "",
  /** Bearer token for every non-public route (see src/access.ts). ≥24 chars; empty = those routes fail closed. */
  apiToken: (process.env.WORKFLOW_API_TOKEN?.trim().length ?? 0) >= 24 ? process.env.WORKFLOW_API_TOKEN!.trim() : "",
  /** When true, implement also requires latest CI workflow on main to be green. */
  ciGate: (process.env.CI_GATE ?? "true").trim().toLowerCase() !== "false",
  /** When true, missing GITHUB_TOKEN fails the CI gate instead of soft-skip. */
  ciGateStrict: (process.env.CI_GATE_STRICT ?? "false").trim().toLowerCase() === "true",
};

if (!["development", "test", undefined].includes(process.env.NODE_ENV) && config.host !== "127.0.0.1") {
  throw new Error("liquid-workflow refuses non-loopback HOST outside development/test.");
}
