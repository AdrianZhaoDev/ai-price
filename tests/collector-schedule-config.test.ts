import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("deploy/vps-install.sh", "utf8");

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
      "/usr/bin/flock --exclusive /run/ai-price-collect.lock /usr/bin/npm run collect";

    expect(manualUnit).toContain(`ExecStart=${sharedLock}`);
    expect(manualUnit).not.toContain("--trigger=scheduled");
    expect(scheduledUnit).toContain(
      `ExecStart=${sharedLock} -- --trigger=scheduled`,
    );
    expect(timerUnit).toContain("Unit=ai-price-collect-scheduled.service");
  });
});
