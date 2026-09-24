/**
 * Permanent human write-gate — always injected into SDK prompts.
 * Reviewers / demos should never need to restate this in chat.
 */
export const HUMAN_WRITE_GATE = `
## Human write-gate (non-negotiable)
- Open pull requests only (\`autoCreatePR\` / branch + PR).
- Do NOT merge to \`main\`.
- Do NOT deploy to production or promote previews to prod.
- Do NOT push directly to protected branches.
- Do NOT treat Slack/Linear comments as deploy approval.
- Humans merge after BugBot + CI + preview review; humans ship prod.
`.trim();

/** Visual proof required on UI PRs — manual, Playwright CI, and agent. */
export const VISUAL_PROOF_GATE = `
## Visual proof (required for UI fixes)
1. Capture before/after screenshots of the fixed UI path.
2. Commit PNGs under \`docs/pr-proof/\` (e.g. \`liq-16-reporting-help-open.png\`).
3. Embed them in the PR description Screenshots table (see \`.github/pull_request_template.md\`).
4. Ensure Playwright proof tests write to \`e2e/proof/\` so CI uploads the \`help-*-proof\` artifact.
5. Include the Vercel preview URL in the PR body.
`.trim();

export const PLAN_THEN_GATE = `
## After planning
End with: "Await approval before implementing."
If later approved to implement, ${HUMAN_WRITE_GATE.split("\n").slice(1).join("\n")}
${VISUAL_PROOF_GATE}
`.trim();
