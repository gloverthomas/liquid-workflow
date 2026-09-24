import { config } from "./config.js";
import type { PlanRunRecord } from "./sdk-planner.js";
import type { TriggerIssue } from "./prompts/liq-9.js";

/** Curated Linear issue UUIDs — signal comments here; we do not auto-spam new tickets. */
export const LINEAR_ISSUE_UUID: Record<string, string> = {
  "LIQ-9": "40e7bf03-44bb-4fa0-9226-b3054041a43f",
  "LIQ-15": "a6199abd-5052-4cce-bfa7-93c73a086094",
  "LIQ-16": "7d93e202-e7ee-4e14-8356-c4c6909d8ae9",
  "LIQ-17": "13058e52-b25d-46fe-a1d8-8587667350ec",
};

function issueLinearUrl(issue: TriggerIssue): string | undefined {
  if (issue.url) return issue.url;
  const id = LINEAR_ISSUE_UUID[issue.identifier.toUpperCase()];
  return id ? `https://linear.app/liquid-accounting/issue/${issue.identifier}` : undefined;
}

/** Turn agent stream dumps into a short Slack-readable blurb. */
export function summarizeForSlack(raw: string | undefined, maxChars = 520): string {
  if (!raw?.trim()) return "No plan summary captured — open the agent link for the full write-up.";
  const cleaned = raw
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Prefer denser paragraphs over single-token line wraps from the stream.
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rejoined: string[] = [];
  for (const line of lines) {
    const prev = rejoined[rejoined.length - 1];
    // Stitch agent stream wraps like "V" + "ITE_WORKFLOW..." or "final" + "izing".
    if (
      prev &&
      ((prev.length <= 4 && !/[.!?]$/.test(prev)) ||
        (/[A-Za-z0-9_`/-]$/.test(prev) && /^[a-z0-9_`-]/.test(line) && line.length < 40))
    ) {
      rejoined[rejoined.length - 1] = `${prev}${line}`;
    } else {
      rejoined.push(line);
    }
  }

  const collapsed = rejoined.join(" ").replace(/\s+/g, " ").replace(/`\s+/g, "`").replace(/\s+`/g, "`");

  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(" — "));
  return `${(lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim()}…`;
}

function slackMention(): string {
  const id = config.slackMentionUserId?.trim();
  return id ? `<@${id}> ` : "";
}

async function postSlack(payload: Record<string, unknown>): Promise<string> {
  if (!config.slackWebhookUrl) return "skipped";
  const response = await fetch(config.slackWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.ok ? "posted" : `failed:${response.status}`;
}

async function linearComment(issueId: string, body: string): Promise<string> {
  if (!config.linearApiKey) return "skipped";
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
      variables: { input: { issueId, body } },
    }),
  });
  return response.ok ? "posted" : `failed:${response.status}`;
}

async function ensureAssignee(issueId: string): Promise<void> {
  if (!config.linearApiKey || !config.linearAssigneeId) return;
  const todoStateId = process.env.LINEAR_TODO_STATE_ID?.trim() || "84569319-0517-4fd2-b04f-81c02d0f7192";
  await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: config.linearApiKey,
    },
    body: JSON.stringify({
      query: `
        mutation IssueTriage($id: String!, $assigneeId: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { assigneeId: $assigneeId, stateId: $stateId }) { success }
        }
      `,
      variables: {
        id: issueId,
        assigneeId: config.linearAssigneeId,
        stateId: todoStateId,
      },
    }),
  });
}

export async function notifySignalReceived(args: {
  issue: TriggerIssue;
  source?: string;
  hash?: string;
}): Promise<{ slack?: string; linear?: string }> {
  const results: { slack?: string; linear?: string } = {};
  const linearId = LINEAR_ISSUE_UUID[args.issue.identifier.toUpperCase()];
  const linearUrl = issueLinearUrl(args.issue);
  const mention = slackMention();

  if (config.slackWebhookUrl) {
    results.slack = await postSlack({
      text: `${mention}Product signal on ${args.issue.identifier} — triage in Linear`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Signal · ${args.issue.identifier}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `${mention}*${args.issue.title}*`,
              args.source ? `Source: \`${args.source}\`` : null,
              args.hash ? `Seam: \`${args.hash}\`` : null,
              "",
              "Sentry/PostHog caught a shell-parity miss. Ticket is assigned (**Todo**) for triage.",
              "*Next:* Linear → *In Progress* (plan) → review → *In Review* (implement/PR) → you merge → *Done*.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
        ...(linearUrl
          ? [
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Open in Linear", emoji: true },
                    url: linearUrl,
                    style: "primary",
                  },
                ],
              },
            ]
          : []),
      ],
    });
  }

  if (linearId) {
    await ensureAssignee(linearId);
    results.linear = await linearComment(
      linearId,
      [
        "## Product signal received",
        "",
        `- Source: \`${args.source ?? "unknown"}\``,
        args.hash ? `- Seam: \`${args.hash}\`` : "",
        "",
        "Assigned for triage (**Todo**). Move this issue to **In Progress** to start the Cursor SDK plan.",
        "After the plan, move to **In Review** to approve implement / PRs.",
        "Do not treat this comment as approval to open a PR.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return results;
}

export async function notifyPlanComplete(record: PlanRunRecord): Promise<{ slack?: string; linear?: string }> {
  const results: { slack?: string; linear?: string } = {};
  const kindLabel = record.kind === "implement" ? "Implement" : "Plan";
  const blurb = summarizeForSlack(record.summary ?? record.error);
  const evalPassed = record.eval?.passed;
  const evalLine =
    record.kind === "plan" && typeof evalPassed === "boolean"
      ? evalPassed
        ? "Eval gate: *passed*"
        : "Eval gate: *failed* — re-run plan before implement"
      : null;
  const linearId =
    LINEAR_ISSUE_UUID[record.issue.identifier.toUpperCase()] ??
    (record.issue.id && record.issue.id !== "manual" && record.issue.id !== "signal"
      ? record.issue.id
      : undefined);
  const linearUrl = issueLinearUrl(record.issue);
  const mention = slackMention();

  const nextStep =
    record.kind === "implement"
      ? "*Next:* review PR + BugBot/CI + preview, then *you* merge. Agents never push prod."
      : evalPassed === false
        ? "*Next:* open the agent plan, fix gaps, then Linear → *In Progress* again to re-plan."
        : "*Next:* review the plan. When happy, Linear → *In Review* to start implement/PR (or say *implement* in the agent chat).";

  const actionElements: Array<Record<string, unknown>> = [];
  if (record.agentUrl) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Review agent plan", emoji: true },
      url: record.agentUrl,
      style: "primary",
    });
  }
  if (linearUrl) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Open Linear", emoji: true },
      url: linearUrl,
    });
  }
  for (const pr of record.prUrls ?? []) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Open PR", emoji: true },
      url: pr,
    });
  }
  for (const preview of record.previewUrls ?? []) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Open preview", emoji: true },
      url: preview,
    });
  }

  if (config.slackWebhookUrl) {
    results.slack = await postSlack({
      text: `${mention}${kindLabel} ${record.status} — ${record.issue.identifier}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${kindLabel} ${record.status} · ${record.issue.identifier}`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [`${mention}*${record.issue.title}*`, evalLine, "", blurb].filter(Boolean).join("\n"),
          },
        },
        ...(actionElements.length
          ? [{ type: "actions", elements: actionElements.slice(0, 5) }]
          : []),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: [`Run \`${record.runId}\``, nextStep].join("\n"),
            },
          ],
        },
      ],
    });
  }

  if (linearId) {
    results.linear = await linearComment(
      linearId,
      [
        `## Cursor SDK ${kindLabel.toLowerCase()} (${record.status})`,
        "",
        record.agentUrl ? `- Agent: ${record.agentUrl}` : record.agentId ? `- Agent: \`${record.agentId}\`` : "- Agent: dry-run",
        `- Workflow run: \`${record.runId}\``,
        evalLine ? `- ${evalLine.replace(/\*/g, "**")}` : "",
        ...(record.prUrls?.length ? ["", "### PRs", ...record.prUrls.map((u) => `- ${u}`)] : []),
        ...(record.previewUrls?.length ? ["", "### Previews", ...record.previewUrls.map((u) => `- ${u}`)] : []),
        "",
        "### Summary",
        blurb,
        "",
        record.kind === "implement"
          ? "Await human merge after BugBot + CI. Slack is attention, not auto-deploy."
          : "Await human approval before implement / PR. Prefer reviewing the agent link over this comment.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return results;
}
