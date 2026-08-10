import {
  loadSitemapEntries,
  renderSitemapXml,
  sitemapPageCount,
  SITEMAP_PAGE_SIZE,
} from "@/lib/catalog-sitemap";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> },
) {
  const page = Number((await params).page.replace(/\.xml$/, ""));
  const entries = await loadSitemapEntries();
  const pageCount = sitemapPageCount(entries.length);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > pageCount ||
    entries.length <= SITEMAP_PAGE_SIZE
  ) {
    return new Response("Not found", { status: 404 });
  }
  const start = (page - 1) * SITEMAP_PAGE_SIZE;
  return new Response(
    renderSitemapXml(entries.slice(start, start + SITEMAP_PAGE_SIZE)),
    {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    },
  );
}
