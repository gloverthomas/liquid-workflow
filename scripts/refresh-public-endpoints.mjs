#!/usr/bin/env node
/**
 * Refresh ephemeral Cloudflare tunnel URL into:
 * - GitHub webhooks (/webhooks/github)
 * - Vercel VITE_WORKFLOW_SIGNAL_URL for Reporting (+ optional Core)
 *
 * Usage:
 *   node scripts/refresh-public-endpoints.mjs https://xxxx.trycloudflare.com
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const tunnel = (process.argv[2] ?? "").replace(/\/$/, "");
if (!tunnel.startsWith("https://")) {
  console.error("Usage: node scripts/refresh-public-endpoints.mjs https://<tunnel>.trycloudflare.com");
  process.exit(1);
}

const signalUrl = `${tunnel}/signal`;
const githubUrl = `${tunnel}/webhooks/github`;
const linearUrl = `${tunnel}/webhooks/linear`;
const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");

function sh(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function upsertEnv(key, value) {
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    text += `\n${line}\n`;
  }
  writeFileSync(envPath, text);
  console.log(`updated .env.local ${key}`);
}

upsertEnv("PUBLIC_TUNNEL_URL", tunnel);

const secretMatch = existsSync(envPath)
  ? readFileSync(envPath, "utf8").match(/^GITHUB_WEBHOOK_SECRET=(.*)$/m)
  : null;
const secret = secretMatch?.[1]?.trim() ?? "";

for (const repo of [
  "gloverthomas/liquid-accounting-reporting",
  "gloverthomas/liquid-accounting-core",
]) {
  const ids = sh(`gh api repos/${repo}/hooks --jq '.[] | select(.config.url|test("webhooks/github")) | .id'`)
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const id of ids) {
    const args = [
      `gh api -X PATCH repos/${repo}/hooks/${id}`,
      `-f 'config[url]=${githubUrl}'`,
      `-f 'config[content_type]=json'`,
      `-f 'config[insecure_ssl]=0'`,
    ];
    if (secret) args.push(`-f 'config[secret]=${secret}'`);
    sh(args.join(" "));
    console.log(`patched ${repo} hook ${id}`);
  }
}

// Vercel Reporting signal URL (build-time)
try {
  sh(`cd ../Accounting-reporting && vercel env rm VITE_WORKFLOW_SIGNAL_URL production --yes || true`);
  sh(`printf '%s' '${signalUrl}' | vercel env add VITE_WORKFLOW_SIGNAL_URL production`);
  console.log("Set Reporting VITE_WORKFLOW_SIGNAL_URL — redeploy Reporting for it to bake in.");
} catch (error) {
  console.warn("Vercel env update skipped:", error instanceof Error ? error.message : error);
}

console.log(
  JSON.stringify(
    {
      tunnel,
      signalUrl,
      githubUrl,
      linearUrl,
      note: "Point Linear webhook at linearUrl. Redeploy Reporting after signal URL change.",
    },
    null,
    2,
  ),
);
