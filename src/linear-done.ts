import { config } from "./config.js";
import { LINEAR_ISSUE_UUID } from "./notify.js";

const DONE_STATE_CACHE = new Map<string, string>();

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

async function resolveDoneStateId(issueId: string): Promise<string> {
  if (config.linearDoneStateId) return config.linearDoneStateId;
  const cached = DONE_STATE_CACHE.get(issueId);
  if (cached) return cached;

  const data = await linearGql<{
    issue: { team: { states: { nodes: Array<{ id: string; name: string; type: string }> } } };
  }>(
    `query($id: String!) {
      issue(id: $id) {
        team {
          states { nodes { id name type } }
        }
      }
    }`,
    { id: issueId },
  );

  const done =
    data.issue.team.states.nodes.find((s) => s.type === "completed" && s.name.toLowerCase() === "done") ??
    data.issue.team.states.nodes.find((s) => s.type === "completed");
  if (!done) throw new Error("No completed/Done workflow state found on Linear team");
  DONE_STATE_CACHE.set(issueId, done.id);
  return done.id;
}

export async function markIssueDone(args: {
  identifier: string;
  prUrl?: string;
  repo?: string;
}): Promise<{ success: boolean; issueId: string; state: string; slack?: string; linear?: string }> {
  const issueId = LINEAR_ISSUE_UUID[args.identifier.toUpperCase()];
  if (!issueId) {
    throw new Error(`No curated Linear UUID for ${args.identifier}`);
  }

  const doneStateId = await resolveDoneStateId(issueId);
  await linearGql(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }`,
    { id: issueId, stateId: doneStateId },
  );

  let linearComment = "skipped";
  if (config.linearApiKey) {
    const body = [
      "## Merged — moved to Done",
      "",
      args.prUrl ? `- PR: ${args.prUrl}` : "",
      args.repo ? `- Repo: \`${args.repo}\`` : "",
      "",
      "GitHub merge webhook closed this hero ticket. Humans already reviewed BugBot/CI/preview.",
    ]
      .filter(Boolean)
      .join("\n");
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.linearApiKey,
      },
      body: JSON.stringify({
        query: `
          mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) { success }
          }
        `,
        variables: { input: { issueId, body } },
      }),
    });
    linearComment = response.ok ? "posted" : `failed:${response.status}`;
  }

  let slack = "skipped";
  if (config.slackWebhookUrl) {
    const mention = config.slackMentionUserId ? `<@${config.slackMentionUserId}> ` : "";
    const linearUrl = `https://linear.app/liquid-accounting/issue/${args.identifier}`;
    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `${mention}${args.identifier} marked Done after PR merge`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `Done · ${args.identifier}`, emoji: true },
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

  return { success: true, issueId, state: "Done", slack, linear: linearComment };
}
