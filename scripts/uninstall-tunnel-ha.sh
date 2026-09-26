#!/usr/bin/env bash
# Uninstall dual cloudflared LaunchAgents.
set -euo pipefail
for label in com.liquid.cloudflared.a com.liquid.cloudflared.b; do
  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  rm -f "${HOME}/Library/LaunchAgents/${label}.plist"
  echo "removed $label"
done
