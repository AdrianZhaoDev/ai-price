#!/usr/bin/env bash
set -Eeuo pipefail

# WARP is used only by the collector. Set COLLECTOR_WARP_ON_DEMAND=false to
# retain the previous always-on behavior when another workload needs WARP.
if [[ "${COLLECTOR_WARP_ON_DEMAND:-true}" != "true" ||
  "${COLLECTOR_PROXY_URL:-}" != "http://127.0.0.1:40000" ]]; then
  exec HOME=/var/lib/ai-price runuser --preserve-environment --user ai-price -- /usr/bin/npm run collect -- "$@"
fi

started_here=0
if ! systemctl is-active --quiet warp-svc.service; then
  systemctl start warp-svc.service
  started_here=1
fi

cleanup() {
  if (( started_here == 1 )); then
    systemctl stop warp-svc.service || true
  fi
}
trap cleanup EXIT

for attempt in {1..30}; do
  if (echo >/dev/tcp/127.0.0.1/40000) >/dev/null 2>&1; then
    break
  fi
  if (( attempt == 30 )); then
    echo "WARP proxy did not become ready; collector will use its configured fallback." >&2
    break
  fi
  sleep 1
done

exec HOME=/var/lib/ai-price runuser --preserve-environment --user ai-price -- /usr/bin/npm run collect -- "$@"
