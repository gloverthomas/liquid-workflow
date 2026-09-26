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

const linearKeyMatch = existsSync(envPath)
  ? readFileSync(envPath, "utf8").match(/^LINEAR_API_KEY=(.*)$/m)
  : null;
const linearKey = linearKeyMatch?.[1]?.trim() ?? "";

if (linearKey) {
  try {
    const tmp = resolve(root, ".tmp-linear-webhook-update.py");
    writeFileSync(
      tmp,
      `
import json, urllib.request
KEY = ${JSON.stringify(linearKey)}
URL = ${JSON.stringify(linearUrl)}

def gql(query, variables=None):
    body = {"query": query}
    if variables is not None:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=json.dumps(body).encode(),
        headers={"Authorization": KEY, "Content-Type": "application/json"},
        method="POST",
    )
    return json.load(urllib.request.urlopen(req, timeout=30))

nodes = gql("{ webhooks { nodes { id url } } }")["data"]["webhooks"]["nodes"]
if not nodes:
    print("No Linear webhooks found — create one pointing at", URL)
else:
    for n in nodes:
        out = gql(
            "mutation($id:String!,$input:WebhookUpdateInput!){ webhookUpdate(id:$id,input:$input){ success webhook{ id url enabled } } }",
            {"id": n["id"], "input": {"url": URL, "enabled": True}},
        )
        print(json.dumps(out))
`,
    );
    console.log(execSync(`python3 "${tmp}"`, { encoding: "utf8" }));
    console.log(`patched Linear webhook(s) → ${linearUrl}`);
  } catch (error) {
    console.warn("Linear webhook update skipped:", error instanceof Error ? error.message : error);
  }
} else {
  console.warn("LINEAR_API_KEY missing — skip Linear webhook URL update. Target:", linearUrl);
}

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
