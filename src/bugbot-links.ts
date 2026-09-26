/** Parse Cursor Bugbot GitHub review bodies and build Slack action URLs. */

const BUGBOT_REVIEW_MARKER = /<!--\s*BUGBOT_REVIEW\s*-->/;
const BUGBOT_BUG_ID_MARKER = /<!--\s*BUGBOT_BUG_ID:/;

const CURSOR_OPEN_LINK = /https:\/\/cursor\.com\/open\?link=[^\s"'<>)\]]+/;
const CURSOR_AGENTS_LINK = /https:\/\/cursor\.com\/agents\?link=[^\s"'<>)\]]+/;

export function isBugbotBody(body: string | null | undefined): boolean {
  if (!body?.trim()) return false;
  return BUGBOT_REVIEW_MARKER.test(body) || BUGBOT_BUG_ID_MARKER.test(body);
}

export function isBugbotSummaryReview(body: string): boolean {
  return BUGBOT_REVIEW_MARKER.test(body);
}

export function shouldNotifyBugbotEvent(eventName: string, action: string | undefined): boolean {
  if (eventName === "pull_request_review") return action === "submitted";
  if (eventName === "pull_request_review_comment") return action === "created";
  return false;
}

export function stripBugbotMediaHtml(text: string): string {
  return text
    .replace(/<picture\b[\s\S]*?<\/picture>/gi, "")
    .replace(/<img\b[^>]*\/?>/gi, "");
}

/** Slack-safe Bugbot body: drop media HTML, hidden markers, and other tags. */
export function sanitizeBugbotBodyForSlack(text: string): string {
  let cleaned = stripBugbotMediaHtml(text);
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  cleaned = cleaned.replace(
    /<a\s+[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote, url: string, label: string) => {
      const plain = label.replace(/<[^>]+>/g, "").trim();
      return plain ? `[${plain}](${url})` : url;
    },
  );
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractBugbotFixLinks(body: string): {
  fixCursor?: string;
  fixWeb?: string;
} {
  return {
    fixCursor: body.match(CURSOR_OPEN_LINK)?.[0],
    fixWeb: body.match(CURSOR_AGENTS_LINK)?.[0],
  };
}

export function bugbotFixCursorButtonLabel(body: string): "Fix all in Cursor" | "Fix in Cursor" {
  return isBugbotSummaryReview(body) ? "Fix all in Cursor" : "Fix in Cursor";
}

export type BugbotReviewNotification = {
  prTitle: string;
  prUrl: string;
  body: string;
};

export type GitHubBugbotWebhookPayload = {
  action?: string;
  review?: { body?: string | null };
  comment?: { body?: string | null };
  pull_request?: { title?: string; html_url?: string };
};

export function parseBugbotReviewNotification(
  eventName: string,
  payload: GitHubBugbotWebhookPayload,
): BugbotReviewNotification | null {
  if (!shouldNotifyBugbotEvent(eventName, payload.action)) return null;

  const body =
    eventName === "pull_request_review"
      ? payload.review?.body
      : eventName === "pull_request_review_comment"
        ? payload.comment?.body
        : undefined;

  if (!isBugbotBody(body)) return null;

  const prUrl = payload.pull_request?.html_url?.trim();
  if (!prUrl) return null;

  return {
    prTitle: payload.pull_request?.title?.trim() || "Pull request",
    prUrl,
    body: body!.trim(),
  };
}

export function buildBugbotSlackActionElements(args: {
  body: string;
  prUrl: string;
}): Array<Record<string, unknown>> {
  const { fixCursor, fixWeb } = extractBugbotFixLinks(args.body);
  const elements: Array<Record<string, unknown>> = [];

  if (fixCursor) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: bugbotFixCursorButtonLabel(args.body), emoji: true },
      url: fixCursor,
      style: "primary",
    });
  }
  if (fixWeb) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Fix in Web", emoji: true },
      url: fixWeb,
    });
  }
  elements.push({
    type: "button",
    text: { type: "plain_text", text: "Open PR", emoji: true },
    url: args.prUrl,
  });

  return elements.slice(0, 5);
}
