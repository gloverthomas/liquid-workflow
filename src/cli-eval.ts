/**
 * Re-run the deterministic eval rubric against the latest plan artifact.
 *   npm run eval
 *   npm run eval -- run_xxx
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { evaluateRun, type EvalReport } from "./eval/harness.js";
import type { PlanRunRecord } from "./sdk-planner.js";

const arg = process.argv[2];
const dir = join(process.cwd(), "runs");

function loadRun(runId: string): PlanRunRecord | null {
  const path = join(dir, `${runId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as PlanRunRecord;
}

function latestPlanRun(): PlanRunRecord | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("run_") && f.endsWith(".json"))
    .sort()
    .reverse();
  for (const file of files) {
    const record = JSON.parse(readFileSync(join(dir, file), "utf8")) as PlanRunRecord;
    if (record.kind === "plan") return record;
  }
  return null;
}

const record = arg ? loadRun(arg) : latestPlanRun();
if (!record) {
  console.error(arg ? `Run not found: ${arg}` : "No plan runs in ./runs — npm run trigger first.");
  process.exit(1);
}

const report: EvalReport = evaluateRun(record);
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 2);
