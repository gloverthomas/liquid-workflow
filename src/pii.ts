/** Scrub secrets / PII from outbound briefs and access logs. */

const PATTERNS: Array<{ id: string; re: RegExp; replace: string }> = [
  { id: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replace: "[email]" },
  { id: "github_pat", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, replace: "[github_token]" },
  { id: "linear_api", re: /\blin_api_[A-Za-z0-9]+\b/g, replace: "[linear_key]" },
  { id: "linear_wh", re: /\blin_wh_[A-Za-z0-9]+\b/g, replace: "[linear_webhook_secret]" },
  { id: "cursor_key", re: /\bcrsr_[A-Za-z0-9]+\b/g, replace: "[cursor_key]" },
  { id: "slack_hook", re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9+/]+/g, replace: "[slack_webhook]" },
  { id: "bearer", re: /\bBearer\s+[A-Za-z0-9._\-]+\b/gi, replace: "Bearer [redacted]" },
  { id: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[aws_key]" },
  {
    id: "jwt",
    re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replace: "[jwt]",
  },
];

export function scrubPii(input: string | undefined | null): string {
  if (!input) return "";
  let out = input;
  for (const p of PATTERNS) {
    out = out.replace(p.re, p.replace);
  }
  return out;
}
