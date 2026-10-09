// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("transit directory retirement migration", () => {
  it("logically unpublishes only CallAI and WAWA without deleting history", () => {
    const migration = readFileSync(
      "drizzle/0018_keep_low_price_radar_api.sql",
      "utf8",
    );

    expect(migration).toContain('SET "published" = false');
    expect(migration).toContain("'sub.callai.one'");
    expect(migration).toContain("'wawazz.xyz'");
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(migration).not.toContain("ai.lowpriceradar.com");
  });
});
