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
    if (process.env[key] === undefined) {
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
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL?.trim() || "",
  triggerStates: (process.env.TRIGGER_STATES ?? "In Progress")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  triggerIssueIds: (process.env.TRIGGER_ISSUE_IDS ?? "LIQ-16,LIQ-15,LIQ-9")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
};

if (!["development", "test", undefined].includes(process.env.NODE_ENV) && config.host !== "127.0.0.1") {
  throw new Error("liquid-workflow refuses non-loopback HOST outside development/test.");
}
