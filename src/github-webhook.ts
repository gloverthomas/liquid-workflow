import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export type GitHubPullRequestPayload = {
  action?: string;
  number?: number;
  pull_request?: {
    title?: string;
    body?: string | null;
    html_url?: string;
    merged?: boolean;
    merge_commit_sha?: string | null;
    head?: { ref?: string };
    base?: { ref?: string; repo?: { full_name?: string } };
  };
  repository?: { full_name?: string };
};

const ISSUE_RE = /\b(LIQ-\d+)\b/i;

export function verifyGitHubSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  // Public tunnel: without a secret we cannot tell a real webhook from anyone else, so refuse.
  if (!config.githubWebhookSecret) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const digest = createHmac("sha256", config.githubWebhookSecret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`, "utf8");
  const provided = Buffer.from(signatureHeader.trim(), "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function extractIssueIdentifier(payload: GitHubPullRequestPayload): string | null {
  const title = payload.pull_request?.title ?? "";
  const titleMatch = title.match(ISSUE_RE);
  if (titleMatch) return titleMatch[1]!.toUpperCase();

  const haystack = [payload.pull_request?.body, payload.pull_request?.head?.ref]
    .filter(Boolean)
    .join("\n");
  const match = haystack.match(ISSUE_RE);
  return match ? match[1]!.toUpperCase() : null;
}

export function shouldCloseFromMerge(payload: GitHubPullRequestPayload): {
  identifier: string;
  prUrl?: string;
  repo?: string;
} | null {
  if (payload.action !== "closed") return null;
  if (!payload.pull_request?.merged) return null;
  if (payload.pull_request.base?.ref && payload.pull_request.base.ref !== "main") {
    return null;
  }

  const repo = (
    payload.repository?.full_name ??
    payload.pull_request.base?.repo?.full_name ??
    ""
  ).toLowerCase();
  if (config.githubMergeRepos.length > 0 && !config.githubMergeRepos.includes(repo)) {
    return null;
  }

  const identifier = extractIssueIdentifier(payload);
  if (!identifier) return null;

  return {
    identifier,
    prUrl: payload.pull_request.html_url,
    repo: repo || undefined,
  };
}
