import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { log } from "./ops.js";

export type ApprovalRecord = {
  approvalId: string;
  issueId: string;
  actor: string;
  source: "http" | "slack" | "linear_comment" | "cli";
  note?: string;
  at: string;
  expiresAt: string;
};

const STORE_DIR = join(process.cwd(), "runs", "ops");
const PATH = join(STORE_DIR, "approvals.json");

type Store = { approvals: ApprovalRecord[] };

function ensure() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

function readStore(): Store {
  ensure();
  if (!existsSync(PATH)) return { approvals: [] };
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as Store;
  } catch {
    return { approvals: [] };
  }
}

function writeStore(store: Store) {
  ensure();
  // Keep last 500
  store.approvals = store.approvals.slice(-500);
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

function ttlMs() {
  const hours = Number.parseInt(process.env.APPROVAL_TTL_HOURS ?? "24", 10);
  return (Number.isFinite(hours) ? hours : 24) * 60 * 60 * 1000;
}

export function recordApproval(input: {
  issueId: string;
  actor: string;
  source: ApprovalRecord["source"];
  note?: string;
}): ApprovalRecord {
  const at = new Date();
  const record: ApprovalRecord = {
    approvalId: `appr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    issueId: input.issueId.toUpperCase(),
    actor: input.actor.slice(0, 120),
    source: input.source,
    note: input.note?.slice(0, 400),
    at: at.toISOString(),
    expiresAt: new Date(at.getTime() + ttlMs()).toISOString(),
  };
  const store = readStore();
  store.approvals.push(record);
  writeStore(store);
  log("info", "write_gate_approved", {
    approvalId: record.approvalId,
    issue: record.issueId,
    actor: record.actor,
    source: record.source,
  });
  return record;
}

export function latestValidApproval(issueId: string): ApprovalRecord | undefined {
  const id = issueId.toUpperCase();
  const now = Date.now();
  const store = readStore();
  return [...store.approvals]
    .reverse()
    .find((a) => a.issueId === id && Date.parse(a.expiresAt) > now);
}

export function requireFormalApproval(): boolean {
  return config.requireFormalApproval;
}

/** Returns error message if blocked; undefined if OK. */
export function formalApprovalBlockReason(issueId: string): string | undefined {
  if (!requireFormalApproval()) return undefined;
  const ok = latestValidApproval(issueId);
  if (ok) return undefined;
  return `WRITE_GATE: no formal approval for ${issueId.toUpperCase()}. Comment /approve on Linear, or POST /approve, or use the Slack Approve button.`;
}

export function parseApproveCommand(body: string | undefined): boolean {
  if (!body?.trim()) return false;
  const t = body.trim().toLowerCase();
  return (
    t === "/approve" ||
    t.startsWith("/approve ") ||
    t === "approve implement" ||
    t.startsWith("approve implement")
  );
}
