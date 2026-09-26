import { config } from "./config.js";
import { log } from "./ops.js";

export type CiCheckResult = {
  ok: boolean;
  repos: Array<{
    repo: string;
    ok: boolean;
    conclusion?: string;
    htmlUrl?: string;
    detail: string;
  }>;
};

function githubToken(): string {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    ""
  );
}

/**
 * Require the latest completed CI workflow on main to be success for each merge repo.
 * Skips (ok:true with note) when no token and CI_GATE soft mode — or fails when CI_GATE=strict.
 */
export async function checkMainCiGreen(
  repos: string[] = config.githubMergeRepos,
): Promise<CiCheckResult> {
  const token = githubToken();
  if (!token) {
    const soft = !config.ciGateStrict;
    log("warn", "ci_gate_no_token", { soft });
    return {
      ok: soft,
      repos: repos.map((repo) => ({
        repo,
        ok: soft,
        detail: soft
          ? "GITHUB_TOKEN missing — CI gate soft-skipped"
          : "GITHUB_TOKEN required for CI_GATE_STRICT",
      })),
    };
  }

  const results: CiCheckResult["repos"] = [];
  for (const repo of repos) {
    const [owner, name] = repo.split("/");
    if (!owner || !name) {
      results.push({ repo, ok: false, detail: "invalid repo slug" });
      continue;
    }
    try {
      const url = `https://api.github.com/repos/${owner}/${name}/actions/runs?branch=main&per_page=5&status=completed`;
      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "liquid-workflow",
        },
      });
      if (!res.ok) {
        results.push({ repo, ok: false, detail: `GitHub HTTP ${res.status}` });
        continue;
      }
      const json = (await res.json()) as {
        workflow_runs?: Array<{
          name?: string;
          conclusion?: string;
          html_url?: string;
          head_branch?: string;
        }>;
      };
      const runs = json.workflow_runs ?? [];
      const ci = runs.find((r) => (r.name ?? "").toLowerCase() === "ci") ?? runs[0];
      if (!ci) {
        results.push({ repo, ok: false, detail: "no completed workflow runs on main" });
        continue;
      }
      const ok = ci.conclusion === "success";
      results.push({
        repo,
        ok,
        conclusion: ci.conclusion,
        htmlUrl: ci.html_url,
        detail: ok ? `CI green on main (${ci.name})` : `CI ${ci.conclusion} on main (${ci.name})`,
      });
    } catch (error) {
      results.push({
        repo,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok: results.every((r) => r.ok), repos: results };
}

export function formatCiGateError(result: CiCheckResult): string {
  const lines = result.repos.map((r) => `- ${r.repo}: ${r.detail}${r.htmlUrl ? ` (${r.htmlUrl})` : ""}`);
  return `CI_GATE: main must be green before implement.\n${lines.join("\n")}`;
}
