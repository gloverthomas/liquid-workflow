import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBugbotSlackActionElements,
  extractBugbotFixLinks,
  isBugbotBody,
  parseBugbotReviewNotification,
  sanitizeBugbotBodyForSlack,
  shouldNotifyBugbotEvent,
  stripBugbotMediaHtml,
} from "./bugbot-links.js";

const OPEN = "https://cursor.com/open?link=open-payload";
const WEB = "https://cursor.com/agents?link=web-payload";
const PR = "https://github.com/org/repo/pull/42";

test("shouldNotifyBugbotEvent accepts submitted reviews and new inline comments only", () => {
  assert.equal(shouldNotifyBugbotEvent("pull_request_review", "submitted"), true);
  assert.equal(shouldNotifyBugbotEvent("pull_request_review", "edited"), false);
  assert.equal(shouldNotifyBugbotEvent("pull_request_review_comment", "created"), true);
  assert.equal(shouldNotifyBugbotEvent("pull_request_review_comment", "edited"), false);
  assert.equal(shouldNotifyBugbotEvent("pull_request", "closed"), false);
});

test("isBugbotBody detects BUGBOT_REVIEW and BUGBOT_BUG_ID markers", () => {
  assert.equal(isBugbotBody("<!-- BUGBOT_REVIEW -->\nSummary"), true);
  assert.equal(isBugbotBody("<!-- BUGBOT_BUG_ID: bug-1 -->\nInline"), true);
  assert.equal(isBugbotBody("human review comment"), false);
});

test("stripBugbotMediaHtml removes img and picture blocks", () => {
  const raw = `<p>Issue</p><picture><source srcset="x.webp"/><img src="x.png" alt="chart"/></picture><img src="y.png"/>`;
  assert.equal(stripBugbotMediaHtml(raw), "<p>Issue</p>");
});

test("sanitizeBugbotBodyForSlack strips media and hidden markers", () => {
  const body = [
    "<!-- BUGBOT_REVIEW -->",
    "Cursor Bugbot found 1 issue.",
    `<a href="${OPEN}">Fix all in Cursor</a>`,
    `<picture><img src="proof.png"/></picture>`,
  ].join("\n");
  const slack = sanitizeBugbotBodyForSlack(body);
  assert.match(slack, /Cursor Bugbot found 1 issue\./);
  assert.doesNotMatch(slack, /BUGBOT_REVIEW|picture|img|proof\.png/i);
  assert.match(slack, /Fix all in Cursor/);
});

test("extractBugbotFixLinks pulls open and agents URLs", () => {
  const links = extractBugbotFixLinks(
    `Fix: [desktop](${OPEN}) or [web](${WEB})`,
  );
  assert.equal(links.fixCursor, OPEN);
  assert.equal(links.fixWeb, WEB);
});

test("buildBugbotSlackActionElements uses Fix all vs Fix in Cursor labels", () => {
  const summary = buildBugbotSlackActionElements({
    body: `<!-- BUGBOT_REVIEW -->\n${OPEN}\n${WEB}`,
    prUrl: PR,
  });
  assert.deepEqual(
    summary.map((el) => (el.text as { text: string }).text),
    ["Fix all in Cursor", "Fix in Web", "Open PR"],
  );

  const inline = buildBugbotSlackActionElements({
    body: `<!-- BUGBOT_BUG_ID: b1 -->\n${OPEN}\n${WEB}`,
    prUrl: PR,
  });
  assert.equal((inline[0]!.text as { text: string }).text, "Fix in Cursor");
});

test("parseBugbotReviewNotification ignores non-bugbot and edited events", () => {
  assert.equal(
    parseBugbotReviewNotification("pull_request_review", {
      action: "edited",
      review: { body: "<!-- BUGBOT_REVIEW -->" },
      pull_request: { html_url: PR, title: "feat" },
    }),
    null,
  );
  assert.equal(
    parseBugbotReviewNotification("pull_request_review", {
      action: "submitted",
      review: { body: "Looks good" },
      pull_request: { html_url: PR, title: "feat" },
    }),
    null,
  );
});

test("parseBugbotReviewNotification returns PR metadata for bugbot bodies", () => {
  const parsed = parseBugbotReviewNotification("pull_request_review_comment", {
    action: "created",
    comment: { body: "<!-- BUGBOT_BUG_ID: x -->\n### Title\nDetails" },
    pull_request: { html_url: PR, title: "fix: widget" },
  });
  assert.deepEqual(parsed, {
    prTitle: "fix: widget",
    prUrl: PR,
    body: "<!-- BUGBOT_BUG_ID: x -->\n### Title\nDetails",
  });
});
