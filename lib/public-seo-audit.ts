import { load } from "cheerio";

export type PublicSeoAuditFailureKind =
  "timeout" | "network" | "http" | "parse" | "seo";

export type PublicSeoAuditIssue =
  | "missing_title"
  | "missing_description"
  | "canonical_mismatch"
  | "noindex"
  | "missing_json_ld"
  | "duplicate_title"
  | "duplicate_description";

export type PublicSeoAuditEntry = {
  url: string;
  finalUrl?: string;
  status?: number;
  elapsedMs: number;
  state: "ok" | "failed" | "incomplete";
  failureKind?: PublicSeoAuditFailureKind;
  issues: PublicSeoAuditIssue[];
  title?: string;
  description?: string;
  canonical?: string;
};

export type PublicSeoAuditSummary = {
  sitemapUrls: number;
  sitemapDocuments: number;
  ok: number;
  failed: number;
  incomplete: number;
  entries: PublicSeoAuditEntry[];
};

export type PublicSeoAuditOptions = {
  baseUrl: string;
  concurrency?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

type SitemapDocument =
  | { kind: "urlset"; locations: string[] }
  | { kind: "index"; locations: string[] };

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function locations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    decodeXml(match[1]!),
  );
}

export function parseSitemapDocument(xml: string): SitemapDocument {
  const normalized = xml.trim();
  const foundLocations = locations(normalized);
  if (/<sitemapindex\b/i.test(normalized)) {
    return { kind: "index", locations: foundLocations };
  }
  if (/<urlset\b/i.test(normalized)) {
    return { kind: "urlset", locations: foundLocations };
  }
  throw new Error("Sitemap XML is neither a urlset nor a sitemap index.");
}

function canonicalUrl(value: string, base: string): string {
  const url = new URL(value, base);
  url.search = "";
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function reportUrl(value: string): string {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function structuredTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(structuredTypes);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const ownTypes = Array.isArray(type)
    ? type.filter((item): item is string => typeof item === "string")
    : typeof type === "string"
      ? [type]
      : [];
  return [...ownTypes, ...structuredTypes(record["@graph"])];
}

export function inspectPublicSeoHtml(
  html: string,
  requestedUrl: string,
): Omit<
  PublicSeoAuditEntry,
  "elapsedMs" | "state" | "failureKind" | "status" | "finalUrl"
> {
  const $ = load(html);
  const title = $("title").first().text().trim();
  const description = $("meta[name='description' i]")
    .first()
    .attr("content")
    ?.trim();
  const canonical = $("link[rel='canonical' i]").first().attr("href")?.trim();
  const robots = $("meta[name='robots' i]").first().attr("content") ?? "";
  const jsonLdTypes = $("script[type='application/ld+json' i]")
    .toArray()
    .flatMap((element) => {
      try {
        return structuredTypes(JSON.parse($(element).text()));
      } catch {
        return [];
      }
    });
  const issues: PublicSeoAuditIssue[] = [];
  if (!title) issues.push("missing_title");
  if (!description) issues.push("missing_description");
  if (
    !canonical ||
    canonicalUrl(canonical, requestedUrl) !==
      canonicalUrl(requestedUrl, requestedUrl)
  ) {
    issues.push("canonical_mismatch");
  }
  if (/\bnoindex\b/i.test(robots)) issues.push("noindex");
  if (
    !jsonLdTypes.some((type) =>
      ["Dataset", "ItemList", "Article", "WebPage"].includes(type),
    )
  ) {
    issues.push("missing_json_ld");
  }
  return {
    url: reportUrl(requestedUrl),
    issues,
    title,
    description,
    canonical,
  };
}

function classifyFailure(error: unknown): PublicSeoAuditFailureKind {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  return name === "AbortError" || name === "TimeoutError"
    ? "timeout"
    : "network";
}

async function fetchText(
  url: string,
  timeoutMs: number,
  fetcher: typeof fetch,
): Promise<Response> {
  return fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function mapConcurrent<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        await worker(values[index]!);
      }
    }),
  );
}

function addDuplicateIssues(entries: PublicSeoAuditEntry[]): void {
  const byTitle = new Map<string, PublicSeoAuditEntry[]>();
  const byDescription = new Map<string, PublicSeoAuditEntry[]>();
  for (const entry of entries) {
    if (
      entry.state === "incomplete" ||
      ["http", "network", "parse"].includes(entry.failureKind ?? "")
    ) {
      continue;
    }
    if (entry.title)
      byTitle.set(entry.title, [...(byTitle.get(entry.title) ?? []), entry]);
    if (entry.description) {
      byDescription.set(entry.description, [
        ...(byDescription.get(entry.description) ?? []),
        entry,
      ]);
    }
  }
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    for (const entry of group) entry.issues.push("duplicate_title");
  }
  for (const group of byDescription.values()) {
    if (group.length < 2) continue;
    for (const entry of group) entry.issues.push("duplicate_description");
  }
  for (const entry of entries) {
    if (entry.issues.length > 0 && entry.state === "ok") {
      entry.state = "failed";
      entry.failureKind = "seo";
    }
  }
}

export async function auditPublicSeo(
  options: PublicSeoAuditOptions,
): Promise<PublicSeoAuditSummary> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const rootSitemap = new URL("/sitemap.xml", options.baseUrl).toString();
  const sitemapDocuments = new Set<string>();
  const pendingSitemaps = [rootSitemap];
  const pageUrls = new Set<string>();

  while (pendingSitemaps.length > 0) {
    const sitemapUrl = pendingSitemaps.shift()!;
    if (sitemapDocuments.has(sitemapUrl)) continue;
    sitemapDocuments.add(sitemapUrl);
    let response: Response;
    try {
      response = await fetchText(sitemapUrl, timeoutMs, fetcher);
    } catch (error) {
      throw new Error(
        `Unable to fetch sitemap ${sitemapUrl}: ${classifyFailure(error)}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Unable to fetch sitemap ${sitemapUrl}: HTTP ${response.status}`,
      );
    }
    let sitemap: SitemapDocument;
    try {
      sitemap = parseSitemapDocument(await response.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to parse sitemap ${sitemapUrl}: ${message}`);
    }
    for (const location of sitemap.locations) {
      const url = new URL(location, sitemapUrl).toString();
      if (sitemap.kind === "index") pendingSitemaps.push(url);
      else pageUrls.add(url);
    }
  }

  const entries: PublicSeoAuditEntry[] = [];
  await mapConcurrent([...pageUrls].sort(), concurrency, async (url) => {
    const startedAt = performance.now();
    try {
      const response = await fetchText(url, timeoutMs, fetcher);
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!response.ok) {
        entries.push({
          url: reportUrl(url),
          finalUrl: reportUrl(response.url || url),
          status: response.status,
          elapsedMs,
          state: "failed",
          failureKind: "http",
          issues: [],
        });
        return;
      }
      let inspected: ReturnType<typeof inspectPublicSeoHtml>;
      try {
        inspected = inspectPublicSeoHtml(await response.text(), url);
      } catch {
        entries.push({
          url: reportUrl(url),
          finalUrl: reportUrl(response.url || url),
          status: response.status,
          elapsedMs,
          state: "failed",
          failureKind: "parse",
          issues: [],
        });
        return;
      }
      entries.push({
        ...inspected,
        finalUrl: reportUrl(response.url || url),
        status: response.status,
        elapsedMs,
        state: inspected.issues.length > 0 ? "failed" : "ok",
        failureKind: inspected.issues.length > 0 ? "seo" : undefined,
      });
    } catch (error) {
      const failureKind = classifyFailure(error);
      entries.push({
        url: reportUrl(url),
        elapsedMs: Math.round(performance.now() - startedAt),
        state: failureKind === "timeout" ? "incomplete" : "failed",
        failureKind,
        issues: [],
      });
    }
  });

  addDuplicateIssues(entries);
  const orderedEntries = entries.sort((left, right) =>
    left.url.localeCompare(right.url),
  );
  return {
    sitemapUrls: pageUrls.size,
    sitemapDocuments: sitemapDocuments.size,
    ok: orderedEntries.filter((entry) => entry.state === "ok").length,
    failed: orderedEntries.filter((entry) => entry.state === "failed").length,
    incomplete: orderedEntries.filter((entry) => entry.state === "incomplete")
      .length,
    entries: orderedEntries,
  };
}

export function renderPublicSeoAuditMarkdown(
  summary: PublicSeoAuditSummary,
): string {
  const failures = summary.entries.filter((entry) => entry.state !== "ok");
  const rows = failures.length
    ? failures
        .map(
          (entry) =>
            `| ${entry.url} | ${entry.state} | ${entry.failureKind ?? "—"} | ${entry.status ?? "—"} | ${entry.issues.join(", ") || "—"} | ${entry.elapsedMs} |`,
        )
        .join("\n")
    : "| 无 | — | — | — | — | — |";
  return `# Public SEO audit\n\n| Sitemap URLs | Sitemap documents | OK | Failed | Incomplete |\n| ---: | ---: | ---: | ---: | ---: |\n| ${summary.sitemapUrls} | ${summary.sitemapDocuments} | ${summary.ok} | ${summary.failed} | ${summary.incomplete} |\n\n超时表示尚未完成，不等同于 HTTP 或 SEO 失败。\n\n| URL | 状态 | 分类 | HTTP | 问题 | 耗时 ms |\n| --- | --- | --- | ---: | --- | ---: |\n${rows}\n`;
}
