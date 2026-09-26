import assert from "node:assert/strict";
import test from "node:test";
import { extractIssueIdentifier } from "./github-webhook.js";

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

test("extractIssueIdentifier falls back to body when title has no id", () => {
  const id = extractIssueIdentifier({
    pull_request: {
      title: "fix: accordion expand",
      body: "Closes LIQ-36",
      head: { ref: "feature/x" },
    },
  });
  assert.equal(id, "LIQ-36");
});
