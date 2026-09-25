/**
 * Access policy for the control plane. The service is reachable through a
 * public Cloudflare tunnel, so every route that reads plans/evals or can start
 * agent work requires a bearer token; the few public routes are either
 * read-only dashboards, the browser-called /signal triage, or signature-checked
 * webhooks. Fails closed when tokens aren't configured.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type Access = "public" | "api" | "approve";

export type AccessDecision = { ok: true } | { ok: false; status: 401 | 503; error: string };

const PUBLIC_GET = new Set(["/health", "/status", "/", "/evals"]);
const WEBHOOKS = new Set(["/webhooks/linear", "/webhooks/github"]);

export function routeAccess(method: string, pathname: string): Access {
  if (method === "GET" && PUBLIC_GET.has(pathname)) return "public";
  // Called from the Reporting app in the browser (CORS); it can only triage.
  if ((method === "POST" || method === "OPTIONS") && pathname === "/signal") return "public";
  // Authenticated by HMAC signature inside the handlers.
  if (method === "POST" && WEBHOOKS.has(pathname)) return "public";
  if (pathname === "/approve" || pathname.startsWith("/approve/")) return "approve";
  return "api";
}

/** Constant-time compare that doesn't leak length (both sides hashed first). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function bearerMatches(authorization: string | undefined, token: string): boolean {
  if (!token || !authorization?.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice("Bearer ".length).trim(), token);
}

export interface AccessTokens {
  apiToken: string;
  approveToken: string;
}

/** Gate for "api" routes (and the bearer path of "approve"). */
export function checkApiAccess(authorization: string | undefined, tokens: AccessTokens): AccessDecision {
  if (!tokens.apiToken) return { ok: false, status: 503, error: "api_token_not_configured" };
  return bearerMatches(authorization, tokens.apiToken) ? { ok: true } : { ok: false, status: 401, error: "unauthorized" };
}

/**
 * /approve accepts the API bearer (Liquid Insights) or the APPROVE_TOKEN used
 * in Slack "Approve" links. With neither configured, approvals are refused.
 */
export function checkApproveAccess(authorization: string | undefined, suppliedToken: string, tokens: AccessTokens): AccessDecision {
  if (tokens.apiToken && bearerMatches(authorization, tokens.apiToken)) return { ok: true };
  if (tokens.approveToken && suppliedToken && safeEqual(suppliedToken, tokens.approveToken)) return { ok: true };
  if (!tokens.apiToken && !tokens.approveToken) return { ok: false, status: 503, error: "approve_token_not_configured" };
  return { ok: false, status: 401, error: "invalid_approve_token" };
}
