import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const installer = readFileSync("deploy/vps-install.sh", "utf8");
const deployScript = readFileSync("deploy/vps-update.ps1", "utf8");

describe("VPS collector schedule", () => {
  it("keeps manual and scheduled systemd invocations separate", () => {
    const manualUnit = installer.match(
      /cat >\/etc\/systemd\/system\/ai-price-collect\.service <<'EOF'([\s\S]*?)\nEOF/,
    )?.[1];
    const scheduledUnit = installer.match(
      /cat >\/etc\/systemd\/system\/ai-price-collect-scheduled\.service <<'EOF'([\s\S]*?)\nEOF/,
    )?.[1];
    const timerUnit = installer.match(
      /cat >\/etc\/systemd\/system\/ai-price-collect\.timer <<'EOF'([\s\S]*?)\nEOF/,
    )?.[1];

    const sharedLock =
      "/usr/bin/flock --exclusive /run/ai-price-collect/collector.lock /usr/bin/npm run collect";

    expect(manualUnit).toContain("RuntimeDirectory=ai-price-collect");
    expect(manualUnit).toContain("RuntimeDirectoryMode=0750");
    expect(manualUnit).toContain(`ExecStart=${sharedLock}`);
    expect(manualUnit).not.toContain("--trigger=scheduled");
    expect(scheduledUnit).toContain(
      `ExecStart=${sharedLock} -- --trigger=scheduled`,
    );
    expect(scheduledUnit).toContain("RuntimeDirectory=ai-price-collect");
    expect(timerUnit).toContain("Unit=ai-price-collect-scheduled.service");
  });

  it("stops deployment when catalog collection or warming fails", () => {
    expect(deployScript).toContain(
      "/usr/bin/flock --exclusive /run/ai-price-collect/collector.lock bash -e -c '",
    );
    expect(
      deployScript.indexOf("npm run collect -- --source=models-dev"),
    ).toBeLessThan(deployScript.indexOf("npm run warm:models"));
    expect(deployScript).toContain('[[ "`$cache_status" == "HIT" ]]');
    expect(deployScript).toContain('tolower(`$1) == "x-cache-status:"');
  });

  it("warms visitor language variants before verifying each cache entry", () => {
    const output = runDirectoryWarmCheck();
    for (const path of ["/channels", "/api-transit", "/price-changes"]) {
      for (const language of ["", "zh-CN", "zh-CN,zh;q=0.9"]) {
        expect(output).toContain(
          `public-page-cache=${path} language=${language} HIT`,
        );
        expect(output).toContain(
          `public-page-cache=/en${path} language=${language} HIT`,
        );
      }
      for (const language of ["en", "en-US,en;q=0.9", "en-GB,en;q=0.9"]) {
        expect(output).toContain(
          `public-page-cache=/en${path} language=${language} HIT`,
        );
        expect(output).not.toContain(
          `public-page-cache=${path} language=${language} HIT`,
        );
      }
    }
  });

  it("fails the deployment when a visitor cache variant is not warm", () => {
    expect(() => runDirectoryWarmCheck(true)).toThrow();
  });
});

function runDirectoryWarmCheck(forceMiss = false): string {
  const start = deployScript.indexOf("for path in /channels ");
  expect(start).toBeGreaterThan(0);
  const shell = deployScript
    .slice(start, deployScript.indexOf('\n"@', start))
    .replace(/`\$/g, "$")
    .replace(/`:/g, ":")
    .replace(/\$PublicDomain/g, "example.test")
    .replace(/\r/g, "");
  const input = `
set -e
declare -A warmed
curl() {
  local arg language="" url="" head=0
  for arg in "$@"; do
    case "$arg" in
      "Accept-Language: "*) language="\${arg#Accept-Language: }" ;;
      https:*) url="$arg" ;;
      -fsSI) head=1 ;;
    esac
  done
  if [[ "$head" == 0 ]]; then
    warmed["$url|$language"]=1
  elif [[ "\${warmed["$url|$language"]:-0}" == 1 && "${forceMiss ? "1" : "0"}" == 0 ]]; then
    printf 'X-Cache-Status: HIT\\r\\n'
  else
    printf 'X-Cache-Status: MISS\\r\\n'
  fi
}
${shell}
`;
  return execFileSync("bash", [], { input, encoding: "utf8" });
}
