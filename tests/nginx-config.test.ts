import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installScript = readFileSync("deploy/vps-install.sh", "utf8");
const siteConfig = installScript.match(
  /cat >\/etc\/nginx\/sites-available\/ai-price <<'EOF'\n([\s\S]*?)\nEOF/,
)?.[1];

describe("production Nginx observability", () => {
  it("writes escaped JSON logs without request query strings", () => {
    expect(siteConfig).toBeDefined();
    expect(siteConfig).toContain("log_format ai_price escape=json");
    expect(siteConfig).toContain('\"uri\":\"$uri\"');
    expect(siteConfig).toContain(
      "~^(?<ai_price_referer_without_query>[^?]*) $ai_price_referer_without_query;",
    );

    const logFormat = siteConfig?.match(
      /log_format ai_price escape=json([\s\S]*?);/,
    )?.[1];
    expect(logFormat).toContain("$request_method");
    expect(logFormat).not.toMatch(/\$request(?!_)/);
    expect(logFormat).not.toContain("$request_uri");
  });

  it("records timing and correlation fields for every server", () => {
    expect(
      siteConfig?.match(/access_log \/var\/log\/nginx\/access\.log ai_price;/g),
    ).toHaveLength(5);
    for (const field of [
      "$request_time",
      "$upstream_response_time",
      "$upstream_status",
      "$http_cf_ray",
      "$request_id",
    ]) {
      expect(siteConfig).toContain(field);
    }
  });
});
