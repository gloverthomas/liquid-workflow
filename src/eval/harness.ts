import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PlanRunRecord } from "../sdk-planner.js";

export type EvalCheck = {
  id: string;
  description: string;
  passed: boolean;
  detail?: string;
};

export type EvalReport = {
  evalId: string;
  runId: string;
  issueId: string;
  kind: PlanRunRecord["kind"];
  passed: boolean;
  checkedAt: string;
  checks: EvalCheck[];
  artifactPath?: string;
};

function newEvalId() {
  return `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function includesAny(text: string, needles: string[]) {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/**
 * Deterministic eval rubric (not an MCP). Gates the human write-gate before implement.
 * Checks the plan/implement artifact text — no model calls.
 */
export function evaluateRun(record: PlanRunRecord): EvalReport {
  const text = `${record.summary ?? ""}\n${record.error ?? ""}`;
  const checks: EvalCheck[] = [];

  const requireMention = (
    id: string,
    description: string,
    needles: string[],
    required: boolean,
  ) => {
    const hit = includesAny(text, needles);
    checks.push({
      id,
      description,
      passed: required ? hit : !hit,
      detail: hit ? `matched one of: ${needles.join(" | ")}` : "no match",
    });
  };

  if (record.kind === "plan" || record.status === "dry_run") {
    const isLiq15 = record.issue.identifier.toUpperCase() === "LIQ-15";
    if (isLiq15) {
      requireMention(
        "mentions-invoice-performance",
        "Plan references #invoice-performance (broken hash)",
        ["#invoice-performance", "invoice-performance"],
        true,
      );
      requireMention(
        "mentions-revenue-fix",
        "Plan retargets to #revenue-summary (or equivalent real report)",
        ["#revenue-summary", "revenue-summary"],
        true,
      );
    } else {
      requireMention(
        "mentions-revenue-summary",
        "Plan references #revenue-summary (canonical hash)",
        ["#revenue-summary", "revenue-summary"],
        true,
      );
      requireMention(
        "mentions-legacy-sales",
        "Plan acknowledges legacy #sales-summary",
        ["#sales-summary", "sales-summary"],
        true,
      );
    }
    requireMention(
      "lists-files-or-repos",
      "Plan names Core and/or Reporting files or repos",
      ["liquid-accounting-core", "liquid-accounting-reporting", "main.tsx", "cross-repo-parity"],
      true,
    );
    requireMention(
      "playwright-parity",
      "Plan mentions Playwright / parity assertions",
      ["playwright", "parity", "e2e"],
      true,
    );
    requireMention(
      "out-of-scope",
      "Plan calls out out-of-scope work",
      ["out-of-scope", "out of scope", "must not", "do not", "bounded"],
      true,
    );
    requireMention(
      "human-write-gate",
      "Plan ends with human write-gate / await approval",
      ["await approval", "write-gate", "write gate", "human"],
      true,
    );
    requireMention(
      "no-big-bang",
      "Plan does not propose a full Reporting→Core merge or new shared BFF",
      [
        "merge all reporting",
        "big-bang merge",
        "create a shared bff",
        "invent a shared bff",
        "build a shared bff",
        "extract entire shell into core",
      ],
      false,
    );
    requireMention(
      "specialists-invoked-or-noted",
      "Plan notes security and/or quality specialist review",
      ["security", "quality", "subagent", "specialist", "reviewer"],
      true,
    );
  }

  if (record.kind === "implement") {
    requireMention(
      "implement-revenue",
      "Implement targets #revenue-summary",
      ["#revenue-summary", "revenue-summary"],
      true,
    );
    requireMention(
      "no-merge-claim",
      "Implement does not claim production merge",
      ["merged to main", "deployed to production", "pushed prod"],
      false,
    );
  }

  if (record.status === "failed") {
    checks.push({
      id: "run-not-failed",
      description: "Underlying SDK run completed without failure",
      passed: false,
      detail: record.error,
    });
  }

  const passed = checks.every((c) => c.passed);
  const report: EvalReport = {
    evalId: newEvalId(),
    runId: record.runId,
    issueId: record.issue.identifier,
    kind: record.kind,
    passed,
    checkedAt: new Date().toISOString(),
    checks,
  };

  const dir = join(process.cwd(), "runs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${report.evalId}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  report.artifactPath = path;
  return report;
}

export function latestEvalForIssue(issueId: string, kind: PlanRunRecord["kind"] = "plan"): EvalReport | null {
  const dir = join(process.cwd(), "runs");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("eval_") && f.endsWith(".json"))
    .sort()
    .reverse();
  for (const file of files) {
    try {
      const report = JSON.parse(readFileSync(join(dir, file), "utf8")) as EvalReport;
      if (report.issueId === issueId.toUpperCase() && report.kind === kind) {
        return report;
      }
    } catch {
      /* skip bad artifacts */
    }
  }
  return null;
}
