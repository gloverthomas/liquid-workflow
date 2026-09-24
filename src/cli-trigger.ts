#!/usr/bin/env node
/**
 * Demo helper: fire the same path as a Linear "In Progress" move without a public webhook.
 *
 *   npm run trigger
 *   npm run trigger -- --liq9
 */

const useLiq9 = process.argv.includes("--liq9");
const base = process.env.WORKFLOW_URL ?? "http://127.0.0.1:4100";

const issue = useLiq9
  ? {
      id: "40e7bf03-44bb-4fa0-9226-b3054041a43f",
      identifier: "LIQ-9",
      title: "[Hero] Core still deep-links to renamed Sales summary report path",
      url: "https://linear.app/liquid-accounting/issue/LIQ-9/hero-core-still-deep-links-to-renamed-sales-summary-report-path",
      stateName: "In Progress",
    }
  : {
      id: "a6199abd-5052-4cce-bfa7-93c73a086094",
      identifier: "LIQ-15",
      title: "[Hero] Create Invoice / Reports deep-link to missing #invoice-performance",
      url: "https://linear.app/liquid-accounting/issue/LIQ-15/hero-create-invoice-reports-deep-link-to-missing-invoice-performance",
      stateName: "In Progress",
    };

async function main() {
  console.log(`Triggering planner for ${issue.identifier}…`);
  const response = await fetch(`${base}/trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(issue),
  });

  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
