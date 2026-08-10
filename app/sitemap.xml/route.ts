import {
  loadSitemapEntries,
  renderSitemapIndexXml,
  renderSitemapXml,
  sitemapPageCount,
  SITEMAP_PAGE_SIZE,
} from "@/lib/catalog-sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await loadSitemapEntries();
  const pageCount = sitemapPageCount(entries.length);
  const xml =
    entries.length <= SITEMAP_PAGE_SIZE
      ? renderSitemapXml(entries)
      : renderSitemapIndexXml(pageCount, new Date());
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
