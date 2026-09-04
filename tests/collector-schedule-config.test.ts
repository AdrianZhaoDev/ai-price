import { readFileSync } from "node:fs";
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
      "/usr/bin/flock --exclusive /run/ai-price-collect/collector.lock /usr/local/sbin/ai-price-collect-with-warp.sh";

    expect(manualUnit).toContain("RuntimeDirectory=ai-price-collect");
    expect(manualUnit).toContain("RuntimeDirectoryMode=0750");
    expect(manualUnit).toContain(`ExecStart=${sharedLock}`);
    expect(manualUnit).not.toContain("--trigger=scheduled");
    expect(scheduledUnit).toContain(
      `ExecStart=${sharedLock} --trigger=scheduled`,
    );
    expect(scheduledUnit).toContain("RuntimeDirectory=ai-price-collect");
    expect(timerUnit).toContain("Unit=ai-price-collect-scheduled.service");
    expect(installer).toContain("install -o root -g root -m 0755");
    expect(installer).toContain("COLLECTOR_CONCURRENCY=2");
    expect(installer).toContain(
      "sed -i 's/^COLLECTOR_CONCURRENCY=3$/COLLECTOR_CONCURRENCY=2/'",
    );
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
});
