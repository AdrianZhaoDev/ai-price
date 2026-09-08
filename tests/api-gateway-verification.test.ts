import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Exercise the installer's verification-only entry without touching host config.
const harness = String.raw`
test() {
  if [[ "$PROBE_CASE" == missing && "$1" == -r ]]; then return 1; fi
  return 0
}
nginx() {
  if [[ "$PROBE_CASE" == conflict ]]; then
    echo 'conflicting server name "ai.lowpriceradar.com"'
  fi
}
mktemp() { command mktemp "$PROBE_ROOT/probe.XXXXXXXX"; }
curl() {
  if [[ "$*" == *'/api/status'* ]]; then
    case "$PROBE_CASE" in
      html) echo '<html>Pricing site</html>' ;;
      redirect) echo '' ;;
      *) echo '{"success":true,"data":{"version":"test"}}' ;;
    esac
  elif [[ "$PROBE_CASE" == bad-acme ]]; then
    echo 'wrong webroot'
  else
    cat "$challenge_file"
  fi
}
source deploy/vps-install.sh --verify-api-gateway
`;

describe("API gateway release verification", () => {
  it.each(["healthy", "missing", "conflict", "bad-acme", "html", "redirect"])(
    "validates %s responses and cleans up its ACME probe",
    (probeCase) => {
      const root = mkdtempSync(join(tmpdir(), "api-gateway-verification-"));
      try {
        const result = spawnSync("bash", ["-c", harness], {
          encoding: "utf8",
          env: { ...process.env, PROBE_ROOT: root, PROBE_CASE: probeCase },
          timeout: 10_000,
        });
        expect(result.error).toBeUndefined();
        expect(result.status === 0).toBe(probeCase === "healthy");
        if (probeCase === "healthy") {
          expect(result.stdout).toContain("api-gateway-origin=ok");
          expect(result.stdout).toContain("api-gateway-public=ok");
        }
        expect(readdirSync(root)).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
