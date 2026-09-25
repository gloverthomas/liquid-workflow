import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { scrubPii } from "./pii.js";
import { log } from "./ops.js";

const OPS = join(process.cwd(), "runs", "ops");
const ACCESS = join(OPS, "access.jsonl");
const RUNS = join(process.cwd(), "runs");

function ensureOps() {
  if (!existsSync(OPS)) mkdirSync(OPS, { recursive: true });
}

export function accessLog(entry: Record<string, unknown>) {
  ensureOps();
  const line = scrubPii(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }),
  );
  appendFileSync(ACCESS, `${line}\n`, "utf8");
}

function retentionDays(): number {
  const n = Number.parseInt(process.env.RUN_RETENTION_DAYS ?? "14", 10);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

/** Delete run JSON and trim access/dlq logs older than retention. */
export function pruneRetention(): { deletedRuns: number; trimmedAccess: boolean } {
  ensureOps();
  const cutoff = Date.now() - retentionDays() * 24 * 60 * 60 * 1000;
  let deletedRuns = 0;

  if (existsSync(RUNS)) {
    for (const name of readdirSync(RUNS)) {
      if (!name.endsWith(".json")) continue;
      const path = join(RUNS, name);
      try {
        const st = statSync(path);
        if (st.mtimeMs < cutoff) {
          unlinkSync(path);
          deletedRuns += 1;
        }
      } catch {
        /* ignore */
      }
    }
  }

  let trimmedAccess = false;
  if (existsSync(ACCESS)) {
    try {
      const keep: string[] = [];
      for (const line of readFileSyncSafe(ACCESS).split("\n")) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line) as { ts?: string };
          if (row.ts && Date.parse(row.ts) >= cutoff) keep.push(line);
        } catch {
          /* drop corrupt */
        }
      }
      writeFileSync(ACCESS, keep.length ? `${keep.join("\n")}\n` : "");
      trimmedAccess = true;
    } catch {
      /* ignore */
    }
  }

  // Cap dead-letter size
  const dlq = join(OPS, "dead-letter.jsonl");
  if (existsSync(dlq)) {
    try {
      const lines = readFileSyncSafe(dlq).split("\n").filter(Boolean);
      if (lines.length > 2000) {
        writeFileSync(dlq, `${lines.slice(-2000).join("\n")}\n`);
      }
    } catch {
      /* ignore */
    }
  }

  log("info", "retention_pruned", { deletedRuns, trimmedAccess, retentionDays: retentionDays() });
  return { deletedRuns, trimmedAccess };
}

function readFileSyncSafe(path: string): string {
  return require("node:fs").readFileSync(path, "utf8") as string;
}
