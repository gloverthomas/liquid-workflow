import { config } from "./config.js";
import type { PlanRunRecord } from "./sdk-planner.js";
import type { TriggerIssue } from "./prompts/liq-9.js";

/** Curated Linear issue UUIDs — signal comments here; we do not auto-spam new tickets. */
export const LINEAR_ISSUE_UUID: Record<string, string> = {
  "LIQ-9": "40e7bf03-44bb-4fa0-9226-b3054041a43f",
  "LIQ-15": "a6199abd-5052-4cce-bfa7-93c73a086094",
  "LIQ-16": "7d93e202-e7ee-4e14-8356-c4c6909d8ae9",
};

export async function notifySignalReceived(args: {
  issue: TriggerIssue;
  source?: string;
  hash?: string;
}): Promise<{ slack?: string; linear?: string }> {
  const results: { slack?: string; linear?: string } = {};
  const linearId = LINEAR_ISSUE_UUID[args.issue.identifier.toUpperCase()];

  if (config.slackWebhookUrl) {
    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: [
          `*Liquid product signal* — ${args.issue.identifier}`,
          args.issue.title,
          args.source ? `Source: \`${args.source}\`` : "",
          args.hash ? `Seam: \`${args.hash}\`` : "",
          "",
          "Sentry/PostHog caught a shell-parity miss. Starting Cursor SDK plan (human write-gate still applies).",
          args.issue.url ? `Linear: ${args.issue.url}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    });
    results.slack = response.ok ? "posted" : `failed:${response.status}`;
  }

  if (config.linearApiKey && linearId) {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.linearApiKey,
      },
      body: JSON.stringify({
        query: `
          mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) { success comment { id url } }
          }
        `,
        variables: {
          input: {
            issueId: linearId,
            body: [
              "## Product signal received",
              "",
              `- Source: \`${args.source ?? "unknown"}\``,
              args.hash ? `- Seam: \`${args.hash}\`` : "",
              "",
              "Workflow is starting the Cursor SDK plan. Awaiting human approval before `/implement`.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      }),
    });
    results.linear = response.ok ? "posted" : `failed:${response.status}`;
  }

  return results;
}

export async function notifyPlanComplete(record: PlanRunRecord): Promise<{ slack?: string; linear?: string }> {
  const results: { slack?: string; linear?: string } = {};
  const summaryPreview = (record.summary ?? record.error ?? "").slice(0, 2800);
  const kindLabel = record.kind === "implement" ? "implement" : "plan";
  const prBlock =
    record.prUrls && record.prUrls.length > 0
      ? ["", "*Pull requests*", ...record.prUrls.map((u) => `• ${u}`)].join("\n")
      : "";
  const previewBlock =
    record.previewUrls && record.previewUrls.length > 0
      ? ["", "*Preview sandboxes*", ...record.previewUrls.map((u) => `• ${u}`)].join("\n")
      : "";
  const agentBlock = record.agentUrl
    ? `\nAgent: ${record.agentUrl}`
    : record.agentId
      ? `\nAgent: \`${record.agentId}\``
      : "\nAgent: (dry-run)";
  const linearId =
    LINEAR_ISSUE_UUID[record.issue.identifier.toUpperCase()] ??
    (record.issue.id && record.issue.id !== "manual" && record.issue.id !== "signal"
      ? record.issue.id
      : undefined);

  if (config.slackWebhookUrl) {
    const body = {
      text: [
        `*Liquid SDK ${kindLabel} ${record.status}* — ${record.issue.identifier}`,
        record.issue.title,
        agentBlock.trim(),
        `Run: \`${record.runId}\``,
        prBlock,
        previewBlock,
        "",
        "```",
        summaryPreview || "(no summary)",
        "```",
        "",
        record.kind === "implement"
          ? "Human write-gate: review PR + BugBot/CI + preview, then merge. Agents never push prod."
          : "Human write-gate: review plan, then POST /implement (or approve in chat) before PR.",
      ]
        .filter((line) => line !== undefined)
        .join("\n"),
    };
    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    results.slack = response.ok ? "posted" : `failed:${response.status}`;
  }

  if (config.linearApiKey && linearId) {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.linearApiKey,
      },
      body: JSON.stringify({
        query: `
          mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) {
              success
              comment { id url }
            }
          }
        `,
        variables: {
          input: {
            issueId: linearId,
            body: [
              `## Cursor SDK ${kindLabel} (${record.status})`,
              "",
              record.agentUrl
                ? `- Agent: ${record.agentUrl}`
                : record.agentId
                  ? `- Agent: \`${record.agentId}\``
                  : "- Agent: dry-run",
              `- Workflow run: \`${record.runId}\``,
              record.artifactPath ? `- Artifact: \`${record.artifactPath}\`` : "",
              ...(record.prUrls?.length ? ["", "### PRs", ...record.prUrls.map((u) => `- ${u}`)] : []),
              ...(record.previewUrls?.length
                ? ["", "### Previews", ...record.previewUrls.map((u) => `- ${u}`)]
                : []),
              "",
              "```",
              summaryPreview || "(no summary)",
              "```",
              "",
              record.kind === "implement"
                ? "Await human merge after BugBot + CI. Do not treat Slack ack as auto-deploy."
                : "Await human approval before `/implement`.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      }),
    });
    results.linear = response.ok ? "posted" : `failed:${response.status}`;
  }

  return results;
}
