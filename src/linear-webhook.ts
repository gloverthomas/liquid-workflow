import { createHmac, timingSafeEqual } from "node:crypto";
import type { TriggerIssue } from "./prompts/liq-9.js";
import { config } from "./config.js";

export type LinearWebhookPayload = {
  action?: string;
  type?: string;
  data?: {
    id?: string;
    identifier?: string;
    title?: string;
    url?: string;
    state?: { name?: string; type?: string };
  };
  updatedFrom?: {
    stateId?: string | null;
  };
};

export type LinearWebhookAction = "plan" | "implement";

export function verifyLinearSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!config.linearWebhookSecret) {
    // Demo mode: allow unsigned when secret not configured (loopback only).
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

/** In Progress → plan; In Review → implement (human approved the plan). */
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

/** @deprecated use routeLinearWebhook */
export function shouldTriggerFromWebhook(payload: LinearWebhookPayload): TriggerIssue | null {
  const routed = routeLinearWebhook(payload);
  return routed?.action === "plan" ? routed.issue : null;
}
