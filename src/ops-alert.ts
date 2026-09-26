import { config } from "./config.js";
import { log } from "./ops.js";

type OpsAlert = {
  title: string;
  event: string;
  severity?: "warning" | "error";
  fields?: Record<string, string | number | boolean | undefined | null>;
};

/** Slack ops alert for failures / kill-switch / gate blocks (uses brief webhook). */
export async function alertOps(alert: OpsAlert): Promise<string> {
  const severity = alert.severity ?? "error";
  log(severity === "error" ? "error" : "warn", alert.event, {
    title: alert.title,
    ...alert.fields,
  });

  if (!config.slackWebhookUrl) return "skipped";

  const lines = Object.entries(alert.fields ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `• *${k}:* \`${String(v)}\``);

  const mention = config.slackMentionUserId ? `<@${config.slackMentionUserId}> ` : "";
  const payload = {
    text: `${mention}${severity === "error" ? "🚨" : "⚠️"} ${alert.title}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${severity === "error" ? "🚨" : "⚠️"} ${alert.title}`.slice(0, 150), emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [`*event:* \`${alert.event}\``, ...lines].join("\n") || "_no details_",
        },
      },
    ],
  };

  try {
    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok ? "posted" : `failed:${response.status}`;
  } catch (error) {
    log("error", "ops_alert_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return "failed:exception";
  }
}
