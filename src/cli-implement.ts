#!/usr/bin/env node
/**
 * Human write-gate helper: after plan review, implement + open PRs.
 *
 *   npm run implement
 */

const base = process.env.WORKFLOW_URL ?? "http://127.0.0.1:4100";

async function main() {
  const response = await fetch(`${base}/implement`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "40e7bf03-44bb-4fa0-9226-b3054041a43f",
      identifier: "LIQ-9",
      title: "[Hero] Core still deep-links to renamed Sales summary report path",
      url: "https://linear.app/liquid-accounting/issue/LIQ-9/hero-core-still-deep-links-to-renamed-sales-summary-report-path",
      stateName: "In Progress",
    }),
  });

  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
