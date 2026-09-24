import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "@cursor/sdk";
import { buildSpecialistAgents } from "./agents.js";
import { config } from "./config.js";
import { evaluateRun, latestEvalForIssue, type EvalReport } from "./eval/harness.js";
import { describeRoster } from "./models.js";
import { buildLiq15ImplementPrompt, buildLiq15PlanPrompt, isLiq15 } from "./prompts/liq-15.js";
import { buildLiq16ImplementPrompt, buildLiq16PlanPrompt, isLiq16 } from "./prompts/liq-16.js";
import { buildImplementPrompt, buildPlanPrompt, type TriggerIssue } from "./prompts/liq-9.js";

export type PlanRunRecord = {
  runId: string;
  agentId?: string;
  issue: TriggerIssue;
  status: "queued" | "running" | "completed" | "failed" | "dry_run";
  kind: "plan" | "implement";
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  dryRun: boolean;
  artifactPath?: string;
  agentUrl?: string;
  prUrls?: string[];
  previewUrls?: string[];
  modelRoster?: string;
  eval?: EvalReport;
};

const runs = new Map<string, PlanRunRecord>();

function newRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function persist(record: PlanRunRecord) {
  const dir = join(process.cwd(), "runs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${record.runId}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2));
  record.artifactPath = path;
  runs.set(record.runId, record);
}

export function getRun(runId: string) {
  return runs.get(runId);
}

export function listRuns() {
  return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function collectAssistantText(events: AsyncIterable<unknown>): Promise<string> {
  return (async () => {
    const chunks: string[] = [];
    for await (const event of events) {
      const e = event as {
        type?: string;
        message?: { content?: Array<{ type?: string; text?: string }> };
        text?: string;
      };
      if (e.type === "assistant" && Array.isArray(e.message?.content)) {
        for (const part of e.message.content) {
          if (part.type === "text" && part.text) chunks.push(part.text);
        }
      } else if (typeof e.text === "string") {
        chunks.push(e.text);
      }
    }
    return chunks.join("\n").trim();
  })();
}

function extractUrls(text: string): { prUrls: string[]; previewUrls: string[] } {
  const prUrls = [...text.matchAll(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/g)].map((m) => m[0]);
  const previewUrls = [
    ...text.matchAll(/https:\/\/[^\s)]+\.vercel\.app[^\s)]*/g),
    ...text.matchAll(/https:\/\/[^\s)]*vercel\.app[^\s)]*/g),
  ].map((m) => m[0]);
  return {
    prUrls: [...new Set(prUrls)],
    previewUrls: [...new Set(previewUrls)],
  };
}

function agentDeepLink(agentId?: string) {
  return agentId ? `https://cursor.com/agents/${agentId}` : undefined;
}

function attachEval(record: PlanRunRecord) {
  record.eval = evaluateRun(record);
  persist(record);
  return record;
}

export async function startPlanRun(issue: TriggerIssue): Promise<PlanRunRecord> {
  const runId = newRunId();
  const specialists = await buildSpecialistAgents();
  const rosterBlock = describeRoster(specialists.roster);
  const plannerModel = specialists.roster.find((r) => r.role === "planner")!;

  const record: PlanRunRecord = {
    runId,
    issue,
    kind: "plan",
    status: "queued",
    startedAt: new Date().toISOString(),
    dryRun: config.dryRun,
    modelRoster: rosterBlock,
  };
  persist(record);

  if (config.dryRun) {
    record.status = "dry_run";
    record.finishedAt = new Date().toISOString();
    const is15 = issue.identifier.toUpperCase() === "LIQ-15";
    record.summary = [
      `DRY RUN plan for ${issue.identifier}`,
      "",
      "Would launch Cursor SDK cloud planner with repos:",
      `- ${config.coreRepoUrl}@${config.repoStartingRef}`,
      `- ${config.reportingRepoUrl}@${config.repoStartingRef}`,
      "",
      "Mode: plan",
      `Planner model: ${plannerModel.selection.id}${
        plannerModel.selection.id === "auto-smart" ? ` / ${plannerModel.optimizeFor}` : ""
      }`,
      "",
      "Model roster:",
      rosterBlock,
      "",
      "Specialist subagents (spawned by planner):",
      "- security-reviewer — Intelligence — BFF/auth/deep-link abuse",
      "- quality-reviewer — Cost — Playwright parity + out-of-scope diffs",
      "",
      is15
        ? "Bounded fix: Core #invoice-performance → #revenue-summary (LIQ-15 only)"
        : issue.identifier.toUpperCase() === "LIQ-16"
          ? "Bounded fix: Reporting Help centre parity with Core dropdown (LIQ-16 only)"
          : "Bounded fix: Core #sales-summary → #revenue-summary (LIQ-9 only)",
      issue.identifier.toUpperCase() === "LIQ-16"
        ? "Files: liquid-accounting-reporting/src/main.tsx, styles; mirror Core help popover; e2e parity"
        : "Files: liquid-accounting-core/src/main.tsx, liquid-accounting-core/src/demoSignal.ts,",
      issue.identifier.toUpperCase() === "LIQ-16"
        ? "Out-of-scope: shared design-system package, full shell extraction, BFF changes."
        : "       liquid-accounting-reporting/src/main.tsx (miss copy only),",
      issue.identifier.toUpperCase() === "LIQ-16"
        ? ""
        : "       liquid-accounting-core/e2e/cross-repo-parity.spec.ts",
      issue.identifier.toUpperCase() === "LIQ-16"
        ? ""
        : "Out-of-scope: shared BFF, full shell extraction, status pills, new Invoice performance product.",
      "Security: PASS (dry-run synthetic). Quality: PASS (dry-run synthetic).",
      "Human write-gate: Await approval before implementing.",
      "",
      "Set DRY_RUN=false and CURSOR_API_KEY to execute for real.",
    ].join("\n");
    return attachEval(record);
  }

  record.status = "running";
  persist(record);

  try {
    await using agent = await Agent.create({
      apiKey: config.cursorApiKey,
      name: `Liquid planner ${issue.identifier}`,
      model: plannerModel.selection,
      mode: "plan",
      agents: specialists.agents,
      cloud: {
        repos: [
          { url: config.coreRepoUrl, startingRef: config.repoStartingRef },
          { url: config.reportingRepoUrl, startingRef: config.repoStartingRef },
        ],
        autoCreatePR: false,
        metadata: {
          liquid_issue: issue.identifier,
          liquid_run: runId,
          workflow: "convergence-planner",
          model_planner: plannerModel.selection.id,
        },
      },
    });

    record.agentId = agent.agentId;
    record.agentUrl = agentDeepLink(agent.agentId);
    persist(record);

    const prompt = isLiq16(issue)
      ? buildLiq16PlanPrompt(issue, rosterBlock)
      : isLiq15(issue)
        ? buildLiq15PlanPrompt(issue, rosterBlock)
        : buildPlanPrompt(issue, rosterBlock);
    const run = await agent.send(prompt);
    const streamed = await collectAssistantText(run.stream());
    const waited = await run.wait();
    const resultText =
      streamed ||
      (typeof waited === "object" && waited && "result" in waited
        ? String((waited as { result?: unknown }).result ?? "")
        : "");

    record.status = "completed";
    record.finishedAt = new Date().toISOString();
    record.summary =
      resultText || `Cloud agent ${agent.agentId} completed plan mode for ${issue.identifier}.`;
    const urls = extractUrls(record.summary);
    record.prUrls = urls.prUrls;
    record.previewUrls = urls.previewUrls;
    return attachEval(record);
  } catch (error) {
    record.status = "failed";
    record.finishedAt = new Date().toISOString();
    record.error = error instanceof Error ? error.message : String(error);
    return attachEval(record);
  }
}

/** Human write-gate passed: implement bounded LIQ-9 fix and open PRs. */
export async function startImplementRun(issue: TriggerIssue): Promise<PlanRunRecord> {
  if (config.evalGate) {
    const prior = latestEvalForIssue(issue.identifier, "plan");
    if (!prior) {
      const blocked: PlanRunRecord = {
        runId: newRunId(),
        issue,
        kind: "implement",
        status: "failed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        dryRun: config.dryRun,
        error: `EVAL_GATE: no passing plan eval for ${issue.identifier}. Run /trigger first.`,
      };
      persist(blocked);
      return blocked;
    }
    if (!prior.passed) {
      const blocked: PlanRunRecord = {
        runId: newRunId(),
        issue,
        kind: "implement",
        status: "failed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        dryRun: config.dryRun,
        error: `EVAL_GATE: plan eval ${prior.evalId} failed. Fix plan findings before /implement.`,
        eval: prior,
      };
      persist(blocked);
      return blocked;
    }
  }

  const runId = newRunId();
  const specialists = await buildSpecialistAgents();
  const rosterBlock = describeRoster(specialists.roster);
  const implementerModel = specialists.roster.find((r) => r.role === "implementer")!;

  const record: PlanRunRecord = {
    runId,
    issue,
    kind: "implement",
    status: "queued",
    startedAt: new Date().toISOString(),
    dryRun: config.dryRun,
    modelRoster: rosterBlock,
  };
  persist(record);

  if (config.dryRun) {
    record.status = "dry_run";
    record.finishedAt = new Date().toISOString();
    record.summary = [
      `DRY RUN implement for ${issue.identifier}`,
      "",
      "Would launch Cursor SDK cloud agent (agent mode, autoCreatePR: true).",
      `Implementer model: ${implementerModel.selection.id}`,
      "",
      "Model roster:",
      rosterBlock,
      "",
      "Would spawn security-reviewer + quality-reviewer on the diff before PRs.",
      "Human still merges; agents never push production.",
      "",
      `Expected Core PR: fix(${issue.identifier}): deep-link Reports to #revenue-summary`,
      "Preview: Vercel preview URL once GitHub integration is connected.",
    ].join("\n");
    record.prUrls = [
      "https://github.com/gloverthomas/liquid-accounting-core/pull/NEEDS_HUMAN",
      "https://github.com/gloverthomas/liquid-accounting-reporting/pull/NEEDS_HUMAN",
    ];
    return attachEval(record);
  }

  record.status = "running";
  persist(record);

  try {
    await using agent = await Agent.create({
      apiKey: config.cursorApiKey,
      name: `Liquid implement ${issue.identifier}`,
      model: implementerModel.selection,
      mode: "agent",
      agents: specialists.agents,
      cloud: {
        repos: [
          { url: config.coreRepoUrl, startingRef: config.repoStartingRef },
          { url: config.reportingRepoUrl, startingRef: config.repoStartingRef },
        ],
        autoCreatePR: true,
        metadata: {
          liquid_issue: issue.identifier,
          liquid_run: runId,
          workflow: "convergence-implement",
          model_implementer: implementerModel.selection.id,
        },
      },
    });

    record.agentId = agent.agentId;
    record.agentUrl = agentDeepLink(agent.agentId);
    persist(record);

    const prompt = isLiq16(issue)
      ? buildLiq16ImplementPrompt(issue, rosterBlock)
      : isLiq15(issue)
        ? buildLiq15ImplementPrompt(issue, rosterBlock)
        : buildImplementPrompt(issue, rosterBlock);
    const run = await agent.send(prompt);
    const streamed = await collectAssistantText(run.stream());
    const waited = await run.wait();
    const resultText =
      streamed ||
      (typeof waited === "object" && waited && "result" in waited
        ? String((waited as { result?: unknown }).result ?? "")
        : "");

    record.status = "completed";
    record.finishedAt = new Date().toISOString();
    record.summary =
      resultText || `Cloud agent ${agent.agentId} completed implement for ${issue.identifier}.`;
    const urls = extractUrls(record.summary);
    record.prUrls = urls.prUrls;
    record.previewUrls = urls.previewUrls;
    return attachEval(record);
  } catch (error) {
    record.status = "failed";
    record.finishedAt = new Date().toISOString();
    record.error = error instanceof Error ? error.message : String(error);
    return attachEval(record);
  }
}
