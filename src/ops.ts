import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LogFields = Record<string, unknown>;

/** Structured JSON logs to stdout/stderr for ops sinks. */
export function log(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    service: "liquid-workflow",
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

const STORE_DIR = join(process.cwd(), "runs", "ops");
const SEEN_PATH = join(STORE_DIR, "webhook-deliveries.json");
const LOCKS_PATH = join(STORE_DIR, "inflight-locks.json");
const DLQ_PATH = join(STORE_DIR, "dead-letter.jsonl");

type SeenMap = Record<string, { at: string; result: string }>;
type LockMap = Record<string, { at: string; deliveryId?: string }>;

function ensureStore() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

function readJson<T>(path: string, fallback: T): T {
  ensureStore();
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown) {
  ensureStore();
  writeFileSync(path, JSON.stringify(value, null, 2));
}

/** Returns true if this delivery was already processed (skip side effects). */
export function alreadyProcessed(deliveryId: string | undefined): boolean {
  if (!deliveryId?.trim()) return false;
  const seen = readJson<SeenMap>(SEEN_PATH, {});
  return Boolean(seen[deliveryId.trim()]);
}

export function markProcessed(deliveryId: string | undefined, result: string) {
  if (!deliveryId?.trim()) return;
  const seen = readJson<SeenMap>(SEEN_PATH, {});
  seen[deliveryId.trim()] = { at: new Date().toISOString(), result };
  // Cap growth: keep newest ~2000 keys
  const keys = Object.keys(seen);
  if (keys.length > 2000) {
    keys
      .sort((a, b) => (seen[a].at < seen[b].at ? -1 : 1))
      .slice(0, keys.length - 2000)
      .forEach((k) => delete seen[k]);
  }
  writeJson(SEEN_PATH, seen);
}

/** Issue-level lock so overlapping plan/implement for same ticket don't double-fire. */
export function acquireIssueLock(key: string, deliveryId?: string): boolean {
  const locks = readJson<LockMap>(LOCKS_PATH, {});
  const existing = locks[key];
  if (existing) {
    const ageMs = Date.now() - Date.parse(existing.at);
    // Stale lock after 45m (agent runaway / crash)
    if (Number.isFinite(ageMs) && ageMs < 45 * 60 * 1000) return false;
  }
  locks[key] = { at: new Date().toISOString(), deliveryId };
  writeJson(LOCKS_PATH, locks);
  return true;
}

export function releaseIssueLock(key: string) {
  const locks = readJson<LockMap>(LOCKS_PATH, {});
  delete locks[key];
  writeJson(LOCKS_PATH, locks);
}

export function deadLetter(entry: LogFields) {
  ensureStore();
  appendFileSync(
    DLQ_PATH,
    `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`,
    "utf8",
  );
}
