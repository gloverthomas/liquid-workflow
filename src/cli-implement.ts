#!/usr/bin/env node
/**
 * Human write-gate helper: after plan review, implement + open PRs.
 *
 *   npm run implement                 # defaults to LIQ-24
 *   npm run implement -- LIQ-24
 *   ISSUE=LIQ-16 npm run implement
 */

const base = process.env.WORKFLOW_URL ?? "http://127.0.0.1:4100";
const argId = (process.argv[2] || process.env.ISSUE || "LIQ-24").toUpperCase();

const catalog = {
  "LIQ-24": {
    id: "eff0aee0-f93d-4ecf-9548-6f1ea5a4ea3f",
    identifier: "LIQ-24",
    title: "[Hero] AI Assistant works in Core but is dead in Reporting",
    url: "https://linear.app/liquid-accounting/issue/LIQ-24",
  },
  "LIQ-17": {
    id: "13058e52-b25d-46fe-a1d8-8587667350ec",
    identifier: "LIQ-17",
    title: "[Hero] Notifications work in Core but are dead in Reporting",
    url: "https://linear.app/liquid-accounting/issue/LIQ-17",
  },
  "LIQ-16": {
    id: "7d93e202-e7ee-4e14-8356-c4c6909d8ae9",
    identifier: "LIQ-16",
    title: "[Hero] Help centre works in Core but is dead in Reporting",
    url: "https://linear.app/liquid-accounting/issue/LIQ-16",
  },
  "LIQ-15": {
    id: "a6199abd-5052-4cce-bfa7-93c73a086094",
    identifier: "LIQ-15",
    title: "[Hero] Create Invoice / Reports deep-link to missing #invoice-performance",
    url: "https://linear.app/liquid-accounting/issue/LIQ-15",
  },
  "LIQ-9": {
    id: "40e7bf03-44bb-4fa0-9226-b3054041a43f",
    identifier: "LIQ-9",
    title: "[Hero] Core still deep-links to renamed Sales summary report path",
    url: "https://linear.app/liquid-accounting/issue/LIQ-9",
  },
};

async function main() {
  const issue = catalog[argId as keyof typeof catalog];
  if (!issue) {
    console.error(`Unknown issue ${argId}. Known: ${Object.keys(catalog).join(", ")}`);
    process.exit(1);
  }

  const response = await fetch(`${base}/implement`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...issue,
      stateName: "In Review",
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
