import { createHmac, timingSafeEqual } from "node:crypto";
import type { TriggerIssue } from "./prompts/liq-9.js";
import { config } from "./config.js";
import { LINEAR_ISSUE_UUID } from "./notify.js";
import { parseApproveCommand, recordApproval } from "./write-gate.js";

export type LinearWebhookPayload = {
  action?: string;
  type?: string;
  data?: {
    id?: string;
    identifier?: string;
    title?: string;
    url?: string;
    body?: string;
    issueId?: string;
    issue?: { id?: string; identifier?: string; title?: string; url?: string };
    state?: { name?: string; type?: string };
    user?: { name?: string; email?: string; id?: string };
  };
  updatedFrom?: {
    stateId?: string | null;
  };
};

export type LinearWebhookAction = "plan" | "implement";

export function verifyLinearSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!config.linearWebhookSecret) {
    return true;
  }
  if (!signatureHeader) return false;
  const digest = createHmac("sha256", config.linearWebhookSecret).update(rawBody).digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const provided = Buffer.from(signatureHeader.trim(), "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function parseIssue(payload: LinearWebhookPayload): TriggerIssue | null {
  const identifier = payload.data?.identifier?.trim().toUpperCase() ?? "";
  if (config.triggerIssueIds.length > 0 && !config.triggerIssueIds.includes(identifier)) {
    return null;
  }
  if (!payload.data?.id || !identifier || !payload.data.title) return null;
  return {
    id: payload.data.id,
    identifier,
    title: payload.data.title,
    url: payload.data.url,
    stateName: payload.data?.state?.name?.trim() ?? "",
  };
}

/** In Progress → plan; In Review → implement (after formal approval). */
export function routeLinearWebhook(
  payload: LinearWebhookPayload,
): { action: LinearWebhookAction; issue: TriggerIssue } | null {
  if (payload.type !== "Issue") return null;
  if (payload.action !== "update") return null;
  if (!payload.updatedFrom || !("stateId" in payload.updatedFrom)) return null;

  const stateName = payload.data?.state?.name?.trim() ?? "";
  const lower = stateName.toLowerCase();
  const issue = parseIssue(payload);
  if (!issue) return null;

  if (config.triggerStates.includes(lower)) {
    return { action: "plan", issue };
  }
  if (config.implementStates.includes(lower)) {
    return { action: "implement", issue };
  }
  return null;
}

/**
 * Linear Comment create containing `/approve` → formal write-gate approval.
 * Returns the approval issue identifier when handled.
 */
export function routeLinearCommentApproval(
  payload: LinearWebhookPayload,
): { issueId: string; actor: string; approvalId: string } | null {
  if (payload.type !== "Comment") return null;
  if (payload.action !== "create") return null;
  if (!parseApproveCommand(payload.data?.body)) return null;

  const issueUuid = payload.data?.issueId ?? payload.data?.issue?.id ?? "";
  let identifier =
    payload.data?.issue?.identifier?.trim().toUpperCase() ??
    Object.entries(LINEAR_ISSUE_UUID).find(([, id]) => id === issueUuid)?.[0];

  if (!identifier && issueUuid) {
    // Fall back: match curated UUID map reverse
    for (const [key, id] of Object.entries(LINEAR_ISSUE_UUID)) {
      if (id === issueUuid) {
        identifier = key;
        break;
      }
    }
  }
  if (!identifier) return null;
  if (config.triggerIssueIds.length > 0 && !config.triggerIssueIds.includes(identifier)) {
    return null;
  }

  const actor =
    payload.data?.user?.name ||
    payload.data?.user?.email ||
    payload.data?.user?.id ||
    "linear-user";
  const approval = recordApproval({
    issueId: identifier,
    actor,
    source: "linear_comment",
    note: payload.data?.body?.slice(0, 200),
  });
  return { issueId: identifier, actor, approvalId: approval.approvalId };
}

/** @deprecated use routeLinearWebhook */
export function shouldTriggerFromWebhook(payload: LinearWebhookPayload): TriggerIssue | null {
  const routed = routeLinearWebhook(payload);
  return routed?.action === "plan" ? routed.issue : null;
}
