import { config } from "./config.js";

const LIQ_TEAM_ID = "5389dda4-1725-4096-9ecb-a24a378b28c6";
const PARITY_PROJECT_ID = "555e1574-8669-4119-94c5-f3584b2d9aaa";
const DEFAULT_TODO_STATE_ID = "84569319-0517-4fd2-b04f-81c02d0f7192";

export type LinearIssueRef = {
  id: string;
  identifier: string;
  title: string;
  url?: string;
  description?: string;
};

async function linearGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY required");
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

function parseIdentifier(identifier: string): { teamId: string; number: number } | null {
  const match = /^([A-Z]+)-(\d+)$/i.exec(identifier.trim());
  if (!match) return null;
  return { teamId: LIQ_TEAM_ID, number: Number.parseInt(match[2]!, 10) };
}

export async function findIssueByIdentifier(identifier: string): Promise<LinearIssueRef | null> {
  const parsed = parseIdentifier(identifier);
  if (!parsed) return null;

  const data = await linearGql<{
    issues: { nodes: Array<{ id: string; identifier: string; title: string; url: string; description?: string }> };
  }>(
    `query($teamId: ID!, $number: Float!) {
      issues(
        filter: { team: { id: { eq: $teamId } }, number: { eq: $number } }
        first: 1
      ) {
        nodes { id identifier title url description }
      }
    }`,
    { teamId: parsed.teamId, number: parsed.number },
  );

  const node = data.issues.nodes[0];
  return node ?? null;
}

export async function createProductSignalIssue(args: {
  title: string;
  source?: string;
  hash?: string;
  reportingUrl?: string;
}): Promise<LinearIssueRef> {
  const todoStateId = (process.env.LINEAR_TODO_STATE_ID ?? DEFAULT_TODO_STATE_ID).trim();
  const title = args.title.trim() || "Product signal triage";
  const description = [
    "## Product signal received",
    "",
    "This ticket was opened from a **product signal** in the Liquid apps.",
    "",
    args.source ? `- Source: \`${args.source}\`` : null,
    args.hash ? `- Seam: \`${args.hash}\`` : null,
    args.reportingUrl ? `- URL: ${args.reportingUrl}` : null,
    "",
    "Assigned for triage (**Todo**). Move to **In Progress** to start the Cursor SDK plan.",
  ]
    .filter(Boolean)
    .join("\n");

  const data = await linearGql<{
    issueCreate: {
      success: boolean;
      issue: { id: string; identifier: string; title: string; url: string; description?: string };
    };
  }>(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url description }
      }
    }`,
    {
      input: {
        teamId: LIQ_TEAM_ID,
        projectId: PARITY_PROJECT_ID,
        stateId: todoStateId,
        title,
        description,
        ...(config.linearAssigneeId ? { assigneeId: config.linearAssigneeId } : {}),
      },
    },
  );

  const issue = data.issueCreate?.issue;
  if (!data.issueCreate?.success || !issue) {
    throw new Error("linear_issue_create_failed");
  }
  return issue;
}

export async function resolveDoneStateIdForIssue(issueUuid: string): Promise<string> {
  if (config.linearDoneStateId) return config.linearDoneStateId;

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
    { id: issueUuid },
  );

  const done =
    data.issue.team.states.nodes.find((s) => s.type === "completed" && s.name.toLowerCase() === "done") ??
    data.issue.team.states.nodes.find((s) => s.type === "completed");
  if (!done) throw new Error("No completed/Done workflow state found on Linear team");
  return done.id;
}

export async function postLinearComment(issueUuid: string, body: string): Promise<string> {
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
          commentCreate(input: $input) { success }
        }
      `,
      variables: { input: { issueId: issueUuid, body } },
    }),
  });
  return response.ok ? "posted" : `failed:${response.status}`;
}
