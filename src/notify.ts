import { config } from "./config.js";
import type { PlanRunRecord } from "./sdk-planner.js";

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
  const agentBlock = record.agentUrl ? `\nAgent: ${record.agentUrl}` : record.agentId ? `\nAgent: \`${record.agentId}\`` : "\nAgent: (dry-run)";

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

  if (config.linearApiKey && record.issue.id && record.issue.id !== "manual") {
    const mutation = `
      mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment { id url }
        }
      }
    `;
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.linearApiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            issueId: record.issue.id,
            body: [
              `## Cursor SDK ${kindLabel} (${record.status})`,
              "",
              record.agentUrl ? `- Agent: ${record.agentUrl}` : record.agentId ? `- Agent: \`${record.agentId}\`` : "- Agent: dry-run",
              `- Workflow run: \`${record.runId}\``,
              record.artifactPath ? `- Artifact: \`${record.artifactPath}\`` : "",
              ...(record.prUrls?.length ? ["", "### PRs", ...record.prUrls.map((u) => `- ${u}`)] : []),
              ...(record.previewUrls?.length ? ["", "### Previews", ...record.previewUrls.map((u) => `- ${u}`)] : []),
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
