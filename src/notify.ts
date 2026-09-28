/*
  This file posts to Slack and Linear. Slack does not merge, and it does not start the plan.
  A product signal posts that the Todo ticket exists. The plan brief offers Approve implement only after a green eval. A failed plan says re-plan and does not offer that button. When a PR opens, Slack says the ticket is In Review.
  Next: a person moves the ticket to In Progress, and that starts the plan. Approve unlocks implement. In Review opens PRs. Humans merge after BugBot, CI, and the preview.
*/

import { config } from "./config.js";
import type { PlanRunRecord } from "./sdk-planner.js";
import type { TriggerIssue } from "./prompts/liq-9.js";
import { formatEvalChecklistMarkdown, formatEvalChecklistSlack } from "./eval/harness.js";
import {
  buildBugbotSlackActionElements,
  sanitizeBugbotBodyForSlack,
  type BugbotReviewNotification,
} from "./bugbot-links.js";
import { scrubPii } from "./pii.js";
import { latestValidApproval } from "./write-gate.js";

/** Curated Linear issue UUIDs — signal comments here; we do not auto-spam new tickets. */
export const LINEAR_ISSUE_UUID: Record<string, string> = {
  "LIQ-9": "40e7bf03-44bb-4fa0-9226-b3054041a43f",
  "LIQ-15": "a6199abd-5052-4cce-bfa7-93c73a086094",
  "LIQ-16": "7d93e202-e7ee-4e14-8356-c4c6909d8ae9",
  "LIQ-17": "13058e52-b25d-46fe-a1d8-8587667350ec",
  "LIQ-24": "eff0aee0-f93d-4ecf-9548-6f1ea5a4ea3f",
  "LIQ-38": "7783c923-1945-400c-9317-c5f8081ed3e1",
};

function issueLinearUrl(issue: TriggerIssue): string | undefined {
  if (issue.url) return issue.url;
  const id = LINEAR_ISSUE_UUID[issue.identifier.toUpperCase()];
  return id ? `https://linear.app/liquid-accounting/issue/${issue.identifier}` : undefined;
}

/** Turn agent stream dumps into a short Slack-readable blurb. */
export function summarizeForSlack(raw: string | undefined, maxChars = 520): string {
  if (!raw?.trim()) return "No plan summary captured — open the agent link for the full write-up.";
  const cleaned = scrubPii(raw)
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

/*
  Approve implement is offered only for a plan that did not fail, when the eval did not fail, formal approval is still required, and no approval is on file.
  A failed plan, a failed eval, an implement run, or an approval already on file does not get the button.
*/
export function shouldOfferApproveImplement(args: {
  kind: string;
  status: string;
  evalPassed?: boolean;
  requireFormalApproval: boolean;
  hasApproval: boolean;
}): boolean {
  return (
    args.kind === "plan" &&
    args.status !== "failed" &&
    args.evalPassed !== false &&
    args.requireFormalApproval &&
    !args.hasApproval
  );
}

/** Linear comment follows the same gate as the Slack Approve button. */
export function linearPlanGuidance(args: {
  kind: string;
  status: string;
  evalPassed?: boolean;
  requireFormalApproval: boolean;
  hasApproval: boolean;
}): { writeGateLine: string; closing: string } {
  if (args.kind === "implement") {
    return {
      writeGateLine: "",
      closing: "Await human merge after BugBot + CI. Slack is attention, not auto-deploy.",
    };
  }
  if (args.evalPassed === false) {
    return {
      writeGateLine:
        "- Next: re-plan. Move back to **In Progress**. Do not use **Approve implement** on this run.",
      closing: "Eval failed. Re-plan from **In Progress**. Do not approve implement from this run.",
    };
  }
  if (shouldOfferApproveImplement(args)) {
    return {
      writeGateLine:
        "- Formal write-gate: comment `/approve` (or Slack **Approve implement**), then move to **In Review**",
      closing:
        "Await formal approval before implement / PR. Prefer reviewing the agent link over this comment.",
    };
  }
  return {
    writeGateLine: "",
    closing:
      "Await formal approval before implement / PR. Prefer reviewing the agent link over this comment.",
  };
}

export type PrOpenedNotice = {
  identifier: string;
  title?: string;
  linearUrl?: string;
  prUrl?: string;
  repo?: string;
  mention?: string;
};

/*
  Slack text when a PR opens: "PR is open", Linear is In Review, then the human-merge cue.
  The cue says check BugBot, CI, and the preview, then you merge. This message does not merge.
*/
export function buildPrOpenedSlackPayload(args: PrOpenedNotice): Record<string, unknown> {
  const mention = args.mention ?? "";
  const lines = [
    `${mention}*PR is open* — Linear is *In Review*.`,
    args.title ? `*${args.title}*` : null,
    args.prUrl ? `PR: ${args.prUrl}` : null,
    args.repo ? `Repo: \`${args.repo}\`` : null,
    "",
    "*Next:* open the PR, check BugBot, CI, and the preview, then you merge. That merge moves Linear to *Done*.",
  ].filter((line) => line !== null);

  const elements: Array<Record<string, unknown>> = [];
  if (args.prUrl) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Open PR", emoji: true },
      url: args.prUrl,
      style: "primary",
    });
  }
  if (args.linearUrl) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Open Linear", emoji: true },
      url: args.linearUrl,
    });
  }

  return {
    text: `${mention}PR open — review ${args.identifier}, then you merge`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Review PR · ${args.identifier}`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") },
      },
      ...(elements.length ? [{ type: "actions", elements }] : []),
    ],
  };
}

export async function notifyPrOpened(args: Omit<PrOpenedNotice, "mention">): Promise<string> {
  return postSlack(buildPrOpenedSlackPayload({ ...args, mention: slackMention() }));
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

export async function notifyBugbotReview(
  args: BugbotReviewNotification,
): Promise<{ slack?: string }> {
  const results: { slack?: string } = {};
  if (!config.slackWebhookUrl) return results;

  const mention = slackMention();
  const blurb = scrubPii(sanitizeBugbotBodyForSlack(args.body));
  const actionElements = buildBugbotSlackActionElements({
    body: args.body,
    prUrl: args.prUrl,
  });

  results.slack = await postSlack({
    text: `${mention}Bugbot review — ${args.prTitle}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Bugbot · ${args.prTitle}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [mention ? mention.trim() : null, blurb || "_No review text_"].filter(Boolean).join("\n"),
        },
      },
      ...(actionElements.length ? [{ type: "actions", elements: actionElements }] : []),
    ],
  });

  return results;
}

/*
  Posts when a product signal has created the Todo ticket.
  Runs only if Slack or Linear credentials are set; otherwise that side is skipped.
  Does not start the plan. Next line in the message is Linear to In Progress.
*/
export async function notifySignalReceived(args: {
  issue: TriggerIssue;
  source?: string;
  hash?: string;
}): Promise<{ slack?: string; linear?: string }> {
  const results: { slack?: string; linear?: string } = {};
  const linearId =
    args.issue.id && args.issue.id !== "manual" && args.issue.id !== "signal"
      ? args.issue.id
      : LINEAR_ISSUE_UUID[args.issue.identifier.toUpperCase()];
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

/*
  Posts the plan or implement brief to Slack and as a Linear comment.
  A plan brief includes the short summary and the eval result.
  Approve implement is added only after a green eval, and only when Approve is still required.
  A failed plan says re-plan from In Progress and does not offer Approve implement.
  An implement brief says you merge after BugBot, CI, and the preview. Slack does not merge.
*/
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
  const evalChecklistMd = formatEvalChecklistMarkdown(record.eval);
  const evalChecklistSlack = formatEvalChecklistSlack(record.eval);
  const publicBase = config.publicTunnelUrl || `http://127.0.0.1:${config.port}`;
  const evalsPage = `${publicBase}/evals`;
  const statusPage = `${publicBase}/status`;
  const linearId =
    LINEAR_ISSUE_UUID[record.issue.identifier.toUpperCase()] ??
    (record.issue.id && record.issue.id !== "manual" && record.issue.id !== "signal"
      ? record.issue.id
      : undefined);
  const linearUrl = issueLinearUrl(record.issue);
  const mention = slackMention();

  const approval = latestValidApproval(record.issue.identifier);
  const approveBase = `${publicBase}/approve`;
  const approveUrl = new URL(approveBase);
  approveUrl.searchParams.set("issue", record.issue.identifier.toUpperCase());
  if (config.approveToken) approveUrl.searchParams.set("token", config.approveToken);

  const nextStep =
    record.kind === "implement"
      ? "*Next:* review PR + BugBot/CI + preview, then *you* merge. Agents never push prod."
      : evalPassed === false
        ? "*Next:* open the agent plan, fix gaps, then Linear → *In Progress* again to re-plan."
        : config.requireFormalApproval
          ? approval
            ? `*Next:* formal approval recorded (\`${approval.approvalId}\`). Linear → *In Review* to implement.`
            : `*Next:* click *Approve implement* (or Linear comment \`/approve\`), then Linear → *In Review*.`
          : "*Next:* review the plan. When happy, Linear → *In Review* to start implement/PR.";

  const actionElements: Array<Record<string, unknown>> = [];
  if (record.agentUrl) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Review agent plan", emoji: true },
      url: record.agentUrl,
      style: "primary",
    });
  }
  if (
    shouldOfferApproveImplement({
      kind: record.kind,
      status: record.status,
      evalPassed,
      requireFormalApproval: config.requireFormalApproval,
      hasApproval: Boolean(approval),
    })
  ) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Approve implement", emoji: true },
      url: approveUrl.toString(),
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
  actionElements.push({
    type: "button",
    text: { type: "plain_text", text: "Open evals", emoji: true },
    url: evalsPage,
  });
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
            text: [
              `${mention}*${record.issue.title}*`,
              evalLine,
              "",
              blurb,
              evalChecklistSlack ? `\n${evalChecklistSlack}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
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
              text: [
                `Run \`${record.runId}\``,
                `Evals: ${evalsPage}`,
                `Status: ${statusPage}`,
                nextStep,
              ].join("\n"),
            },
          ],
        },
      ],
    });
  }

  const linearGuidance = linearPlanGuidance({
    kind: record.kind,
    status: record.status,
    evalPassed,
    requireFormalApproval: config.requireFormalApproval,
    hasApproval: Boolean(approval),
  });

  if (linearId) {
    results.linear = await linearComment(
      linearId,
      scrubPii(
        [
          `## Cursor SDK ${kindLabel.toLowerCase()} (${record.status})`,
          "",
          record.agentUrl ? `- Agent: ${record.agentUrl}` : record.agentId ? `- Agent: \`${record.agentId}\`` : "- Agent: dry-run",
          `- Workflow run: \`${record.runId}\``,
          evalLine ? `- ${evalLine.replace(/\*/g, "**")}` : "",
          `- Eval dashboard: ${evalsPage}`,
          `- Workflow status: ${statusPage}`,
          linearGuidance.writeGateLine,
          ...(record.prUrls?.length ? ["", "### PRs", ...record.prUrls.map((u) => `- ${u}`)] : []),
          ...(record.previewUrls?.length ? ["", "### Previews", ...record.previewUrls.map((u) => `- ${u}`)] : []),
          "",
          "### Summary",
          blurb,
          evalChecklistMd ? ["", evalChecklistMd].join("\n") : "",
          "",
          linearGuidance.closing,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }

  return results;
}
