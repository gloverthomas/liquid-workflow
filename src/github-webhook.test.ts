import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIssueIdentifier,
  shouldMoveToInReviewFromPrOpen,
} from "./github-webhook.js";

test("extractIssueIdentifier prefers PR title over body", () => {
  const id = extractIssueIdentifier({
    pull_request: {
      title: "fix(LIQ-36): accordion expand",
      body: "Follow-up for LIQ-9 legacy path",
      head: { ref: "cursor/liq-15-fix" },
    },
  });
  assert.equal(id, "LIQ-36");
});

test("extractIssueIdentifier prefers branch over body", () => {
  const id = extractIssueIdentifier({
    pull_request: {
      title: "fix: accordion expand",
      body: "Closes LIQ-36",
      head: { ref: "cursor/liq-15-fix" },
    },
  });
  assert.equal(id, "LIQ-15");
});

test("extractIssueIdentifier falls back to body when title and branch have no id", () => {
  const id = extractIssueIdentifier({
    pull_request: {
      title: "fix: accordion expand",
      body: "Closes LIQ-36",
      head: { ref: "feature/x" },
    },
  });
  assert.equal(id, "LIQ-36");
});

test("shouldMoveToInReviewFromPrOpen accepts opened PRs to main on curated repos", () => {
  const routed = shouldMoveToInReviewFromPrOpen({
    action: "opened",
    repository: { full_name: "gloverthomas/liquid-accounting-core" },
    pull_request: {
      title: "feat(LIQ-24): demo",
      base: { ref: "main" },
      html_url: "https://github.com/gloverthomas/liquid-accounting-core/pull/1",
    },
  });
  assert.deepEqual(routed, {
    identifier: "LIQ-24",
    prUrl: "https://github.com/gloverthomas/liquid-accounting-core/pull/1",
    repo: "gloverthomas/liquid-accounting-core",
  });
});

test("shouldMoveToInReviewFromPrOpen ignores non-open actions", () => {
  assert.equal(
    shouldMoveToInReviewFromPrOpen({
      action: "closed",
      pull_request: { title: "LIQ-9", base: { ref: "main" }, merged: true },
      repository: { full_name: "gloverthomas/liquid-accounting-reporting" },
    }),
    null,
  );
});
