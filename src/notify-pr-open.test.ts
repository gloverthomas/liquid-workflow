import assert from "node:assert/strict";
import test from "node:test";
import { buildPrOpenedSlackPayload, shouldOfferApproveImplement } from "./notify.js";

test("PR-open Slack tells you to review, then merge", () => {
  const payload = buildPrOpenedSlackPayload({
    identifier: "LIQ-39",
    title: "Reporting AI Assistant: related questions failed to render",
    linearUrl: "https://linear.app/liquid-accounting/issue/LIQ-39",
    prUrl: "https://github.com/gloverthomas/liquid-accounting-reporting/pull/32",
    repo: "gloverthomas/liquid-accounting-reporting",
    mention: "<@U123> ",
  });

  assert.match(String(payload.text), /review LIQ-39, then you merge/);
  const blocks = payload.blocks as Array<{ type: string; text?: { text: string }; elements?: Array<{ text?: { text: string }; url?: string }> }>;
  const section = blocks.find((block) => block.type === "section");
  assert.match(section?.text?.text ?? "", /PR is open/);
  assert.match(section?.text?.text ?? "", /open the PR, check BugBot, CI, and the preview, then you merge/);
  assert.doesNotMatch(section?.text?.text ?? "", /Create PR/i);

  const actions = blocks.find((block) => block.type === "actions");
  const labels = (actions?.elements ?? []).map((element) => element.text?.text);
  assert.deepEqual(labels, ["Open PR", "Open Linear"]);
  assert.equal(actions?.elements?.[0]?.url, "https://github.com/gloverthomas/liquid-accounting-reporting/pull/32");
});

test("failed eval does not offer Approve implement", () => {
  assert.equal(
    shouldOfferApproveImplement({
      kind: "plan",
      status: "completed",
      evalPassed: false,
      requireFormalApproval: true,
      hasApproval: false,
    }),
    false,
  );
  assert.equal(
    shouldOfferApproveImplement({
      kind: "plan",
      status: "completed",
      evalPassed: true,
      requireFormalApproval: true,
      hasApproval: false,
    }),
    true,
  );
});
