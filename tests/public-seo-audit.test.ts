import {
  auditPublicSeo,
  inspectPublicSeoHtml,
  parseSitemapDocument,
  renderPublicSeoAuditMarkdown,
} from "@/lib/public-seo-audit";
import { describe, expect, it, vi } from "vitest";

const validPage = (
  canonical: string,
  title = "Unique title",
  description = "Unique description",
) =>
  `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><script type="application/ld+json">{"@type":"Dataset"}</script></head><body></body></html>`;

function response(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

describe("public SEO audit", () => {
  it("parses URL sets and sitemap indexes", () => {
    expect(
      parseSitemapDocument(
        "<urlset><url><loc>https://example.test/a</loc></url></urlset>",
      ),
    ).toEqual({ kind: "urlset", locations: ["https://example.test/a"] });
    expect(
      parseSitemapDocument(
        "<sitemapindex><sitemap><loc>https://example.test/sitemaps/1.xml</loc></sitemap></sitemapindex>",
      ),
    ).toEqual({
      kind: "index",
      locations: ["https://example.test/sitemaps/1.xml"],
    });
    expect(() => parseSitemapDocument("<html></html>")).toThrow("neither");
  });

  it("classifies visible SEO failures without treating the body as data", () => {
    const inspected = inspectPublicSeoHtml(
      '<html><head><title></title><meta name="robots" content="noindex"><link rel="canonical" href="https://example.test/other"></head></html>',
      "https://example.test/model",
    );
    expect(inspected.issues).toEqual([
      "missing_title",
      "missing_description",
      "canonical_mismatch",
      "noindex",
      "missing_json_ld",
    ]);
  });

  it("accepts the structured-data types used by document pages", () => {
    const inspected = inspectPublicSeoHtml(
      `<!doctype html><html><head><title>Methodology</title><meta name="description" content="How the public price references are collected."><link rel="canonical" href="https://example.test/methodology"><script type="application/ld+json">{"@type":"WebPage"}</script></head></html>`,
      "https://example.test/methodology",
    );
    expect(inspected.issues).toEqual([]);
    expect(
      inspectPublicSeoHtml(
        `<!doctype html><html><head><title>API prices</title><meta name="description" content="Model pricing."><link rel="canonical" href="https://example.test/api-pricing"><script type="application/ld+json">{"@type":"WebPage"}</script></head></html>`,
        "https://example.test/api-pricing",
      ).issues,
    ).toContain("missing_json_ld");
  });

  it("redacts canonical query strings and respects X-Robots-Tag", () => {
    const inspected = inspectPublicSeoHtml(
      `<!doctype html><html><head><title>Model</title><meta name="description" content="Model pricing."><link rel="canonical" href="https://example.test/model?token=secret"><script type="application/ld+json">{"@type":"Dataset"}</script></head></html>`,
      "https://example.test/model",
      "noindex",
    );
    expect(inspected.canonical).toBe("https://example.test/model");
    expect(inspected.issues).toContain("noindex");
    expect(inspected.issues).toContain("canonical_mismatch");
  });

  it("rejects off-origin sitemap locations before fetching them", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : response(
            "<urlset><url><loc>http://127.0.0.1:5432/private</loc></url></urlset>",
          ),
    );
    await expect(
      auditPublicSeo({ baseUrl: "https://example.test", fetcher }),
    ).rejects.toThrow("outside the audited origin");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not follow redirects outside the audited origin", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/robots.txt")
        ? response("User-agent: *\nAllow: /")
        : new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1:5432/private" },
          }),
    );
    await expect(
      auditPublicSeo({ baseUrl: "https://example.test", fetcher }),
    ).rejects.toThrow("outside the audited origin");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports robots regressions and sitemap count collapse as site issues", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return response("User-agent: *\nUser-agent: Googlebot\nDisallow: /api");
      }
      if (url.endsWith("/sitemap.xml")) {
        return response(
          "<urlset><url><loc>https://example.test/api-pricing</loc></url></urlset>",
        );
      }
      return response(validPage(url));
    });

    const summary = await auditPublicSeo({
      baseUrl: "https://example.test",
      fetcher,
      minimumUrls: 2,
    });

    expect(summary.siteIssues).toEqual([
      "robots_api_pricing_blocked",
      "sitemap_count_collapse",
    ]);
    expect(summary.failed).toBe(2);
  });

  it("redacts nested sitemap URLs from HTTP and parse failures", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return response("User-agent: *");
      if (url.endsWith("/sitemap.xml")) {
        return response(
          "<sitemapindex><sitemap><loc>https://example.test/sitemaps/1.xml?token=secret</loc></sitemap></sitemapindex>",
        );
      }
      return response("unexpected", 500);
    });
    await expect(
      auditPublicSeo({
        baseUrl: "https://example.test",
        fetcher,
        minimumUrls: 0,
      }),
    ).rejects.not.toThrow("token=secret");

    const parseFetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return response("User-agent: *");
      if (url.endsWith("/sitemap.xml")) {
        return response(
          "<sitemapindex><sitemap><loc>https://example.test/sitemaps/2.xml?token=secret</loc></sitemap></sitemapindex>",
        );
      }
      return response("not sitemap XML");
    });
    await expect(
      auditPublicSeo({
        baseUrl: "https://example.test",
        fetcher: parseFetcher,
        minimumUrls: 0,
      }),
    ).rejects.not.toThrow("token=secret");
  });

  it("audits a paginated sitemap, deduplicates URLs, and detects duplicate metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/sitemap.xml")) {
        return response(
          "<sitemapindex><sitemap><loc>https://example.test/sitemaps/1.xml</loc></sitemap></sitemapindex>",
        );
      }
      if (url.endsWith("/sitemaps/1.xml")) {
        return response(
          "<urlset><url><loc>https://example.test/model</loc></url><url><loc>https://example.test/second</loc></url><url><loc>https://example.test/model</loc></url></urlset>",
        );
      }
      const html = validPage(url, "Shared", "Shared description");
      return response(
        url.endsWith("/second")
          ? html.replace(
              "</head>",
              '<meta name="robots" content="noindex"></head>',
            )
          : html,
      );
    });

    const summary = await auditPublicSeo({
      baseUrl: "https://example.test",
      fetcher,
      concurrency: 1,
      minimumUrls: 0,
    });

    expect(summary.sitemapUrls).toBe(2);
    expect(summary.sitemapDocuments).toBe(2);
    expect(summary.failed).toBe(2);
    expect(
      summary.entries.every((entry) =>
        entry.issues.includes("duplicate_title"),
      ),
    ).toBe(true);
    expect(
      summary.entries.find((entry) => entry.url.endsWith("/second"))?.issues,
    ).toContain("noindex");
    expect(renderPublicSeoAuditMarkdown(summary)).toContain(
      "duplicate_description",
    );
  });

  it("keeps timeouts incomplete and classifies HTTP failures separately", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/sitemap.xml")) {
        return response(
          "<urlset><url><loc>https://example.test/timeout</loc></url><url><loc>https://example.test/missing</loc></url><url><loc>https://example.test/query?token=secret</loc></url></urlset>",
        );
      }
      if (url.endsWith("/timeout"))
        throw new DOMException("Timed out", "TimeoutError");
      if (url.endsWith("/missing")) return response("not found", 404);
      return response(validPage(url));
    });

    const summary = await auditPublicSeo({
      baseUrl: "https://example.test",
      fetcher,
      minimumUrls: 0,
    });

    expect(summary.incomplete).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.ok).toBe(1);
    expect(summary.entries.map((entry) => entry.url).join("\n")).not.toContain(
      "?token=secret",
    );
    expect(summary.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://example.test/timeout",
          state: "incomplete",
          failureKind: "timeout",
        }),
        expect.objectContaining({
          url: "https://example.test/missing",
          state: "failed",
          failureKind: "http",
          status: 404,
        }),
      ]),
    );
  });
});
