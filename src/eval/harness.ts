import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isHeroIssue } from "../hero-issues.js";
import type { PlanRunRecord } from "../sdk-planner.js";
import { titleKeywords } from "./title-keywords.js";

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
    const id = record.issue.identifier.toUpperCase();
    const isLiq24 = id === "LIQ-24";
    const isLiq17 = id === "LIQ-17";
    const isLiq16 = id === "LIQ-16";
    const isLiq15 = id === "LIQ-15";
    if (isLiq24) {
      requireMention(
        "mentions-ai-assistant",
        "Plan references AI Assistant / right-rail chat parity",
        ["ai assistant", "assistant", "right rail", "grok", "chat"],
        true,
      );
      requireMention(
        "mentions-core-and-reporting",
        "Plan names Core and Reporting",
        ["liquid-accounting-core", "liquid-accounting-reporting", "core", "reporting"],
        true,
      );
    } else if (isLiq17) {
      requireMention(
        "mentions-notifications",
        "Plan references Notifications / bell shell parity",
        ["notification", "notifications", "bell", "inbox"],
        true,
      );
      requireMention(
        "mentions-core-and-reporting",
        "Plan names Core and Reporting",
        ["liquid-accounting-core", "liquid-accounting-reporting", "core", "reporting"],
        true,
      );
    } else if (isLiq16) {
      requireMention(
        "mentions-help-centre",
        "Plan references Help centre shell parity",
        ["help centre", "help-centre", "help menu", "help"],
        true,
      );
      requireMention(
        "mentions-core-and-reporting",
        "Plan names Core and Reporting",
        ["liquid-accounting-core", "liquid-accounting-reporting", "core", "reporting"],
        true,
      );
    } else if (isLiq15) {
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
    } else if (id === "LIQ-9") {
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
    } else {
      requireMention(
        "mentions-ticket-id",
        `Plan references ticket ${id}`,
        [id.toLowerCase(), id],
        true,
      );
      const keywords = titleKeywords(record.issue.title);
      if (keywords.length > 0) {
        requireMention(
          "mentions-title-theme",
          "Plan reflects words from the Linear ticket title",
          keywords,
          true,
        );
      }
      requireMention(
        "no-liq9-playbook",
        "Plan does not default to LIQ-9 #sales-summary migration language",
        ["#sales-summary", "sales-summary deep-link", "liq-9 only"],
        false,
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
      "Plan mentions Playwright / parity / runtime e2e proof",
      ["playwright", "parity", "e2e", "runtime", "screenshot", "proof"],
      true,
    );
    requireMention(
      "ci-jobs",
      "Plan names CI / required status checks that must pass",
      ["parity-proof", "help-proof", "assistant-unit", "smoke", "ci", "status check", "github actions", "vitest", "rtl"],
      true,
    );
    requireMention(
      "feature-map-path",
      "Plan references a concrete UI path (assistant / bell / Help / hash / feature map)",
      ["feature map", "feature-map", "ai assistant", "assistant", "bell", "help", "#revenue", "#sales", "header", "popover", "right rail"],
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
      "atomic-pr",
      "Plan keeps scope to one hero ticket / atomic PR",
      ["atomic", "one ticket", "this ticket", "bounded", "only"],
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
    const id = record.issue.identifier.toUpperCase();
    if (id === "LIQ-24") {
      requireMention(
        "implement-ai-assistant",
        "Implement targets AI Assistant parity",
        ["ai assistant", "assistant", "chat", "/api/v1/assistant"],
        true,
      );
    } else if (id === "LIQ-17") {
      requireMention(
        "implement-notifications",
        "Implement targets Notifications parity",
        ["notification", "notifications", "bell"],
        true,
      );
    } else if (id === "LIQ-16") {
      requireMention(
        "implement-help",
        "Implement targets Help centre parity",
        ["help", "help centre", "help-centre"],
        true,
      );
    } else if (id === "LIQ-9") {
      requireMention(
        "implement-revenue",
        "Implement targets #revenue-summary",
        ["#revenue-summary", "revenue-summary"],
        true,
      );
    } else if (!isHeroIssue(id)) {
      requireMention(
        "implement-ticket-id",
        `Implement references ${id}`,
        [id.toLowerCase(), id],
        true,
      );
      const keywords = titleKeywords(record.issue.title);
      if (keywords.length > 0) {
        requireMention(
          "implement-title-theme",
          "Implement reflects the Linear ticket title theme",
          keywords,
          true,
        );
      }
      requireMention(
        "implement-proof-path",
        `Implement names ticket-specific proof path e2e/proof/${id.toLowerCase()}-fix.png`,
        [`e2e/proof/${id.toLowerCase()}-fix`, `${id.toLowerCase()}-fix.png`],
        true,
      );
    }
    requireMention(
      "no-merge-claim",
      "Implement does not claim production merge",
      ["merged to main", "deployed to production", "pushed prod"],
      false,
    );
    requireMention(
      "visual-proof",
      "Implement mentions screenshots / docs/pr-proof / e2e proof",
      ["pr-proof", "e2e/proof", "screenshot", "proof", "playwright"],
      true,
    );
    requireMention(
      "ci-named",
      "Implement names CI jobs that must go green",
      ["parity-proof", "help-proof", "assistant-unit", "smoke", "build", "ci", "vitest"],
      true,
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

/** Newest eval reports across issues (for /evals dashboard). */
export function listRecentEvals(limit = 40): EvalReport[] {
  const dir = join(process.cwd(), "runs");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("eval_") && f.endsWith(".json"))
    .sort()
    .reverse();
  const out: EvalReport[] = [];
  for (const file of files) {
    if (out.length >= limit) break;
    try {
      out.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as EvalReport);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function formatEvalChecklistMarkdown(report: EvalReport | undefined): string {
  if (!report?.checks?.length) return "";
  const lines = [
    `### Eval gate — **${report.passed ? "PASSED" : "FAILED"}**`,
    "",
    `| Check | Result |`,
    `| --- | --- |`,
    ...report.checks.map((c) => `| ${c.passed ? "✅" : "❌"} ${c.description} | \`${c.id}\` |`),
    "",
    `_eval \`${report.evalId}\` · run \`${report.runId}\`_`,
  ];
  return lines.join("\n");
}

export function formatEvalChecklistSlack(report: EvalReport | undefined): string {
  if (!report?.checks?.length) return "";
  const lines = report.checks.map((c) => `${c.passed ? "• ✅" : "• ❌"} ${c.description}`);
  return [`*Eval checklist* (\`${report.evalId}\`)`, ...lines].join("\n");
}
