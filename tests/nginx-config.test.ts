import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installScript = readFileSync("deploy/vps-install.sh", "utf8");
const siteConfig = installScript.match(
  /cat >\/etc\/nginx\/sites-available\/ai-price <<'EOF'\n([\s\S]*?)\nEOF/,
)?.[1];

describe("production Nginx behavior", () => {
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
      "$upstream_cache_status",
      "$http_cf_ray",
      "$request_id",
    ]) {
      expect(siteConfig).toContain(field);
    }
  });

  it("microcaches only cookie-less canonical public requests", () => {
    const cacheClear =
      "find -P /var/cache/nginx/ai-price-public -mindepth 1 -delete";
    expect(installScript).toContain(cacheClear);
    expect(installScript.indexOf(cacheClear)).toBeGreaterThan(
      installScript.indexOf("systemctl restart ai-price.service"),
    );
    expect(siteConfig).toContain(
      "proxy_cache_path /var/cache/nginx/ai-price-public",
    );
    expect(siteConfig).toContain("proxy_cache ai_price_public;");
    expect(siteConfig).toContain("proxy_cache_valid 200 15m;");
    expect(siteConfig).toContain(
      'proxy_cache_key "$scheme|$host|$request_uri|$http_accept_language";',
    );
    for (const bypass of [
      "$ai_price_skip_cache_method",
      "$ai_price_skip_cache_query",
      "$ai_price_skip_cache_cookie",
      "$ai_price_skip_cache_authorization",
    ]) {
      expect(siteConfig).toContain(bypass);
    }
    expect(siteConfig).toContain("$upstream_http_set_cookie;");
    expect(siteConfig).toContain("add_header X-Cache-Status");
    const publicLocation = siteConfig?.match(
      /location \/ \{\n        proxy_cache ai_price_public;[\s\S]*?\n    \}/,
    )?.[0];
    expect(publicLocation).toContain(
      'add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;',
    );
  });

  it("keeps private routes outside the public cache", () => {
    const privateLocation = siteConfig?.match(
      /location ~ \^\/\(\?:admin\|api\|subscription\)[\s\S]*?\n    }/,
    )?.[0];
    expect(privateLocation).toBeDefined();
    expect(privateLocation).toContain("^/en/subscription");
    expect(privateLocation).not.toContain("proxy_cache ai_price_public");
    expect(privateLocation).toContain(
      'add_header Cache-Control "private, no-store, max-age=0" always;',
    );
  });

  it("preserves shared caching for versioned pricing data and static assets", () => {
    for (const locationPattern of [
      /location \^~ \/pricing-data\/ \{[\s\S]*?\n    }/,
      /location \^~ \/_next\/static\/ \{[\s\S]*?\n    }/,
      /location ~\* \\.\(\?:avif\|css[\s\S]*?\n    }/,
    ]) {
      const location = siteConfig?.match(locationPattern)?.[0];
      expect(location).toBeDefined();
      expect(location).not.toContain("proxy_cache ai_price_public");
      expect(location).not.toContain("proxy_hide_header Cache-Control");
      expect(location).not.toContain("add_header Cache-Control");
    }
  });
});
