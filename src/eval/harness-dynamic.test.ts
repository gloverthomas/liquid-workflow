import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRun } from "./harness.js";
import type { PlanRunRecord } from "../sdk-planner.js";

function planRecord(issueId: string, title: string, summary: string): PlanRunRecord {
  return {
    runId: "run_test",
    issue: { id: "uuid", identifier: issueId, title, stateName: "In Progress" },
    kind: "plan",
    status: "completed",
    startedAt: new Date().toISOString(),
    dryRun: true,
    summary,
  };
}

test("dynamic plan eval requires ticket id and title keywords, not revenue-summary", () => {
  const report = evaluateRun(
    planRecord(
      "LIQ-36",
      '[Hero] Reporting AI Assistant: "How this was calculated" accordion does not expand',
      [
        "Plan for LIQ-36: fix accordion expand in Reporting AI Assistant.",
        "Playwright e2e proof and parity.",
        "Out-of-scope: shared BFF. Atomic PR for this ticket only.",
        "Await approval before implementing.",
        "security reviewer and quality reviewer PASS.",
        "liquid-accounting-reporting main.tsx",
        "CI parity-proof assistant-unit smoke",
      ].join("\n"),
    ),
  );
  assert.equal(report.passed, true);
  assert.ok(report.checks.some((c) => c.id === "mentions-ticket-id" && c.passed));
  assert.ok(report.checks.some((c) => c.id === "mentions-title-theme" && c.passed));
});

test("LIQ-9 plan eval still requires revenue-summary hashes", () => {
  const report = evaluateRun(
    planRecord(
      "LIQ-9",
      "Core deep-links to renamed Sales summary",
      [
        "LIQ-9 plan: #revenue-summary and legacy #sales-summary.",
        "liquid-accounting-core cross-repo-parity Playwright parity-proof CI smoke",
        "Out-of-scope bounded atomic one ticket",
        "Await approval human write-gate security quality specialist",
        "AI assistant bell help feature map",
      ].join("\n"),
    ),
  );
  assert.equal(report.passed, true);
});
