import { config } from "./config.js";
import {
  findIssueByIdentifier,
  postLinearComment,
  resolveDoneStateIdForIssue,
} from "./linear-client.js";

async function linearGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY required to mark issues Done");
  }
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: config.linearApiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || `Linear HTTP ${response.status}`);
  }
  return json.data as T;
}

export async function markIssueDone(args: {
  identifier: string;
  prUrl?: string;
  repo?: string;
}): Promise<{ success: boolean; issueId: string; state: string; slack?: string; linear?: string }> {
  const issue = await findIssueByIdentifier(args.identifier.toUpperCase());
  if (!issue) {
    throw new Error(`Linear issue not found: ${args.identifier}`);
  }

  const doneStateId = await resolveDoneStateIdForIssue(issue.id);
  await linearGql(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }`,
    { id: issue.id, stateId: doneStateId },
  );

  const linearComment = await postLinearComment(
    issue.id,
    [
      "## Merged — moved to Done",
      "",
      args.prUrl ? `- PR: ${args.prUrl}` : "",
      args.repo ? `- Repo: \`${args.repo}\`` : "",
      "",
      "GitHub merge webhook closed this ticket. Humans already reviewed BugBot/CI/preview.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  let slack = "skipped";
  if (config.slackWebhookUrl) {
    const mention = config.slackMentionUserId ? `<@${config.slackMentionUserId}> ` : "";
    const linearUrl = issue.url ?? `https://linear.app/liquid-accounting/issue/${issue.identifier}`;
    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `${mention}${issue.identifier} marked Done after PR merge`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `Done · ${issue.identifier}`, emoji: true },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `${mention}*PR merged* — Linear moved to **Done**.`,
                args.prUrl ? `PR: ${args.prUrl}` : null,
                args.repo ? `Repo: \`${args.repo}\`` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Open Linear", emoji: true },
                url: linearUrl,
                style: "primary",
              },
              ...(args.prUrl
                ? [
                    {
                      type: "button",
                      text: { type: "plain_text", text: "Open PR", emoji: true },
                      url: args.prUrl,
                    },
                  ]
                : []),
            ],
          },
        ],
      }),
    });
    slack = response.ok ? "posted" : `failed:${response.status}`;
  }

  return { success: true, issueId: issue.id, state: "Done", slack, linear: linearComment };
}
