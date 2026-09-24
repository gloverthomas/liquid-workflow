#!/usr/bin/env node
/**
 * Demo helper: fire the same path as a Linear "In Progress" move without a public webhook.
 *
 *   DRY_RUN=true npm run trigger
 *   npm run trigger -- --real
 */

const real = process.argv.includes("--real");
const base = process.env.WORKFLOW_URL ?? "http://127.0.0.1:4100";

async function main() {
  if (real) {
    console.log("Triggering live planner (server must have DRY_RUN=false + CURSOR_API_KEY).");
  }

  const response = await fetch(`${base}/trigger`, {
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
