import assert from "node:assert/strict";
import test from "node:test";
import { config } from "./config.js";
import { containsProductSignal, isWorkflowEligible } from "./workflow-eligibility.js";

test("containsProductSignal matches exact phrase", () => {
  assert.equal(containsProductSignal("Opened from product signal triage"), true);
  assert.equal(containsProductSignal("ProductSignal"), false);
});

test("isWorkflowEligible honors TRIGGER_ISSUE_IDS and product signal phrase", () => {
  const saved = [...config.triggerIssueIds];
  try {
    config.triggerIssueIds.length = 0;
    config.triggerIssueIds.push("LIQ-9", "LIQ-24");
    assert.equal(isWorkflowEligible("LIQ-9", "Hero ticket", ""), true);
    assert.equal(isWorkflowEligible("LIQ-99", "Random", "notes with product signal inside"), true);
    assert.equal(isWorkflowEligible("LIQ-99", "Random", "no phrase here"), false);
  } finally {
    config.triggerIssueIds.length = 0;
    config.triggerIssueIds.push(...saved);
  }
});

test("empty TRIGGER_ISSUE_IDS allows every issue", () => {
  const saved = [...config.triggerIssueIds];
  try {
    config.triggerIssueIds.length = 0;
    assert.equal(isWorkflowEligible("LIQ-999", "Anything", ""), true);
  } finally {
    config.triggerIssueIds.length = 0;
    config.triggerIssueIds.push(...saved);
  }
});
