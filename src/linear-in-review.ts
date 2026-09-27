import { config } from "./config.js";
import {
  findIssueByIdentifierWithState,
  postLinearComment,
  resolveInReviewStateIdForIssue,
} from "./linear-client.js";
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
}> {
  const issue = await findIssueByIdentifierWithState(args.identifier.toUpperCase());
  if (!issue) {
    throw new Error(`Linear issue not found: ${args.identifier}`);
  }

  if (isInReviewState(issue.stateName)) {
    clearImplementSuppress(issue.identifier);
    return {
      success: true,
      issueId: issue.id,
      state: issue.stateName,
      alreadyInReview: true,
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

    return {
      success: true,
      issueId: issue.id,
      state: "In Review",
      linear: linearComment,
    };
  } catch (error) {
    clearImplementSuppress(issue.identifier);
    throw error;
  }
}
