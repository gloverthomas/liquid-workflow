#!/usr/bin/env bash
# Install dual cloudflared LaunchAgents for named tunnel liquid-workflow (HA + auto-restart).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env.local"
CONF_DIR="${HOME}/Library/Application Support/liquid-workflow"
TOKEN_FILE="${CONF_DIR}/tunnel.token"
LOG_DIR="${CONF_DIR}/logs"
LAUNCH_DIR="${HOME}/Library/LaunchAgents"
CLOUDFLARED="$(command -v cloudflared || true)"
CLOUDFLARED="${CLOUDFLARED:-/opt/homebrew/bin/cloudflared}"

if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "cloudflared not found. brew install cloudflare/cloudflare/cloudflared" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE (need CLOUDFLARE_TUNNEL_TOKEN=...)" >&2
  exit 1
fi

TOKEN="$(grep '^CLOUDFLARE_TUNNEL_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"
if [[ -z "$TOKEN" ]]; then
  echo "CLOUDFLARE_TUNNEL_TOKEN empty in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$CONF_DIR" "$LOG_DIR" "$LAUNCH_DIR"
umask 077
printf '%s' "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

WRAPPER="${CONF_DIR}/run-cloudflared.sh"
cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
TOKEN="\$(cat "$TOKEN_FILE")"
exec "$CLOUDFLARED" tunnel --no-autoupdate run --token "\$TOKEN"
EOF
chmod 700 "$WRAPPER"

install_agent() {
  local label="$1"
  local plist="${LAUNCH_DIR}/${label}.plist"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${WRAPPER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/${label}.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/${label}.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  launchctl enable "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/${label}" 2>/dev/null || launchctl start "$label" || true
  echo "installed $label"
}

# Stop ad-hoc tunnel processes so LaunchAgents own the connectors
pkill -f 'cloudflared tunnel run --token' 2>/dev/null || true
sleep 1

install_agent "com.liquid.cloudflared.a"
sleep 2
install_agent "com.liquid.cloudflared.b"

echo ""
echo "HA tunnel connectors installed."
echo "  token:  $TOKEN_FILE"
echo "  logs:   $LOG_DIR"
echo "  check:  launchctl print gui/\$(id -u)/com.liquid.cloudflared.a | head"
echo "  curl:   curl -sS https://workflow.liquid-accounting.world/health"
