// @vitest-environment node
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
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
  local requested_url
  for requested_url in "$@"; do :; done
  if [[ "$*" == *'/api/status'* ]]; then
    case "$PROBE_CASE" in
      html) echo '<html>Pricing site</html>' ;;
      redirect) echo '' ;;
      *) echo '{"success":true,"data":{"version":"test"}}' ;;
    esac
  elif [[ "$requested_url" == 'https://ai.lowpriceradar.com/' ]]; then
    if [[ "$PROBE_CASE" == bad-ui ]]; then echo 404; else echo 200; fi
  elif [[ "$requested_url" == 'http://ai.lowpriceradar.com/' ]]; then
    if [[ "$PROBE_CASE" == bad-redirect ]]; then
      echo '301 https://lowpriceradar.com/'
    else
      echo '308 https://ai.lowpriceradar.com/'
    fi
  elif [[ "$PROBE_CASE" == bad-acme ]]; then
    echo 'wrong webroot'
  else
    cat "$challenge_file"
  fi
}
source deploy/vps-install.sh --verify-api-gateway
`;

describe("API gateway release verification", () => {
  it.each([
    "healthy",
    "missing",
    "conflict",
    "bad-acme",
    "html",
    "redirect",
    "bad-ui",
    "bad-redirect",
  ])(
    "validates %s responses and cleans up its ACME probe",
    (probeCase) => {
      const root = mkdtempSync(join(tmpdir(), "api-gateway-verification-"));
      try {
        const result = spawnSync("bash", ["-c", harness], {
          encoding: "utf8",
          env: { ...process.env, PROBE_ROOT: root, PROBE_CASE: probeCase },
          timeout: 30_000,
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
    45_000,
  );
});

describe("API domain migration", () => {
  it.each(["healthy", "bad-ui"])(
    "preserves or restores the main vhost for %s",
    (probeCase) => {
      const root = mkdtempSync(join(tmpdir(), "api-domain-migration-"));
      try {
        mkdirSync(join(root, "nginx/sites-available"), { recursive: true });
        const site = join(root, "nginx/sites-available/ai-price");
        const before =
          "# preserve custom settings\nserver_name lowpriceradar.com www.lowpriceradar.com ai.lowpriceradar.com;\nserver_name www.lowpriceradar.com ai.lowpriceradar.com;\n";
        writeFileSync(site, before);
        const installer = join(root, "installer.sh");
        writeFileSync(
          installer,
          readFileSync("deploy/vps-install.sh", "utf8")
            .replaceAll("/etc/nginx/", `${root}/nginx/`)
            .replaceAll("/opt/ai-price", `${root}/app`)
            .replaceAll("/var/backups/ai-price", `${root}/backups`),
        );
        const mocks = harness.slice(0, harness.indexOf("source deploy/"));
        const script =
          mocks +
          '\nsystemctl() { echo "$*" >> "$PROBE_ROOT/reloads"; }\nexport -f test nginx mktemp curl systemctl\nbash "$1" --migrate-api-domain\n';
        const result = spawnSync(
          "bash",
          ["-c", script, "migration-test", installer],
          {
            encoding: "utf8",
            env: { ...process.env, PROBE_ROOT: root, PROBE_CASE: probeCase },
            timeout: 30_000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status === 0).toBe(probeCase === "healthy");
        expect(readFileSync(site, "utf8")).toBe(
          probeCase === "healthy"
            ? before.replaceAll(" ai.lowpriceradar.com", "")
            : before,
        );
        expect(
          readFileSync(join(root, "reloads"), "utf8").trim().split("\n"),
        ).toHaveLength(probeCase === "healthy" ? 1 : 2);
        const backups = readdirSync(root).filter((name) =>
          name.startsWith("probe."),
        );
        expect(backups).toHaveLength(1);
        expect(readFileSync(join(root, backups[0]), "utf8")).toBe(before);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    45_000,
  );
});
