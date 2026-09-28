/*
  This file moves the ticket to In Review when GitHub says the PR is open, then posts Slack.
  If the ticket is already In Review, it stays there and Slack still posts. While that move is in flight, the Linear webhook does not start a second implement.
  Next: Slack says review BugBot, CI, and the preview, then humans merge. This file does not merge.
*/

import { config } from "./config.js";
import {
  findIssueByIdentifierWithState,
  postLinearComment,
  resolveInReviewStateIdForIssue,
} from "./linear-client.js";
import { notifyPrOpened } from "./notify.js";
import { armImplementSuppress, clearImplementSuppress } from "./ops.js";

async function linearGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY required to move issues to In Review");
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

function isInReviewState(stateName: string): boolean {
  return config.implementStates.includes(stateName.trim().toLowerCase());
}

async function postPrOpenedSlack(
  issue: { identifier: string; title: string; url?: string },
  args: { prUrl?: string; repo?: string },
): Promise<string> {
  try {
    return await notifyPrOpened({
      identifier: issue.identifier,
      title: issue.title,
      linearUrl: issue.url,
      prUrl: args.prUrl,
      repo: args.repo,
    });
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

/*
  Moves the ticket to In Review when GitHub says the PR is open, then posts Slack.
  If the ticket is already In Review, it stays there and Slack still posts.
  The Slack line is "PR is open" plus the human-merge cue. This function does not merge.
  While the move is in flight, implement from the Linear webhook is suppressed so the status change does not start a second implement.
*/
export async function markIssueInReview(args: {
  identifier: string;
  prUrl?: string;
  repo?: string;
}): Promise<{
  success: boolean;
  issueId: string;
  state: string;
  alreadyInReview?: boolean;
  linear?: string;
  slack?: string;
}> {
  const issue = await findIssueByIdentifierWithState(args.identifier.toUpperCase());
  if (!issue) {
    throw new Error(`Linear issue not found: ${args.identifier}`);
  }

  if (isInReviewState(issue.stateName)) {
    clearImplementSuppress(issue.identifier);
    const slack = await postPrOpenedSlack(issue, args);
    return {
      success: true,
      issueId: issue.id,
      state: issue.stateName,
      alreadyInReview: true,
      slack,
    };
  }

  armImplementSuppress(issue.identifier, "github_pr_open");
  try {
    const inReviewStateId = await resolveInReviewStateIdForIssue(issue.id);
    await linearGql(
      `mutation($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) { success }
      }`,
      { id: issue.id, stateId: inReviewStateId },
    );

    const linearComment = await postLinearComment(
      issue.id,
      [
        "## PR opened — moved to In Review",
        "",
        args.prUrl ? `- PR: ${args.prUrl}` : "",
        args.repo ? `- Repo: \`${args.repo}\`` : "",
        "",
        "GitHub pull_request opened webhook synced this ticket. Merge still moves to **Done** (human click).",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    const slack = await postPrOpenedSlack(issue, args);
    return {
      success: true,
      issueId: issue.id,
      state: "In Review",
      linear: linearComment,
      slack,
    };
  } catch (error) {
    clearImplementSuppress(issue.identifier);
    throw error;
  }
}
