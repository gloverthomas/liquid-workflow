import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerMatches, checkApiAccess, checkApproveAccess, routeAccess } from "./access.js";

const tokens = { apiToken: "api-token-0123456789abcdef-xyz", approveToken: "approve-token-0123456789" };

describe("routeAccess", () => {
  it("keeps only health, dashboards, signal and signed webhooks public", () => {
    for (const [m, p] of [
      ["GET", "/health"],
      ["GET", "/status"],
      ["GET", "/"],
      ["GET", "/evals"],
      ["POST", "/signal"],
      ["OPTIONS", "/signal"],
      ["POST", "/webhooks/linear"],
      ["POST", "/webhooks/github"],
    ]) {
      assert.equal(routeAccess(m, p), "public", `${m} ${p}`);
    }
  });

  it("requires the API token for anything that reads runs or starts agent work", () => {
    for (const [m, p] of [
      ["POST", "/implement"],
      ["POST", "/trigger"],
      ["POST", "/evals/rerun"],
      ["GET", "/runs"],
      ["GET", "/runs/run_abc"],
      ["GET", "/evals/latest"],
      ["GET", "/gates"],
      ["GET", "/models"],
      ["GET", "/anything-new"],
      ["GET", "/webhooks/linear"],
    ]) {
      assert.equal(routeAccess(m, p), "api", `${m} ${p}`);
    }
    assert.equal(routeAccess("POST", "/approve"), "approve");
    assert.equal(routeAccess("GET", "/approve/LIQ-17"), "approve");
  });
});

describe("checkApiAccess", () => {
  it("fails closed without a configured token", () => {
    assert.deepEqual(checkApiAccess(`Bearer ${tokens.apiToken}`, { apiToken: "", approveToken: "" }), { ok: false, status: 503, error: "api_token_not_configured" });
  });

  it("accepts only the exact bearer token", () => {
    assert.deepEqual(checkApiAccess(`Bearer ${tokens.apiToken}`, tokens), { ok: true });
    assert.equal(checkApiAccess(undefined, tokens).ok, false);
    assert.equal(checkApiAccess(`Bearer ${tokens.apiToken}x`, tokens).ok, false);
    assert.equal(checkApiAccess(tokens.apiToken, tokens).ok, false);
    assert.equal(bearerMatches("Bearer ", tokens.apiToken), false);
  });
});

describe("checkApproveAccess", () => {
  it("accepts the API bearer or the Slack approve token", () => {
    assert.deepEqual(checkApproveAccess(`Bearer ${tokens.apiToken}`, "", tokens), { ok: true });
    assert.deepEqual(checkApproveAccess(undefined, tokens.approveToken, tokens), { ok: true });
  });

  it("refuses wrong tokens, and everything when nothing is configured", () => {
    assert.deepEqual(checkApproveAccess(undefined, "guess", tokens), { ok: false, status: 401, error: "invalid_approve_token" });
    assert.deepEqual(checkApproveAccess(undefined, "", tokens), { ok: false, status: 401, error: "invalid_approve_token" });
    assert.deepEqual(checkApproveAccess(`Bearer ${tokens.apiToken}`, "x", { apiToken: "", approveToken: "" }), {
      ok: false,
      status: 503,
      error: "approve_token_not_configured",
    });
  });
});
